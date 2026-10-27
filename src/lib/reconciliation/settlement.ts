import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { SecurityContext, AuthorizationError } from '@/types/security';
import { assertPermission, assertBranchAccess } from '@/lib/rbac';
import { prisma as defaultPrisma } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ledgerService, PAYMENT_METHOD_ACCOUNT_MAP, JournalEntryWithLines } from '@/lib/ledger';

// ==============================================================================
// ERROR CLASSES
// ==============================================================================

export class SettlementError extends Error {
  constructor(message: string, public readonly code: string = 'SETTLEMENT_ERROR') {
    super(message);
    this.name = 'SettlementError';
  }
}

export class SettlementValidationError extends SettlementError {
  constructor(message: string, code: string = 'SETTLEMENT_VALIDATION_ERROR') {
    super(message, code);
    this.name = 'SettlementValidationError';
  }
}

export class SettlementConflictError extends SettlementError {
  constructor(message: string, code: string = 'SETTLEMENT_CONFLICT') {
    super(message, code);
    this.name = 'SettlementConflictError';
  }
}

export class SettlementDiscrepancyError extends SettlementError {
  constructor(
    message: string,
    public readonly discrepancyDetails?: {
      netDeposit: Decimal;
      grossCleared: Decimal;
      feeAmount: Decimal;
      variance: Decimal;
    },
    code: string = 'SETTLEMENT_UNRESOLVED_DISCREPANCY'
  ) {
    super(message, code);
    this.name = 'SettlementDiscrepancyError';
  }
}

export class SettlementSecurityError extends SettlementError {
  constructor(message: string, code: string = 'SETTLEMENT_SECURITY_ERROR') {
    super(message, code);
    this.name = 'SettlementSecurityError';
  }
}

// ==============================================================================
// INPUT / OUTPUT INTERFACES
// ==============================================================================

export interface PostSettlementJournalInput {
  statementLineId: string;
  feeAmount?: number | string | Decimal;
  feeAccountId?: string;
  postingDate?: Date;
  narration?: string;
}

export interface PostSettlementJournalResult {
  journalEntry: JournalEntryWithLines;
  statementLineId: string;
  bankAccountId: string;
  matchesSettledCount: number;
  netDepositAmount: Decimal;
  grossClearedAmount: Decimal;
  feeAmount: Decimal;
  status: string;
}

export interface ReverseSettlementJournalInput {
  statementLineId: string;
  reason: string;
}

export interface ReverseSettlementJournalResult {
  reversalEntry: JournalEntryWithLines;
  statementLineId: string;
  status: string;
}

export interface SettlementServiceOptions {
  prisma?: PrismaClient;
}

// ==============================================================================
// SETTLEMENT ACCOUNTING SERVICE
// ==============================================================================

export class SettlementService {
  private readonly db: PrismaClient;

  constructor(options?: SettlementServiceOptions) {
    this.db = options?.prisma ?? defaultPrisma;
  }

  /**
   * Asserts authorized staff role for settlement accounting operations.
   * Restricted to OWNER or ACCOUNTANT roles with ACCOUNTS_VIEW permission.
   */
  private assertSettlementPermission(ctx: SecurityContext): void {
    assertPermission(ctx, 'ACCOUNTS_VIEW');
    if (ctx.role !== 'OWNER' && ctx.role !== 'ACCOUNTANT') {
      throw new AuthorizationError(
        `Permission denied: Role '${ctx.role}' is not authorized to post settlement journals.`,
        'SETTLEMENT_FORBIDDEN'
      );
    }
  }

