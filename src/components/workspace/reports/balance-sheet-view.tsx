'use client';

import React from 'react';
import { BalanceSheetReport } from '@/lib/reports';
import { formatInr } from '@/lib/indicative-pricing';
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Clock,
  Info,
  Layers,
  ShieldAlert,
  FileWarning,
  HelpCircle,
} from 'lucide-react';

interface BalanceSheetViewProps {
  report: BalanceSheetReport;
}

export function BalanceSheetView({ report }: BalanceSheetViewProps) {
  const {
    filters,
    assets,
    liabilities,
    equity,
    summary,
    anomalies = [],
    ledgerCommencementDate,
    completenessNotice,
  } = report;

  const hasCriticalAnomaly = anomalies.some((a) => a.severity === 'CRITICAL');
  const hasWarningAnomaly = anomalies.some((a) => a.severity === 'WARNING');

  return (
    <div className="space-y-6">
      {/* 1. Dual Status Badges Strip */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Mathematical Equilibrium Badge */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
            summary.isBalanced
              ? 'bg-[#f4fcf6] border-[#a3e3b5] text-[#246743]'
              : 'bg-[#fff1f2] border-[#fecdd3] text-[#e11d48]'
          }`}
        >
          {summary.isBalanced ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#246743]" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-[#e11d48]" />
          )}
          <span>
            Mathematical Equation: {summary.isBalanced ? 'Equilibrium (Diff: ₹0.00)' : `Discrepancy (₹${summary.discrepancy})`}
          </span>
        </div>

        {/* Financial Statement Completeness Badge */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
            summary.isComplete
              ? 'bg-[#f4fcf6] border-[#a3e3b5] text-[#246743]'
              : 'bg-[#fffbeb] border-[#fde68a] text-[#92400e]'
          }`}
        >
          {summary.isComplete ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#246743]" />
          ) : (
            <FileWarning className="w-3.5 h-3.5 text-[#d97706]" />
          )}
          <span>
            Ledger Completeness:{' '}
            {summary.isComplete
              ? 'Complete Historical Coverage'
              : `Incomplete Records (${anomalies.length} anomaly detected)`}
          </span>
        </div>

        {/* Statutory Reliance Suitability Badge */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
            summary.isSuitableForReliance
              ? 'bg-[#f4fcf6] border-[#a3e3b5] text-[#246743]'
              : 'bg-[#fff1f2] border-[#fecdd3] text-[#9f1239]'
          }`}
        >
          {summary.isSuitableForReliance ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#246743]" />
          ) : (
            <ShieldAlert className="w-3.5 h-3.5 text-[#e11d48]" />
          )}
          <span>
            Statutory Reliance:{' '}
            {summary.isSuitableForReliance
              ? 'Suitable for Financial Reliance'
              : 'NOT Suitable for Statutory / Tax Reliance'}
          </span>
        </div>

        {ledgerCommencementDate && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#eee2dc] bg-white text-[#68647a] text-xs font-semibold ml-auto">
            <Clock className="w-3.5 h-3.5" />
            <span>Ledger Commencement: {ledgerCommencementDate}</span>
          </div>
        )}
      </div>

      {/* 2. Primary Equilibrium & Integrity Notice Banner */}
      <div
        className={`p-4 rounded-2xl border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
          !summary.isBalanced
            ? 'bg-[#fff1f2] border-[#fecdd3] text-[#9f1239]'
            : !summary.isSuitableForReliance
            ? 'bg-[#fffbeb] border-[#fde68a] text-[#78350f]'
            : 'bg-[#f4fcf6] border-[#a3e3b5] text-[#246743]'
        }`}
      >
        <div className="flex items-start gap-3">
          {!summary.isBalanced ? (
            <AlertTriangle className="w-5 h-5 text-[#e11d48] shrink-0 mt-0.5" />
          ) : !summary.isSuitableForReliance ? (
            <ShieldAlert className="w-5 h-5 text-[#d97706] shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-[#246743] shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="font-bold text-sm">
              {!summary.isBalanced
                ? 'Balance Sheet Discrepancy Detected'
                : !summary.isSuitableForReliance
                ? 'Balance Sheet Equation in Equilibrium (Assets = Liabilities + Equity) · Historical Data Incomplete'
                : 'Balance Sheet Equation in Equilibrium (Assets = Liabilities + Equity)'}
            </div>
            <p className="text-[11px] leading-relaxed opacity-90">{completenessNotice}</p>
          </div>
        </div>
      </div>

      {/* 3. Integrity Anomalies & Audit Reconciliation Details Card (If Anomalies Detected) */}
      {anomalies.length > 0 && (
        <div className="bg-[#fffdf9] border-2 border-[#f59e0b]/30 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#fde68a] pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#d97706]" />
              <h3 className="font-serif font-bold text-sm text-[#78350f]">
                Financial Statement Integrity Anomalies ({anomalies.length})
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-[#b45309] bg-[#fef3c7] px-2.5 py-1 rounded-lg">
              Reconciliation Required Prior to External Reliance
            </span>
          </div>

          <div className="space-y-3">
            {anomalies.map((anomaly, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                  anomaly.severity === 'CRITICAL'
                    ? 'bg-[#fff1f2]/60 border-[#fecdd3] text-[#881337]'
                    : 'bg-[#fffbeb]/60 border-[#fde68a] text-[#78350f]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide ${
                        anomaly.severity === 'CRITICAL'
                          ? 'bg-[#e11d48] text-white'
                          : 'bg-[#d97706] text-white'
                      }`}
                    >
                      {anomaly.severity}
                    </span>
                    <span className="font-bold font-mono text-xs">
                      {anomaly.accountCode ? `${anomaly.accountCode} · ` : ''}
                      {anomaly.accountName ?? anomaly.type}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-sm">
                    {formatInr(anomaly.amount)}
                  </span>
                </div>

                <p className="text-[11px] leading-relaxed">
                  <strong className="font-semibold">Root Cause: </strong>
                  {anomaly.explanation}
                </p>

                <div className="pt-1.5 border-t border-current/15 flex items-start gap-1.5 text-[11px]">
                  <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-current/70" />
                  <span>
                    <strong className="font-semibold">Reconciliation Action: </strong>
                    {anomaly.reconciliationAction}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Total Assets</span>
            <Building2 className="w-4 h-4 text-[#246743]" />
          </div>
          <div
            className={`text-2xl font-serif font-bold my-1 ${
              Number(assets.totalAssets) < 0 ? 'text-[#e11d48]' : 'text-[#246743]'
            }`}
          >
            {formatInr(assets.totalAssets)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            Cash, clearing, receivables & stock
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Total Liabilities</span>
            <Layers className="w-4 h-4 text-[#92400e]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#92400e] my-1">
            {formatInr(liabilities.totalLiabilities)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            GST payables & customer advances
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Total Equity</span>
            <Scale className="w-4 h-4 text-[#5b21b6]" />
          </div>
          <div
            className={`text-2xl font-serif font-bold my-1 ${
              Number(equity.totalEquity) < 0 ? 'text-[#e11d48]' : 'text-[#5b21b6]'
            }`}
          >
            {formatInr(equity.totalEquity)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            Base: {formatInr(equity.totalRecordedEquity)} · P&L: {formatInr(equity.currentPeriodRetainedEarnings)}
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Balance Discrepancy</span>
            {summary.isBalanced ? (
              <CheckCircle2 className="w-4 h-4 text-[#246743]" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-[#e11d48]" />
            )}
          </div>
          <div
            className={`text-2xl font-serif font-bold my-1 ${
              summary.isBalanced ? 'text-[#246743]' : 'text-[#e11d48]'
            }`}
          >
            {formatInr(summary.discrepancy)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            {summary.isBalanced ? 'Equilibrium verified' : 'Assets ≠ Liabilities + Equity'}
          </div>
        </div>
      </div>

      {/* 5. Two-Column Side-by-Side Financial Statement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: ASSETS */}
        <div className="bg-white border border-[#eee2dc] rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-[#eee2dc] bg-[#fbf8f5] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-serif font-bold text-[#542047]">
                Assets (Application of Funds)
              </h2>
              <p className="text-[11px] text-[#68647a]">
                Balances as of {filters.asOfDate}
              </p>
            </div>
            <span
              className={`text-xs font-bold font-mono ${
                Number(assets.totalAssets) < 0 ? 'text-[#e11d48]' : 'text-[#246743]'
              }`}
            >
              {formatInr(assets.totalAssets)}
            </span>
          </div>

          <div className="p-4 space-y-2 text-xs">
            <div className="font-bold text-[#542047] uppercase tracking-wider text-[11px] mb-2">
              Current & Liquid Assets
            </div>
            {assets.currentAssets.map((item) => {
              const isNegative = item.amount.startsWith('-') || Number(item.amount) < 0;
              return (
                <div
                  key={item.code}
                  className="flex items-center justify-between py-1.5 border-b border-[#eee2dc]/50 last:border-b-0 text-[#68647a]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{item.code} · {item.name}</span>
                    {isNegative && (
                      <span className="px-1.5 py-0.5 bg-[#fff1f2] border border-[#fecdd3] text-[#e11d48] text-[9px] font-bold rounded">
                        Abnormal Credit Balance
                      </span>
                    )}
                  </div>
                  <span
                    className={`font-mono font-medium ${
                      isNegative ? 'text-[#e11d48] font-bold' : 'text-[#542047]'
                    }`}
                  >
                    {formatInr(item.amount)}
                  </span>
                </div>
              );
            })}

            <div className="pt-3 border-t-2 border-[#542047] flex items-center justify-between font-bold text-sm text-[#246743]">
              <span>Total Assets</span>
              <span className={`font-mono ${Number(assets.totalAssets) < 0 ? 'text-[#e11d48]' : ''}`}>
                {formatInr(assets.totalAssets)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: LIABILITIES & EQUITY */}
        <div className="space-y-6">
          {/* Liabilities Box */}
          <div className="bg-white border border-[#eee2dc] rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-[#eee2dc] bg-[#fbf8f5] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-serif font-bold text-[#542047]">
                  Liabilities (External Obligations)
                </h2>
                <p className="text-[11px] text-[#68647a]">
                  Balances as of {filters.asOfDate}
                </p>
              </div>
              <span className="text-xs font-bold text-[#92400e] font-mono">
                {formatInr(liabilities.totalLiabilities)}
              </span>
            </div>

            <div className="p-4 space-y-2 text-xs">
              <div className="font-bold text-[#542047] uppercase tracking-wider text-[11px] mb-2">
                Current Liabilities & Duties
              </div>
              {liabilities.currentLiabilities.map((item) => {
                const isNegative = item.amount.startsWith('-') || Number(item.amount) < 0;
                return (
                  <div
                    key={item.code}
                    className="flex items-center justify-between py-1.5 border-b border-[#eee2dc]/50 last:border-b-0 text-[#68647a]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{item.code} · {item.name}</span>
                      {isNegative && (
                        <span className="px-1.5 py-0.5 bg-[#fff1f2] border border-[#fecdd3] text-[#e11d48] text-[9px] font-bold rounded">
                          Abnormal Debit Balance
                        </span>
                      )}
                    </div>
                    <span
                      className={`font-mono font-medium ${
                        isNegative ? 'text-[#e11d48] font-bold' : 'text-[#542047]'
                      }`}
                    >
                      {formatInr(item.amount)}
                    </span>
                  </div>
                );
              })}

              <div className="pt-2 border-t border-[#eee2dc] flex items-center justify-between font-semibold text-[#92400e]">
                <span>Total Liabilities</span>
                <span className="font-mono">{formatInr(liabilities.totalLiabilities)}</span>
              </div>
            </div>
          </div>

          {/* Equity Box */}
          <div className="bg-white border border-[#eee2dc] rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-[#eee2dc] bg-[#fbf8f5] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-serif font-bold text-[#542047]">
                  Equity & Retained Earnings
                </h2>
                <p className="text-[11px] text-[#68647a]">
                  Owner Funds & Operating Surplus
                </p>
              </div>
              <span className="text-xs font-bold text-[#5b21b6] font-mono">
                {formatInr(equity.totalEquity)}
              </span>
            </div>

            <div className="p-4 space-y-2 text-xs">
              <div className="font-bold text-[#542047] uppercase tracking-wider text-[11px] mb-2">
                Capital & Retained Surplus
              </div>
              {equity.recordedEquity.map((item) => (
                <div key={item.code} className="flex items-center justify-between py-1 text-[#68647a]">
                  <span className="font-mono text-xs">{item.code} · {item.name}</span>
                  <span className="font-mono font-medium text-[#542047]">{formatInr(item.amount)}</span>
                </div>
              ))}

              <div className="flex items-center justify-between py-1 text-[#5b21b6]">
                <span className="text-xs">Current Period Retained Earnings (P&L)</span>
                <span className="font-mono font-bold">{formatInr(equity.currentPeriodRetainedEarnings)}</span>
              </div>

              <div className="pt-2 border-t border-[#eee2dc] flex items-center justify-between font-semibold text-[#5b21b6]">
                <span>Total Equity</span>
                <span className="font-mono">{formatInr(equity.totalEquity)}</span>
              </div>
            </div>
          </div>

          {/* Grand Total Liabilities & Equity Box */}
          <div className="p-4 bg-[#fbf8f5] border-2 border-[#542047] rounded-2xl flex items-center justify-between font-bold text-sm text-[#542047]">
            <span>Total Liabilities & Equity</span>
            <span className="font-mono">{formatInr(summary.totalLiabilitiesAndEquity)}</span>
          </div>
        </div>
      </div>

      {/* 6. Statutory Disclaimers */}
      <div className="p-4 bg-[#fbf8f5] border border-[#eee2dc] rounded-2xl flex items-start gap-3 text-xs text-[#68647a]">
        <Info className="w-4 h-4 text-[#d49a24] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-[#542047]">Statutory Accounting Notice & Incomplete Ledger Disclosure</p>
          <p className="text-[11px] leading-relaxed">
            This Balance Sheet is generated directly from posted general ledger vouchers. Historic owner capital contributions, wholesale jewellery inventory cost baselines, and unpaid trade payables pre-dating ledger activation ({ledgerCommencementDate ?? 'N/A'}) are not represented. Any abnormal account balance (e.g. Accounts Receivable credit balance) stems from customer payments entered without corresponding sales invoice debits. This report is for internal operational management, not for statutory, banking, or tax filing reliance without reconciliation.
          </p>
        </div>
      </div>
    </div>
  );
}
