'use client';

import React from 'react';
import { InventoryValuationReport } from '@/lib/reports';
import { formatInr } from '@/lib/indicative-pricing';
import { Package, Scale, Coins, AlertTriangle, Layers, Gem } from 'lucide-react';

interface InventoryValuationViewProps {
  report: InventoryValuationReport;
}

export function InventoryValuationView({ report }: InventoryValuationViewProps) {
  const { totals, categoryBreakdown, items, costDisclosure, filters } = report;

  return (
    <div className="space-y-6">
      {/* Cost Tracking & Valuation Alert */}
      <div className="p-4 bg-[#fffaf5] border border-[#f1d394] rounded-2xl flex items-start gap-3 text-xs text-[#73501b]">
        <AlertTriangle className="w-5 h-5 text-[#d49a24] shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-[#542047] mb-0.5">Wholesale Acquisition Cost Disclosure</h4>
          <p className="leading-relaxed">{costDisclosure}</p>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Available Showroom Stock</span>
            <Package className="w-4 h-4 text-[#d49a24]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {totals.totalOrnaments} pieces
          </div>
          <div className="text-[11px] text-[#68647a]">
            Stocked at {filters.branchName}
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Total Net Metal Weight</span>
            <Scale className="w-4 h-4 text-[#7b285e]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#7b285e] my-1">
            {totals.totalNetWeightGrams}g
          </div>
          <div className="text-[11px] text-[#68647a]">
            Gross: {totals.totalGrossWeightGrams}g · Stone: {totals.totalStoneWeightGrams}g
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Recorded Wholesale Cost</span>
            <Coins className="w-4 h-4 text-[#68647a]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#68647a] my-1">
            {totals.totalRecordedCost === 'Not Recorded' ? 'Not Recorded' : formatInr(totals.totalRecordedCost)}
          </div>
          <div className="text-[11px] text-[#82510b] font-medium">
            {totals.recordedCostItemsCount} of {totals.totalOrnaments} items with recorded cost
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Indicative Bullion Valuation</span>
            <Coins className="w-4 h-4 text-[#246743]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#246743] my-1">
            {formatInr(totals.totalIndicativeEstimate)}
          </div>
          <div className="text-[11px] text-[#246743] font-medium">
            {totals.unvaluedItemsCount > 0
              ? `${totals.unvaluedItemsCount} item${totals.unvaluedItemsCount > 1 ? 's' : ''} excluded (rate unavailable)`
              : 'Benchmark estimate at daily board rates'}
          </div>
        </div>
      </div>

      {/* Category Stock Summary */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-5 shadow-xs">
        <h3 className="text-sm font-serif font-bold text-[#542047] mb-3">
          Inventory Stock by Jewellery Category
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#eee2dc] bg-[#fffaf5] text-[#68647a]">
                <th className="py-2.5 px-3 font-semibold">Category</th>
                <th className="py-2.5 px-3 font-semibold text-right">Available Pieces</th>
                <th className="py-2.5 px-3 font-semibold text-right">Gross Weight</th>
                <th className="py-2.5 px-3 font-semibold text-right">Net Fine Weight</th>
                <th className="py-2.5 px-3 font-semibold text-right">Indicative Bullion Valuation (Est.)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee2dc]">
              {categoryBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[#68647a]">
                    No inventory items stocked in this showroom.
                  </td>
                </tr>
              ) : (
                categoryBreakdown.map((c) => (
                  <tr key={c.category} className="hover:bg-[#fffdfb]">
                    <td className="py-2.5 px-3 font-medium text-[#542047]">{c.category}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">{c.ornamentCount}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{c.grossWeightGrams}g</td>
                    <td className="py-2.5 px-3 text-right font-mono">{c.netWeightGrams}g</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#246743]">
                      {formatInr(c.indicativeValuation)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Individual Ornament Stock Register */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-serif font-bold text-[#542047]">
              Available Physical Ornaments Stock Register
            </h3>
            <p className="text-xs text-[#68647a]">
              Individual tagged ornaments on display and in showroom vaults
            </p>
          </div>
          <span className="px-2.5 py-0.5 bg-[#fff0dc] text-[#73501b] rounded text-[11px] font-bold">
            {items.length} PIECES
          </span>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#fffaf5] border-b border-[#eee2dc]">
              <tr className="text-[#68647a]">
                <th className="py-2.5 px-3 font-semibold">Tag Code</th>
                <th className="py-2.5 px-3 font-semibold">HUID</th>
                <th className="py-2.5 px-3 font-semibold">Design Name</th>
                <th className="py-2.5 px-3 font-semibold">Purity</th>
                <th className="py-2.5 px-3 font-semibold text-right">Gross Wt</th>
                <th className="py-2.5 px-3 font-semibold text-right">Net Wt</th>
                <th className="py-2.5 px-3 font-semibold text-right">Recorded Cost</th>
                <th className="py-2.5 px-3 font-semibold text-right">Indicative Est.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee2dc]">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-[#68647a]">
                    No available ornaments found for the selected showroom and filters.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-[#fffdfb]">
                    <td className="py-2.5 px-3 font-mono font-bold text-[#542047]">{item.tagCode}</td>
                    <td className="py-2.5 px-3 font-mono text-[#68647a]">{item.huid || '-'}</td>
                    <td className="py-2.5 px-3 font-medium text-[#25203a]">
                      {item.productName}{' '}
                      <span className="text-[10px] text-[#68647a]">({item.sku})</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.2 bg-[#fff0dc] text-[#73501b] rounded text-[10px] font-bold">
                        {item.purity}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">{item.grossWeight}g</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">{item.netWeight}g</td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#68647a]">
                      {item.costAmount === 'Not Recorded' ? (
                        <span className="italic text-[#82510b]">Not Recorded</span>
                      ) : (
                        formatInr(item.costAmount)
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      {item.indicativePrice && !isNaN(Number(item.indicativePrice)) ? (
                        <span className="text-[#246743]">{formatInr(item.indicativePrice)}</span>
                      ) : (
                        <span className="text-[#b93657] font-medium text-[11px]">{item.indicativePrice}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
