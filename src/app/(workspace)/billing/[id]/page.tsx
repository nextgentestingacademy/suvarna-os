import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSecurityContext } from '@/lib/security-context';
import { billingService } from '@/lib/billing';
import { hasPermission } from '@/lib/rbac';
import { AccessDeniedModule } from '@/components/access-denied-module';
import { InvoiceDocument } from '@/components/workspace/billing/invoice-document';
import { ArrowLeft, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface InvoicePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function InvoiceDetailPage({ params }: InvoicePageProps) {
  const { id } = await params;
  const ctx = await getServerSecurityContext();

  // Enforce server-side authorization check
  if (!hasPermission(ctx.role, 'BILLING_CREATE') && !hasPermission(ctx.role, 'ACCOUNTS_VIEW')) {
    return (
      <AccessDeniedModule
        moduleName="Tax Invoice Details"
        requiredRole="Store Owner, Manager, Accountant, or Sales Staff"
        requiredPermission="BILLING_CREATE"
        currentRole={ctx.role}
        description="Your user role does not have authorization to view tax invoices or retail sales records."
      />
    );
  }

  let invoice;
  try {
    invoice = await billingService.getInvoiceById(ctx, id);
  } catch (err: any) {
    if (err.code === 'UNAUTHORIZED_BRANCH') {
      return (
        <AccessDeniedModule
          moduleName="Branch Showroom Boundary"
          requiredRole="Authorized Branch Staff"
          requiredPermission="BILLING_CREATE"
          currentRole={ctx.role}
          description="Access denied: You are not authorized to view invoices issued from a different showroom branch."
        />
      );
    }
    throw err;
  }

  if (!invoice) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[#fbe8e8] text-[#b93657] flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h1 className="font-serif font-bold text-2xl text-[#542047]">
          Invoice Not Found
        </h1>
        <p className="text-xs text-[#68647a]">
          The requested sales invoice could not be found or does not belong to your authorized business and showroom.
        </p>
        <div className="pt-2">
          <Link
            href="/billing"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#542047] text-white rounded-xl text-xs font-semibold hover:bg-[#421b48] transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Point of Sale</span>
          </Link>
        </div>
      </div>
    );
  }

  // Serialize invoice for client component boundary
  const serialized = {
    id: invoice.id,
    organizationId: invoice.organizationId,
    branchId: invoice.branchId,
    customerId: invoice.customerId,
    invoiceNumber: invoice.invoiceNumber,
    fiscalYear: invoice.fiscalYear,
    sequenceNumber: invoice.sequenceNumber,
    idempotencyKey: invoice.idempotencyKey,
    invoiceDate: invoice.invoiceDate.toISOString(),
    status: invoice.status,
    customerName: invoice.customerName,
    customerPhone: invoice.customerPhone,
    customerPan: invoice.customerPan,
    customerAddress: invoice.customerAddress,
    customerCity: invoice.customerCity,
    customerState: invoice.customerState,
    customerPincode: invoice.customerPincode,
    currency: invoice.currency,
    subtotal: invoice.subtotal.toString(),
    discountAmount: invoice.discountAmount.toString(),
    taxableAmount: invoice.taxableAmount.toString(),
    isInterState: invoice.isInterState,
    cgstAmount: invoice.cgstAmount.toString(),
    sgstAmount: invoice.sgstAmount.toString(),
    igstAmount: invoice.igstAmount.toString(),
    totalTax: invoice.totalTax.toString(),
    roundOff: invoice.roundOff.toString(),
    grandTotal: invoice.grandTotal.toString(),
    paidAmount: invoice.paidAmount.toString(),
    balanceAmount: invoice.balanceAmount.toString(),
    paymentStatus: invoice.paymentStatus,
    notes: invoice.notes,
    userId: invoice.userId,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    items: invoice.items.map((item) => ({
      id: item.id,
      organizationId: item.organizationId,
      invoiceId: item.invoiceId,
      ornamentId: item.ornamentId,
      tagCode: item.tagCode,
      huid: item.huid,
      productName: item.productName,
      sku: item.sku,
      category: item.category,
      metalType: item.metalType,
      purity: item.purity,
      grossWeight: item.grossWeight.toString(),
      stoneWeight: item.stoneWeight.toString(),
      netWeight: item.netWeight.toString(),
      pricingMode: item.pricingMode,
      ratePerGram: item.ratePerGram.toString(),
      metalValue: item.metalValue.toString(),
      makingChargeType: item.makingChargeType,
      makingChargeRate: item.makingChargeRate.toString(),
      makingChargeAmount: item.makingChargeAmount.toString(),
      stoneCharges: item.stoneCharges.toString(),
      itemDiscount: item.itemDiscount.toString(),
      taxableAmount: item.taxableAmount.toString(),
      gstRate: item.gstRate.toString(),
      gstAmount: item.gstAmount.toString(),
      totalAmount: item.totalAmount.toString(),
    })),
    payments: invoice.payments.map((p) => ({
      id: p.id,
      organizationId: p.organizationId,
      invoiceId: p.invoiceId,
      paymentMethod: p.paymentMethod,
      amount: p.amount.toString(),
      transactionRef: p.transactionRef,
      paymentDate: p.paymentDate.toISOString(),
      notes: p.notes,
      receivedByUserId: p.receivedByUserId,
    })),
    branch: invoice.branch
      ? {
          id: invoice.branch.id,
          name: invoice.branch.name,
          code: invoice.branch.code,
          addressLine1: invoice.branch.addressLine1,
          city: invoice.branch.city,
          state: invoice.branch.state,
          pincode: invoice.branch.pincode,
          phone: invoice.branch.phone,
        }
      : null,
    organization: invoice.organization
      ? {
          id: invoice.organization.id,
          name: invoice.organization.name,
          legalName: invoice.organization.legalName,
          gstin: invoice.organization.gstin,
          pan: invoice.organization.pan,
        }
      : null,
  };

  return <InvoiceDocument invoice={serialized} />;
}
