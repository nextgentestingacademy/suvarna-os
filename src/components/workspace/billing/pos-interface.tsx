'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Receipt,
  Store,
  Sparkles,
  CheckCircle2,
  Printer,
  History,
  X,
  ArrowRight,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';
import { SerializedOrnament } from '@/app/actions/inventory';
import { SerializedCustomer } from '@/app/actions/customer';
import {
  SerializedInvoice,
  SerializedCartTotalsResult,
  calculateCartTotalsAction,
} from '@/app/actions/billing';
import { PosOrnamentSelector } from './pos-ornament-selector';
import { PosCustomerSelector, WalkInCustomerDetails } from './pos-customer-selector';
import { PosCart, CartItem } from './pos-cart';
import { PosCheckoutPanel } from './pos-checkout-panel';

// Indicative Showroom Daily Market Rates for automated rate resolution
const SHOWROOM_DAILY_RATES: Record<string, number> = {
  '24K': 13250,
  '22K': 12150,
  '18K': 9940,
  '14K': 7730,
  'SILVER': 168,
};

interface PosInterfaceProps {
  activeBranch: {
    id: string;
    name: string;
    code: string;
    city: string;
    state: string;
    addressLine1?: string | null;
    phone?: string | null;
  };
  availableOrnaments: SerializedOrnament[];
  initialCustomers: SerializedCustomer[];
  recentInvoices: SerializedInvoice[];
}

