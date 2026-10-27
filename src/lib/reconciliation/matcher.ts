import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { SecurityContext, AuthorizationError } from '@/types/security';
import { assertPermission, assertBranchAccess } from '@/lib/rbac';
import { prisma as defaultPrisma } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';

// ==============================================================================
// ERROR TYPES
// ==============================================================================

export class ReconciliationError extends Error {
  constructor(message: string, public readonly code: string = 'RECONCILIATION_ERROR') {
    super(message);
    this.name = 'ReconciliationError';
  }
}

export class MatchValidationError extends ReconciliationError {
  constructor(message: string, code: string = 'MATCH_VALIDATION_ERROR') {
    super(message, code);
    this.name = 'MatchValidationError';
  }
}

export class MatchAllocationError extends ReconciliationError {
  constructor(message: string, code: string = 'MATCH_ALLOCATION_OVERFLOW') {
    super(message, code);
    this.name = 'MatchAllocationError';
  }
}

export class MatchNotFoundError extends ReconciliationError {
  constructor(message: string, code: string = 'MATCH_NOT_FOUND') {
    super(message, code);
    this.name = 'MatchNotFoundError';
  }
}

export class MatchSecurityError extends ReconciliationError {
  constructor(message: string, code: string = 'MATCH_SECURITY_ERROR') {
    super(message, code);
    this.name = 'MatchSecurityError';
  }
}

// ==============================================================================
// TYPES & INTERFACES
// ==============================================================================

export type MatchRuleType =
  | 'EXACT_REF_AND_AMOUNT'
  | 'REF_MATCH_AMOUNT_DISCREPANT'
  | 'AMOUNT_DATE_WINDOW'
  | 'BATCH_SETTLEMENT'
  | 'SPLIT_SETTLEMENT'
  | 'MANUAL_MATCH';

export type MatchStatus = 'PROPOSED' | 'CONFIRMED' | 'REVERSED' | 'SETTLED';

export type StatementLineReconciliationStatus =
  | 'UNMATCHED'
  | 'PARTIALLY_MATCHED'
  | 'MATCHED'
  | 'DISCREPANT'
  | 'IGNORED'
  | 'SETTLED';

export interface MatchCandidate {
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  paymentMethod: string;
  paymentDate: Date;
  paymentAmount: Decimal;
  unallocatedPaymentAmount: Decimal;
  transactionRef?: string | null;
  rule: MatchRuleType;
  confidence: 'HIGH' | 'MEDIUM' | 'DISCREPANT';
  isAmbiguous: boolean;
  discrepancy?: {
    statementAmount: Decimal;
    paymentAmount: Decimal;
    difference: Decimal;
    message: string;
  };
}

export interface CandidateSearchOptions {
  dateWindowDays?: number; // default: 3 days
  allowDiscrepant?: boolean; // default: true
  limit?: number; // default: 20
}

export interface CreateProposedMatchInput {
  statementLineId: string;
  paymentId: string;
  matchedAmount: number | string | Decimal;
  matchType?: MatchRuleType;
  reason?: string;
}

export interface CreateAndConfirmMatchInput {
  statementLineId: string;
  paymentId: string;
  matchedAmount: number | string | Decimal;
  matchType?: MatchRuleType;
  reason?: string;
  feeAmount?: number | string | Decimal;
}

export interface ReverseMatchInput {
  matchId: string;
  reason: string; // Mandatory non-empty reason
}

export interface MarkLineDiscrepantInput {
  statementLineId: string;
  reason: string; // Mandatory non-empty reason
}

export interface IgnoreStatementLineInput {
  statementLineId: string;
  reason: string; // Mandatory non-empty reason
}

export interface UnmatchedLinesFilter {
  bankAccountId?: string;
  importId?: string;
  status?: StatementLineReconciliationStatus[];
  startDate?: Date;
  endDate?: Date;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ReconciliationMatcherOptions {
  prisma?: PrismaClient;
}

// ==============================================================================
// RECONCILIATION MATCHING SERVICE
// ==============================================================================

export class ReconciliationMatcher {
  private readonly db: PrismaClient;

  constructor(options?: ReconciliationMatcherOptions) {
    this.db = options?.prisma ?? defaultPrisma;
  }

  /**
   * Asserts authorized staff role for reconciliation operations.
   * Restricted to OWNER or ACCOUNTANT roles with ACCOUNTS_VIEW permission.
   */
  private assertReconciliationPermission(ctx: SecurityContext): void {
    assertPermission(ctx, 'ACCOUNTS_VIEW');
    if (ctx.role !== 'OWNER' && ctx.role !== 'ACCOUNTANT') {
      throw new AuthorizationError(
        `Permission denied: Role '${ctx.role}' is not authorized to perform reconciliation operations.`,
        'RECONCILIATION_FORBIDDEN'
      );
    }
  }

  /**
   * Normalizes and validates monetary amount decimal.
   */
  private validateMonetaryAmount(amount: number | string | Decimal, fieldName: string = 'matchedAmount'): Decimal {
    let dec: Decimal;
    try {
      dec = new Decimal(amount);
    } catch {
      throw new MatchValidationError(`Invalid ${fieldName}: must be a valid numeric amount.`);
    }

    if (!dec.isFinite() || dec.isNaN()) {
      throw new MatchValidationError(`Invalid ${fieldName}: must be a finite number.`);
    }

    if (dec.lessThanOrEqualTo(0)) {
      throw new MatchValidationError(`${fieldName} must be strictly greater than zero.`);
    }

    if (dec.decimalPlaces() > 2) {
      throw new MatchValidationError(`${fieldName} cannot exceed 2 decimal places.`);
    }

    return dec;
  }

