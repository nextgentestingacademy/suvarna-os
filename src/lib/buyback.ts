import { PrismaClient, BuybackVoucher, Ornament, JournalEntry } from '@prisma/client';
import { prisma as defaultPrisma, withDbRetry } from '@/lib/db';
import { SecurityContext, AuthorizationError } from '@/types/security';
import { assertPermission, assertBranchAccess } from '@/lib/rbac';
import { recordAuditLog } from '@/lib/audit';
import { Decimal } from '@/lib/decimal';
import { validateCustomerName, isValidIndianPhone } from '@/lib/customer';
import { getIndianFiscalYear, LedgerService } from '@/lib/ledger';
import { metalRateService, RateUnavailableError, RateValidationError } from '@/lib/metal-rates';

// ==============================================================================
// TYPED ERROR CLASSES
// ==============================================================================

export class BuybackValidationError extends Error {
  constructor(message: string, public readonly code: string = 'BUYBACK_VALIDATION_ERROR') {
    super(message);
    this.name = 'BuybackValidationError';
  }
}

export class BuybackNotFoundError extends Error {
  constructor(message: string = 'Buyback voucher not found or access denied', public readonly code: string = 'NOT_FOUND') {
    super(message);
    this.name = 'BuybackNotFoundError';
  }
}

export class BuybackConflictError extends Error {
  constructor(message: string, public readonly code: string = 'BUYBACK_CONFLICT') {
    super(message);
    this.name = 'BuybackConflictError';
  }
}

// ==============================================================================
// DOMAIN TYPES & INTERFACES
// ==============================================================================

export const PAN_MANDATORY_THRESHOLD = new Decimal('200000.00');
export const HIGH_VALUE_BUYBACK_THRESHOLD = new Decimal('100000.00');

export type BuybackPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'EXCHANGE_CREDIT';
export const VALID_BUYBACK_PAYMENT_METHODS: readonly BuybackPaymentMethod[] = [
  'CASH',
  'BANK_TRANSFER',
  'UPI',
  'EXCHANGE_CREDIT',
];

export type AssayTestingMethod = 'TOUCHSTONE' | 'ACID' | 'XRF' | 'SPECIFIC_GRAVITY' | 'ELECTRONIC';

export interface BuybackCalculationInput {
  metalType: string;
  purity: string;
  grossWeight: number | string | Decimal;
  stoneWeight?: number | string | Decimal;
  appliedRate: number | string | Decimal;
  deductionAmount?: number | string | Decimal;
  deductionReason?: string | null;
  customerPan?: string | null;
}

export interface BuybackCalculationResult {
  grossWeight: Decimal;
  stoneWeight: Decimal;
  netWeight: Decimal;
  appliedRate: Decimal;
  grossAmount: Decimal;
  deductionAmount: Decimal;
  deductionReason: string | null;
  netPayable: Decimal;
  isPanRequired: boolean;
  isPanValid: boolean;
}

export interface CreateBuybackVoucherInput {
  branchId: string;
  customerId?: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  customerPan?: string | null;

  metalType: string;
  purity: string;
  grossWeight: number | string | Decimal;
  stoneWeight?: number | string | Decimal;
  testingMethod?: AssayTestingMethod | string | null;
  testingNotes?: string | null;

  deductionAmount?: number | string | Decimal;
  deductionReason?: string | null;

  paymentMethod: BuybackPaymentMethod;
  paymentReference?: string | null;

  idempotencyKey?: string | null;
  approvedById?: string | null;
}

export interface RedeemVoucherCreditInput {
  voucherNumber: string;
  amount: Decimal;
  invoiceId: string;
  customerId?: string | null;
  customerPhone?: string | null;
}

export interface RedeemVoucherCreditResult {
  voucher: BuybackVoucher;
  redeemedAmount: Decimal;
  remainingBalance: Decimal;
  isFullyRedeemed: boolean;
}

export interface VoucherRedemptionQuote {
  id: string;
  voucherNumber: string;
  customerName: string;
  customerPhone: string;
  customerId: string | null;
  netPayable: string;
  redeemedAmount: string;
  availableBalance: string;
  status: string;
  isEligible: boolean;
  ineligibilityReason?: string;
}

