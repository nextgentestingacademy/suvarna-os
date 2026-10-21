'use client';

import React, { useState } from 'react';
import { X, ArrowRightLeft, Building2, AlertCircle, Check } from 'lucide-react';
import { SerializedOrnament, transferOrnamentAction } from '@/app/actions/inventory';
import { DemoBranch } from '@/data/mock-workspace';

interface TransferOrnamentModalProps {
  ornament: SerializedOrnament | null;
  availableBranches: DemoBranch[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export function TransferOrnamentModal({
  ornament,
  availableBranches,
  onClose,
  onSuccess,
}: TransferOrnamentModalProps) {
  if (!ornament) return null;

  // Filter out the current showroom
  const destinationBranches = availableBranches.filter(
    (b) => b.id !== ornament.branchId
  );

  const [toBranchId, setToBranchId] = useState<string>(
    destinationBranches[0]?.id || ''
  );
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toBranchId) {
      setError('Please select a destination showroom.');
      return;
    }
    if (!reason.trim()) {
      setError('Please provide a reason or dispatch reference for the transfer.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await transferOrnamentAction({
        ornamentId: ornament.id,
        fromBranchId: ornament.branchId,
        toBranchId,
        reason: reason.trim(),
      });

      if (res.success) {
        const destBranch = availableBranches.find((b) => b.id === toBranchId);
        onSuccess(
          `Successfully transferred "${ornament.tagCode}" to ${destBranch?.name || 'destination showroom'}.`
        );
        onClose();
      } else {
        setError(res.error || 'Failed to complete stock transfer.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during transfer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div role="dialog" aria-modal="true" className="bg-white border border-[#eee2dc] rounded-2xl max-w-md w-full p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#eee2dc]">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#fff0dc] text-[#73501b] rounded-xl border border-[#f1d394]">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold text-[#542047]">
                Inter-Branch Stock Transfer
              </h2>
              <p className="text-[11px] text-[#68647a]">Move jewellery piece between showrooms</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#68647a] hover:bg-[#fff0dc] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selected Ornament Summary */}
        <div className="my-4 p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-[#d49a24]">TAG: {ornament.tagCode}</span>
            <span className="font-bold text-[#542047]">{ornament.purity} Gold</span>
          </div>
          <div className="font-semibold text-[#25203a]">{ornament.product?.name}</div>
          <div className="text-[11px] text-[#68647a]">
            Net Weight: {ornament.netWeight} g · Current Showroom:{' '}
            <strong className="text-[#25203a]">{ornament.branch?.name || 'Source Showroom'}</strong>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#fee2e2] border border-[#fca5a5] rounded-xl text-xs text-[#b91c1c] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {destinationBranches.length === 0 ? (
          <div className="p-4 bg-[#fff0dc] border border-[#f1d394] rounded-xl text-xs text-[#73501b] text-center">
            No other permitted branches available in this organization for inter-branch transfers.
          </div>
        ) : (
          <form onSubmit={handleTransfer} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#25203a] block mb-1">
                Destination Showroom *
              </label>
              <select
                value={toBranchId}
                onChange={(e) => setToBranchId(e.target.value)}
                className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
              >
                {destinationBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.city})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#25203a] block mb-1">
                Reason / Dispatch Reference *
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Stock rebalancing for weekend bridal exhibition (Challan #TR-881)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#d49a24] text-[#25203a]"
              />
            </div>

            <div className="p-2.5 bg-[#fdf8f0] border border-[#f1d394] rounded-xl text-[11px] text-[#73501b]">
              <strong>Ledger Notice:</strong> This action atomically moves the ornament to the destination branch and immutably records a TRANSFER entry in the stock ledger.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#eee2dc]">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 border border-[#eee2dc] rounded-xl text-xs font-semibold text-[#68647a] hover:bg-[#fffaf5] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-[#542047] hover:bg-[#421b48] text-[#ffe8a8] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm"
              >
                {isSubmitting ? (
                  <span>Transferring...</span>
                ) : (
                  <>
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Confirm Stock Transfer</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