  /**
   * 1. Finds potential payment matches for a given bank statement line.
   * Evaluates Rules A, B, C, D, E, F without altering data.
   */
  async findCandidateMatches(
    ctx: SecurityContext,
    statementLineId: string,
    options?: CandidateSearchOptions
  ): Promise<MatchCandidate[]> {
    this.assertReconciliationPermission(ctx);

    const tenantId = ctx.tenantId;
    const dateWindowDays = options?.dateWindowDays ?? 3;
    const limit = options?.limit ?? 20;

    // Fetch statement line with bank account info
    const line = await this.db.bankStatementLine.findFirst({
      where: {
        id: statementLineId.trim(),
        organizationId: tenantId,
      },
      include: {
        bankAccount: true,
      },
    });

    if (!line) {
      throw new MatchNotFoundError(
        'Statement line not found or belongs to another business.',
        'STATEMENT_LINE_NOT_FOUND'
      );
    }

    if (line.bankAccount.branchId) {
      assertBranchAccess(ctx, line.bankAccount.branchId);
    }

    if (line.reconciliationStatus === 'SETTLED' || line.settlementJournalId) {
      // Line is already settled; no candidates should be returned
      return [];
    }

    const lineAmount = new Decimal(line.amount.toString());

    // Calculate existing confirmed allocations on this line
    const confirmedOnLine = await this.db.reconciliationMatch.aggregate({
      where: {
        organizationId: tenantId,
        statementLineId: line.id,
        status: { in: ['CONFIRMED', 'SETTLED'] },
      },
      _sum: { matchedAmount: true },
    });

    const confirmedSum = new Decimal(confirmedOnLine._sum.matchedAmount?.toString() ?? '0');
    const remainingLineAmount = Decimal.max(0, lineAmount.minus(confirmedSum));

    if (remainingLineAmount.equals(0)) {
      // Line is already fully matched
      return [];
    }

    const candidates: MatchCandidate[] = [];
    const seenPaymentIds = new Set<string>();

    const rawRef = line.referenceNumber?.trim();

    // --------------------------------------------------------------------------
    // RULE A & B: Reference-Based Search
    // --------------------------------------------------------------------------
    if (rawRef && rawRef.length >= 4) {
      // Search payments by exact or case-insensitive reference match
      const matchingPayments = await this.db.invoicePayment.findMany({
        where: {
          organizationId: tenantId,
          transactionRef: {
            equals: rawRef,
            mode: 'insensitive',
          },
        },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              customerName: true,
              branchId: true,
            },
          },
          reconciliationMatches: {
            where: { status: { in: ['CONFIRMED', 'SETTLED'] } },
            select: { matchedAmount: true },
          },
        },
        take: limit,
      });