export interface BuybackVoucherFilters {
  branchId?: string;
  customerId?: string;
  status?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  searchQuery?: string;
}

// ==============================================================================
// BUYBACK SERVICE
// ==============================================================================

export class BuybackService {
  private readonly db: PrismaClient;
  private readonly ledger: LedgerService;

  constructor(prismaClient?: PrismaClient) {
    this.db = prismaClient || defaultPrisma;
    this.ledger = new LedgerService({ prisma: this.db });
  }

  /**
   * Pure calculation engine for gold buyback valuation.
   * Decimal-safe, no making charges or selling rate leakage.
   */
  calculateBuyback(input: BuybackCalculationInput): BuybackCalculationResult {
    // 1. Gross Weight validation
    let grossDec: Decimal;
    try {
      grossDec = new Decimal(input.grossWeight).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
      if (grossDec.isNaN() || grossDec.lessThanOrEqualTo(0)) throw new Error();
    } catch {
      throw new BuybackValidationError(
        `Gross weight must be a positive number up to 3 decimal places. Received: '${input.grossWeight}'.`,
        'INVALID_GROSS_WEIGHT'
      );
    }

    // 2. Stone / Non-metal tare weight validation
    let stoneDec = new Decimal(0);
    if (input.stoneWeight !== undefined && input.stoneWeight !== null && String(input.stoneWeight).trim() !== '') {
      try {
        stoneDec = new Decimal(input.stoneWeight).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
        if (stoneDec.isNaN() || stoneDec.lessThan(0)) throw new Error();
      } catch {
        throw new BuybackValidationError(
          `Stone/tare weight cannot be negative. Received: '${input.stoneWeight}'.`,
          'INVALID_STONE_WEIGHT'
        );
      }
    }

    // 3. Verified Net Metal Weight
    const netDec = grossDec.minus(stoneDec);
    if (netDec.lessThanOrEqualTo(0)) {
      throw new BuybackValidationError(
        `Verified net metal weight must be greater than zero. Gross (${grossDec.toFixed(3)}g) cannot be less than or equal to stone tare (${stoneDec.toFixed(3)}g).`,
        'INVALID_NET_WEIGHT'
      );
    }

    // 4. Applied Buying Rate validation
    let rateDec: Decimal;
    try {
      rateDec = new Decimal(input.appliedRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      if (rateDec.isNaN() || rateDec.lessThanOrEqualTo(0)) throw new Error();
    } catch {
      throw new BuybackValidationError(
        `Buying rate per gram must be greater than zero. Received: '${input.appliedRate}'.`,
        'INVALID_BUYING_RATE'
      );
    }

    // 5. Gross Metal Value = Net Weight * Buying Rate
    const grossAmount = netDec.times(rateDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // 6. Deductions
    let deductionDec = new Decimal(0);
    let deductionReason: string | null = null;
    if (
      input.deductionAmount !== undefined &&
      input.deductionAmount !== null &&
      String(input.deductionAmount).trim() !== ''
    ) {
      try {
        deductionDec = new Decimal(input.deductionAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        if (deductionDec.isNaN() || deductionDec.lessThan(0)) throw new Error();
      } catch {
        throw new BuybackValidationError(
          `Deduction amount cannot be negative. Received: '${input.deductionAmount}'.`,
          'INVALID_DEDUCTION_AMOUNT'
        );
      }

      if (deductionDec.greaterThan(0)) {
        if (!input.deductionReason || input.deductionReason.trim() === '') {
          throw new BuybackValidationError(
            'A specific reason must be disclosed for any buyback deductions (e.g. melting loss, impurity removal).',
            'MISSING_DEDUCTION_REASON'
          );
        }
        deductionReason = input.deductionReason.trim();
      }
    }

    if (deductionDec.greaterThanOrEqualTo(grossAmount)) {
      throw new BuybackValidationError(
        `Deduction amount (₹${deductionDec.toFixed(2)}) cannot exceed or equal gross metal value (₹${grossAmount.toFixed(2)}).`,
        'EXCESSIVE_DEDUCTION'
      );
    }

    // 7. Net Payable = Gross Amount - Deductions
    const netPayable = grossAmount.minus(deductionDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // 8. Statutory KYC PAN threshold (Rule 114B: mandatory for transactions > 2 Lakhs)
    const isPanRequired = netPayable.greaterThan(PAN_MANDATORY_THRESHOLD);
    const panClean = (input.customerPan || '').toUpperCase().trim();
    const isPanValid = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panClean);

    return {
      grossWeight: grossDec,
      stoneWeight: stoneDec,
      netWeight: netDec,
      appliedRate: rateDec,
      grossAmount,
      deductionAmount: deductionDec,
      deductionReason,
      netPayable,
      isPanRequired,
      isPanValid,
    };
  }

  /**
   * Generates next sequential Buyback Voucher Number: BB/[BRANCH_CODE]/[FY]/[SEQ]
   */
  private async getNextVoucherNumber(
    tx: PrismaClient,
    organizationId: string,
    branchId: string,
    branchCode: string,
    date: Date = new Date()
  ): Promise<string> {
    const fiscalYear = getIndianFiscalYear(date);

    const seq = await tx.buybackSequence.upsert({
      where: {
        organizationId_branchId_fiscalYear: {
          organizationId,
          branchId,
          fiscalYear,
        },
      },
      update: {
        currentNumber: { increment: 1 },
      },
      create: {
        organizationId,
        branchId,
        fiscalYear,
        prefix: 'BB',
        currentNumber: 1,
      },
    });

    const paddedSeq = String(seq.currentNumber).padStart(4, '0');
    return `BB/${branchCode.toUpperCase()}/${fiscalYear}/${paddedSeq}`;
  }

  /**
   * Executes atomic Gold Buyback creation:
   * 1. Resolves and locks active buying rate.
   * 2. Validates seller, PAN, weights, and calculations.
   * 3. Prevents duplicate posting via idempotency key.
   * 4. Issues unique voucher number.
   * 5. Inwards physical metal into stock as a distinct, traceable scrap/buyback lot.
   * 6. Posts balanced double-entry accounting entries atomically.
   */
  async createBuybackVoucher(
    ctx: SecurityContext,
    input: CreateBuybackVoucherInput
  ): Promise<BuybackVoucher & { lotOrnament: Ornament; journalEntry: JournalEntry | null }> {
    assertPermission(ctx, 'BILLING_CREATE');
    assertBranchAccess(ctx, input.branchId);

    // Fast-path Idempotency check
    const idempotencyKey = input.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      const existing = await this.db.buybackVoucher.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: ctx.tenantId,
            idempotencyKey,
          },
        },
        include: {
          lotOrnament: true,
          journalEntry: true,
        },
      });
      if (existing) {
        return existing as any;
      }
    }

    // Step 1: Validate Customer / Walk-in details
    const customerName = input.customerName?.trim();
    if (!customerName || customerName.length < 2) {
      throw new BuybackValidationError('Customer or seller name is required.', 'INVALID_CUSTOMER_NAME');
    }

    const customerPhone = input.customerPhone?.trim();
    if (!customerPhone || !isValidIndianPhone(customerPhone)) {
      throw new BuybackValidationError('A valid 10-digit customer phone number is required.', 'INVALID_PHONE');
    }

    // Step 2: Validate Payment Method
    const paymentMethod = input.paymentMethod as BuybackPaymentMethod;
    if (!VALID_BUYBACK_PAYMENT_METHODS.includes(paymentMethod)) {
      throw new BuybackValidationError(
        `Invalid payment method: '${input.paymentMethod}'. Supported: ${VALID_BUYBACK_PAYMENT_METHODS.join(', ')}.`,
        'INVALID_PAYMENT_METHOD'
      );
    }

    // Step 3: Resolve current active buying rate (Never falls back to selling rate)
    const resolvedRate = await metalRateService.getBuyingRate(ctx, {
      metalType: input.metalType,
      purity: input.purity,
      branchId: input.branchId,
    });

    // Step 4: Calculate valuation
    const calc = this.calculateBuyback({
      metalType: resolvedRate.metalType,
      purity: resolvedRate.purity,
      grossWeight: input.grossWeight,
      stoneWeight: input.stoneWeight,
      appliedRate: resolvedRate.ratePerGram,
      deductionAmount: input.deductionAmount,
      deductionReason: input.deductionReason,
      customerPan: input.customerPan,
    });

    // Step 5: Enforce KYC PAN rule
    if (calc.isPanRequired && !calc.isPanValid) {
      throw new BuybackValidationError(
        `Statutory PAN compliance violation (Rule 114B): Transactions exceeding ₹2,00,000 require a valid customer PAN card. Current payable: ₹${calc.netPayable.toFixed(2)}.`,
        'PAN_REQUIRED'
      );
    }

    // Step 6: Enforce Manager Approval Policy for high-value transactions
    let effectiveApprovedById: string | null = null;
    const isHighValue = calc.netPayable.greaterThan(HIGH_VALUE_BUYBACK_THRESHOLD);

    if (isHighValue) {
      if (ctx.role === 'OWNER' || ctx.role === 'MANAGER') {
        effectiveApprovedById = ctx.userId;
      } else {
        if (!input.approvedById || !input.approvedById.trim()) {
          throw new AuthorizationError(
            `High-value buyback transactions exceeding ₹${HIGH_VALUE_BUYBACK_THRESHOLD.toNumber().toLocaleString('en-IN')} require Manager or Owner authorization.`,
            'MANAGER_APPROVAL_REQUIRED'
          );
        }
        effectiveApprovedById = input.approvedById.trim();
      }
    } else {
      effectiveApprovedById = input.approvedById?.trim() || (['OWNER', 'MANAGER'].includes(ctx.role) ? ctx.userId : null);
    }

    // Execute atomic transaction
    return withDbRetry(async () => {
      return this.db.$transaction(async (tx) => {
        // Validate explicit manager approver membership if operator is non-manager
        if (effectiveApprovedById && !['OWNER', 'MANAGER'].includes(ctx.role)) {
          const approverMember = await tx.member.findFirst({
            where: {
              organizationId: ctx.tenantId,
              userId: effectiveApprovedById,
              status: 'ACTIVE',
              role: { in: ['OWNER', 'MANAGER'] },
            },
          });
          if (!approverMember) {
            throw new AuthorizationError(
              'Invalid manager approval: The designated approver is not an active Manager or Owner in this organization.',
              'INVALID_APPROVER'
            );
          }
        }
        // Double check idempotency inside transaction
        if (idempotencyKey) {
          const existing = await tx.buybackVoucher.findUnique({
            where: {
              organizationId_idempotencyKey: {
                organizationId: ctx.tenantId,
                idempotencyKey,
              },
            },
            include: {
              lotOrnament: true,
              journalEntry: true,
            },
          });
          if (existing) return existing as any;
        }

        // Fetch branch for code
        const branch = await tx.branch.findUniqueOrThrow({
          where: {
            organizationId_id: {
              organizationId: ctx.tenantId,
              id: input.branchId,
            },
          },
        });

        // Generate voucher number
        const voucherNumber = await this.getNextVoucherNumber(
          tx as any,
          ctx.tenantId,
          input.branchId,
          branch.code
        );

        // Find or create buyback lot product definition for tenant
        let scrapProduct = await tx.product.findFirst({
          where: {
            organizationId: ctx.tenantId,
            sku: 'SCRAP-BUYBACK-LOT',
          },
        });

        if (!scrapProduct) {
          scrapProduct = await tx.product.create({
            data: {
              organizationId: ctx.tenantId,
              sku: 'SCRAP-BUYBACK-LOT',
              name: 'Customer Old Metal Scrap Lot',
              category: 'Old Gold',
              metalType: resolvedRate.metalType,
              purity: resolvedRate.purity,
              description: 'Standard product definition for customer old gold and scrap metal buybacks',
            },
          });
        }

        // Create distinct traceable inventory item (buyback lot)
        const lotOrnament = await tx.ornament.create({
          data: {
            organizationId: ctx.tenantId,
            branchId: input.branchId,
            productId: scrapProduct.id,
            tagCode: `LOT-${voucherNumber.replace(/\//g, '-')}`,
            metalType: resolvedRate.metalType,
            purity: resolvedRate.purity,
            grossWeight: calc.grossWeight.toFixed(3),
            stoneWeight: calc.stoneWeight.toFixed(3),
            netWeight: calc.netWeight.toFixed(3),
            costAmount: calc.netPayable.toFixed(2),
            priceAmount: null,
            makingChargeType: null,
            status: 'AVAILABLE',
          },
        });

        // Record stock inward movement
        await tx.stockMovement.create({
          data: {
            organizationId: ctx.tenantId,
            ornamentId: lotOrnament.id,
            toBranchId: input.branchId,
            fromBranchId: null,
            movementType: 'INWARD',
            reason: `Old Gold Buyback Voucher #${voucherNumber}`,
            metadata: {
              voucherNumber,
              testingMethod: input.testingMethod || 'VISUAL_TOUCHSTONE',
              netPayable: calc.netPayable.toFixed(2),
              appliedRate: calc.appliedRate.toFixed(2),
            },
            userId: ctx.userId,
          },
        });

        // Accounting: Ensure accounts exist
        const accountMap = await this.ledger.ensureBillingAccounts(ctx, tx);

        const inventoryAccountId = accountMap.get('1220') || accountMap.get('1210'); // 1220 Old Gold Inventory or 1210 Inventory
        if (!inventoryAccountId) {
          throw new BuybackValidationError('Inventory ledger account (1220/1210) not found.', 'MISSING_LEDGER_ACCOUNT');
        }

        let creditAccountCode: string;
        if (paymentMethod === 'CASH') {
          creditAccountCode = '1010'; // Cash on Hand
        } else if (paymentMethod === 'BANK_TRANSFER') {
          creditAccountCode = '1040'; // Business Bank Account
        } else if (paymentMethod === 'UPI') {
          creditAccountCode = '1020'; // UPI Clearing
        } else {
          creditAccountCode = '2120'; // Customer Buyback Payables / Exchange Credit
        }

        const creditAccountId = accountMap.get(creditAccountCode);
        if (!creditAccountId) {
          throw new BuybackValidationError(
            `Settlement ledger account for '${creditAccountCode}' not found.`,
            'MISSING_LEDGER_ACCOUNT'
          );
        }

        // Post balanced Journal Entry atomically
        const journalResult = await this.ledger.postJournalEntry(
          ctx,
          {
            branchId: input.branchId,
            postingDate: new Date(),
            sourceType: 'BUYBACK',
            sourceId: voucherNumber,
            idempotencyKey: idempotencyKey ? `JE-${idempotencyKey}` : null,
            narration: `Old Gold Buyback #${voucherNumber} from ${customerName} (${calc.netWeight.toFixed(3)}g @ ₹${calc.appliedRate.toFixed(2)}/g)`,
            lines: [
              {
                accountId: inventoryAccountId,
                debitAmount: calc.netPayable.toFixed(2),
                creditAmount: '0.00',
                narration: `Acquisition of old metal scrap via Voucher #${voucherNumber}`,
              },
              {
                accountId: creditAccountId,
                debitAmount: '0.00',
                creditAmount: calc.netPayable.toFixed(2),
                narration: `Settlement via ${paymentMethod} for Buyback #${voucherNumber}`,
              },
            ],
          },
          { tx: tx as any }
        );

        // Create Buyback Voucher
        const voucher = await tx.buybackVoucher.create({
          data: {
            organizationId: ctx.tenantId,
            branchId: input.branchId,
            voucherNumber,
            customerId: input.customerId || null,
            customerName,
            customerPhone,
            customerAddress: input.customerAddress?.trim() || null,
            customerPan: input.customerPan?.toUpperCase().trim() || null,
            metalType: resolvedRate.metalType,
            purity: resolvedRate.purity,
            grossWeight: calc.grossWeight.toFixed(3),
            stoneWeight: calc.stoneWeight.toFixed(3),
            netWeight: calc.netWeight.toFixed(3),
            testingMethod: input.testingMethod || null,
            testingNotes: input.testingNotes?.trim() || null,
            metalRateId: resolvedRate.metalRateId || null,
            appliedRate: calc.appliedRate.toFixed(2),
            rateEffectiveAt: resolvedRate.effectiveFrom,
            grossAmount: calc.grossAmount.toFixed(2),
            deductionAmount: calc.deductionAmount.toFixed(2),
            deductionReason: calc.deductionReason,
            netPayable: calc.netPayable.toFixed(2),
            paymentMethod,
            paymentReference: input.paymentReference?.trim() || null,
            status: paymentMethod === 'EXCHANGE_CREDIT' ? 'COMPLETED' : 'SETTLED',
            redeemedAmount: '0.00',
            lotOrnamentId: lotOrnament.id,
            journalEntryId: journalResult.entry.id,
            idempotencyKey,
            operatorId: ctx.userId,
            createdById: ctx.userId,
            approvedById: effectiveApprovedById,
          },
          include: {
            lotOrnament: true,
            journalEntry: true,
          },
        });

        await recordAuditLog(tx as any, ctx, {
          action: 'CREATE',
          entityType: 'BuybackVoucher',
          entityId: voucher.id,
          changedFields: {
            voucherNumber,
            customerName,
            netWeight: calc.netWeight.toFixed(3),
            netPayable: calc.netPayable.toFixed(2),
            paymentMethod,
            createdById: ctx.userId,
            operatorId: ctx.userId,
            approvedById: effectiveApprovedById,
          },
        });

        return voucher as any;
      });
    });
  }

  /**
   * Retrieves a single buyback voucher by ID.
   */
  async getBuybackVoucher(ctx: SecurityContext, id: string): Promise<BuybackVoucher | null> {
    return this.db.buybackVoucher.findFirst({
      where: {
        organizationId: ctx.tenantId,
        id,
      },
      include: {
        customer: true,
        branch: true,
        lotOrnament: true,
        journalEntry: {
          include: {
            lines: {
              include: { account: true },
            },
          },
        },
        exchangeInvoice: true,
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  /**
   * Lists buyback vouchers for tenant with filtering and search.
   */
  async listBuybackVouchers(ctx: SecurityContext, filters?: BuybackVoucherFilters): Promise<BuybackVoucher[]> {
    return this.db.buybackVoucher.findMany({
      where: {
        organizationId: ctx.tenantId,
        ...(filters?.branchId ? { branchId: filters.branchId } : {}),
        ...(filters?.customerId ? { customerId: filters.customerId } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.startDate || filters?.endDate
          ? {
              createdAt: {
                ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
                ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
              },
            }
          : {}),
        ...(filters?.searchQuery
          ? {
              OR: [
                { voucherNumber: { contains: filters.searchQuery, mode: 'insensitive' } },
                { customerName: { contains: filters.searchQuery, mode: 'insensitive' } },
                { customerPhone: { contains: filters.searchQuery } },
                { customerPan: { contains: filters.searchQuery, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        lotOrnament: { select: { id: true, tagCode: true, status: true } },
        exchangeInvoice: { select: { id: true, invoiceNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Concurrency-safe atomic redemption of exchange credit voucher against an invoice.
   * Enforces:
   * 1. Tenant boundary.
   * 2. Active, non-cancelled, exchange-credit voucher eligibility.
   * 3. Customer identity verification (if customer ID or phone is recorded on both).
   * 4. Available balance verification (rejects over-redemption).
   * 5. Row-level concurrency locking and atomic balance increment.
   * 6. Audit trail logging.
   * Note: Executes inside the caller's database transaction tx so rollback is automatic on invoice failure.
   */
  async redeemBuybackVoucherCredit(
    tx: any,
    ctx: SecurityContext,
    input: RedeemVoucherCreditInput
  ): Promise<RedeemVoucherCreditResult> {
    const voucherNumber = input.voucherNumber?.trim();
    if (!voucherNumber) {
      throw new BuybackValidationError(
        'Buyback voucher number is required for exchange credit redemption.',
        'MISSING_VOUCHER_NUMBER'
      );
    }

    const redeemAmount = new Decimal(input.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (redeemAmount.lessThanOrEqualTo(0)) {
      throw new BuybackValidationError(
        'Redemption amount must be greater than zero.',
        'INVALID_REDEMPTION_AMOUNT'
      );
    }

    // 1. Fetch voucher strictly within tenant boundary
    const voucher = await tx.buybackVoucher.findFirst({
      where: {
        organizationId: ctx.tenantId,
        voucherNumber,
      },
    });

    if (!voucher) {
      throw new BuybackNotFoundError(`Buyback voucher #${voucherNumber} not found or access denied.`);
    }

    // 2. Ineligible voucher checks
    if (voucher.paymentMethod !== 'EXCHANGE_CREDIT') {
      throw new BuybackValidationError(
        `Buyback voucher #${voucherNumber} was issued with settlement method '${voucher.paymentMethod}' and cannot be redeemed as exchange credit.`,
        'INELIGIBLE_VOUCHER'
      );
    }

    if (voucher.status === 'CANCELLED' || voucher.status === 'VOIDED') {
      throw new BuybackValidationError(
        `Buyback voucher #${voucherNumber} is marked as '${voucher.status}' and cannot be redeemed.`,
        'INELIGIBLE_VOUCHER'
      );
    }

    // 3. Customer identity matching
    if (voucher.customerId && input.customerId && voucher.customerId !== input.customerId) {
      throw new BuybackValidationError(
        `Buyback voucher #${voucherNumber} was issued to customer '${voucher.customerName}' and cannot be redeemed for a different customer account.`,
        'CUSTOMER_MISMATCH'
      );
    }

    if (voucher.customerPhone && input.customerPhone) {
      const vPhone = voucher.customerPhone.trim();
      const iPhone = input.customerPhone.trim();
      if (vPhone && iPhone && vPhone !== iPhone) {
        throw new BuybackValidationError(
          `Buyback voucher #${voucherNumber} registered phone (${vPhone}) does not match invoice customer phone (${iPhone}).`,
          'CUSTOMER_MISMATCH'
        );
      }
    }

    // 4. Row-level concurrency lock on the voucher record
    await tx.$executeRaw`SELECT id FROM buyback_vouchers WHERE id = ${voucher.id} FOR UPDATE`;

    // Re-fetch after acquiring exclusive lock to observe any committed state from concurrent tx
    const lockedVoucher = await tx.buybackVoucher.findUniqueOrThrow({
      where: { id: voucher.id },
    });

    // 5. Balance computation & over-redemption guard
    const netPayable = new Decimal(lockedVoucher.netPayable);
    const currentRedeemed = new Decimal(lockedVoucher.redeemedAmount);
    const availableBalance = netPayable.minus(currentRedeemed).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    if (availableBalance.lessThanOrEqualTo(0)) {
      throw new BuybackConflictError(
        `Buyback voucher #${voucherNumber} is already fully redeemed (Net payable: ₹${netPayable.toFixed(2)}, Redeemed: ₹${currentRedeemed.toFixed(2)}).`,
        'VOUCHER_EXHAUSTED'
      );
    }

    if (redeemAmount.greaterThan(availableBalance)) {
      throw new BuybackValidationError(
        `Redemption amount (₹${redeemAmount.toFixed(2)}) exceeds available balance (₹${availableBalance.toFixed(2)}) on Buyback voucher #${voucherNumber}.`,
        'INSUFFICIENT_VOUCHER_BALANCE'
      );
    }

    // 6. Compute new balance and status
    const newRedeemed = currentRedeemed.plus(redeemAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const isFullyRedeemed = newRedeemed.greaterThanOrEqualTo(netPayable);
    const newStatus = isFullyRedeemed ? 'EXCHANGED' : 'PARTIALLY_REDEEMED';
    const remainingBalance = netPayable.minus(newRedeemed).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    // 7. Atomic optimistic balance update
    const updateResult = await tx.buybackVoucher.updateMany({
      where: {
        id: lockedVoucher.id,
        organizationId: ctx.tenantId,
        redeemedAmount: lockedVoucher.redeemedAmount,
        netPayable: { gte: newRedeemed.toFixed(2) },
      },
      data: {
        redeemedAmount: newRedeemed.toFixed(2),
        status: newStatus,
        exchangeInvoiceId: input.invoiceId,
      },
    });

    if (updateResult.count === 0) {
      throw new BuybackConflictError(
        `Concurrent redemption conflict detected on voucher #${voucherNumber}. Available balance may have changed. Please retry.`,
        'CONCURRENT_VOUCHER_REDEMPTION'
      );
    }

    // 8. Record audit trail entry inside same transaction
    await recordAuditLog(tx, ctx, {
      action: 'UPDATE',
      entityType: 'BuybackVoucher',
      entityId: voucher.id,
      changedFields: {
        voucherNumber,
        previousRedeemed: currentRedeemed.toFixed(2),
        newRedeemed: newRedeemed.toFixed(2),
        availableBalance: remainingBalance.toFixed(2),
        status: newStatus,
        exchangeInvoiceId: input.invoiceId,
      },
    });

    const updatedVoucher = await tx.buybackVoucher.findUniqueOrThrow({
      where: { id: voucher.id },
    });

    return {
      voucher: updatedVoucher,
      redeemedAmount: redeemAmount,
      remainingBalance,
      isFullyRedeemed,
    };
  }

  /**
   * Retrieves voucher details and remaining balance quote for POS redemption.
   */
  async getVoucherForRedemption(
    ctx: SecurityContext,
    voucherNumber: string
  ): Promise<VoucherRedemptionQuote> {
    const vNum = voucherNumber?.trim();
    if (!vNum) {
      throw new BuybackValidationError('Voucher number is required.', 'MISSING_VOUCHER_NUMBER');
    }

    const voucher = await this.db.buybackVoucher.findFirst({
      where: {
        organizationId: ctx.tenantId,
        voucherNumber: vNum,
      },
    });

    if (!voucher) {
      throw new BuybackNotFoundError(`Buyback voucher #${vNum} not found or access denied.`);
    }

    const netPayable = new Decimal(voucher.netPayable);
    const redeemedAmount = new Decimal(voucher.redeemedAmount);
    const availableBalance = netPayable.minus(redeemedAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    let isEligible = true;
    let ineligibilityReason: string | undefined;

    if (voucher.paymentMethod !== 'EXCHANGE_CREDIT') {
      isEligible = false;
      ineligibilityReason = `Voucher was settled via ${voucher.paymentMethod}, not exchange credit.`;
    } else if (voucher.status === 'CANCELLED' || voucher.status === 'VOIDED') {
      isEligible = false;
      ineligibilityReason = `Voucher has been ${voucher.status}.`;
    } else if (availableBalance.lessThanOrEqualTo(0)) {
      isEligible = false;
      ineligibilityReason = 'Voucher balance is already fully consumed.';
    }

    return {
      id: voucher.id,
      voucherNumber: voucher.voucherNumber,
      customerName: voucher.customerName,
      customerPhone: voucher.customerPhone,
      customerId: voucher.customerId,
      netPayable: netPayable.toFixed(2),
      redeemedAmount: redeemedAmount.toFixed(2),
      availableBalance: availableBalance.toFixed(2),
      status: voucher.status,
      isEligible,
      ineligibilityReason,
    };
  }

  /**
   * Links a buyback voucher to a sales invoice (Exchange settlement).
   */
  async linkBuybackToInvoice(
    ctx: SecurityContext,
    voucherNumber: string,
    invoiceId: string
  ): Promise<BuybackVoucher> {
    return this.db.$transaction(async (tx) => {
      const voucher = await tx.buybackVoucher.findFirst({
        where: {
          organizationId: ctx.tenantId,
          voucherNumber,
        },
      });
      if (!voucher) {
        throw new BuybackNotFoundError(`Buyback voucher #${voucherNumber} not found.`);
      }
      const netPayable = new Decimal(voucher.netPayable);
      const remaining = netPayable.minus(new Decimal(voucher.redeemedAmount));
      const res = await this.redeemBuybackVoucherCredit(tx, ctx, {
        voucherNumber,
        amount: remaining,
        invoiceId,
      });
      return res.voucher;
    });
  }
}

export const buybackService = new BuybackService();
