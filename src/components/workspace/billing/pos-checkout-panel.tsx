'use client';

import React, { useState, useRef } from 'react';
import {
  CreditCard,
  Banknote,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  Plus,
  Trash2,
  Receipt,
  FileCheck,
  Building,
  Loader2,
} from 'lucide-react';
import {
  SerializedInvoice,
  createInvoiceAction,
  SerializedCartTotalsResult,
} from '@/app/actions/billing';
import { SerializedCustomer } from '@/app/actions/customer';
import { CartItem } from './pos-cart';
import { WalkInCustomerDetails } from './pos-customer-selector';

interface PosCheckoutPanelProps {
  cartItems: CartItem[];
  totals: SerializedCartTotalsResult | null;
  selectedCustomer: SerializedCustomer | null;
  customerMode: 'REGISTERED' | 'WALK_IN';
  walkInDetails: WalkInCustomerDetails;
  onWalkInDetailsChange: (details: WalkInCustomerDetails) => void;
  invoiceDiscount: number;
  onInvoiceDiscountChange: (discount: number) => void;
  activeBranchId: string;
  activeBranchName: string;
  showroomState: string;
  onCheckoutSuccess: (invoice: SerializedInvoice) => void;
}

export interface PaymentEntry {
  id: string;
  method: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE' | 'EXCHANGE_CREDIT';
  amount: number;
  ref: string;
}

