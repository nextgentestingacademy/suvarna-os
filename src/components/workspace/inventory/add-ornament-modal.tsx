'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Gem, AlertCircle, ShieldCheck, Scale, Check } from 'lucide-react';
import {
  SerializedProduct,
  getProductsAction,
  createProductAction,
  registerOrnamentAction,
} from '@/app/actions/inventory';
import { DemoBranch } from '@/data/mock-workspace';
import { Decimal } from 'decimal.js';

interface AddOrnamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeBranchId: string;
  availableBranches: DemoBranch[];
  onSuccess: (msg: string) => void;
}

export function AddOrnamentModal({
  isOpen,
  onClose,
  activeBranchId,
  availableBranches,
  onSuccess,
}: AddOrnamentModalProps) {
  const [catalogueMode, setCatalogueMode] = useState<'existing' | 'new'>('new');
  const [products, setProducts] = useState<SerializedProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Form State
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [category, setCategory] = useState('Necklaces');
  const [metalType, setMetalType] = useState('GOLD');
  const [purity, setPurity] = useState('22K');

  // Physical Piece
  const [tagCode, setTagCode] = useState('');
  const [huid, setHuid] = useState('');
  const [grossWeight, setGrossWeight] = useState('');
  const [stoneWeight, setStoneWeight] = useState('0.000');
  const [netWeight, setNetWeight] = useState('');
  const [makingChargeType, setMakingChargeType] = useState<'PER_GRAM' | 'PERCENTAGE' | 'FLAT'>('PER_GRAM');
  const [makingChargeValue, setMakingChargeValue] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [targetBranchId, setTargetBranchId] = useState(activeBranchId);
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load products on mount
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingProducts(true);

    getProductsAction()
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setProducts(res.data);
          if (res.data.length > 0) {
            setSelectedProductId(res.data[0].id);
            setCatalogueMode('existing');
          } else {
            setCatalogueMode('new');
          }
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingProducts(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Synchronize target branch if activeBranchId changes
  useEffect(() => {
    if (activeBranchId) {
      setTargetBranchId(activeBranchId);
    }
  }, [activeBranchId]);

  // Automatic Net Weight Calculation: gross - stone
  const handleGrossChange = (val: string) => {
    setGrossWeight(val);
    try {
      const g = new Decimal(val || '0');
      const s = new Decimal(stoneWeight || '0');
      if (s.gte(0) && g.gte(s)) {
        setNetWeight(g.minus(s).toFixed(3));
      } else {
        setNetWeight(g.toFixed(3));
      }
    } catch {
      // ignore parse errors while typing
    }
  };

  const handleStoneChange = (val: string) => {
    setStoneWeight(val);
    try {
      const g = new Decimal(grossWeight || '0');
      const s = new Decimal(val || '0');
      if (s.gte(0) && g.gte(s)) {
        setNetWeight(g.minus(s).toFixed(3));
      } else {
        setNetWeight(g.toFixed(3));
      }
    } catch {
      // ignore parse errors while typing
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Basic Validations
    if (!tagCode.trim()) {
      setErrorMessage('A unique Tag Code is required for every jewellery piece.');
      return;
    }

    if (!targetBranchId) {
      setErrorMessage('Please select a destination showroom branch.');
      return;
    }

    // Weight checks
    if (!grossWeight || isNaN(Number(grossWeight))) {
      setErrorMessage('Please enter a valid numeric gross weight.');
      return;
    }

    try {
      const g = new Decimal(grossWeight);
      if (g.lte(0)) {
        setErrorMessage('Gross weight must be strictly greater than zero.');
        return;
      }

      const s = new Decimal(stoneWeight || '0');
      if (s.lt(0)) {
        setErrorMessage('Stone weight cannot be negative.');
        return;
      }
      if (g.lt(s)) {
        setErrorMessage('Gross weight cannot be less than stone weight.');
        return;
      }

      const n = new Decimal(netWeight || g.minus(s).toFixed(3));
      if (!g.minus(s).equals(n)) {
        setErrorMessage(`Net weight (${n.toFixed(3)}g) must equal gross (${g.toFixed(3)}g) minus stone (${s.toFixed(3)}g).`);
        return;
      }
    } catch {
      setErrorMessage('Please enter valid numeric weights (e.g. 22.500).');
      return;
    }

    setIsSubmitting(true);

    try {
      let productId = selectedProductId;

      // Create new catalogue product if selected
      if (catalogueMode === 'new') {
        if (!newSku.trim() || !newName.trim()) {
          setErrorMessage('Product SKU and Name are required to create a new catalogue design.');
          setIsSubmitting(false);
          return;
        }

        const prodRes = await createProductAction({
          sku: newSku.trim().toUpperCase(),
          name: newName.trim(),
          category,
          metalType,
          purity,
        });

        if (!prodRes.success || !prodRes.data) {
          setErrorMessage(prodRes.error || 'Failed to create product catalogue entry.');
          setIsSubmitting(false);
          return;
        }

        productId = prodRes.data.id;
      }

      // Register the physical ornament
      const ornRes = await registerOrnamentAction({
        branchId: targetBranchId,
        productId,
        tagCode: tagCode.trim().toUpperCase(),
        huid: huid.trim() ? huid.trim().toUpperCase() : undefined,
        grossWeight: new Decimal(grossWeight).toFixed(3),
        stoneWeight: new Decimal(stoneWeight || '0').toFixed(3),
        netWeight: new Decimal(netWeight).toFixed(3),
        makingChargeType,
        makingChargeValue: makingChargeValue.trim() ? makingChargeValue.trim() : undefined,
        costAmount: costAmount.trim() ? costAmount.trim() : undefined,
        priceAmount: priceAmount.trim() ? priceAmount.trim() : undefined,
        reason: notes.trim() ? notes.trim() : undefined,
      });

      if (ornRes.success && ornRes.data) {
        onSuccess(`Jewellery piece "${ornRes.data.ornament.tagCode}" registered and inwarded to showroom stock!`);
        onClose();
      } else {
        setErrorMessage(ornRes.error || 'Failed to register jewellery ornament.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div role="dialog" aria-modal="true" aria-labelledby="add-ornament-title" className="bg-white border border-[#eee2dc] rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#eee2dc]">
          <div>
            <span className="text-[10px] font-bold text-[#d49a24] uppercase tracking-wider block">
              Persistent Showroom Inventory
            </span>
            <h2 id="add-ornament-title" className="text-xl font-serif font-bold text-[#542047]">
              Register New Jewellery Piece
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#68647a] hover:bg-[#fff0dc] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 p-3 bg-[#fee2e2] border border-[#fca5a5] rounded-xl text-xs text-[#b91c1c] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Section 1: Product Design Definition */}
          <div className="p-3.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-serif font-bold text-[#542047]">
                1. Catalogue Design Definition
              </span>
              <div className="flex bg-[#f4ebe1] p-0.5 rounded-lg text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setCatalogueMode('existing')}
                  disabled={products.length === 0}
                  className={`px-2.5 py-1 rounded-md transition ${
                    catalogueMode === 'existing'
                      ? 'bg-white text-[#542047] shadow-xs'
                      : 'text-[#68647a] hover:text-[#25203a] disabled:opacity-40'
                  }`}
                >
                  Existing Design ({products.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogueMode('new')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    catalogueMode === 'new'
                      ? 'bg-white text-[#542047] shadow-xs'
                      : 'text-[#68647a] hover:text-[#25203a]'
                  }`}
                >
                  + New Design
                </button>
              </div>
            </div>

            {catalogueMode === 'existing' ? (
              <div>
                <label className="text-xs font-semibold text-[#25203a] block mb-1">
                  Select Catalogue Product *
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.sku}] {p.name} ({p.purity} {p.metalType} · {p.category})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#25203a] block mb-1">
                      Design SKU *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. BR-NK-2026"
                      value={newSku}
                      onChange={(e) => setNewSku(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#25203a] block mb-1">
                      Design Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Temple Gold Choker"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#25203a] block mb-1">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                    >
                      <option value="Necklaces">Necklaces</option>
                      <option value="Bangles">Bangles</option>
                      <option value="Earrings">Earrings</option>
                      <option value="Rings">Rings</option>
                      <option value="Bridal">Bridal</option>
                      <option value="Chains">Chains</option>
                      <option value="Pendants">Pendants</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#25203a] block mb-1">
                      Metal
                    </label>
                    <select
                      value={metalType}
                      onChange={(e) => setMetalType(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                    >
                      <option value="GOLD">Gold</option>
                      <option value="SILVER">Silver</option>
                      <option value="PLATINUM">Platinum</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#25203a] block mb-1">
                      Purity
                    </label>
                    <select
                      value={purity}
                      onChange={(e) => setPurity(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                    >
                      <option value="22K">22K (916)</option>
                      <option value="18K">18K (750)</option>
                      <option value="24K">24K (999)</option>
                      <option value="14K">14K (585)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Physical Piece Details */}
          <div className="p-3.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl space-y-3">
            <span className="text-xs font-serif font-bold text-[#542047] block">
              2. Individual Physical Piece (Tag & Hallmarking)
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#25203a] block mb-1">
                  Tag Code *
                </label>
                <input
                  type="text"
                  placeholder="e.g. TG-9901"
                  value={tagCode}
                  onChange={(e) => setTagCode(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#25203a] block mb-1">
                  BIS Hallmarking HUID
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. AB12CD (6 chars)"
                  value={huid}
                  onChange={(e) => setHuid(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] font-mono uppercase"
                />
              </div>
            </div>

            {/* Weights: Gross, Stone, Net */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#25203a] block mb-1">
                  Gross Weight (g) *
                </label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="0.000"
                  value={grossWeight}
                  onChange={(e) => handleGrossChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#25203a] block mb-1">
                  Stone Weight (g)
                </label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="0.000"
                  value={stoneWeight}
                  onChange={(e) => handleStoneChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#542047] block mb-1">
                  Net Metal (g) *
                </label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="0.000"
                  value={netWeight}
                  onChange={(e) => setNetWeight(e.target.value)}
                  className="w-full px-3 py-2 bg-[#fdf8f0] border border-[#f1d394] text-[#542047] font-bold rounded-xl text-xs focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* Pricing & Making Charges */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#25203a] block mb-1">
                  Making Charge Type
                </label>
                <select
                  value={makingChargeType}
                  onChange={(e) => setMakingChargeType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                >
                  <option value="PER_GRAM">₹ Per Gram</option>
                  <option value="PERCENTAGE">% Percentage</option>
                  <option value="FLAT">₹ Flat Charge</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#25203a] block mb-1">
                  Making Charge Value
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 450"
                  value={makingChargeValue}
                  onChange={(e) => setMakingChargeValue(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#25203a] block mb-1">
                  Wholesale Cost (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 120000"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#25203a] block mb-1">
                  Indicative Retail Price (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 145000"
                  value={priceAmount}
                  onChange={(e) => setPriceAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                />
              </div>
            </div>

            {/* Target Branch */}
            <div>
              <label className="text-xs font-semibold text-[#25203a] block mb-1">
                Receiving Showroom Branch *
              </label>
              <select
                value={targetBranchId}
                onChange={(e) => setTargetBranchId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
              >
                {availableBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.city})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#eee2dc]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-[#eee2dc] rounded-xl text-xs font-semibold text-[#68647a] hover:bg-[#fffaf5] transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-[#542047] hover:bg-[#421b48] text-[#ffe8a8] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm"
            >
              {isSubmitting ? (
                <span>Registering & Inwarding...</span>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Register & Inward to Live Inventory</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
