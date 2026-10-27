'use client';

import React from 'react';
import { TrialBalanceReport } from '@/lib/reports';
import { formatInr } from '@/lib/indicative-pricing';
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Clock,
  Info,
  ShieldAlert,
  FileWarning,
  HelpCircle,
} from 'lucide-react';

interface TrialBalanceViewProps {
  report: TrialBalanceReport;
}

export function TrialBalanceView({ report }: TrialBalanceViewProps) {
  const {
    totals,
    accounts,
    filters,
    anomalies = [],
    ledgerCommencementDate,
    integrityNotice,
    discrepancyNotice,
  } = report;

  const isSuitable = totals.isSuitableForReliance ?? (totals.isBalanced && anomalies.length === 0);

  const getClassificationBadge = (classification: string) => {
    switch (classification) {
      case 'ASSET':
        return <span className="px-2 py-0.5 bg-[#e2f6e8] text-[#246743] rounded text-[10px] font-bold">ASSET</span>;
      case 'LIABILITY':
        return <span className="px-2 py-0.5 bg-[#fef3c7] text-[#92400e] rounded text-[10px] font-bold">LIABILITY</span>;
      case 'EQUITY':
        return <span className="px-2 py-0.5 bg-[#ede9fe] text-[#5b21b6] rounded text-[10px] font-bold">EQUITY</span>;
      case 'REVENUE':
        return <span className="px-2 py-0.5 bg-[#e0f2fe] text-[#0369a1] rounded text-[10px] font-bold">REVENUE</span>;
      case 'EXPENSE':
        return <span className="px-2 py-0.5 bg-[#fee2e2] text-[#991b1b] rounded text-[10px] font-bold">EXPENSE</span>;
      default:
        return <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px] font-bold">{classification}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Status Badges Strip */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
            totals.isBalanced
              ? 'bg-[#f4fcf6] border-[#a3e3b5] text-[#246743]'
              : 'bg-[#fff1f2] border-[#fecdd3] text-[#e11d48]'
          }`}
        >
          {totals.isBalanced ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#246743]" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-[#e11d48]" />
          )}
          <span>
            Arithmetical Equation: {totals.isBalanced ? 'Balanced (Debits = Credits)' : `Discrepancy (₹${totals.difference})`}
          </span>
        </div>

        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
            anomalies.length === 0
              ? 'bg-[#f4fcf6] border-[#a3e3b5] text-[#246743]'
              : 'bg-[#fffbeb] border-[#fde68a] text-[#92400e]'
          }`}
        >
          {anomalies.length === 0 ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#246743]" />
          ) : (
            <FileWarning className="w-3.5 h-3.5 text-[#d97706]" />
          )}
          <span>
            Account Coverage: {anomalies.length === 0 ? 'Normal Balances' : `${anomalies.length} Abnormal Account Detected`}
          </span>
        </div>

        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
            isSuitable
              ? 'bg-[#f4fcf6] border-[#a3e3b5] text-[#246743]'
              : 'bg-[#fff1f2] border-[#fecdd3] text-[#9f1239]'
          }`}
        >
          {isSuitable ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#246743]" />
          ) : (
            <ShieldAlert className="w-3.5 h-3.5 text-[#e11d48]" />
          )}
          <span>
            Statutory Reliance: {isSuitable ? 'Audited Baseline' : 'Internal Management Only'}
          </span>
        </div>

        {ledgerCommencementDate && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#eee2dc] bg-white text-[#68647a] text-xs font-semibold ml-auto">
            <Clock className="w-3.5 h-3.5" />
            <span>Ledger Commencement: {ledgerCommencementDate}</span>
          </div>
        )}
      </div>

      {/* 2. Integrity & Balance Status Alert Banner */}
      <div
        className={`p-4 rounded-2xl border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
          !totals.isBalanced
            ? 'bg-[#fff1f2] border-[#fecdd3] text-[#9f1239]'
            : anomalies.length > 0
            ? 'bg-[#fffbeb] border-[#fde68a] text-[#78350f]'
            : 'bg-[#f4fcf6] border-[#a3e3b5] text-[#246743]'
        }`}
      >
        <div className="flex items-start gap-3">
          {!totals.isBalanced ? (
            <AlertTriangle className="w-5 h-5 text-[#e11d48] shrink-0 mt-0.5" />
          ) : anomalies.length > 0 ? (
            <ShieldAlert className="w-5 h-5 text-[#d97706] shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-[#246743] shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="font-bold text-sm">
              {!totals.isBalanced
                ? 'Trial Balance Discrepancy Detected'
                : 'Trial Balance is Balanced (Debits = Credits)'}
            </div>
            <p className="text-[11px] leading-relaxed opacity-90">{integrityNotice}</p>
            {discrepancyNotice && (
              <p className="font-bold text-[#e11d48]">{discrepancyNotice}</p>
            )}
          </div>
        </div>
      </div>

      {/* 3. Anomalies Card (if present) */}
      {anomalies.length > 0 && (
        <div className="bg-[#fffdf9] border-2 border-[#f59e0b]/30 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#fde68a] pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#d97706]" />
              <h3 className="font-serif font-bold text-sm text-[#78350f]">
                Trial Balance Account Anomalies ({anomalies.length})
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-[#b45309] bg-[#fef3c7] px-2.5 py-1 rounded-lg">
              Historical Ledger Reconciliation Required
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

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Total Debit Balances</span>
            <Scale className="w-4 h-4 text-[#7b285e]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {formatInr(totals.totalDebitBalance)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            Cumulative as of {filters.asOfDate}
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Total Credit Balances</span>
            <Scale className="w-4 h-4 text-[#d49a24]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#7b285e] my-1">
            {formatInr(totals.totalCreditBalance)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            Cumulative as of {filters.asOfDate}
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Trial Balance Difference</span>
            {totals.isBalanced ? (
              <CheckCircle2 className="w-4 h-4 text-[#246743]" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-[#e11d48]" />
            )}
          </div>
          <div
            className={`text-2xl font-serif font-bold my-1 ${
              totals.isBalanced ? 'text-[#246743]' : 'text-[#e11d48]'
            }`}
          >
            {formatInr(totals.difference)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            {totals.isBalanced ? 'Zero variance (In equilibrium)' : 'Out-of-balance difference'}
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Active Chart of Accounts</span>
            <BookOpen className="w-4 h-4 text-[#542047]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {totals.activeAccountsCount}
          </div>
          <div className="text-[11px] text-[#68647a]">
            {accounts.length} total defined accounts
          </div>
        </div>
      </div>

      {/* Trial Balance Main Account Table */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[#eee2dc] flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#fbf8f5]">
          <div>
            <h2 className="text-sm font-serif font-bold text-[#542047]">
              General Ledger Trial Balance Register
            </h2>
            <p className="text-[11px] text-[#68647a]">
              Closing balances as of {filters.asOfDate} for {filters.branchName} · Period activity ({filters.startDate} to {filters.endDate})
            </p>
          </div>
          <div className="text-xs font-semibold text-[#542047]">
            Fiscal Year: {filters.fiscalYear}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#faf6f2] text-[#68647a] font-semibold border-b border-[#eee2dc]">
              <tr>
                <th className="py-2.5 px-4">Code</th>
                <th className="py-2.5 px-4">Account Name</th>
                <th className="py-2.5 px-4">Classification</th>
                <th className="py-2.5 px-4">Normal</th>
                <th className="py-2.5 px-4 text-right">Period Debit (₹)</th>
                <th className="py-2.5 px-4 text-right">Period Credit (₹)</th>
                <th className="py-2.5 px-4 text-right font-bold text-[#542047]">Debit Balance (₹)</th>
                <th className="py-2.5 px-4 text-right font-bold text-[#542047]">Credit Balance (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee2dc]/60">
              {accounts.map((acct) => {
                const hasBalance = acct.debitBalance !== '0.00' || acct.creditBalance !== '0.00';
                const hasActivity = acct.periodDebit !== '0.00' || acct.periodCredit !== '0.00';
                return (
                  <tr
                    key={acct.id}
                    className={`hover:bg-[#faf6f2]/80 transition ${
                      hasBalance || hasActivity ? 'text-[#542047]' : 'text-[#68647a]/60'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-xs">{acct.code}</td>
                    <td className="py-2.5 px-4 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{acct.name}</span>
                        {(acct.netBalance.startsWith('-') || Number(acct.netBalance) < 0) && (
                          <span className="px-1.5 py-0.5 bg-[#fff1f2] border border-[#fecdd3] text-[#e11d48] text-[9px] font-bold rounded">
                            Abnormal Balance
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">{getClassificationBadge(acct.classification)}</td>
                    <td className="py-2.5 px-4 text-[11px] font-mono">{acct.normalBalance}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-[11px] text-[#68647a]">
                      {acct.periodDebit !== '0.00' ? formatInr(acct.periodDebit) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[11px] text-[#68647a]">
                      {acct.periodCredit !== '0.00' ? formatInr(acct.periodCredit) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-[#542047]">
                      {acct.debitBalance !== '0.00' ? formatInr(acct.debitBalance) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-[#7b285e]">
                      {acct.creditBalance !== '0.00' ? formatInr(acct.creditBalance) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-[#fbf8f5] font-bold border-t-2 border-[#542047] text-[#542047]">
              <tr>
                <td colSpan={4} className="py-3 px-4 text-right uppercase tracking-wider text-[11px]">
                  Total Balances:
                </td>
                <td className="py-3 px-4 text-right font-mono text-[11px] text-[#68647a]">
                  {formatInr(totals.totalPeriodDebit)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-[11px] text-[#68647a]">
                  {formatInr(totals.totalPeriodCredit)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-sm text-[#542047]">
                  {formatInr(totals.totalDebitBalance)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-sm text-[#7b285e]">
                  {formatInr(totals.totalCreditBalance)}
                </td>
              </tr>
              {totals.difference !== '0.00' && (
                <tr className="bg-[#fff1f2] text-[#e11d48] border-t border-[#fecdd3]">
                  <td colSpan={6} className="py-2 px-4 text-right uppercase tracking-wider text-[11px]">
                    Net Discrepancy (Debit - Credit):
                  </td>
                  <td colSpan={2} className="py-2 px-4 text-right font-mono text-sm font-bold">
                    {formatInr(totals.difference)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      {/* Audit & Explanatory Notice */}
      <div className="p-4 bg-[#fbf8f5] border border-[#eee2dc] rounded-2xl flex items-start gap-3 text-xs text-[#68647a]">
        <Info className="w-4 h-4 text-[#d49a24] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-[#542047]">
            Accounting Policy & Historical Scope Disclosure
          </p>
          <p className="text-[11px] leading-relaxed">
            This Trial Balance reflects cumulative closing balances calculated from posted, immutable double-entry journal vouchers as of {filters.asOfDate}. Reversal entries are recorded as independent balancing journal vouchers and net out correctly. Incomplete historical posting or missing opening equity balances do not affect mathematical equilibrium but must be reconciled before statutory balance sheet finalization.
          </p>
        </div>
      </div>
    </div>
  );
}