export function PosCheckoutPanel({
  cartItems,
  totals,
  selectedCustomer,
  customerMode,
  walkInDetails,
  onWalkInDetailsChange,
  invoiceDiscount,
  onInvoiceDiscountChange,
  activeBranchId,
  activeBranchName,
  showroomState,
  onCheckoutSuccess,
}: PosCheckoutPanelProps) {
  const [payments, setPayments] = useState<PaymentEntry[]>([
    { id: '1', method: 'UPI', amount: 0, ref: '' },
  ]);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [activeIdempotencyKey, setActiveIdempotencyKey] = useState<string>('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Fallback calculations if server totals are loading
  const subtotal = totals ? parseFloat(totals.subtotal) : 0;
  const taxable = totals ? parseFloat(totals.taxableAmount) : 0;
  const totalTax = totals ? parseFloat(totals.totalTax) : 0;
  const roundOff = totals ? parseFloat(totals.roundOff) : 0;
  const grandTotal = totals ? parseFloat(totals.grandTotal) : 0;
  const isInterState = totals ? totals.isInterState : false;
  const cgst = totals ? parseFloat(totals.cgstAmount) : 0;
  const sgst = totals ? parseFloat(totals.sgstAmount) : 0;
  const igst = totals ? parseFloat(totals.igstAmount) : 0;

  // Calculate Total Tendered & Balance Due
  const totalTendered = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const balanceDue = Math.max(0, grandTotal - totalTendered);
  const isOverpaid = totalTendered > grandTotal && grandTotal > 0;

  // Track entered PAN for registered or walk-in customers
  const [enteredPan, setEnteredPan] = useState<string>(() => {
    if (customerMode === 'REGISTERED') {
      return selectedCustomer?.pan || '';
    }
    return walkInDetails.pan || '';
  });

  // Sync enteredPan when selectedCustomer or customerMode changes
  React.useEffect(() => {
    if (customerMode === 'REGISTERED') {
      setEnteredPan(selectedCustomer?.pan || '');
    } else {
      setEnteredPan(walkInDetails.pan || '');
    }
  }, [customerMode, selectedCustomer?.id, selectedCustomer?.pan, walkInDetails.pan]);

  // Determine Customer PAN
  const effectivePan = (
    customerMode === 'REGISTERED'
      ? (enteredPan.trim() || selectedCustomer?.pan || '')
      : (walkInDetails.pan || enteredPan.trim() || '')
  ).toUpperCase();

  // Rule 114B / IT Act 2025 KYC Validation: >= ₹2,00,000 requires PAN
  const isHighValue = grandTotal >= 200000;
  const isPanMissing = isHighValue && (!effectivePan || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(effectivePan));

  // Customer validation check
  const isCustomerValid =
    customerMode === 'REGISTERED'
      ? !!selectedCustomer
      : !!walkInDetails.name && walkInDetails.name.trim().length >= 2;

  // Quick tender helper
  const handleSetQuickTender = (method: 'CASH' | 'UPI' | 'CARD') => {
    setPayments([
      {
        id: '1',
        method,
        amount: grandTotal,
        ref: method === 'CASH' ? 'Counter Cash Tender' : '',
      },
    ]);
  };

  const handleAddPaymentRow = () => {
    setPayments((prev) => [
      ...prev,
      { id: Date.now().toString(), method: 'CASH', amount: 0, ref: '' },
    ]);
  };

  const handleRemovePaymentRow = (id: string) => {
    if (payments.length <= 1) return;
    setPayments((prev) => prev.filter((p) => p.id !== id));
  };

  const handleUpdatePayment = (id: string, field: 'method' | 'amount' | 'ref', value: any) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  // Open confirmation modal with a stable idempotency key for this checkout attempt
  const handleOpenConfirmModal = () => {
    setActiveIdempotencyKey(
      `pos-${activeBranchId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    );
    setCheckoutError(null);
    setIsConfirmModalOpen(true);
  };

  // Perform Final Checkout Submission
  const handleFinalCheckout = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setCheckoutError(null);

    try {
      // 1. Prepare items payload
      const itemsPayload = cartItems.map((ci) => ({
        ornamentId: ci.ornament.id,
        pricingMode: ci.pricingMode,
        grossWeight: ci.ornament.grossWeight,
        stoneWeight: ci.ornament.stoneWeight,
        ratePerGram: ci.ratePerGram,
        makingChargeType: ci.makingChargeType,
        makingChargeRate: ci.makingChargeRate,
        stoneCharges: ci.stoneCharges,
        itemDiscount: ci.itemDiscount,
      }));

      // 2. Prepare payments payload (exclude 0 tenders)
      const validPayments = payments
        .filter((p) => p.amount > 0)
        .map((p) => ({
          paymentMethod: p.method,
          amount: p.amount,
          transactionRef: p.ref.trim() || undefined,
        }));

      // 3. Stable client idempotency key for this checkout modal session
      const idempotencyKey =
        activeIdempotencyKey ||
        `pos-${activeBranchId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // 4. Submit checkout
      const res = await createInvoiceAction({
        customerId: customerMode === 'REGISTERED' ? selectedCustomer?.id : null,
        customerName: customerMode === 'REGISTERED' ? selectedCustomer?.name : walkInDetails.name.trim(),
        customerPhone: customerMode === 'REGISTERED' ? selectedCustomer?.phone : (walkInDetails.phone.trim() || null),
        customerPan: effectivePan.trim().toUpperCase() || null,
        customerAddress: customerMode === 'REGISTERED' ? selectedCustomer?.addressLine1 : (walkInDetails.address.trim() || null),
        customerCity: customerMode === 'REGISTERED' ? selectedCustomer?.city : (walkInDetails.city.trim() || null),
        customerState: customerMode === 'REGISTERED' ? selectedCustomer?.state : (walkInDetails.state.trim() || showroomState),
        idempotencyKey,
        items: itemsPayload,
        payments: validPayments,
        discountAmount: invoiceDiscount,
        notes: `Showroom POS sale issued at ${activeBranchName}`,
      });

      if (res.success && res.data) {
        setIsConfirmModalOpen(false);
        onCheckoutSuccess(res.data);
      } else {
        setCheckoutError(res.error || 'Failed to complete checkout.');
      }
    } catch (err: any) {
      setCheckoutError(err?.message || 'An unexpected error occurred during checkout.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const isCheckoutDisabled =
    cartItems.length === 0 ||
    !isCustomerValid ||
    isOverpaid ||
    isPanMissing ||
    isSubmitting;

  return (
    <div className="bg-white rounded-2xl border border-[#eee2dc] p-4 shadow-xs space-y-4">
      {/* Financial Breakdown Section */}
      <div className="space-y-2 border-b border-[#eee2dc] pb-4 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-serif font-bold text-xs text-[#542047] uppercase tracking-wider">
            Bill & Tax Calculation
          </span>
          <span className="text-[10px] text-[#68647a]">
            HSN 7113 • 3% GST Policy
          </span>
        </div>

        <div className="flex justify-between py-1">
          <div>
            <span className="text-[#68647a] block">Item Subtotal (Taxable):</span>
            <span className="text-[10px] text-stone-400">Live daily rate + making charges</span>
          </div>
          <span className="font-mono font-semibold">
            ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Invoice Discount Input */}
        <div className="flex items-center justify-between py-1">
          <label className="text-[#68647a] flex items-center gap-1">
            <span>Special Bill Discount (₹):</span>
          </label>
          <input
            type="number"
            min={0}
            max={subtotal}
            value={invoiceDiscount === 0 ? '' : invoiceDiscount}
            onChange={(e) => {
              const val = Math.max(0, parseFloat(e.target.value) || 0);
              onInvoiceDiscountChange(Math.min(val, subtotal));
            }}
            placeholder="0.00"
            className="w-24 px-2 py-1 bg-[#fffaf5] border border-[#eee2dc] focus:border-[#d49a24] rounded-lg text-right font-mono font-semibold text-xs outline-none"
          />
        </div>

        <div className="flex justify-between py-1">
          <span className="text-[#68647a]">Net Taxable Value:</span>
          <span className="font-mono font-semibold">
            ₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* GST Breakdown */}
        <div className="p-2.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl space-y-1 text-[11px]">
          <div className="flex justify-between text-[#68647a]">
            <span>
              Place of Supply: <strong className="text-[#542047]">{isInterState ? 'Inter-State' : showroomState}</strong>
            </span>
            <span className="font-semibold text-[#542047]">
              {isInterState ? 'IGST (3.0%)' : 'CGST 1.5% + SGST 1.5%'}
            </span>
          </div>

          {!isInterState ? (
            <div className="flex justify-between text-[#68647a]">
              <span>CGST (1.5%) + SGST (1.5%):</span>
              <span className="font-mono font-semibold">
                ₹{(cgst + sgst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          ) : (
            <div className="flex justify-between text-[#68647a]">
              <span>IGST (3.0%):</span>
              <span className="font-mono font-semibold">
                ₹{igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {roundOff !== 0 && (
            <div className="flex justify-between text-stone-400">
              <span>Rounding:</span>
              <span className="font-mono">{roundOff > 0 ? '+' : ''}₹{roundOff.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Grand Total */}
        <div className="flex justify-between items-baseline pt-2 text-[#542047]">
          <span className="font-serif font-bold text-sm uppercase tracking-wider">Grand Total:</span>
          <span className="font-mono font-bold text-2xl text-[#542047]">
            ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Statutory High-Value KYC PAN Warning */}
      {isHighValue && (
        <div className={`p-3 rounded-xl border text-xs space-y-2 ${
          isPanMissing
            ? 'bg-[#fbe8e8] border-[#f5b8b8] text-[#b93657]'
            : 'bg-[#e2f6e8] border-[#b4e6c3] text-[#246743]'
        }`}>
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">
                Statutory KYC Quoting Requirement (Rule 114B / IT Act 2025)
              </span>
              <span className="text-[11px] leading-relaxed block mt-0.5">
                {isPanMissing
                  ? 'Jewellery transactions of ₹2,00,000 or above require quoting a verified Income Tax PAN.'
                  : `Income Tax PAN quoted: ${effectivePan}`}
              </span>
            </div>
          </div>

          <div className="pt-1">
            <label className="text-[10px] font-bold uppercase block mb-1">
              {isPanMissing ? 'Enter Customer PAN *' : 'Quoted Customer PAN'}
            </label>
            <input
              type="text"
              maxLength={10}
              value={enteredPan}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setEnteredPan(val);
                if (customerMode === 'WALK_IN') {
                  onWalkInDetailsChange({ ...walkInDetails, pan: val });
                }
              }}
              placeholder="ABCDE1234F"
              className={`w-full px-3 py-1.5 bg-white border rounded-lg font-mono uppercase text-xs text-[#25203a] outline-none ${
                isPanMissing
                  ? 'border-[#f5b8b8] focus:border-[#b93657]'
                  : 'border-[#b4e6c3] focus:border-[#246743]'
              }`}
            />
          </div>
        </div>
      )}

      {/* Payment Tenders Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-serif font-bold text-xs text-[#542047] uppercase tracking-wider">
            Payment Tenders
          </span>
          <div className="flex gap-1 text-[10px]">
            <button
              type="button"
              onClick={() => handleSetQuickTender('UPI')}
              className="px-2 py-0.5 bg-[#fff0dc] text-[#542047] rounded hover:bg-[#ffe8a8] font-bold transition cursor-pointer"
            >
              Full UPI
            </button>
            <button
              type="button"
              onClick={() => handleSetQuickTender('CARD')}
              className="px-2 py-0.5 bg-[#fff0dc] text-[#542047] rounded hover:bg-[#ffe8a8] font-bold transition cursor-pointer"
            >
              Full Card
            </button>
            <button
              type="button"
              onClick={() => handleSetQuickTender('CASH')}
              className="px-2 py-0.5 bg-[#fff0dc] text-[#542047] rounded hover:bg-[#ffe8a8] font-bold transition cursor-pointer"
            >
              Full Cash
            </button>
          </div>
        </div>

        {/* Payment Rows */}
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.id} className="p-2.5 bg-[#fffaf5] border border-[#eee2dc] rounded-xl space-y-2 text-xs">
              <div className="flex gap-2">
                <select
                  value={p.method}
                  onChange={(e: any) => handleUpdatePayment(p.id, 'method', e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-[#eee2dc] rounded-lg text-xs font-semibold outline-none text-[#542047]"
                >
                  <option value="UPI">UPI / QR</option>
                  <option value="CARD">Debit / Credit Card</option>
                  <option value="CASH">Counter Cash</option>
                  <option value="BANK_TRANSFER">NEFT / RTGS</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="EXCHANGE_CREDIT">Old Gold Exchange Credit</option>
                </select>

                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={p.amount === 0 ? '' : p.amount}
                  onChange={(e) =>
                    handleUpdatePayment(p.id, 'amount', parseFloat(e.target.value) || 0)
                  }
                  placeholder="Amount ₹"
                  className="flex-1 px-3 py-1.5 bg-white border border-[#eee2dc] focus:border-[#d49a24] rounded-lg font-mono font-bold text-xs text-right outline-none"
                />

                {payments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemovePaymentRow(p.id)}
                    className="p-1.5 text-stone-400 hover:text-[#b93657] transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <input
                type="text"
                value={p.ref}
                onChange={(e) => handleUpdatePayment(p.id, 'ref', e.target.value)}
                placeholder={
                  p.method === 'EXCHANGE_CREDIT'
                    ? 'Buyback Voucher # (e.g. BB/THANE/26-27/0001)'
                    : 'Transaction / Approval Ref # (e.g. UPI Ref / Card Txn ID)'
                }
                className="w-full px-2.5 py-1 bg-white border border-[#eee2dc] rounded-lg text-[11px] font-mono outline-none text-[#68647a]"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddPaymentRow}
          className="text-xs text-[#542047] hover:text-[#7b285e] font-semibold flex items-center gap-1 transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-[#d49a24]" />
          <span>Add Split Tender</span>
        </button>

        {/* Total Tendered & Balance Summary */}
        <div className="pt-2 border-t border-[#eee2dc] space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-[#68647a]">Total Tendered:</span>
            <span className="font-mono font-bold text-[#246743]">
              ₹{totalTendered.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#68647a]">Balance Due:</span>
            <span
              className={`font-mono font-bold ${
                balanceDue > 0 ? 'text-[#b93657]' : 'text-[#246743]'
              }`}
            >
              ₹{balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {isOverpaid && (
            <p className="text-[11px] text-[#b93657] font-semibold pt-1">
              ⚠️ Total payment cannot exceed grand total. Excess cash tenders require change return.
            </p>
          )}

          <p className="text-[10px] text-[#68647a] italic pt-1">
            Recorded counter tender — not an external payment gateway charge.
          </p>
        </div>
      </div>

      {/* Error Display */}
      {checkoutError && (
        <div className="p-3 bg-[#fbe8e8] border border-[#f5b8b8] text-[#b93657] rounded-xl text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{checkoutError}</span>
        </div>
      )}

      {/* Checkout Submit Button */}
      <button
        type="button"
        disabled={isCheckoutDisabled}
        onClick={handleOpenConfirmModal}
        className="w-full py-3 bg-gradient-to-r from-[#542047] to-[#7b285e] hover:from-[#421b48] hover:to-[#542047] text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        <Receipt className="w-4 h-4 text-[#ffe8a8]" />
        <span>Complete Sale & Issue Tax Invoice</span>
      </button>

      {/* Final Confirmation Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#eee2dc] w-full max-w-lg shadow-2xl p-6 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[#eee2dc]">
              <div className="w-9 h-9 rounded-xl bg-[#542047] text-[#ffe8a8] flex items-center justify-center">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-base text-[#542047]">
                  Confirm Sales Checkout
                </h3>
                <p className="text-xs text-[#68647a]">
                  Review transaction summary before finalizing tax invoice.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs bg-[#fffaf5] p-3.5 rounded-xl border border-[#eee2dc]">
              <div className="flex justify-between">
                <span className="text-[#68647a]">Showroom Branch:</span>
                <span className="font-bold text-[#542047]">{activeBranchName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#68647a]">Customer:</span>
                <span className="font-bold text-[#25203a]">
                  {customerMode === 'REGISTERED' ? selectedCustomer?.name : walkInDetails.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#68647a]">Jewellery Count:</span>
                <span className="font-bold">{cartItems.length} items</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#68647a]">Grand Total (incl. 3% GST):</span>
                <span className="font-mono font-bold text-[#542047] text-sm">
                  ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#68647a]">Total Tendered:</span>
                <span className="font-mono font-bold text-[#246743]">
                  ₹{totalTendered.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#68647a]">Payment Status:</span>
                <span className="font-bold uppercase text-[#542047]">
                  {balanceDue === 0 ? 'PAID IN FULL' : totalTendered > 0 ? 'PARTIAL' : 'UNPAID'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#68647a] leading-relaxed">
              Upon confirmation, the sequential tax invoice will be generated, inventory stock will be atomically deducted and marked as <strong>SOLD</strong>, and an immutable audit trail entry will be recorded.
            </p>

            <div className="pt-2 flex justify-end gap-2 border-t border-[#eee2dc]">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 bg-white border border-[#eee2dc] text-[#68647a] hover:bg-[#fff0dc] rounded-xl text-xs font-semibold transition disabled:opacity-40"
              >
                Go Back
              </button>
              <button
                type="button"
                data-testid="confirm-invoice-button"
                disabled={isSubmitting}
                onClick={handleFinalCheckout}
                className="px-5 py-2 bg-[#542047] hover:bg-[#421b48] text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#ffe8a8]" />
                    <span>Generating Invoice...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#ffe8a8]" />
                    <span>Confirm & Generate Invoice</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
