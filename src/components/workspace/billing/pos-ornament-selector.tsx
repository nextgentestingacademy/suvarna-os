'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Barcode,
  Search,
  Gem,
  Plus,
  Check,
  AlertCircle,
  X,
  Filter,
  Sparkles,
} from 'lucide-react';
import { SerializedOrnament } from '@/app/actions/inventory';

interface PosOrnamentSelectorProps {
  availableOrnaments: SerializedOrnament[];
  cartOrnamentIds: string[];
  onAddOrnament: (ornament: SerializedOrnament) => void;
  activeBranchName: string;
}

export function PosOrnamentSelector({
  availableOrnaments,
  cartOrnamentIds,
  onAddOrnament,
  activeBranchName,
}: PosOrnamentSelectorProps) {
  const [scanQuery, setScanQuery] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  const [isBrowseModalOpen, setIsBrowseModalOpen] = useState(false);
  const [browseSearch, setBrowseSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const scanInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus barcode scanner input on mount
  useEffect(() => {
    scanInputRef.current?.focus();
  }, []);

  const showFeedback = (type: 'success' | 'error' | 'warning', message: string) => {
    setScanFeedback({ type, message });
    setTimeout(() => setScanFeedback(null), 4000);
  };

  // Find unique categories from available ornaments
  const categories = [
    'ALL',
    ...Array.from(
      new Set(
        availableOrnaments
          .map((o) => o.product?.category || 'Jewellery')
          .filter(Boolean)
      )
    ).sort(),
  ];

  // Quick scan / search handler
  const handleScanSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = scanQuery.trim();
    if (!query) return;

    // 1. Search for unique physical ornament match by exact tagCode or HUID
    const physicalMatch = availableOrnaments.find(
      (o) =>
        o.tagCode.toLowerCase() === query.toLowerCase() ||
        (o.huid && o.huid.toLowerCase() === query.toLowerCase())
    );

    if (physicalMatch) {
      if (cartOrnamentIds.includes(physicalMatch.id)) {
        showFeedback(
          'warning',
          `This physical jewellery piece (Tag: ${physicalMatch.tagCode}) is already in the sales bill. Serialized jewellery pieces cannot be billed twice. To add another piece of SKU '${physicalMatch.product?.sku || physicalMatch.tagCode}', select or scan another available tag.`
        );
        setScanQuery('');
        return;
      }

      onAddOrnament(physicalMatch);
      showFeedback(
        'success',
        `Added ${physicalMatch.tagCode} (${physicalMatch.product?.name || 'Jewellery'}) to sales bill.`
      );
      setScanQuery('');
      return;
    }

    // 2. Search by product SKU / model code across available inventory
    const skuMatches = availableOrnaments.filter(
      (o) => o.product?.sku && o.product.sku.toLowerCase() === query.toLowerCase()
    );

    if (skuMatches.length > 0) {
      // Find the next available physical piece of this SKU not yet in the sales bill
      const nextAvailablePiece = skuMatches.find((o) => !cartOrnamentIds.includes(o.id));

      if (nextAvailablePiece) {
        onAddOrnament(nextAvailablePiece);
        showFeedback(
          'success',
          `Added piece ${nextAvailablePiece.tagCode} of SKU ${nextAvailablePiece.product?.sku} to sales bill.`
        );
        setScanQuery('');
        return;
      }

      showFeedback(
        'warning',
        `All available pieces of SKU '${query}' (${skuMatches.length} in this showroom) are already added to this bill.`
      );
      setScanQuery('');
      return;
    }

    showFeedback(
      'error',
      `No available ornament found matching "${query}" in ${activeBranchName}.`
    );
  };

  // Filtered list for Browse Modal
  const filteredOrnaments = availableOrnaments.filter((o) => {
    const matchesCategory =
      selectedCategory === 'ALL' || (o.product?.category || 'Jewellery') === selectedCategory;
    const matchesSearch =
      !browseSearch.trim() ||
      o.tagCode.toLowerCase().includes(browseSearch.toLowerCase()) ||
      (o.product?.name && o.product.name.toLowerCase().includes(browseSearch.toLowerCase())) ||
      (o.product?.sku && o.product.sku.toLowerCase().includes(browseSearch.toLowerCase())) ||
      (o.huid && o.huid.toLowerCase().includes(browseSearch.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-3">
      {/* Barcode Scanner & Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-[#eee2dc] shadow-xs">
        <form onSubmit={handleScanSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#d49a24]">
              <Barcode className="w-5 h-5" />
            </div>
            <input
              ref={scanInputRef}
              type="text"
              value={scanQuery}
              onChange={(e) => setScanQuery(e.target.value)}
              placeholder="Scan Barcode / Tag Code or Enter SKU / HUID (e.g. TAG-4001, NK-22018)..."
              className="w-full pl-10 pr-24 py-2.5 bg-[#fffaf5] border border-[#eee2dc] focus:border-[#d49a24] focus:bg-white rounded-xl text-xs font-mono font-medium text-[#25203a] outline-none transition placeholder:text-stone-400 placeholder:font-sans"
            />
            <div className="absolute inset-y-0 right-1 flex items-center pr-1.5">
              <button
                type="submit"
                disabled={!scanQuery.trim()}
                className="px-3 py-1 bg-[#542047] hover:bg-[#421b48] text-white rounded-lg text-xs font-bold transition disabled:opacity-40 cursor-pointer"
              >
                Add Item
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsBrowseModalOpen(true)}
            className="px-3.5 py-2.5 bg-[#fff0dc] hover:bg-[#ffe8a8] text-[#542047] border border-[#d49a24]/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 cursor-pointer"
          >
            <Search className="w-4 h-4 text-[#d49a24]" />
            <span className="hidden sm:inline">Browse Inventory</span>
            <span className="px-1.5 py-0.2 bg-white text-[#542047] text-[10px] font-bold rounded-md ml-0.5">
              {availableOrnaments.length}
            </span>
          </button>
        </form>

        {/* Feedback alert (if any) */}
        {scanFeedback && (
          <div
            className={`mt-2 p-2 rounded-xl text-xs flex items-center gap-2 transition animate-in fade-in ${
              scanFeedback.type === 'success'
                ? 'bg-[#e2f6e8] text-[#246743] border border-[#b4e6c3]'
                : scanFeedback.type === 'warning'
                ? 'bg-[#fff0dc] text-[#b8861e] border border-[#ffe09e]'
                : 'bg-[#fbe8e8] text-[#b93657] border border-[#f5b8b8]'
            }`}
          >
            {scanFeedback.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{scanFeedback.message}</span>
          </div>
        )}
      </div>

      {/* Browse Showroom Inventory Modal */}
      {isBrowseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#eee2dc] w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#eee2dc] flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif font-bold text-lg text-[#542047]">
                    Select Jewellery from Inventory
                  </h3>
                  <span className="px-2 py-0.5 bg-[#e2f6e8] text-[#246743] text-[10px] font-bold rounded">
                    AVAILABLE IN {activeBranchName.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-[#68647a]">
                  Only verified available stock from this showroom branch can be added to the sales bill.
                </p>
              </div>
              <button
                onClick={() => setIsBrowseModalOpen(false)}
                className="p-2 text-[#68647a] hover:text-[#542047] hover:bg-[#fff0dc] rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter & Search Controls */}
            <div className="p-4 border-b border-[#eee2dc] bg-[#fffaf5] flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-[#68647a]" />
                <input
                  type="text"
                  value={browseSearch}
                  onChange={(e) => setBrowseSearch(e.target.value)}
                  placeholder="Filter by name, SKU, tag code, or HUID..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#eee2dc] focus:border-[#d49a24] rounded-xl text-xs outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <Filter className="w-3.5 h-3.5 text-[#68647a] shrink-0" />
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-[#542047] text-white shadow-xs'
                        : 'bg-white border border-[#eee2dc] text-[#68647a] hover:bg-[#fff0dc]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body: Scrollable Inventory Grid */}
            <div className="p-4 overflow-y-auto flex-1 max-h-[55vh]">
              {filteredOrnaments.length === 0 ? (
                <div className="text-center py-12 text-[#68647a]">
                  <Gem className="w-8 h-8 mx-auto text-[#d49a24]/50 mb-2" />
                  <p className="text-xs font-semibold">No available ornaments found matching filters.</p>
                  <p className="text-[11px] text-stone-400 mt-1">Try adjusting the search query or category.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredOrnaments.map((orn) => {
                    const isAdded = cartOrnamentIds.includes(orn.id);
                    return (
                      <div
                        key={orn.id}
                        className={`p-3 rounded-xl border transition flex flex-col justify-between gap-2.5 ${
                          isAdded
                            ? 'bg-[#fffdfa] border-[#d49a24]/40 ring-1 ring-[#d49a24]/20'
                            : 'bg-white border-[#eee2dc] hover:border-[#d49a24]/50'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-bold text-xs text-[#542047] block">
                                {orn.product?.name || 'Jewellery Ornament'}
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 bg-[#fff0dc] text-[#73501b] rounded">
                                  {orn.tagCode}
                                </span>
                                <span className="text-[10px] text-[#68647a] font-mono">
                                  SKU: {orn.product?.sku || 'N/A'}
                                </span>
                                {orn.huid && (
                                  <span className="text-[10px] text-[#246743] font-mono font-semibold">
                                    HUID: {orn.huid}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="px-2 py-0.5 bg-[#542047] text-[#ffe8a8] text-[10px] font-bold rounded-md">
                              {orn.purity} {orn.metalType}
                            </span>
                          </div>

                          {/* Weight & Price Metrics */}
                          <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[#eee2dc] text-[11px]">
                            <div>
                              <span className="text-[#68647a] text-[9px] block">Gross Wt:</span>
                              <span className="font-mono font-semibold">{parseFloat(orn.grossWeight).toFixed(3)}g</span>
                            </div>
                            <div>
                              <span className="text-[#68647a] text-[9px] block">Net Wt:</span>
                              <span className="font-mono font-bold text-[#542047]">
                                {parseFloat(orn.netWeight).toFixed(3)}g
                              </span>
                            </div>
                            <div>
                              <span className="text-[#68647a] text-[9px] block">Indicative:</span>
                              <span className="font-mono font-semibold text-[#246743]">
                                {orn.priceAmount ? `₹${parseFloat(orn.priceAmount).toLocaleString('en-IN')}` : 'Market Rate'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action Button */}
                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            disabled={isAdded}
                            onClick={() => {
                              onAddOrnament(orn);
                              showFeedback('success', `Added ${orn.tagCode} to sales bill.`);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                              isAdded
                                ? 'bg-[#e2f6e8] text-[#246743] opacity-80 cursor-default'
                                : 'bg-[#542047] hover:bg-[#421b48] text-white shadow-xs'
                            }`}
                          >
                            {isAdded ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>In Sales Bill</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add to Bill</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-[#eee2dc] bg-[#fffaf5] flex justify-between items-center text-xs text-[#68647a]">
              <span>Showing {filteredOrnaments.length} available items</span>
              <button
                type="button"
                onClick={() => setIsBrowseModalOpen(false)}
                className="px-4 py-1.5 bg-white border border-[#eee2dc] hover:border-[#542047] text-[#542047] rounded-xl text-xs font-semibold transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
