'use client';

import React, { useState } from 'react';
import { Landmark, Plus, X, AlertCircle, CheckCircle2, ShieldAlert, Building2 } from 'lucide-react';
import { createBankAccountAction, deactivateBankAccountAction } from '@/app/actions/reconciliation';

interface LedgerAccountOption {
  id: string;
  code: string;
  name: string;
}

interface BranchOption {
  id: string;
  name: string;
  code: string;
}

interface AddBankAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  branches: BranchOption[];
  ledgerAccounts: LedgerAccountOption[];
}

export const AddBankAccountModal: React.FC<AddBankAccountModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  branches,
  ledgerAccounts,
}) => {
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumberMasked, setAccountNumberMasked] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountType, setAccountType] = useState<'CURRENT' | 'SAVINGS' | 'OVERDRAFT' | 'PAYMENT_GATEWAY' | 'EDC_SETTLEMENT'>('CURRENT');
  const [branchId, setBranchId] = useState<string>('');
  const [ledgerAccountId, setLedgerAccountId] = useState<string>(
    ledgerAccounts.find((a) => a.code === '1040')?.id || (ledgerAccounts[0]?.id ?? '')
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!accountName.trim() || !bankName.trim() || !accountNumberMasked.trim() || !ledgerAccountId) {
      setError('Please fill in all mandatory fields.');
      return;
    }

    setLoading(true);
    try {
      const res = await createBankAccountAction({
        accountName: accountName.trim(),
        bankName: bankName.trim(),
        accountNumberMasked: accountNumberMasked.trim(),
        ifscCode: ifscCode.trim().toUpperCase() || undefined,
        accountType,
        branchId: branchId ? branchId : null,
        ledgerAccountId,
      });

      if (!res.success) {
        setError(res.error || 'Failed to create bank account.');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'A network error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-[#eee2dc] shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#eee2dc] bg-[#fffaf5]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#f4ead5] text-[#542047] flex items-center justify-center">
              <Landmark className="w-4 h-4 text-[#d49a24]" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-[#542047]">Add Bank Account</h2>
              <p className="text-[11px] text-[#68647a]">Configure operating bank or settlement gateway</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#68647a] hover:text-[#542047] p-1.5 rounded-lg hover:bg-black/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-[#fbe8e8] border border-[#f5b8b8] text-[#b93657] rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#542047] mb-1">
                Account Display Name *
              </label>
              <input
                type="text"
                placeholder="e.g. HDFC Fort Current"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden text-[#25203a] bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#542047] mb-1">
                Bank / Provider Name *
              </label>
              <input
                type="text"
                placeholder="e.g. HDFC Bank, ICICI Bank, Pine Labs"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden text-[#25203a] bg-white"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#542047] mb-1">
                Account Type *
              </label>
              <select
                value={accountType}
                onChange={(e: any) => setAccountType(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden text-[#25203a] bg-white"
              >
                <option value="CURRENT">Current Account</option>
                <option value="SAVINGS">Savings Account</option>
                <option value="OVERDRAFT">Cash Credit / Overdraft</option>
                <option value="PAYMENT_GATEWAY">Online Payment Gateway</option>
                <option value="EDC_SETTLEMENT">EDC Card POS Terminal</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#542047] mb-1">
                Account Number (Masked / Full) *
              </label>
              <input
                type="text"
                placeholder="e.g. XXXX-XXXX-5678"
                value={accountNumberMasked}
                onChange={(e) => setAccountNumberMasked(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden text-[#25203a] bg-white font-mono"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#542047] mb-1">
                IFSC Code (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. HDFC0000060"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden text-[#25203a] bg-white uppercase font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#542047] mb-1">
                Showroom Branch Scope
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden text-[#25203a] bg-white"
              >
                <option value="">Centralized (All Showroom Branches)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#542047] mb-1">
              General Ledger Account (Asset) *
            </label>
            <select
              value={ledgerAccountId}
              onChange={(e) => setLedgerAccountId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#eee2dc] rounded-xl focus:border-[#d49a24] focus:outline-hidden text-[#25203a] bg-white"
              required
            >
              {ledgerAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} — {acc.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-[#68647a] mt-1">
              Bank settlements will debit this balance-sheet ledger account (e.g. 1040 Business Bank Account).
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#eee2dc]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-[#eee2dc] rounded-xl text-xs font-semibold text-[#68647a] hover:bg-black/5 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-[#542047] text-white rounded-xl text-xs font-semibold hover:bg-[#421b48] transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Account</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface DeactivateBankAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  account: { id: string; accountName: string; bankName: string } | null;
}

export const DeactivateBankAccountModal: React.FC<DeactivateBankAccountModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  account,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !account) return null;

  async function handleDeactivate() {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const res = await deactivateBankAccountAction(account.id);
      if (!res.success) {
        setError(res.error || 'Failed to deactivate account.');
        setLoading(false);
        return;
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'A network error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-[#eee2dc] shadow-xl w-full max-w-md overflow-hidden p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-[#fbe8e8] text-[#b93657] rounded-xl shrink-0 mt-0.5">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-serif font-bold text-[#542047]">
              Deactivate Bank Account?
            </h3>
            <p className="text-xs text-[#68647a] mt-1 leading-relaxed">
              Deactivating <strong className="text-[#25203a]">{account.accountName}</strong> ({account.bankName}) will prevent future statement imports.
              All existing statement lines, matches, and double-entry settlements remain completely preserved.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-[#fbe8e8] border border-[#f5b8b8] text-[#b93657] rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 border border-[#eee2dc] rounded-xl text-xs font-semibold text-[#68647a] hover:bg-black/5 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={loading}
            className="px-4 py-2 bg-[#b93657] text-white rounded-xl text-xs font-semibold hover:bg-[#9e2d49] transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Deactivating...</span>
              </>
            ) : (
              <span>Confirm Deactivation</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
