import { PrismaClient, Invoice, InvoiceItem, InvoicePayment, Ornament } from '@prisma/client';
import { prisma as defaultPrisma, withDbRetry } from '@/lib/db';
import { SecurityContext, Role, AuthorizationError } from '@/types/security';
import { assertPermission, assertBranchAccess, hasPermission } from '@/lib/rbac';
import { recordAuditLog } from '@/lib/audit';
import { Decimal, CurrencyMath } from '@/lib/decimal';
import { validateCustomerName, isValidIndianPhone } from '@/lib/customer';
import { ledgerService, PAYMENT_METHOD_ACCOUNT_MAP } from '@/lib/ledger';

// ==============================================================================
// TYPED ERROR CLASSES
// ==============================================================================

export class BillingValidationError extends Error {
  constructor(message: string, public readonly code: string = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'BillingValidationError';
  }
}

export class BillingConflictError extends Error {
  constructor(message: string, public readonly code: string = 'CONFLICT') {
    super(message);
    this.name = 'BillingConflictError';
  }
}

export class BillingNotFoundError extends Error {
  constructor(message: string = 'Invoice not found or access denied', public readonly code: string = 'NOT_FOUND') {
    super(message);
    this.name = 'BillingNotFoundError';
  }
}

// ==============================================================================
// REGULATORY & TAX POLICY CONFIGURATION
// ==============================================================================

/**
 * Standard tax and regulatory policy for Indian retail jewellery operations.
 * - GST Rate: 3% total on jewellery (HSN 7113) pursuant to GST Notification No. 1/2017-Central Tax (Rate), Schedule V.
 *   - Intra-state (branch state == customer state / OTC): 1.5% CGST + 1.5% SGST.
 *   - Inter-state (branch state != customer state): 3.0% IGST.
 * - KYC PAN Threshold: ₹2,00,000 per transaction pursuant to Rule 114B of the Income-tax Rules, 1962 (Item 8 of Table).
 */
export const DEFAULT_JEWELLERY_TAX_POLICY = {
  hsnCode: '7113',
  standardGstRatePercent: new Decimal('3.0'),
  intraStateSplit: {
    cgstPercent: new Decimal('1.5'),
    sgstPercent: new Decimal('1.5'),
  },
  interStateGstPercent: new Decimal('3.0'),
  panMandatoryThreshold: new Decimal('200000.00'),
} as const;

export interface JewelleryTaxPolicy {
  hsnCode: string;
  standardGstRatePercent: Decimal;
  intraStateSplit: {
    cgstPercent: Decimal;
    sgstPercent: Decimal;
  };
  interStateGstPercent: Decimal;
  panMandatoryThreshold: Decimal;
}

// ==============================================================================
// SERVICE INPUT & OUTPUT INTERFACES
// ==============================================================================

export interface TaxConfiguration {
  taxRatePercent: number | string | Decimal;
  isInterState: boolean;
}

export interface LineItemPricingInput {
  ornamentId: string;
  pricingMode?: 'WEIGHT_BASED' | 'FIXED_PRICE';
  grossWeight: number | string | Decimal;
  stoneWeight?: number | string | Decimal;
  ratePerGram?: number | string | Decimal;
  fixedPrice?: number | string | Decimal;
  makingChargeType?: 'PER_GRAM' | 'PERCENTAGE' | 'FIXED';
  makingChargeRate?: number | string | Decimal;
  stoneCharges?: number | string | Decimal;
  itemDiscount?: number | string | Decimal;
}

export interface LineItemCalculationResult {
  ornamentId: string;
  grossWeight: Decimal;
  stoneWeight: Decimal;
  netWeight: Decimal;
  pricingMode: 'WEIGHT_BASED' | 'FIXED_PRICE';
  ratePerGram: Decimal;
  metalValue: Decimal;
  makingChargeType: 'PER_GRAM' | 'PERCENTAGE' | 'FIXED';
  makingChargeRate: Decimal;
  makingChargeAmount: Decimal;
  stoneCharges: Decimal;
  itemDiscount: Decimal;
  taxableAmount: Decimal;
  gstRate: Decimal;
  gstAmount: Decimal;
  totalAmount: Decimal;
}

export interface PaymentInput {
  paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE';
  amount: number | string | Decimal;
  transactionRef?: string | null;
  notes?: string | null;
}

export interface InvoiceTotalsResult {
  subtotal: Decimal;
  discountAmount: Decimal;
  taxableAmount: Decimal;
  isInterState: boolean;
  cgstAmount: Decimal;
  sgstAmount: Decimal;
  igstAmount: Decimal;
  totalTax: Decimal;
  roundOff: Decimal;
  grandTotal: Decimal;
  paidAmount: Decimal;
  balanceAmount: Decimal;
  paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
}

export interface CreateInvoiceInput {
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerPan?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerPincode?: string | null;
  idempotencyKey?: string | null;
  items: LineItemPricingInput[];
  payments?: PaymentInput[];
  discountAmount?: number | string | Decimal;
  taxConfig?: TaxConfiguration;
  notes?: string | null;
}

export interface RecordInvoicePaymentInput {
  invoiceId: string;
  amount: number | string | Decimal;
  paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE';
  transactionRef?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}

export interface InvoiceFilters {
  branchId?: string;
  customerId?: string;
  status?: string;
  searchQuery?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  page?: number;
  limit?: number;
}