  /**
   * Posts an atomic, balanced double-entry settlement journal entry for a statement line
   * and its confirmed reconciliation matches.
   *
   * Accounting Flow:
   * 1. Debit: Bank Account (1040 / bankAccount.ledgerAccountId) for Net Deposit Amount.
   * 2. Debit: Payment Processing Fees (5110) for explicitly validated fee amount (if any).
   * 3. Credit: Tender Clearing Accounts (1020 UPI / 1030 Card / 1045 Bank Transfer / 1050 Cheque)
   *    for Gross Tender Amount cleared.
   *
   * Invariants Enforced:
   * - Total Debits (Net Deposit + Explicit Fee) MUST EXACTLY EQUAL Total Credits (Gross Cleared).
   * - Unexplained discrepancies cannot be posted; throws SettlementDiscrepancyError.
   * - Cash tender payments (1010) are strictly ineligible for bank settlement.
   * - Unconfirmed, reversed, or ignored lines/matches cannot be settled.
   * - Idempotency guaranteed via unique idempotencyKey on journal_entries and row locks.
   */
  async postSettlementJournal(
    ctx: SecurityContext,
    input: PostSettlementJournalInput
  ): Promise<PostSettlementJournalResult> {
    this.assertSettlementPermission(ctx);

    const tenantId = ctx.tenantId;

    if (!input.statementLineId?.trim()) {
      throw new SettlementValidationError('Statement line ID is required.');
    }
    const statementLineId = input.statementLineId.trim();

    // Validate fee amount if provided
    let explicitFee = new Decimal(0);
    if (input.feeAmount !== undefined && input.feeAmount !== null) {
      try {
        explicitFee = new Decimal(input.feeAmount);
      } catch {
        throw new SettlementValidationError('Invalid feeAmount: must be a valid numeric amount.');
      }
      if (!explicitFee.isFinite() || explicitFee.isNaN() || explicitFee.isNegative()) {
        throw new SettlementValidationError('feeAmount must be non-negative.');
      }
      if (explicitFee.decimalPlaces() > 2) {
        throw new SettlementValidationError('feeAmount cannot exceed 2 decimal places.');
      }
    }

    // Ensure chart of accounts exist before opening the transaction
    const accountMap = await ledgerService.ensureBillingAccounts(ctx, this.db);

    return await this.db.$transaction(
      async (tx) => {
        // 1. Lock the statement line using FOR UPDATE
      await tx.$queryRaw`
        SELECT id FROM "bank_statement_lines"
        WHERE id = ${statementLineId} AND "organizationId" = ${tenantId}
        FOR UPDATE
      `;

      // 2. Fetch fresh statement line with bank account info under lock
      const line = await tx.bankStatementLine.findFirst({
        where: { id: statementLineId, organizationId: tenantId },
        include: {
          bankAccount: {
            include: { ledgerAccount: true },
          },
        },
      });

      if (!line) {
        throw new SettlementSecurityError('Statement line not found or belongs to another business.');
      }

      // Check branch access if bank account is branch-scoped
      if (line.bankAccount.branchId) {
        assertBranchAccess(ctx, line.bankAccount.branchId);
      }

      // 3. Idempotency Check: Verify if line is already settled
      if (line.settlementJournalId || line.reconciliationStatus === 'SETTLED') {
        throw new SettlementConflictError(
          `Statement line '${statementLineId}' has already been settled in journal entry '${line.settlementJournalId}'.`,
          'STATEMENT_ALREADY_SETTLED'
        );
      }

      // 4. Validate statement line reconciliation status
      if (line.reconciliationStatus === 'UNMATCHED') {
        throw new SettlementValidationError('Cannot post settlement: statement line is UNMATCHED.');
      }
      if (line.reconciliationStatus === 'PARTIALLY_MATCHED') {
        throw new SettlementValidationError(
          `Cannot post settlement: statement line '${statementLineId}' is only PARTIALLY_MATCHED. Full matching is required before settlement posting.`,
          'STATEMENT_LINE_PARTIALLY_MATCHED'
        );
      }
      if (line.reconciliationStatus === 'DISCREPANT') {
        throw new SettlementValidationError(
          'Cannot post settlement: statement line is marked DISCREPANT. Discrepancy must be resolved first.'
        );
      }
      if (line.reconciliationStatus === 'IGNORED') {
        throw new SettlementValidationError('Cannot post settlement: statement line is IGNORED.');
      }

      // 5. Fetch confirmed matches for this line
      const confirmedMatches = await tx.reconciliationMatch.findMany({
        where: {
          organizationId: tenantId,
          statementLineId: line.id,
          status: 'CONFIRMED',
        },
        include: {
          payment: {
            include: {
              invoice: {
                select: { id: true, invoiceNumber: true, branchId: true },
              },
            },
          },
        },
      });

      if (confirmedMatches.length === 0) {
        throw new SettlementValidationError(
          'Cannot post settlement: no confirmed reconciliation matches exist for this statement line.'
        );
      }

      // 6. Lock associated payment rows in consistent order to prevent concurrent mutations
      const paymentIds = confirmedMatches
        .map((m) => m.paymentId)
        .filter((id): id is string => id !== null)
        .sort();

      for (const pId of paymentIds) {
        await tx.$queryRaw`
          SELECT id FROM "invoice_payments"
          WHERE id = ${pId} AND "organizationId" = ${tenantId}
          FOR UPDATE
        `;
      }

      // 7. Calculate amounts and verify double-entry balancing
      const netDeposit = new Decimal(line.amount.toString());
      if (netDeposit.lessThanOrEqualTo(0)) {
        throw new SettlementValidationError('Net deposit amount on statement line must be positive.');
      }

      // Map confirmed matches to clearing accounts
      // Accumulate credits grouped by clearing account code
      const clearingCreditsByAccount = new Map<string, Decimal>();
      let grossClearedTotal = new Decimal(0);

      for (const m of confirmedMatches) {
        if (!m.payment) {
          throw new SettlementValidationError(
            `Match '${m.id}' has no linked customer payment and cannot be cleared automatically.`
          );
        }

        const payment = m.payment;

        // Enforce branch access if user is branch-scoped
        if (payment.invoice.branchId && ctx.allowedBranchIds.length > 0) {
          assertBranchAccess(ctx, payment.invoice.branchId);
        }

        // Cash tender is physically held in showroom drawer and NOT cleared via bank settlement
        if (payment.paymentMethod === 'CASH') {
          throw new SettlementValidationError(
            `Payment method 'CASH' on payment '${payment.id}' is not eligible for bank settlement clearing.`
          );
        }

        const clearingAccountCode = PAYMENT_METHOD_ACCOUNT_MAP[payment.paymentMethod];
        if (!clearingAccountCode) {
          throw new SettlementValidationError(
            `Unsupported payment method '${payment.paymentMethod}' has no mapped clearing account.`
          );
        }

        const clearingAccountUuid = accountMap.get(clearingAccountCode);
        if (!clearingAccountUuid) {
          throw new SettlementValidationError(
            `Clearing account '${clearingAccountCode}' not found for organization '${tenantId}'.`
          );
        }

        // The gross amount being cleared for this match
        // For standard settlements: matchedAmount represents the net deposit allocation.
        // If there's an explicit fee on the statement line, the gross cleared is (matchedAmount + allocated fee).
        const matchAllocAmount = new Decimal(m.matchedAmount.toString());
        const currentSum = clearingCreditsByAccount.get(clearingAccountUuid) ?? new Decimal(0);
        clearingCreditsByAccount.set(clearingAccountUuid, currentSum.plus(matchAllocAmount));
        grossClearedTotal = grossClearedTotal.plus(matchAllocAmount);
      }

      // 8. DOUBLE-ENTRY BALANCE & UNEXPLAINED DISCREPANCY ENFORCEMENT
      // Total Debits = Net Deposit + Explicit Fee
      // Total Credits = Gross Cleared (sum of confirmed match allocations)
      const totalDebits = netDeposit.plus(explicitFee);
      const totalCredits = grossClearedTotal;

      if (!totalDebits.equals(totalCredits)) {
        const variance = totalDebits.minus(totalCredits).abs();
        throw new SettlementDiscrepancyError(
          `Unexplained settlement discrepancy: Total debits (Net deposit ₹${netDeposit.toFixed(
            2
          )} + Fee ₹${explicitFee.toFixed(2)} = ₹${totalDebits.toFixed(
            2
          )}) do not equal total credits to clearing accounts (Gross Cleared ₹${totalCredits.toFixed(
            2
          )}). Variance: ₹${variance.toFixed(2)}. Discrepancy must remain unresolved for review.`,
          {
            netDeposit,
            grossCleared: totalCredits,
            feeAmount: explicitFee,
            variance,
          }
        );
      }

      // 9. Construct double-entry journal lines
      const journalLines: Array<{
        accountId: string;
        debitAmount: Decimal;
        creditAmount: Decimal;
        narration: string;
      }> = [];

      // A. DEBIT: Business Bank Account (1040) for Net Deposit Amount
      const bankGlAccountId = line.bankAccount.ledgerAccountId || accountMap.get('1040')!;
      journalLines.push({
        accountId: bankGlAccountId,
        debitAmount: netDeposit,
        creditAmount: new Decimal(0),
        narration: `Net bank deposit for statement line #${line.lineNumber}${
          line.referenceNumber ? ` (Ref: ${line.referenceNumber})` : ''
        }`,
      });

      // B. DEBIT: Payment Processing Fees (5110) for Explicit Fee (if > 0)
      if (explicitFee.gt(0)) {
        const feeGlAccountId = input.feeAccountId || accountMap.get('5110')!;
        journalLines.push({
          accountId: feeGlAccountId,
          debitAmount: explicitFee,
          creditAmount: new Decimal(0),
          narration: `Payment processing fee / MDR for statement line #${line.lineNumber}`,
        });
      }

      // C. CREDITS: Clearing Accounts (1020, 1030, 1045, 1050)
      for (const [clearingAccountId, creditAmount] of clearingCreditsByAccount.entries()) {
        journalLines.push({
          accountId: clearingAccountId,
          debitAmount: new Decimal(0),
          creditAmount,
          narration: `Clearing customer payments settled on statement line #${line.lineNumber}`,
        });
      }

      // 10. Post Journal Entry via ledgerService inside the transaction
      const postingDate = input.postingDate ?? line.transactionDate ?? new Date();
      const idempotencyKey = `SETTLEMENT:${line.id}`;

      const { entry: journalEntry } = await ledgerService.postJournalEntry(
        ctx,
        {
          branchId: line.bankAccount.branchId ?? null,
          postingDate,
          sourceType: 'SETTLEMENT',
          sourceId: line.id,
          idempotencyKey,
          narration:
            input.narration?.trim() ||
            `Bank settlement for statement line #${line.lineNumber} (${line.bankAccount.bankName} - ${line.bankAccount.accountName})`,
          lines: journalLines,
        },
        { tx }
      );

      // 11. Update BankStatementLine atomically with feeAmount stored exactly once
      await tx.bankStatementLine.update({
        where: { id: line.id },
        data: {
          reconciliationStatus: 'SETTLED',
          settlementJournalId: journalEntry.id,
          settledAt: new Date(),
          feeAmount: explicitFee.gt(0) ? explicitFee.toFixed(2) : null,
        },
      });

      // 12. Update ReconciliationMatches atomically (batch fee is NOT duplicated on individual matches)
      await tx.reconciliationMatch.updateMany({
        where: {
          organizationId: tenantId,
          statementLineId: line.id,
          status: 'CONFIRMED',
        },
        data: {
          status: 'SETTLED',
          settlementJournalId: journalEntry.id,
          settledAt: new Date(),
          feeAmount: null,
        },
      });

      // 13. Record Audit Log inside the transaction
      await recordAuditLog(tx, ctx, {
        action: 'CREATE',
        entityType: 'BankStatementLine',
        entityId: line.id,
        changedFields: {
          action: 'POST_SETTLEMENT_JOURNAL',
          statementLineId: line.id,
          settlementJournalId: journalEntry.id,
          entryNumber: journalEntry.entryNumber,
          netDepositAmount: netDeposit.toFixed(2),
          grossClearedAmount: grossClearedTotal.toFixed(2),
          feeAmount: explicitFee.toFixed(2),
          matchesSettledCount: confirmedMatches.length,
          reconciliationStatus: 'SETTLED',
        },
      });

      return {
        journalEntry,
        statementLineId: line.id,
        bankAccountId: line.bankAccountId,
        matchesSettledCount: confirmedMatches.length,
        netDepositAmount: netDeposit,
        grossClearedAmount: grossClearedTotal,
        feeAmount: explicitFee,
        status: 'SETTLED',
      };
    },
    { maxWait: 10000, timeout: 30000 }
  );
  }

