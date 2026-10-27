'use client';

import React, { useState, useEffect } from 'react';
import {
  Scale,
  X,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Building,
  CreditCard,
  Receipt,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import {
  getSettlementPreviewAction,
  postSettlementJournalAction,
  reverseSettlementJournalAction,
} from '@/app/actions/reconciliation';

interface SettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  statementLineId: string;
  isAlreadySettled?: boolean;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  statementLineId,
  isAlreadySettled = false,
}) => {
  const [feeAmount, setFeeAmount] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reversal mode state
  const [isReversalMode, setIsReversalMode] = useState(isAlreadySettled);
  const [reversalReason, setReversalReason] = useState('');
  const [reversing, setReversing] = useState(false);

  useEffect(() => {
    if (isOpen && statementLineId && !isAlreadySettled) {
      loadPreview(feeAmount);
    }
  }, [isOpen, statementLineId, isAlreadySettled]);

  async function loadPreview(customFee?: string) {
    setLoadingPreview(true);
    setError(null);
    try {
      const res = await getSettlementPreviewAction({
        statementLineId,
        feeAmount: customFee && !isNaN(Number(customFee)) ? Number(customFee) : undefined,
      });

      if (!res.success || !res.data) {
        setError(res.error || 'Failed to calculate settlement preview.');
        setPreview(null);
        return;
      }

      setPreview(res.data);
      if (customFee === undefined && res.data.feeAmount && Number(res.data.feeAmount) > 0) {
        setFeeAmount(res.data.feeAmount);
      }
    } catch (err: any) {
      setError(err?.message || 'A network error occurred.');
    } finally {
      setLoadingPreview(false);
    }
  }

  function handleFeeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setFeeAmount(val);
    loadPreview(val);
  }

  async function handlePostSettlement() {
    if (!preview?.canSettle) {
      setError(preview?.blockReason || 'Settlement cannot be posted in current state.');
      return;
    }

    setPosting(true);
    setError(null);
    try {
      const res = await postSettlementJournalAction({
        statementLineId,
        feeAmount: feeAmount && !isNaN(Number(feeAmount)) ? Number(feeAmount) : undefined,
      });

      if (!res.success) {
        setError(res.error || 'Failed to post settlement journal.');
        setPosting(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'A network error occurred.');
    } finally {
      setPosting(false);
    }
  }

  async function handleReverseSettlement() {
    if (!reversalReason.trim() || reversalReason.trim().length < 5) {
      setError('A specific settlement reversal reason of at least 5 characters is mandatory.');
      return;
    }

    setReversing(true);
    setError(null);
    try {
      const res = await reverseSettlementJournalAction({
        statementLineId,
        reason: reversalReason.trim(),
      });

      if (!res.success) {
        setError(res.error || 'Failed to reverse settlement journal.');
        setReversing(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'A network error occurred.');
    } finally {
      setReversing(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-[#eee2dc] shadow-xl w-full max-w-xl my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#eee2dc] bg-[#fffaf5]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#f4ead5] text-[#542047] flex items-center justify-center">
              <Scale className="w-4 h-4 text-[#d49a24]" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-[#542047]">
                {isReversalMode ? 'Reverse Bank Settlement' : 'Post Bank Settlement'}
              </h2>
              <p className="text-[11px] text-[#68647a]">
                {isReversalMode
                  ? 'Posts balancing reversal entry in general ledger and unlocks line'
                  : 'Double-entry realization: Debits Operating Bank & Credits Tender Clearing'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settlement modal"
            className="text-[#68647a] hover:text-[#542047] p-1.5 rounded-lg hover:bg-black/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-[#fbe8e8] border border-[#f5b8b8] text-[#b93657] rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isReversalMode ? (
            /* Reversal Workflow */
            <div className="space-y-4">
              <div className="p-4 bg-[#fff8e6] border border-[#f5d070] text-[#8c5e0e] rounded-xl text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-[#542047]">
                  <RotateCcw className="w-4 h-4 text-[#d49a24]" />
                  <span>Settlement Reversal Safeguards</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Reversing this settlement will create an immutable balancing reversal journal entry in the general ledger.
                  The statement line will return to <strong className="text-[#542047]">MATCHED</strong> status and matches will return to <strong className="text-[#542047]">CONFIRMED</strong>, allowing subsequent re-matching or re-settlement.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#542047] mb-1">
                  Reversal Reason (Mandatory, min 5 chars) *
                </label>
                <textarea
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Bank chargeback issued, or incorrect customer allocation during reconciliation review"
                  rows={3}
                  className="w-full px-3 py-2 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden text-[#25203a] bg-white resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#eee2dc]">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={reversing}
                  className="px-4 py-2 border border-[#eee2dc] rounded-xl text-xs font-semibold text-[#68647a] hover:bg-black/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReverseSettlement}
                  disabled={reversing || reversalReason.trim().length < 5}
                  className="px-4 py-2 bg-[#b93657] text-white rounded-xl text-xs font-semibold hover:bg-[#9e2d49] transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  {reversing ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Posting Reversal...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Confirm Settlement Reversal</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Settlement Posting Workflow */
            <div className="space-y-4">
              {loadingPreview ? (
                <div className="py-8 text-center text-xs text-[#68647a] space-y-2">
                  <div className="w-6 h-6 border-2 border-[#d49a24]/30 border-t-[#d49a24] rounded-full animate-spin mx-auto" />
                  <p>Calculating double-entry balancing...</p>
                </div>
              ) : preview ? (
                <>
                  {/* Calculations Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-center">
                      <span className="text-[10px] font-semibold text-[#68647a] uppercase tracking-wider block mb-0.5">
                        Net Bank Deposit (Dr 1040)
                      </span>
                      <span className="text-base font-serif font-bold text-[#542047]">
                        ₹{preview.netDepositAmount}
                      </span>
                    </div>

                    <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-center">
                      <span className="text-[10px] font-semibold text-[#68647a] uppercase tracking-wider block mb-0.5">
                        Gross Cleared Tender (Cr)
                      </span>
                      <span className="text-base font-serif font-bold text-[#25203a]">
                        ₹{preview.grossClearedAmount}
                      </span>
                    </div>

                    <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-center">
                      <span className="text-[10px] font-semibold text-[#68647a] uppercase tracking-wider block mb-0.5">
                        Processing Fee (Dr 5110)
                      </span>
                      <span className="text-base font-serif font-bold text-[#d49a24]">
                        ₹{preview.feeAmount}
                      </span>
                    </div>
                  </div>

                  {/* Fee Input */}
                  <div>
                    <label className="block text-xs font-semibold text-[#542047] mb-1">
                      Payment Processing Fee / MDR Deduction (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={feeAmount}
                      onChange={handleFeeChange}
                      placeholder="0.00"
                      className="w-full px-3 py-2 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden text-[#25203a] font-mono bg-white"
                    />
                    <p className="text-[11px] text-[#68647a] mt-1">
                      If bank deposited net after gateway charges, specify explicit fee to balance debits: Total Debits (Deposit + Fee) = Gross Cleared.
                    </p>
                  </div>

                  {/* Balancing Status Banner */}
                  <div
                    className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                      preview.isBalanced
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {preview.isBalanced ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <div>
                        <p className="font-bold">
                          {preview.isBalanced
                            ? 'Double-Entry Entry Perfectly Balanced'
                            : 'Unbalanced Settlement Discrepancy'}
                        </p>
                        <p className="text-[11px] mt-0.5">
                          {preview.isBalanced
                            ? `Total Debits (₹${(
                                Number(preview.netDepositAmount) + Number(preview.feeAmount)
                              ).toFixed(2)}) = Total Credits (₹${preview.grossClearedAmount})`
                            : `Variance: ₹${Math.abs(Number(preview.varianceAmount)).toFixed(
                                2
                              )} — Server-side settlement prevents posting unexplained differences.`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Clearing Breakdown Table */}
                  <div className="border border-[#eee2dc] rounded-xl overflow-hidden bg-white">
                    <div className="px-3.5 py-2 bg-[#fffaf5] border-b border-[#eee2dc] text-[11px] font-bold text-[#542047] flex items-center justify-between">
                      <span>Tender Clearing Breakdown (Credits):</span>
                      <span className="text-[#68647a] font-normal">
                        {preview.clearingBreakdown.length} match allocation(s)
                      </span>
                    </div>
                    <div className="divide-y divide-[#eee2dc] max-h-36 overflow-y-auto">
                      {preview.clearingBreakdown.map((item: any, i: number) => (
                        <div key={i} className="px-3.5 py-2 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-[#542047]">
                              {item.paymentMethod}
                            </span>{' '}
                            <span className="text-[#68647a] text-[11px]">
                              (Acct {item.clearingAccountCode}) — Inv #{item.invoiceNumber}
                            </span>
                            <p className="text-[10px] text-[#68647a]">{item.customerName}</p>
                          </div>
                          <span className="font-bold font-mono text-[#25203a]">
                            ₹{item.amount}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Block Reason Warning if cannot settle */}
                  {!preview.canSettle && preview.blockReason && (
                    <div className="p-3 bg-[#fbe8e8] border border-[#f5b8b8] text-[#b93657] rounded-xl text-xs flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{preview.blockReason}</span>
                    </div>
                  )}

                  {/* Footer Actions */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#eee2dc]">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={posting}
                      className="px-4 py-2 border border-[#eee2dc] rounded-xl text-xs font-semibold text-[#68647a] hover:bg-black/5 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handlePostSettlement}
                      disabled={posting || !preview.canSettle}
                      className="px-4 py-2 bg-[#542047] text-white rounded-xl text-xs font-semibold hover:bg-[#421b48] transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                      {posting ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Posting Journal Entry...</span>
                        </>
                      ) : (
                        <>
                          <Scale className="w-3.5 h-3.5" />
                          <span>Post Settlement Journal</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
