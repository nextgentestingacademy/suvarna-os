'use client';

import React, { useState } from 'react';
import {
  Search,
  Filter,
  Plus,
  Gem,
  Tag,
  Check,
  AlertCircle,
  X,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';
import { JewelArt } from '@/components/jewel-art';
import { useWorkspace } from '@/components/layout/workspace-shell';
import {
  INITIAL_DEMO_PRODUCTS,
  DemoProduct,
} from '@/data/mock-workspace';

export default function InventoryPage() {
  const { activeBranch } = useWorkspace();
  const [products, setProducts] = useState<DemoProduct[]>(INITIAL_DEMO_PRODUCTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedPurity, setSelectedPurity] = useState<string>('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<DemoProduct | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // Form State for Adding Product
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: 'Necklaces' as DemoProduct['category'],
    metal: 'Gold' as DemoProduct['metal'],
    purity: '22K' as DemoProduct['purity'],
    grossWeight: '',
    netWeight: '',
    stoneWeight: '0',
    makingChargeType: 'Per Gram' as DemoProduct['makingChargeType'],
    makingCharge: '',
    price: '',
    stock: '1',
    huid: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const categories = ['All', 'Necklaces', 'Bangles', 'Earrings', 'Bridal', 'Chains', 'Pendants'];
  const purities = ['All', '24K', '22K', '18K', '14K'];

  // Filter products
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.huid && p.huid.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    const matchesPurity = selectedPurity === 'All' || p.purity === selectedPurity;

    return matchesSearch && matchesCategory && matchesPurity;
  });

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Product name is required';
    if (!formData.sku.trim()) errors.sku = 'SKU / Item code is required';
    const gross = parseFloat(formData.grossWeight);
    const net = parseFloat(formData.netWeight);
    if (isNaN(gross) || gross <= 0) errors.grossWeight = 'Valid gross weight required';
    if (isNaN(net) || net <= 0) errors.netWeight = 'Valid net weight required';
    if (!isNaN(gross) && !isNaN(net) && gross < net) {
      errors.grossWeight = 'Gross weight cannot be less than net metal weight';
    }
    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) errors.price = 'Valid price required';
    const stock = parseInt(formData.stock);
    if (isNaN(stock) || stock < 0) errors.stock = 'Valid stock count required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const gross = parseFloat(formData.grossWeight);
    const net = parseFloat(formData.netWeight);
    const stone = parseFloat(formData.stoneWeight) || 0;
    const price = parseFloat(formData.price);
    const stock = parseInt(formData.stock) || 1;

    const newProd: DemoProduct = {
      id: `prod-${Date.now()}`,
      sku: formData.sku.toUpperCase(),
      name: formData.name,
      category: formData.category,
      metal: formData.metal,
      purity: formData.purity,
      grossWeight: gross,
      netWeight: net,
      stoneWeight: stone,
      makingChargeType: formData.makingChargeType,
      makingCharge: parseFloat(formData.makingCharge) || 0,
      price: price,
      stock: stock,
      huid: formData.huid ? formData.huid.toUpperCase() : undefined,
      status: stock <= 2 ? 'Low Stock' : 'In Stock',
      branchId: activeBranch.id,
    };

    setProducts([newProd, ...products]);
    setIsAddModalOpen(false);
    setSessionNotice(`Added "${newProd.name}" (${newProd.sku}) to this browser session.`);
    setTimeout(() => setSessionNotice(null), 5000);

    // Reset Form
    setFormData({
      name: '',
      sku: '',
      category: 'Necklaces',
      metal: 'Gold',
      purity: '22K',
      grossWeight: '',
      netWeight: '',
      stoneWeight: '0',
      makingChargeType: 'Per Gram',
      makingCharge: '',
      price: '',
      stock: '1',
      huid: '',
    });
    setFormErrors({});
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-serif font-bold text-[#d49a24] uppercase tracking-widest">
              Inventory & Catalogue
            </span>
            <span className="px-2 py-0.5 bg-[#fff0dc] border border-[#f1d394] text-[#73501b] rounded text-[10px] font-bold">
              DEMO DATA
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-serif font-bold text-[#542047]">
            Jewellery Stock ({activeBranch.name})
          </h1>
          <p className="text-xs text-[#68647a]">
            Manage designs, individual item weights, BIS hallmarking HUIDs, and stock levels.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 bg-[#542047] text-[#ffe8a8] hover:bg-[#421b48] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Jewellery</span>
        </button>
      </div>

      {/* Session Alert / Notice */}
      {sessionNotice && (
        <div className="p-3 bg-[#e2f6e8] border border-[#a3e2bb] rounded-xl text-xs text-[#246743] flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#246743]" />
            <span>{sessionNotice} <strong>(Notice: Demo-only, not saved to live database)</strong></span>
          </div>
          <button onClick={() => setSessionNotice(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search and Filters Toolbar */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#68647a] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by SKU, product name, or HUID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            />
          </div>

          {/* Category Dropdown Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#68647a] whitespace-nowrap">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Purity Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#68647a] whitespace-nowrap">Purity:</span>
            <select
              value={selectedPurity}
              onChange={(e) => setSelectedPurity(e.target.value)}
              className="px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            >
              {purities.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results count & Clear */}
        <div className="flex items-center justify-between text-xs text-[#68647a] pt-1">
          <span>Showing {filteredProducts.length} of {products.length} listed designs</span>
          {(searchQuery || selectedCategory !== 'All' || selectedPurity !== 'All') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
                setSelectedPurity('All');
              }}
              className="text-[#d49a24] hover:underline font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Product Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filteredProducts.map((p) => (
          <div
            key={p.id}
            className="bg-white border border-[#eee2dc] hover:border-[#d49a24] rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div>
              {/* Product Visual Container with Vector Jewel Art */}
              <div className="h-44 bg-gradient-to-b from-[#fffaf0] to-[#f8ecd9] relative flex items-center justify-center p-3 border-b border-[#eee2dc]">
                <JewelArt category={p.category} className="w-full h-full drop-shadow-xs" />
                <span className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-white/90 backdrop-blur border border-[#eee2dc] text-[#542047] font-bold text-[10px] rounded-md shadow-xs">
                  {p.purity}
                </span>
                <span className="absolute top-2.5 right-2.5 font-mono text-[10px] bg-[#542047] text-[#ffe8a8] px-1.5 py-0.5 rounded font-bold">
                  {p.sku}
                </span>
              </div>

              {/* Product Info */}
              <div className="p-4 space-y-2">
                <h3 className="font-serif font-bold text-sm text-[#542047] line-clamp-1">
                  {p.name}
                </h3>
                <div className="text-xs text-[#68647a] flex items-center justify-between">
                  <span>{p.category}</span>
                  <span>Net: {p.netWeight.toFixed(3)}g</span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-base font-serif font-bold text-[#25203a]">
                    ₹{p.price.toLocaleString('en-IN')}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      p.stock <= 4 ? 'bg-[#fff0dc] text-[#82510b]' : 'bg-[#e2f6e8] text-[#246743]'
                    }`}
                  >
                    {p.stock} in stock
                  </span>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="p-3 pt-0 border-t border-[#eee2dc]/50 mt-2 flex items-center gap-2">
              <button
                onClick={() => setSelectedProduct(p)}
                className="w-full py-1.5 bg-[#fffaf5] hover:bg-[#fff0dc] border border-[#eee2dc] text-[#542047] rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition"
              >
                <Eye className="w-3.5 h-3.5 text-[#d49a24]" />
                <span>View Details</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="p-12 text-center bg-white border border-[#eee2dc] rounded-2xl">
          <Gem className="w-10 h-10 text-[#d49a24] mx-auto mb-2 opacity-50" />
          <h3 className="font-serif font-bold text-lg text-[#542047]">No designs match your filter</h3>
          <p className="text-xs text-[#68647a] mt-1">
            Try adjusting your search query, purity, or category selections.
          </p>
        </div>
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#eee2dc] rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[#eee2dc]">
              <div>
                <span className="font-mono text-xs font-bold text-[#d49a24] uppercase tracking-wider block">
                  {selectedProduct.sku} {selectedProduct.huid ? `· HUID: ${selectedProduct.huid}` : ''}
                </span>
                <h2 className="text-xl font-serif font-bold text-[#542047]">
                  {selectedProduct.name}
                </h2>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1.5 rounded-lg text-[#68647a] hover:bg-[#fff0dc] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-4 h-40 bg-[#fffaf0] rounded-xl flex items-center justify-center border border-[#eee2dc]">
              <JewelArt category={selectedProduct.category} className="w-full h-full" />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
                <span className="text-[#68647a] block text-[10px]">Category & Metal</span>
                <span className="font-bold text-[#542047]">{selectedProduct.category} · {selectedProduct.metal}</span>
              </div>
              <div className="p-2.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
                <span className="text-[#68647a] block text-[10px]">Purity Standard</span>
                <span className="font-bold text-[#542047]">{selectedProduct.purity}</span>
              </div>
              <div className="p-2.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
                <span className="text-[#68647a] block text-[10px]">Gross Weight</span>
                <span className="font-bold text-[#25203a]">{selectedProduct.grossWeight.toFixed(3)} grams</span>
              </div>
              <div className="p-2.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
                <span className="text-[#68647a] block text-[10px]">Net Metal Weight</span>
                <span className="font-bold text-[#25203a]">{selectedProduct.netWeight.toFixed(3)} grams</span>
              </div>
              <div className="p-2.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
                <span className="text-[#68647a] block text-[10px]">Making Charge</span>
                <span className="font-bold text-[#25203a]">
                  {selectedProduct.makingChargeType === 'Per Gram'
                    ? `₹${selectedProduct.makingCharge}/g`
                    : selectedProduct.makingChargeType === 'Percentage'
                    ? `${selectedProduct.makingCharge}%`
                    : `₹${selectedProduct.makingCharge.toLocaleString('en-IN')} Flat`}
                </span>
              </div>
              <div className="p-2.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
                <span className="text-[#68647a] block text-[10px]">Indicative Price</span>
                <span className="font-bold text-[#7b285e] text-sm">₹{selectedProduct.price.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="mt-4 p-2.5 bg-[#fff0dc] border border-[#f1d394] rounded-xl text-[11px] text-[#73501b]">
              <strong>Demo Notice:</strong> In production with database persistence, this screen will display inventory movement history, karigar job slips, and transfer records.
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSelectedProduct(null)}
                className="px-4 py-2 bg-[#542047] text-white rounded-xl text-xs font-semibold hover:bg-[#421b48] transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#eee2dc] rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[#eee2dc]">
              <div>
                <span className="text-[10px] font-bold text-[#d49a24] uppercase tracking-wider block">
                  New Catalogue Item
                </span>
                <h2 className="text-xl font-serif font-bold text-[#542047]">
                  Add Jewellery to Showroom
                </h2>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-[#68647a] hover:bg-[#fff0dc] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-4 my-4">
              <div>
                <label className="text-xs font-semibold text-[#25203a] block mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Antique Peacock Pendant"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                />
                {formErrors.name && (
                  <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.name}</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#25203a] block mb-1">
                    SKU Code *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PD-22099"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                  />
                  {formErrors.sku && (
                    <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.sku}</span>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#25203a] block mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                  >
                    <option value="Necklaces">Necklaces</option>
                    <option value="Bangles">Bangles</option>
                    <option value="Earrings">Earrings</option>
                    <option value="Bridal">Bridal</option>
                    <option value="Chains">Chains</option>
                    <option value="Pendants">Pendants</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#25203a] block mb-1">
                    Purity Standard
                  </label>
                  <select
                    value={formData.purity}
                    onChange={(e) => setFormData({ ...formData, purity: e.target.value as any })}
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                  >
                    <option value="22K">22K (916)</option>
                    <option value="18K">18K (750)</option>
                    <option value="24K">24K (999)</option>
                    <option value="14K">14K (585)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#25203a] block mb-1">
                    Hallmarking HUID
                  </label>
                  <input
                    type="text"
                    placeholder="6-character alphanumeric"
                    value={formData.huid}
                    onChange={(e) => setFormData({ ...formData, huid: e.target.value })}
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#25203a] block mb-1">
                    Gross Weight (grams) *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    value={formData.grossWeight}
                    onChange={(e) => setFormData({ ...formData, grossWeight: e.target.value })}
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                  />
                  {formErrors.grossWeight && (
                    <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.grossWeight}</span>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#25203a] block mb-1">
                    Net Metal Weight (g) *
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    value={formData.netWeight}
                    onChange={(e) => setFormData({ ...formData, netWeight: e.target.value })}
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                  />
                  {formErrors.netWeight && (
                    <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.netWeight}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#25203a] block mb-1">
                    Indicative Price (₹) *
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 125000"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                  />
                  {formErrors.price && (
                    <span className="text-[10px] text-[#b93657] block mt-0.5">{formErrors.price}</span>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#25203a] block mb-1">
                    Stock Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24]"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#fff0dc] border border-[#f1d394] rounded-xl text-[11px] text-[#73501b]">
                <strong>Notice:</strong> This is a client-side demo interaction. The new item will be visible in your current session list, but changes are not permanently committed to the database.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#eee2dc]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-[#eee2dc] rounded-xl text-xs font-semibold text-[#68647a] hover:bg-[#fffaf5] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#542047] hover:bg-[#421b48] text-[#ffe8a8] rounded-xl text-xs font-semibold transition"
                >
                  Save to Demo Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
