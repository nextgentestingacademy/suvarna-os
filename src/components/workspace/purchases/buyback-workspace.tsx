'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  Scale,
  Coins,
  Receipt,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Plus,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Building,
  User,
  Phone,
  CreditCard,
  Printer,
  History,
  ShieldCheck,
  Check,
  X,
  FileText,
} from 'lucide-react';
import {
  configureRateAction,
  getActiveRatesAction,
  getRateHistoryAction,
  createBuybackVoucherAction,
  listBuybackVouchersAction,
  SerializedRate,
  SerializedBuybackVoucher,
} from '@/app/actions/buyback';
import { formatInr } from '@/lib/indicative-pricing';
import { Decimal } from '@/lib/decimal';

interface BuybackWorkspaceProps {
  user: {
    id: string;
    name: string;
    role: string;
    tenantSlug: string;
    tenantName?: string;
  };
  branches: Array<{ id: string; name: string; code: string }>;
  activeBranchId?: string;
}

export function BuybackWorkspace({ user, branches, activeBranchId }: BuybackWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'counter' | 'rates' | 'vouchers'>('counter');
  const [isPending, startTransition] = useTransition();

  // Selected Branch
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    activeBranchId || (branches.length > 0 ? branches[0].id : '')
  );

  // Active Rates State
  const [activeRates, setActiveRates] = useState<any>(null);
  const [rateHistory, setRateHistory] = useState<SerializedRate[]>([]);
  const [isLoadingRates, setIsLoadingRates] = useState<boolean>(true);

  // Vouchers List State
  const [vouchers, setVouchers] = useState<SerializedBuybackVoucher[]>([]);
  const [voucherSearch, setVoucherSearch] = useState<string>('');
  const [isLoadingVouchers, setIsLoadingVouchers] = useState<boolean>(false);
  const [selectedVoucher, setSelectedVoucher] = useState<SerializedBuybackVoucher | null>(null);

  // Buyback Counter Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerPan, setCustomerPan] = useState('');

  const [metalType, setMetalType] = useState<'GOLD' | 'SILVER'>('GOLD');
  const [purity, setPurity] = useState<string>('22K');
  const [grossWeight, setGrossWeight] = useState<string>('');
  const [stoneWeight, setStoneWeight] = useState<string>('0.000');
  const [testingMethod, setTestingMethod] = useState<string>('TOUCHSTONE');
  const [testingNotes, setTestingNotes] = useState<string>('');

  const [deductionAmount, setDeductionAmount] = useState<string>('0');
  const [deductionReason, setDeductionReason] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'UPI' | 'EXCHANGE_CREDIT'>(
    'EXCHANGE_CREDIT'
  );
  const [paymentReference, setPaymentReference] = useState<string>('');

  // Status & Feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successVoucher, setSuccessVoucher] = useState<SerializedBuybackVoucher | null>(null);

  // Rate Update Form State
  const [rateFormMetal, setRateFormMetal] = useState<'GOLD' | 'SILVER'>('GOLD');
  const [rateFormPurity, setRateFormPurity] = useState<string>('22K');
  const [rateFormType, setRateFormType] = useState<'BUYING' | 'SELLING'>('BUYING');
  const [rateFormValue, setRateFormValue] = useState<string>('');
  const [rateFormNotes, setRateFormNotes] = useState<string>('');
  const [rateUpdateMsg, setRateUpdateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canManageRates = user.role === 'OWNER' || user.role === 'MANAGER';

  // Load Rates on mount
  const refreshRates = () => {
    setIsLoadingRates(true);
    startTransition(async () => {
      const res = await getActiveRatesAction();
      if (res.success && res.data) {
        setActiveRates(res.data);
      }
      const historyRes = await getRateHistoryAction();
      if (historyRes.success && historyRes.data) {
        setRateHistory(historyRes.data);
      }
      setIsLoadingRates(false);
    });
  };

  const refreshVouchers = () => {
    setIsLoadingVouchers(true);
    startTransition(async () => {
      const res = await listBuybackVouchersAction({
        branchId: selectedBranchId || undefined,
        searchQuery: voucherSearch || undefined,
      });
      if (res.success && res.data) {
        setVouchers(res.data);
      }
      setIsLoadingVouchers(false);
    });
  };

  useEffect(() => {
    refreshRates();
    refreshVouchers();
  }, [selectedBranchId]);

  // Derived current buying rate
  const rateKey = metalType === 'SILVER' ? 'SILVER' : purity;
  const currentBuyingRate = activeRates?.buying?.[rateKey] || null;
  const currentSellingRate = activeRates?.selling?.[rateKey] || null;

  // Pure live calculation
  const grossW = parseFloat(grossWeight) || 0;
  const stoneW = parseFloat(stoneWeight) || 0;
  const netW = Math.max(0, grossW - stoneW);
  const ratePerGram = currentBuyingRate?.ratePerGram ? parseFloat(currentBuyingRate.ratePerGram) : 0;
  const grossValue = netW * ratePerGram;
  const deduction = parseFloat(deductionAmount) || 0;
  const netPayable = Math.max(0, grossValue - deduction);
  const isPanRequired = netPayable > 200000;
  const isPanValid = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(customerPan.toUpperCase().trim());

  // Handle Rate Update Submit
  const handleRateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRateUpdateMsg(null);
    setErrorMessage(null);

    const numVal = parseFloat(rateFormValue);
    if (isNaN(numVal) || numVal <= 0) {
      setRateUpdateMsg({ type: 'error', text: 'Please enter a valid positive rate per gram.' });
      return;
    }

    startTransition(async () => {
      const res = await configureRateAction({
        metalType: rateFormMetal,
        purity: rateFormMetal === 'SILVER' ? 'SILVER' : rateFormPurity,
        rateType: rateFormType,
        ratePerGram: numVal,
        branchId: selectedBranchId || null,
        notes: rateFormNotes.trim() || undefined,
      });

      if (res.success) {
        setRateUpdateMsg({
          type: 'success',
          text: `Successfully updated ${rateFormType} rate for ${rateFormMetal} (${rateFormPurity}) to ₹${numVal.toFixed(2)}/g.`,
        });
        setRateFormValue('');
        setRateFormNotes('');
        refreshRates();
      } else {
        setRateUpdateMsg({ type: 'error', text: res.error || 'Failed to update rate.' });
      }
    });
  };

  // Handle Buyback Voucher Creation
  const handleBuybackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedBranchId) {
      setErrorMessage('Please select a showroom branch.');
      return;
    }

    if (!currentBuyingRate) {
      setErrorMessage(`No active buying rate configured for ${metalType} (${purity}). Configure rate first.`);
      return;
    }

    if (grossW <= 0 || netW <= 0) {
      setErrorMessage('Gross weight and net weight must be greater than zero.');
      return;
    }

    if (deduction > 0 && !deductionReason.trim()) {
      setErrorMessage('Please provide a specific reason for disclosed deduction (e.g. melting loss).');
      return;
    }

    if (isPanRequired && !isPanValid) {
      setErrorMessage('Statutory PAN Compliance (Rule 114B): Valid 10-character PAN required for amounts exceeding ₹2,00,000.');
      return;
    }

    startTransition(async () => {
      const res = await createBuybackVoucherAction({
        branchId: selectedBranchId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim() || null,
        customerPan: customerPan.trim().toUpperCase() || null,
        metalType,
        purity: metalType === 'SILVER' ? 'SILVER' : purity,
        grossWeight: grossW,
        stoneWeight: stoneW,
        testingMethod,
        testingNotes: testingNotes.trim() || null,
        deductionAmount: deduction,
        deductionReason: deductionReason.trim() || null,
        paymentMethod,
        paymentReference: paymentReference.trim() || null,
        idempotencyKey: `BB-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      });

      if (res.success && res.data) {
        setSuccessVoucher(res.data);
        // Reset form
        setGrossWeight('');
        setStoneWeight('0.000');
        setDeductionAmount('0');
        setDeductionReason('');
        setCustomerName('');
        setCustomerPhone('');
        setCustomerAddress('');
        setCustomerPan('');
        refreshVouchers();
      } else {
        setErrorMessage(res.error || 'Failed to post buyback voucher.');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Branch Scoping */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#eee2dc] shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#d49a24]">
            <Scale className="w-4 h-4" />
            <span>Precious Metal Valuation & Procurement</span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-[#542047] mt-1">Gold Purchase & Buyback Counter</h1>
          <p className="text-sm text-[#68647a] mt-0.5">
            Configure independent buying rates, verify assay tare weights, and execute secure buybacks with atomic ledger posting.
          </p>
        </div>

        {/* Branch Context Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#fcf9f8] px-3 py-2 rounded-xl border border-[#eee2dc]">
            <Building className="w-4 h-4 text-[#8a7a85]" />
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="bg-transparent text-sm font-semibold text-[#542047] outline-none cursor-pointer"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              refreshRates();
              refreshVouchers();
            }}
            disabled={isPending}
            className="p-2.5 bg-[#fcf9f8] hover:bg-[#eee2dc] rounded-xl border border-[#eee2dc] text-[#542047] transition disabled:opacity-50"
            title="Refresh Rates & Vouchers"
          >
            <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#eee2dc]">
        <button
          onClick={() => setActiveTab('counter')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'counter'
              ? 'border-[#542047] text-[#542047] bg-[#fcf9f8]'
              : 'border-transparent text-[#68647a] hover:text-[#542047]'
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Buyback Counter</span>
        </button>

        <button
          onClick={() => setActiveTab('rates')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'rates'
              ? 'border-[#542047] text-[#542047] bg-[#fcf9f8]'
              : 'border-transparent text-[#68647a] hover:text-[#542047]'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Buying & Selling Rates</span>
          {activeRates && (
            <span className="ml-1 px-2 py-0.5 bg-[#f5eef4] text-[#542047] rounded-full text-xs font-mono">
              Daily
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('vouchers')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'vouchers'
              ? 'border-[#542047] text-[#542047] bg-[#fcf9f8]'
              : 'border-transparent text-[#68647a] hover:text-[#542047]'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Buyback Vouchers</span>
          <span className="ml-1 px-2 py-0.5 bg-[#f5eef4] text-[#542047] rounded-full text-xs font-mono">
            {vouchers.length}
          </span>
        </button>
      </div>

      {/* TAB 1: BUYBACK COUNTER WORKFLOW */}
      {activeTab === 'counter' && (
        <div className="space-y-6">
          {/* Success Voucher Banner */}
          {successVoucher && (
            <div className="p-6 bg-[#f0f9f4] border border-[#a3e2c2] rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#168a53] flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-bold text-[#168a53]">
                    Buyback Voucher #{successVoucher.voucherNumber} Posted Successfully!
                  </h3>
                  <p className="text-xs text-[#2b6647] mt-0.5">
                    Acquired {successVoucher.netWeight}g of {successVoucher.purity} {successVoucher.metalType} for{' '}
                    <strong>₹{parseFloat(successVoucher.netPayable).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>.
                    Stock lot #{successVoucher.lotTagCode} inwarded into inventory.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedVoucher(successVoucher)}
                  className="px-4 py-2 bg-white border border-[#a3e2c2] text-[#168a53] rounded-xl text-xs font-bold hover:bg-[#e4f5ec] transition flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  View Voucher
                </button>
                <button
                  onClick={() => setSuccessVoucher(null)}
                  className="p-2 text-[#2b6647] hover:bg-[#e4f5ec] rounded-xl transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-4 bg-[#fdf2f4] border border-[#f5b8c6] rounded-xl flex items-center gap-3 text-[#b93657] text-sm font-medium">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Customer / Seller Identification */}
              <div className="bg-white p-6 rounded-2xl border border-[#eee2dc] shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#eee2dc] pb-3">
                  <h2 className="text-base font-serif font-bold text-[#542047] flex items-center gap-2">
                    <User className="w-4 h-4 text-[#d49a24]" />
                    <span>Customer / Seller Details</span>
                  </h2>
                  <span className="text-xs text-[#8a7a85]">Walk-in or registered KYC</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">
                      Full Legal Name <span className="text-[#b93657]">*</span>
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Ramesh Chandra Verma"
                      required
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] focus:border-[#542047] rounded-xl text-sm outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">
                      Mobile Number <span className="text-[#b93657]">*</span>
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      required
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] focus:border-[#542047] rounded-xl text-sm font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">
                      PAN Card Number {isPanRequired && <span className="text-[#b93657] font-semibold">(Mandatory for &gt; ₹2 Lakhs)</span>}
                    </label>
                    <input
                      type="text"
                      value={customerPan}
                      onChange={(e) => setCustomerPan(e.target.value.toUpperCase())}
                      placeholder="ABCDE1234F"
                      maxLength={10}
                      className={`w-full px-3 py-2 bg-white border rounded-xl text-sm font-mono uppercase outline-none ${
                        isPanRequired && !isPanValid
                          ? 'border-[#b93657] bg-[#fdf2f4]'
                          : 'border-[#eee2dc] focus:border-[#542047]'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">City / Residential Address</label>
                    <input
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="e.g. Thane West, Maharashtra"
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] focus:border-[#542047] rounded-xl text-sm outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Metal Specification & Assay Tare Verification */}
              <div className="bg-white p-6 rounded-2xl border border-[#eee2dc] shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#eee2dc] pb-3">
                  <h2 className="text-base font-serif font-bold text-[#542047] flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[#d49a24]" />
                    <span>Metal & Tare Weight Verification</span>
                  </h2>
                  <span className="text-xs text-[#8a7a85]">Assay and scale testing</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Metal Type */}
                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">Metal Type</label>
                    <select
                      value={metalType}
                      onChange={(e) => {
                        const m = e.target.value as 'GOLD' | 'SILVER';
                        setMetalType(m);
                        if (m === 'SILVER') setPurity('SILVER');
                        else setPurity('22K');
                      }}
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-sm font-semibold text-[#542047] outline-none"
                    >
                      <option value="GOLD">Gold (Au)</option>
                      <option value="SILVER">Silver (Ag)</option>
                    </select>
                  </div>

                  {/* Purity */}
                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">Verified Purity</label>
                    {metalType === 'GOLD' ? (
                      <select
                        value={purity}
                        onChange={(e) => setPurity(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-sm font-semibold text-[#542047] outline-none"
                      >
                        <option value="24K">24K (99.9% Pure)</option>
                        <option value="22K">22K (91.6% Hallmark)</option>
                        <option value="18K">18K (75.0% Purity)</option>
                        <option value="14K">14K (58.5% Purity)</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        value="Silver (99.9% Fine)"
                        disabled
                        className="w-full px-3 py-2 bg-[#fcf9f8] border border-[#eee2dc] rounded-xl text-sm font-semibold text-[#8a7a85]"
                      />
                    )}
                  </div>

                  {/* Assay Testing Method */}
                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">Testing Method</label>
                    <select
                      value={testingMethod}
                      onChange={(e) => setTestingMethod(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-sm outline-none"
                    >
                      <option value="TOUCHSTONE">Touchstone / Acid Assay</option>
                      <option value="XRF">XRF Spectrometry</option>
                      <option value="SPECIFIC_GRAVITY">Specific Gravity (Hydrostatic)</option>
                      <option value="ELECTRONIC">Electronic Tester</option>
                    </select>
                  </div>
                </div>

                {/* Weight Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">
                      Gross Weight (g) <span className="text-[#b93657]">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={grossWeight}
                      onChange={(e) => setGrossWeight(e.target.value)}
                      placeholder="0.000"
                      required
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] focus:border-[#542047] rounded-xl text-sm font-mono font-bold text-right outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">Stone / Tare Weight (g)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={stoneWeight}
                      onChange={(e) => setStoneWeight(e.target.value)}
                      placeholder="0.000"
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] focus:border-[#542047] rounded-xl text-sm font-mono font-bold text-right outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">Verified Net Metal (g)</label>
                    <input
                      type="text"
                      value={`${netW.toFixed(3)} g`}
                      disabled
                      className="w-full px-3 py-2 bg-[#fcf9f8] border border-[#eee2dc] rounded-xl text-sm font-mono font-bold text-[#542047] text-right"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#542047] mb-1">Assay & Physical Inspection Notes</label>
                  <input
                    type="text"
                    value={testingNotes}
                    onChange={(e) => setTestingNotes(e.target.value)}
                    placeholder="e.g. Acid test positive 22K mark; unhallmarked antique bangle; stones extracted manually"
                    className="w-full px-3 py-2 bg-white border border-[#eee2dc] focus:border-[#542047] rounded-xl text-xs outline-none"
                  />
                </div>
              </div>

              {/* Deductions & Tender Options */}
              <div className="bg-white p-6 rounded-2xl border border-[#eee2dc] shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#eee2dc] pb-3">
                  <h2 className="text-base font-serif font-bold text-[#542047] flex items-center gap-2">
                    <Coins className="w-4 h-4 text-[#d49a24]" />
                    <span>Deductions & Settlement Tender</span>
                  </h2>
                  <span className="text-xs text-[#8a7a85]">Disclosed deductions only</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">Deduction Amount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={deductionAmount}
                      onChange={(e) => setDeductionAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] focus:border-[#542047] rounded-xl text-sm font-mono font-bold text-right outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">
                      Deduction Reason {deduction > 0 && <span className="text-[#b93657]">*</span>}
                    </label>
                    <input
                      type="text"
                      value={deductionReason}
                      onChange={(e) => setDeductionReason(e.target.value)}
                      placeholder="e.g. Melting loss 1.5% or dirt removal"
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] focus:border-[#542047] rounded-xl text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] rounded-xl text-sm font-semibold text-[#542047] outline-none"
                    >
                      <option value="EXCHANGE_CREDIT">Old Gold Exchange Credit (Redeem at POS)</option>
                      <option value="CASH">Cash Payout (From Counter 1010)</option>
                      <option value="BANK_TRANSFER">Bank Transfer (NEFT / RTGS 1040)</option>
                      <option value="UPI">UPI Transfer (1020)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">Payment / Cheque / UTR Reference</label>
                    <input
                      type="text"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="e.g. Bank UTR / Cash voucher memo"
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] focus:border-[#542047] rounded-xl text-sm outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Col: Valuation Summary Card */}
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-[#eee2dc] shadow-sm space-y-5 sticky top-6">
                <div className="border-b border-[#eee2dc] pb-3">
                  <h3 className="text-base font-serif font-bold text-[#542047]">Buyback Valuation Preview</h3>
                  <p className="text-xs text-[#8a7a85] mt-0.5">Authoritative real-time calculation</p>
                </div>

                {/* Rate Status Alert */}
                {currentBuyingRate ? (
                  <div className="p-3 bg-[#fcf9f8] rounded-xl border border-[#eee2dc] flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[#8a7a85] block">Locked Buying Rate:</span>
                      <span className="font-mono font-bold text-sm text-[#542047]">
                        ₹{parseFloat(currentBuyingRate.ratePerGram).toLocaleString('en-IN', { minimumFractionDigits: 2 })}/g
                      </span>
                    </div>
                    <span className="px-2 py-0.5 bg-[#f0f9f4] text-[#168a53] border border-[#a3e2c2] rounded-full text-[10px] font-bold">
                      {currentBuyingRate.source}
                    </span>
                  </div>
                ) : (
                  <div className="p-3 bg-[#fdf2f4] rounded-xl border border-[#f5b8c6] text-xs text-[#b93657] flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-4 h-4" />
                      <span>No Active Buying Rate</span>
                    </div>
                    <p>
                      No buying rate is configured for {metalType} ({purity}). You must set a rate before processing buybacks.
                    </p>
                    {canManageRates && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('rates')}
                        className="text-left font-bold underline hover:text-[#542047]"
                      >
                        Click to Configure Buying Rate &rarr;
                      </button>
                    )}
                  </div>
                )}

                {/* Computation Breakdown */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between text-[#68647a]">
                    <span>Gross Scale Weight:</span>
                    <span className="font-mono font-bold text-[#542047]">{grossW.toFixed(3)} g</span>
                  </div>
                  <div className="flex justify-between text-[#68647a]">
                    <span>Less Non-Metal Tare:</span>
                    <span className="font-mono text-[#8a7a85]">-{stoneW.toFixed(3)} g</span>
                  </div>
                  <div className="flex justify-between text-[#542047] font-semibold pt-1 border-t border-[#f5eef4]">
                    <span>Verified Net Metal Weight:</span>
                    <span className="font-mono font-bold">{netW.toFixed(3)} g</span>
                  </div>
                  <div className="flex justify-between text-[#68647a]">
                    <span>Effective Buying Rate:</span>
                    <span className="font-mono text-[#542047]">₹{ratePerGram.toFixed(2)}/g</span>
                  </div>
                  <div className="flex justify-between text-[#542047] font-semibold pt-1 border-t border-[#f5eef4]">
                    <span>Gross Metal Value:</span>
                    <span className="font-mono font-bold">
                      ₹{grossValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#b93657]">
                    <span>Disclosed Deductions:</span>
                    <span className="font-mono font-bold">
                      -₹{deduction.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Total Net Payable Highlight */}
                <div className="p-4 bg-[#f5eef4] rounded-xl border border-[#ebdce8]">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#542047] block">
                    Net Customer Payable / Credit
                  </span>
                  <div className="text-2xl font-serif font-bold text-[#542047] mt-1 font-mono">
                    ₹{netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span className="text-[11px] text-[#8a7a85] block mt-1">
                    Tender Mode: {paymentMethod === 'EXCHANGE_CREDIT' ? 'Old Gold Exchange Credit' : paymentMethod}
                  </span>
                </div>

                {/* Statutory KYC PAN alert */}
                {isPanRequired && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                      isPanValid
                        ? 'bg-[#f0f9f4] border-[#a3e2c2] text-[#168a53]'
                        : 'bg-[#fdf2f4] border-[#f5b8c6] text-[#b93657]'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Income Tax Rule 114B</span>
                      <span>
                        Transactions &gt; ₹2,00,000 require valid customer PAN.{' '}
                        {isPanValid ? 'Verified.' : 'Please enter seller PAN above.'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Submit Action */}
                <button
                  type="button"
                  onClick={handleBuybackSubmit}
                  disabled={isPending || !currentBuyingRate || netW <= 0 || (isPanRequired && !isPanValid)}
                  className="w-full py-3 bg-[#542047] hover:bg-[#3d1633] text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm & Post Buyback Voucher</span>
                </button>

                <p className="text-[11px] text-[#8a7a85] text-center">
                  Posts atomic double-entry journal (Dr 1220 / Cr Tender) and creates traceable inventory lot.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BUYING & SELLING RATES */}
      {activeTab === 'rates' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Rates Overview Table */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-[#eee2dc] shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[#eee2dc] pb-3">
                <div>
                  <h2 className="text-base font-serif font-bold text-[#542047]">Active Showroom Bullion Rates</h2>
                  <p className="text-xs text-[#68647a]">Independent buying rates vs selling rates per gram</p>
                </div>
                <span className="text-xs text-[#8a7a85] font-mono">Currency: INR (₹/g)</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#eee2dc] text-xs font-bold text-[#8a7a85] uppercase">
                      <th className="py-2.5">Metal & Purity</th>
                      <th className="py-2.5 text-right">Buying Rate</th>
                      <th className="py-2.5 text-right">Selling Rate</th>
                      <th className="py-2.5 text-right">Spread / Margin</th>
                      <th className="py-2.5 text-center">Buying Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5eef4]">
                    {[
                      { metal: 'GOLD', purity: '24K', label: '24K Fine Gold (999)' },
                      { metal: 'GOLD', purity: '22K', label: '22K Standard Gold (916)' },
                      { metal: 'GOLD', purity: '18K', label: '18K Jewellery Gold (750)' },
                      { metal: 'GOLD', purity: '14K', label: '14K Modern Gold (585)' },
                      { metal: 'SILVER', purity: 'SILVER', label: 'Silver Fine (999)' },
                    ].map((row) => {
                      const key = row.metal === 'SILVER' ? 'SILVER' : row.purity;
                      const bRate = activeRates?.buying?.[key];
                      const sRate = activeRates?.selling?.[key];

                      const bNum = bRate ? parseFloat(bRate.ratePerGram) : null;
                      const sNum = sRate ? parseFloat(sRate.ratePerGram) : null;
                      const spread = bNum && sNum ? sNum - bNum : null;

                      return (
                        <tr key={key} className="hover:bg-[#fcf9f8] transition">
                          <td className="py-3 font-semibold text-[#542047]">{row.label}</td>
                          <td className="py-3 text-right font-mono font-bold text-[#168a53]">
                            {bNum ? `₹${bNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                          </td>
                          <td className="py-3 text-right font-mono font-bold text-[#542047]">
                            {sNum ? `₹${sNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                          </td>
                          <td className="py-3 text-right font-mono text-xs text-[#8a7a85]">
                            {spread !== null ? `₹${spread.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-3 text-center">
                            {bRate ? (
                              <span className="px-2 py-0.5 bg-[#f0f9f4] text-[#168a53] border border-[#a3e2c2] rounded-full text-[11px] font-bold">
                                Configured
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-[#fdf2f4] text-[#b93657] border border-[#f5b8c6] rounded-full text-[11px] font-bold">
                                Not Set
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Rate Update Form (RBAC: OWNER/MANAGER) */}
            <div className="bg-white p-6 rounded-2xl border border-[#eee2dc] shadow-sm space-y-4">
              <div className="border-b border-[#eee2dc] pb-3">
                <h3 className="text-base font-serif font-bold text-[#542047]">Configure Rate</h3>
                <p className="text-xs text-[#8a7a85]">
                  {canManageRates ? 'Update buying or selling bullion benchmark' : 'Requires OWNER or MANAGER role'}
                </p>
              </div>

              {rateUpdateMsg && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold ${
                    rateUpdateMsg.type === 'success'
                      ? 'bg-[#f0f9f4] border border-[#a3e2c2] text-[#168a53]'
                      : 'bg-[#fdf2f4] border border-[#f5b8c6] text-[#b93657]'
                  }`}
                >
                  {rateUpdateMsg.text}
                </div>
              )}

              {canManageRates ? (
                <form onSubmit={handleRateSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">Rate Type to Update</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRateFormType('BUYING')}
                        className={`py-1.5 rounded-lg text-xs font-bold border transition ${
                          rateFormType === 'BUYING'
                            ? 'bg-[#168a53] text-white border-[#168a53]'
                            : 'bg-white text-[#68647a] border-[#eee2dc]'
                        }`}
                      >
                        Buying Rate
                      </button>
                      <button
                        type="button"
                        onClick={() => setRateFormType('SELLING')}
                        className={`py-1.5 rounded-lg text-xs font-bold border transition ${
                          rateFormType === 'SELLING'
                            ? 'bg-[#542047] text-white border-[#542047]'
                            : 'bg-white text-[#68647a] border-[#eee2dc]'
                        }`}
                      >
                        Selling Rate
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-[#542047] mb-1">Metal</label>
                      <select
                        value={rateFormMetal}
                        onChange={(e) => {
                          const m = e.target.value as 'GOLD' | 'SILVER';
                          setRateFormMetal(m);
                          if (m === 'SILVER') setRateFormPurity('SILVER');
                          else setRateFormPurity('22K');
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-[#eee2dc] rounded-lg text-xs font-semibold outline-none"
                      >
                        <option value="GOLD">Gold</option>
                        <option value="SILVER">Silver</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#542047] mb-1">Purity</label>
                      {rateFormMetal === 'GOLD' ? (
                        <select
                          value={rateFormPurity}
                          onChange={(e) => setRateFormPurity(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-[#eee2dc] rounded-lg text-xs font-semibold outline-none"
                        >
                          <option value="24K">24K</option>
                          <option value="22K">22K</option>
                          <option value="18K">18K</option>
                          <option value="14K">14K</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value="Silver"
                          disabled
                          className="w-full px-2.5 py-1.5 bg-[#fcf9f8] border border-[#eee2dc] rounded-lg text-xs text-[#8a7a85]"
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">New Rate (₹ per gram)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={rateFormValue}
                      onChange={(e) => setRateFormValue(e.target.value)}
                      placeholder="e.g. 11800.00"
                      required
                      className="w-full px-3 py-2 bg-white border border-[#eee2dc] focus:border-[#542047] rounded-lg text-sm font-mono font-bold text-right outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#542047] mb-1">Audit Reason / Memo</label>
                    <input
                      type="text"
                      value={rateFormNotes}
                      onChange={(e) => setRateFormNotes(e.target.value)}
                      placeholder="e.g. Morning market baseline update"
                      className="w-full px-2.5 py-1.5 bg-white border border-[#eee2dc] rounded-lg text-xs outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full py-2.5 bg-[#542047] hover:bg-[#3d1633] text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                  >
                    Save Rate & Audit Log
                  </button>
                </form>
              ) : (
                <div className="p-4 bg-[#fcf9f8] rounded-xl text-xs text-[#8a7a85] space-y-2">
                  <p>Only users with Store Manager or Owner roles have authorization to change daily buying and selling rates.</p>
                </div>
              )}
            </div>
          </div>

          {/* Rate Audit History */}
          <div className="bg-white p-6 rounded-2xl border border-[#eee2dc] shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[#eee2dc] pb-3">
              <h2 className="text-base font-serif font-bold text-[#542047] flex items-center gap-2">
                <History className="w-4 h-4 text-[#d49a24]" />
                <span>Rate Change Audit Trail</span>
              </h2>
              <span className="text-xs text-[#8a7a85]">Full historical record</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#eee2dc] font-bold text-[#8a7a85] uppercase">
                    <th className="py-2">Effective Timestamp</th>
                    <th className="py-2">Metal / Purity</th>
                    <th className="py-2">Rate Type</th>
                    <th className="py-2 text-right">Rate (₹/g)</th>
                    <th className="py-2">Source</th>
                    <th className="py-2">Updated By</th>
                    <th className="py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f5eef4]">
                  {rateHistory.length > 0 ? (
                    rateHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-[#fcf9f8]">
                        <td className="py-2 font-mono text-[#68647a]">
                          {new Date(item.effectiveFrom).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 font-semibold text-[#542047]">
                          {item.metalType} ({item.purity})
                        </td>
                        <td className="py-2 font-bold">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] ${
                              item.rateType === 'BUYING'
                                ? 'bg-[#f0f9f4] text-[#168a53]'
                                : 'bg-[#f5eef4] text-[#542047]'
                            }`}
                          >
                            {item.rateType}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono font-bold text-[#542047]">
                          ₹{parseFloat(item.ratePerGram).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 text-[#8a7a85]">{item.source}</td>
                        <td className="py-2 font-medium text-[#542047]">{item.createdByName || 'System'}</td>
                        <td className="py-2 text-[#8a7a85]">{item.notes || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-xs text-[#8a7a85]">
                        No rate changes recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BUYBACK VOUCHERS REGISTER */}
      {activeTab === 'vouchers' && (
        <div className="bg-white p-6 rounded-2xl border border-[#eee2dc] shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#eee2dc] pb-4">
            <div>
              <h2 className="text-base font-serif font-bold text-[#542047]">Buyback Vouchers Register</h2>
              <p className="text-xs text-[#68647a]">Chronological ledger of old gold procurements and customer settlements</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-[#8a7a85] absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={voucherSearch}
                  onChange={(e) => setVoucherSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && refreshVouchers()}
                  placeholder="Search voucher #, customer, phone..."
                  className="pl-9 pr-3 py-1.5 bg-[#fcf9f8] border border-[#eee2dc] rounded-xl text-xs outline-none w-64"
                />
              </div>

              <button
                onClick={refreshVouchers}
                className="px-3 py-1.5 bg-[#542047] text-white rounded-xl text-xs font-bold hover:bg-[#3d1633] transition"
              >
                Search
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#eee2dc] font-bold text-[#8a7a85] uppercase">
                  <th className="py-2.5">Voucher #</th>
                  <th className="py-2.5">Date</th>
                  <th className="py-2.5">Customer / Seller</th>
                  <th className="py-2.5">Metal & Purity</th>
                  <th className="py-2.5 text-right">Net Wt (g)</th>
                  <th className="py-2.5 text-right">Buying Rate</th>
                  <th className="py-2.5 text-right">Net Payable</th>
                  <th className="py-2.5">Tender Mode</th>
                  <th className="py-2.5">Stock Lot</th>
                  <th className="py-2.5 text-center">Status</th>
                  <th className="py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5eef4]">
                {vouchers.length > 0 ? (
                  vouchers.map((v) => (
                    <tr key={v.id} className="hover:bg-[#fcf9f8] transition">
                      <td className="py-3 font-mono font-bold text-[#542047]">{v.voucherNumber}</td>
                      <td className="py-3 text-[#68647a]">{new Date(v.createdAt).toLocaleDateString('en-IN')}</td>
                      <td className="py-3 font-medium text-[#542047]">
                        <div>{v.customerName}</div>
                        <div className="text-[10px] text-[#8a7a85] font-mono">{v.customerPhone}</div>
                      </td>
                      <td className="py-3 font-semibold text-[#542047]">
                        {v.purity} {v.metalType}
                      </td>
                      <td className="py-3 text-right font-mono font-bold text-[#542047]">
                        {parseFloat(v.netWeight).toFixed(3)}
                      </td>
                      <td className="py-3 text-right font-mono text-[#68647a]">
                        ₹{parseFloat(v.appliedRate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 text-right font-mono font-bold text-[#168a53]">
                        ₹{parseFloat(v.netPayable).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 text-[#68647a]">{v.paymentMethod}</td>
                      <td className="py-3 font-mono text-[11px] text-[#542047]">{v.lotTagCode || '—'}</td>
                      <td className="py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            v.status === 'EXCHANGED'
                              ? 'bg-[#eef2ff] text-[#4f46e5]'
                              : v.status === 'PARTIALLY_REDEEMED'
                              ? 'bg-[#fffbeb] text-[#b45309]'
                              : v.status === 'SETTLED'
                              ? 'bg-[#f0f9f4] text-[#168a53]'
                              : 'bg-[#f5eef4] text-[#542047]'
                          }`}
                        >
                          {v.status}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <button
                          onClick={() => setSelectedVoucher(v)}
                          className="px-2.5 py-1 bg-[#fcf9f8] hover:bg-[#eee2dc] border border-[#eee2dc] rounded-lg text-xs font-semibold text-[#542047] transition"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-xs text-[#8a7a85]">
                      {isLoadingVouchers ? 'Loading buyback vouchers...' : 'No buyback vouchers found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VOUCHER DETAIL & PRINT MODAL */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-5 border border-[#eee2dc] shadow-2xl relative">
            <button
              onClick={() => setSelectedVoucher(null)}
              className="absolute top-5 right-5 p-1.5 text-[#8a7a85] hover:text-[#542047] rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="border-b border-[#eee2dc] pb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#d49a24]">
                Official Buyback Receipt
              </span>
              <h2 className="text-xl font-serif font-bold text-[#542047] mt-0.5">
                Voucher #{selectedVoucher.voucherNumber}
              </h2>
              <span className="text-xs text-[#8a7a85]">
                Issued on {new Date(selectedVoucher.createdAt).toLocaleString('en-IN')}
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-[#fcf9f8] rounded-xl border border-[#eee2dc]">
                <div>
                  <span className="text-[#8a7a85] block">Seller:</span>
                  <span className="font-bold text-[#542047]">{selectedVoucher.customerName}</span>
                </div>
                <div>
                  <span className="text-[#8a7a85] block">Phone:</span>
                  <span className="font-mono text-[#542047]">{selectedVoucher.customerPhone}</span>
                </div>
                {selectedVoucher.customerPan && (
                  <div>
                    <span className="text-[#8a7a85] block">Seller PAN:</span>
                    <span className="font-mono font-bold text-[#542047]">{selectedVoucher.customerPan}</span>
                  </div>
                )}
                <div>
                  <span className="text-[#8a7a85] block">Tender Method:</span>
                  <span className="font-semibold text-[#542047]">{selectedVoucher.paymentMethod}</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-b border-[#eee2dc] py-3">
                <div className="flex justify-between">
                  <span className="text-[#68647a]">Metal & Verified Purity:</span>
                  <span className="font-bold text-[#542047]">
                    {selectedVoucher.purity} {selectedVoucher.metalType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#68647a]">Gross Scale Weight:</span>
                  <span className="font-mono">{parseFloat(selectedVoucher.grossWeight).toFixed(3)} g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#68647a]">Stone / Tare Deduction:</span>
                  <span className="font-mono text-[#8a7a85]">
                    -{parseFloat(selectedVoucher.stoneWeight).toFixed(3)} g
                  </span>
                </div>
                <div className="flex justify-between font-bold text-[#542047]">
                  <span>Verified Net Metal Weight:</span>
                  <span className="font-mono">{parseFloat(selectedVoucher.netWeight).toFixed(3)} g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#68647a]">Locked Buying Rate:</span>
                  <span className="font-mono">
                    ₹{parseFloat(selectedVoucher.appliedRate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}/g
                  </span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Gross Metal Value:</span>
                  <span className="font-mono">
                    ₹{parseFloat(selectedVoucher.grossAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {parseFloat(selectedVoucher.deductionAmount) > 0 && (
                  <div className="flex justify-between text-[#b93657]">
                    <span>Deduction ({selectedVoucher.deductionReason || 'Melting loss'}):</span>
                    <span className="font-mono">
                      -₹{parseFloat(selectedVoucher.deductionAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-[#168a53] pt-1 border-t border-[#f5eef4]">
                  <span>Net Payable Amount:</span>
                  <span className="font-mono">
                    ₹{parseFloat(selectedVoucher.netPayable).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {selectedVoucher.paymentMethod === 'EXCHANGE_CREDIT' && (
                  <>
                    <div className="flex justify-between text-xs text-[#8a7a85] pt-1">
                      <span>Redeemed Against Bills:</span>
                      <span className="font-mono text-[#542047]">
                        ₹{parseFloat(selectedVoucher.redeemedAmount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-[#b45309]">
                      <span>Remaining Exchange Balance:</span>
                      <span className="font-mono">
                        ₹{parseFloat(selectedVoucher.availableBalance || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="p-3 bg-[#f5eef4] rounded-xl text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#8a7a85]">Inventory Lot Tag:</span>
                  <span className="font-mono font-bold text-[#542047]">{selectedVoucher.lotTagCode}</span>
                </div>
                {selectedVoucher.approvedById && (
                  <div className="flex justify-between">
                    <span className="text-[#8a7a85]">Manager Authorization:</span>
                    <span className="font-mono font-bold text-[#168a53]">Verified</span>
                  </div>
                )}
                {selectedVoucher.exchangeInvoiceNumber && (
                  <div className="flex justify-between">
                    <span className="text-[#8a7a85]">Linked POS Invoice:</span>
                    <span className="font-mono font-bold text-[#4f46e5]">
                      {selectedVoucher.exchangeInvoiceNumber}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-[#fcf9f8] hover:bg-[#eee2dc] border border-[#eee2dc] text-[#542047] rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Voucher
              </button>
              <button
                type="button"
                onClick={() => setSelectedVoucher(null)}
                className="px-4 py-2 bg-[#542047] text-white rounded-xl text-xs font-bold hover:bg-[#3d1633] transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
