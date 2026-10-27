'use client';

import React, { useState, useEffect } from 'react';
import {
  Link2,
  X,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Search,
  Check,
  Scale,
  ShieldAlert,
  Clock,
  Ban,
  FileText,
  User,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  getStatementLineDetailsAction,
  findCandidateMatchesAction,
  searchUnallocatedPaymentsAction,
  createProposedMatchAction,
  confirmMatchAction,
  createAndConfirmMatchAction,
  reverseMatchAction,
  markLineDiscrepantAction,
  ignoreStatementLineAction,
} from '@/app/actions/reconciliation';

interface MatchingReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  statementLineId: string;
  onOpenSettlement: (statementLineId: string, isSettled: boolean) => void;
}

export const MatchingReviewModal: React.FC<MatchingReviewModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  statementLineId,
  onOpenSettlement,
}) => {
  const [line, setLine] = useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Manual payment search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [manualAllocAmount, setManualAllocAmount] = useState('');

  // Reason prompts for actions
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [promptAction, setPromptAction] = useState<'REVERSE_MATCH' | 'DISCREPANT' | 'IGNORE' | null>(null);
  const [targetMatchId, setTargetMatchId] = useState<string | null>(null);
  const [promptReason, setPromptReason] = useState('');

  useEffect(() => {
    if (isOpen && statementLineId) {
      loadLineDetails();
    }
  }, [isOpen, statementLineId]);

  async function loadLineDetails() {
    setLoading(true);
    setError(null);
    try {
      const [lineRes, candRes] = await Promise.all([
        getStatementLineDetailsAction(statementLineId),
        findCandidateMatchesAction(statementLineId),
      ]);

      if (!lineRes.success || !lineRes.data) {
        setError(lineRes.error || 'Failed to load statement line details.');
        setLoading(false);
        return;
      }

      setLine(lineRes.data);
      setCandidates(candRes.success && candRes.data ? candRes.data : []);
    } catch (err: any) {
      setError(err?.message || 'A network error occurred.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearchPayments() {
    setSearching(true);
    try {
      const res = await searchUnallocatedPaymentsAction({ query: searchQuery });
      if (res.success && res.data) {
        setSearchResults(res.data);
      }
    } catch (err: any) {
      setError(err?.message || 'Search failed.');
    } finally {
      setSearching(false);
    }
  }

  async function handleConfirmCandidate(cand: any) {
    setActionInProgress(`confirm-candidate-${cand.paymentId}`);
    setError(null);
    try {
      const remainingUnallocated = Number(cand.unallocatedPaymentAmount);
      const lineAmt = Number(line.amount);
      const matchAmt = Math.min(remainingUnallocated, lineAmt);

      const res = await createAndConfirmMatchAction({
        statementLineId: line.id,
        paymentId: cand.paymentId,
        matchedAmount: matchAmt.toFixed(2),
        matchType: cand.rule,
        reason: `Matched via rule: ${cand.rule}`,
      });

      if (!res.success) {
        setError(res.error || 'Failed to confirm match.');
        return;
      }

      await loadLineDetails();
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to confirm match.');
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleProposeCandidate(cand: any) {
    setActionInProgress(`propose-candidate-${cand.paymentId}`);
    setError(null);
    try {
      const remainingUnallocated = Number(cand.unallocatedPaymentAmount);
      const lineAmt = Number(line.amount);
      const matchAmt = Math.min(remainingUnallocated, lineAmt);

      const res = await createProposedMatchAction({
        statementLineId: line.id,
        paymentId: cand.paymentId,
        matchedAmount: matchAmt.toFixed(2),
        matchType: cand.rule,
      });

      if (!res.success) {
        setError(res.error || 'Failed to propose match.');
        return;
      }

      await loadLineDetails();
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to propose match.');
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleConfirmProposedMatch(matchId: string) {
    setActionInProgress(`confirm-${matchId}`);
    setError(null);
    try {
      const res = await confirmMatchAction(matchId);
      if (!res.success) {
        setError(res.error || 'Failed to confirm match.');
        return;
      }
      await loadLineDetails();
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to confirm match.');
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleExecutePromptAction() {
    if (!promptReason.trim() || promptReason.trim().length < 5) {
      setError('A mandatory reason of at least 5 characters is required.');
      return;
    }

    setActionInProgress('executing-prompt');
    setError(null);
    try {
      if (promptAction === 'REVERSE_MATCH' && targetMatchId) {
        const res = await reverseMatchAction({
          matchId: targetMatchId,
          reason: promptReason.trim(),
        });
        if (!res.success) {
          setError(res.error || 'Failed to reverse match.');
          return;
        }
      } else if (promptAction === 'DISCREPANT') {
        const res = await markLineDiscrepantAction({
          statementLineId: line.id,
          reason: promptReason.trim(),
        });
        if (!res.success) {
          setError(res.error || 'Failed to mark line as discrepant.');
          return;
        }
      } else if (promptAction === 'IGNORE') {
        const res = await ignoreStatementLineAction({
          statementLineId: line.id,
          reason: promptReason.trim(),
        });
        if (!res.success) {
          setError(res.error || 'Failed to ignore statement line.');
          return;
        }
      }

      setPromptAction(null);
      setPromptReason('');
      setTargetMatchId(null);
      await loadLineDetails();
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Action failed.');
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleManualMatchSubmit() {
    if (!selectedPayment) {
      setError('Please select a payment from search results.');
      return;
    }
    if (!manualAllocAmount || Number(manualAllocAmount) <= 0) {
      setError('Please specify a positive match amount.');
      return;
    }

    setActionInProgress('manual-match');
    setError(null);
    try {
      const res = await createAndConfirmMatchAction({
        statementLineId: line.id,
        paymentId: selectedPayment.id,
        matchedAmount: Number(manualAllocAmount).toFixed(2),
        matchType: 'MANUAL_MATCH',
        reason: 'Manual match allocated in reconciliation review modal',
      });

      if (!res.success) {
        setError(res.error || 'Manual match failed.');
        return;
      }

      setSelectedPayment(null);
      setManualAllocAmount('');
      setSearchResults([]);
      await loadLineDetails();
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Manual match failed.');
    } finally {
      setActionInProgress(null);
    }
  }

  if (!isOpen) return null;

  const isSettled = line?.reconciliationStatus === 'SETTLED' || !!line?.settlementJournalId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-[#eee2dc] shadow-xl w-full max-w-4xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#eee2dc] bg-[#fffaf5] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#f4ead5] text-[#542047] flex items-center justify-center">
              <Link2 className="w-4 h-4 text-[#d49a24]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-serif font-bold text-[#542047]">
                  Reconciliation Review
                </h2>
                {line && (
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
                )}
              </div>
              <p className="text-[11px] text-[#68647a]">
                Match bank statement lines with customer payments and post double-entry settlement
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {line && (
              <button
                onClick={() => onOpenSettlement(line.id, isSettled)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition ${
                  isSettled
                    ? 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                    : line.reconciliationStatus === 'MATCHED'
                    ? 'bg-[#542047] text-white hover:bg-[#421b48]'
                    : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>{isSettled ? 'Settlement Journal' : 'Post Settlement'}</span>
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="Close review modal"
              className="text-[#68647a] hover:text-[#542047] p-1.5 rounded-lg hover:bg-black/5 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-[#fbe8e8] border border-[#f5b8b8] text-[#b93657] rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-xs text-[#68647a] space-y-2">
              <div className="w-6 h-6 border-2 border-[#d49a24]/30 border-t-[#d49a24] rounded-full animate-spin mx-auto" />
              <p>Loading line details and matching suggestions...</p>
            </div>
          ) : line ? (
            <>
              {/* Statement Line Snapshot */}
              <div className="bg-[#fffaf5] border border-[#eee2dc] rounded-2xl p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] text-[#68647a] uppercase font-bold block mb-0.5">
                      Transaction Date
                    </span>
                    <span className="font-semibold text-[#25203a]">
                      {new Date(line.transactionDate).toLocaleDateString()}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#68647a] uppercase font-bold block mb-0.5">
                      Net Deposit Amount
                    </span>
                    <span className="font-serif font-bold text-base text-[#542047]">
                      ₹{line.amount}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#68647a] uppercase font-bold block mb-0.5">
                      Bank Account
                    </span>
                    <span className="font-semibold text-[#25203a] truncate block">
                      {line.bankAccount?.accountName} ({line.bankAccount?.bankName})
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#68647a] uppercase font-bold block mb-0.5">
                      Reference / UTR
                    </span>
                    <span className="font-mono text-[#25203a]">
                      {line.referenceNumber || '—'}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#eee2dc] text-xs flex items-center justify-between">
                  <div className="truncate max-w-lg">
                    <span className="text-[10px] text-[#68647a] uppercase font-bold mr-2">
                      Description:
                    </span>
                    <span className="text-[#25203a] font-mono text-[11px]">{line.description}</span>
                  </div>
                  <span className="text-[11px] text-[#68647a]">
                    Line #{line.lineNumber} in {line.import?.fileName || 'Import'}
                  </span>
                </div>
              </div>

              {/* Settled Immutability Alert */}
              {isSettled && (
                <div className="p-3.5 bg-purple-50 border border-purple-200 text-purple-900 rounded-xl text-xs space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <ShieldAlert className="w-4 h-4 text-purple-700" />
                    <span>Settled Record — Protected Against Ordinary Matching Actions</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-purple-800">
                    This statement line was settled into the general ledger in Journal Entry{' '}
                    <strong className="font-mono">{line.settlementJournal?.entryNumber || line.settlementJournalId}</strong>{' '}
                    on {line.settledAt ? new Date(line.settledAt).toLocaleDateString() : 'earlier date'}.
                    Ordinary matching, reversal, and discrepancy operations are strictly locked.
                    To modify, an authorized staff member must reverse the settlement journal first.
                  </p>
                </div>
              )}

              {/* Existing Matches Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#542047] uppercase tracking-wider">
                    Confirmed & Proposed Matches ({line.matches?.length || 0})
                  </h3>
                  <span className="text-[11px] text-[#68647a]">
                    Total Allocated: ₹
                    {line.matches
                      ?.filter((m: any) => m.status === 'CONFIRMED' || m.status === 'SETTLED')
                      .reduce((acc: number, m: any) => acc + Number(m.matchedAmount), 0)
                      .toFixed(2)}
                  </span>
                </div>

                {line.matches && line.matches.length > 0 ? (
                  <div className="border border-[#eee2dc] rounded-xl overflow-hidden bg-white shadow-xs">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#f9f5f1] border-b border-[#eee2dc] text-[#68647a] text-[11px]">
                        <tr>
                          <th className="py-2 px-3">Customer / Invoice</th>
                          <th className="py-2 px-3">Tender</th>
                          <th className="py-2 px-3">Reference</th>
                          <th className="py-2 px-3 text-right">Matched (₹)</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eee2dc]">
                        {line.matches.map((m: any) => (
                          <tr key={m.id} className="hover:bg-black/2">
                            <td className="py-2 px-3">
                              <p className="font-semibold text-[#25203a]">
                                {m.payment?.invoice?.customerName || 'Customer'}
                              </p>
                              <p className="text-[10px] text-[#68647a] font-mono">
                                Inv #{m.payment?.invoice?.invoiceNumber}
                              </p>
                            </td>
                            <td className="py-2 px-3 font-semibold text-[#542047]">
                              {m.payment?.paymentMethod}
                            </td>
                            <td className="py-2 px-3 font-mono text-[#68647a] text-[11px]">
                              {m.payment?.transactionRef || '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-bold font-mono text-[#25203a]">
                              ₹{m.matchedAmount}
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  m.status === 'SETTLED'
                                    ? 'bg-purple-100 text-purple-800'
                                    : m.status === 'CONFIRMED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : m.status === 'PROPOSED'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-zinc-100 text-zinc-600'
                                }`}
                              >
                                {m.status}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              {m.status === 'PROPOSED' && !isSettled ? (
                                <button
                                  type="button"
                                  onClick={() => handleConfirmProposedMatch(m.id)}
                                  disabled={actionInProgress === `confirm-${m.id}`}
                                  className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[10px] font-semibold transition"
                                >
                                  Confirm
                                </button>
                              ) : m.status === 'CONFIRMED' && !isSettled ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTargetMatchId(m.id);
                                    setPromptAction('REVERSE_MATCH');
                                    setPromptReason('');
                                  }}
                                  className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-[10px] font-semibold transition"
                                >
                                  Reverse
                                </button>
                              ) : (
                                <span className="text-[10px] text-[#68647a]">Locked</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 border border-dashed border-[#eee2dc] rounded-xl text-center text-xs text-[#68647a] bg-[#fffaf5]">
                    No matches linked to this statement line yet.
                  </div>
                )}
              </div>

              {/* Prompt Reason Modal / Inline Block */}
              {promptAction && (
                <div className="p-4 bg-[#fff8e6] border border-[#f5d070] rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#542047] flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-[#d49a24]" />
                      {promptAction === 'REVERSE_MATCH'
                        ? 'Reverse Match — Mandatory Audit Reason'
                        : promptAction === 'DISCREPANT'
                        ? 'Mark Statement Line as Discrepant'
                        : 'Mark Statement Line as Ignored'}
                    </span>
                    <button
                      onClick={() => setPromptAction(null)}
                      className="text-[#68647a] hover:text-[#542047]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <input
                      type="text"
                      value={promptReason}
                      onChange={(e) => setPromptReason(e.target.value)}
                      placeholder="Specify reason (minimum 5 characters, recorded in audit log)..."
                      className="w-full px-3 py-1.5 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden bg-white"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPromptAction(null)}
                      className="px-3 py-1 border border-[#eee2dc] rounded-lg text-xs font-semibold text-[#68647a] hover:bg-black/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleExecutePromptAction}
                      disabled={actionInProgress === 'executing-prompt' || promptReason.trim().length < 5}
                      className="px-3 py-1 bg-[#b93657] text-white rounded-lg text-xs font-semibold hover:bg-[#9e2d49] disabled:opacity-50"
                    >
                      Confirm Action
                    </button>
                  </div>
                </div>
              )}

              {/* Candidate Matches Section */}
              {!isSettled && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-[#542047] uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#d49a24]" />
                      Suggested Candidates Found by Matching Engine ({candidates.length})
                    </h3>
                  </div>

                  {candidates.length > 0 ? (
                    <div className="space-y-2">
                      {candidates.map((cand, i) => (
                        <div
                          key={i}
                          className="p-3.5 border border-[#eee2dc] hover:border-[#d49a24] rounded-xl bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs transition"
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-xs text-[#25203a]">
                                {cand.customerName}
                              </span>
                              <span className="text-[10px] text-[#68647a] font-mono">
                                Inv #{cand.invoiceNumber}
                              </span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                  cand.confidence === 'HIGH'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : cand.confidence === 'MEDIUM'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-rose-50 text-rose-700'
                                }`}
                              >
                                {cand.confidence} CONFIDENCE
                              </span>
                              <span className="text-[10px] text-[#68647a] font-mono">
                                ({cand.rule})
                              </span>
                            </div>

                            <p className="text-[11px] text-[#68647a]">
                              Tender: <strong className="text-[#542047]">{cand.paymentMethod}</strong> | Ref:{' '}
                              <span className="font-mono">{cand.transactionRef || '—'}</span> | Date:{' '}
                              {new Date(cand.paymentDate).toLocaleDateString()}
                            </p>

                            {cand.discrepancy && (
                              <p className="text-[10px] text-[#b93657] mt-1 font-semibold">
                                {cand.discrepancy.message}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <span className="font-serif font-bold text-sm text-[#25203a] mr-2">
                              ₹{cand.unallocatedPaymentAmount}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleProposeCandidate(cand)}
                              disabled={actionInProgress === `propose-candidate-${cand.paymentId}`}
                              className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition"
                            >
                              Propose
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConfirmCandidate(cand)}
                              disabled={actionInProgress === `confirm-candidate-${cand.paymentId}`}
                              className="px-3 py-1.5 bg-[#542047] hover:bg-[#421b48] text-white rounded-xl text-xs font-semibold transition flex items-center gap-1 shadow-xs"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Confirm Match</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 border border-dashed border-[#eee2dc] rounded-xl text-center text-xs text-[#68647a] bg-[#fffaf5]">
                      No automatic match suggestions detected for this statement line. You can search payments manually below.
                    </div>
                  )}
                </div>
              )}

              {/* Manual Match Search */}
              {!isSettled && (
                <div className="border border-[#eee2dc] rounded-2xl p-4 bg-white space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[#eee2dc]">
                    <span className="text-xs font-bold text-[#542047] uppercase tracking-wider flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-[#d49a24]" />
                      Manual Customer Payment Search & Allocation
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by invoice #, customer name, or transaction UTR..."
                      className="flex-1 px-3 py-2 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden"
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchPayments()}
                    />
                    <button
                      type="button"
                      onClick={handleSearchPayments}
                      disabled={searching}
                      className="px-4 py-2 bg-[#f4ead5] text-[#542047] hover:bg-[#ffe8a8] rounded-xl text-xs font-semibold transition"
                    >
                      {searching ? 'Searching...' : 'Search'}
                    </button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="border border-[#eee2dc] rounded-xl overflow-hidden divide-y divide-[#eee2dc] max-h-40 overflow-y-auto">
                      {searchResults.map((pay) => (
                        <div
                          key={pay.id}
                          onClick={() => {
                            setSelectedPayment(pay);
                            setManualAllocAmount(
                              Math.min(Number(pay.unallocatedAmount), Number(line.amount)).toFixed(2)
                            );
                          }}
                          className={`p-2.5 flex items-center justify-between text-xs cursor-pointer transition ${
                            selectedPayment?.id === pay.id
                              ? 'bg-[#fffaf5] border-l-4 border-l-[#d49a24]'
                              : 'hover:bg-black/2'
                          }`}
                        >
                          <div>
                            <span className="font-semibold text-[#25203a]">{pay.customerName}</span>{' '}
                            <span className="text-[#68647a] text-[11px] font-mono">
                              (Inv #{pay.invoiceNumber})
                            </span>
                            <p className="text-[10px] text-[#68647a]">
                              {pay.paymentMethod} — Ref: {pay.transactionRef || '—'}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-[#542047]">₹{pay.unallocatedAmount}</span>
                            <span className="text-[10px] text-[#68647a] block">unallocated</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedPayment && (
                    <div className="p-3 bg-[#fffaf5] border border-[#d49a24]/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-[#542047]">
                          Allocate to: {selectedPayment.customerName} (Inv #{selectedPayment.invoiceNumber})
                        </p>
                        <p className="text-[11px] text-[#68647a]">
                          Remaining on payment: ₹{selectedPayment.unallocatedAmount}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          max={selectedPayment.unallocatedAmount}
                          value={manualAllocAmount}
                          onChange={(e) => setManualAllocAmount(e.target.value)}
                          placeholder="Amount"
                          className="w-28 px-2.5 py-1 text-xs border border-[#eee2dc] rounded-lg font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleManualMatchSubmit}
                          disabled={actionInProgress === 'manual-match'}
                          className="px-3 py-1.5 bg-[#542047] text-white rounded-xl text-xs font-semibold hover:bg-[#421b48]"
                        >
                          Commit Match
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Exception Management Buttons */}
              {!isSettled && (
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPromptAction('DISCREPANT');
                        setPromptReason('');
                      }}
                      className="px-3 py-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-semibold transition"
                    >
                      Mark Discrepant
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPromptAction('IGNORE');
                        setPromptReason('');
                      }}
                      className="px-3 py-1.5 border border-zinc-200 text-zinc-600 hover:bg-zinc-50 rounded-xl text-xs font-semibold transition"
                    >
                      Ignore Line
                    </button>
                  </div>

                  <span className="text-[11px] text-[#68647a]">
                    Mandatory reason is recorded in audit logs for compliance
                  </span>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
