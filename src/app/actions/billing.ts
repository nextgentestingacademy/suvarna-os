'use server';

import { getServerSecurityContext } from '@/lib/security-context';
import {
  billingService,
  CreateInvoiceInput,
  RecordInvoicePaymentInput,
  InvoiceFilters,
  SanitizedInvoice,
  BillingValidationError,
  BillingConflictError,
  BillingNotFoundError,
  calculateLineItemPricing,
  calculateInvoiceTotals,
  LineItemPricingInput,
  PaymentInput,
  TaxConfiguration,
  DEFAULT_JEWELLERY_TAX_POLICY,
} from '@/lib/billing';
import { AuthorizationError } from '@/types/security';
import { assertPermission } from '@/lib/rbac';
import { prisma as defaultPrisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export interface ActionOptions {
  headers?: Headers;
}

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface SerializedInvoiceItem {
  id: string;
  organizationId: string;
  invoiceId: string;
  ornamentId: string;
  tagCode: string;
  huid: string | null;
  productName: string;
  sku: string;
  category: string;
  metalType: string;
  purity: string;
  grossWeight: string;
  stoneWeight: string;
  netWeight: string;
  pricingMode: string;
  ratePerGram: string;
  metalValue: string;
  makingChargeType: string;
  makingChargeRate: string;
  makingChargeAmount: string;
  stoneCharges: string;
  itemDiscount: string;
  taxableAmount: string;
  gstRate: string;
  gstAmount: string;
  totalAmount: string;
}

export interface SerializedInvoicePayment {
  id: string;
  organizationId: string;
  invoiceId: string;
  paymentMethod: string;
  amount: string;
  transactionRef: string | null;
  paymentDate: string;
  notes: string | null;
  receivedByUserId: string | null;
}

export interface SerializedInvoice {
  id: string;
  organizationId: string;
  branchId: string;
  customerId: string | null;
  invoiceNumber: string;
  fiscalYear: string;
  sequenceNumber: number;
  idempotencyKey: string | null;
  invoiceDate: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  customerPan: string | null;
  customerAddress: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerPincode: string | null;
  currency: string;
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  isInterState: boolean;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalTax: string;
  roundOff: string;
  grandTotal: string;
  paidAmount: string;
  balanceAmount: string;
  paymentStatus: string;
  notes: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  items: SerializedInvoiceItem[];
  payments: SerializedInvoicePayment[];
  branch?: {
    id: string;
    name: string;
    code: string;
    addressLine1?: string | null;
    city: string;
    state: string;
    pincode?: string | null;
    phone?: string | null;
  } | null;
  organization?: {
    id: string;
    name: string;
    legalName?: string | null;
    gstin?: string | null;
    pan?: string | null;
  } | null;
}

export interface PaginatedInvoicesResult {
  invoices: SerializedInvoice[];
  totalCount: number;
  page: number;
  limit: number;
}

function serializeInvoice(invoice: SanitizedInvoice): SerializedInvoice {
  return {
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
}

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Gracefully ignore outside Next.js request context (e.g. during integration test suites)
  }
}

/**
 * Server Action: Finalize a retail sale and issue a sequential tax invoice atomically.
 */
export async function createInvoiceAction(
  input: CreateInvoiceInput,
  options?: ActionOptions
): Promise<ActionResult<SerializedInvoice>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const invoice = await billingService.createInvoice(ctx, input);

    safeRevalidatePath('/billing');
    safeRevalidatePath('/inventory');
    safeRevalidatePath('/customers');

    return {
      success: true,
      data: serializeInvoice(invoice),
    };
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return { success: false, error: error.message, code: error.code };
    }
    if (error instanceof BillingValidationError) {
      return { success: false, error: error.message, code: error.code };
    }
    if (error instanceof BillingConflictError) {
      return { success: false, error: error.message, code: error.code };
    }
    return {
      success: false,
      error: error?.message || 'An unexpected error occurred during checkout.',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * Server Action: Retrieve an invoice by ID with items and payments.
 */
export async function getInvoiceByIdAction(
  invoiceId: string,
  options?: ActionOptions
): Promise<ActionResult<SerializedInvoice>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const invoice = await billingService.getInvoiceById(ctx, invoiceId);

    if (!invoice) {
      return { success: false, error: 'Invoice not found.', code: 'NOT_FOUND' };
    }

    return {
      success: true,
      data: serializeInvoice(invoice),
    };
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return { success: false, error: error.message, code: error.code };
    }
    return {
      success: false,
      error: error?.message || 'Failed to retrieve invoice.',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * Server Action: List invoices with showroom boundaries, customer filter, and search.
 */
export async function listInvoicesAction(
  filters?: InvoiceFilters,
  options?: ActionOptions
): Promise<ActionResult<PaginatedInvoicesResult>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const result = await billingService.listInvoices(ctx, filters);

    return {
      success: true,
      data: {
        invoices: result.invoices.map(serializeInvoice),
        totalCount: result.totalCount,
        page: result.page,
        limit: result.limit,
      },
    };
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return { success: false, error: error.message, code: error.code };
    }
    return {
      success: false,
      error: error?.message || 'Failed to list invoices.',
      code: 'INTERNAL_ERROR',
    };
  }
}

export interface CalculateCartTotalsInput {
  items: LineItemPricingInput[];
  payments?: PaymentInput[];
  discountAmount?: number | string;
  customerState?: string | null;
}

