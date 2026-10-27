'use client';

import React from 'react';
import { ProfitAndLossReport } from '@/lib/reports';
import { formatInr } from '@/lib/indicative-pricing';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Receipt,
  Layers,
  Percent,
  Clock,
  Info,
  DollarSign,
  PackageX,
  CheckCircle2,
  ShieldAlert,
  FileWarning,
} from 'lucide-react';

interface ProfitAndLossViewProps {
  report: ProfitAndLossReport;
}

export function ProfitAndLossView({ report }: ProfitAndLossViewProps) {
  const {
    filters,
    operatingRevenue,
    costOfGoodsSold,
    grossProfit,
    operatingExpenses,
    netProfitOrLoss,
    summary,
    anomalies = [],
    ledgerCommencementDate,
    cogsNotice,
    generalNotice,
  } = report;

  const isSuitable = summary?.isSuitableForReliance ?? !costOfGoodsSold.isEstimatedOrMissing;

  return (
    <div className="space-y-6">
      {/* Status Badges Strip */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#a3e3b5] bg-[#f4fcf6] text-[#246743] text-xs font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Ledger Equilibrium: Verified Vouchers</span>
        </div>

        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
            costOfGoodsSold.isEstimatedOrMissing
              ? 'bg-[#fffbeb] border-[#fde68a] text-[#92400e]'
              : 'bg-[#f4fcf6] border-[#a3e3b5] text-[#246743]'
          }`}
        >
          {costOfGoodsSold.isEstimatedOrMissing ? (
            <FileWarning className="w-3.5 h-3.5 text-[#d97706]" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#246743]" />
          )}
          <span>
            Cost Completeness:{' '}
            {costOfGoodsSold.isEstimatedOrMissing ? 'Wholesale Cost Unposted' : 'Posted Inventory Costs'}
          </span>
        </div>

        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
            isSuitable
              ? 'bg-[#f4fcf6] border-[#a3e3b5] text-[#246743]'
              : 'bg-[#fffbeb] border-[#fde68a] text-[#92400e]'
          }`}
        >
          {isSuitable ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#246743]" />
          ) : (
            <ShieldAlert className="w-3.5 h-3.5 text-[#d97706]" />
          )}
          <span>
            Reliance Status:{' '}
            {isSuitable ? 'Audited Earnings' : 'Internal Management Only (Incomplete COGS)'}
          </span>
        </div>

        {ledgerCommencementDate && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#eee2dc] bg-white text-[#68647a] text-xs font-semibold ml-auto">
            <Clock className="w-3.5 h-3.5" />
            <span>Ledger Commencement: {ledgerCommencementDate}</span>
          </div>
        )}
      </div>

      {/* Scope & COGS Limitation Notice Banner */}
      {costOfGoodsSold.isEstimatedOrMissing && (
        <div className="p-4 bg-[#fffbeb] border border-[#fde68a] rounded-2xl flex items-start gap-3 text-xs text-[#92400e]">
          <AlertTriangle className="w-5 h-5 text-[#d97706] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-sm text-[#78350f]">
              Inventory Cost & COGS Notice (Accounting Limitation)
            </span>
            <p className="text-[11px] leading-relaxed text-[#92400e]">{cogsNotice}</p>
          </div>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Net Operating Revenue</span>
            <Receipt className="w-4 h-4 text-[#246743]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#246743] my-1">
            {formatInr(operatingRevenue.totalNetRevenue)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            Gross: {formatInr(operatingRevenue.totalGrossRevenue)} · Discounts: {formatInr(operatingRevenue.totalContraRevenue)}
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Cost of Goods Sold (COGS)</span>
            <PackageX className="w-4 h-4 text-[#d97706]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {costOfGoodsSold.totalCogs !== '0.00' ? formatInr(costOfGoodsSold.totalCogs) : '₹0.00'}
          </div>
          <div className="text-[11px] text-[#b45309] font-medium">
            {costOfGoodsSold.isEstimatedOrMissing ? 'Wholesale cost not posted' : 'Ledger inventory derecognition'}
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Gross Profit</span>
            <Layers className="w-4 h-4 text-[#7b285e]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#7b285e] my-1">
            {formatInr(grossProfit.amount)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            Margin: {grossProfit.percentage}
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Net Result (Ledger)</span>
            {netProfitOrLoss.isProfit ? (
              <TrendingUp className="w-4 h-4 text-[#246743]" />
            ) : (
              <TrendingDown className="w-4 h-4 text-[#e11d48]" />
            )}
          </div>
          <div
            className={`text-2xl font-serif font-bold my-1 ${
              netProfitOrLoss.isProfit ? 'text-[#246743]' : 'text-[#e11d48]'
            }`}
          >
            {formatInr(netProfitOrLoss.amount)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            {netProfitOrLoss.isProfit ? 'Operating Net Profit' : 'Operating Net Loss'}
          </div>
        </div>
      </div>

      {/* Main Multi-Section Income Statement Table */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[#eee2dc] flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#fbf8f5]">
          <div>
            <h2 className="text-sm font-serif font-bold text-[#542047]">
              Statement of Profit and Loss (Income Statement)
            </h2>
            <p className="text-[11px] text-[#68647a]">
              Period: {filters.startDate} to {filters.endDate} · Showroom: {filters.branchName}
            </p>
          </div>
          <div className="text-xs font-semibold text-[#542047]">
            Fiscal Year: {filters.fiscalYear}
          </div>
        </div>

        <div className="divide-y divide-[#eee2dc]/80 text-xs">
          {/* 1. Operating Revenue Section */}
          <div className="p-4 space-y-2">
            <div className="font-bold text-[#542047] uppercase tracking-wider text-[11px] mb-2">
              1. Operating Revenue
            </div>
            {operatingRevenue.items.map((item) => (
              <div key={item.code} className="flex items-center justify-between py-1 text-[#68647a]">
                <span className="font-mono text-xs">{item.code} · {item.name}</span>
                <span className="font-mono font-medium text-[#542047]">{formatInr(item.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-dashed border-[#eee2dc] font-semibold text-[#542047]">
              <span>Total Gross Revenue</span>
              <span className="font-mono">{formatInr(operatingRevenue.totalGrossRevenue)}</span>
            </div>

            {/* Contra-Revenue items */}
            {operatingRevenue.contraItems.length > 0 && (
              <div className="pt-2 space-y-1.5">
                <div className="text-[11px] font-semibold text-[#991b1b]">
                  Less: Contra-Revenue & Discounts
                </div>
                {operatingRevenue.contraItems.map((c) => (
                  <div key={c.code} className="flex items-center justify-between py-0.5 text-[#991b1b]/80 pl-4">
                    <span className="font-mono text-xs">{c.code} · {c.name}</span>
                    <span className="font-mono font-medium">({formatInr(c.amount)})</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1 font-semibold text-[#991b1b]">
                  <span>Total Deductions & Discounts</span>
                  <span className="font-mono">({formatInr(operatingRevenue.totalContraRevenue)})</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-[#eee2dc] font-bold text-sm text-[#246743]">
              <span>Net Operating Revenue</span>
              <span className="font-mono">{formatInr(operatingRevenue.totalNetRevenue)}</span>
            </div>
          </div>

          {/* 2. Cost of Goods Sold Section */}
          <div className="p-4 space-y-2 bg-[#fcfaf7]">
            <div className="font-bold text-[#542047] uppercase tracking-wider text-[11px] mb-2">
              2. Cost of Goods Sold (COGS)
            </div>
            {costOfGoodsSold.items.map((item) => (
              <div key={item.code} className="flex items-center justify-between py-1 text-[#68647a]">
                <span className="font-mono text-xs">{item.code} · {item.name}</span>
                <span className="font-mono font-medium text-[#542047]">{formatInr(item.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1 font-semibold text-[#542047]">
              <span>Total Cost of Goods Sold</span>
              <span className="font-mono">{formatInr(costOfGoodsSold.totalCogs)}</span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#eee2dc] font-bold text-sm text-[#7b285e]">
              <span>Gross Profit (Revenue - COGS)</span>
              <span className="font-mono">{formatInr(grossProfit.amount)}</span>
            </div>
          </div>

          {/* 3. Operating Expenses Section */}
          <div className="p-4 space-y-2">
            <div className="font-bold text-[#542047] uppercase tracking-wider text-[11px] mb-2">
              3. Operating & Administrative Expenses
            </div>
            {operatingExpenses.items.map((item) => (
              <div key={item.code} className="flex items-center justify-between py-1 text-[#68647a]">
                <span className="font-mono text-xs">{item.code} · {item.name}</span>
                <span className="font-mono font-medium text-[#542047]">{formatInr(item.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-[#eee2dc] font-semibold text-[#542047]">
              <span>Total Operating Expenses</span>
              <span className="font-mono">{formatInr(operatingExpenses.totalOperatingExpenses)}</span>
            </div>
          </div>

          {/* 4. Bottom Line: Net Profit or Loss */}
          <div className="p-4 bg-[#fbf8f5] flex items-center justify-between font-bold text-base border-t-2 border-[#542047]">
            <span className="text-[#542047]">
              Net Operating Result ({netProfitOrLoss.isProfit ? 'Profit' : 'Loss'})
            </span>
            <span
              className={`font-mono ${
                netProfitOrLoss.isProfit ? 'text-[#246743]' : 'text-[#e11d48]'
              }`}
            >
              {formatInr(netProfitOrLoss.amount)}
            </span>
          </div>
        </div>
      </div>

      {/* General Disclosure */}
      <div className="p-4 bg-[#fbf8f5] border border-[#eee2dc] rounded-2xl flex items-start gap-3 text-xs text-[#68647a]">
        <Info className="w-4 h-4 text-[#d49a24] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-[#542047]">Revenue Recognition Policy</p>
          <p className="text-[11px] leading-relaxed">{generalNotice}</p>
        </div>
      </div>
    </div>
  );
}
