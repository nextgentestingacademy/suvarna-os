'use client';

import React, { useState } from 'react';
import { X, MessageSquare, AlertCircle, Loader2 } from 'lucide-react';
import { logCustomerInteractionAction, SerializedCustomerInteraction } from '@/app/actions/customer';

interface AddInteractionModalProps {
  customerId: string;
  customerName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (interaction: SerializedCustomerInteraction) => void;
}

export function AddInteractionModal({
  customerId,
  customerName,
  isOpen,
  onClose,
  onSuccess,
}: AddInteractionModalProps) {
  const [channel, setChannel] = useState<'WALK_IN' | 'PHONE' | 'WHATSAPP' | 'FOLLOW_UP'>('WALK_IN');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!notes.trim() || notes.trim().length < 2) {
      setError('Please enter interaction notes (minimum 2 characters).');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await logCustomerInteractionAction(customerId, {
        channel,
        notes: notes.trim(),
        followUpDate: followUpDate || null,
      });

      if (res.success && res.data) {
        onSuccess(res.data);
        onClose();
      } else {
        setError(res.error || 'Failed to record interaction.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#eee2dc] rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b border-[#eee2dc]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#542047] text-[#ffe8a8] flex items-center justify-center font-bold">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-[#d49a24] uppercase tracking-wider block">
                CRM Enquiry & Activity
              </span>
              <h2 className="text-base font-serif font-bold text-[#542047]">
                Log Interaction for {customerName}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#68647a] hover:bg-[#fff0dc] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-[#fbe8e8] border border-[#f5b8b8] rounded-xl text-xs text-[#b93657] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="my-4 space-y-3.5 text-xs">
          <div>
            <label className="font-semibold text-[#25203a] block mb-1">
              Communication Channel
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'WALK_IN', label: 'Showroom Visit' },
                { id: 'PHONE', label: 'Phone Call' },
                { id: 'WHATSAPP', label: 'WhatsApp' },
                { id: 'FOLLOW_UP', label: 'Follow-up' },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannel(c.id as any)}
                  className={`py-2 px-1 text-center rounded-xl border text-[11px] font-medium transition ${
                    channel === c.id
                      ? 'bg-[#542047] text-[#ffe8a8] border-[#542047] font-bold'
                      : 'bg-[#fffaf5] border-[#eee2dc] text-[#68647a] hover:bg-[#fff0dc]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-semibold text-[#25203a] block mb-1">
              Interaction Details & Notes <span className="text-[#b93657]">*</span>
            </label>
            <textarea
              rows={4}
              placeholder="e.g. Visited showroom to look at bridal necklaces. Enquired about 22K kundan choker, requested quote on WhatsApp."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            />
          </div>

          <div>
            <label className="font-semibold text-[#25203a] block mb-1">
              Follow-up Due Date (Optional)
            </label>
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="w-full px-3 py-2 bg-[#fffaf5] border border-[#eee2dc] rounded-xl focus:outline-none focus:border-[#d49a24] text-[#25203a]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#eee2dc]">
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
              className="px-5 py-2 bg-[#542047] hover:bg-[#421b48] text-[#ffe8a8] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Logging...</span>
                </>
              ) : (
                <>
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Save Interaction</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