export interface SerializedCalculatedLineItem {
  ornamentId: string;
  grossWeight: string;
  stoneWeight: string;
  netWeight: string;
  pricingMode: string;
  ratePerGram: string;
  metalValue: string;
  makingChargeType: string;
  makingChargeRate: string;
  makingChargeAmount: string;
  stoneCharges: string;
  itemDiscount: string;
  taxableAmount: string;
  gstRate: string;
  gstAmount: string;
  totalAmount: string;
}

export interface SerializedCartTotalsResult {
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  isInterState: boolean;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalTax: string;
  roundOff: string;
  grandTotal: string;
  paidAmount: string;
  balanceAmount: string;
  paymentStatus: string;
  calculatedItems: SerializedCalculatedLineItem[];
}

/**
 * Server Action: Calculate line items, aggregate totals, GST breakdown, and balances
 * using the authoritative Phase 3A billing calculation engine.
 */
export async function calculateCartTotalsAction(
  input: CalculateCartTotalsInput,
  options?: ActionOptions
): Promise<ActionResult<SerializedCartTotalsResult>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    assertPermission(ctx, 'BILLING_CREATE');

    if (!input.items || input.items.length === 0) {
      return {
        success: true,
        data: {
          subtotal: '0.00',
          discountAmount: '0.00',
          taxableAmount: '0.00',
          isInterState: false,
          cgstAmount: '0.00',
          sgstAmount: '0.00',
          igstAmount: '0.00',
          totalTax: '0.00',
          roundOff: '0.00',
          grandTotal: '0.00',
          paidAmount: '0.00',
          balanceAmount: '0.00',
          paymentStatus: 'UNPAID',
          calculatedItems: [],
        },
      };
    }

    // Resolve active showroom state
    const branchId = ctx.activeBranchId || ctx.allowedBranchIds[0];
    const branch = branchId
      ? await defaultPrisma.branch.findUnique({
          where: {
            organizationId_id: {
              organizationId: ctx.tenantId,
              id: branchId,
            },
          },
          select: {
            state: true,
          },
        })
      : null;

    const branchState = branch?.state?.trim() || 'Maharashtra';
    const customerState = input.customerState?.trim();
    const isInterState = customerState ? customerState.toLowerCase() !== branchState.toLowerCase() : false;

    const taxConfig: TaxConfiguration = {
      taxRatePercent: DEFAULT_JEWELLERY_TAX_POLICY.standardGstRatePercent,
      isInterState,
    };

    const calculatedItems = input.items.map((item) => calculateLineItemPricing(item, taxConfig));
    const totals = calculateInvoiceTotals(calculatedItems, input.payments, input.discountAmount ?? 0, taxConfig);

    return {
      success: true,
      data: {
        subtotal: totals.subtotal.toFixed(2),
        discountAmount: totals.discountAmount.toFixed(2),
        taxableAmount: totals.taxableAmount.toFixed(2),
        isInterState: totals.isInterState,
        cgstAmount: totals.cgstAmount.toFixed(2),
        sgstAmount: totals.sgstAmount.toFixed(2),
        igstAmount: totals.igstAmount.toFixed(2),
        totalTax: totals.totalTax.toFixed(2),
        roundOff: totals.roundOff.toFixed(2),
        grandTotal: totals.grandTotal.toFixed(2),
        paidAmount: totals.paidAmount.toFixed(2),
        balanceAmount: totals.balanceAmount.toFixed(2),
        paymentStatus: totals.paymentStatus,
        calculatedItems: calculatedItems.map((ci) => ({
          ornamentId: ci.ornamentId,
          grossWeight: ci.grossWeight.toFixed(3),
          stoneWeight: ci.stoneWeight.toFixed(3),
          netWeight: ci.netWeight.toFixed(3),
          pricingMode: ci.pricingMode,
          ratePerGram: ci.ratePerGram.toFixed(2),
          metalValue: ci.metalValue.toFixed(2),
          makingChargeType: ci.makingChargeType,
          makingChargeRate: ci.makingChargeRate.toFixed(2),
          makingChargeAmount: ci.makingChargeAmount.toFixed(2),
          stoneCharges: ci.stoneCharges.toFixed(2),
          itemDiscount: ci.itemDiscount.toFixed(2),
          taxableAmount: ci.taxableAmount.toFixed(2),
          gstRate: ci.gstRate.toFixed(2),
          gstAmount: ci.gstAmount.toFixed(2),
          totalAmount: ci.totalAmount.toFixed(2),
        })),
      },
    };
  } catch (error: any) {
    if (error instanceof AuthorizationError || error instanceof BillingValidationError) {
      return { success: false, error: error.message, code: error.code };
    }
    return {
      success: false,
      error: error?.message || 'Failed to calculate cart totals.',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * Server Action: Record a customer payment against an unpaid or partially paid invoice.
 * Updates invoice paidAmount, balanceAmount, paymentStatus, and records double-entry journal lines atomically.
 */
export async function recordInvoicePaymentAction(
  input: RecordInvoicePaymentInput,
  options?: ActionOptions
): Promise<ActionResult<SerializedInvoice>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    assertPermission(ctx, 'BILLING_CREATE');

    const updatedInvoice = await billingService.recordInvoicePayment(ctx, input);

    revalidatePath('/billing');
    revalidatePath(`/billing/${input.invoiceId}`);

    return {
      success: true,
      data: serializeInvoice(updatedInvoice),
    };
  } catch (error: any) {
    if (
      error instanceof AuthorizationError ||
      error instanceof BillingValidationError ||
      error instanceof BillingConflictError ||
      error instanceof BillingNotFoundError
    ) {
      return { success: false, error: error.message, code: error.code };
    }
    return {
      success: false,
      error: error?.message || 'Failed to record invoice payment.',
      code: 'INTERNAL_ERROR',
    };
  }
}