      for (const p of matchingPayments) {
        // Enforce branch access if user is branch-scoped and payment belongs to invoice branch
        if (p.invoice.branchId && ctx.allowedBranchIds.length > 0 && !ctx.allowedBranchIds.includes(p.invoice.branchId)) {
          continue;
        }

        seenPaymentIds.add(p.id);
        const pAmount = new Decimal(p.amount.toString());
        const pConfirmedSum = p.reconciliationMatches.reduce(
          (sum, m) => sum.plus(new Decimal(m.matchedAmount.toString())),
          new Decimal(0)
        );
        const pUnallocated = Decimal.max(0, pAmount.minus(pConfirmedSum));

        if (pAmount.equals(lineAmount)) {
          // Rule A: Exact reference and exact amount
          candidates.push({
            paymentId: p.id,
            invoiceId: p.invoice.id,
            invoiceNumber: p.invoice.invoiceNumber,
            customerName: p.invoice.customerName,
            paymentMethod: p.paymentMethod,
            paymentDate: p.paymentDate,
            paymentAmount: pAmount,
            unallocatedPaymentAmount: pUnallocated,
            transactionRef: p.transactionRef,
            rule: 'EXACT_REF_AND_AMOUNT',
            confidence: 'HIGH',
            isAmbiguous: false,
          });
        } else {
          // Rule B: Reference matches but amount differs (Flag as Discrepant)
          const diff = lineAmount.minus(pAmount);
          candidates.push({
            paymentId: p.id,
            invoiceId: p.invoice.id,
            invoiceNumber: p.invoice.invoiceNumber,
            customerName: p.invoice.customerName,
            paymentMethod: p.paymentMethod,
            paymentDate: p.paymentDate,
            paymentAmount: pAmount,
            unallocatedPaymentAmount: pUnallocated,
            transactionRef: p.transactionRef,
            rule: 'REF_MATCH_AMOUNT_DISCREPANT',
            confidence: 'DISCREPANT',
            isAmbiguous: false,
            discrepancy: {
              statementAmount: lineAmount,
              paymentAmount: pAmount,
              difference: diff,
              message: `Reference '${rawRef}' matches but amounts differ by ${diff.abs().toFixed(2)}.`,
            },
          });
        }
      }
    }

    // --------------------------------------------------------------------------
    // RULE C: Amount and Date Window Matching (When No Reference Candidates Found)
    // --------------------------------------------------------------------------
    if (candidates.length === 0) {
      const lineDate = line.transactionDate;
      const windowStart = new Date(lineDate.getTime() - dateWindowDays * 86400 * 1000);
      const windowEnd = new Date(lineDate.getTime() + dateWindowDays * 86400 * 1000);

      const dateWindowPayments = await this.db.invoicePayment.findMany({
        where: {
          organizationId: tenantId,
          id: { notIn: Array.from(seenPaymentIds) },
          paymentDate: {
            gte: windowStart,
            lte: windowEnd,
          },
          amount: {
            in: [
              new Prisma.Decimal(line.amount.toString()),
              new Prisma.Decimal(remainingLineAmount.toFixed(2)),
            ],
          },
        },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              customerName: true,
              branchId: true,
            },
          },
          reconciliationMatches: {
            where: { status: { in: ['CONFIRMED', 'SETTLED'] } },
            select: { matchedAmount: true },
          },
        },
        take: limit,
        orderBy: { paymentDate: 'asc' },
      });

      const ruleCPayments: MatchCandidate[] = [];

      for (const p of dateWindowPayments) {
        if (p.invoice.branchId && ctx.allowedBranchIds.length > 0 && !ctx.allowedBranchIds.includes(p.invoice.branchId)) {
          continue;
        }

        const pAmount = new Decimal(p.amount.toString());
        const pConfirmedSum = p.reconciliationMatches.reduce(
          (sum: Decimal, m: { matchedAmount: Prisma.Decimal }) => sum.plus(new Decimal(m.matchedAmount.toString())),
          new Decimal(0)
        );
        const pUnallocated = Decimal.max(0, pAmount.minus(pConfirmedSum));

        if (pUnallocated.lessThanOrEqualTo(0)) {
          // Already fully allocated to other statement lines
          continue;
        }

        ruleCPayments.push({
          paymentId: p.id,
          invoiceId: p.invoice.id,
          invoiceNumber: p.invoice.invoiceNumber,
          customerName: p.invoice.customerName,
          paymentMethod: p.paymentMethod,
          paymentDate: p.paymentDate,
          paymentAmount: pAmount,
          unallocatedPaymentAmount: pUnallocated,
          transactionRef: p.transactionRef,
          rule: 'AMOUNT_DATE_WINDOW',
          confidence: 'MEDIUM',
          isAmbiguous: false, // will mark true below if multiple
        });
      }

      // Rule F: Ambiguous Candidates Check
      // If multiple candidates share the exact same amount within the date window, flag ambiguous
      if (ruleCPayments.length > 1) {
        for (const cand of ruleCPayments) {
          cand.isAmbiguous = true;
        }
      }

      candidates.push(...ruleCPayments);
    }

    return candidates;
  }

  /**
   * 2. Creates a proposed match record without confirming or locking balances.
   * Status is set to 'PROPOSED'. Does not affect confirmed allocation totals.
   */
  async createProposedMatch(ctx: SecurityContext, input: CreateProposedMatchInput) {
    this.assertReconciliationPermission(ctx);
    const tenantId = ctx.tenantId;

    if (!input.statementLineId?.trim()) {
      throw new MatchValidationError('Statement line ID is required.');
    }
    if (!input.paymentId?.trim()) {
      throw new MatchValidationError('Payment ID is required.');
    }

    const matchedAmount = this.validateMonetaryAmount(input.matchedAmount, 'matchedAmount');

    // Verify statement line exists and belongs to tenant
    const line = await this.db.bankStatementLine.findFirst({
      where: { id: input.statementLineId.trim(), organizationId: tenantId },
      include: { bankAccount: true },
    });
    if (!line) {
      throw new MatchNotFoundError('Statement line not found or belongs to another business.');
    }
    if (line.bankAccount.branchId) {
      assertBranchAccess(ctx, line.bankAccount.branchId);
    }
    if (line.settlementJournalId || line.reconciliationStatus === 'SETTLED') {
      throw new MatchValidationError(
        `Cannot propose match: statement line '${line.id}' is already SETTLED.`,
        'LINE_ALREADY_SETTLED'
      );
    }

    // Verify payment exists and belongs to tenant
    const payment = await this.db.invoicePayment.findFirst({
      where: { id: input.paymentId.trim(), organizationId: tenantId },
      include: { invoice: true },
    });
    if (!payment) {
      throw new MatchNotFoundError('Payment not found or belongs to another business.');
    }
    if (payment.invoice.branchId && ctx.allowedBranchIds.length > 0) {
      assertBranchAccess(ctx, payment.invoice.branchId);
    }

    // Basic preliminary check: proposed amount cannot exceed raw total of line or payment
    const lineAmount = new Decimal(line.amount.toString());
    const paymentAmount = new Decimal(payment.amount.toString());
    if (matchedAmount.greaterThan(lineAmount)) {
      throw new MatchAllocationError(
        `Proposed match amount (${matchedAmount.toFixed(2)}) cannot exceed statement line amount (${lineAmount.toFixed(2)}).`
      );
    }
    if (matchedAmount.greaterThan(paymentAmount)) {
      throw new MatchAllocationError(
        `Proposed match amount (${matchedAmount.toFixed(2)}) cannot exceed payment amount (${paymentAmount.toFixed(2)}).`
      );
    }

    const proposedMatch = await this.db.reconciliationMatch.create({
      data: {
        organizationId: tenantId,
        statementLineId: line.id,
        paymentId: payment.id,
        matchType: input.matchType ?? 'MANUAL_MATCH',
        matchedAmount: matchedAmount.toFixed(2),
        status: 'PROPOSED',
        matchedByUserId: ctx.userId,
        reason: input.reason?.trim() ?? null,
      },
    });

    await recordAuditLog(this.db, ctx, {
      action: 'CREATE',
      entityType: 'ReconciliationMatch',
      entityId: proposedMatch.id,
      changedFields: {
        statementLineId: line.id,
        paymentId: payment.id,
        matchedAmount: matchedAmount.toFixed(2),
        status: 'PROPOSED',
        matchType: proposedMatch.matchType,
      },
    });

    return proposedMatch;
  }

  /**
   * 3. Confirms an existing proposed match.
   * Acquires pessimistic row locks, verifies limits, updates status to CONFIRMED,
   * transitions BankStatementLine reconciliation status, and audits.
   */
  async confirmMatch(ctx: SecurityContext, matchId: string) {
    this.assertReconciliationPermission(ctx);
    const tenantId = ctx.tenantId;

    if (!matchId?.trim()) {
      throw new MatchValidationError('Match ID is required.');
    }

    return await this.executeTransactionalAllocation({
      ctx,
      operation: 'CONFIRM_EXISTING',
      matchId: matchId.trim(),
    });
  }

  /**
   * 4. Atomically creates and confirms a match in a single transaction.
   * Used for direct manual or rule-based match confirmation.
   */
  async createAndConfirmMatch(ctx: SecurityContext, input: CreateAndConfirmMatchInput) {
    this.assertReconciliationPermission(ctx);
    const tenantId = ctx.tenantId;

    if (!input.statementLineId?.trim()) {
      throw new MatchValidationError('Statement line ID is required.');
    }
    if (!input.paymentId?.trim()) {
      throw new MatchValidationError('Payment ID is required.');
    }

    const matchedAmount = this.validateMonetaryAmount(input.matchedAmount, 'matchedAmount');

    return await this.executeTransactionalAllocation({
      ctx,
      operation: 'CREATE_AND_CONFIRM',
      statementLineId: input.statementLineId.trim(),
      paymentId: input.paymentId.trim(),
      matchedAmount,
      matchType: input.matchType ?? 'MANUAL_MATCH',
      reason: input.reason?.trim(),
      feeAmount: input.feeAmount,
    });
  }

  /**
   * 5. Reverses a confirmed match.
   * Mandatory non-empty reason required.
   * Retains the match record with status 'REVERSED', updates statement line reconciliation status,
   * and records an audit log.
   */
  async reverseMatch(ctx: SecurityContext, input: ReverseMatchInput) {
    this.assertReconciliationPermission(ctx);
    const tenantId = ctx.tenantId;

    if (!input.matchId?.trim()) {
      throw new MatchValidationError('Match ID is required.');
    }
    const reason = input.reason?.trim();
    if (!reason || reason.length < 5) {
      throw new MatchValidationError('A specific reversal reason of at least 5 characters is mandatory.');
    }

    return await this.db.$transaction(
      async (tx) => {
        // 1. Fetch match to get statementLineId and paymentId
      const existingMatch = await tx.reconciliationMatch.findFirst({
        where: { id: input.matchId.trim(), organizationId: tenantId },
      });

      if (!existingMatch) {
        throw new MatchNotFoundError('Reconciliation match not found or belongs to another business.');
      }

      if (existingMatch.status === 'REVERSED') {
        throw new MatchValidationError('This reconciliation match has already been reversed.');
      }

      if (existingMatch.status === 'SETTLED' || existingMatch.settlementJournalId) {
        throw new MatchValidationError(
          'Cannot reverse a SETTLED match directly. Reversal must be performed through the authorized settlement reversal workflow.',
          'MATCH_ALREADY_SETTLED'
        );
      }

      // 2. Lock statement line with FOR UPDATE
      await tx.$queryRaw`
        SELECT id FROM "bank_statement_lines"
        WHERE id = ${existingMatch.statementLineId} AND "organizationId" = ${tenantId}
        FOR UPDATE
      `;

      const line = await tx.bankStatementLine.findUniqueOrThrow({
        where: { id: existingMatch.statementLineId },
      });

      if (line.settlementJournalId || line.reconciliationStatus === 'SETTLED') {
        throw new MatchValidationError(
          'Cannot reverse match: the associated statement line is already SETTLED in the ledger.',
          'LINE_ALREADY_SETTLED'
        );
      }

      if (existingMatch.paymentId) {
        await tx.$queryRaw`
          SELECT id FROM "invoice_payments"
          WHERE id = ${existingMatch.paymentId} AND "organizationId" = ${tenantId}
          FOR UPDATE
        `;
      }

      // 3. Mark match as REVERSED
      const updatedMatch = await tx.reconciliationMatch.update({
        where: { id: existingMatch.id },
        data: {
          status: 'REVERSED',
          reason: `REVERSED: ${reason}`,
        },
      });

      // 4. Recalculate statement line status based on remaining CONFIRMED matches
      const lineAmount = new Decimal(line.amount.toString());

      const activeMatches = await tx.reconciliationMatch.aggregate({
        where: {
          organizationId: tenantId,
          statementLineId: line.id,
          status: 'CONFIRMED',
        },
        _sum: { matchedAmount: true },
      });

      const activeTotal = new Decimal(activeMatches._sum.matchedAmount?.toString() ?? '0');

      let newStatus: StatementLineReconciliationStatus = 'UNMATCHED';
      if (activeTotal.equals(lineAmount)) {
        newStatus = 'MATCHED';
      } else if (activeTotal.greaterThan(0)) {
        newStatus = 'PARTIALLY_MATCHED';
      } else {
        newStatus = 'UNMATCHED';
      }

      await tx.bankStatementLine.update({
        where: { id: line.id },
        data: { reconciliationStatus: newStatus },
      });

      // 5. Record audit log
      await recordAuditLog(tx, ctx, {
        action: 'UPDATE',
        entityType: 'ReconciliationMatch',
        entityId: updatedMatch.id,
        changedFields: {
          previousStatus: existingMatch.status,
          status: 'REVERSED',
          reversalReason: reason,
          statementLineId: line.id,
          newStatementLineStatus: newStatus,
        },
      });

      return {
        match: updatedMatch,
        statementLineStatus: newStatus,
      };
    },
    { maxWait: 10000, timeout: 30000 }
  );
  }

  /**
   * 6. Marks a statement line as explicitly DISCREPANT with a mandatory reason.
   */
  async markLineDiscrepant(ctx: SecurityContext, input: MarkLineDiscrepantInput) {
    this.assertReconciliationPermission(ctx);
    const tenantId = ctx.tenantId;

    if (!input.statementLineId?.trim()) {
      throw new MatchValidationError('Statement line ID is required.');
    }
    const reason = input.reason?.trim();
    if (!reason || reason.length < 5) {
      throw new MatchValidationError('A specific discrepancy reason of at least 5 characters is mandatory.');
    }

    return await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "bank_statement_lines"
        WHERE id = ${input.statementLineId.trim()} AND "organizationId" = ${tenantId}
        FOR UPDATE
      `;

      const line = await tx.bankStatementLine.findFirst({
        where: { id: input.statementLineId.trim(), organizationId: tenantId },
      });

      if (!line) {
        throw new MatchNotFoundError('Statement line not found or belongs to another business.');
      }

      if (line.settlementJournalId || line.reconciliationStatus === 'SETTLED') {
        throw new MatchValidationError(
          `Cannot mark statement line '${line.id}' as DISCREPANT: statement line is already SETTLED in the ledger.`,
          'LINE_ALREADY_SETTLED'
        );
      }

      const updatedLine = await tx.bankStatementLine.update({
        where: { id: line.id },
        data: { reconciliationStatus: 'DISCREPANT' },
      });

      await recordAuditLog(tx, ctx, {
        action: 'UPDATE',
        entityType: 'BankStatementLine',
        entityId: line.id,
        changedFields: {
          previousStatus: line.reconciliationStatus,
          reconciliationStatus: 'DISCREPANT',
          reason,
        },
      });

      return updatedLine;
    });
  }

  /**
   * 7. Marks a statement line as IGNORED (e.g. non-business internal transfer) with a mandatory reason.
   */
  async ignoreStatementLine(ctx: SecurityContext, input: IgnoreStatementLineInput) {
    this.assertReconciliationPermission(ctx);
    const tenantId = ctx.tenantId;

    if (!input.statementLineId?.trim()) {
      throw new MatchValidationError('Statement line ID is required.');
    }
    const reason = input.reason?.trim();
    if (!reason || reason.length < 5) {
      throw new MatchValidationError('A specific reason for ignoring this line of at least 5 characters is mandatory.');
    }

    return await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "bank_statement_lines"
        WHERE id = ${input.statementLineId.trim()} AND "organizationId" = ${tenantId}
        FOR UPDATE
      `;

      const line = await tx.bankStatementLine.findFirst({
        where: { id: input.statementLineId.trim(), organizationId: tenantId },
      });

      if (!line) {
        throw new MatchNotFoundError('Statement line not found or belongs to another business.');
      }

      if (line.settlementJournalId || line.reconciliationStatus === 'SETTLED') {
        throw new MatchValidationError(
          `Cannot mark statement line '${line.id}' as IGNORED: statement line is already SETTLED in the ledger.`,
          'LINE_ALREADY_SETTLED'
        );
      }

      const updatedLine = await tx.bankStatementLine.update({
        where: { id: line.id },
        data: { reconciliationStatus: 'IGNORED' },
      });

      await recordAuditLog(tx, ctx, {
        action: 'UPDATE',
        entityType: 'BankStatementLine',
        entityId: line.id,
        changedFields: {
          previousStatus: line.reconciliationStatus,
          reconciliationStatus: 'IGNORED',
          reason,
        },
      });

      return updatedLine;
    });
  }

  /**
   * 8. Retrieves unmatched, partially matched, or discrepant statement lines.
   */
  async getStatementLines(ctx: SecurityContext, filter?: UnmatchedLinesFilter) {
    this.assertReconciliationPermission(ctx);
    const tenantId = ctx.tenantId;

    const where: Prisma.BankStatementLineWhereInput = {
      organizationId: tenantId,
    };

    if (filter?.bankAccountId) {
      where.bankAccountId = filter.bankAccountId;
    }
    if (filter?.importId) {
      where.importId = filter.importId;
    }
    if (filter?.status && filter.status.length > 0) {
      where.reconciliationStatus = { in: filter.status };
    } else {
      where.reconciliationStatus = { in: ['UNMATCHED', 'PARTIALLY_MATCHED', 'DISCREPANT'] };
    }
    if (filter?.startDate || filter?.endDate) {
      where.transactionDate = {
        ...(filter.startDate ? { gte: filter.startDate } : {}),
        ...(filter.endDate ? { lte: filter.endDate } : {}),
      };
    }
    if (filter?.search?.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { description: { contains: q, mode: 'insensitive' } },
        { referenceNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const [total, lines] = await Promise.all([
      this.db.bankStatementLine.count({ where }),
      this.db.bankStatementLine.findMany({
        where,
        include: {
          bankAccount: {
            select: { id: true, accountName: true, bankName: true, branchId: true },
          },
          matches: {
            where: { status: { in: ['CONFIRMED', 'SETTLED', 'PROPOSED'] } },
            include: {
              payment: {
                select: {
                  id: true,
                  amount: true,
                  paymentMethod: true,
                  transactionRef: true,
                  paymentDate: true,
                  invoice: {
                    select: { id: true, invoiceNumber: true, customerName: true, branchId: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { transactionDate: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    return { total, lines };
  }

  /**
   * 9. Retrieves a single statement line with full details including bank account, import, matches and settlement journal.
   */
  async getStatementLineById(ctx: SecurityContext, statementLineId: string) {
    this.assertReconciliationPermission(ctx);
    const tenantId = ctx.tenantId;

    const line = await this.db.bankStatementLine.findFirst({
      where: {
        id: statementLineId.trim(),
        organizationId: tenantId,
      },
      include: {
        bankAccount: {
          include: {
            branch: { select: { id: true, name: true, code: true } },
            ledgerAccount: { select: { id: true, code: true, name: true } },
          },
        },
        import: {
          select: {
            id: true,
            fileName: true,
            createdAt: true,
            sourceType: true,
            fileFormat: true,
          },
        },
        settlementJournal: {
          include: {
            lines: {
              include: {
                account: { select: { id: true, code: true, name: true, classification: true } },
              },
              orderBy: { lineNumber: 'asc' },
            },
          },
        },
        matches: {
          include: {
            payment: {
              include: {
                invoice: {
                  select: {
                    id: true,
                    invoiceNumber: true,
                    customerName: true,
                    customerPhone: true,
                    invoiceDate: true,
                    branchId: true,
                  },
                },
              },
            },
            matchedByUser: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { matchedAt: 'desc' },
        },
      },
    });

    if (!line) {
      throw new MatchNotFoundError('Statement line not found or belongs to another business.');
    }

    if (line.bankAccount.branchId) {
      assertBranchAccess(ctx, line.bankAccount.branchId);
    }

    return line;
  }

  /**
   * 10. Computes aggregate reconciliation metrics across statement lines and matches for dashboard/summary view.
   */
  async getReconciliationSummary(
    ctx: SecurityContext,
    filter?: {
      bankAccountId?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ) {
    this.assertReconciliationPermission(ctx);
    const tenantId = ctx.tenantId;

    const baseWhere: Prisma.BankStatementLineWhereInput = {
      organizationId: tenantId,
      ...(filter?.bankAccountId ? { bankAccountId: filter.bankAccountId } : {}),
      ...(filter?.startDate || filter?.endDate
        ? {
            transactionDate: {
              ...(filter.startDate ? { gte: filter.startDate } : {}),
              ...(filter.endDate ? { lte: filter.endDate } : {}),
            },
          }
        : {}),
    };

    const [
      totalLines,
      unmatchedCount,
      partiallyMatchedCount,
      matchedCount,
      settledCount,
      discrepantCount,
      ignoredCount,
      amountAgg,
      feeAgg,
    ] = await Promise.all([
      this.db.bankStatementLine.count({ where: baseWhere }),
      this.db.bankStatementLine.count({ where: { ...baseWhere, reconciliationStatus: 'UNMATCHED' } }),
      this.db.bankStatementLine.count({ where: { ...baseWhere, reconciliationStatus: 'PARTIALLY_MATCHED' } }),
      this.db.bankStatementLine.count({ where: { ...baseWhere, reconciliationStatus: 'MATCHED' } }),
      this.db.bankStatementLine.count({ where: { ...baseWhere, reconciliationStatus: 'SETTLED' } }),
      this.db.bankStatementLine.count({ where: { ...baseWhere, reconciliationStatus: 'DISCREPANT' } }),
      this.db.bankStatementLine.count({ where: { ...baseWhere, reconciliationStatus: 'IGNORED' } }),
      this.db.bankStatementLine.aggregate({
        where: baseWhere,
        _sum: { amount: true },
      }),
      this.db.bankStatementLine.aggregate({
        where: { ...baseWhere, feeAmount: { not: null } },
        _sum: { feeAmount: true },
      }),
    ]);

    // Aggregate confirmed & settled match allocations
    const matchesAgg = await this.db.reconciliationMatch.aggregate({
      where: {
        organizationId: tenantId,
        status: { in: ['CONFIRMED', 'SETTLED'] },
        statementLine: baseWhere,
      },
      _sum: {
        matchedAmount: true,
      },
    });

    const totalDepositAmount = amountAgg._sum.amount
      ? new Decimal(amountAgg._sum.amount.toString()).toFixed(2)
      : '0.00';
    const totalFeeAmount = feeAgg._sum.feeAmount
      ? new Decimal(feeAgg._sum.feeAmount.toString()).toFixed(2)
      : '0.00';
    const totalGrossCleared = matchesAgg._sum.matchedAmount
      ? new Decimal(matchesAgg._sum.matchedAmount.toString()).toFixed(2)
      : '0.00';

    return {
      totalLines,
      unmatchedCount,
      partiallyMatchedCount,
      matchedCount,
      settledCount,
      discrepantCount,
      ignoredCount,
      totalDepositAmount,
      totalFeeAmount,
      totalGrossCleared,
    };
  }

  /**
   * 11. Searches unallocated or partially allocated customer invoice payments for manual matching.
   */
  async searchUnallocatedPayments(
    ctx: SecurityContext,
    options?: {
      query?: string;
      paymentMethod?: string;
      limit?: number;
    }
  ) {
    this.assertReconciliationPermission(ctx);
    const tenantId = ctx.tenantId;
    const limit = options?.limit ?? 30;

    const where: Prisma.InvoicePaymentWhereInput = {
      organizationId: tenantId,
      // Exclude cash payments as they are ineligible for bank reconciliation
      paymentMethod: options?.paymentMethod ? options.paymentMethod : { not: 'CASH' },
    };

    if (options?.query?.trim()) {
      const q = options.query.trim();
      where.OR = [
        { transactionRef: { contains: q, mode: 'insensitive' } },
        { invoice: { invoiceNumber: { contains: q, mode: 'insensitive' } } },
        { invoice: { customerName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const payments = await this.db.invoicePayment.findMany({
      where,
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            customerName: true,
            customerPhone: true,
            branchId: true,
            invoiceDate: true,
          },
        },
        reconciliationMatches: {
          where: {
            status: { in: ['CONFIRMED', 'SETTLED'] },
          },
          select: {
            matchedAmount: true,
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
      take: limit * 2, // Take more to filter unallocated in memory
    });

    const unallocatedList = [];
    for (const p of payments) {
      if (p.invoice.branchId && ctx.allowedBranchIds.length > 0 && !ctx.allowedBranchIds.includes(p.invoice.branchId)) {
        continue;
      }

      const totalAllocated = p.reconciliationMatches.reduce(
        (acc, m) => acc.plus(new Decimal(m.matchedAmount.toString())),
        new Decimal(0)
      );
      const paymentAmount = new Decimal(p.amount.toString());
      const remainingUnallocated = paymentAmount.minus(totalAllocated);

      if (remainingUnallocated.greaterThan(0)) {
        unallocatedList.push({
          id: p.id,
          invoiceId: p.invoice.id,
          invoiceNumber: p.invoice.invoiceNumber,
          customerName: p.invoice.customerName,
          customerPhone: p.invoice.customerPhone,
          paymentMethod: p.paymentMethod,
          amount: paymentAmount.toFixed(2),
          unallocatedAmount: remainingUnallocated.toFixed(2),
          transactionRef: p.transactionRef,
          paymentDate: p.paymentDate.toISOString(),
          branchId: p.invoice.branchId,
        });
      }

      if (unallocatedList.length >= limit) {
        break;
      }
    }

    return unallocatedList;
  }

  // ============================================================================
  // INTERNAL TRANSACTIONAL ALLOCATION ENGINE WITH CONCURRENCY SAFEGUARDS
  // ============================================================================

  private async executeTransactionalAllocation(params: {
    ctx: SecurityContext;
    operation: 'CONFIRM_EXISTING' | 'CREATE_AND_CONFIRM';
    matchId?: string;
    statementLineId?: string;
    paymentId?: string;
    matchedAmount?: Decimal;
    matchType?: MatchRuleType;
    reason?: string;
    feeAmount?: number | string | Decimal;
  }) {
    const { ctx, operation } = params;
    const tenantId = ctx.tenantId;

    return await this.db.$transaction(
      async (tx) => {
        let lineId: string;
      let paymentId: string;
      let matchedAmount: Decimal;
      let matchType: MatchRuleType = params.matchType ?? 'MANUAL_MATCH';
      let existingMatchId: string | undefined = undefined;

      if (operation === 'CONFIRM_EXISTING') {
        const match = await tx.reconciliationMatch.findFirst({
          where: { id: params.matchId!, organizationId: tenantId },
        });

        if (!match) {
          throw new MatchNotFoundError('Reconciliation match not found or belongs to another business.');
        }

        if (match.status === 'CONFIRMED') {
          throw new MatchValidationError('Match is already confirmed.');
        }
        if (match.status === 'REVERSED') {
          throw new MatchValidationError('Cannot confirm a reversed match.');
        }
        if (!match.paymentId) {
          throw new MatchValidationError('Cannot confirm match: linked payment is missing.');
        }

        lineId = match.statementLineId;
        paymentId = match.paymentId;
        matchedAmount = new Decimal(match.matchedAmount.toString());
        matchType = match.matchType as MatchRuleType;
        existingMatchId = match.id;
      } else {
        lineId = params.statementLineId!;
        paymentId = params.paymentId!;
        matchedAmount = params.matchedAmount!;
      }

      // ------------------------------------------------------------------------
      // PESSIMISTIC CONCURRENCY CONTROL: ORDERED ROW LOCKS
      // Lock Statement Line first, then Payment (strictly ordered to prevent deadlocks)
      // ------------------------------------------------------------------------
      await tx.$queryRaw`
        SELECT id FROM "bank_statement_lines"
        WHERE id = ${lineId} AND "organizationId" = ${tenantId}
        FOR UPDATE
      `;

      await tx.$queryRaw`
        SELECT id FROM "invoice_payments"
        WHERE id = ${paymentId} AND "organizationId" = ${tenantId}
        FOR UPDATE
      `;

      // ------------------------------------------------------------------------
      // LOAD FRESH ENTITIES UNDER ROW LOCK
      // ------------------------------------------------------------------------
      const line = await tx.bankStatementLine.findFirst({
        where: { id: lineId, organizationId: tenantId },
        include: { bankAccount: true },
      });
      if (!line) {
        throw new MatchNotFoundError('Statement line not found or belongs to another business.');
      }

      if (line.settlementJournalId || line.reconciliationStatus === 'SETTLED') {
        throw new MatchValidationError(
          `Statement line '${line.id}' is already SETTLED and cannot be matched or modified.`,
          'LINE_ALREADY_SETTLED'
        );
      }
      if (line.bankAccount.branchId) {
        assertBranchAccess(ctx, line.bankAccount.branchId);
      }

      const payment = await tx.invoicePayment.findFirst({
        where: { id: paymentId, organizationId: tenantId },
        include: { invoice: true },
      });
      if (!payment) {
        throw new MatchNotFoundError('Payment not found or belongs to another business.');
      }
      if (payment.invoice.branchId && ctx.allowedBranchIds.length > 0) {
        assertBranchAccess(ctx, payment.invoice.branchId);
      }

      const lineAmount = new Decimal(line.amount.toString());
      const paymentAmount = new Decimal(payment.amount.toString());

      // ------------------------------------------------------------------------
      // RECALCULATE ACTIVE CONFIRMED & SETTLED ALLOCATIONS INSIDE TRANSACTION
      // Excludes proposed, reversed, and currently updating matches
      // ------------------------------------------------------------------------
      const lineConfirmedAgg = await tx.reconciliationMatch.aggregate({
        where: {
          organizationId: tenantId,
          statementLineId: line.id,
          status: { in: ['CONFIRMED', 'SETTLED'] },
          ...(existingMatchId ? { id: { not: existingMatchId } } : {}),
        },
        _sum: { matchedAmount: true },
      });

      const paymentConfirmedAgg = await tx.reconciliationMatch.aggregate({
        where: {
          organizationId: tenantId,
          paymentId: payment.id,
          status: { in: ['CONFIRMED', 'SETTLED'] },
          ...(existingMatchId ? { id: { not: existingMatchId } } : {}),
        },
        _sum: { matchedAmount: true },
      });

      const currentLineConfirmed = new Decimal(lineConfirmedAgg._sum.matchedAmount?.toString() ?? '0');
      const currentPaymentConfirmed = new Decimal(paymentConfirmedAgg._sum.matchedAmount?.toString() ?? '0');

      const newLineConfirmed = currentLineConfirmed.plus(matchedAmount);
      const newPaymentConfirmed = currentPaymentConfirmed.plus(matchedAmount);

      // ------------------------------------------------------------------------
      // OVER-ALLOCATION INVARIANTS ENFORCEMENT
      // Effective capacity includes explicit fee if present on input or line
      // ------------------------------------------------------------------------
      const inputFee = (params as any).feeAmount !== undefined && (params as any).feeAmount !== null
        ? this.validateMonetaryAmount((params as any).feeAmount, 'feeAmount')
        : new Decimal(0);
      const lineFee = line.feeAmount ? new Decimal(line.feeAmount.toString()) : new Decimal(0);
      const effectiveFee = inputFee.gt(0) ? inputFee : lineFee;
      const effectiveLineMax = lineAmount.plus(effectiveFee);

      if (newLineConfirmed.greaterThan(effectiveLineMax)) {
        const excess = newLineConfirmed.minus(effectiveLineMax);
        throw new MatchAllocationError(
          `Allocation overflow on statement line: total confirmed allocations (${newLineConfirmed.toFixed(
            2
          )}) would exceed statement line capacity (${effectiveLineMax.toFixed(2)}) by ${excess.toFixed(2)}.`,
          'STATEMENT_LINE_ALLOCATION_OVERFLOW'
        );
      }

      if (newPaymentConfirmed.greaterThan(paymentAmount)) {
        const excess = newPaymentConfirmed.minus(paymentAmount);
        throw new MatchAllocationError(
          `Allocation overflow on payment: total confirmed allocations (${newPaymentConfirmed.toFixed(
            2
          )}) would exceed payment amount (${paymentAmount.toFixed(2)}) by ${excess.toFixed(2)}.`,
          'PAYMENT_ALLOCATION_OVERFLOW'
        );
      }

      // ------------------------------------------------------------------------
      // WRITE / UPDATE RECONCILIATION MATCH
      // ------------------------------------------------------------------------
      let confirmedMatch;
      if (operation === 'CONFIRM_EXISTING') {
        confirmedMatch = await tx.reconciliationMatch.update({
          where: { id: existingMatchId! },
          data: {
            status: 'CONFIRMED',
            matchedByUserId: ctx.userId,
            matchedAt: new Date(),
          },
        });
      } else {
        confirmedMatch = await tx.reconciliationMatch.create({
          data: {
            organizationId: tenantId,
            statementLineId: line.id,
            paymentId: payment.id,
            matchType,
            matchedAmount: matchedAmount.toFixed(2),
            status: 'CONFIRMED',
            matchedByUserId: ctx.userId,
            matchedAt: new Date(),
            reason: params.reason ?? null,
          },
        });
      }

      // ------------------------------------------------------------------------
      // UPDATE STATEMENT LINE RECONCILIATION STATUS
      // ------------------------------------------------------------------------
      let newReconciliationStatus: StatementLineReconciliationStatus;
      if (newLineConfirmed.equals(effectiveLineMax)) {
        newReconciliationStatus = 'MATCHED';
      } else if (newLineConfirmed.greaterThan(0)) {
        newReconciliationStatus = 'PARTIALLY_MATCHED';
      } else {
        newReconciliationStatus = 'UNMATCHED';
      }

      await tx.bankStatementLine.update({
        where: { id: line.id },
        data: {
          reconciliationStatus: newReconciliationStatus,
          ...(inputFee.gt(0) ? { feeAmount: inputFee.toFixed(2) } : {}),
        },
      });

      // ------------------------------------------------------------------------
      // RECORD AUDIT TRAIL
      // ------------------------------------------------------------------------
      await recordAuditLog(tx, ctx, {
        action: operation === 'CONFIRM_EXISTING' ? 'UPDATE' : 'CREATE',
        entityType: 'ReconciliationMatch',
        entityId: confirmedMatch.id,
        changedFields: {
          statementLineId: line.id,
          paymentId: payment.id,
          matchedAmount: matchedAmount.toFixed(2),
          status: 'CONFIRMED',
          statementLineStatus: newReconciliationStatus,
          totalLineConfirmed: newLineConfirmed.toFixed(2),
          totalPaymentConfirmed: newPaymentConfirmed.toFixed(2),
        },
      });

      return {
        match: confirmedMatch,
        statementLineStatus: newReconciliationStatus,
        lineConfirmedAmount: newLineConfirmed,
        paymentConfirmedAmount: newPaymentConfirmed,
      };
    },
    { maxWait: 10000, timeout: 30000 }
  );
  }
}

export const reconciliationMatcher = new ReconciliationMatcher();