  /**
   * Reverses a previously posted settlement journal entry.
   *
   * Reversal Flow:
   * 1. Posts an auditable, balancing reversal journal entry with reversalOfId.
   * 2. Rolls back BankStatementLine.reconciliationStatus to 'MATCHED'.
   * 3. Clears settlementJournalId and settledAt.
   * 4. Rolls back ReconciliationMatch.status to 'CONFIRMED'.
   * 5. Preserves complete historical audit trail.
   */
  async reverseSettlementJournal(
    ctx: SecurityContext,
    input: ReverseSettlementJournalInput
  ): Promise<ReverseSettlementJournalResult> {
    this.assertSettlementPermission(ctx);

    const tenantId = ctx.tenantId;

    if (!input.statementLineId?.trim()) {
      throw new SettlementValidationError('Statement line ID is required.');
    }
    const statementLineId = input.statementLineId.trim();

    const reason = input.reason?.trim();
    if (!reason || reason.length < 5) {
      throw new SettlementValidationError(
        'A specific settlement reversal reason of at least 5 characters is mandatory.'
      );
    }

    // Ensure chart of accounts exist before opening the transaction
    const accountMap = await ledgerService.ensureBillingAccounts(ctx, this.db);

    return await this.db.$transaction(
      async (tx) => {
        // 1. Lock statement line
      await tx.$queryRaw`
        SELECT id FROM "bank_statement_lines"
        WHERE id = ${statementLineId} AND "organizationId" = ${tenantId}
        FOR UPDATE
      `;

      const line = await tx.bankStatementLine.findFirst({
        where: { id: statementLineId, organizationId: tenantId },
        include: { bankAccount: true },
      });

      if (!line) {
        throw new SettlementSecurityError('Statement line not found or belongs to another business.');
      }

      if (line.bankAccount.branchId) {
        assertBranchAccess(ctx, line.bankAccount.branchId);
      }

      if (!line.settlementJournalId || line.reconciliationStatus !== 'SETTLED') {
        throw new SettlementValidationError(
          `Statement line '${statementLineId}' is not currently in SETTLED status.`
        );
      }

      // 2. Fetch original settlement journal entry
      const originalEntry = await tx.journalEntry.findUnique({
        where: { id: line.settlementJournalId },
        include: {
          lines: { include: { account: true } },
        },
      });

      if (!originalEntry) {
        throw new SettlementValidationError(
          `Original settlement journal entry '${line.settlementJournalId}' not found.`
        );
      }

      // 3. Post balancing reversal journal entry
      const reversalLines = originalEntry.lines.map((l) => ({
        accountId: l.accountId,
        debitAmount: l.creditAmount, // Invert debit and credit
        creditAmount: l.debitAmount,
        narration: `Reversal of ${originalEntry.entryNumber} line ${l.lineNumber}: ${reason}`,
      }));

      const reversalIdempotencyKey = `REVERSE_SETTLEMENT:${line.id}:${originalEntry.id}`;

      const { entry: reversalEntry } = await ledgerService.postJournalEntry(
        ctx,
        {
          branchId: line.bankAccount.branchId ?? null,
          postingDate: new Date(),
          sourceType: 'REVERSAL',
          sourceId: line.id,
          idempotencyKey: reversalIdempotencyKey,
          reversalOfId: originalEntry.id,
          narration: `Reversal of settlement journal ${originalEntry.entryNumber} for statement line #${line.lineNumber}: ${reason}`,
          lines: reversalLines,
        },
        { tx }
      );

      // 4. Roll back BankStatementLine
      await tx.bankStatementLine.update({
        where: { id: line.id },
        data: {
          reconciliationStatus: 'MATCHED',
          settlementJournalId: null,
          settledAt: null,
          feeAmount: null,
        },
      });

      // 5. Roll back ReconciliationMatches
      await tx.reconciliationMatch.updateMany({
        where: {
          organizationId: tenantId,
          statementLineId: line.id,
          status: 'SETTLED',
        },
        data: {
          status: 'CONFIRMED',
          settlementJournalId: null,
          settledAt: null,
          feeAmount: null,
        },
      });

      // 6. Record Audit Log
      await recordAuditLog(tx, ctx, {
        action: 'UPDATE',
        entityType: 'BankStatementLine',
        entityId: line.id,
        changedFields: {
          action: 'REVERSE_SETTLEMENT_JOURNAL',
          originalSettlementJournalId: originalEntry.id,
          reversalJournalId: reversalEntry.id,
          reversalEntryNumber: reversalEntry.entryNumber,
          reason,
          newReconciliationStatus: 'MATCHED',
        },
      });

      return {
        reversalEntry,
        statementLineId: line.id,
        status: 'MATCHED',
      };
    },
    { maxWait: 10000, timeout: 30000 }
  );
  }

