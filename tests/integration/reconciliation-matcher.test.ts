import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Organization, Branch, User } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { SecurityContext, AuthorizationError } from '@/types/security';
import {
  ReconciliationMatcher,
  MatchValidationError,
  MatchAllocationError,
  MatchNotFoundError,
} from '@/lib/reconciliation';
import { BankAccountService } from '@/lib/bank-accounts';
import { LedgerService } from '@/lib/ledger';

const prisma = new PrismaClient();
const matcher = new ReconciliationMatcher({ prisma });
const bankAccountService = new BankAccountService({ prisma });
const ledgerService = new LedgerService({ prisma });

describe('Suvarna Milestone 4D-3 — Reconciliation Matching Engine Integration Tests', () => {
  let suvarnaOrg: Organization;
  let kalyanOrg: Organization;
  let fortBranch: Branch;
  let vashiBranch: Branch;

  let ownerUser: User;
  let accountantUser: User;
  let salesUser: User;
  let kalyanOwnerUser: User;

  let ownerCtx: SecurityContext;
  let accountantCtx: SecurityContext;
  let salesCtx: SecurityContext;
  let kalyanOwnerCtx: SecurityContext;

  let suvarnaAccountId: string;
  let kalyanAccountId: string;
  let testImportId: string;

  const createdBankAccountIds: string[] = [];
  const createdImportIds: string[] = [];
  const createdStatementLineIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdMatchIds: string[] = [];
  const createdCustomerIds: string[] = [];
  const createdOrnamentIds: string[] = [];

  // Helper to create synthetic customer
  async function createCustomer(name: string, phone: string) {
    const cust = await prisma.customer.create({
      data: {
        organizationId: suvarnaOrg.id,
        primaryBranchId: fortBranch.id,
        name,
        phone,
        normalizedPhone: phone,
        pan: 'ABCDE1234F',
        city: 'Mumbai',
        state: 'Maharashtra',
      },
    });
    createdCustomerIds.push(cust.id);
    return cust;
  }

  // Helper to create synthetic ornament
  async function createOrnament(tagCode: string) {
    const product = await prisma.product.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id },
    });

    const ornament = await prisma.ornament.create({
      data: {
        organizationId: suvarnaOrg.id,
        branchId: fortBranch.id,
        productId: product.id,
        tagCode,
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '5.000',
        netWeight: '5.000',
        status: 'AVAILABLE',
      },
    });
    createdOrnamentIds.push(ornament.id);
    return ornament;
  }

  // Helper to create synthetic invoice with specific payment rows
  async function createInvoiceWithPayments(params: {
    customerName: string;
    payments: Array<{
      paymentMethod: string;
      amount: string;
      transactionRef?: string;
      paymentDate?: Date;
    }>;
  }) {
    const cust = await createCustomer(params.customerName, `98${Math.floor(10000000 + Math.random() * 90000000)}`);
    const totalPayment = params.payments.reduce(
      (sum, p) => sum.plus(new Decimal(p.amount)),
      new Decimal(0)
    );

    const inv = await prisma.invoice.create({
      data: {
        organizationId: suvarnaOrg.id,
        branchId: fortBranch.id,
        invoiceNumber: `INV-M4D3-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        fiscalYear: '2026-2027',
        sequenceNumber: Math.floor(Math.random() * 900000) + 1,
        customerId: cust.id,
        customerName: cust.name,
        customerCity: 'Mumbai',
        customerState: 'Maharashtra',
        subtotal: totalPayment.toFixed(2),
        taxableAmount: totalPayment.toFixed(2),
        totalTax: '0.00',
        grandTotal: totalPayment.toFixed(2),
        paidAmount: totalPayment.toFixed(2),
        balanceAmount: '0.00',
        paymentStatus: 'PAID',
        userId: ownerUser.id,
      },
    });
    createdInvoiceIds.push(inv.id);

    const payments = [];
    for (const p of params.payments) {
      const paymentRecord = await prisma.invoicePayment.create({
        data: {
          organizationId: suvarnaOrg.id,
          invoiceId: inv.id,
          paymentMethod: p.paymentMethod,
          amount: p.amount,
          transactionRef: p.transactionRef ?? null,
          paymentDate: p.paymentDate ?? new Date(),
          receivedByUserId: ownerUser.id,
        },
      });
      createdPaymentIds.push(paymentRecord.id);
      payments.push(paymentRecord);
    }

    return { invoice: inv, payments };
  }

  // Helper to create synthetic statement line
  async function createStatementLine(params: {
    amount: string;
    lineType: 'CREDIT' | 'DEBIT';
    referenceNumber?: string;
    description?: string;
    transactionDate?: Date;
    organizationId?: string;
    bankAccountId?: string;
  }) {
    const orgId = params.organizationId ?? suvarnaOrg.id;
    const accId = params.bankAccountId ?? suvarnaAccountId;

    const line = await prisma.bankStatementLine.create({
      data: {
        organizationId: orgId,
        importId: testImportId,
        bankAccountId: accId,
        lineNumber: createdStatementLineIds.length + 1,
        transactionDate: params.transactionDate ?? new Date(),
        description: params.description ?? 'Test Bank Transaction',
        referenceNumber: params.referenceNumber ?? null,
        lineType: params.lineType,
        amount: params.amount,
        reconciliationStatus: 'UNMATCHED',
      },
    });
    createdStatementLineIds.push(line.id);
    return line;
  }

  beforeAll(async () => {
    // 1. Resolve seeded Organizations
    suvarnaOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'suvarna-mumbai' } });
    kalyanOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'kalyan-test' } });

    // 2. Resolve seeded Branches
    fortBranch = await prisma.branch.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id, code: 'FORT' },
    });
    vashiBranch = await prisma.branch.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id, code: 'VASHI' },
    });

    // 3. Resolve Users
    ownerUser = await prisma.user.findFirstOrThrow({ where: { email: 'owner@suvarna.test' } });
    accountantUser = await prisma.user.findFirstOrThrow({ where: { email: 'accountant@suvarna.test' } });
    salesUser = await prisma.user.findFirstOrThrow({ where: { email: 'sales@suvarna.test' } });
    kalyanOwnerUser = await prisma.user.findFirstOrThrow({ where: { email: 'owner@kalyan.test' } });

    // 4. Build Security Contexts
    ownerCtx = {
      userId: ownerUser.id,
      userEmail: ownerUser.email,
      tenantId: suvarnaOrg.id,
      tenantSlug: suvarnaOrg.slug,
      membershipId: 'mem-owner-suvarna',
      role: 'OWNER',
      activeBranchId: fortBranch.id,
      allowedBranchIds: [fortBranch.id, vashiBranch.id],
    };

    accountantCtx = {
      userId: accountantUser.id,
      userEmail: accountantUser.email,
      tenantId: suvarnaOrg.id,
      tenantSlug: suvarnaOrg.slug,
      membershipId: 'mem-acct-suvarna',
      role: 'ACCOUNTANT',
      activeBranchId: fortBranch.id,
      allowedBranchIds: [fortBranch.id, vashiBranch.id],
    };

    salesCtx = {
      userId: salesUser.id,
      userEmail: salesUser.email,
      tenantId: suvarnaOrg.id,
      tenantSlug: suvarnaOrg.slug,
      membershipId: 'mem-sales-suvarna',
      role: 'SALES_STAFF',
      activeBranchId: fortBranch.id,
      allowedBranchIds: [fortBranch.id],
    };

    kalyanOwnerCtx = {
      userId: kalyanOwnerUser.id,
      userEmail: kalyanOwnerUser.email,
      tenantId: kalyanOrg.id,
      tenantSlug: kalyanOrg.slug,
      membershipId: 'mem-owner-kalyan',
      role: 'OWNER',
      activeBranchId: fortBranch.id,
      allowedBranchIds: [],
    };

    // Ensure billing ledger accounts exist
    await ledgerService.ensureBillingAccounts(ownerCtx);
    await ledgerService.ensureBillingAccounts(kalyanOwnerCtx);

    const suvarnaLedger1040 = await prisma.ledgerAccount.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id, code: '1040' },
    });
    const kalyanLedger1040 = await prisma.ledgerAccount.findFirstOrThrow({
      where: { organizationId: kalyanOrg.id, code: '1040' },
    });

    // Create BankAccounts
    const suvarnaAcc = await bankAccountService.createBankAccount(ownerCtx, {
      accountName: `HDFC Match Test - ${Date.now()}`,
      bankName: 'HDFC Bank',
      accountNumberMasked: '******778899',
      ifscCode: 'HDFC0000001',
      accountType: 'CURRENT',
      ledgerAccountId: suvarnaLedger1040.id,
    });
    suvarnaAccountId = suvarnaAcc.id;
    createdBankAccountIds.push(suvarnaAcc.id);

    const kalyanAcc = await bankAccountService.createBankAccount(kalyanOwnerCtx, {
      accountName: `ICICI Kalyan Match Test - ${Date.now()}`,
      bankName: 'ICICI Bank',
      accountNumberMasked: '******112233',
      ifscCode: 'ICIC0000002',
      accountType: 'CURRENT',
      ledgerAccountId: kalyanLedger1040.id,
    });
    kalyanAccountId = kalyanAcc.id;
    createdBankAccountIds.push(kalyanAcc.id);

    // Create a base BankStatementImport header
    const importHeader = await prisma.bankStatementImport.create({
      data: {
        organizationId: suvarnaOrg.id,
        bankAccountId: suvarnaAccountId,
        sourceType: 'BANK_STATEMENT',
        fileFormat: 'GENERIC_CSV',
        fileName: 'test_matching_batch.csv',
        fileHash: `sha256-matching-test-${Date.now()}`,
        status: 'PROCESSED',
        totalLinesCount: 0,
        importedByUserId: ownerUser.id,
      },
    });
    testImportId = importHeader.id;
    createdImportIds.push(importHeader.id);
  });

  afterAll(async () => {
    // Clean up settlement journal links first to satisfy ON DELETE RESTRICT
    await prisma.reconciliationMatch.updateMany({
      where: { organizationId: { in: [suvarnaOrg.id, kalyanOrg.id] } },
      data: { settlementJournalId: null },
    });
    await prisma.bankStatementLine.updateMany({
      where: { organizationId: { in: [suvarnaOrg.id, kalyanOrg.id] } },
      data: { settlementJournalId: null },
    });

    // Clean up created matches
    await prisma.reconciliationMatch.deleteMany({
      where: { organizationId: suvarnaOrg.id, statementLineId: { in: createdStatementLineIds } },
    });

    // Clean up statement lines
    if (createdStatementLineIds.length > 0) {
      await prisma.bankStatementLine.deleteMany({
        where: { id: { in: createdStatementLineIds } },
      });
    }

    // Clean up statement imports
    if (createdImportIds.length > 0) {
      await prisma.bankStatementImport.deleteMany({
        where: { id: { in: createdImportIds } },
      });
    }

    // Clean up payments & invoices
    if (createdPaymentIds.length > 0) {
      await prisma.invoicePayment.deleteMany({
        where: { id: { in: createdPaymentIds } },
      });
    }
    if (createdInvoiceIds.length > 0) {
      await prisma.invoice.deleteMany({
        where: { id: { in: createdInvoiceIds } },
      });
    }

    // Clean up ornaments & customers
    if (createdOrnamentIds.length > 0) {
      await prisma.ornament.deleteMany({ where: { id: { in: createdOrnamentIds } } });
    }
    if (createdCustomerIds.length > 0) {
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }

    // Clean up bank accounts
    if (createdBankAccountIds.length > 0) {
      await prisma.bankAccount.deleteMany({
        where: { id: { in: createdBankAccountIds } },
      });
    }

    await prisma.$disconnect();
  });

  // ============================================================================
  // 1. MATCHING RULES A, B, C & F
  // ============================================================================
  describe('Matching Candidate Rules', () => {
    it('Rule A: returns high confidence candidate when reference and amount match exactly', async () => {
      const uniqueRef = `UPI-RULEA-${Date.now()}`;
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Aarav Patel',
        payments: [{ paymentMethod: 'UPI', amount: '50000.00', transactionRef: uniqueRef }],
      });

      const line = await createStatementLine({
        amount: '50000.00',
        lineType: 'CREDIT',
        referenceNumber: uniqueRef,
      });

      const candidates = await matcher.findCandidateMatches(accountantCtx, line.id);

      expect(candidates).toHaveLength(1);
      const cand = candidates[0];
      expect(cand.rule).toBe('EXACT_REF_AND_AMOUNT');
      expect(cand.confidence).toBe('HIGH');
      expect(cand.isAmbiguous).toBe(false);
      expect(cand.paymentId).toBe(payments[0].id);
      expect(cand.paymentAmount.toFixed(2)).toBe('50000.00');
      expect(cand.discrepancy).toBeUndefined();
    });

    it('Rule B: flags candidate as discrepant when reference matches but amount differs', async () => {
      const uniqueRef = `NEFT-RULEB-${Date.now()}`;
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Meera Shah',
        payments: [{ paymentMethod: 'BANK_TRANSFER', amount: '50000.00', transactionRef: uniqueRef }],
      });

      // Bank statement line arrived with ₹49,500.00 (e.g. ₹500 fee or dispute)
      const line = await createStatementLine({
        amount: '49500.00',
        lineType: 'CREDIT',
        referenceNumber: uniqueRef,
      });

      const candidates = await matcher.findCandidateMatches(accountantCtx, line.id);

      expect(candidates).toHaveLength(1);
      const cand = candidates[0];
      expect(cand.rule).toBe('REF_MATCH_AMOUNT_DISCREPANT');
      expect(cand.confidence).toBe('DISCREPANT');
      expect(cand.isAmbiguous).toBe(false);
      expect(cand.paymentId).toBe(payments[0].id);
      expect(cand.discrepancy).toBeDefined();
      expect(cand.discrepancy?.statementAmount.toFixed(2)).toBe('49500.00');
      expect(cand.discrepancy?.paymentAmount.toFixed(2)).toBe('50000.00');
      expect(cand.discrepancy?.difference.toFixed(2)).toBe('-500.00');
    });

    it('Rule C: matches amount within date window when no reliable reference is present', async () => {
      const today = new Date();
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Rohan Joshi',
        payments: [{ paymentMethod: 'CARD', amount: '35123.45', paymentDate: today }],
      });

      // Statement line 1 day later without reference
      const tomorrow = new Date(today.getTime() + 86400 * 1000);
      const line = await createStatementLine({
        amount: '35123.45',
        lineType: 'CREDIT',
        referenceNumber: undefined,
        transactionDate: tomorrow,
      });

      const candidates = await matcher.findCandidateMatches(accountantCtx, line.id, { dateWindowDays: 3 });

      expect(candidates.some((c) => c.paymentId === payments[0].id)).toBe(true);
      const cand = candidates.find((c) => c.paymentId === payments[0].id)!;
      expect(cand.rule).toBe('AMOUNT_DATE_WINDOW');
      expect(cand.confidence).toBe('MEDIUM');
      expect(cand.isAmbiguous).toBe(false);
    });

    it('Rule F: flags multiple candidates as ambiguous when multiple payments match amount in date window', async () => {
      const today = new Date();
      const uniqueAmt = '18750.00';

      const res1 = await createInvoiceWithPayments({
        customerName: 'Customer One',
        payments: [{ paymentMethod: 'UPI', amount: uniqueAmt, paymentDate: today }],
      });
      const res2 = await createInvoiceWithPayments({
        customerName: 'Customer Two',
        payments: [{ paymentMethod: 'UPI', amount: uniqueAmt, paymentDate: today }],
      });

      const line = await createStatementLine({
        amount: uniqueAmt,
        lineType: 'CREDIT',
        referenceNumber: undefined,
        transactionDate: today,
      });

      const candidates = await matcher.findCandidateMatches(accountantCtx, line.id, { dateWindowDays: 2 });

      expect(candidates.length).toBeGreaterThanOrEqual(2);
      const match1 = candidates.find((c) => c.paymentId === res1.payments[0].id);
      const match2 = candidates.find((c) => c.paymentId === res2.payments[0].id);

      expect(match1?.isAmbiguous).toBe(true);
      expect(match2?.isAmbiguous).toBe(true);
    });
  });

  // ============================================================================
  // 2. ALLOCATION SCENARIOS: BATCH (RULE D) & SPLIT (RULE E)
  // ============================================================================
  describe('Batch and Split Allocations', () => {
    it('Rule D: allocates one statement line across multiple customer payments (Batch Settlement)', async () => {
      const { payments: p1 } = await createInvoiceWithPayments({
        customerName: 'Batch Customer 1',
        payments: [{ paymentMethod: 'CARD', amount: '60000.00' }],
      });
      const { payments: p2 } = await createInvoiceWithPayments({
        customerName: 'Batch Customer 2',
        payments: [{ paymentMethod: 'CARD', amount: '40000.00' }],
      });

      // Single EDC batch settlement line of ₹100,000.00
      const statementLine = await createStatementLine({
        amount: '100000.00',
        lineType: 'CREDIT',
        description: 'PineLabs EDC Batch Payout',
      });

      // 1. Allocate first payment of ₹60,000
      const alloc1 = await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: statementLine.id,
        paymentId: p1[0].id,
        matchedAmount: '60000.00',
        matchType: 'BATCH_SETTLEMENT',
      });

      expect(alloc1.statementLineStatus).toBe('PARTIALLY_MATCHED');
      expect(alloc1.lineConfirmedAmount.toFixed(2)).toBe('60000.00');

      // 2. Allocate second payment of ₹40,000
      const alloc2 = await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: statementLine.id,
        paymentId: p2[0].id,
        matchedAmount: '40000.00',
        matchType: 'BATCH_SETTLEMENT',
      });

      expect(alloc2.statementLineStatus).toBe('MATCHED');
      expect(alloc2.lineConfirmedAmount.toFixed(2)).toBe('100000.00');

      // Verify database state of statement line
      const dbLine = await prisma.bankStatementLine.findUniqueOrThrow({
        where: { id: statementLine.id },
      });
      expect(dbLine.reconciliationStatus).toBe('MATCHED');
    });

    it('Rule E: allocates one customer payment across multiple statement lines (Split Settlement)', async () => {
      // Customer made a single large payment of ₹80,000
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Split Customer',
        payments: [{ paymentMethod: 'BANK_TRANSFER', amount: '80000.00' }],
      });
      const paymentId = payments[0].id;

      // Two statement deposits: ₹50,000 and ₹30,000
      const line1 = await createStatementLine({ amount: '50000.00', lineType: 'CREDIT' });
      const line2 = await createStatementLine({ amount: '30000.00', lineType: 'CREDIT' });

      // Allocate first deposit to payment
      const res1 = await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line1.id,
        paymentId,
        matchedAmount: '50000.00',
        matchType: 'SPLIT_SETTLEMENT',
      });
      expect(res1.statementLineStatus).toBe('MATCHED');
      expect(res1.paymentConfirmedAmount.toFixed(2)).toBe('50000.00');

      // Allocate second deposit to payment
      const res2 = await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line2.id,
        paymentId,
        matchedAmount: '30000.00',
        matchType: 'SPLIT_SETTLEMENT',
      });
      expect(res2.statementLineStatus).toBe('MATCHED');
      expect(res2.paymentConfirmedAmount.toFixed(2)).toBe('80000.00');
    });
  });

  // ============================================================================
  // 3. MATCH LIFECYCLE: PROPOSED, CONFIRMED, REVERSED
  // ============================================================================
  describe('Match Lifecycle & Reversal Integrity', () => {
    it('does not include PROPOSED matches in confirmed totals', async () => {
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Proposed Test Customer',
        payments: [{ paymentMethod: 'UPI', amount: '22000.00' }],
      });
      const line = await createStatementLine({ amount: '22000.00', lineType: 'CREDIT' });

      // Create a proposed match
      const propMatch = await matcher.createProposedMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '22000.00',
        reason: 'Suggested by Rule A',
      });

      expect(propMatch.status).toBe('PROPOSED');

      // Statement line must remain UNMATCHED
      const dbLine = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
      expect(dbLine.reconciliationStatus).toBe('UNMATCHED');

      // Confirming the proposed match transitions statement line to MATCHED
      const confirmRes = await matcher.confirmMatch(accountantCtx, propMatch.id);
      expect(confirmRes.match.status).toBe('CONFIRMED');
      expect(confirmRes.statementLineStatus).toBe('MATCHED');
    });

    it('reverses a confirmed match with mandatory reason and rolls back line status', async () => {
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Reversal Customer',
        payments: [{ paymentMethod: 'UPI', amount: '45000.00' }],
      });
      const line = await createStatementLine({ amount: '45000.00', lineType: 'CREDIT' });

      const matchRes = await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '45000.00',
      });
      expect(matchRes.statementLineStatus).toBe('MATCHED');

      // Reversal without reason fails
      await expect(
        matcher.reverseMatch(accountantCtx, { matchId: matchRes.match.id, reason: '' })
      ).rejects.toThrow(MatchValidationError);

      // Reversal with valid reason succeeds
      const revRes = await matcher.reverseMatch(accountantCtx, {
        matchId: matchRes.match.id,
        reason: 'Bank notified chargeback on transaction ref',
      });

      expect(revRes.match.status).toBe('REVERSED');
      expect(revRes.statementLineStatus).toBe('UNMATCHED');

      // Confirm history is preserved in database
      const dbMatch = await prisma.reconciliationMatch.findUniqueOrThrow({
        where: { id: matchRes.match.id },
      });
      expect(dbMatch.status).toBe('REVERSED');
      expect(dbMatch.reason).toContain('chargeback');

      // Reversed match is excluded from active line allocations
      const dbLine = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
      expect(dbLine.reconciliationStatus).toBe('UNMATCHED');
    });
  });

  // ============================================================================
  // 4. OVER-ALLOCATION SAFEGUARDS
  // ============================================================================
  describe('Over-Allocation Invariants', () => {
    it('rejects allocation exceeding remaining statement line amount', async () => {
      const { payments: p1 } = await createInvoiceWithPayments({
        customerName: 'Overflow Customer 1',
        payments: [{ paymentMethod: 'CARD', amount: '40000.00' }],
      });
      const { payments: p2 } = await createInvoiceWithPayments({
        customerName: 'Overflow Customer 2',
        payments: [{ paymentMethod: 'CARD', amount: '30000.00' }],
      });

      // Statement line is only ₹50,000.00
      const line = await createStatementLine({ amount: '50000.00', lineType: 'CREDIT' });

      // First allocate ₹40,000 (leaves ₹10,000 remaining on line)
      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: p1[0].id,
        matchedAmount: '40000.00',
      });

      // Attempting to allocate ₹30,000 must fail (40k + 30k = 70k > 50k)
      await expect(
        matcher.createAndConfirmMatch(accountantCtx, {
          statementLineId: line.id,
          paymentId: p2[0].id,
          matchedAmount: '30000.00',
        })
      ).rejects.toThrow(MatchAllocationError);

      // Verify line confirmed amount is still exactly ₹40,000
      const confirmedMatches = await prisma.reconciliationMatch.findMany({
        where: { statementLineId: line.id, status: 'CONFIRMED' },
      });
      expect(confirmedMatches).toHaveLength(1);
      expect(confirmedMatches[0].matchedAmount.toString()).toBe('40000');
    });

    it('rejects allocation exceeding remaining customer payment amount', async () => {
      // Payment is only ₹30,000.00
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Payment Overflow Customer',
        payments: [{ paymentMethod: 'UPI', amount: '30000.00' }],
      });
      const paymentId = payments[0].id;

      const line1 = await createStatementLine({ amount: '25000.00', lineType: 'CREDIT' });
      const line2 = await createStatementLine({ amount: '15000.00', lineType: 'CREDIT' });

      // First allocate ₹25,000 (leaves ₹5,000 remaining on payment)
      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line1.id,
        paymentId,
        matchedAmount: '25000.00',
      });

      // Attempting to allocate ₹10,000 from line2 to payment must fail (25k + 10k = 35k > 30k)
      await expect(
        matcher.createAndConfirmMatch(accountantCtx, {
          statementLineId: line2.id,
          paymentId,
          matchedAmount: '10000.00',
        })
      ).rejects.toThrow(MatchAllocationError);
    });
  });

  // ============================================================================
  // 5. CONCURRENCY RACE CONDITION SAFEGUARDS
  // ============================================================================
  describe('Concurrency Race Condition Protection', () => {
    it('prevents concurrent race from over-allocating a statement line', async () => {
      // Statement line: ₹50,000.00
      const line = await createStatementLine({ amount: '50000.00', lineType: 'CREDIT' });

      // Two separate payments of ₹35,000 each (Total = ₹70,000 > ₹50,000)
      const { payments: pA } = await createInvoiceWithPayments({
        customerName: 'Race Customer A',
        payments: [{ paymentMethod: 'CARD', amount: '35000.00' }],
      });
      const { payments: pB } = await createInvoiceWithPayments({
        customerName: 'Race Customer B',
        payments: [{ paymentMethod: 'CARD', amount: '35000.00' }],
      });

      // Fire both confirmation attempts simultaneously
      const results = await Promise.allSettled([
        matcher.createAndConfirmMatch(accountantCtx, {
          statementLineId: line.id,
          paymentId: pA[0].id,
          matchedAmount: '35000.00',
        }),
        matcher.createAndConfirmMatch(accountantCtx, {
          statementLineId: line.id,
          paymentId: pB[0].id,
          matchedAmount: '35000.00',
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly ONE must succeed and ONE must fail due to lock & recalculation
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Verify database state: total confirmed is ₹35,000, NOT ₹70,000
      const matches = await prisma.reconciliationMatch.findMany({
        where: { statementLineId: line.id, status: 'CONFIRMED' },
      });
      expect(matches).toHaveLength(1);
      expect(matches[0].matchedAmount.toString()).toBe('35000');

      const dbLine = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
      expect(dbLine.reconciliationStatus).toBe('PARTIALLY_MATCHED');
    });

    it('prevents concurrent race from over-allocating a customer payment', async () => {
      // Payment: ₹40,000.00
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Race Payment Customer',
        payments: [{ paymentMethod: 'UPI', amount: '40000.00' }],
      });
      const paymentId = payments[0].id;

      // Two statement lines of ₹25,000 each (Total = ₹50,000 > ₹40,000)
      const lineA = await createStatementLine({ amount: '25000.00', lineType: 'CREDIT' });
      const lineB = await createStatementLine({ amount: '25000.00', lineType: 'CREDIT' });

      // Fire both confirmation attempts simultaneously
      const results = await Promise.allSettled([
        matcher.createAndConfirmMatch(accountantCtx, {
          statementLineId: lineA.id,
          paymentId,
          matchedAmount: '25000.00',
        }),
        matcher.createAndConfirmMatch(accountantCtx, {
          statementLineId: lineB.id,
          paymentId,
          matchedAmount: '25000.00',
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly ONE must succeed and ONE must fail
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const matches = await prisma.reconciliationMatch.findMany({
        where: { paymentId, status: 'CONFIRMED' },
      });
      expect(matches).toHaveLength(1);
      expect(matches[0].matchedAmount.toString()).toBe('25000');
    });
  });

  // ============================================================================
  // 6. SECURITY, TENANT ISOLATION & RBAC
  // ============================================================================
  describe('Security, Tenant Isolation & RBAC', () => {
    it('denies SALES_STAFF role from matching operations', async () => {
      const line = await createStatementLine({ amount: '10000.00', lineType: 'CREDIT' });

      await expect(
        matcher.findCandidateMatches(salesCtx, line.id)
      ).rejects.toThrow(AuthorizationError);

      await expect(
        matcher.createAndConfirmMatch(salesCtx, {
          statementLineId: line.id,
          paymentId: 'dummy-id',
          matchedAmount: '10000.00',
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it('rejects cross-tenant statement line matching attempts', async () => {
      // Create statement line in Kalyan Org
      const kalyanImport = await prisma.bankStatementImport.create({
        data: {
          organizationId: kalyanOrg.id,
          bankAccountId: kalyanAccountId,
          sourceType: 'BANK_STATEMENT',
          fileFormat: 'GENERIC_CSV',
          fileName: 'kalyan_stmt.csv',
          fileHash: `sha256-kalyan-${Date.now()}`,
          status: 'PROCESSED',
          totalLinesCount: 0,
        },
      });
      createdImportIds.push(kalyanImport.id);

      const kalyanLine = await prisma.bankStatementLine.create({
        data: {
          organizationId: kalyanOrg.id,
          importId: kalyanImport.id,
          bankAccountId: kalyanAccountId,
          lineNumber: 1,
          transactionDate: new Date(),
          description: 'Kalyan Org Deposit',
          lineType: 'CREDIT',
          amount: '50000.00',
          reconciliationStatus: 'UNMATCHED',
        },
      });
      createdStatementLineIds.push(kalyanLine.id);

      // Suvarna accountant attempts to find candidates or match Kalyan's line
      await expect(
        matcher.findCandidateMatches(accountantCtx, kalyanLine.id)
      ).rejects.toThrow(MatchNotFoundError);

      const { payments } = await createInvoiceWithPayments({
        customerName: 'Suvarna Customer',
        payments: [{ paymentMethod: 'UPI', amount: '50000.00' }],
      });

      await expect(
        matcher.createAndConfirmMatch(accountantCtx, {
          statementLineId: kalyanLine.id,
          paymentId: payments[0].id,
          matchedAmount: '50000.00',
        })
      ).rejects.toThrow(MatchNotFoundError);
    });
  });

  // ============================================================================
  // 7. DISCREPANCY & IGNORE STATUS MANAGEMENT
  // ============================================================================
  describe('Discrepancy and Ignore Status Management', () => {
    it('marks a statement line as DISCREPANT with reason and audit log', async () => {
      const line = await createStatementLine({ amount: '12000.00', lineType: 'CREDIT' });

      const updated = await matcher.markLineDiscrepant(accountantCtx, {
        statementLineId: line.id,
        reason: 'Payment amount received does not match customer invoice quotation',
      });

      expect(updated.reconciliationStatus).toBe('DISCREPANT');

      const audit = await prisma.auditLog.findFirst({
        where: {
          entityType: 'BankStatementLine',
          entityId: line.id,
          organizationId: suvarnaOrg.id,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.action).toBe('UPDATE');
      expect((audit?.changedFields as any)?.reconciliationStatus).toBe('DISCREPANT');
    });

    it('marks a statement line as IGNORED with reason and audit log', async () => {
      const line = await createStatementLine({
        amount: '500.00',
        lineType: 'DEBIT',
        description: 'Bank Annual Folio Maintenance Charge',
      });

      const updated = await matcher.ignoreStatementLine(accountantCtx, {
        statementLineId: line.id,
        reason: 'Non-customer bank folio fee, accounted in monthly expense journal',
      });

      expect(updated.reconciliationStatus).toBe('IGNORED');

      const audit = await prisma.auditLog.findFirst({
        where: {
          entityType: 'BankStatementLine',
          entityId: line.id,
          organizationId: suvarnaOrg.id,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.action).toBe('UPDATE');
      expect((audit?.changedFields as any)?.reconciliationStatus).toBe('IGNORED');
    });
  });

  // ============================================================================
  // 8. STRICT SUBSYSTEM ISOLATION (ACCOUNTING BOUNDARIES)
  // ============================================================================
  describe('Strict Subsystem Isolation', () => {
    it('does not create or modify any journal entries, invoices, or stock movements', async () => {
      const jeCountBefore = await prisma.journalEntry.count({ where: { organizationId: suvarnaOrg.id } });
      const jlCountBefore = await prisma.journalLine.count({ where: { organizationId: suvarnaOrg.id } });
      const smCountBefore = await prisma.stockMovement.count({ where: { organizationId: suvarnaOrg.id } });

      const { payments } = await createInvoiceWithPayments({
        customerName: 'Isolation Customer',
        payments: [{ paymentMethod: 'UPI', amount: '15000.00' }],
      });
      const line = await createStatementLine({ amount: '15000.00', lineType: 'CREDIT' });

      // Match and confirm
      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '15000.00',
      });

      const jeCountAfter = await prisma.journalEntry.count({ where: { organizationId: suvarnaOrg.id } });
      const jlCountAfter = await prisma.journalLine.count({ where: { organizationId: suvarnaOrg.id } });
      const smCountAfter = await prisma.stockMovement.count({ where: { organizationId: suvarnaOrg.id } });

      // Matching engine must never touch the General Ledger or Inventory
      expect(jeCountAfter).toBe(jeCountBefore);
      expect(jlCountAfter).toBe(jlCountBefore);
      expect(smCountAfter).toBe(smCountBefore);
    });
  });

  // ============================================================================
  // 9. SETTLED RECORD INVARIANT PROTECTIONS
  // ============================================================================
  describe('Settled Record Invariant Protections', () => {
    it('rejects rematching, proposing, ignoring, or marking discrepant on a SETTLED statement line', async () => {
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Settled Protection Customer',
        payments: [{ paymentMethod: 'UPI', amount: '20000.00' }],
      });

      const line = await createStatementLine({ amount: '20000.00', lineType: 'CREDIT' });

      // Confirm match
      const { match } = await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '20000.00',
      });

      // Simulate settlement state (SETTLED)
      await prisma.bankStatementLine.update({
        where: { id: line.id },
        data: {
          reconciliationStatus: 'SETTLED',
          settledAt: new Date(),
        },
      });
      await prisma.reconciliationMatch.update({
        where: { id: match.id },
        data: {
          status: 'SETTLED',
          settledAt: new Date(),
        },
      });

      // 1. Rematching via createAndConfirmMatch must be REJECTED
      await expect(
        matcher.createAndConfirmMatch(accountantCtx, {
          statementLineId: line.id,
          paymentId: payments[0].id,
          matchedAmount: '20000.00',
        })
      ).rejects.toThrow(MatchValidationError);

      // 2. Proposing match via createProposedMatch must be REJECTED
      await expect(
        matcher.createProposedMatch(accountantCtx, {
          statementLineId: line.id,
          paymentId: payments[0].id,
          matchedAmount: '20000.00',
        })
      ).rejects.toThrow(MatchValidationError);

      // 3. Reversing settled match via reverseMatch must be REJECTED
      await expect(
        matcher.reverseMatch(accountantCtx, {
          matchId: match.id,
          reason: 'Attempt unauthorized match reversal on settled transaction',
        })
      ).rejects.toThrow(MatchValidationError);

      // 4. Marking discrepant on settled line must be REJECTED
      await expect(
        matcher.markLineDiscrepant(accountantCtx, {
          statementLineId: line.id,
          reason: 'Attempt mark discrepant on settled line',
        })
      ).rejects.toThrow(MatchValidationError);

      // 5. Ignoring settled line must be REJECTED
      await expect(
        matcher.ignoreStatementLine(accountantCtx, {
          statementLineId: line.id,
          reason: 'Attempt ignore settled line',
        })
      ).rejects.toThrow(MatchValidationError);

      // 6. Finding candidate matches on settled line returns empty array
      const candidates = await matcher.findCandidateMatches(accountantCtx, line.id);
      expect(candidates).toHaveLength(0);

      // Verify line status is intact
      const dbLine = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
      expect(dbLine.reconciliationStatus).toBe('SETTLED');
    });
  });
});
