'use client';

import React from 'react';
import { SalesSummaryReport } from '@/lib/reports';
import { formatInr } from '@/lib/indicative-pricing';
import { TrendingUp, Receipt, Gem, Layers, Tag, Percent } from 'lucide-react';

interface SalesSummaryViewProps {
  report: SalesSummaryReport;
}

export function SalesSummaryView({ report }: SalesSummaryViewProps) {
  const { totals, dailyTrend, categoryBreakdown, filters } = report;

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Gross Invoice Sales</span>
            <Receipt className="w-4 h-4 text-[#d49a24]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {formatInr(totals.grossSales)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            {totals.invoiceCount} completed sales invoices
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Taxable Turnover</span>
            <Layers className="w-4 h-4 text-[#7b285e]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#7b285e] my-1">
            {formatInr(totals.taxableAmount)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            Net base revenue before GST
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Total GST Collected</span>
            <Percent className="w-4 h-4 text-[#246743]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#246743] my-1">
            {formatInr(totals.totalTax)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            CGST: {formatInr(totals.cgstAmount)} · SGST: {formatInr(totals.sgstAmount)}
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Customer Collections</span>
            <TrendingUp className="w-4 h-4 text-[#542047]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {formatInr(totals.paidAmount)}
          </div>
          <div className="text-[11px] text-[#b93657] font-medium">
            Outstanding dues: {formatInr(totals.balanceAmount)}
          </div>
        </div>
      </div>

      {/* Revenue Breakdown Schedule */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-5 shadow-xs">
        <h3 className="text-sm font-serif font-bold text-[#542047] mb-3">
          Revenue Composition Breakdown
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
            <span className="text-[#68647a] block">Precious Metal Value</span>
            <span className="text-base font-bold text-[#542047] block mt-1">
              {formatInr(totals.metalValue)}
            </span>
            <span className="text-[10px] text-[#82510b]">Fine bullion content</span>
          </div>

          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
            <span className="text-[#68647a] block">Making / Labour Charges</span>
            <span className="text-base font-bold text-[#542047] block mt-1">
              {formatInr(totals.makingCharges)}
            </span>
            <span className="text-[10px] text-[#82510b]">Artisan craftsmanship</span>
          </div>

          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
            <span className="text-[#68647a] block">Stone & Gem Charges</span>
            <span className="text-base font-bold text-[#542047] block mt-1">
              {formatInr(totals.stoneCharges)}
            </span>
            <span className="text-[10px] text-[#82510b]">Diamonds & pearls</span>
          </div>

          <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl">
            <span className="text-[#68647a] block">Discounts & Concessions</span>
            <span className="text-base font-bold text-[#b93657] block mt-1">
              {formatInr(totals.discountAmount)}
            </span>
            <span className="text-[10px] text-[#b93657]">Contra-revenue deductions</span>
          </div>
        </div>
      </div>

      {/* Category Breakdown Table */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-serif font-bold text-[#542047]">
              Sales Performance by Design Category
            </h3>
            <p className="text-xs text-[#68647a]">
              Volume, fine weight and revenue realized per category
            </p>
          </div>
          <span className="px-2.5 py-0.5 bg-[#fff0dc] text-[#73501b] rounded text-[11px] font-bold">
            {categoryBreakdown.length} CATEGORIES
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#eee2dc] bg-[#fffaf5] text-[#68647a]">
                <th className="py-2.5 px-3 font-semibold">Category</th>
                <th className="py-2.5 px-3 font-semibold text-right">Items Sold</th>
                <th className="py-2.5 px-3 font-semibold text-right">Fine Weight (g)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Metal Value</th>
                <th className="py-2.5 px-3 font-semibold text-right">Making Charges</th>
                <th className="py-2.5 px-3 font-semibold text-right">Taxable Turnover</th>
                <th className="py-2.5 px-3 font-semibold text-right">Gross Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee2dc]">
              {categoryBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-[#68647a]">
                    No sales recorded for the selected criteria.
                  </td>
                </tr>
              ) : (
                categoryBreakdown.map((cat) => (
                  <tr key={cat.category} className="hover:bg-[#fffdfb]">
                    <td className="py-2.5 px-3 font-medium text-[#542047]">{cat.category}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{cat.itemCount}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{cat.netWeightGrams}g</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatInr(cat.metalValue)}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatInr(cat.makingCharges)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">{formatInr(cat.taxableAmount)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#542047]">
                      {formatInr(cat.totalAmount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Sales Trend Table */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-serif font-bold text-[#542047]">
              Day-End Sales Register
            </h3>
            <p className="text-xs text-[#68647a]">
              Chronological daily breakdown of bills, taxable sales, and collections
            </p>
          </div>
          <span className="px-2.5 py-0.5 bg-[#f1e8f0] text-[#70526d] rounded text-[11px] font-bold">
            {dailyTrend.length} TRADING DAYS
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#eee2dc] bg-[#fffaf5] text-[#68647a]">
                <th className="py-2.5 px-3 font-semibold">Date</th>
                <th className="py-2.5 px-3 font-semibold text-right">Invoices Raised</th>
                <th className="py-2.5 px-3 font-semibold text-right">Taxable Turnover</th>
                <th className="py-2.5 px-3 font-semibold text-right">GST Collected</th>
                <th className="py-2.5 px-3 font-semibold text-right">Gross Sales</th>
                <th className="py-2.5 px-3 font-semibold text-right">Collections</th>
                <th className="py-2.5 px-3 font-semibold text-right">Balance Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee2dc]">
              {dailyTrend.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-[#68647a]">
                    No sales recorded for this period.
                  </td>
                </tr>
              ) : (
                dailyTrend.map((day) => (
                  <tr key={day.date} className="hover:bg-[#fffdfb]">
                    <td className="py-2.5 px-3 font-medium text-[#542047]">{day.date}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">{day.invoiceCount}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatInr(day.taxableAmount)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#246743]">{formatInr(day.taxAmount)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#542047]">
                      {formatInr(day.grossSales)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#246743]">{formatInr(day.paidAmount)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#b93657]">{formatInr(day.balanceAmount)}</td>
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