export interface SanitizedInvoice extends Invoice {
  items: InvoiceItem[];
  payments: InvoicePayment[];
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

export interface BillingServiceOptions {
  prisma?: PrismaClient;
  taxPolicy?: JewelleryTaxPolicy;
}

// ==============================================================================
// PURE CALCULATION & VALIDATION HELPERS
// ==============================================================================

/**
 * Calculates Indian Financial Year string (e.g. "2026-2027") from a given Date.
 * Fiscal year in India spans April 1 to March 31.
 */
export function getIndianFiscalYear(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 3 = Apr
  const year = date.getFullYear();

  if (month < 3) {
    return `${year - 1}-${year}`;
  }
  return `${year}-${year + 1}`;
}

/**
 * Validates Indian Income Tax PAN format: 5 letters, 4 digits, 1 letter.
 */
export function isValidPan(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.trim().toUpperCase());
}

/**
 * Calculates line-item pricing and returns verified decimal amounts.
 */
export function calculateLineItemPricing(
  input: LineItemPricingInput,
  taxConfig: TaxConfiguration
): LineItemCalculationResult {
  // 1. Weight Validation
  const gross = new Decimal(input.grossWeight);
  if (gross.lessThanOrEqualTo(0)) {
    throw new BillingValidationError('Gross weight must be greater than zero.');
  }

  const stone = new Decimal(input.stoneWeight ?? 0);
  if (stone.lessThan(0)) {
    throw new BillingValidationError('Stone weight cannot be negative.');
  }

  if (stone.greaterThan(gross)) {
    throw new BillingValidationError('Stone weight cannot exceed gross weight.');
  }

  const net = gross.minus(stone);

  // 2. Pricing Mode & Metal Value
  const mode = input.pricingMode ?? 'WEIGHT_BASED';
  let rate = new Decimal(0);
  let metalVal = new Decimal(0);

  if (mode === 'WEIGHT_BASED') {
    if (!input.ratePerGram || new Decimal(input.ratePerGram).lessThanOrEqualTo(0)) {
      throw new BillingValidationError('Metal rate per gram must be greater than zero for weight-based pricing.');
    }
    rate = new Decimal(input.ratePerGram).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    metalVal = net.times(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else if (mode === 'FIXED_PRICE') {
    if (!input.fixedPrice || new Decimal(input.fixedPrice).lessThanOrEqualTo(0)) {
      throw new BillingValidationError('Fixed selling price must be greater than zero.');
    }
    metalVal = new Decimal(input.fixedPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    rate = input.ratePerGram ? new Decimal(input.ratePerGram).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : new Decimal(0);
  } else {
    throw new BillingValidationError(`Unsupported pricing mode: ${mode}`);
  }

  // 3. Making Charges
  const mcType = input.makingChargeType ?? 'PER_GRAM';
  const mcRate = new Decimal(input.makingChargeRate ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (mcRate.lessThan(0)) {
    throw new BillingValidationError('Making charge rate cannot be negative.');
  }

  let mcAmount = new Decimal(0);
  if (mcType === 'PER_GRAM') {
    mcAmount = net.times(mcRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else if (mcType === 'PERCENTAGE') {
    mcAmount = metalVal.times(mcRate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else if (mcType === 'FIXED') {
    mcAmount = mcRate;
  } else {
    throw new BillingValidationError(`Unsupported making charge type: ${mcType}`);
  }

  // 4. Stone Charges
  const stoneCharges = new Decimal(input.stoneCharges ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (stoneCharges.lessThan(0)) {
    throw new BillingValidationError('Stone charges cannot be negative.');
  }

  // 5. Line Item Discount
  const itemDiscount = new Decimal(input.itemDiscount ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (itemDiscount.lessThan(0)) {
    throw new BillingValidationError('Line item discount cannot be negative.');
  }

  const preDiscountTaxable = metalVal.plus(mcAmount).plus(stoneCharges);
  if (itemDiscount.greaterThan(preDiscountTaxable)) {
    throw new BillingValidationError('Line item discount cannot exceed total item price before tax.');
  }

  const taxableAmount = preDiscountTaxable.minus(itemDiscount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // 6. GST Calculation
  const gstRate = new Decimal(taxConfig.taxRatePercent);
  if (gstRate.lessThan(0)) {
    throw new BillingValidationError('Tax rate cannot be negative.');
  }

  const gstAmount = taxableAmount.times(gstRate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const totalAmount = taxableAmount.plus(gstAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    ornamentId: input.ornamentId,
    grossWeight: gross.toDecimalPlaces(3, Decimal.ROUND_HALF_UP),
    stoneWeight: stone.toDecimalPlaces(3, Decimal.ROUND_HALF_UP),
    netWeight: net.toDecimalPlaces(3, Decimal.ROUND_HALF_UP),
    pricingMode: mode,
    ratePerGram: rate,
    metalValue: metalVal,
    makingChargeType: mcType,
    makingChargeRate: mcRate,
    makingChargeAmount: mcAmount,
    stoneCharges,
    itemDiscount,
    taxableAmount,
    gstRate,
    gstAmount,
    totalAmount,
  };
}

/**
 * Calculates aggregate invoice totals, tax components, rounding, and balances.
 */
export function calculateInvoiceTotals(
  items: LineItemCalculationResult[],
  payments: PaymentInput[] = [],
  invoiceDiscount: number | string | Decimal = 0,
  taxConfig: TaxConfiguration
): InvoiceTotalsResult {
  if (items.length === 0) {
    throw new BillingValidationError('An invoice must contain at least one line item.');
  }

  // 1. Subtotal = Sum of Item Taxable Amounts
  const subtotal = items.reduce<Decimal>(
    (sum, item) => sum.plus(item.taxableAmount),
    new Decimal(0)
  ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // 2. Invoice-Level Discount
  const discountAmount = new Decimal(invoiceDiscount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (discountAmount.lessThan(0)) {
    throw new BillingValidationError('Invoice discount cannot be negative.');
  }
  if (discountAmount.greaterThan(subtotal)) {
    throw new BillingValidationError('Invoice discount cannot exceed subtotal.');
  }

  const taxableAmount = subtotal.minus(discountAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // 3. Tax Breakdown
  const totalRate = new Decimal(taxConfig.taxRatePercent);
  if (totalRate.lessThan(0)) {
    throw new BillingValidationError('Tax rate cannot be negative.');
  }

  let cgstAmount = new Decimal(0);
  let sgstAmount = new Decimal(0);
  let igstAmount = new Decimal(0);

  if (taxConfig.isInterState) {
    igstAmount = taxableAmount.times(totalRate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else {
    const halfRate = totalRate.dividedBy(2);
    cgstAmount = taxableAmount.times(halfRate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    sgstAmount = taxableAmount.times(halfRate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  const totalTax = cgstAmount.plus(sgstAmount).plus(igstAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const unroundedTotal = taxableAmount.plus(totalTax);

  // 4. Commercial Round Off (to nearest integer rupee)
  const roundedGrandTotal = unroundedTotal.round();
  const roundOff = roundedGrandTotal.minus(unroundedTotal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const grandTotal = roundedGrandTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // 5. Payment Validation & Derivation
  let paidAmount = new Decimal(0);
  for (const p of payments) {
    const amt = new Decimal(p.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (amt.lessThanOrEqualTo(0)) {
      throw new BillingValidationError('Payment amount must be greater than zero.');
    }
    const validMethods = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'];
    if (!validMethods.includes(p.paymentMethod)) {
      throw new BillingValidationError(`Invalid payment method: ${p.paymentMethod}`);
    }
    paidAmount = paidAmount.plus(amt);
  }
  paidAmount = paidAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Overpayment Protection: Reject payments exceeding grand total
  if (paidAmount.greaterThan(grandTotal)) {
    throw new BillingValidationError(
      `Total payments (${paidAmount.toFixed(2)}) cannot exceed invoice grand total (${grandTotal.toFixed(2)}). Excess cash tenders require separate change return handling.`
    );
  }

  const balanceAmount = grandTotal.minus(paidAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  let paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
  if (balanceAmount.isZero()) {
    paymentStatus = 'PAID';
  } else if (paidAmount.greaterThan(0)) {
    paymentStatus = 'PARTIAL';
  } else {
    paymentStatus = 'UNPAID';
  }

  return {
    subtotal,
    discountAmount,
    taxableAmount,
    isInterState: taxConfig.isInterState,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTax,
    roundOff,
    grandTotal,
    paidAmount,
    balanceAmount,
    paymentStatus,
  };
}

// ==============================================================================
// BILLING SERVICE IMPLEMENTATION
// ==============================================================================

export class BillingService {
  private readonly db: PrismaClient;
  private readonly taxPolicy: JewelleryTaxPolicy;

  constructor(options?: BillingServiceOptions) {
    this.db = options?.prisma ?? defaultPrisma;
    this.taxPolicy = options?.taxPolicy ?? DEFAULT_JEWELLERY_TAX_POLICY;
  }

  // --------------------------------------------------------------------------
  // 1. Create Tax Invoice (Atomic Checkout & Concurrency-Safe Ledger)
  // --------------------------------------------------------------------------
  async createInvoice(ctx: SecurityContext, input: CreateInvoiceInput): Promise<SanitizedInvoice> {
    // 1. Authorization & Showroom Boundary Enforcement
    assertPermission(ctx, 'BILLING_CREATE');

    const branchId = ctx.activeBranchId;
    if (!branchId) {
      throw new BillingValidationError('An active showroom branch must be selected for billing.');
    }
    assertBranchAccess(ctx, branchId);

    // 2. Idempotency Check (Stripe-Style Duplicate Prevention & Material Equivalence)
    if (input.idempotencyKey?.trim()) {
      const existing = await this.db.invoice.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: ctx.tenantId,
            idempotencyKey: input.idempotencyKey.trim(),
          },
        },
        include: {
          items: true,
          payments: true,
        },
      });

      if (existing) {
        // Material equivalence check: verify branch, customer, and ornament IDs match
        const existingOrnamentIds = existing.items.map((i) => i.ornamentId).sort();
        const incomingOrnamentIds = [...input.items.map((i) => i.ornamentId)].sort();
        const itemsMatch =
          existingOrnamentIds.length === incomingOrnamentIds.length &&
          existingOrnamentIds.every((id, idx) => id === incomingOrnamentIds[idx]);

        const customerMatch = (existing.customerId ?? null) === (input.customerId ?? null);
        const branchMatch = existing.branchId === branchId;

        if (!itemsMatch || !customerMatch || !branchMatch) {
          throw new BillingConflictError(
            `Idempotency conflict: Key '${input.idempotencyKey.trim()}' was already used with a different checkout payload. Use a unique idempotency key for distinct transactions.`
          );
        }

        return existing as SanitizedInvoice;
      }
    }

    // 3. Resolve Active Branch Metadata (City, State, Code)
    const branch = await this.db.branch.findUnique({
      where: {
        organizationId_id: {
          organizationId: ctx.tenantId,
          id: branchId,
        },
      },
    });

    if (!branch) {
      throw new BillingValidationError(`Active showroom branch '${branchId}' not found.`);
    }

    // 4. Resolve & Validate Customer (Registered Patron or Walk-In)
    let customerId: string | null = null;
    let customerName = '';
    let customerPhone: string | null = null;
    let customerPan: string | null = null;
    let customerAddress: string | null = null;
    let customerCity: string | null = null;
    let customerState: string | null = null;
    let customerPincode: string | null = null;

    if (input.customerId) {
      const customer = await this.db.customer.findUnique({
        where: {
          organizationId_id: {
            organizationId: ctx.tenantId,
            id: input.customerId,
          },
        },
      });

      if (!customer) {
        throw new BillingValidationError(`Customer '${input.customerId}' not found in your business records.`);
      }

      customerId = customer.id;
      customerName = customer.name;
      customerPhone = customer.phone;
      customerPan = customer.pan;
      customerAddress = [customer.addressLine1, customer.addressLine2].filter(Boolean).join(', ') || null;
      customerCity = customer.city;
      customerState = customer.state;
      customerPincode = customer.pincode;
    } else {
      // Walk-in / Guest Sale
      if (!input.customerName || !input.customerName.trim()) {
        throw new BillingValidationError('Customer name is required for walk-in checkout.');
      }
      const nameVal = validateCustomerName(input.customerName);
      if (!nameVal.valid) {
        throw new BillingValidationError(nameVal.error || 'Invalid customer name.');
      }
      customerName = nameVal.normalized;

      if (input.customerPhone?.trim()) {
        const phone = input.customerPhone.trim();
        if (!isValidIndianPhone(phone)) {
          throw new BillingValidationError('Customer phone must be a valid 10-digit Indian mobile number.');
        }
        customerPhone = phone;
      }

      customerPan = input.customerPan?.trim().toUpperCase() || null;
      customerAddress = input.customerAddress?.trim() || null;
      customerCity = input.customerCity?.trim() || null;
      customerState = input.customerState?.trim() || null;
      customerPincode = input.customerPincode?.trim() || null;
    }

    // Override with any explicit transaction snapshot details if supplied
    if (input.customerPan?.trim()) {
      customerPan = input.customerPan.trim().toUpperCase();
    }
    if (customerPan && !isValidPan(customerPan)) {
      throw new BillingValidationError('Invalid Indian PAN format (expected ABCDE1234F).');
    }

    // 5. Determine Tax Configuration (Intra-State vs Inter-State)
    // Under Section 10(1)(c) of the Integrated Goods and Services Tax (IGST) Act, 2017:
    // When goods are supplied over the showroom counter without supplier-arranged transportation,
    // the place of supply is the location of the goods at the time of delivery (the showroom branch state).
    if (!branch.state || !branch.state.trim()) {
      throw new BillingValidationError(
        `Active showroom branch '${branch.name}' is missing state address configuration required for GST determination.`
      );
    }

    const branchStateNormalized = branch.state.trim();
    let isInterState = false;
    let effectiveCustomerState: string | null = null;

    if (customerState && customerState.trim()) {
      effectiveCustomerState = customerState.trim();
      isInterState = effectiveCustomerState.toLowerCase() !== branchStateNormalized.toLowerCase();
    } else {
      // Over-the-counter retail transaction where customer state is not recorded.
      // Place of supply defaults to the showroom location per IGST Act Section 10(1)(c).
      effectiveCustomerState = branchStateNormalized;
      isInterState = false;
    }

    const taxConfig: TaxConfiguration = input.taxConfig ?? {
      taxRatePercent: this.taxPolicy.standardGstRatePercent,
      isInterState,
    };

    // 6. Pre-validate & Calculate Line Items
    if (!input.items || input.items.length === 0) {
      throw new BillingValidationError('At least one jewellery item must be added to the invoice.');
    }

    // Check for duplicate ornament inclusion
    const ornamentIds = input.items.map((i) => i.ornamentId);
    const uniqueOrnamentIds = new Set(ornamentIds);
    if (uniqueOrnamentIds.size !== ornamentIds.length) {
      throw new BillingValidationError(
        'Duplicate ornament detected: An ornament cannot be added more than once to the same invoice.'
      );
    }

    const calculatedItems = input.items.map((item) => calculateLineItemPricing(item, taxConfig));
    const totals = calculateInvoiceTotals(calculatedItems, input.payments, input.discountAmount ?? 0, taxConfig);

    // 7. High-Value KYC PAN Rule Check (Indian Income Tax Rule 114B: >= ₹2,00,000)
    if (totals.grandTotal.greaterThanOrEqualTo(this.taxPolicy.panMandatoryThreshold) && !customerPan) {
      throw new BillingValidationError(
        `Government KYC compliance requires a valid Income Tax PAN for jewellery sales of ₹${this.taxPolicy.panMandatoryThreshold.toNumber().toLocaleString('en-IN')} or above (Rule 114B).`
      );
    }

    // 8. Atomic Database Transaction: Sequence, Stock Deduction, Invoice & Movements
    const fiscalYear = getIndianFiscalYear();
    const fiscalYearShort = fiscalYear.split('-').map((y) => y.slice(-2)).join('-'); // e.g. "26-27"

    try {
      const createdInvoice = await this.db.$transaction(
        async (tx) => {
          // Step A: Acquire Concurrency-Safe Sequence
          const sequence = await tx.invoiceSequence.upsert({
        where: {
          organizationId_branchId_fiscalYear: {
            organizationId: ctx.tenantId,
            branchId,
            fiscalYear,
          },
        },
        create: {
          organizationId: ctx.tenantId,
          branchId,
          fiscalYear,
          prefix: 'INV',
          currentNumber: 1,
        },
        update: {
          currentNumber: { increment: 1 },
        },
      });

      const sequencePadded = String(sequence.currentNumber).padStart(4, '0');
      const invoiceNumber = `${sequence.prefix}/${branch.code}/${fiscalYearShort}/${sequencePadded}`;

      // Step B: Atomically Lock & Transition Ornaments from AVAILABLE to SOLD
      for (const item of calculatedItems) {
        const updateResult = await tx.ornament.updateMany({
          where: {
            id: item.ornamentId,
            organizationId: ctx.tenantId,
            branchId,
            status: 'AVAILABLE',
          },
          data: {
            status: 'SOLD',
          },
        });

        if (updateResult.count === 0) {
          // Precise diagnosis for user error
          const current = await tx.ornament.findUnique({
            where: { id: item.ornamentId },
          });

          if (!current || current.organizationId !== ctx.tenantId) {
            throw new BillingValidationError(`Ornament '${item.ornamentId}' not found in your business catalogue.`);
          }
          if (current.branchId !== branchId) {
            throw new BillingConflictError(
              `Sale rejected: Ornament '${current.tagCode}' is located at another branch ('${current.branchId}') and cannot be sold from '${branch.name}'.`
            );
          }
          if (current.status !== 'AVAILABLE') {
            throw new BillingConflictError(
              `Sale rejected: Ornament '${current.tagCode}' is already marked as ${current.status}.`
            );
          }
          throw new BillingConflictError(`Concurrent conflict on ornament '${current.tagCode}'. Please retry.`);
        }
      }

      // Step C: Fetch Ornament Snapshots for Historical Line Items
      const ornaments = await tx.ornament.findMany({
        where: {
          id: { in: ornamentIds },
          organizationId: ctx.tenantId,
        },
        include: {
          product: true,
        },
      });
      const ornamentMap = new Map<string, (typeof ornaments)[0]>(ornaments.map((o) => [o.id, o]));

      // Step D: Create Invoice Header
      const invoice = await tx.invoice.create({
        data: {
          organizationId: ctx.tenantId,
          branchId,
          customerId,
          invoiceNumber,
          fiscalYear,
          sequenceNumber: sequence.currentNumber,
          idempotencyKey: input.idempotencyKey?.trim() || null,
          customerName,
          customerPhone,
          customerPan,
          customerAddress,
          customerCity,
          customerState: effectiveCustomerState,
          customerPincode,
          currency: 'INR',
          subtotal: totals.subtotal.toString(),
          discountAmount: totals.discountAmount.toString(),
          taxableAmount: totals.taxableAmount.toString(),
          isInterState: totals.isInterState,
          cgstAmount: totals.cgstAmount.toString(),
          sgstAmount: totals.sgstAmount.toString(),
          igstAmount: totals.igstAmount.toString(),
          totalTax: totals.totalTax.toString(),
          roundOff: totals.roundOff.toString(),
          grandTotal: totals.grandTotal.toString(),
          paidAmount: totals.paidAmount.toString(),
          balanceAmount: totals.balanceAmount.toString(),
          paymentStatus: totals.paymentStatus,
          notes: input.notes?.trim() || null,
          userId: ctx.userId,
        },
      });

      // Step D.1: Enrich customer CRM record with PAN if customer lacked one
      if (customerId && customerPan) {
        await tx.customer.updateMany({
          where: {
            id: customerId,
            organizationId: ctx.tenantId,
            pan: null,
          },
          data: {
            pan: customerPan,
          },
        });
      }

      // Step E: Create Line Items with Frozen Historical Snapshots
      for (const item of calculatedItems) {
        const orn = ornamentMap.get(item.ornamentId)!;
        await tx.invoiceItem.create({
          data: {
            organizationId: ctx.tenantId,
            invoiceId: invoice.id,
            ornamentId: item.ornamentId,
            tagCode: orn.tagCode,
            huid: orn.huid,
            productName: orn.product.name,
            sku: orn.product.sku,
            category: orn.product.category,
            metalType: orn.metalType,
            purity: orn.purity,
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
          },
        });

        // Step F: Create Immutable StockMovement Record (Type: SALE)
        await tx.stockMovement.create({
          data: {
            organizationId: ctx.tenantId,
            ornamentId: item.ornamentId,
            fromBranchId: branchId,
            toBranchId: null,
            movementType: 'SALE',
            reason: `Sold on Tax Invoice #${invoiceNumber}`,
            metadata: {
              invoiceId: invoice.id,
              invoiceNumber,
              customerId,
              customerName,
              totalAmount: item.totalAmount.toString(),
            },
            userId: ctx.userId,
          },
        });
      }

      // Step G: Create Payments
      if (input.payments && input.payments.length > 0) {
        for (const p of input.payments) {
          await tx.invoicePayment.create({
            data: {
              organizationId: ctx.tenantId,
              invoiceId: invoice.id,
              paymentMethod: p.paymentMethod,
              amount: new Decimal(p.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
              transactionRef: p.transactionRef?.trim() || null,
              notes: p.notes?.trim() || null,
              receivedByUserId: ctx.userId,
            },
          });
        }
      }

      // Step H: Automatic Double-Entry General Ledger Posting
      const accountMap = await ledgerService.ensureBillingAccounts(ctx, tx);

      // Construct balanced double-entry lines
      const journalLines: {
        accountId: string;
        debitAmount: Decimal;
        creditAmount: Decimal;
        narration: string;
      }[] = [];

      // 1. CREDITS: Revenue recognition from invoice snapshots
      const totalMetalValue = calculatedItems.reduce(
        (sum, item) => sum.plus(item.metalValue),
        new Decimal(0)
      );
      const totalMakingCharges = calculatedItems.reduce(
        (sum, item) => sum.plus(item.makingChargeAmount),
        new Decimal(0)
      );
      const totalStoneCharges = calculatedItems.reduce(
        (sum, item) => sum.plus(item.stoneCharges),
        new Decimal(0)
      );

      if (totalMetalValue.gt(0)) {
        journalLines.push({
          accountId: accountMap.get('4010')!,
          debitAmount: new Decimal(0),
          creditAmount: totalMetalValue,
          narration: 'Precious metal sales revenue',
        });
      }

      if (totalMakingCharges.gt(0)) {
        journalLines.push({
          accountId: accountMap.get('4020')!,
          debitAmount: new Decimal(0),
          creditAmount: totalMakingCharges,
          narration: 'Making charges labour revenue',
        });
      }

      if (totalStoneCharges.gt(0)) {
        journalLines.push({
          accountId: accountMap.get('4030')!,
          debitAmount: new Decimal(0),
          creditAmount: totalStoneCharges,
          narration: 'Stone and gemstone value revenue',
        });
      }

      // 2. CREDITS: GST output payables
      if (totals.cgstAmount.gt(0)) {
        journalLines.push({
          accountId: accountMap.get('2010')!,
          debitAmount: new Decimal(0),
          creditAmount: totals.cgstAmount,
          narration: 'Output CGST payable (1.5%)',
        });
      }

      if (totals.sgstAmount.gt(0)) {
        journalLines.push({
          accountId: accountMap.get('2020')!,
          debitAmount: new Decimal(0),
          creditAmount: totals.sgstAmount,
          narration: 'Output SGST payable (1.5%)',
        });
      }

      if (totals.igstAmount.gt(0)) {
        journalLines.push({
          accountId: accountMap.get('2030')!,
          debitAmount: new Decimal(0),
          creditAmount: totals.igstAmount,
          narration: 'Output IGST payable (3.0%)',
        });
      }

      // 3. Rounding adjustment credit or debit
      if (totals.roundOff.gt(0)) {
        journalLines.push({
          accountId: accountMap.get('4090')!,
          debitAmount: new Decimal(0),
          creditAmount: totals.roundOff,
          narration: 'Invoice round-off adjustment (credit)',
        });
      } else if (totals.roundOff.lt(0)) {
        journalLines.push({
          accountId: accountMap.get('4090')!,
          debitAmount: totals.roundOff.abs(),
          creditAmount: new Decimal(0),
          narration: 'Invoice round-off adjustment (debit)',
        });
      }

      // 4. DEBITS: Discounts (contra-revenue)
      const totalItemDiscounts = calculatedItems.reduce(
        (sum, item) => sum.plus(item.itemDiscount),
        new Decimal(0)
      );
      const totalDiscounts = totalItemDiscounts.plus(totals.discountAmount);
      if (totalDiscounts.gt(0)) {
        journalLines.push({
          accountId: accountMap.get('4110')!,
          debitAmount: totalDiscounts,
          creditAmount: new Decimal(0),
          narration: 'Sales discounts and concessions',
        });
      }

      // 5. DEBITS: Payment tender clearing
      if (input.payments && input.payments.length > 0) {
        for (const p of input.payments) {
          const pAmount = new Decimal(p.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
          if (pAmount.gt(0)) {
            const accCode = PAYMENT_METHOD_ACCOUNT_MAP[p.paymentMethod];
            if (!accCode || !accountMap.has(accCode)) {
              throw new BillingValidationError(
                `Unsupported or unmapped payment method: '${p.paymentMethod}'.`,
                'UNMAPPED_PAYMENT_METHOD'
              );
            }
            journalLines.push({
              accountId: accountMap.get(accCode)!,
              debitAmount: pAmount,
              creditAmount: new Decimal(0),
              narration: `Tender received via ${p.paymentMethod}${p.transactionRef ? ` (Ref: ${p.transactionRef})` : ''}`,
            });
          }
        }
      }

      // 6. DEBITS: Accounts Receivable for remaining unpaid balance
      if (totals.balanceAmount.gt(0)) {
        journalLines.push({
          accountId: accountMap.get('1110')!,
          debitAmount: totals.balanceAmount,
          creditAmount: new Decimal(0),
          narration: `Accounts receivable due from ${customerName}`,
        });
      }

      // Post atomic journal entry inside the SAME database transaction tx
      await ledgerService.postJournalEntry(
        ctx,
        {
          branchId,
          sourceType: 'INVOICE',
          sourceId: invoice.id,
          idempotencyKey: `INV-JE-${invoice.id}`,
          narration: `Tax Invoice #${invoiceNumber} - ${customerName}`,
          postingDate: invoice.invoiceDate,
          lines: journalLines,
        },
        { tx }
      );

      // Step I: Record Audit Trail Entry
      await recordAuditLog(tx, ctx, {
        action: 'CREATE',
        entityType: 'Invoice',
        entityId: invoice.id,
        changedFields: {
          invoiceNumber,
          grandTotal: totals.grandTotal.toString(),
          itemCount: calculatedItems.length,
          paymentStatus: totals.paymentStatus,
          customerId,
        },
      });

        return tx.invoice.findUniqueOrThrow({
          where: { id: invoice.id },
          include: {
            items: true,
            payments: true,
          },
        });
      },
      { maxWait: 10000, timeout: 30000 }
    );

    return createdInvoice as SanitizedInvoice;
  } catch (err: any) {
      // Handle concurrent insert collision on idempotencyKey (Prisma unique constraint P2002)
      if (err?.code === 'P2002' && input.idempotencyKey?.trim()) {
        const winningInvoice = await this.db.invoice.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: ctx.tenantId,
              idempotencyKey: input.idempotencyKey.trim(),
            },
          },
          include: {
            items: true,
            payments: true,
          },
        });

        if (winningInvoice) {
          const existingOrnamentIds = winningInvoice.items.map((i) => i.ornamentId).sort();
          const incomingOrnamentIds = [...input.items.map((i) => i.ornamentId)].sort();
          const itemsMatch =
            existingOrnamentIds.length === incomingOrnamentIds.length &&
            existingOrnamentIds.every((id, idx) => id === incomingOrnamentIds[idx]);

          if (!itemsMatch || winningInvoice.branchId !== branchId) {
            throw new BillingConflictError(
              `Idempotency conflict: Key '${input.idempotencyKey.trim()}' was already used with a different checkout payload.`
            );
          }

          return winningInvoice as SanitizedInvoice;
        }
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // 2. Retrieve Invoice by ID (Tenant- & Branch-Scoped)
  // --------------------------------------------------------------------------
  async getInvoiceById(ctx: SecurityContext, invoiceId: string): Promise<SanitizedInvoice | null> {
    assertPermission(ctx, 'BILLING_CREATE');

    const cleanId = decodeURIComponent(invoiceId).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

    const invoice = await withDbRetry(() =>
      this.db.invoice.findFirst({
        where: {
          organizationId: ctx.tenantId,
          ...(isUuid ? { id: cleanId } : { invoiceNumber: cleanId }),
        },
        include: {
          items: true,
          payments: true,
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
              addressLine1: true,
              city: true,
              state: true,
              pincode: true,
              phone: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
              legalName: true,
              gstin: true,
              pan: true,
            },
          },
        },
      })
    );

    if (!invoice) {
      return null;
    }

    // Role-based branch authorization: All staff can view their branch bills,
    // OWNER and ACCOUNTANT have all-branch reporting scope.
    if (!ctx.allowedBranchIds.includes(invoice.branchId)) {
      throw new AuthorizationError(
        `Access denied: You are not authorized to view invoices issued from branch '${invoice.branchId}'.`,
        'UNAUTHORIZED_BRANCH'
      );
    }

    return invoice as SanitizedInvoice;
  }

  // --------------------------------------------------------------------------
  // 3. List Invoices with Search, Showroom Scoping & Pagination
  // --------------------------------------------------------------------------
  async listInvoices(
    ctx: SecurityContext,
    filters?: InvoiceFilters
  ): Promise<{ invoices: SanitizedInvoice[]; totalCount: number; page: number; limit: number }> {
    assertPermission(ctx, 'BILLING_CREATE');

    let branchScope: { branchId?: string | { in: string[] } } = {};
    if (filters?.branchId) {
      assertBranchAccess(ctx, filters.branchId);
      branchScope = { branchId: filters.branchId };
    } else {
      branchScope = { branchId: { in: [...ctx.allowedBranchIds] } };
    }

    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters?.limit ?? 20));
    const skip = (page - 1) * limit;

    const whereClause: any = {
      organizationId: ctx.tenantId,
      ...branchScope,
      ...(filters?.customerId ? { customerId: filters.customerId } : {}),
      ...(filters?.status && filters.status !== 'All' ? { status: filters.status } : {}),
      ...(filters?.startDate || filters?.endDate
        ? {
            invoiceDate: {
              ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
              ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
            },
          }
        : {}),
      ...(filters?.searchQuery?.trim()
        ? {
            OR: [
              { invoiceNumber: { contains: filters.searchQuery.trim(), mode: 'insensitive' } },
              { customerName: { contains: filters.searchQuery.trim(), mode: 'insensitive' } },
              { customerPhone: { contains: filters.searchQuery.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [invoices, totalCount] = await Promise.all([
      this.db.invoice.findMany({
        where: whereClause,
        include: {
          items: true,
          payments: true,
        },
        orderBy: { invoiceDate: 'desc' },
        skip,
        take: limit,
      }),
      this.db.invoice.count({ where: whereClause }),
    ]);

    return {
      invoices: invoices as SanitizedInvoice[],
      totalCount,
      page,
      limit,
    };
  }

  /**
   * Records a subsequent customer payment against an invoice with an outstanding balance.
   * Atomically:
   * 1. Validates positive amount <= invoice.balanceAmount.
   * 2. Validates paymentMethod and access context.
   * 3. Inserts InvoicePayment record.
   * 4. Updates Invoice paidAmount, balanceAmount, and paymentStatus (PAID | PARTIAL).
   * 5. Posts balanced JournalEntry (Debit tender clearing, Credit Accounts Receivable).
   * 6. Records audit log.
   */
  async recordInvoicePayment(
    ctx: SecurityContext,
    input: RecordInvoicePaymentInput
  ): Promise<SanitizedInvoice> {
    assertPermission(ctx, 'BILLING_CREATE');

    if (!input.invoiceId) {
      throw new BillingValidationError('Invoice ID is required.', 'INVOICE_ID_REQUIRED');
    }

    let paymentAmount: Decimal;
    try {
      paymentAmount = new Decimal(input.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    } catch {
      throw new BillingValidationError(`Invalid payment amount '${input.amount}'.`, 'INVALID_AMOUNT');
    }

    if (paymentAmount.lte(0)) {
      throw new BillingValidationError('Payment amount must be greater than zero.', 'INVALID_AMOUNT');
    }

    const validMethods = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE'];
    if (!validMethods.includes(input.paymentMethod)) {
      throw new BillingValidationError(
        `Unsupported payment method: '${input.paymentMethod}'. Supported: ${validMethods.join(', ')}.`,
        'INVALID_PAYMENT_METHOD'
      );
    }

    const idempotencyKey = input.idempotencyKey?.trim() || null;

    // Fast-path: Check for existing idempotency key before entering transaction
    if (idempotencyKey) {
      const existingJournal = await this.db.journalEntry.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: ctx.tenantId,
            idempotencyKey,
          },
        },
      });

      if (existingJournal) {
        const inv = await this.getInvoiceById(ctx, input.invoiceId);
        if (!inv) {
          throw new BillingNotFoundError('Invoice not found or access denied.');
        }
        return inv;
      }
    }

    try {
      return await this.db.$transaction(
        async (tx) => {
          // 1. Fetch invoice with lock / isolation
          const invoice = await tx.invoice.findFirst({
            where: {
              id: input.invoiceId,
              organizationId: ctx.tenantId,
            },
            include: {
              branch: true,
            },
          });

          if (!invoice) {
            throw new BillingNotFoundError('Invoice not found or access denied.');
          }

          if (invoice.branchId) {
            assertBranchAccess(ctx, invoice.branchId);
          }

          if (invoice.status === 'CANCELLED' || invoice.status === 'REFUNDED') {
            throw new BillingConflictError(
              `Payment rejected: Cannot record payment against invoice with status '${invoice.status}'.`,
              'INVOICE_NOT_PAYABLE'
            );
          }

          const currentBalance = new Decimal(invoice.balanceAmount);
          if (currentBalance.lte(0)) {
            throw new BillingConflictError(
              'Invoice is already fully paid. Outstanding balance is ₹0.00.',
              'ALREADY_FULLY_PAID'
            );
          }

          if (paymentAmount.gt(currentBalance)) {
            throw new BillingValidationError(
              `Payment amount ₹${paymentAmount.toFixed(2)} exceeds current outstanding balance ₹${currentBalance.toFixed(2)}.`,
              'OVERPAYMENT_NOT_PERMITTED'
            );
          }

          // 2. Compute updated balances
          const newPaidAmount = new Decimal(invoice.paidAmount).plus(paymentAmount);
          const newBalanceAmount = currentBalance.minus(paymentAmount);
          const newPaymentStatus = newBalanceAmount.isZero() ? 'PAID' : 'PARTIAL';

          // 3. Create InvoicePayment record
          const payment = await tx.invoicePayment.create({
            data: {
              organizationId: ctx.tenantId,
              invoiceId: invoice.id,
              paymentMethod: input.paymentMethod,
              amount: paymentAmount.toFixed(2),
              transactionRef: input.transactionRef?.trim() || null,
              notes: input.notes?.trim() || null,
              receivedByUserId: ctx.userId,
            },
          });

          // 4. Update Invoice header
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              paidAmount: newPaidAmount.toFixed(2),
              balanceAmount: newBalanceAmount.toFixed(2),
              paymentStatus: newPaymentStatus,
            },
          });

          // 5. Post atomic double-entry journal entry
          const accountMap = await ledgerService.ensureBillingAccounts(ctx, tx);
          const tenderAccCode = PAYMENT_METHOD_ACCOUNT_MAP[input.paymentMethod];
          const tenderAccId = accountMap.get(tenderAccCode);
          const arAccId = accountMap.get('1110'); // Accounts Receivable

          if (!tenderAccId || !arAccId) {
            throw new BillingValidationError(
              'Required ledger accounts for tender clearing or accounts receivable are missing.',
              'MISSING_LEDGER_ACCOUNT'
            );
          }

          const paymentJeIdemp = idempotencyKey || `PAY-JE-${payment.id}`;

          await ledgerService.postJournalEntry(
            ctx,
            {
              branchId: invoice.branchId,
              sourceType: 'PAYMENT',
              sourceId: payment.id,
              idempotencyKey: paymentJeIdemp,
              narration: `Customer payment on Invoice #${invoice.invoiceNumber} via ${input.paymentMethod}`,
              postingDate: payment.paymentDate,
              lines: [
                {
                  accountId: tenderAccId,
                  debitAmount: paymentAmount.toFixed(2),
                  creditAmount: '0.00',
                  narration: `Payment received via ${input.paymentMethod}${input.transactionRef ? ` (Ref: ${input.transactionRef})` : ''}`,
                },
                {
                  accountId: arAccId,
                  debitAmount: '0.00',
                  creditAmount: paymentAmount.toFixed(2),
                  narration: `Receivable reduction on Invoice #${invoice.invoiceNumber}`,
                },
              ],
            },
            { tx }
          );

          // 6. Record Audit Trail
          await recordAuditLog(tx, ctx, {
            action: 'UPDATE',
            entityType: 'Invoice',
            entityId: invoice.id,
            changedFields: {
              paymentId: payment.id,
              paymentMethod: input.paymentMethod,
              paymentAmount: paymentAmount.toFixed(2),
              newPaidAmount: newPaidAmount.toFixed(2),
              newBalanceAmount: newBalanceAmount.toFixed(2),
              paymentStatus: newPaymentStatus,
            },
          });

          return tx.invoice.findUniqueOrThrow({
            where: { id: invoice.id },
            include: {
              items: true,
              payments: true,
              branch: true,
              organization: true,
            },
          });
        },
        { maxWait: 10000, timeout: 30000 }
      ) as SanitizedInvoice;
    } catch (err: any) {
      if (err?.code === 'P2002' && idempotencyKey) {
        const inv = await this.getInvoiceById(ctx, input.invoiceId);
        if (!inv) {
          throw new BillingNotFoundError('Invoice not found or access denied.');
        }
        return inv;
      }
      throw err;
    }
  }
}

// Default singleton export
export const billingService = new BillingService();
