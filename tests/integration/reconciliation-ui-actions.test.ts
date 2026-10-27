import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, withDbRetry } from '@/lib/db';
import { auth } from '@/lib/auth';
import {
  createBankAccountAction,
  listBankAccountsAction,
  deactivateBankAccountAction,
  previewCsvStatementAction,
  checkDuplicateFileAction,
  importStatementAction,
  listStatementImportsAction,
  getReconciliationSummaryAction,
  getStatementLinesAction,
  getStatementLineDetailsAction,
  findCandidateMatchesAction,
  searchUnallocatedPaymentsAction,
  createProposedMatchAction,
  confirmMatchAction,
  createAndConfirmMatchAction,
  reverseMatchAction,
  markLineDiscrepantAction,
  ignoreStatementLineAction,
  getSettlementPreviewAction,
  postSettlementJournalAction,
  reverseSettlementJournalAction,
} from '@/app/actions/reconciliation';
import { BankAccountService } from '@/lib/bank-accounts';
import { LedgerService } from '@/lib/ledger';
import { Decimal } from 'decimal.js';

describe('Suvarna Milestone 4D-5 — Reconciliation UI Server Actions Integration Tests', () => {
  const bankAccountService = new BankAccountService({ prisma });
  const ledgerService = new LedgerService({ prisma });

  let suvarnaOrg: any;
  let fortBranch: any;
  let vashiBranch: any;
  let kalyanOrg: any;
  let thaneBranch: any;

  let ownerUser: any;
  let accountantUser: any;
  let salesUser: any;
  let kalyanOwner: any;

  const DEV_PASSWORD = 'SuvarnaDev2026!';
  let ownerHeaders: Headers;
  let accountantHeaders: Headers;
  let salesHeaders: Headers;
  let kalyanHeaders: Headers;

  let testLedgerAccountId: string;
  let createdBankAccountIds: string[] = [];
  let createdImportIds: string[] = [];
  let createdStatementLineIds: string[] = [];
  let createdInvoiceIds: string[] = [];
  let createdPaymentIds: string[] = [];
  let createdMatchIds: string[] = [];
  let createdCustomerIds: string[] = [];

  async function getSessionHeaders(email: string): Promise<Headers> {
    const signInRes = await auth.api.signInEmail({
      body: { email, password: DEV_PASSWORD },
      asResponse: true,
    });
    const cookie = signInRes.headers.get('set-cookie');
    if (!cookie) {
      throw new Error(`Failed to sign in as ${email}`);
    }
    return new Headers({ cookie });
  }

  beforeAll(async () => {
    suvarnaOrg = await withDbRetry(() => prisma.organization.findUniqueOrThrow({ where: { slug: 'suvarna-mumbai' } }), 3, 500);
    kalyanOrg = await withDbRetry(() => prisma.organization.findUniqueOrThrow({ where: { slug: 'kalyan-test' } }), 3, 500);

    fortBranch = await withDbRetry(() => prisma.branch.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id, code: 'FORT' },
    }), 3, 500);
    vashiBranch = await withDbRetry(() => prisma.branch.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id, code: 'VASHI' },
    }), 3, 500);
    thaneBranch = await withDbRetry(() => prisma.branch.findFirstOrThrow({
      where: { organizationId: kalyanOrg.id, code: 'THANE' },
    }), 3, 500);

    ownerUser = await withDbRetry(() => prisma.user.findFirstOrThrow({ where: { email: 'owner@suvarna.test' } }), 3, 500);
    accountantUser = await withDbRetry(() => prisma.user.findFirstOrThrow({ where: { email: 'accountant@suvarna.test' } }), 3, 500);
    salesUser = await withDbRetry(() => prisma.user.findFirstOrThrow({ where: { email: 'sales@suvarna.test' } }), 3, 500);
    kalyanOwner = await withDbRetry(() => prisma.user.findFirstOrThrow({ where: { email: 'owner@kalyan.test' } }), 3, 500);

    ownerHeaders = await getSessionHeaders('owner@suvarna.test');
    accountantHeaders = await getSessionHeaders('accountant@suvarna.test');
    salesHeaders = await getSessionHeaders('sales@suvarna.test');
    kalyanHeaders = await getSessionHeaders('owner@kalyan.test');

    // Ensure chart of accounts
    const ownerCtx = {
      userId: ownerUser.id,
      userEmail: ownerUser.email,
      tenantId: suvarnaOrg.id,
      tenantSlug: suvarnaOrg.slug,
      membershipId: 'mem-owner-suvarna',
      role: 'OWNER' as const,
      activeBranchId: fortBranch.id,
      allowedBranchIds: [fortBranch.id, vashiBranch.id],
    };

    const acctMap = await ledgerService.ensureBillingAccounts(ownerCtx, prisma);
    testLedgerAccountId = acctMap.get('1040')!;
  });

  afterAll(async () => {
    // Clean up created entities in strict foreign key order (respecting ON DELETE RESTRICT)
    const validMatchIds = createdMatchIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (validMatchIds.length > 0) {
      await prisma.reconciliationMatch.deleteMany({ where: { id: { in: validMatchIds } } });
    }
    const validLineIds = createdStatementLineIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    const validImportIds = createdImportIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (validImportIds.length > 0 || validLineIds.length > 0) {
      await prisma.bankStatementLine.deleteMany({
        where: {
          OR: [
            ...(validLineIds.length > 0 ? [{ id: { in: validLineIds } }] : []),
            ...(validImportIds.length > 0 ? [{ importId: { in: validImportIds } }] : []),
          ],
        },
      });
    }
    if (validImportIds.length > 0) {
      await prisma.bankStatementImport.deleteMany({ where: { id: { in: validImportIds } } });
    }
    const validPaymentIds = createdPaymentIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (validPaymentIds.length > 0) {
      await prisma.invoicePayment.deleteMany({ where: { id: { in: validPaymentIds } } });
    }
    const validInvoiceIds = createdInvoiceIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (validInvoiceIds.length > 0) {
      await prisma.invoice.deleteMany({ where: { id: { in: validInvoiceIds } } });
    }
    const validCustomerIds = createdCustomerIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (validCustomerIds.length > 0) {
      await prisma.customer.deleteMany({ where: { id: { in: validCustomerIds } } });
    }
    const validAccountIds = createdBankAccountIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (validAccountIds.length > 0) {
      await prisma.bankAccount.deleteMany({ where: { id: { in: validAccountIds } } });
    }
  });

  // Helper to create synthetic customer & invoice payment
  async function createTestPayment(params: {
    amount: string;
    paymentMethod: string;
    transactionRef?: string;
  }) {
    const cust = await prisma.customer.create({
      data: {
        organizationId: suvarnaOrg.id,
        primaryBranchId: fortBranch.id,
        name: `Recon Cust ${Date.now()}`,
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        normalizedPhone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        city: 'Mumbai',
        state: 'Maharashtra',
      },
    });
    createdCustomerIds.push(cust.id);

    const inv = await prisma.invoice.create({
      data: {
        organizationId: suvarnaOrg.id,
        branchId: fortBranch.id,
        invoiceNumber: `INV-UI-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        fiscalYear: '2026-2027',
        sequenceNumber: Math.floor(Math.random() * 900000) + 1,
        customerId: cust.id,
        customerName: cust.name,
        customerCity: 'Mumbai',
        customerState: 'Maharashtra',
        subtotal: params.amount,
        taxableAmount: params.amount,
        totalTax: '0.00',
        grandTotal: params.amount,
        paidAmount: params.amount,
        balanceAmount: '0.00',
        paymentStatus: 'PAID',
        userId: ownerUser.id,
      },
    });
    createdInvoiceIds.push(inv.id);

    const pay = await prisma.invoicePayment.create({
      data: {
        organizationId: suvarnaOrg.id,
        invoiceId: inv.id,
        paymentMethod: params.paymentMethod,
        amount: params.amount,
        transactionRef: params.transactionRef ?? `REF-${Date.now()}`,
        paymentDate: new Date(),
        receivedByUserId: ownerUser.id,
      },
    });
    createdPaymentIds.push(pay.id);

    return { customer: cust, invoice: inv, payment: pay };
  }

  // ============================================================================
  // 1. TENANT / BRANCH ISOLATION & PERMISSIONS
  // ============================================================================
  describe('Tenant & Branch Isolation & RBAC Permissions', () => {
    it('rejects bank account creation for SALES_STAFF role without ACCOUNTS_VIEW', async () => {
      const res = await createBankAccountAction(
        {
          accountName: 'Unauthorized Sales Account',
          bankName: 'Test Bank',
          accountNumberMasked: 'XXXX-9999',
          ledgerAccountId: testLedgerAccountId,
        },
        { headers: salesHeaders }
      );

      expect(res.success).toBe(false);
      expect(['PERMISSION_DENIED', 'BANK_ACCOUNT_MANAGEMENT_DENIED']).toContain(res.code);
    });

    it('allows OWNER and ACCOUNTANT to create and list bank accounts', async () => {
      const accountName = `UI Test HDFC ${Date.now()}`;
      const res = await createBankAccountAction(
        {
          accountName,
          bankName: 'HDFC Bank',
          accountType: 'CURRENT',
          accountNumberMasked: 'XXXX-1234',
          ledgerAccountId: testLedgerAccountId,
          branchId: fortBranch.id,
        },
        { headers: ownerHeaders }
      );

      expect(res.success).toBe(true);
      expect(res.data?.id).toBeDefined();
      createdBankAccountIds.push(res.data.id);

      // Verify list action returns the new account for accountant
      const listRes = await listBankAccountsAction({}, { headers: accountantHeaders });
      expect(listRes.success).toBe(true);
      expect(listRes.data?.some((a) => a.id === res.data.id)).toBe(true);
    });

    it('strictly isolates bank accounts between tenants (Kalyan cannot see Suvarna accounts)', async () => {
      const listRes = await listBankAccountsAction({}, { headers: kalyanHeaders });
      expect(listRes.success).toBe(true);
      const kalyanAccounts = listRes.data || [];
      // None of the Suvarna accounts should be visible to Kalyan
      expect(kalyanAccounts.some((a) => createdBankAccountIds.includes(a.id))).toBe(false);
    });
  });

  // ============================================================================
  // 2. CSV PREVIEW & DUPLICATE IMPORTS
  // ============================================================================
  describe('CSV Preview, Validation & Duplicate Detection', () => {
    let testAccountId: string;

    beforeAll(async () => {
      const acc = await prisma.bankAccount.create({
        data: {
          organizationId: suvarnaOrg.id,
          branchId: fortBranch.id,
          accountName: `Import UI Test Bank ${Date.now()}`,
          bankName: 'State Bank of India',
          accountType: 'CURRENT',
          accountNumberMasked: 'XXXX-8888',
          ledgerAccountId: testLedgerAccountId,
          isActive: true,
        },
      });
      testAccountId = acc.id;
      createdBankAccountIds.push(acc.id);
    });

    it('previews valid CSV without committing any records to database', async () => {
      const csv = `Date,Description,Reference,Credit,Debit\n15/10/2026,UPI Settlement,UPI-PREV-01,25000.00,0.00\n16/10/2026,Card Batch,EDC-PREV-02,40000.00,0.00`;

      const previewRes = await previewCsvStatementAction(
        {
          fileContent: csv,
          columnMapping: {
            dateColumn: 'Date',
            descriptionColumn: 'Description',
            referenceColumn: 'Reference',
            amountMode: 'SEPARATE_COLUMNS',
            creditColumn: 'Credit',
            debitColumn: 'Debit',
            dateFormat: 'DD/MM/YYYY',
          },
        },
        { headers: accountantHeaders }
      );

      expect(previewRes.success).toBe(true);
      expect(previewRes.data?.rows.length).toBe(2);
      expect(previewRes.data?.errors.length).toBe(0);

      // Verify zero statement imports or lines were created in DB
      const dbCount = await prisma.bankStatementImport.count({
        where: { bankAccountId: testAccountId },
      });
      expect(dbCount).toBe(0);
    });

    it('returns structured row validation errors for malformed rows in preview', async () => {
      const invalidCsv = `Date,Description,Reference,Credit,Debit\nInvalidDate,UPI Settlement,REF-01,NOT_A_NUMBER,0.00`;

      const previewRes = await previewCsvStatementAction(
        {
          fileContent: invalidCsv,
          columnMapping: {
            dateColumn: 'Date',
            descriptionColumn: 'Description',
            referenceColumn: 'Reference',
            amountMode: 'SEPARATE_COLUMNS',
            creditColumn: 'Credit',
            debitColumn: 'Debit',
            dateFormat: 'DD/MM/YYYY',
          },
        },
        { headers: accountantHeaders }
      );

      expect(previewRes.success).toBe(true);
      expect(previewRes.data?.errors.length).toBeGreaterThan(0);
    });

    it('imports CSV and detects duplicate file hash on subsequent check', async () => {
      const uniqueRef = `UTR-${Date.now()}`;
      const csv = `Date,Description,Reference,Credit,Debit\n18/10/2026,UPI Merchant Settlement,${uniqueRef},50000.00,0.00`;

      // 1. Initial check duplicate -> false
      const check1 = await checkDuplicateFileAction(
        { bankAccountId: testAccountId, fileContent: csv },
        { headers: accountantHeaders }
      );
      expect(check1.success).toBe(true);
      expect(check1.data?.isDuplicate).toBe(false);

      // 2. Perform import
      const importRes = await importStatementAction(
        {
          bankAccountId: testAccountId,
          fileName: `sbi-statement-${Date.now()}.csv`,
          fileContent: csv,
          sourceType: 'BANK_STATEMENT',
          columnMapping: {
            dateColumn: 'Date',
            descriptionColumn: 'Description',
            referenceColumn: 'Reference',
            amountMode: 'SEPARATE_COLUMNS',
            creditColumn: 'Credit',
            debitColumn: 'Debit',
            dateFormat: 'DD/MM/YYYY',
          },
        },
        { headers: accountantHeaders }
      );

      expect(importRes.success).toBe(true);
      expect(importRes.data?.importId).toBeDefined();
      createdImportIds.push(importRes.data!.importId);

      // 3. Second check duplicate -> true
      const check2 = await checkDuplicateFileAction(
        { bankAccountId: testAccountId, fileContent: csv },
        { headers: accountantHeaders }
      );
      expect(check2.success).toBe(true);
      expect(check2.data?.isDuplicate).toBe(true);
      expect(check2.data?.existingImport?.id).toBe(importRes.data!.importId);

      // 4. Attempting to re-import returns duplicate error
      const dupImportRes = await importStatementAction(
        {
          bankAccountId: testAccountId,
          fileName: `duplicate.csv`,
          fileContent: csv,
          sourceType: 'BANK_STATEMENT',
          columnMapping: {
            dateColumn: 'Date',
            descriptionColumn: 'Description',
            referenceColumn: 'Reference',
            amountMode: 'SEPARATE_COLUMNS',
            creditColumn: 'Credit',
            debitColumn: 'Debit',
            dateFormat: 'DD/MM/YYYY',
          },
        },
        { headers: accountantHeaders }
      );

      expect(dupImportRes.success).toBe(false);
      expect(dupImportRes.code).toBe('FILE_ALREADY_IMPORTED');
    });
  });

  // ============================================================================
  // 3. MATCHING REVIEW & VALIDATION
  // ============================================================================
  describe('Matching Review, Candidate Detection & Lifecycle', () => {
    let testAccountId: string;
    let testImportId: string;
    let statementLine: any;
    let testPayment: any;

    beforeAll(async () => {
      const acc = await prisma.bankAccount.create({
        data: {
          organizationId: suvarnaOrg.id,
          branchId: fortBranch.id,
          accountName: `Matching Review Test Bank ${Date.now()}`,
          bankName: 'Axis Bank',
          accountType: 'CURRENT',
          accountNumberMasked: 'XXXX-5555',
          ledgerAccountId: testLedgerAccountId,
          isActive: true,
        },
      });
      testAccountId = acc.id;
      createdBankAccountIds.push(acc.id);

      const imp = await prisma.bankStatementImport.create({
        data: {
          organizationId: suvarnaOrg.id,
          bankAccountId: testAccountId,
          fileName: 'matching-test.csv',
          fileHash: `hash-${Date.now()}`,
          sourceType: 'BANK_STATEMENT',
          totalLinesCount: 1,
        },
      });
      testImportId = imp.id;
      createdImportIds.push(imp.id);

      const refNum = `AXIS-UPI-${Date.now()}`;
      statementLine = await prisma.bankStatementLine.create({
        data: {
          organizationId: suvarnaOrg.id,
          importId: testImportId,
          bankAccountId: testAccountId,
          lineNumber: 1,
          transactionDate: new Date(),
          description: `UPI Payment Inward from customer ${refNum}`,
          referenceNumber: refNum,
          lineType: 'CREDIT',
          amount: '30000.00',
          reconciliationStatus: 'UNMATCHED',
        },
      });
      createdStatementLineIds.push(statementLine.id);

      // Create matching customer payment with identical ref & amount
      const { payment } = await createTestPayment({
        amount: '30000.00',
        paymentMethod: 'UPI',
        transactionRef: refNum,
      });
      testPayment = payment;
    });

    it('retrieves statement lines and detailed line metadata', async () => {
      const linesRes = await getStatementLinesAction(
        { bankAccountId: testAccountId, limit: 10 },
        { headers: accountantHeaders }
      );

      expect(linesRes.success).toBe(true);
      expect(linesRes.data?.total).toBeGreaterThanOrEqual(1);

      const detailsRes = await getStatementLineDetailsAction(
        statementLine.id,
        { headers: accountantHeaders }
      );
      expect(detailsRes.success).toBe(true);
      expect(detailsRes.data?.id).toBe(statementLine.id);
      expect(detailsRes.data?.bankAccount?.id).toBe(testAccountId);
    });

    it('identifies candidate match via Rule A (EXACT_REF_AND_AMOUNT) with HIGH confidence', async () => {
      const candRes = await findCandidateMatchesAction(
        statementLine.id,
        {},
        { headers: accountantHeaders }
      );

      expect(candRes.success).toBe(true);
      expect(candRes.data?.length).toBeGreaterThanOrEqual(1);
      const exactCandidate = candRes.data?.find((c) => c.paymentId === testPayment.id);
      expect(exactCandidate).toBeDefined();
      expect(exactCandidate?.rule).toBe('EXACT_REF_AND_AMOUNT');
      expect(exactCandidate?.confidence).toBe('HIGH');
    });

    it('creates a proposed match and confirms it', async () => {
      // 1. Propose match
      const propRes = await createProposedMatchAction(
        {
          statementLineId: statementLine.id,
          paymentId: testPayment.id,
          matchedAmount: '30000.00',
        },
        { headers: accountantHeaders }
      );

      expect(propRes.success).toBe(true);
      expect(propRes.data?.status).toBe('PROPOSED');
      createdMatchIds.push(propRes.data!.id);

      // 2. Confirm match
      const confirmRes = await confirmMatchAction(propRes.data!.id, { headers: accountantHeaders });
      expect(confirmRes.success).toBe(true);
      expect(confirmRes.data?.match?.status).toBe('CONFIRMED');

      // Statement line is now fully MATCHED
      const updatedLine = await prisma.bankStatementLine.findUniqueOrThrow({
        where: { id: statementLine.id },
      });
      expect(updatedLine.reconciliationStatus).toBe('MATCHED');
    });

    it('reverses a confirmed match with mandatory audit reason', async () => {
      const match = await prisma.reconciliationMatch.findFirstOrThrow({
        where: { statementLineId: statementLine.id, status: 'CONFIRMED' },
      });

      // 1. Reversal without reason or short reason fails
      const failRes = await reverseMatchAction(
        { matchId: match.id, reason: 'bad' },
        { headers: accountantHeaders }
      );
      expect(failRes.success).toBe(false);

      // 2. Reversal with valid reason succeeds
      const revRes = await reverseMatchAction(
        { matchId: match.id, reason: 'Test UI Reversal of match' },
        { headers: accountantHeaders }
      );
      expect(revRes.success).toBe(true);
      expect(revRes.data?.match?.status).toBe('REVERSED');

      // Statement line reverts to UNMATCHED
      const lineAfter = await prisma.bankStatementLine.findUniqueOrThrow({
        where: { id: statementLine.id },
      });
      expect(lineAfter.reconciliationStatus).toBe('UNMATCHED');
    });

    it('allows marking a line as DISCREPANT and IGNORED with audit reasons', async () => {
      // Mark discrepant
      const discRes = await markLineDiscrepantAction(
        { statementLineId: statementLine.id, reason: 'Amount does not match deposit' },
        { headers: accountantHeaders }
      );
      expect(discRes.success).toBe(true);
      expect(discRes.data?.reconciliationStatus).toBe('DISCREPANT');

      // Ignore line
      const ignRes = await ignoreStatementLineAction(
        { statementLineId: statementLine.id, reason: 'Internal non-retail transfer' },
        { headers: accountantHeaders }
      );
      expect(ignRes.success).toBe(true);
      expect(ignRes.data?.reconciliationStatus).toBe('IGNORED');
    });
  });

  // ============================================================================
  // 4. SETTLED RECORD IMMUTABILITY & SETTLEMENT WORKFLOW
  // ============================================================================
  describe('Settlement Preview, Posting, Settled Protection & Reversal', () => {
    let testAccountId: string;
    let testImportId: string;
    let statementLine: any;
    let testPayment: any;

    beforeAll(async () => {
      const acc = await prisma.bankAccount.create({
        data: {
          organizationId: suvarnaOrg.id,
          branchId: fortBranch.id,
          accountName: `Settlement Test Bank ${Date.now()}`,
          bankName: 'Kotak Mahindra Bank',
          accountType: 'CURRENT',
          accountNumberMasked: 'XXXX-4444',
          ledgerAccountId: testLedgerAccountId,
          isActive: true,
        },
      });
      testAccountId = acc.id;
      createdBankAccountIds.push(acc.id);

      const imp = await prisma.bankStatementImport.create({
        data: {
          organizationId: suvarnaOrg.id,
          bankAccountId: testAccountId,
          fileName: 'settle-test.csv',
          fileHash: `hash-settle-${Date.now()}`,
          sourceType: 'BANK_STATEMENT',
          totalLinesCount: 1,
        },
      });
      testImportId = imp.id;
      createdImportIds.push(imp.id);

      statementLine = await prisma.bankStatementLine.create({
        data: {
          organizationId: suvarnaOrg.id,
          importId: testImportId,
          bankAccountId: testAccountId,
          lineNumber: 1,
          transactionDate: new Date(),
          description: 'Card EDC Batch Settlement',
          lineType: 'CREDIT',
          amount: '49000.00', // Net bank deposit after 1000 fee
          reconciliationStatus: 'UNMATCHED',
        },
      });
      createdStatementLineIds.push(statementLine.id);

      const { payment } = await createTestPayment({
        amount: '50000.00',
        paymentMethod: 'CARD',
      });
      testPayment = payment;

      // Link match with fee
      const matchRes = await createAndConfirmMatchAction(
        {
          statementLineId: statementLine.id,
          paymentId: testPayment.id,
          matchedAmount: '50000.00',
          feeAmount: '1000.00',
          reason: 'Gross Card payment matched to net deposit',
        },
        { headers: accountantHeaders }
      );
      if (matchRes.data?.match?.id) {
        createdMatchIds.push(matchRes.data.match.id);
      }
    });

    it('calculates settlement preview with fee and validates double-entry balance', async () => {
      const prevRes = await getSettlementPreviewAction(
        { statementLineId: statementLine.id, feeAmount: '1000.00' },
        { headers: accountantHeaders }
      );

      expect(prevRes.success).toBe(true);
      expect(prevRes.data?.netDepositAmount).toBe('49000.00');
      expect(prevRes.data?.grossClearedAmount).toBe('50000.00');
      expect(prevRes.data?.feeAmount).toBe('1000.00');
      expect(prevRes.data?.isBalanced).toBe(true);
      expect(prevRes.data?.canSettle).toBe(true);
    });

    it('posts balanced settlement journal and transitions line and match to SETTLED', async () => {
      const settleRes = await postSettlementJournalAction(
        { statementLineId: statementLine.id, feeAmount: '1000.00' },
        { headers: accountantHeaders }
      );

      expect(settleRes.success).toBe(true);
      expect(settleRes.data?.status).toBe('SETTLED');
      expect(settleRes.data?.matchesSettledCount).toBe(1);

      // Verify line status in DB
      const dbLine = await prisma.bankStatementLine.findUniqueOrThrow({
        where: { id: statementLine.id },
      });
      expect(dbLine.reconciliationStatus).toBe('SETTLED');
      expect(dbLine.settlementJournalId).not.toBeNull();
      expect(dbLine.feeAmount?.toString()).toBe('1000');
    });

    it('STRICTLY REJECTS ordinary matching actions on settled statement line', async () => {
      // 1. Cannot create or propose new match on settled line
      const newPay = await createTestPayment({ amount: '5000.00', paymentMethod: 'UPI' });
      const propRes = await createProposedMatchAction(
        {
          statementLineId: statementLine.id,
          paymentId: newPay.payment.id,
          matchedAmount: '5000.00',
        },
        { headers: accountantHeaders }
      );
      expect(propRes.success).toBe(false);
      expect(propRes.code).toBe('LINE_ALREADY_SETTLED');

      // 2. Cannot reverse match on settled line directly
      const match = await prisma.reconciliationMatch.findFirstOrThrow({
        where: { statementLineId: statementLine.id },
      });
      const revRes = await reverseMatchAction(
        { matchId: match.id, reason: 'Trying to reverse settled match' },
        { headers: accountantHeaders }
      );
      expect(revRes.success).toBe(false);
      expect(revRes.code).toBe('MATCH_ALREADY_SETTLED');

      // 3. Cannot mark settled line as discrepant or ignored
      const discRes = await markLineDiscrepantAction(
        { statementLineId: statementLine.id, reason: 'Attempting discrepant on settled' },
        { headers: accountantHeaders }
      );
      expect(discRes.success).toBe(false);
      expect(discRes.code).toBe('LINE_ALREADY_SETTLED');
    });

    it('reverses settlement journal cleanly, restores line to MATCHED and matches to CONFIRMED', async () => {
      const revRes = await reverseSettlementJournalAction(
        {
          statementLineId: statementLine.id,
          reason: 'Authorized reversal of settlement from UI',
        },
        { headers: accountantHeaders }
      );

      expect(revRes.success).toBe(true);
      expect(revRes.data?.status).toBe('MATCHED');

      // DB verification
      const dbLine = await prisma.bankStatementLine.findUniqueOrThrow({
        where: { id: statementLine.id },
      });
      expect(dbLine.reconciliationStatus).toBe('MATCHED');
      expect(dbLine.settlementJournalId).toBeNull();
      expect(dbLine.feeAmount).toBeNull();

      const dbMatch = await prisma.reconciliationMatch.findFirstOrThrow({
        where: { statementLineId: statementLine.id },
      });
      expect(dbMatch.status).toBe('CONFIRMED');
      expect(dbMatch.settlementJournalId).toBeNull();
    });
  });

  // ============================================================================
  // 5. SUMMARY ACTION & DEACTIVATION
  // ============================================================================
  describe('Summary Metrics & Bank Account Deactivation', () => {
    it('returns structured reconciliation summary with deposit, fee and gross counts', async () => {
      const sumRes = await getReconciliationSummaryAction({}, { headers: accountantHeaders });
      expect(sumRes.success).toBe(true);
      expect(sumRes.data?.totalLines).toBeGreaterThanOrEqual(1);
      expect(typeof sumRes.data?.unmatchedCount).toBe('number');
      expect(typeof sumRes.data?.matchedCount).toBe('number');
      expect(typeof sumRes.data?.settledCount).toBe('number');
      expect(typeof sumRes.data?.discrepantCount).toBe('number');
    });

    it('deactivates bank account without deleting records or foreign keys', async () => {
      const acc = await prisma.bankAccount.create({
        data: {
          organizationId: suvarnaOrg.id,
          accountName: `Deactivate Test Account ${Date.now()}`,
          bankName: 'Federal Bank',
          accountType: 'CURRENT',
          accountNumberMasked: 'XXXX-1111',
          ledgerAccountId: testLedgerAccountId,
          isActive: true,
        },
      });
      createdBankAccountIds.push(acc.id);

      const deactRes = await deactivateBankAccountAction(acc.id, { headers: ownerHeaders });
      expect(deactRes.success).toBe(true);
      expect(deactRes.data?.isActive).toBe(false);

      // Verify still exists in DB
      const dbAcc = await prisma.bankAccount.findUniqueOrThrow({ where: { id: acc.id } });
      expect(dbAcc.isActive).toBe(false);
    });
  });
});
