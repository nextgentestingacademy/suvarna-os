import { PrismaClient, LedgerAccount, JournalEntry, JournalLine } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
import { SecurityContext, AuthorizationError } from '@/types/security';
import { assertPermission, assertBranchAccess, hasPermission } from '@/lib/rbac';
import { recordAuditLog } from '@/lib/audit';
import { Decimal } from '@/lib/decimal';

// ==============================================================================
// TYPED ERROR CLASSES
// ==============================================================================

export class LedgerValidationError extends Error {
  constructor(message: string, public readonly code: string = 'LEDGER_VALIDATION_ERROR') {
    super(message);
    this.name = 'LedgerValidationError';
  }
}

export class LedgerConflictError extends Error {
  constructor(message: string, public readonly code: string = 'LEDGER_CONFLICT') {
    super(message);
    this.name = 'LedgerConflictError';
  }
}

export class LedgerNotFoundError extends Error {
  constructor(message: string = 'Ledger resource not found or access denied', public readonly code: string = 'NOT_FOUND') {
    super(message);
    this.name = 'LedgerNotFoundError';
  }
}

export class LedgerImmutabilityError extends Error {
  constructor(message: string = 'Posted journal entries are strictly immutable. To correct an entry, post a balancing reversal entry.', public readonly code: string = 'IMMUTABLE_RECORD') {
    super(message);
    this.name = 'LedgerImmutabilityError';
  }
}

// ==============================================================================
// DOMAIN TYPES & ENUMS
// ==============================================================================

export type AccountClassification = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type NormalBalance = 'DEBIT' | 'CREDIT';
export type JournalSourceType = 'INVOICE' | 'PAYMENT' | 'EXPENSE' | 'REVERSAL' | 'MANUAL' | 'BUYBACK';
export type JournalStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

/**
 * Canonical mapping between POS tender payment methods and ledger chart of accounts.
 * - CASH: Physical currency tendered at the counter -> 1010 (Cash on Hand)
 * - UPI: Real-time QR / VPA transaction -> 1020 (UPI Clearing)
 * - CARD: Credit/Debit card EDC terminal swipe -> 1030 (Card Settlement Clearing)
 * - BANK_TRANSFER: In-transit customer bank transfer (NEFT/RTGS/IMPS) -> 1045 (Bank Transfer Inward Clearing)
 * - CHEQUE: Physical cheque accepted at billing desk -> 1050 (Cheques in Hand / Clearing)
 */
export const PAYMENT_METHOD_ACCOUNT_MAP: Record<string, string> = {
  CASH: '1010',
  UPI: '1020',
  CARD: '1030',
  BANK_TRANSFER: '1045',
  CHEQUE: '1050',
  EXCHANGE_CREDIT: '2120',
};

export interface StarterAccountDefinition {
  code: string;
  name: string;
  classification: AccountClassification;
  normalBalance: NormalBalance;
  description: string;
}

export interface JournalLineInput {
  accountId: string;
  debitAmount: number | string | Decimal;
  creditAmount: number | string | Decimal;
  narration?: string | null;
  lineNumber?: number;
}

export interface PostJournalEntryInput {
  branchId?: string | null;
  entryNumber?: string;
  postingDate?: Date;
  sourceType: JournalSourceType | string;
  sourceId?: string | null;
  idempotencyKey?: string | null;
  narration?: string | null;
  reversalOfId?: string | null;
  lines: JournalLineInput[];
}

export type JournalEntryWithLines = JournalEntry & {
  lines: (JournalLine & {
    account: LedgerAccount;
  })[];
};

export interface PostJournalResult {
  entry: JournalEntryWithLines;
  isDuplicate: boolean;
}

// ==============================================================================
// STARTER CHART OF ACCOUNTS (19 Core Accounts)
// ==============================================================================

