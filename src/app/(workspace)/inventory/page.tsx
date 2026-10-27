'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Gem,
  Tag,
  Check,
  AlertCircle,
  X,
  Eye,
  ArrowRightLeft,
  RefreshCw,
  LayoutGrid,
  List,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { JewelArt } from '@/components/jewel-art';
import { useWorkspace } from '@/components/layout/workspace-shell';
import { canManageInventory } from '@/lib/navigation';
import {
  SerializedOrnament,
  getInventoryListingAction,
} from '@/app/actions/inventory';
import { getIndicativePrice } from '@/lib/indicative-pricing';
import { OrnamentDetailModal } from '@/components/workspace/inventory/ornament-detail-modal';
import { TransferOrnamentModal } from '@/components/workspace/inventory/transfer-ornament-modal';
import { AddOrnamentModal } from '@/components/workspace/inventory/add-ornament-modal';

export default function InventoryPage() {
  const { activeBranch, user, availableBranches = [] } = useWorkspace();
  const canManage = canManageInventory(user?.role);
  const isMultiBranchRole = user?.role === 'OWNER' || user?.role === 'MANAGER';

  // Live Inventory State
  const [ornaments, setOrnaments] = useState<SerializedOrnament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedPurity, setSelectedPurity] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [showAllBranches, setShowAllBranches] = useState(false);

  // View Layout
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [detailOrnament, setDetailOrnament] = useState<SerializedOrnament | null>(null);
  const [transferOrnament, setTransferOrnament] = useState<SerializedOrnament | null>(null);

  // Notification Toast / Banner
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const categories = ['All', 'Necklaces', 'Bangles', 'Earrings', 'Rings', 'Bridal', 'Chains', 'Pendants'];
  const purities = ['All', '24K', '22K', '18K', '14K'];
  const statuses = ['All', 'AVAILABLE', 'RESERVED', 'SOLD', 'IN_TRANSIT', 'DAMAGED'];

  // Load Inventory Data
  const loadInventory = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);

    try {
      const filters: any = {};

      if (!showAllBranches && activeBranch?.id) {
        filters.branchId = activeBranch.id;
      }
      if (selectedCategory !== 'All') {
        filters.category = selectedCategory;
      }
      if (selectedPurity !== 'All') {
        filters.purity = selectedPurity;
      }
      if (selectedStatus !== 'All') {
        filters.status = selectedStatus;
      }
      if (searchQuery.trim()) {
        filters.searchQuery = searchQuery.trim();
      }

      const res = await getInventoryListingAction(filters);
      if (res.success && res.data) {
        setOrnaments(res.data);
      } else {
        setFetchError(res.error || 'Failed to load inventory.');
      }
    } catch (err: any) {
      setFetchError(err.message || 'Error communicating with database.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranch?.id, showAllBranches, selectedCategory, selectedPurity, selectedStatus, searchQuery]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const notify = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 6000);
  };

  const formatCurrency = (val: string | null) => {
    if (!val) return '—';
    const num = parseFloat(val);
    return isNaN(num) ? '—' : `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatStatus = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return { label: 'In Stock', color: 'bg-[#e2f6e8] text-[#246743] border-[#a3e2bb]' };
      case 'RESERVED':
        return { label: 'Reserved', color: 'bg-[#fff0dc] text-[#82510b] border-[#f1d394]' };
      case 'SOLD':
        return { label: 'Sold', color: 'bg-stone-100 text-stone-600 border-stone-200' };
      case 'IN_TRANSIT':
        return { label: 'In Transit', color: 'bg-[#e0f2fe] text-[#0369a1] border-[#bae6fd]' };
      case 'DAMAGED':
        return { label: 'Damaged', color: 'bg-[#fee2e2] text-[#b91c1c] border-[#fca5a5]' };
      default:
        return { label: status, color: 'bg-stone-100 text-stone-700 border-stone-200' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-serif font-bold text-[#d49a24] uppercase tracking-widest">
              Live Jewellery Inventory
            </span>
            <span className="px-2 py-0.5 bg-[#e2f6e8] border border-[#a3e2bb] text-[#246743] rounded text-[10px] font-bold">
              POSTGRES PERSISTED
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-serif font-bold text-[#542047]">
            {showAllBranches ? 'All Showrooms Stock' : `${activeBranch.name} Showroom`}
          </h1>
          <p className="text-xs text-[#68647a]">
            Manage catalogue designs, physical tagged pieces, BIS hallmarking HUIDs, and inter-branch movements.
            Catalogue prices are indicative showroom tag estimates; POS checkout dynamically calculates authoritative billing from active daily bullion rates and making charges.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadInventory}
            disabled={isLoading}
            className="p-2.5 bg-white border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-semibold flex items-center justify-center transition shadow-xs disabled:opacity-50"
            title="Refresh Inventory"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {canManage && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2.5 bg-[#542047] text-[#ffe8a8] hover:bg-[#421b48] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Jewellery</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Notice / Toast */}
      {actionNotice && (
        <div className="p-3 bg-[#e2f6e8] border border-[#a3e2bb] rounded-xl text-xs text-[#246743] flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#246743] shrink-0" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Fetch Error Banner */}
      {fetchError && (
        <div className="p-3 bg-[#fee2e2] border border-[#fca5a5] rounded-xl text-xs text-[#b91c1c] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button onClick={loadInventory} className="font-bold underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Search and Filters Toolbar */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-[#68647a] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search tag code, SKU, design name, HUID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            />
          </div>

          {/* Category Dropdown */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  Category: {c}
                </option>
              ))}
            </select>
          </div>

          {/* Purity Dropdown */}
          <div>
            <select
              value={selectedPurity}
              onChange={(e) => setSelectedPurity(e.target.value)}
              className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            >
              {purities.map((p) => (
                <option key={p} value={p}>
                  Purity: {p}
                </option>
              ))}
            </select>
          </div>

          {/* Status Dropdown */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  Status: {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bottom Filter Controls & View Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-[#eee2dc]/60 text-xs text-[#68647a]">
          <div className="flex items-center gap-4 flex-wrap">
            <span>
              Showing <strong>{ornaments.length}</strong> live jewellery pieces
            </span>

            {isMultiBranchRole && (
              <label className="flex items-center gap-1.5 cursor-pointer text-[#542047] font-medium">
                <input
                  type="checkbox"
                  checked={showAllBranches}
                  onChange={(e) => setShowAllBranches(e.target.checked)}
                  className="rounded text-[#542047] focus:ring-[#d49a24]"
                />
                <span>Include all organization showrooms</span>
              </label>
            )}

            {(searchQuery || selectedCategory !== 'All' || selectedPurity !== 'All' || selectedStatus !== 'All') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                  setSelectedPurity('All');
                  setSelectedStatus('All');
                }}
                className="text-[#d49a24] hover:underline font-medium"
              >
                Reset Filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 bg-[#fffaf5] border border-[#eee2dc] p-0.5 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-[#542047] text-white shadow-xs' : 'text-[#68647a] hover:text-[#25203a]'}`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-[#542047] text-white shadow-xs' : 'text-[#68647a] hover:text-[#25203a]'}`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="py-20 text-center bg-white border border-[#eee2dc] rounded-2xl">
          <RefreshCw className="w-8 h-8 text-[#d49a24] animate-spin mx-auto mb-3" />
          <h3 className="font-serif font-bold text-base text-[#542047]">
            Fetching Live Inventory...
          </h3>
          <p className="text-xs text-[#68647a] mt-1">Connecting to Neon PostgreSQL database</p>
        </div>
      ) : ornaments.length === 0 ? (
        <div className="p-12 text-center bg-white border border-[#eee2dc] rounded-2xl space-y-3">
          <Gem className="w-12 h-12 text-[#d49a24] mx-auto opacity-50" />
          <h3 className="font-serif font-bold text-lg text-[#542047]">No Jewellery Pieces Found</h3>
          <p className="text-xs text-[#68647a] max-w-md mx-auto">
            {searchQuery || selectedCategory !== 'All' || selectedPurity !== 'All' || selectedStatus !== 'All'
              ? 'No registered items matched your filter criteria. Try adjusting your search query or filters.'
              : `There are currently no jewellery pieces registered at this showroom.`}
          </p>
          {canManage && (
            <div className="pt-2">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2 bg-[#542047] text-[#ffe8a8] hover:bg-[#421b48] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add Your First Jewellery Item</span>
              </button>
            </div>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ornaments.map((orn) => {
            const statusBadge = formatStatus(orn.status);
            return (
              <div
                key={orn.id}
                className="bg-white border border-[#eee2dc] hover:border-[#d49a24] rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  {/* Visual container with JewelArt */}
                  <div className="h-44 bg-gradient-to-b from-[#fffaf0] to-[#f8ecd9] relative flex items-center justify-center p-3 border-b border-[#eee2dc]">
                    <JewelArt category={orn.product?.category || 'Necklaces'} className="w-full h-full drop-shadow-xs" />
                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-white/90 backdrop-blur border border-[#eee2dc] text-[#542047] font-bold text-[10px] rounded-md shadow-xs">
                      {orn.purity}
                    </span>
                    <span className="absolute top-2.5 right-2.5 font-mono text-[10px] bg-[#542047] text-[#ffe8a8] px-2 py-0.5 rounded font-bold shadow-xs flex items-center gap-1">
                      <span className="text-[9px] uppercase font-sans font-medium text-[#ffe8a8]/80">Tag:</span>
                      <span>{orn.tagCode}</span>
                    </span>
                  </div>

                  {/* Piece Info */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-mono text-[#68647a] bg-[#fffaf5] px-1.5 py-0.5 rounded border border-[#eee2dc]/80">
                        <span className="font-semibold text-[#542047] font-sans">Product Code:</span> {orn.product?.sku || 'N/A'}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${statusBadge.color}`}>
                        {statusBadge.label}
                      </span>
                    </div>

                    <h3 className="font-serif font-bold text-sm text-[#542047] line-clamp-1">
                      {orn.product?.name || 'Jewellery Ornament'}
                    </h3>

                    <div className="text-xs text-[#68647a] flex items-center justify-between">
                      <span>Net Metal:</span>
                      <span className="font-bold text-[#25203a] font-mono">{orn.netWeight} g</span>
                    </div>

                    <div className="text-xs text-[#68647a] flex items-center justify-between">
                      <span>Showroom:</span>
                      <span className="font-medium text-[#25203a]">{orn.branch?.name}</span>
                    </div>

                    {orn.huid && (
                      <div className="flex items-center gap-1 text-[10px] text-[#542047] font-mono font-semibold">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#542047]" />
                        <span>HUID: {orn.huid}</span>
                      </div>
                    )}

                    <div className="flex items-baseline justify-between pt-1 border-t border-[#eee2dc]/50">
                      <div>
                        {(() => {
                          const pricing = getIndicativePrice(orn);
                          return (
                            <div>
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[10px] text-[#68647a] block">Indicative Price</span>
                                {pricing.hasPrice && (
                                  <span className="text-[9px] font-medium text-[#d49a24] bg-[#fffaf0] px-1 rounded border border-[#f1d394]">
                                    {pricing.label}
                                  </span>
                                )}
                              </div>
                              {pricing.hasPrice ? (
                                <span className="text-base font-serif font-bold text-[#25203a]">
                                  {pricing.formattedPrice}
                                </span>
                              ) : (
                                <div>
                                  <span className="text-xs font-semibold text-stone-500 block">
                                    {pricing.formattedPrice}
                                  </span>
                                  {pricing.reason && (
                                    <span className="text-[10px] text-stone-400 block font-normal">
                                      ({pricing.reason})
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      {orn.costAmount !== null && (
                        <span className="text-[10px] text-[#68647a] font-mono" title="Confidential wholesale cost">
                          Cost: {formatCurrency(orn.costAmount)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Action Bar */}
                <div className="p-3 pt-0 border-t border-[#eee2dc]/50 mt-1 flex items-center gap-2">
                  <button
                    onClick={() => setDetailOrnament(orn)}
                    className="flex-1 py-1.5 bg-[#fffaf5] hover:bg-[#fff0dc] border border-[#eee2dc] text-[#542047] rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#d49a24]" />
                    <span>Details & Ledger</span>
                  </button>

                  {canManage && orn.status === 'AVAILABLE' && (
                    <button
                      onClick={() => setTransferOrnament(orn)}
                      className="p-1.5 bg-[#fffaf5] hover:bg-[#ffe3be] border border-[#eee2dc] text-[#73501b] rounded-lg text-xs font-semibold flex items-center justify-center transition"
                      title="Inter-Branch Transfer"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white border border-[#eee2dc] rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#fffaf5] border-b border-[#eee2dc] text-[#542047] font-serif font-bold">
                <tr>
                  <th className="py-3 px-4">Tag Code / HUID</th>
                  <th className="py-3 px-4">Design & Product Code</th>
                  <th className="py-3 px-4">Purity & Metal</th>
                  <th className="py-3 px-4 text-right">Gross (g)</th>
                  <th className="py-3 px-4 text-right">Net Metal (g)</th>
                  <th className="py-3 px-4 text-right">Indicative Price</th>
                  {canManage && <th className="py-3 px-4 text-right">Cost</th>}
                  <th className="py-3 px-4">Showroom</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee2dc]">
                {ornaments.map((orn) => {
                  const statusBadge = formatStatus(orn.status);
                  const pricing = getIndicativePrice(orn);
                  return (
                    <tr key={orn.id} className="hover:bg-[#fffaf5]/50 transition">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-[#542047]">
                          <span className="text-[10px] text-[#68647a] font-normal uppercase mr-1">Tag:</span>
                          {orn.tagCode}
                        </div>
                        {orn.huid ? (
                          <div className="flex items-center gap-1 text-[10px] text-[#542047] font-mono font-medium">
                            <ShieldCheck className="w-3 h-3 text-[#542047]" />
                            <span>{orn.huid}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-stone-400 font-mono">No HUID</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#25203a]">{orn.product?.name}</div>
                        <div className="font-mono text-[10px] text-[#68647a]">
                          <span className="font-semibold text-[#542047]">Product Code:</span> {orn.product?.sku || 'N/A'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-[#542047]">{orn.purity}</div>
                        <div className="text-[10px] text-[#68647a]">{orn.metalType} · {orn.product?.category}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#68647a]">
                        {orn.grossWeight}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#25203a]">
                        {orn.netWeight}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {pricing.hasPrice ? (
                          <>
                            <div className="font-bold text-[#542047]">{pricing.formattedPrice}</div>
                            <div className="text-[10px] text-[#68647a] font-normal font-sans">{pricing.label}</div>
                          </>
                        ) : (
                          <>
                            <div className="font-medium text-xs text-stone-500">{pricing.formattedPrice}</div>
                            {pricing.reason && (
                              <div className="text-[10px] text-stone-400 font-normal font-sans">({pricing.reason})</div>
                            )}
                          </>
                        )}
                      </td>
                      {canManage && (
                        <td className="py-3 px-4 text-right font-mono text-[11px] text-[#68647a]">
                          {formatCurrency(orn.costAmount)}
                        </td>
                      )}
                      <td className="py-3 px-4 text-[#25203a] font-medium">
                        {orn.branch?.name}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${statusBadge.color}`}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setDetailOrnament(orn)}
                            className="p-1.5 rounded-lg text-[#542047] hover:bg-[#fff0dc] transition"
                            title="View Details & Ledger"
                          >
                            <Eye className="w-4 h-4 text-[#d49a24]" />
                          </button>
                          {canManage && orn.status === 'AVAILABLE' && (
                            <button
                              onClick={() => setTransferOrnament(orn)}
                              className="p-1.5 rounded-lg text-[#73501b] hover:bg-[#ffe3be] transition"
                              title="Transfer to Another Showroom"
                            >
                              <ArrowRightLeft className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ornament Detail Modal */}
      <OrnamentDetailModal
        ornament={detailOrnament}
        onClose={() => setDetailOrnament(null)}
        canManage={canManage}
        onInitiateTransfer={(orn) => setTransferOrnament(orn)}
      />

      {/* Transfer Ornament Modal */}
      <TransferOrnamentModal
        ornament={transferOrnament}
        availableBranches={availableBranches}
        onClose={() => setTransferOrnament(null)}
        onSuccess={(msg) => {
          notify(msg);
          loadInventory();
        }}
      />

      {/* Add Ornament Modal */}
      <AddOrnamentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        activeBranchId={activeBranch.id}
        availableBranches={availableBranches}
        onSuccess={(msg) => {
          notify(msg);
          loadInventory();
        }}
      />
    </div>
  );
}
