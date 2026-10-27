'use client';

import React from 'react';
import { PaymentCollectionsReport } from '@/lib/reports';
import { formatInr } from '@/lib/indicative-pricing';
import { CreditCard, Wallet, Building2, CheckCircle2, AlertCircle, ArrowDownRight } from 'lucide-react';

interface PaymentCollectionsViewProps {
  report: PaymentCollectionsReport;
}

export function PaymentCollectionsView({ report }: PaymentCollectionsViewProps) {
  const { totals, settlementTotals, methodBreakdown, collections, settlements, filters } = report;

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Total Collections</span>
            <Wallet className="w-4 h-4 text-[#246743]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#246743] my-1">
            {formatInr(totals.totalCollected)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            {totals.paymentCount} tender transactions recorded
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Cash Tender Received</span>
            <Wallet className="w-4 h-4 text-[#d49a24]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#542047] my-1">
            {formatInr(totals.cashCollected)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            Physical drawer cash received
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Digital / Electronic</span>
            <CreditCard className="w-4 h-4 text-[#7b285e]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#7b285e] my-1">
            {formatInr(totals.digitalCollected)}
          </div>
          <div className="text-[11px] text-[#68647a]">
            UPI, POS card terminals & NEFT/IMPS
          </div>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#68647a]">
            <span>Cumulative Outstanding Receivables (All Time)</span>
            <AlertCircle className="w-4 h-4 text-[#b93657]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#b93657] my-1">
            {formatInr(totals.outstandingReceivables)}
          </div>
          <div className="text-[11px] text-[#82510b] font-medium">
            All-time unpaid ledger balance; date filter applies to collections above
          </div>
        </div>
      </div>

      {/* Tender Method Breakdown */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-5 shadow-xs">
        <h3 className="text-sm font-serif font-bold text-[#542047] mb-3">
          Tender Collection by Payment Channel
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {methodBreakdown.map((m) => (
            <div key={m.paymentMethod} className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs">
              <div className="flex items-center justify-between text-[#68647a] mb-1">
                <span className="font-semibold text-[#542047]">{m.paymentMethod}</span>
                <span className="font-mono text-[10px] text-[#246743] font-bold">{m.percentage}</span>
              </div>
              <span className="text-base font-bold text-[#542047] block">
                {formatInr(m.totalAmount)}
              </span>
              <span className="text-[10px] text-[#68647a] block mt-0.5">
                {m.count} payments
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Customer Payment Collections Register */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-serif font-bold text-[#542047]">
              Customer Collections Register
            </h3>
            <p className="text-xs text-[#68647a]">
              Individual customer tenders recorded at checkout and receivable receipts
            </p>
          </div>
          <span className="px-2.5 py-0.5 bg-[#e2f6e8] text-[#246743] rounded text-[11px] font-bold">
            {collections.length} COLLECTIONS
          </span>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#fffaf5] border-b border-[#eee2dc]">
              <tr className="text-[#68647a]">
                <th className="py-2.5 px-3 font-semibold">Payment Date</th>
                <th className="py-2.5 px-3 font-semibold">Method</th>
                <th className="py-2.5 px-3 font-semibold">Reference</th>
                <th className="py-2.5 px-3 font-semibold">Invoice #</th>
                <th className="py-2.5 px-3 font-semibold">Customer</th>
                <th className="py-2.5 px-3 font-semibold">Branch</th>
                <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee2dc]">
              {collections.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-[#68647a]">
                    No collections recorded for the selected criteria.
                  </td>
                </tr>
              ) : (
                collections.map((col) => (
                  <tr key={col.id} className="hover:bg-[#fffdfb]">
                    <td className="py-2.5 px-3 font-medium text-[#25203a] whitespace-nowrap">{col.paymentDate}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 bg-[#fff0dc] text-[#73501b] font-bold rounded text-[10px]">
                        {col.paymentMethod}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#68647a]">{col.transactionRef || '-'}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[#542047]">{col.invoiceNumber}</td>
                    <td className="py-2.5 px-3 text-[#25203a]">{col.customerName}</td>
                    <td className="py-2.5 px-3 text-[#68647a]">{col.branchName}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#246743]">
                      {formatInr(col.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SEPARATE Bank Settlement View Section */}
      <div className="bg-white border-2 border-[#f1d6b0] rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-[#fff0dc] text-[#82510b] font-bold text-[10px] rounded uppercase">
                Bank Reconciliation Ledger
              </span>
              <span className="text-xs font-semibold text-[#68647a]">Asset Realization Layer</span>
            </div>
            <h3 className="text-base font-serif font-bold text-[#542047]">
              Bank Settlements & Merchant Clearing Realization
            </h3>
            <p className="text-xs text-[#68647a]">
              Cleared bank deposits and merchant discount fee (MDR) deductions reconciled via statement imports
            </p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <span className="text-[10px] text-[#68647a] block">Net Bank Deposits</span>
              <span className="text-lg font-bold text-[#246743] font-mono">
                {formatInr(settlementTotals.totalSettledNet)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[#68647a] block">MDR Fees Deducted</span>
              <span className="text-lg font-bold text-[#b93657] font-mono">
                {formatInr(settlementTotals.totalSettlementFees)}
              </span>
            </div>
          </div>
        </div>

        {/* Informational Accounting Disclosure Alert */}
        <div className="p-3 bg-[#fffaf5] border border-[#f1d394] rounded-xl text-xs text-[#73501b] mb-4 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#d49a24] shrink-0 mt-0.5" />
          <p>
            <strong>Accounting Invariant:</strong> Bank settlements represent electronic funds cleared and deposited
            into business operating bank accounts (Debit Account 1040) relieving tender clearing accounts (Credit Account 1020/1030).
            They are an <em>internal asset transfer</em> and must <strong>never</strong> be counted as additional customer sales or collections.
          </p>
        </div>

        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#fffaf5] border-b border-[#eee2dc]">
              <tr className="text-[#68647a]">
                <th className="py-2.5 px-3 font-semibold">Value Date</th>
                <th className="py-2.5 px-3 font-semibold">Bank Account</th>
                <th className="py-2.5 px-3 font-semibold">Reference</th>
                <th className="py-2.5 px-3 font-semibold">Journal #</th>
                <th className="py-2.5 px-3 font-semibold text-right">MDR Fee</th>
                <th className="py-2.5 px-3 font-semibold text-right">Net Deposit</th>
                <th className="py-2.5 px-3 font-semibold text-right">Gross Cleared</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee2dc]">
              {settlements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-[#68647a]">
                    No settled statement lines recorded for this period.
                  </td>
                </tr>
              ) : (
                settlements.map((s) => (
                  <tr key={s.id} className="hover:bg-[#fffdfb]">
                    <td className="py-2.5 px-3 font-medium text-[#25203a] whitespace-nowrap">{s.transactionDate}</td>
                    <td className="py-2.5 px-3 text-[#542047]">
                      {s.bankName} <span className="text-[10px] text-[#68647a]">({s.accountNumber})</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#68647a]">{s.referenceNumber || '-'}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[#542047]">{s.settlementJournalNumber}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#b93657]">{formatInr(s.feeAmount)}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#246743]">
                      {formatInr(s.depositAmount)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[#68647a]">{formatInr(s.grossAmount)}</td>
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