export const STARTER_CHART_OF_ACCOUNTS: readonly StarterAccountDefinition[] = [
  {
    code: '1010',
    name: 'Cash on Hand',
    classification: 'ASSET',
    normalBalance: 'DEBIT',
    description: 'Physical cash held in showroom cash drawers and petty cash',
  },
  {
    code: '1020',
    name: 'UPI Clearing',
    classification: 'ASSET',
    normalBalance: 'DEBIT',
    description: 'Real-time UPI payments collected at checkout awaiting bank settlement',
  },
  {
    code: '1030',
    name: 'Card Settlement Clearing',
    classification: 'ASSET',
    normalBalance: 'DEBIT',
    description: 'Credit and debit card transactions pending batch settlement with acquiring bank',
  },
  {
    code: '1040',
    name: 'Business Bank Account',
    classification: 'ASSET',
    normalBalance: 'DEBIT',
    description: 'Primary operating bank account for business transactions and settlements',
  },
  {
    code: '1045',
    name: 'Bank Transfer Inward Clearing',
    classification: 'ASSET',
    normalBalance: 'DEBIT',
    description: 'Electronic funds transfers (NEFT / RTGS / IMPS) initiated by customers at checkout awaiting bank statement reconciliation',
  },
  {
    code: '1050',
    name: 'Cheques in Hand / Clearing',
    classification: 'ASSET',
    normalBalance: 'DEBIT',
    description: 'Physical cheques accepted at billing counter awaiting bank presentation and realization',
  },
  {
    code: '1110',
    name: 'Accounts Receivable',
    classification: 'ASSET',
    normalBalance: 'DEBIT',
    description: 'Customer credit dues and unpaid invoice balances',
  },
  {
    code: '1210',
    name: 'Jewellery Inventory',
    classification: 'ASSET',
    normalBalance: 'DEBIT',
    description: 'Physical jewellery stock at wholesale cost or baseline valuation',
  },
  {
    code: '1220',
    name: 'Old Gold / Scrap Metal Inventory',
    classification: 'ASSET',
    normalBalance: 'DEBIT',
    description: 'Purchased customer old gold and scrap metal lots awaiting refining or exchange',
  },
  {
    code: '2010',
    name: 'Output CGST Payable',
    classification: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'Central GST (1.5%) collected on intra-state jewellery sales to be remitted to government',
  },
  {
    code: '2020',
    name: 'Output SGST Payable',
    classification: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'State GST (1.5%) collected on intra-state jewellery sales to be remitted to state government',
  },
  {
    code: '2030',
    name: 'Output IGST Payable',
    classification: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'Integrated GST (3.0%) collected on inter-state jewellery sales',
  },
  {
    code: '2110',
    name: 'Customer Advances',
    classification: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'Unearned customer advance deposits, gold savings scheme receipts, and custom order prepayments',
  },
  {
    code: '2120',
    name: 'Customer Buyback Payables / Exchange Credit',
    classification: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'Outstanding buyback credits issued to customers redeemable against jewellery purchases or pending disbursement',
  },
  {
    code: '3010',
    name: 'Opening Equity / Retained Earnings',
    classification: 'EQUITY',
    normalBalance: 'CREDIT',
    description: 'Cumulative retained earnings and initial owner equity capital',
  },
  {
    code: '4010',
    name: 'Precious Metal Sales Revenue',
    classification: 'REVENUE',
    normalBalance: 'CREDIT',
    description: 'Gross revenue recognized on fine gold, silver, and platinum metal value sold',
  },
  {
    code: '4020',
    name: 'Making Charges Revenue',
    classification: 'REVENUE',
    normalBalance: 'CREDIT',
    description: 'Revenue recognized from craftsmanship, manufacturing, and labour charges',
  },
  {
    code: '4030',
    name: 'Stone and Gemstone Revenue',
    classification: 'REVENUE',
    normalBalance: 'CREDIT',
    description: 'Revenue recognized from precious diamonds, gemstones, and pearls mounted in jewellery',
  },
  {
    code: '4090',
    name: 'Rounding Adjustment',
    classification: 'REVENUE',
    normalBalance: 'CREDIT',
    description: 'Other operating revenue variance resulting from cash and invoice round-off to nearest rupee; positive round-off credited as revenue, negative round-off debited',
  },
  {
    code: '4110',
    name: 'Sales Discounts and Rebates',
    classification: 'REVENUE',
    normalBalance: 'DEBIT',
    description: 'Contra-revenue account for promotional discounts and cashier item concessions reducing gross revenue',
  },
  {
    code: '4120',
    name: 'Sales Returns and Allowances',
    classification: 'REVENUE',
    normalBalance: 'DEBIT',
    description: 'Contra-revenue account for customer jewellery returns and post-sale price concessions reducing gross revenue',
  },
  {
    code: '5010',
    name: 'Cost of Goods Sold',
    classification: 'EXPENSE',
    normalBalance: 'DEBIT',
    description: 'Wholesale acquisition cost and direct materials of sold ornaments derecognized from inventory',
  },
  {
    code: '5110',
    name: 'Payment Processing Fees',
    classification: 'EXPENSE',
    normalBalance: 'DEBIT',
    description: 'Bank merchant discount rates (MDR), POS gateway charges, and interchange deductions',
  },
] as const;

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

