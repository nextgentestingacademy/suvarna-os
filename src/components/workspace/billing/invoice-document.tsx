'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer, ShieldCheck, CheckCircle2, AlertTriangle, FileText, CreditCard, X, Loader2 } from 'lucide-react';
import { SerializedInvoice, recordInvoicePaymentAction } from '@/app/actions/billing';
import { formatIndianCurrencyWords } from '@/lib/number-to-words';

interface InvoiceDocumentProps {
  invoice: SerializedInvoice;
}

export function InvoiceDocument({ invoice: initialInvoice }: InvoiceDocumentProps) {
  const [currentInvoice, setCurrentInvoice] = useState<SerializedInvoice>(initialInvoice);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE'>('UPI');
  const [transactionRef, setTransactionRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const invoice = currentInvoice;

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleOpenPaymentModal = () => {
    setPaymentAmount(invoice.balanceAmount);
    setPaymentMethod('UPI');
    setTransactionRef('');
    setPaymentNotes('');
    setPaymentError(null);
    setPaymentSuccess(false);
    setIsPaymentModalOpen(true);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingPayment(true);
    setPaymentError(null);

    try {
      const res = await recordInvoicePaymentAction({
        invoiceId: invoice.id,
        amount: paymentAmount,
        paymentMethod,
        transactionRef: transactionRef.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
      });

      if (res.success && res.data) {
        setCurrentInvoice(res.data);
        setPaymentSuccess(true);
        setTimeout(() => {
          setIsPaymentModalOpen(false);
          setPaymentSuccess(false);
        }, 1200);
      } else {
        setPaymentError(res.error || 'Failed to record payment');
      }
    } catch (err: any) {
      setPaymentError(err.message || 'Payment processing error');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const orgName = invoice.organization?.name || 'Suvarna Jewellers';
  const legalName = invoice.organization?.legalName || 'Suvarna Jewellery Retail Pvt. Ltd.';
  const gstin = invoice.organization?.gstin || '27AAAAA0000A1Z5';
  const pan = invoice.organization?.pan || 'AAAAA0000A';
  const branchName = invoice.branch?.name || 'Main Showroom';
  const branchAddress = invoice.branch?.addressLine1 || 'Heritage Chambers, High Street';
  const branchCity = invoice.branch?.city || 'Mumbai';
  const branchState = invoice.branch?.state || 'Maharashtra';
  const branchPincode = invoice.branch?.pincode || '400001';
  const branchPhone = invoice.branch?.phone || '+91 22 2200 0001';

  const formattedDate = new Date(invoice.invoiceDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = new Date(invoice.invoiceDate).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const grandTotalNum = parseFloat(invoice.grandTotal) || 0;
  const grandTotalInWords = formatIndianCurrencyWords(grandTotalNum);

  return (
    <div className="space-y-6">
      {/* Screen-Only Action & Breadcrumb Bar */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-2xl border border-[#eee2dc] shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/billing"
            className="p-2 rounded-xl text-[#542047] hover:bg-[#fff0dc] transition border border-[#eee2dc] flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to POS</span>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif font-bold text-lg text-[#542047]">
                Tax Invoice #{invoice.invoiceNumber}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                invoice.paymentStatus === 'PAID'
                  ? 'bg-[#e2f6e8] text-[#246743]'
                  : invoice.paymentStatus === 'PARTIAL'
                  ? 'bg-[#fff0dc] text-[#b8861e]'
                  : 'bg-[#fbe8e8] text-[#b93657]'
              }`}>
                {invoice.paymentStatus}
              </span>
            </div>
            <p className="text-xs text-[#68647a]">
              Issued on {formattedDate} at {formattedTime} • Showroom: {branchName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {parseFloat(invoice.balanceAmount) > 0 && invoice.status === 'COMPLETED' && (
            <button
              onClick={handleOpenPaymentModal}
              className="px-4 py-2 bg-[#246743] hover:bg-[#1a4f33] text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-sm cursor-pointer"
            >
              <CreditCard className="w-4 h-4 text-[#a3e6b5]" />
              <span>Record Payment</span>
            </button>
          )}

          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-gradient-to-r from-[#542047] to-[#7b285e] hover:from-[#421b48] hover:to-[#542047] text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-sm cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#ffe8a8]" />
            <span>Print Tax Invoice (A4)</span>
          </button>
        </div>
      </div>

      {/* Printable Invoice Container */}
      <div className="invoice-print-container bg-white rounded-2xl border border-[#eee2dc] p-6 lg:p-10 shadow-sm max-w-4xl mx-auto text-[#25203a]">
        {/* Header: Company & Showroom Letterhead */}
        <header className="invoice-letterhead border-b-2 border-[#542047] pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#542047] text-[#ffe8a8] font-serif font-bold text-lg flex items-center justify-center">
                S
              </div>
              <h1 className="font-serif font-bold text-2xl text-[#542047] tracking-wider uppercase">
                {orgName}
              </h1>
            </div>
            <p className="text-xs font-semibold text-[#542047]">{legalName}</p>
            <p className="text-[11px] text-[#68647a]">
              {branchName} — {branchAddress}, {branchCity}, {branchState} - {branchPincode}
            </p>
            <p className="text-[11px] text-[#68647a]">
              Phone: {branchPhone}
            </p>
          </div>

          <div className="text-left sm:text-right space-y-1">
            <div className="inline-block px-3 py-1 bg-[#fff0dc] border border-[#d49a24]/30 rounded-lg text-xs font-serif font-bold text-[#542047] uppercase tracking-wider">
              TAX INVOICE / RETAIL BILL
            </div>
            <p className="text-[11px] font-semibold text-[#25203a]">
              GSTIN: <span className="font-mono font-bold">{gstin}</span>
            </p>
            <p className="text-[11px] text-[#68647a]">
              Business PAN: <span className="font-mono font-semibold">{pan}</span>
            </p>
            <p className="text-[11px] text-[#68647a]">
              HSN Code: <span className="font-mono font-semibold">7113</span> (Gold & Silver Jewellery)
            </p>
          </div>
        </header>

        {/* Invoice Meta & Customer Details Grid */}
        <div className="invoice-meta-grid grid grid-cols-1 sm:grid-cols-2 gap-6 py-5 border-b border-[#eee2dc] text-xs">
          {/* Invoice Particulars */}
          <div className="space-y-1.5">
            <h2 className="text-[11px] font-bold text-[#68647a] uppercase tracking-wider">
              Invoice Details
            </h2>
            <div className="grid grid-cols-3 gap-1">
              <span className="text-[#68647a]">Invoice No:</span>
              <span className="col-span-2 font-mono font-bold text-[#542047]">{invoice.invoiceNumber}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <span className="text-[#68647a]">Invoice Date:</span>
              <span className="col-span-2 font-medium">{formattedDate} ({formattedTime})</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <span className="text-[#68647a]">Fiscal Year:</span>
              <span className="col-span-2 font-medium">{invoice.fiscalYear}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <span className="text-[#68647a]">Place of Supply:</span>
              <span className="col-span-2 font-medium">
                {invoice.customerState || branchState} {invoice.isInterState ? '(Inter-State)' : '(Intra-State)'}
              </span>
            </div>
          </div>

          {/* Customer Particulars */}
          <div className="space-y-1.5 sm:border-l sm:border-[#eee2dc] sm:pl-6">
            <h2 className="text-[11px] font-bold text-[#68647a] uppercase tracking-wider">
              Billed To (Customer Details)
            </h2>
            <div className="grid grid-cols-3 gap-1">
              <span className="text-[#68647a]">Name:</span>
              <span className="col-span-2 font-bold text-[#25203a]">{invoice.customerName}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <span className="text-[#68647a]">Phone:</span>
              <span className="col-span-2 font-mono">{invoice.customerPhone || 'N/A (Walk-in)'}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <span className="text-[#68647a]">Address:</span>
              <span className="col-span-2">
                {[invoice.customerAddress, invoice.customerCity, invoice.customerState, invoice.customerPincode]
                  .filter(Boolean)
                  .join(', ') || 'Counter Over-the-Counter Sale'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <span className="text-[#68647a]">Customer PAN:</span>
              <span className="col-span-2 font-mono font-bold text-[#542047]">
                {invoice.customerPan || 'Not Quoted (< ₹2,00,000)'}
              </span>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="invoice-table-wrapper py-5 overflow-x-auto">
          <table className="invoice-items-table w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-[#542047] text-[11px] font-bold text-[#542047] bg-[#fffaf5]">
                <th className="py-2.5 px-2 w-[3%]">#</th>
                <th className="py-2.5 px-2 w-[19%]">Ornament Description</th>
                <th className="py-2.5 px-2 w-[12%]">Tag / HUID</th>
                <th className="py-2.5 px-2 text-right w-[6%]">Purity</th>
                <th className="py-2.5 px-2 text-right w-[7%]">Gross Wt</th>
                <th className="py-2.5 px-2 text-right w-[6%]">Stone Wt</th>
                <th className="py-2.5 px-2 text-right w-[7%]">Net Wt</th>
                <th className="py-2.5 px-2 text-right w-[9%]">Rate/g (₹)</th>
                <th className="py-2.5 px-2 text-right w-[10%]">Metal Value (₹)</th>
                <th className="py-2.5 px-2 text-right w-[9%]">Making (₹)</th>
                <th className="py-2.5 px-2 text-right w-[12%]">Taxable (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee2dc]">
              {invoice.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-[#fffdfa]">
                  <td className="py-2.5 px-2 font-mono text-[#68647a]">{idx + 1}</td>
                  <td className="py-2.5 px-2">
                    <span className="font-bold text-[#542047] block break-words">{item.productName}</span>
                    <span className="text-[10px] text-[#68647a] font-mono block break-words">SKU: {item.sku} • HSN 7113</span>
                  </td>
                  <td className="py-2.5 px-2 font-mono text-[11px]">
                    <span className="font-semibold block break-words">{item.tagCode}</span>
                    {item.huid && <span className="text-[10px] text-[#68647a] block break-words">HUID: {item.huid}</span>}
                  </td>
                  <td className="py-2.5 px-2 text-right font-semibold">
                    <span className="whitespace-nowrap">{item.purity}</span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono">
                    <span className="whitespace-nowrap">{parseFloat(item.grossWeight).toFixed(3)}g</span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-[#68647a]">
                    <span className="whitespace-nowrap">{parseFloat(item.stoneWeight).toFixed(3)}g</span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono font-bold text-[#25203a]">
                    <span className="whitespace-nowrap">{parseFloat(item.netWeight).toFixed(3)}g</span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono">
                    <span className="whitespace-nowrap">₹{parseFloat(item.ratePerGram).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono">
                    <span className="whitespace-nowrap">₹{parseFloat(item.metalValue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono">
                    <span className="whitespace-nowrap">₹{parseFloat(item.makingChargeAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono font-bold text-[#542047]">
                    <span className="whitespace-nowrap">₹{parseFloat(item.taxableAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Calculation Summary & GST Breakdown Grid */}
        <div className="invoice-summary-grid border-t border-[#eee2dc] pt-4 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Statutory Tax Summary */}
          <div className="space-y-3">
            <div className="p-3 bg-[#fffaf5] border border-[#eee2dc] rounded-xl space-y-1.5">
              <h3 className="font-bold text-[11px] text-[#542047] uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#d49a24]" />
                <span>GST Breakdown (Jewellery HSN 7113 - 3%)</span>
              </h3>
              {!invoice.isInterState ? (
                <div className="space-y-1 pt-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#68647a]">CGST (Central GST @ 1.5%):</span>
                    <span className="font-mono font-semibold">
                      ₹{parseFloat(invoice.cgstAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#68647a]">SGST (State GST @ 1.5%):</span>
                    <span className="font-mono font-semibold">
                      ₹{parseFloat(invoice.sgstAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between pt-1 text-[11px]">
                  <span className="text-[#68647a]">IGST (Integrated GST @ 3.0%):</span>
                  <span className="font-mono font-semibold">
                    ₹{parseFloat(invoice.igstAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-[#eee2dc] font-bold text-[11px]">
                <span>Total Tax Component:</span>
                <span className="font-mono text-[#542047]">
                  ₹{parseFloat(invoice.totalTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Amount In Words Box */}
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-[#68647a] uppercase tracking-wider block">
                Amount Chargeable (in words):
              </span>
              <p className="font-serif font-bold text-xs text-[#542047] italic">
                {grandTotalInWords}
              </p>
            </div>
          </div>

          {/* Grand Totals Table */}
          <div className="space-y-1.5">
            <div className="flex justify-between py-1 text-xs">
              <span className="text-[#68647a]">Item Subtotal (Taxable):</span>
              <span className="font-mono font-semibold">
                ₹{parseFloat(invoice.subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {parseFloat(invoice.discountAmount) > 0 && (
              <div className="flex justify-between py-1 text-xs text-[#246743]">
                <span>Invoice Discount:</span>
                <span className="font-mono font-semibold">
                  - ₹{parseFloat(invoice.discountAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className="flex justify-between py-1 text-xs">
              <span className="text-[#68647a]">Net Taxable Value:</span>
              <span className="font-mono font-semibold">
                ₹{parseFloat(invoice.taxableAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between py-1 text-xs">
              <span className="text-[#68647a]">Total GST (3%):</span>
              <span className="font-mono font-semibold">
                + ₹{parseFloat(invoice.totalTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {parseFloat(invoice.roundOff) !== 0 && (
              <div className="flex justify-between py-1 text-xs text-[#68647a]">
                <span>Round Off Adjustment:</span>
                <span className="font-mono">
                  {parseFloat(invoice.roundOff) > 0 ? '+' : ''}
                  ₹{parseFloat(invoice.roundOff).toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between py-2 border-t-2 border-b-2 border-[#542047] text-base font-serif font-bold text-[#542047] bg-[#fffaf5] px-2 rounded-lg">
              <span>Grand Total (INR):</span>
              <span className="font-mono text-lg">
                ₹{grandTotalNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Tenders & Balance Section */}
        <div className="invoice-payments-section py-5 border-t border-[#eee2dc]">
          <h3 className="text-[11px] font-bold text-[#68647a] uppercase tracking-wider mb-2">
            Payment Receipts & Tender Record
          </h3>
          {invoice.payments && invoice.payments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#eee2dc] text-[#68647a] text-[10px] uppercase font-bold">
                    <th className="py-1.5 px-2">Date</th>
                    <th className="py-1.5 px-2">Method</th>
                    <th className="py-1.5 px-2">Transaction Ref #</th>
                    <th className="py-1.5 px-2 text-right">Amount Tendered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee2dc]">
                  {invoice.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-1.5 px-2 font-mono text-[11px]">
                        {new Date(p.paymentDate).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-1.5 px-2 font-semibold text-[#542047]">{p.paymentMethod}</td>
                      <td className="py-1.5 px-2 font-mono text-[11px] text-[#68647a]">
                        {p.transactionRef || 'Counter Tender'}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-[#246743]">
                        ₹{parseFloat(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-[#68647a] italic">No payment tendered at checkout (Unpaid Invoice).</p>
          )}

          <div className="flex justify-end gap-6 pt-3 text-xs font-semibold">
            <div>
              <span className="text-[#68647a]">Total Paid: </span>
              <span className="font-mono font-bold text-[#246743]">
                ₹{parseFloat(invoice.paidAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[#68647a]">Balance Due: </span>
              <span className={`font-mono font-bold ${
                parseFloat(invoice.balanceAmount) > 0 ? 'text-[#b93657]' : 'text-[#246743]'
              }`}>
                ₹{parseFloat(invoice.balanceAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Terms, Conditions & Signatures Footer */}
        <footer className="invoice-footer border-t border-[#eee2dc] pt-6 space-y-6 text-[10px] text-[#68647a]">
          <div className="invoice-footer-grid grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="font-bold text-[#542047] block uppercase tracking-wider">
                Statutory Terms & Conditions:
              </span>
              <ol className="list-decimal pl-3 space-y-0.5 leading-relaxed">
                <li>All gold jewellery sold is hallmarked in strict compliance with Bureau of Indian Standards (BIS) regulations.</li>
                <li>Weight, purity, and stone deductions are verified and agreed upon by the purchaser at the counter.</li>
                <li>Making charges, stone charges, and statutory GST are non-refundable upon future buyback or exchange.</li>
                <li>Any dispute arising out of this sale is subject exclusively to local showroom city jurisdiction.</li>
              </ol>
            </div>

            <div className="grid grid-cols-2 gap-4 items-end pt-4 sm:pt-0">
              <div className="text-center border-t border-dashed border-[#68647a] pt-2">
                <span className="font-semibold block text-[#25203a]">Customer Signature</span>
                <span className="text-[9px] text-[#68647a]">Goods received in good order</span>
              </div>
              <div className="text-center border-t border-dashed border-[#68647a] pt-2">
                <span className="font-semibold block text-[#542047]">For {orgName}</span>
                <span className="text-[9px] text-[#68647a]">Authorized Showroom Signatory</span>
              </div>
            </div>
          </div>

          <div className="text-center pt-2 border-t border-[#eee2dc] text-[9px] text-stone-400">
            This is a computer-generated Tax Invoice generated by Suvarna Jewellers OS.
          </div>
        </footer>
      </div>

      {/* Dedicated Print Stylesheet */}
      <style jsx global>{`
        @media print {
          /* Hide application chrome, navigation, ribbons, and screen action bars */
          .no-print,
          aside,
          nav,
          header.sticky,
          [aria-label="Demo mode notice"] {
            display: none !important;
          }

          /* Ensure root container fills printable page without background noise */
          html,
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          main {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            overflow: visible !important;
          }

          .invoice-print-container {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            background: transparent !important;
          }

          /* Preserved Suvarna Brand Letterhead and Showroom Identity */
          .invoice-letterhead {
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: center !important;
            border-bottom: 2px solid #542047 !important;
            padding-bottom: 12px !important;
            margin-bottom: 12px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* 2-column print layouts for meta and summary grids */
          .invoice-meta-grid,
          .invoice-summary-grid,
          .invoice-footer-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 16px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Full width table fitting A4 with zero horizontal clipping or scrollbars */
          .invoice-table-wrapper {
            overflow: visible !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 6px 0 !important;
          }

          .invoice-items-table {
            width: 100% !important;
            table-layout: fixed !important;
            font-size: 7.5pt !important;
            border-collapse: collapse !important;
          }

          .invoice-items-table th,
          .invoice-items-table td {
            padding: 3px 2px !important;
            line-height: 1.2 !important;
            vertical-align: top !important;
          }

          .invoice-items-table th {
            background-color: #fffaf5 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Section page break protection */
          .invoice-payments-section,
          .invoice-footer {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          @page {
            size: A4 portrait;
            margin: 12mm 10mm 12mm 10mm;
          }
        }
      `}</style>

      {/* Screen-Only Modal for Customer Payment Collection */}
      {isPaymentModalOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#eee2dc] space-y-4">
            <div className="flex items-center justify-between border-b border-[#eee2dc] pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#542047]" />
                <h3 className="font-serif font-bold text-lg text-[#542047]">
                  Record Customer Payment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[#fff0dc] text-[#68647a] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#fffaf5] p-3 rounded-xl border border-[#ffe8d6] text-xs space-y-1">
              <div className="flex justify-between text-[#68647a]">
                <span>Invoice Number:</span>
                <span className="font-mono font-bold text-[#542047]">{invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between text-[#68647a]">
                <span>Outstanding Balance:</span>
                <span className="font-bold text-[#b93657] text-sm">₹{parseFloat(invoice.balanceAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {paymentSuccess ? (
              <div className="py-6 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-[#246743] mx-auto animate-bounce" />
                <p className="text-sm font-bold text-[#246743]">
                  Payment Recorded Successfully!
                </p>
                <p className="text-xs text-[#68647a]">
                  Double-entry ledger entry posted and invoice balance updated.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitPayment} className="space-y-3">
                {paymentError && (
                  <div className="p-3 bg-[#fbe8e8] border border-[#f5c6cb] rounded-xl text-xs text-[#b93657] flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{paymentError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#542047] mb-1">
                    Payment Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={parseFloat(invoice.balanceAmount)}
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-[#eee2dc] rounded-xl text-sm font-semibold focus:outline-none focus:border-[#542047]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#542047] mb-1">
                    Payment Method *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-[#eee2dc] rounded-xl text-xs font-medium focus:outline-none focus:border-[#542047] bg-white"
                  >
                    <option value="UPI">UPI (Real-Time QR / VPA)</option>
                    <option value="CASH">Cash (Counter Tender)</option>
                    <option value="CARD">Credit / Debit Card Swipe</option>
                    <option value="BANK_TRANSFER">Bank Transfer (IMPS / NEFT / RTGS)</option>
                    <option value="CHEQUE">Cheque (Pending Clearance)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#542047] mb-1">
                    Transaction / Instrument Reference
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UPI UTR, POS slip ref, Cheque #"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full px-3 py-2 border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#542047]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#542047] mb-1">
                    Payment Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Second instalment paid by customer"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-[#eee2dc] rounded-xl text-xs focus:outline-none focus:border-[#542047]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#eee2dc]">
                  <button
                    type="button"
                    onClick={() => setIsPaymentModalOpen(false)}
                    disabled={isSubmittingPayment}
                    className="px-4 py-2 border border-[#eee2dc] rounded-xl text-xs font-semibold text-[#68647a] hover:bg-[#fff0dc] transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPayment}
                    className="px-4 py-2 bg-[#542047] hover:bg-[#421b48] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {isSubmittingPayment && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Confirm Payment</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
