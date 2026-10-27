'use client';

import React from 'react';
import { GstSummaryReport } from '@/lib/reports';
import { formatInr } from '@/lib/indicative-pricing';
import { ShieldCheck, AlertTriangle, FileText, Landmark, Percent } from 'lucide-react';

interface GstSummaryViewProps {
  report: GstSummaryReport;
}

export function GstSummaryView({ report }: GstSummaryViewProps) {
  const { totals, rateSchedules, dailySchedule, invoices, statutoryDisclosure, filters } = report;

  return (
    <div className="space-y-6">
      {/* Statutory Disclaimer Alert */}
      <div className="p-4 bg-[#fffaf5] border border-[#f1d394] rounded-2xl flex items-start gap-3 text-xs text-[#73501b]">
        <AlertTriangle className="w-5 h-5 text-[#d49a24] shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-[#542047] mb-0.5">Statutory Filing Disclaimer (GSTR-1 & GSTR-3B)</h4>
          <p className="leading-relaxed">{statutoryDisclosure}</p>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Taxable Turnover</span>
            <FileText className="w-4 h-4 text-[#d49a24]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {formatInr(totals.totalTaxableAmount)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            Base assessable value across {totals.totalInvoices} invoices
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Total GST Liability</span>
            <Landmark className="w-4 h-4 text-[#246743]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#246743] my-1">
            {formatInr(totals.totalTaxLiability)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            3.0% output tax to remit
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>CGST (1.5%) + SGST (1.5%)</span>
            <Percent className="w-4 h-4 text-[#7b285e]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#7b285e] my-1">
            {formatInr(Number(totals.totalCgstAmount) + Number(totals.totalSgstAmount))}
          </div>
          <div className="text-[11px] text-[#68647a]">
            Intra-state sales ({totals.intraStateCount} bills)
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Output IGST (3.0%)</span>
            <Landmark className="w-4 h-4 text-[#542047]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {formatInr(totals.totalIgstAmount)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            Inter-state sales ({totals.interStateCount} bills)
          </div>
        </div>
      </div>

      {/* Tax Rate Schedule (HSN 7113) */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-5 shadow-xs">
        <h3 className="text-sm font-serif font-bold text-[#542047] mb-3">
          HSN Tax Rate Schedule
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#eee2dc] bg-[#fffaf5] text-[#68647a]">
                <th className="py-2.5 px-3 font-semibold">HSN Code</th>
                <th className="py-2.5 px-3 font-semibold">Description</th>
                <th className="py-2.5 px-3 font-semibold text-center">Tax Rate</th>
                <th className="py-2.5 px-3 font-semibold text-right">Taxable Turnover</th>
                <th className="py-2.5 px-3 font-semibold text-right">CGST (1.5%)</th>
                <th className="py-2.5 px-3 font-semibold text-right">SGST (1.5%)</th>
                <th className="py-2.5 px-3 font-semibold text-right">IGST (3.0%)</th>
                <th className="py-2.5 px-3 font-semibold text-right">Total GST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee2dc]">
              {rateSchedules.map((rs) => (
                <tr key={rs.hsnCode} className="hover:bg-[#fffdfb]">
                  <td className="py-2.5 px-3 font-mono font-bold text-[#542047]">{rs.hsnCode}</td>
                  <td className="py-2.5 px-3 text-[#25203a]">{rs.description}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-[#246743]">{rs.ratePercent}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold">{formatInr(rs.taxableAmount)}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{formatInr(rs.cgstAmount)}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{formatInr(rs.sgstAmount)}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{formatInr(rs.igstAmount)}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-[#246743]">
                    {formatInr(rs.totalTax)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice GST Day Register */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-serif font-bold text-[#542047]">
              Outward Supplies Tax Register
            </h3>
            <p className="text-xs text-[#68647a]">
              Detailed invoice breakdown showing place of supply, taxable value, and tax split
            </p>
          </div>
          <span className="px-2.5 py-0.5 bg-[#f1e8f0] text-[#70526d] rounded text-[11px] font-bold">
            {invoices.length} INVOICES
          </span>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#fffaf5] border-b border-[#eee2dc]">
              <tr className="text-[#68647a]">
                <th className="py-2.5 px-3 font-semibold">Invoice #</th>
                <th className="py-2.5 px-3 font-semibold">Date</th>
                <th className="py-2.5 px-3 font-semibold">Customer</th>
                <th className="py-2.5 px-3 font-semibold">POS</th>
                <th className="py-2.5 px-3 font-semibold text-right">Taxable</th>
                <th className="py-2.5 px-3 font-semibold text-right">CGST</th>
                <th className="py-2.5 px-3 font-semibold text-right">SGST</th>
                <th className="py-2.5 px-3 font-semibold text-right">IGST</th>
                <th className="py-2.5 px-3 font-semibold text-right">GST Total</th>
                <th className="py-2.5 px-3 font-semibold text-right">Invoice Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee2dc]">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-[#68647a]">
                    No invoices recorded for this period.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[#fffdfb]">
                    <td className="py-2.5 px-3 font-mono font-bold text-[#542047]">{inv.invoiceNumber}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-[#68647a]">{inv.invoiceDate}</td>
                    <td className="py-2.5 px-3 text-[#25203a]">{inv.customerName}</td>
                    <td className="py-2.5 px-3 text-[11px] text-[#68647a]">{inv.placeOfSupply}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatInr(inv.taxableAmount)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#68647a]">{formatInr(inv.cgstAmount)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#68647a]">{formatInr(inv.sgstAmount)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#68647a]">{formatInr(inv.igstAmount)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#246743]">
                      {formatInr(inv.totalTax)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#542047]">
                      {formatInr(inv.grandTotal)}
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