/**
 * Calculates the standard Indian fiscal year (April 1 to March 31).
 * E.g., Oct 2026 -> "2026-2027", Feb 2027 -> "2026-2027".
 */
export function getIndianFiscalYear(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 2 = Mar, 3 = Apr
  const year = date.getFullYear();
  if (month >= 3) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

// ==============================================================================
// LEDGER SERVICE CLASS
// ==============================================================================

export class LedgerService {
  private prisma: PrismaClient;

  constructor(options?: { prisma?: PrismaClient }) {
    this.prisma = options?.prisma || defaultPrisma;
  }

  /**
   * Initializes or updates the starter Chart of Accounts for a tenant idempotently.
   * - Scoped strictly to ctx.tenantId.
   * - Does not overwrite customized account names.
   * - Does not deactivate existing accounts.
   * - Does not create opening balances.
   */
  async initChartOfAccounts(ctx: SecurityContext): Promise<LedgerAccount[]> {
    assertPermission(ctx, 'ACCOUNTS_VIEW');

    const tenantId = ctx.tenantId;
    if (!tenantId) {
      throw new AuthorizationError('Tenant context is required to initialize chart of accounts');
    }

    // Fetch existing accounts for tenant
    const existingAccounts = await this.prisma.ledgerAccount.findMany({
      where: { organizationId: tenantId },
      select: { code: true },
    });
    const existingCodes = new Set(existingAccounts.map((a) => a.code));

    // Filter to only new starter accounts not yet created
    const accountsToCreate = STARTER_CHART_OF_ACCOUNTS.filter((acc) => !existingCodes.has(acc.code));

    if (accountsToCreate.length > 0) {
      await this.prisma.ledgerAccount.createMany({
        data: accountsToCreate.map((acc) => ({
          organizationId: tenantId,
          code: acc.code,
          name: acc.name,
          classification: acc.classification,
          normalBalance: acc.normalBalance,
          description: acc.description,
          isSystemAccount: true,
          isActive: true,
        })),
        skipDuplicates: true,
      });
    }

    return this.prisma.ledgerAccount.findMany({
      where: { organizationId: tenantId },
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Idempotently resolves account IDs for billing and checkout posting.
   * Returns a Map of account code -> account ID.
   */
  async ensureBillingAccounts(ctx: SecurityContext, txClient?: any): Promise<Map<string, string>> {
    const client = txClient || this.prisma;
    const tenantId = ctx.tenantId;

    let accounts = await client.ledgerAccount.findMany({
      where: { organizationId: tenantId, isActive: true },
    });

    const existingCodes = new Set(accounts.map((a: LedgerAccount) => a.code));
    const missingStarter = STARTER_CHART_OF_ACCOUNTS.filter((acc) => !existingCodes.has(acc.code));

    if (missingStarter.length > 0) {
      await client.ledgerAccount.createMany({
        data: missingStarter.map((acc) => ({
          organizationId: tenantId,
          code: acc.code,
          name: acc.name,
          classification: acc.classification,
          normalBalance: acc.normalBalance,
          description: acc.description,
          isSystemAccount: true,
          isActive: true,
        })),
        skipDuplicates: true,
      });

      accounts = await client.ledgerAccount.findMany({
        where: { organizationId: tenantId, isActive: true },
      });
    }

    return new Map<string, string>(accounts.map((a: LedgerAccount) => [a.code, a.id]));
  }

  /**
   * Validates and posts a balanced, multi-line journal entry atomically.
   *
   * Invariants enforced:
   * 1. Minimum 2 lines.
   * 2. Non-negative amounts on each line.
   * 3. Exactly one positive side (debit > 0 OR credit > 0, never both or neither).
   * 4. Sum of debits === sum of credits (exact Decimal arithmetic).
   * 5. Tenant isolation: All accounts and branch must belong to ctx.tenantId.
   * 6. Idempotency: Duplicate idempotency key safely returns existing entry without creating duplicates.
   * 7. Atomicity: Database transaction creates header and lines together. Zero orphaned records on error.
   */
  async postJournalEntry(
    ctx: SecurityContext,
    input: PostJournalEntryInput,
    options?: { tx?: any }
  ): Promise<PostJournalResult> {
    // Permission validation:
    // Billing operations (INVOICE / PAYMENT) require BILLING_CREATE or ACCOUNTS_VIEW
    // Reversals require ACCOUNTS_VIEW or BILLING_VOID, and cannot be run by SALES_STAFF
    // Manual operations require ACCOUNTS_VIEW
    if (input.sourceType === 'INVOICE' || input.sourceType === 'PAYMENT' || input.sourceType === 'BUYBACK') {
      if (!hasPermission(ctx.role, 'BILLING_CREATE') && !hasPermission(ctx.role, 'ACCOUNTS_VIEW')) {
        throw new AuthorizationError(
          `Permission denied: Role '${ctx.role}' does not have 'BILLING_CREATE' or 'ACCOUNTS_VIEW' access.`,
          'PERMISSION_DENIED'
        );
      }
    } else if (input.sourceType === 'REVERSAL' || input.reversalOfId) {
      if (ctx.role === 'SALES_STAFF') {
        throw new AuthorizationError(
          `Permission denied: Sales staff are not authorized to post journal reversals.`,
          'REVERSAL_NOT_PERMITTED'
        );
      }
      if (!hasPermission(ctx.role, 'ACCOUNTS_VIEW') && !hasPermission(ctx.role, 'BILLING_VOID')) {
        throw new AuthorizationError(
          `Permission denied: Reversals require 'ACCOUNTS_VIEW' or 'BILLING_VOID' authorization.`,
          'PERMISSION_DENIED'
        );
      }
    } else {
      assertPermission(ctx, 'ACCOUNTS_VIEW');
    }

    const tenantId = ctx.tenantId;
    if (!tenantId) {
      throw new AuthorizationError('Tenant context is required to post journal entries');
    }

    // 1. Minimum 2 lines rule
    if (!input.lines || !Array.isArray(input.lines) || input.lines.length < 2) {
      throw new LedgerValidationError(
        `A journal entry must contain at least 2 lines. Provided: ${input.lines?.length ?? 0} lines.`,
        'MINIMUM_LINES_REQUIRED'
      );
    }

    const client = options?.tx || this.prisma;

    // 2. Validate branch isolation if branchId provided
    if (input.branchId) {
      const branch = await client.branch.findFirst({
        where: {
          id: input.branchId,
          organizationId: tenantId,
        },
      });
      if (!branch) {
        throw new LedgerValidationError(
          `Branch '${input.branchId}' does not exist or does not belong to organization '${tenantId}'.`,
          'BRANCH_NOT_FOUND'
        );
      }
      assertBranchAccess(ctx, input.branchId);
    }

    // 3. Check for existing idempotency key prior to transaction
    if (input.idempotencyKey) {
      const existing = await client.journalEntry.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: {
          lines: {
            include: { account: true },
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      if (existing) {
        return {
          entry: existing as JournalEntryWithLines,
          isDuplicate: true,
        };
      }
    }

    // 4. Line-by-line validation and Decimal arithmetic
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    const normalizedLines: {
      accountId: string;
      debitAmount: Decimal;
      creditAmount: Decimal;
      narration: string | null;
      lineNumber: number;
    }[] = [];

    const accountIds = new Set<string>();

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      const lineNum = line.lineNumber ?? i + 1;

      if (!line.accountId) {
        throw new LedgerValidationError(
          `Line ${lineNum}: Account ID is required.`,
          'ACCOUNT_REQUIRED'
        );
      }
      accountIds.add(line.accountId);

      let debit: Decimal;
      let credit: Decimal;

      try {
        debit = new Decimal(line.debitAmount ?? 0);
      } catch {
        throw new LedgerValidationError(
          `Line ${lineNum}: Invalid debit amount '${line.debitAmount}'.`,
          'INVALID_DECIMAL'
        );
      }

      try {
        credit = new Decimal(line.creditAmount ?? 0);
      } catch {
        throw new LedgerValidationError(
          `Line ${lineNum}: Invalid credit amount '${line.creditAmount}'.`,
          'INVALID_DECIMAL'
        );
      }

      // Check non-negative
      if (debit.isNegative() || credit.isNegative()) {
        throw new LedgerValidationError(
          `Line ${lineNum}: Amounts must be non-negative. Received debit: ${debit.toString()}, credit: ${credit.toString()}.`,
          'NEGATIVE_AMOUNT'
        );
      }

      // Check exactly one positive side
      const hasDebit = debit.gt(0);
      const hasCredit = credit.gt(0);

      if (hasDebit && hasCredit) {
        throw new LedgerValidationError(
          `Line ${lineNum}: A line cannot have both positive debit (${debit.toString()}) and positive credit (${credit.toString()}). Exactly one side must be positive.`,
          'BOTH_SIDES_POSITIVE'
        );
      }

      if (!hasDebit && !hasCredit) {
        throw new LedgerValidationError(
          `Line ${lineNum}: Line has zero debit and zero credit. Exactly one side must be positive.`,
          'ZERO_LINE_AMOUNT'
        );
      }

      totalDebit = totalDebit.plus(debit);
      totalCredit = totalCredit.plus(credit);

      normalizedLines.push({
        accountId: line.accountId,
        debitAmount: debit,
        creditAmount: credit,
        narration: line.narration ?? null,
        lineNumber: lineNum,
      });
    }

    // 5. Double-entry balance guarantee
    if (!totalDebit.equals(totalCredit)) {
      const variance = totalDebit.minus(totalCredit).abs();
      throw new LedgerValidationError(
        `Unbalanced journal entry: Total debits (${totalDebit.toFixed(2)}) must equal total credits (${totalCredit.toFixed(2)}). Variance: ${variance.toFixed(2)}.`,
        'UNBALANCED_JOURNAL_ENTRY'
      );
    }

    // 6. Validate reversal reference & cumulative reversal amount limits if provided
    if (input.reversalOfId) {
      const targetEntry = await client.journalEntry.findFirst({
        where: {
          id: input.reversalOfId,
          organizationId: tenantId,
        },
        include: {
          reversals: true,
        },
      });
      if (!targetEntry) {
        throw new LedgerValidationError(
          `Reversal target entry '${input.reversalOfId}' does not exist or does not belong to organization '${tenantId}'.`,
          'REVERSAL_TARGET_NOT_FOUND'
        );
      }

      const alreadyReversed = targetEntry.reversals.reduce(
        (sum: Decimal, r: JournalEntry) => sum.plus(new Decimal(r.totalDebit)),
        new Decimal(0)
      );
      const originalAmount = new Decimal(targetEntry.totalDebit);
      const remainingReversible = originalAmount.minus(alreadyReversed);

      if (remainingReversible.lte(0)) {
        throw new LedgerValidationError(
          `Journal entry '${targetEntry.entryNumber}' has already been fully reversed (Original: ₹${originalAmount.toFixed(2)}, Already Reversed: ₹${alreadyReversed.toFixed(2)}).`,
          'ALREADY_FULLY_REVERSED'
        );
      }

      if (totalDebit.gt(remainingReversible)) {
        throw new LedgerValidationError(
          `Reversal amount ₹${totalDebit.toFixed(2)} exceeds remaining reversible balance ₹${remainingReversible.toFixed(2)} for entry '${targetEntry.entryNumber}'.`,
          'REVERSAL_AMOUNT_EXCEEDS_ORIGINAL'
        );
      }
    }

    // 7. Verify all accounts exist, are active, and belong to ctx.tenantId
    const foundAccounts = await client.ledgerAccount.findMany({
      where: {
        organizationId: tenantId,
        id: { in: Array.from(accountIds) },
      },
    });

    if (foundAccounts.length !== accountIds.size) {
      const foundIds = new Set(foundAccounts.map((a: LedgerAccount) => a.id));
      const missingIds = Array.from(accountIds).filter((id) => !foundIds.has(id));
      throw new LedgerValidationError(
        `Account(s) [${missingIds.join(', ')}] not found or do not belong to organization '${tenantId}'.`,
        'ACCOUNT_TENANT_MISMATCH'
      );
    }

    const inactiveAccounts = foundAccounts.filter((a: LedgerAccount) => !a.isActive);
    if (inactiveAccounts.length > 0) {
      const inactiveCodes = inactiveAccounts.map((a: LedgerAccount) => `${a.code} (${a.name})`).join(', ');
      throw new LedgerValidationError(
        `Cannot post to inactive account(s): ${inactiveCodes}.`,
        'INACTIVE_ACCOUNT'
      );
    }

    // 8. Execute atomic transaction to generate sequence & record entry + lines
    const postingDate = input.postingDate ?? new Date();
    const fiscalYear = getIndianFiscalYear(postingDate);

    const executeInTx = async (tx: any) => {
      // Resolve or generate entryNumber inside transaction
      let entryNumber = input.entryNumber;

      if (!entryNumber) {
        const sequence = await tx.journalSequence.upsert({
          where: {
            organizationId_fiscalYear: {
              organizationId: tenantId,
              fiscalYear,
            },
          },
          update: {
            currentNumber: { increment: 1 },
          },
          create: {
            organizationId: tenantId,
            fiscalYear,
            prefix: 'JE',
            currentNumber: 1,
          },
        });

        const yearShort = fiscalYear.replace('20', '').replace('-20', '-');
        entryNumber = `${sequence.prefix}/${yearShort}/${sequence.currentNumber.toString().padStart(5, '0')}`;
      } else {
        // Verify uniqueness of explicitly provided entryNumber
        const existingByNumber = await tx.journalEntry.findUnique({
          where: {
            organizationId_entryNumber: {
              organizationId: tenantId,
              entryNumber,
            },
          },
        });
        if (existingByNumber) {
          throw new LedgerConflictError(
            `Journal entry number '${entryNumber}' already exists for this organization.`,
            'ENTRY_NUMBER_EXISTS'
          );
        }
      }

      // Verify createdByUserId exists if provided to prevent FK violations
      let createdByUserId: string | null = null;
      if (ctx.userId) {
        const user = await tx.user.findUnique({
          where: { id: ctx.userId },
          select: { id: true },
        });
        if (user) {
          createdByUserId = user.id;
        }
      }

      // Create the journal entry header and all lines in a single atomic insert
      const entry = await tx.journalEntry.create({
        data: {
          organizationId: tenantId,
          branchId: input.branchId ?? null,
          entryNumber,
          postingDate,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          status: 'POSTED',
          narration: input.narration ?? null,
          totalDebit: totalDebit.toFixed(2),
          totalCredit: totalCredit.toFixed(2),
          reversalOfId: input.reversalOfId ?? null,
          createdByUserId,
          lines: {
            create: normalizedLines.map((line) => ({
              accountId: line.accountId,
              debitAmount: line.debitAmount.toFixed(2),
              creditAmount: line.creditAmount.toFixed(2),
              narration: line.narration,
              lineNumber: line.lineNumber,
            })),
          },
        },
        include: {
          lines: {
            include: { account: true },
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      // Audit log within the transaction
      await recordAuditLog(tx, ctx, {
        action: 'CREATE',
        entityType: 'JournalEntry',
        entityId: entry.id,
        changedFields: {
          entryNumber: entry.entryNumber,
          totalDebit: totalDebit.toFixed(2),
          totalCredit: totalCredit.toFixed(2),
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          lineCount: normalizedLines.length,
        },
      });

      return entry;
    };

    try {
      let createdEntry: any;
      if (options?.tx) {
        createdEntry = await executeInTx(options.tx);
      } else {
        createdEntry = await this.prisma.$transaction(executeInTx);
      }

      return {
        entry: createdEntry as JournalEntryWithLines,
        isDuplicate: false,
      };
    } catch (error: any) {
      // Handle race condition on idempotency key uniqueness constraint
      if (
        error.code === 'P2002' &&
        Array.isArray(error.meta?.target) &&
        error.meta.target.includes('idempotencyKey')
      ) {
        if (input.idempotencyKey) {
          const existing = await client.journalEntry.findUnique({
            where: {
              organizationId_idempotencyKey: {
                organizationId: tenantId,
                idempotencyKey: input.idempotencyKey,
              },
            },
            include: {
              lines: {
                include: { account: true },
                orderBy: { lineNumber: 'asc' },
              },
            },
          });
          if (existing) {
            return {
              entry: existing as JournalEntryWithLines,
              isDuplicate: true,
            };
          }
        }
      }

      // Re-throw custom domain errors
      if (
        error instanceof LedgerValidationError ||
        error instanceof LedgerConflictError ||
        error instanceof AuthorizationError
      ) {
        throw error;
      }

      // Catch Prisma duplicate unique key errors cleanly
      if (error.code === 'P2002') {
        const fields = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : 'fields';
        throw new LedgerConflictError(
          `Unique constraint violation on journal entry (${fields}).`,
          'DUPLICATE_ENTRY'
        );
      }

      throw error;
    }
  }

  /**
   * Immutability enforcement: Journal entries cannot be modified.
   */
  async updateJournalEntry(): Promise<never> {
    throw new LedgerImmutabilityError(
      'Posted journal entries are strictly immutable. To correct an entry, post a balancing reversal journal entry.'
    );
  }

  /**
   * Immutability enforcement: Journal entries cannot be deleted.
   */
  async deleteJournalEntry(): Promise<never> {
    throw new LedgerImmutabilityError(
      'Posted journal entries cannot be deleted from the audit ledger. Reversals must be recorded as separate audit events.'
    );
  }

  /**
   * Retrieves a journal entry by ID with tenant isolation.
   */
  async getJournalEntryById(ctx: SecurityContext, id: string): Promise<JournalEntryWithLines> {
    assertPermission(ctx, 'ACCOUNTS_VIEW');

    const entry = await this.prisma.journalEntry.findFirst({
      where: {
        id,
        organizationId: ctx.tenantId,
      },
      include: {
        lines: {
          include: { account: true },
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    if (!entry) {
      throw new LedgerNotFoundError(`Journal entry '${id}' not found or access denied.`);
    }

    return entry as JournalEntryWithLines;
  }

  /**
   * Lists journal entries for the active organization.
   */
  async listJournalEntries(
    ctx: SecurityContext,
    params?: { branchId?: string; sourceType?: string; limit?: number }
  ): Promise<JournalEntryWithLines[]> {
    assertPermission(ctx, 'ACCOUNTS_VIEW');

    const where: any = {
      organizationId: ctx.tenantId,
    };

    if (params?.branchId) {
      where.branchId = params.branchId;
    }
    if (params?.sourceType) {
      where.sourceType = params.sourceType;
    }

    const entries = await this.prisma.journalEntry.findMany({
      where,
      include: {
        lines: {
          include: { account: true },
          orderBy: { lineNumber: 'asc' },
        },
      },
      orderBy: { postingDate: 'desc' },
      take: params?.limit ?? 50,
    });

    return entries as JournalEntryWithLines[];
  }

  /**
   * Retrieves a ledger account by account code.
   */
  async getAccountByCode(ctx: SecurityContext, code: string): Promise<LedgerAccount> {
    assertPermission(ctx, 'ACCOUNTS_VIEW');

    const account = await this.prisma.ledgerAccount.findUnique({
      where: {
        organizationId_code: {
          organizationId: ctx.tenantId,
          code,
        },
      },
    });

    if (!account) {
      throw new LedgerNotFoundError(`Account with code '${code}' not found.`);
    }

    return account;
  }

  /**
   * Lists all ledger accounts for the tenant.
   */
  async listAccounts(ctx: SecurityContext): Promise<LedgerAccount[]> {
    assertPermission(ctx, 'ACCOUNTS_VIEW');

    return this.prisma.ledgerAccount.findMany({
      where: {
        organizationId: ctx.tenantId,
      },
      orderBy: { code: 'asc' },
    });
  }
}

export const ledgerService = new LedgerService();