  /**
   * Computes pre-settlement calculation preview for the UI confirmation dialog.
   * Displays gross allocations, net deposit, explicit fee, variance and server-side eligibility.
   */
  async getSettlementPreview(
    ctx: SecurityContext,
    statementLineId: string,
    feeAmount?: number | string | Decimal
  ) {
    this.assertSettlementPermission(ctx);
    const tenantId = ctx.tenantId;

    const line = await this.db.bankStatementLine.findFirst({
      where: { id: statementLineId.trim(), organizationId: tenantId },
      include: {
        bankAccount: true,
        matches: {
          where: { status: 'CONFIRMED' },
          include: {
            payment: {
              include: {
                invoice: {
                  select: { id: true, invoiceNumber: true, customerName: true, branchId: true },
                },
              },
            },
          },
        },
      },
    });

    if (!line) {
      throw new SettlementSecurityError('Statement line not found or belongs to another business.');
    }

    if (line.bankAccount.branchId) {
      assertBranchAccess(ctx, line.bankAccount.branchId);
    }

    let explicitFee = new Decimal(0);
    if (feeAmount !== undefined && feeAmount !== null && feeAmount !== '') {
      try {
        explicitFee = new Decimal(feeAmount);
      } catch {
        explicitFee = new Decimal(0);
      }
    } else if (line.feeAmount) {
      explicitFee = new Decimal(line.feeAmount.toString());
    }

    const netDeposit = new Decimal(line.amount.toString());
    let grossCleared = new Decimal(0);

    const clearingBreakdown = line.matches.map((m) => {
      const matchAmt = new Decimal(m.matchedAmount.toString());
      grossCleared = grossCleared.plus(matchAmt);

      const code = m.payment?.paymentMethod
        ? PAYMENT_METHOD_ACCOUNT_MAP[m.payment.paymentMethod] || '1045'
        : '1045';

      return {
        matchId: m.id,
        paymentId: m.paymentId,
        paymentMethod: m.payment?.paymentMethod || 'UNKNOWN',
        clearingAccountCode: code,
        amount: matchAmt.toFixed(2),
        invoiceNumber: m.payment?.invoice?.invoiceNumber || '—',
        customerName: m.payment?.invoice?.customerName || '—',
      };
    });

    const totalDebits = netDeposit.plus(explicitFee);
    const totalCredits = grossCleared;
    const variance = totalDebits.minus(totalCredits);
    const isBalanced = variance.abs().lessThan(0.005);

    let canSettle = true;
    let blockReason: string | undefined = undefined;

    if (line.settlementJournalId || line.reconciliationStatus === 'SETTLED') {
      canSettle = false;
      blockReason = 'Statement line is already SETTLED.';
    } else if (line.reconciliationStatus === 'UNMATCHED') {
      canSettle = false;
      blockReason = 'Statement line is UNMATCHED. Confirmed payment allocations are required.';
    } else if (line.reconciliationStatus === 'PARTIALLY_MATCHED') {
      canSettle = false;
      blockReason = 'Statement line is only PARTIALLY_MATCHED. Full matching is required.';
    } else if (line.reconciliationStatus === 'DISCREPANT') {
      canSettle = false;
      blockReason = 'Statement line is marked DISCREPANT. Resolve discrepancies first.';
    } else if (line.reconciliationStatus === 'IGNORED') {
      canSettle = false;
      blockReason = 'Statement line is IGNORED.';
    } else if (line.matches.length === 0) {
      canSettle = false;
      blockReason = 'No confirmed matches found for this statement line.';
    } else if (!isBalanced) {
      canSettle = false;
      blockReason = `Settlement is unbalanced by ₹${variance.abs().toFixed(2)}. Unexplained variance cannot be posted.`;
    }

    return {
      statementLineId: line.id,
      lineNumber: line.lineNumber,
      transactionDate: line.transactionDate,
      referenceNumber: line.referenceNumber,
      reconciliationStatus: line.reconciliationStatus,
      netDepositAmount: netDeposit.toFixed(2),
      grossClearedAmount: grossCleared.toFixed(2),
      feeAmount: explicitFee.toFixed(2),
      varianceAmount: variance.toFixed(2),
      isBalanced,
      canSettle,
      blockReason,
      clearingBreakdown,
    };
  }
}

export const settlementService = new SettlementService();
