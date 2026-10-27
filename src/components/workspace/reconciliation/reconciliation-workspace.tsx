'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  Scale,
  Landmark,
  FileSpreadsheet,
  Upload,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  RotateCcw,
  Eye,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Building,
  CreditCard,
  Ban,
  Check,
} from 'lucide-react';
import {
  getReconciliationSummaryAction,
  getStatementLinesAction,
  listBankAccountsAction,
  listStatementImportsAction,
} from '@/app/actions/reconciliation';
import { AddBankAccountModal, DeactivateBankAccountModal } from './bank-account-modal';
import { StatementImportModal } from './statement-import-modal';
import { MatchingReviewModal } from './matching-review-modal';
import { SettlementModal } from './settlement-modal';
import { StatementLineReconciliationStatus } from '@/lib/reconciliation/matcher';

interface ReconciliationWorkspaceProps {
  user: {
    id: string;
    role: string;
    tenantSlug: string;
    tenantName?: string;
  };
  branches: Array<{ id: string; name: string; code: string }>;
  ledgerAccounts: Array<{ id: string; code: string; name: string }>;
  initialBankAccounts: any[];
  initialSummary: any;
  initialStatementLines: { total: number; lines: any[] };
  initialImports: any[];
}

export const ReconciliationWorkspace: React.FC<ReconciliationWorkspaceProps> = ({
  user,
  branches,
  ledgerAccounts,
  initialBankAccounts,
  initialSummary,
  initialStatementLines,
  initialImports,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'lines' | 'imports' | 'accounts' | 'discrepancies'>('overview');

  // Master Data
  const [bankAccounts, setBankAccounts] = useState<any[]>(initialBankAccounts);
  const [summary, setSummary] = useState<any>(initialSummary);
  const [statementLinesData, setStatementLinesData] = useState<{ total: number; lines: any[] }>(initialStatementLines);
  const [imports, setImports] = useState<any[]>(initialImports);

  // Filters
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [deactivateAccountTarget, setDeactivateAccountTarget] = useState<any | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedLineIdForReview, setSelectedLineIdForReview] = useState<string | null>(null);
  const [settlementModalState, setSettlementModalState] = useState<{
    isOpen: boolean;
    statementLineId: string;
    isSettled: boolean;
  }>({
    isOpen: false,
    statementLineId: '',
    isSettled: false,
  });

  async function refreshData() {
    setLoading(true);
    setError(null);
    try {
      const allStatuses: StatementLineReconciliationStatus[] = [
        'UNMATCHED',
        'PARTIALLY_MATCHED',
        'MATCHED',
        'SETTLED',
        'DISCREPANT',
        'IGNORED',
      ];
      const statuses: StatementLineReconciliationStatus[] =
        statusFilter === 'ALL'
          ? allStatuses
          : [statusFilter as StatementLineReconciliationStatus];

      const [summaryRes, linesRes, accountsRes, importsRes] = await Promise.all([
        getReconciliationSummaryAction({
          bankAccountId: selectedBankAccountId || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
        getStatementLinesAction({
          bankAccountId: selectedBankAccountId || undefined,
          status: statuses,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          search: searchQuery || undefined,
          limit: 50,
        }),
        listBankAccountsAction({ includeInactive: true }),
        listStatementImportsAction({ bankAccountId: selectedBankAccountId || undefined }),
      ]);

      if (summaryRes.success && summaryRes.data) setSummary(summaryRes.data);
      if (linesRes.success && linesRes.data) setStatementLinesData(linesRes.data);
      if (accountsRes.success && accountsRes.data) setBankAccounts(accountsRes.data);
      if (importsRes.success && importsRes.data) setImports(importsRes.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to refresh reconciliation data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshData();
  }, [selectedBankAccountId, statusFilter, startDate, endDate]);

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      refreshData();
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-serif font-bold text-[#d49a24] uppercase tracking-widest flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" />
              Treasury & General Ledger
            </span>
            <span className="px-2 py-0.5 bg-[#f4ead5] border border-[#d49a24]/30 text-[#542047] rounded-md text-[10px] font-bold">
              DOUBLE-ENTRY RECONCILIATION
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-serif font-bold text-[#542047]">
            Bank & Payment Reconciliation
          </h1>
          <p className="text-xs text-[#68647a] max-w-2xl mt-0.5">
            Ingest statement feeds, link customer payments, audit discrepancies, and atomically post balanced settlement journals.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => refreshData()}
            disabled={loading}
            className="p-2 bg-white border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-semibold transition shadow-xs disabled:opacity-50"
            title="Refresh Ledger Feeds"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsAddAccountOpen(true)}
            className="px-3.5 py-2 bg-white border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-[#d49a24]" />
            <span>Add Bank Account</span>
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-4 py-2 bg-[#542047] hover:bg-[#421b48] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
          >
            <Upload className="w-3.5 h-3.5 text-[#d49a24]" />
            <span>Import Statement</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-[#fbe8e8] border border-[#f5b8b8] text-[#b93657] rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Key Metrics Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-semibold text-[#68647a] uppercase tracking-wider block mb-1">
            Total Imported Lines
          </span>
          <span className="text-xl font-serif font-bold text-[#542047] block">
            {summary?.totalLines || 0}
          </span>
          <span className="text-[10px] text-[#68647a] font-mono">
            ₹{summary?.totalDepositAmount || '0.00'} deposits
          </span>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider block mb-1">
            Unmatched Lines
          </span>
          <span className="text-xl font-serif font-bold text-amber-700 block">
            {summary?.unmatchedCount || 0}
          </span>
          <span className="text-[10px] text-[#68647a]">Requires customer match</span>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider block mb-1">
            Partially Matched
          </span>
          <span className="text-xl font-serif font-bold text-blue-700 block">
            {summary?.partiallyMatchedCount || 0}
          </span>
          <span className="text-[10px] text-[#68647a]">Split settlement in progress</span>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block mb-1">
            Matched (Ready)
          </span>
          <span className="text-xl font-serif font-bold text-emerald-700 block">
            {summary?.matchedCount || 0}
          </span>
          <span className="text-[10px] text-emerald-600 font-semibold">Ready for settlement</span>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-semibold text-purple-700 uppercase tracking-wider block mb-1">
            Settled in Ledger
          </span>
          <span className="text-xl font-serif font-bold text-purple-700 block">
            {summary?.settledCount || 0}
          </span>
          <span className="text-[10px] text-[#68647a] font-mono">
            ₹{summary?.totalGrossCleared || '0.00'} gross
          </span>
        </div>

        <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-semibold text-rose-700 uppercase tracking-wider block mb-1">
            Discrepant Queue
          </span>
          <span className="text-xl font-serif font-bold text-rose-700 block">
            {summary?.discrepantCount || 0}
          </span>
          <span className="text-[10px] text-rose-600 font-semibold">Under staff review</span>
        </div>
      </div>

      {/* 3. Global Filter Bar */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Bank Account Selector */}
          <div className="flex items-center gap-1.5">
            <Landmark className="w-3.5 h-3.5 text-[#d49a24]" />
            <select
              value={selectedBankAccountId}
              onChange={(e) => setSelectedBankAccountId(e.target.value)}
              className="text-xs border border-[#eee2dc] rounded-xl px-2.5 py-1.5 focus:border-[#d49a24] focus:outline-hidden text-[#25203a] bg-white"
            >
              <option value="">All Bank & Settlement Accounts</option>
              {bankAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.accountName} ({acc.bankName} - {acc.accountNumberMasked})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-1.5 text-xs text-[#68647a]">
            <span>From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-[#eee2dc] rounded-xl px-2 py-1 text-xs focus:border-[#d49a24] focus:outline-hidden"
            />
            <span>To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-[#eee2dc] rounded-xl px-2 py-1 text-xs focus:border-[#d49a24] focus:outline-hidden"
            />
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="w-3.5 h-3.5 text-[#68647a] absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search narration or UTR..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden"
            />
          </div>
          <button
            onClick={() => refreshData()}
            className="px-3 py-1.5 bg-[#f4ead5] text-[#542047] hover:bg-[#ffe8a8] rounded-xl text-xs font-semibold transition"
          >
            Search
          </button>
        </div>
      </div>

      {/* 4. Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-[#eee2dc] pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-2 rounded-xl transition flex items-center gap-1.5 ${
            activeTab === 'overview'
              ? 'bg-[#542047] text-white shadow-xs'
              : 'text-[#68647a] hover:text-[#542047] hover:bg-black/5'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>Statement Lines & Matching ({statementLinesData.total})</span>
        </button>

        <button
          onClick={() => setActiveTab('discrepancies')}
          className={`px-3 py-2 rounded-xl transition flex items-center gap-1.5 ${
            activeTab === 'discrepancies'
              ? 'bg-[#542047] text-white shadow-xs'
              : 'text-[#68647a] hover:text-[#542047] hover:bg-black/5'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          <span>Discrepancy Queue ({summary?.discrepantCount || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('imports')}
          className={`px-3 py-2 rounded-xl transition flex items-center gap-1.5 ${
            activeTab === 'imports'
              ? 'bg-[#542047] text-white shadow-xs'
              : 'text-[#68647a] hover:text-[#542047] hover:bg-black/5'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Statement Imports ({imports.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('accounts')}
          className={`px-3 py-2 rounded-xl transition flex items-center gap-1.5 ${
            activeTab === 'accounts'
              ? 'bg-[#542047] text-white shadow-xs'
              : 'text-[#68647a] hover:text-[#542047] hover:bg-black/5'
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>Bank Accounts ({bankAccounts.length})</span>
        </button>
      </div>

      {/* 5. Tab Content Panes */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Status Sub-filter pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {['ALL', 'UNMATCHED', 'PARTIALLY_MATCHED', 'MATCHED', 'SETTLED', 'DISCREPANT', 'IGNORED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-lg transition font-semibold text-[11px] ${
                  statusFilter === st
                    ? 'bg-[#d49a24] text-white'
                    : 'bg-white border border-[#eee2dc] text-[#68647a] hover:border-[#d49a24]'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Statement Lines Table */}
          <div className="bg-white border border-[#eee2dc] rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#fffaf5] border-b border-[#eee2dc] text-[#68647a] font-semibold text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Narration / Description</th>
                    <th className="py-2.5 px-4">Reference / UTR</th>
                    <th className="py-2.5 px-4">Bank Account</th>
                    <th className="py-2.5 px-4 text-right">Deposit Amount (₹)</th>
                    <th className="py-2.5 px-4">Allocated (₹)</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee2dc]">
                  {statementLinesData.lines.length > 0 ? (
                    statementLinesData.lines.map((line: any) => {
                      const allocatedSum = line.matches
                        ? line.matches.reduce(
                            (acc: number, m: any) => acc + Number(m.matchedAmount),
                            0
                          )
                        : 0;

                      return (
                        <tr
                          key={line.id}
                          onClick={() => setSelectedLineIdForReview(line.id)}
                          className="hover:bg-[#fffaf5]/50 transition cursor-pointer"
                        >
                          <td className="py-2.5 px-4 font-mono text-[#25203a]">
                            {new Date(line.transactionDate).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-[#25203a] max-w-xs truncate">
                            {line.description}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[#68647a] text-[11px]">
                            {line.referenceNumber || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-[#68647a] truncate max-w-[140px]">
                            {line.bankAccount?.accountName || 'Bank Account'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-serif font-bold text-sm text-[#542047]">
                            ₹{line.amount}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[#25203a]">
                            ₹{allocatedSum.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                line.reconciliationStatus === 'SETTLED'
                                  ? 'bg-purple-100 text-purple-800'
                                  : line.reconciliationStatus === 'MATCHED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : line.reconciliationStatus === 'PARTIALLY_MATCHED'
                                  ? 'bg-amber-100 text-amber-800'
                                  : line.reconciliationStatus === 'DISCREPANT'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-zinc-100 text-zinc-700'
                              }`}
                            >
                              {line.reconciliationStatus}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedLineIdForReview(line.id)}
                                className="px-2.5 py-1 bg-white border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-lg text-[11px] font-semibold transition"
                              >
                                Review
                              </button>
                              {line.reconciliationStatus === 'MATCHED' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSettlementModalState({
                                      isOpen: true,
                                      statementLineId: line.id,
                                      isSettled: false,
                                    })
                                  }
                                  className="px-2.5 py-1 bg-[#542047] text-white hover:bg-[#421b48] rounded-lg text-[11px] font-semibold transition shadow-xs"
                                >
                                  Settle
                                </button>
                              )}
                              {line.reconciliationStatus === 'SETTLED' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSettlementModalState({
                                      isOpen: true,
                                      statementLineId: line.id,
                                      isSettled: true,
                                    })
                                  }
                                  className="px-2 py-1 bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 rounded-lg text-[10px] font-semibold transition"
                                >
                                  Settled
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-xs text-[#68647a]">
                        No statement lines match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Discrepancies Tab */}
      {activeTab === 'discrepancies' && (
        <div className="space-y-4">
          <div className="p-4 bg-[#fffaf5] border border-[#eee2dc] rounded-2xl">
            <h3 className="text-sm font-serif font-bold text-[#542047] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>Unresolved Discrepancies Queue</span>
            </h3>
            <p className="text-xs text-[#68647a] mt-1 leading-relaxed">
              These items contain unexplained differences between customer tenders and statement lines.
              Suvarna server-side rules strictly prevent posting settlements with unexplained variances to preserve double-entry audit standards.
            </p>
          </div>

          <div className="bg-white border border-[#eee2dc] rounded-2xl shadow-xs overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#fffaf5] border-b border-[#eee2dc] text-[#68647a] font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4">Reference</th>
                  <th className="py-2.5 px-4">Bank Account</th>
                  <th className="py-2.5 px-4 text-right">Statement Amount (₹)</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee2dc]">
                {statementLinesData.lines.filter((l: any) => l.reconciliationStatus === 'DISCREPANT').length > 0 ? (
                  statementLinesData.lines
                    .filter((l: any) => l.reconciliationStatus === 'DISCREPANT')
                    .map((line: any) => (
                      <tr key={line.id} className="hover:bg-black/2">
                        <td className="py-2.5 px-4 font-mono">
                          {new Date(line.transactionDate).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-[#25203a] max-w-xs truncate">
                          {line.description}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[#68647a]">
                          {line.referenceNumber || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-[#68647a]">
                          {line.bankAccount?.accountName}
                        </td>
                        <td className="py-2.5 px-4 text-right font-serif font-bold text-[#b93657]">
                          ₹{line.amount}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px] font-bold">
                            DISCREPANT
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedLineIdForReview(line.id)}
                            className="px-3 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs font-semibold"
                          >
                            Resolve Discrepancy
                          </button>
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-[#68647a]">
                      No unresolved discrepancies found! All statement items are clean or reconciled.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Imports History Tab */}
      {activeTab === 'imports' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-serif font-bold text-[#542047]">
              Statement Import Registry
            </h3>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-3 py-1.5 bg-[#542047] text-white hover:bg-[#421b48] rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload CSV Statement</span>
            </button>
          </div>

          <div className="bg-white border border-[#eee2dc] rounded-2xl shadow-xs overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#fffaf5] border-b border-[#eee2dc] text-[#68647a] font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">File Name</th>
                  <th className="py-2.5 px-4">Bank Account</th>
                  <th className="py-2.5 px-4">Imported Date</th>
                  <th className="py-2.5 px-4">Imported By</th>
                  <th className="py-2.5 px-4">Lines Count</th>
                  <th className="py-2.5 px-4">Source Type</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee2dc]">
                {imports.length > 0 ? (
                  imports.map((imp: any) => (
                    <tr key={imp.id} className="hover:bg-black/2">
                      <td className="py-2.5 px-4 font-semibold text-[#25203a] flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-[#d49a24]" />
                        <span>{imp.fileName}</span>
                      </td>
                      <td className="py-2.5 px-4 text-[#68647a]">
                        {imp.bankAccount?.accountName} ({imp.bankAccount?.bankName})
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[#68647a]">
                        {new Date(imp.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-4 text-[#25203a]">
                        {imp.importedByUser?.name || imp.importedByUser?.email || 'System'}
                      </td>
                      <td className="py-2.5 px-4 font-bold font-mono text-[#542047]">
                        {imp.totalLinesCount || imp._count?.lines || 0}
                      </td>
                      <td className="py-2.5 px-4 text-[10px] font-mono text-[#68647a]">
                        {imp.sourceType}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">
                          {imp.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-[#68647a]">
                      No bank statements imported yet. Click "Upload CSV Statement" to begin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bank Accounts Tab */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-serif font-bold text-[#542047]">
              Configured Bank & Settlement Accounts
            </h3>
            <button
              onClick={() => setIsAddAccountOpen(true)}
              className="px-3.5 py-1.5 bg-[#542047] text-white hover:bg-[#421b48] rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Bank Account</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankAccounts.map((acc: any) => (
              <div
                key={acc.id}
                className={`bg-white border rounded-2xl p-5 shadow-xs space-y-3 transition ${
                  acc.isActive ? 'border-[#eee2dc] hover:border-[#d49a24]' : 'border-zinc-200 bg-zinc-50 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-[#f4ead5] text-[#542047] rounded-xl">
                      <Landmark className="w-4 h-4 text-[#d49a24]" />
                    </div>
                    <div>
                      <h4 className="text-sm font-serif font-bold text-[#542047]">
                        {acc.accountName}
                      </h4>
                      <p className="text-xs text-[#68647a]">{acc.bankName}</p>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      acc.isActive
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-zinc-200 text-zinc-600'
                    }`}
                  >
                    {acc.isActive ? 'ACTIVE' : 'DEACTIVATED'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs pt-1 border-t border-[#eee2dc]">
                  <div className="flex justify-between">
                    <span className="text-[#68647a]">Account Identifier:</span>
                    <span className="font-mono font-semibold text-[#25203a]">
                      {acc.accountNumberMasked}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-[#68647a]">Account Type:</span>
                    <span className="font-semibold text-[#542047]">{acc.accountType}</span>
                  </div>

                  {acc.ifscCode && (
                    <div className="flex justify-between">
                      <span className="text-[#68647a]">IFSC Code:</span>
                      <span className="font-mono text-[#25203a]">{acc.ifscCode}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-[#68647a]">Showroom Branch:</span>
                    <span className="font-medium text-[#25203a]">
                      {acc.branch?.name ? `${acc.branch.name} (${acc.branch.code})` : 'Centralized (All Showrooms)'}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-[#68647a]">General Ledger Account:</span>
                    <span className="font-mono font-semibold text-[#d49a24]">
                      {acc.ledgerAccount ? `${acc.ledgerAccount.code} - ${acc.ledgerAccount.name}` : '1040 Bank Account'}
                    </span>
                  </div>
                </div>

                {acc.isActive && (
                  <div className="pt-2 border-t border-[#eee2dc] flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setDeactivateAccountTarget(acc)}
                      className="px-2.5 py-1 text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg text-[11px] font-semibold transition"
                    >
                      Deactivate Account
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals & Drawers */}
      <AddBankAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        onSuccess={() => refreshData()}
        branches={branches}
        ledgerAccounts={ledgerAccounts}
      />

      <DeactivateBankAccountModal
        isOpen={!!deactivateAccountTarget}
        onClose={() => setDeactivateAccountTarget(null)}
        onSuccess={() => refreshData()}
        account={deactivateAccountTarget}
      />

      <StatementImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => refreshData()}
        bankAccounts={bankAccounts.filter((a) => a.isActive)}
        preselectedAccountId={selectedBankAccountId}
      />

      {selectedLineIdForReview && (
        <MatchingReviewModal
          isOpen={!!selectedLineIdForReview}
          onClose={() => setSelectedLineIdForReview(null)}
          onSuccess={() => refreshData()}
          statementLineId={selectedLineIdForReview}
          onOpenSettlement={(lineId, isSettled) => {
            setSelectedLineIdForReview(null);
            setSettlementModalState({
              isOpen: true,
              statementLineId: lineId,
              isSettled,
            });
          }}
        />
      )}

      {settlementModalState.isOpen && (
        <SettlementModal
          isOpen={settlementModalState.isOpen}
          onClose={() =>
            setSettlementModalState({
              isOpen: false,
              statementLineId: '',
              isSettled: false,
            })
          }
          onSuccess={() => refreshData()}
          statementLineId={settlementModalState.statementLineId}
          isAlreadySettled={settlementModalState.isSettled}
        />
      )}
    </div>
  );
};