export function PosInterface({
  activeBranch,
  availableOrnaments,
  initialCustomers,
  recentInvoices: initialRecentInvoices,
}: PosInterfaceProps) {
  // Master Cashier State
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<SerializedCustomer | null>(null);
  const [customerMode, setCustomerMode] = useState<'REGISTERED' | 'WALK_IN'>('REGISTERED');
  const [walkInDetails, setWalkInDetails] = useState<WalkInCustomerDetails>({
    name: '',
    phone: '',
    pan: '',
    address: '',
    city: activeBranch.city || 'Mumbai',
    state: activeBranch.state || 'Maharashtra',
    pincode: '',
  });

  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0);
  const [totals, setTotals] = useState<SerializedCartTotalsResult | null>(null);
  const [checkoutSuccessInvoice, setCheckoutSuccessInvoice] = useState<SerializedInvoice | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<SerializedInvoice[]>(initialRecentInvoices);
  const [isRecentInvoicesOpen, setIsRecentInvoicesOpen] = useState(false);

  // Helper to resolve daily rate based on ornament purity & metal
  const resolveDailyRate = (ornament: SerializedOrnament): number => {
    if (ornament.metalType?.toUpperCase() === 'SILVER') {
      return SHOWROOM_DAILY_RATES['SILVER'];
    }
    const purity = ornament.purity?.toUpperCase() || '22K';
    return SHOWROOM_DAILY_RATES[purity] || 12150;
  };

  // Add ornament to bill
  const handleAddOrnament = (ornament: SerializedOrnament) => {
    // Prevent duplicate
    if (cartItems.some((ci) => ci.ornament.id === ornament.id)) return;

    const rate = resolveDailyRate(ornament);
    const mcType = (ornament.makingChargeType as any) || 'PER_GRAM';
    const mcRate = ornament.makingChargeValue ? parseFloat(ornament.makingChargeValue) : 750;

    const newItem: CartItem = {
      ornament,
      pricingMode: 'WEIGHT_BASED',
      ratePerGram: rate,
      makingChargeType: mcType,
      makingChargeRate: mcRate,
      stoneCharges: 0,
      itemDiscount: 0,
    };

    setCartItems((prev) => [...prev, newItem]);
  };

  // Remove ornament from bill
  const handleRemoveItem = (ornamentId: string) => {
    setCartItems((prev) => prev.filter((ci) => ci.ornament.id !== ornamentId));
  };

  // Update item rate
  const handleUpdateItemRate = (ornamentId: string, rate: number) => {
    setCartItems((prev) =>
      prev.map((ci) => (ci.ornament.id === ornamentId ? { ...ci, ratePerGram: rate } : ci))
    );
  };

  // Update item discount
  const handleUpdateItemDiscount = (ornamentId: string, discount: number) => {
    setCartItems((prev) =>
      prev.map((ci) => (ci.ornament.id === ornamentId ? { ...ci, itemDiscount: discount } : ci))
    );
  };

  // Clear all items in cart
  const handleClearCart = () => {
    if (cartItems.length === 0) return;
    setCartItems([]);
    setInvoiceDiscount(0);
    setTotals(null);
  };

  // Start new bill after successful sale
  const handleStartNewBill = () => {
    setCartItems([]);
    setSelectedCustomer(null);
    setCustomerMode('REGISTERED');
    setWalkInDetails({
      name: '',
      phone: '',
      pan: '',
      address: '',
      city: activeBranch.city || 'Mumbai',
      state: activeBranch.state || 'Maharashtra',
      pincode: '',
    });
    setInvoiceDiscount(0);
    setTotals(null);
    setCheckoutSuccessInvoice(null);
  };

  // Authoritative server-side calculation effect
  useEffect(() => {
    if (cartItems.length === 0) {
      setTotals(null);
      return;
    }

    let isMounted = true;
    const calculateTotals = async () => {
      try {
        const customerState =
          customerMode === 'REGISTERED'
            ? selectedCustomer?.state
            : walkInDetails.state;

        const res = await calculateCartTotalsAction({
          items: cartItems.map((ci) => ({
            ornamentId: ci.ornament.id,
            pricingMode: ci.pricingMode,
            grossWeight: ci.ornament.grossWeight,
            stoneWeight: ci.ornament.stoneWeight,
            ratePerGram: ci.ratePerGram,
            makingChargeType: ci.makingChargeType,
            makingChargeRate: ci.makingChargeRate,
            stoneCharges: ci.stoneCharges,
            itemDiscount: ci.itemDiscount,
          })),
          discountAmount: invoiceDiscount,
          customerState,
        });

        if (isMounted && res.success && res.data) {
          setTotals(res.data);
        }
      } catch {
        // graceful calculation fallback
      }
    };

    calculateTotals();

    return () => {
      isMounted = false;
    };
  }, [cartItems, invoiceDiscount, customerMode, selectedCustomer, walkInDetails.state]);

  const handleCheckoutSuccess = (invoice: SerializedInvoice) => {
    setCheckoutSuccessInvoice(invoice);
    setRecentInvoices((prev) => [invoice, ...prev.slice(0, 9)]);
  };

  return (
    <div className="space-y-4">
      {/* Showroom Header & Live Status Ribbon */}
      <div className="bg-white p-4 rounded-2xl border border-[#eee2dc] shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-[#e2f6e8] text-[#246743] rounded text-[10px] font-bold tracking-wider uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#246743] animate-pulse" />
              LIVE DATABASE
            </span>
            <span className="text-[11px] font-bold text-[#542047] flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-[#d49a24]" />
              {activeBranch.name} ({activeBranch.code})
            </span>
          </div>
          <h1 className="font-serif font-bold text-2xl text-[#542047]">
            Point of Sale & Retail Billing
          </h1>
          <p className="text-xs text-[#68647a]">
            Issue sequential GST-compliant tax invoices, scan barcodes, and process multi-tender showroom sales.
          </p>
        </div>

        {/* Right Actions: Recent Invoices & Showroom Rates */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setIsRecentInvoicesOpen(true)}
            className="px-3.5 py-2 bg-[#fffaf5] hover:bg-[#fff0dc] border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <History className="w-4 h-4 text-[#d49a24]" />
            <span>Recent Invoices</span>
            <span className="px-1.5 py-0.2 bg-[#542047] text-white rounded text-[10px] font-bold ml-1">
              {recentInvoices.length}
            </span>
          </button>
        </div>
      </div>

      {/* Showroom Daily Rates Bar */}
      <div className="bg-[#fffaf5] border border-[#eee2dc] px-4 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-[#542047] font-bold">
          <TrendingUp className="w-4 h-4 text-[#d49a24]" />
          <span>Active Showroom Daily Rates:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-[11px]">
          <span className="bg-white px-2 py-0.5 rounded-lg border border-[#eee2dc]">
            <strong className="text-[#542047]">24K Gold:</strong> ₹13,250/g
          </span>
          <span className="bg-white px-2 py-0.5 rounded-lg border border-[#eee2dc]">
            <strong className="text-[#542047]">22K Gold:</strong> ₹12,150/g
          </span>
          <span className="bg-white px-2 py-0.5 rounded-lg border border-[#eee2dc]">
            <strong className="text-[#542047]">18K Gold:</strong> ₹9,940/g
          </span>
          <span className="bg-white px-2 py-0.5 rounded-lg border border-[#eee2dc]">
            <strong className="text-[#542047]">Silver:</strong> ₹168/g
          </span>
        </div>
      </div>

      {/* Main Cashier POS Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (Items & Barcode Selector) - 7 cols */}
        <div className="lg:col-span-7 space-y-4">
          {/* Barcode & Search Input */}
          <PosOrnamentSelector
            availableOrnaments={availableOrnaments}
            cartOrnamentIds={cartItems.map((ci) => ci.ornament.id)}
            onAddOrnament={handleAddOrnament}
            activeBranchName={activeBranch.name}
          />

          {/* Cart Table / Items List */}
          <PosCart
            cartItems={cartItems}
            calculatedItems={totals?.calculatedItems || []}
            onRemoveItem={handleRemoveItem}
            onUpdateItemRate={handleUpdateItemRate}
            onUpdateItemDiscount={handleUpdateItemDiscount}
            onClearCart={handleClearCart}
          />
        </div>

        {/* Right Column (Customer & Checkout Panel) - 5 cols */}
        <div className="lg:col-span-5 space-y-4">
          {/* Customer Selection */}
          <PosCustomerSelector
            customerMode={customerMode}
            onCustomerModeChange={setCustomerMode}
            selectedCustomer={selectedCustomer}
            onSelectCustomer={setSelectedCustomer}
            walkInDetails={walkInDetails}
            onWalkInDetailsChange={setWalkInDetails}
            initialCustomers={initialCustomers}
            showroomState={activeBranch.state}
          />

          {/* Pricing Totals & Tender Panel */}
          <PosCheckoutPanel
            cartItems={cartItems}
            totals={totals}
            selectedCustomer={selectedCustomer}
            customerMode={customerMode}
            walkInDetails={walkInDetails}
            onWalkInDetailsChange={setWalkInDetails}
            invoiceDiscount={invoiceDiscount}
            onInvoiceDiscountChange={setInvoiceDiscount}
            activeBranchId={activeBranch.id}
            activeBranchName={activeBranch.name}
            showroomState={activeBranch.state}
            onCheckoutSuccess={handleCheckoutSuccess}
          />
        </div>
      </div>

      {/* Checkout Success Modal */}
      {checkoutSuccessInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#eee2dc] w-full max-w-md shadow-2xl p-6 text-center space-y-4 animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-2xl bg-[#e2f6e8] text-[#246743] flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-[#246743] uppercase tracking-wider bg-[#e2f6e8] px-2 py-0.5 rounded-full">
                SALE COMPLETED
              </span>
              <h3 className="font-serif font-bold text-2xl text-[#542047] pt-1">
                Invoice #{checkoutSuccessInvoice.invoiceNumber}
              </h3>
              <p className="text-xs text-[#68647a]">
                Tax invoice created and inventory stock atomically deducted.
              </p>
            </div>

            <div className="p-4 bg-[#fffaf5] border border-[#eee2dc] rounded-2xl text-xs space-y-1.5 text-left">
              <div className="flex justify-between">
                <span className="text-[#68647a]">Customer:</span>
                <span className="font-bold text-[#25203a]">{checkoutSuccessInvoice.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#68647a]">Grand Total:</span>
                <span className="font-mono font-bold text-[#542047]">
                  ₹{parseFloat(checkoutSuccessInvoice.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#68647a]">Payment Status:</span>
                <span className="font-bold uppercase text-[#246743]">
                  {checkoutSuccessInvoice.paymentStatus}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Link
                href={`/billing/${checkoutSuccessInvoice.id}`}
                className="w-full py-2.5 bg-gradient-to-r from-[#542047] to-[#7b285e] hover:from-[#421b48] hover:to-[#542047] text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition"
              >
                <Printer className="w-4 h-4 text-[#ffe8a8]" />
                <span>View & Print Tax Invoice (A4)</span>
              </Link>

              <button
                type="button"
                onClick={handleStartNewBill}
                className="w-full py-2 bg-white border border-[#eee2dc] hover:border-[#542047] text-[#542047] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#d49a24]" />
                <span>Start New Transaction</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Invoices Drawer / Modal */}
      {isRecentInvoicesOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#eee2dc] w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl p-5 animate-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between border-b border-[#eee2dc] pb-3">
              <div>
                <h3 className="font-serif font-bold text-base text-[#542047]">
                  Recent Invoices Issued
                </h3>
                <p className="text-[11px] text-[#68647a]">
                  Showroom: {activeBranch.name} ({activeBranch.code})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRecentInvoicesOpen(false)}
                className="p-1.5 text-[#68647a] hover:bg-[#fff0dc] rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[50vh] divide-y divide-[#eee2dc]">
              {recentInvoices.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#68647a]">
                  No sales invoices issued for this showroom yet.
                </div>
              ) : (
                recentInvoices.map((inv) => (
                  <div key={inv.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#542047]">{inv.invoiceNumber}</span>
                        <span className="px-1.5 py-0.2 bg-[#e2f6e8] text-[#246743] rounded text-[9px] font-bold">
                          {inv.paymentStatus}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#68647a] mt-0.5">
                        <span>{inv.customerName}</span>
                        <span> • {new Date(inv.invoiceDate).toLocaleDateString('en-IN')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm text-[#25203a]">
                        ₹{parseFloat(inv.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      <Link
                        href={`/billing/${inv.id}`}
                        className="px-3 py-1.5 bg-[#fff0dc] hover:bg-[#ffe8a8] text-[#542047] border border-[#d49a24]/30 rounded-lg text-xs font-bold transition flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5 text-[#d49a24]" />
                        <span>Print</span>
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-[#eee2dc] flex justify-end">
              <button
                type="button"
                onClick={() => setIsRecentInvoicesOpen(false)}
                className="px-4 py-1.5 bg-white border border-[#eee2dc] text-[#542047] rounded-xl text-xs font-semibold"
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
