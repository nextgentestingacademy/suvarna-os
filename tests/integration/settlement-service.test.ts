import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Organization, Branch, User } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { SecurityContext, AuthorizationError } from '@/types/security';
import {
  SettlementService,
  SettlementValidationError,
  SettlementConflictError,
  SettlementDiscrepancyError,
  SettlementSecurityError,
  ReconciliationMatcher,
  MatchValidationError,
} from '@/lib/reconciliation';
import { BankAccountService } from '@/lib/bank-accounts';
import { LedgerService } from '@/lib/ledger';

const prisma = new PrismaClient();
const settlementService = new SettlementService({ prisma });
const matcher = new ReconciliationMatcher({ prisma });
const bankAccountService = new BankAccountService({ prisma });
const ledgerService = new LedgerService({ prisma });

describe('Suvarna Milestone 4D-4 — Settlement Journal Posting Integration Tests', () => {
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
  let fortOnlyAccountantCtx: SecurityContext;
  let kalyanOwnerCtx: SecurityContext;

  let suvarnaAccountId: string;
  let suvarnaVashiAccountId: string;
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

  // Helper to create synthetic invoice with specific payment rows
  async function createInvoiceWithPayments(params: {
    customerName: string;
    branchId?: string;
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

    const branchId = params.branchId ?? fortBranch.id;

    const inv = await prisma.invoice.create({
      data: {
        organizationId: suvarnaOrg.id,
        branchId,
        invoiceNumber: `INV-SETTLE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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
        description: params.description ?? 'Test Settlement Bank Transaction',
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

    fortOnlyAccountantCtx = {
      userId: accountantUser.id,
      userEmail: accountantUser.email,
      tenantId: suvarnaOrg.id,
      tenantSlug: suvarnaOrg.slug,
      membershipId: 'mem-acct-suvarna-fort-only',
      role: 'ACCOUNTANT',
      activeBranchId: fortBranch.id,
      allowedBranchIds: [fortBranch.id],
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

    // Ensure billing ledger accounts exist (including 1040, 1045, 5110)
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
      accountName: `HDFC Settlement Test - ${Date.now()}`,
      bankName: 'HDFC Bank',
      accountNumberMasked: '******990011',
      ifscCode: 'HDFC0000001',
      accountType: 'CURRENT',
      ledgerAccountId: suvarnaLedger1040.id,
    });
    suvarnaAccountId = suvarnaAcc.id;
    createdBankAccountIds.push(suvarnaAcc.id);

    const suvarnaVashiAcc = await bankAccountService.createBankAccount(ownerCtx, {
      accountName: `ICICI Vashi Settlement Test - ${Date.now()}`,
      bankName: 'ICICI Bank',
      accountNumberMasked: '******992233',
      ifscCode: 'ICIC0000002',
      accountType: 'CURRENT',
      branchId: vashiBranch.id,
      ledgerAccountId: suvarnaLedger1040.id,
    });
    suvarnaVashiAccountId = suvarnaVashiAcc.id;
    createdBankAccountIds.push(suvarnaVashiAcc.id);

    const kalyanAcc = await bankAccountService.createBankAccount(kalyanOwnerCtx, {
      accountName: `SBI Kalyan Settlement Test - ${Date.now()}`,
      bankName: 'State Bank of India',
      accountNumberMasked: '******994455',
      ifscCode: 'SBIN0000004',
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
        fileName: 'test_settlement_batch.csv',
        fileHash: `sha256-settlement-test-${Date.now()}`,
        status: 'PROCESSED',
        totalLinesCount: 0,
        importedByUserId: ownerUser.id,
      },
    });
    testImportId = importHeader.id;
    createdImportIds.push(importHeader.id);
  });

  afterAll(async () => {
    // 1. Clean up settlement journal links first to satisfy ON DELETE RESTRICT
    await prisma.reconciliationMatch.updateMany({
      where: { organizationId: { in: [suvarnaOrg.id, kalyanOrg.id] } },
      data: { settlementJournalId: null },
    });
    await prisma.bankStatementLine.updateMany({
      where: { organizationId: { in: [suvarnaOrg.id, kalyanOrg.id] } },
      data: { settlementJournalId: null },
    });

    // 2. Clean up journal lines and journal entries created for settlements
    const settlementJournals = await prisma.journalEntry.findMany({
      where: {
        organizationId: { in: [suvarnaOrg.id, kalyanOrg.id] },
        sourceType: { in: ['SETTLEMENT', 'REVERSAL'] },
      },
      select: { id: true },
    });
    const sJIds = settlementJournals.map((j) => j.id);
    if (sJIds.length > 0) {
      await prisma.journalLine.deleteMany({ where: { journalEntryId: { in: sJIds } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: sJIds } } });
    }

    // 3. Clean up matches
    await prisma.reconciliationMatch.deleteMany({
      where: { organizationId: suvarnaOrg.id, statementLineId: { in: createdStatementLineIds } },
    });

    // 4. Clean up statement lines and imports
    if (createdStatementLineIds.length > 0) {
      await prisma.bankStatementLine.deleteMany({
        where: { id: { in: createdStatementLineIds } },
      });
    }
    if (createdImportIds.length > 0) {
      await prisma.bankStatementImport.deleteMany({
        where: { id: { in: createdImportIds } },
      });
    }

    // 5. Clean up payments & invoices
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

    // 6. Clean up customers
    if (createdCustomerIds.length > 0) {
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }

    // 7. Clean up bank accounts
    if (createdBankAccountIds.length > 0) {
      await prisma.bankAccount.deleteMany({
        where: { id: { in: createdBankAccountIds } },
      });
    }

    await prisma.$disconnect();
  });

  // ============================================================================
  // 1. FULL SETTLEMENT WITHOUT FEES (BANK TRANSFER & UPI)
  // ============================================================================
  describe('Full Settlement Without Fees', () => {
    it('posts balanced settlement journal for bank transfer (1040 Dr, 1045 Cr)', async () => {
      // 1. Customer paid ₹75,000 via BANK_TRANSFER at checkout
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Ananya Deshmukh',
        payments: [{ paymentMethod: 'BANK_TRANSFER', amount: '75000.00', transactionRef: 'NEFT-ANANYA-75K' }],
      });

      // 2. Bank statement line received for ₹75,000
      const line = await createStatementLine({
        amount: '75000.00',
        lineType: 'CREDIT',
        referenceNumber: 'NEFT-ANANYA-75K',
      });

      // 3. Confirm reconciliation match
      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '75000.00',
        matchType: 'EXACT_REF_AND_AMOUNT',
      });

      // 4. Post settlement journal entry
      const result = await settlementService.postSettlementJournal(accountantCtx, {
        statementLineId: line.id,
      });

      expect(result.status).toBe('SETTLED');
      expect(result.netDepositAmount.toFixed(2)).toBe('75000.00');
      expect(result.grossClearedAmount.toFixed(2)).toBe('75000.00');
      expect(result.feeAmount.toFixed(2)).toBe('0.00');
      expect(result.journalEntry.entryNumber).toBeDefined();

      // Verify double-entry balance
      expect(result.journalEntry.totalDebit.toString()).toBe('75000');
      expect(result.journalEntry.totalCredit.toString()).toBe('75000');

      // Verify exact accounts
      const debitLine = result.journalEntry.lines.find((l) => new Decimal(l.debitAmount.toString()).gt(0));
      const creditLine = result.journalEntry.lines.find((l) => new Decimal(l.creditAmount.toString()).gt(0));

      expect(debitLine?.account.code).toBe('1040'); // Business Bank Account
      expect(debitLine?.debitAmount.toString()).toBe('75000');
      expect(creditLine?.account.code).toBe('1045'); // Bank Transfer Inward Clearing
      expect(creditLine?.creditAmount.toString()).toBe('75000');

      // Verify BankStatementLine status updated to SETTLED
      const dbLine = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
      expect(dbLine.reconciliationStatus).toBe('SETTLED');
      expect(dbLine.settlementJournalId).toBe(result.journalEntry.id);
      expect(dbLine.settledAt).toBeDefined();

      // Verify ReconciliationMatch status updated to SETTLED
      const dbMatch = await prisma.reconciliationMatch.findFirstOrThrow({
        where: { statementLineId: line.id },
      });
      expect(dbMatch.status).toBe('SETTLED');
      expect(dbMatch.settlementJournalId).toBe(result.journalEntry.id);
    });

    it('posts balanced settlement journal for UPI collection (1040 Dr, 1020 Cr)', async () => {
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Vikram Sengupta',
        payments: [{ paymentMethod: 'UPI', amount: '25000.00', transactionRef: 'UPI-VIKRAM-25K' }],
      });

      const line = await createStatementLine({
        amount: '25000.00',
        lineType: 'CREDIT',
        referenceNumber: 'UPI-VIKRAM-25K',
      });

      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '25000.00',
      });

      const result = await settlementService.postSettlementJournal(accountantCtx, {
        statementLineId: line.id,
      });

      expect(result.status).toBe('SETTLED');
      const debitLine = result.journalEntry.lines.find((l) => new Decimal(l.debitAmount.toString()).gt(0));
      const creditLine = result.journalEntry.lines.find((l) => new Decimal(l.creditAmount.toString()).gt(0));

      expect(debitLine?.account.code).toBe('1040');
      expect(creditLine?.account.code).toBe('1020'); // UPI Clearing
      expect(creditLine?.creditAmount.toString()).toBe('25000');
    });
  });

  // ============================================================================
  // 2. SETTLEMENT WITH EXPLICIT PROCESSING FEE (MDR)
  // ============================================================================
  describe('Settlement With Explicit Processing Fee (MDR)', () => {
    it('posts three-legged journal (1040 Dr Net, 5110 Dr Fee, 1030 Cr Gross)', async () => {
      // Customer paid ₹50,000 via CARD at checkout (1030 Card Clearing was debited for ₹50,000)
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Cardholder Kapoor',
        payments: [{ paymentMethod: 'CARD', amount: '50000.00', transactionRef: 'AUTH-CARD-50K' }],
      });

      // Bank deposited ₹49,000 net after ₹1,000 MDR deduction (2% fee)
      const line = await createStatementLine({
        amount: '49000.00',
        lineType: 'CREDIT',
        referenceNumber: 'AUTH-CARD-50K',
      });

      // Match confirmed for the gross customer payment amount of ₹50,000 with fee of ₹1,000
      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '50000.00',
        feeAmount: '1000.00',
      });

      // Post settlement with explicit fee of ₹1,000
      const result = await settlementService.postSettlementJournal(accountantCtx, {
        statementLineId: line.id,
        feeAmount: '1000.00',
      });

      expect(result.status).toBe('SETTLED');
      expect(result.netDepositAmount.toFixed(2)).toBe('49000.00');
      expect(result.feeAmount.toFixed(2)).toBe('1000.00');
      expect(result.grossClearedAmount.toFixed(2)).toBe('50000.00');

      // Verify exact double-entry balance: 49,000 + 1,000 = 50,000
      expect(result.journalEntry.totalDebit.toString()).toBe('50000');
      expect(result.journalEntry.totalCredit.toString()).toBe('50000');

      const bankDebit = result.journalEntry.lines.find((l) => l.account.code === '1040');
      const feeDebit = result.journalEntry.lines.find((l) => l.account.code === '5110');
      const cardCredit = result.journalEntry.lines.find((l) => l.account.code === '1030');

      expect(bankDebit?.debitAmount.toString()).toBe('49000');
      expect(feeDebit?.debitAmount.toString()).toBe('1000');
      expect(cardCredit?.creditAmount.toString()).toBe('50000');

      // Verify BankStatementLine records feeAmount exactly once
      const dbLine = await prisma.bankStatementLine.findUniqueOrThrow({
        where: { id: line.id },
      });
      expect(dbLine.feeAmount?.toString()).toBe('1000');
      expect(dbLine.reconciliationStatus).toBe('SETTLED');

      // Verify ReconciliationMatch does not duplicate feeAmount
      const dbMatch = await prisma.reconciliationMatch.findFirstOrThrow({
        where: { statementLineId: line.id },
      });
      expect(dbMatch.feeAmount).toBeNull();
      expect(dbMatch.status).toBe('SETTLED');
    });

    it('posts balanced journals for a two-payment batch with gross ₹50,000, net deposit ₹49,000 and explicit fee ₹1,000', async () => {
      // Customer 1 pays ₹20,000 via CARD
      const { payments: p1 } = await createInvoiceWithPayments({
        customerName: 'Batch Customer 1',
        payments: [{ paymentMethod: 'CARD', amount: '20000.00', transactionRef: 'BATCH-CARD-20K' }],
      });
      // Customer 2 pays ₹30,000 via CARD
      const { payments: p2 } = await createInvoiceWithPayments({
        customerName: 'Batch Customer 2',
        payments: [{ paymentMethod: 'CARD', amount: '30000.00', transactionRef: 'BATCH-CARD-30K' }],
      });

      // Bank deposits ₹49,000 net after ₹1,000 MDR batch deduction
      const line = await createStatementLine({
        amount: '49000.00',
        lineType: 'CREDIT',
        description: 'Batch Card Settlement POS-EDC',
      });

      // Match Payment 1 for ₹20,000
      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: p1[0].id,
        matchedAmount: '20000.00',
        feeAmount: '1000.00',
      });

      // Match Payment 2 for ₹30,000 (total gross allocations = ₹50,000, equals line capacity 49k + 1k)
      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: p2[0].id,
        matchedAmount: '30000.00',
      });

      // Verify line is in MATCHED status
      const lineBeforeSettle = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
      expect(lineBeforeSettle.reconciliationStatus).toBe('MATCHED');

      // Settle batch
      const result = await settlementService.postSettlementJournal(accountantCtx, {
        statementLineId: line.id,
        feeAmount: '1000.00',
      });

      expect(result.status).toBe('SETTLED');
      expect(result.matchesSettledCount).toBe(2);
      expect(result.netDepositAmount.toFixed(2)).toBe('49000.00');
      expect(result.feeAmount.toFixed(2)).toBe('1000.00');
      expect(result.grossClearedAmount.toFixed(2)).toBe('50000.00');

      // Double-entry validation: Debits (49k + 1k) = Credits (50k)
      expect(result.journalEntry.totalDebit.toString()).toBe('50000');
      expect(result.journalEntry.totalCredit.toString()).toBe('50000');

      // Verify fee is recorded on BankStatementLine, NOT duplicated on matches
      const dbLine = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
      expect(dbLine.feeAmount?.toString()).toBe('1000');
      expect(dbLine.settlementJournalId).toBe(result.journalEntry.id);

      const dbMatches = await prisma.reconciliationMatch.findMany({ where: { statementLineId: line.id } });
      expect(dbMatches).toHaveLength(2);
      for (const m of dbMatches) {
        expect(m.status).toBe('SETTLED');
        expect(m.feeAmount).toBeNull(); // fee is stored once at line level!
      }
    });

    it('correctly settles each installment of a split payment across two statement lines with fee treatment per settlement', async () => {
      // Single customer payment of ₹100,000 via CARD
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Split Payment Customer',
        payments: [{ paymentMethod: 'CARD', amount: '100000.00', transactionRef: 'SPLIT-CARD-100K' }],
      });

      // Line 1: ₹50,000 net deposit (no fee)
      const line1 = await createStatementLine({ amount: '50000.00', lineType: 'CREDIT' });
      // Line 2: ₹49,500 net deposit (₹500 fee)
      const line2 = await createStatementLine({ amount: '49500.00', lineType: 'CREDIT' });

      // Match installment 1: ₹50,000 to Line 1
      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line1.id,
        paymentId: payments[0].id,
        matchedAmount: '50000.00',
      });

      // Match installment 2: ₹50,000 to Line 2 with fee ₹500
      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line2.id,
        paymentId: payments[0].id,
        matchedAmount: '50000.00',
        feeAmount: '500.00',
      });

      // Settle Line 1 (₹50,000 deposit, ₹0 fee)
      const res1 = await settlementService.postSettlementJournal(accountantCtx, {
        statementLineId: line1.id,
      });
      expect(res1.status).toBe('SETTLED');
      expect(res1.netDepositAmount.toFixed(2)).toBe('50000.00');
      expect(res1.grossClearedAmount.toFixed(2)).toBe('50000.00');
      expect(res1.feeAmount.toFixed(2)).toBe('0.00');
      expect(res1.journalEntry.totalDebit.toString()).toBe('50000');
      expect(res1.journalEntry.totalCredit.toString()).toBe('50000');

      // Settle Line 2 (₹49,500 deposit, ₹500 fee)
      const res2 = await settlementService.postSettlementJournal(accountantCtx, {
        statementLineId: line2.id,
        feeAmount: '500.00',
      });
      expect(res2.status).toBe('SETTLED');
      expect(res2.netDepositAmount.toFixed(2)).toBe('49500.00');
      expect(res2.grossClearedAmount.toFixed(2)).toBe('50000.00');
      expect(res2.feeAmount.toFixed(2)).toBe('500.00');
      expect(res2.journalEntry.totalDebit.toString()).toBe('50000');
      expect(res2.journalEntry.totalCredit.toString()).toBe('50000');
    });

    it('correctly handles multi-tender batch with different clearing accounts (UPI + Card)', async () => {
      const { payments: pUpi } = await createInvoiceWithPayments({
        customerName: 'Multi Tender Customer 1',
        payments: [{ paymentMethod: 'UPI', amount: '20000.00' }],
      });
      const { payments: pCard } = await createInvoiceWithPayments({
        customerName: 'Multi Tender Customer 2',
        payments: [{ paymentMethod: 'CARD', amount: '30000.00' }],
      });

      const line = await createStatementLine({ amount: '50000.00', lineType: 'CREDIT' });

      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: pUpi[0].id,
        matchedAmount: '20000.00',
      });
      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: pCard[0].id,
        matchedAmount: '30000.00',
      });

      const result = await settlementService.postSettlementJournal(accountantCtx, {
        statementLineId: line.id,
      });
      expect(result.status).toBe('SETTLED');

      const upiCredit = result.journalEntry.lines.find((l) => l.account.code === '1020');
      const cardCredit = result.journalEntry.lines.find((l) => l.account.code === '1030');
      const bankDebit = result.journalEntry.lines.find((l) => l.account.code === '1040');

      expect(bankDebit?.debitAmount.toString()).toBe('50000');
      expect(upiCredit?.creditAmount.toString()).toBe('20000');
      expect(cardCredit?.creditAmount.toString()).toBe('30000');
    });
  });

  // ============================================================================
  // 3. UNEXPLAINED DISCREPANCY REJECTION
  // ============================================================================
  describe('Discrepancy Prevention & Integrity', () => {
    it('rejects settlement when net deposit + fee does not match gross clearing amount', async () => {
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Discrepancy Customer',
        payments: [{ paymentMethod: 'CARD', amount: '50000.00' }],
      });

      // Bank deposited ₹48,000 (discrepancy of ₹2,000)
      const line = await createStatementLine({ amount: '48000.00', lineType: 'CREDIT' });

      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '50000.00',
        feeAmount: '2000.00',
      });

      // Attempting to settle without fee leaves ₹2,000 unexplained discrepancy -> REJECTED
      await expect(
        settlementService.postSettlementJournal(accountantCtx, {
          statementLineId: line.id,
          feeAmount: '500.00', // only ₹500 fee, still ₹1,500 unexplained discrepancy!
        })
      ).rejects.toThrow(SettlementDiscrepancyError);

      try {
        await settlementService.postSettlementJournal(accountantCtx, {
          statementLineId: line.id,
          feeAmount: '500.00',
        });
      } catch (err: any) {
        expect(err).toBeInstanceOf(SettlementDiscrepancyError);
        expect(err.discrepancyDetails?.netDeposit.toFixed(2)).toBe('48000.00');
        expect(err.discrepancyDetails?.feeAmount.toFixed(2)).toBe('500.00');
        expect(err.discrepancyDetails?.grossCleared.toFixed(2)).toBe('50000.00');
        expect(err.discrepancyDetails?.variance.toFixed(2)).toBe('1500.00');
      }

      // Verify zero journal entries were posted and line status remains unchanged
      const dbLine = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
      expect(dbLine.reconciliationStatus).toBe('MATCHED');
      expect(dbLine.settlementJournalId).toBeNull();
    });

    it('explicitly rejects settlement of a PARTIALLY_MATCHED statement line', async () => {
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Partially Matched Customer',
        payments: [{ paymentMethod: 'UPI', amount: '50000.00' }],
      });

      const line = await createStatementLine({ amount: '50000.00', lineType: 'CREDIT' });

      // Partially match ₹30,000 out of ₹50,000
      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '30000.00',
      });

      const dbLineBefore = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
      expect(dbLineBefore.reconciliationStatus).toBe('PARTIALLY_MATCHED');

      // Attempt settlement -> MUST EXPLICITLY THROW SettlementValidationError
      await expect(
        settlementService.postSettlementJournal(accountantCtx, {
          statementLineId: line.id,
        })
      ).rejects.toThrow(SettlementValidationError);
    });

    it('rejects settlement for cash payments', async () => {
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Cash Customer',
        payments: [{ paymentMethod: 'CASH', amount: '10000.00' }],
      });

      const line = await createStatementLine({ amount: '10000.00', lineType: 'CREDIT' });

      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '10000.00',
      });

      await expect(
        settlementService.postSettlementJournal(accountantCtx, {
          statementLineId: line.id,
        })
      ).rejects.toThrow(SettlementValidationError);
    });
  });

  // ============================================================================
  // 4. INVALID MATCH & LINE STATUS REJECTION
  // ============================================================================
  describe('Line & Match Status Safeguards', () => {
    it('rejects settlement of an UNMATCHED statement line', async () => {
      const line = await createStatementLine({ amount: '30000.00', lineType: 'CREDIT' });

      await expect(
        settlementService.postSettlementJournal(accountantCtx, { statementLineId: line.id })
      ).rejects.toThrow(SettlementValidationError);
    });

    it('rejects settlement of a DISCREPANT statement line', async () => {
      const line = await createStatementLine({ amount: '30000.00', lineType: 'CREDIT' });
      await matcher.markLineDiscrepant(accountantCtx, {
        statementLineId: line.id,
        reason: 'Unresolved payment amount mismatch',
      });

      await expect(
        settlementService.postSettlementJournal(accountantCtx, { statementLineId: line.id })
      ).rejects.toThrow(SettlementValidationError);
    });

    it('rejects settlement of an IGNORED statement line', async () => {
      const line = await createStatementLine({ amount: '100.00', lineType: 'DEBIT' });
      await matcher.ignoreStatementLine(accountantCtx, {
        statementLineId: line.id,
        reason: 'Bank annual SMS charges',
      });

      await expect(
        settlementService.postSettlementJournal(accountantCtx, { statementLineId: line.id })
      ).rejects.toThrow(SettlementValidationError);
    });

    it('rejects settlement when match is only PROPOSED (not confirmed)', async () => {
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Proposed Match Customer',
        payments: [{ paymentMethod: 'UPI', amount: '20000.00' }],
      });
      const line = await createStatementLine({ amount: '20000.00', lineType: 'CREDIT' });

      // Create proposed match only
      await matcher.createProposedMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '20000.00',
      });

      await expect(
        settlementService.postSettlementJournal(accountantCtx, { statementLineId: line.id })
      ).rejects.toThrow(SettlementValidationError);
    });

    it('rejects settlement when match was REVERSED', async () => {
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Reversed Match Customer',
        payments: [{ paymentMethod: 'UPI', amount: '18000.00' }],
      });
      const line = await createStatementLine({ amount: '18000.00', lineType: 'CREDIT' });

      const matchRes = await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '18000.00',
      });

      await matcher.reverseMatch(accountantCtx, {
        matchId: matchRes.match.id,
        reason: 'Payment chargeback notice received',
      });

      await expect(
        settlementService.postSettlementJournal(accountantCtx, { statementLineId: line.id })
      ).rejects.toThrow(SettlementValidationError);
    });
  });

  // ============================================================================
  // 5. DUPLICATE AND CONCURRENT POSTING PROTECTION
  // ============================================================================
  describe('Duplicate & Concurrency Protection', () => {
    it('rejects duplicate settlement attempt on already settled line', async () => {
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Duplicate Test Customer',
        payments: [{ paymentMethod: 'UPI', amount: '32000.00' }],
      });
      const line = await createStatementLine({ amount: '32000.00', lineType: 'CREDIT' });

      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '32000.00',
      });

      // First settlement succeeds
      const firstResult = await settlementService.postSettlementJournal(accountantCtx, {
        statementLineId: line.id,
      });
      expect(firstResult.status).toBe('SETTLED');

      // Second settlement attempt must throw SettlementConflictError
      await expect(
        settlementService.postSettlementJournal(accountantCtx, {
          statementLineId: line.id,
        })
      ).rejects.toThrow(SettlementConflictError);
    });

    it('protects against simultaneous concurrent settlement posting attempts', async () => {
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Concurrent Settlement Customer',
        payments: [{ paymentMethod: 'UPI', amount: '40000.00' }],
      });
      const line = await createStatementLine({ amount: '40000.00', lineType: 'CREDIT' });

      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '40000.00',
      });

      // Fire 2 simultaneous settlement requests
      const results = await Promise.allSettled([
        settlementService.postSettlementJournal(accountantCtx, { statementLineId: line.id }),
        settlementService.postSettlementJournal(accountantCtx, { statementLineId: line.id }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly ONE must succeed and ONE must fail
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Verify only ONE journal entry exists for this settlement
      const entries = await prisma.journalEntry.findMany({
        where: {
          organizationId: suvarnaOrg.id,
          sourceType: 'SETTLEMENT',
          sourceId: line.id,
        },
      });
      expect(entries).toHaveLength(1);
    });
  });

  // ============================================================================
  // 6. SETTLEMENT REVERSAL WORKFLOW
  // ============================================================================
  describe('Settlement Reversal Workflow', () => {
    it('reverses a posted settlement with an auditable balancing entry and rolls back line status', async () => {
      const { payments } = await createInvoiceWithPayments({
        customerName: 'Settlement Reversal Customer',
        payments: [{ paymentMethod: 'BANK_TRANSFER', amount: '60000.00' }],
      });
      const line = await createStatementLine({ amount: '60000.00', lineType: 'CREDIT' });

      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '60000.00',
      });

      const settleRes = await settlementService.postSettlementJournal(accountantCtx, {
        statementLineId: line.id,
      });

      // Reversal without reason fails
      await expect(
        settlementService.reverseSettlementJournal(accountantCtx, {
          statementLineId: line.id,
          reason: '',
        })
      ).rejects.toThrow(SettlementValidationError);

      // Reversal with valid reason succeeds
      const revRes = await settlementService.reverseSettlementJournal(accountantCtx, {
        statementLineId: line.id,
        reason: 'Bank debited back incorrect settlement deposit due to incorrect IFSC routing',
      });

      expect(revRes.status).toBe('MATCHED');
      expect(revRes.reversalEntry.reversalOfId).toBe(settleRes.journalEntry.id);
      expect(revRes.reversalEntry.totalDebit.toString()).toBe('60000');
      expect(revRes.reversalEntry.totalCredit.toString()).toBe('60000');

      // Verify line status rolled back to MATCHED
      const dbLine = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
      expect(dbLine.reconciliationStatus).toBe('MATCHED');
      expect(dbLine.settlementJournalId).toBeNull();
      expect(dbLine.settledAt).toBeNull();

      // Verify match status rolled back to CONFIRMED
      const dbMatch = await prisma.reconciliationMatch.findFirstOrThrow({
        where: { statementLineId: line.id },
      });
      expect(dbMatch.status).toBe('CONFIRMED');
      expect(dbMatch.settlementJournalId).toBeNull();
    });

    it('allows permitted rematch and re-settlement after settlement reversal', async () => {
      const { payments: originalPayment } = await createInvoiceWithPayments({
        customerName: 'Original Match Customer',
        payments: [{ paymentMethod: 'UPI', amount: '25000.00' }],
      });
      const { payments: correctPayment } = await createInvoiceWithPayments({
        customerName: 'Correct Match Customer',
        payments: [{ paymentMethod: 'UPI', amount: '25000.00' }],
      });

      const line = await createStatementLine({ amount: '25000.00', lineType: 'CREDIT' });

      // Match to original (erroneous) payment and settle
      const match1 = await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: originalPayment[0].id,
        matchedAmount: '25000.00',
      });
      await settlementService.postSettlementJournal(accountantCtx, { statementLineId: line.id });

      // 1. Cannot rematch while settled
      await expect(
        matcher.createAndConfirmMatch(accountantCtx, {
          statementLineId: line.id,
          paymentId: correctPayment[0].id,
          matchedAmount: '25000.00',
        })
      ).rejects.toThrow(MatchValidationError);

      // 2. Reverse settlement
      await settlementService.reverseSettlementJournal(accountantCtx, {
        statementLineId: line.id,
        reason: 'Reversing settlement because wrong customer payment was matched',
      });

      // 3. Now line is MATCHED. Reverse erroneous match
      await matcher.reverseMatch(accountantCtx, {
        matchId: match1.match.id,
        reason: 'Unmatching wrong customer payment after settlement reversal',
      });

      // Verify line status is now UNMATCHED
      const lineAfterUnmatch = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
      expect(lineAfterUnmatch.reconciliationStatus).toBe('UNMATCHED');

      // 4. Rematch to the correct payment
      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: correctPayment[0].id,
        matchedAmount: '25000.00',
      });

      const lineAfterRematch = await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } });
      expect(lineAfterRematch.reconciliationStatus).toBe('MATCHED');

      // 5. Re-settle successfully
      const reSettleRes = await settlementService.postSettlementJournal(accountantCtx, {
        statementLineId: line.id,
      });
      expect(reSettleRes.status).toBe('SETTLED');
    });
  });

  // ============================================================================
  // 7. SECURITY & AUTHORIZATION
  // ============================================================================
  describe('Security & Authorization', () => {
    it('denies SALES_STAFF role from posting settlement journals', async () => {
      const line = await createStatementLine({ amount: '15000.00', lineType: 'CREDIT' });

      await expect(
        settlementService.postSettlementJournal(salesCtx, { statementLineId: line.id })
      ).rejects.toThrow(AuthorizationError);
    });

    it('rejects cross-tenant settlement posting', async () => {
      // Create line in Kalyan Org
      const kalyanImport = await prisma.bankStatementImport.create({
        data: {
          organizationId: kalyanOrg.id,
          bankAccountId: kalyanAccountId,
          sourceType: 'BANK_STATEMENT',
          fileFormat: 'GENERIC_CSV',
          fileName: 'kalyan_settle.csv',
          fileHash: `sha256-kalyan-settle-${Date.now()}`,
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
          description: 'Kalyan Bank Deposit',
          lineType: 'CREDIT',
          amount: '50000.00',
          reconciliationStatus: 'MATCHED',
        },
      });
      createdStatementLineIds.push(kalyanLine.id);

      // Suvarna accountant attempts to settle Kalyan's line -> REJECTED
      await expect(
        settlementService.postSettlementJournal(accountantCtx, { statementLineId: kalyanLine.id })
      ).rejects.toThrow(SettlementSecurityError);
    });

    it('enforces branch-scoping on branch-scoped bank accounts', async () => {
      // Bank account is in VASHI branch
      const line = await createStatementLine({
        amount: '20000.00',
        lineType: 'CREDIT',
        bankAccountId: suvarnaVashiAccountId,
      });

      // fortOnlyAccountantCtx is restricted to FORT branch only -> REJECTED
      await expect(
        settlementService.postSettlementJournal(fortOnlyAccountantCtx, { statementLineId: line.id })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  // ============================================================================
  // 8. STRICT SUBSYSTEM ISOLATION
  // ============================================================================
  describe('Strict Subsystem Isolation', () => {
    it('does not create or modify any invoices, customer payments, sales revenue, GST entries or stock movements', async () => {
      const invoiceCountBefore = await prisma.invoice.count({ where: { organizationId: suvarnaOrg.id } });
      const paymentCountBefore = await prisma.invoicePayment.count({ where: { organizationId: suvarnaOrg.id } });
      const stockMovementCountBefore = await prisma.stockMovement.count({ where: { organizationId: suvarnaOrg.id } });

      const { payments } = await createInvoiceWithPayments({
        customerName: 'Isolation Customer 4D4',
        payments: [{ paymentMethod: 'UPI', amount: '30000.00' }],
      });
      const line = await createStatementLine({ amount: '30000.00', lineType: 'CREDIT' });

      await matcher.createAndConfirmMatch(accountantCtx, {
        statementLineId: line.id,
        paymentId: payments[0].id,
        matchedAmount: '30000.00',
      });

      // Record count of invoices, payments, stock movements after setup
      const invCountAfterSetup = await prisma.invoice.count({ where: { organizationId: suvarnaOrg.id } });
      const payCountAfterSetup = await prisma.invoicePayment.count({ where: { organizationId: suvarnaOrg.id } });
      const smCountAfterSetup = await prisma.stockMovement.count({ where: { organizationId: suvarnaOrg.id } });

      // Post settlement
      const settleRes = await settlementService.postSettlementJournal(accountantCtx, {
        statementLineId: line.id,
      });
      expect(settleRes.status).toBe('SETTLED');

      // Post-settlement counts
      const invCountAfterSettle = await prisma.invoice.count({ where: { organizationId: suvarnaOrg.id } });
      const payCountAfterSettle = await prisma.invoicePayment.count({ where: { organizationId: suvarnaOrg.id } });
      const smCountAfterSettle = await prisma.stockMovement.count({ where: { organizationId: suvarnaOrg.id } });

      // Verify zero changes to POS billing or inventory
      expect(invCountAfterSettle).toBe(invCountAfterSetup);
      expect(payCountAfterSettle).toBe(payCountAfterSetup);
      expect(smCountAfterSettle).toBe(smCountAfterSetup);

      // Verify the only journal entry created is the SETTLEMENT entry
      const settlementJournal = await prisma.journalEntry.findUniqueOrThrow({
        where: { id: settleRes.journalEntry.id },
        include: { lines: { include: { account: true } } },
      });
      expect(settlementJournal.sourceType).toBe('SETTLEMENT');

      // Verify no revenue (4010, 4020, 4030) or GST accounts (2010, 2020, 2030) are touched
      const touchedCodes = settlementJournal.lines.map((l) => l.account.code);
      expect(touchedCodes).not.toContain('4010');
      expect(touchedCodes).not.toContain('4020');
      expect(touchedCodes).not.toContain('4030');
      expect(touchedCodes).not.toContain('2010');
      expect(touchedCodes).not.toContain('2020');
      expect(touchedCodes).not.toContain('2030');
    });
  });
});
