import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Organization, Branch, User } from '@prisma/client';
import { SecurityContext } from '@/types/security';
import {
  BankAccountService,
  BankAccountValidationError,
  BankAccountNotFoundError,
  BankAccountConflictError,
} from '@/lib/bank-accounts';
import { LedgerService, STARTER_CHART_OF_ACCOUNTS, PAYMENT_METHOD_ACCOUNT_MAP } from '@/lib/ledger';
import { BillingService } from '@/lib/billing';
import { AuthorizationError } from '@/types/security';

const prisma = new PrismaClient();
const bankAccountService = new BankAccountService({ prisma });
const ledgerService = new LedgerService({ prisma });
const billingService = new BillingService({ prisma });

describe('Suvarna Milestone 4D-1 — Reconciliation Data Foundation Integration Tests', () => {
  let suvarnaOrg: Organization;
  let kalyanOrg: Organization;
  let fortBranch: Branch;
  let vashiBranch: Branch;
  let kalyanBranch: Branch;

  let ownerUser: User;
  let accountantUser: User;
  let salesUser: User;
  let kalyanOwnerUser: User;

  let ownerCtx: SecurityContext;
  let accountantCtx: SecurityContext;
  let salesCtx: SecurityContext;
  let kalyanOwnerCtx: SecurityContext;

  const createdBankAccountIds: string[] = [];
  const createdImportIds: string[] = [];
  const createdStatementLineIds: string[] = [];
  const createdMatchIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdOrnamentIds: string[] = [];
  const createdCustomerIds: string[] = [];

  // Helper to create synthetic ornament
  async function createTestOrnament(tagCode: string) {
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

  // Helper to create synthetic customer
  async function createTestCustomer(suffix: string) {
    const customer = await prisma.customer.create({
      data: {
        organizationId: suvarnaOrg.id,
        primaryBranchId: fortBranch.id,
        name: `Recon Customer ${suffix}`,
        phone: `98330${suffix.padStart(5, '0')}`,
        normalizedPhone: `98330${suffix.padStart(5, '0')}`,
        pan: 'ABCDE1234F',
        city: 'Mumbai',
        state: 'Maharashtra',
      },
    });
    createdCustomerIds.push(customer.id);
    return customer;
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
    kalyanBranch = await prisma.branch.findFirstOrThrow({
      where: { organizationId: kalyanOrg.id },
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
      allowedBranchIds: [fortBranch.id], // Scoped strictly to Fort
    };

    kalyanOwnerCtx = {
      userId: kalyanOwnerUser.id,
      userEmail: kalyanOwnerUser.email,
      tenantId: kalyanOrg.id,
      tenantSlug: kalyanOrg.slug,
      membershipId: 'mem-owner-kalyan',
      role: 'OWNER',
      activeBranchId: kalyanBranch.id,
      allowedBranchIds: [kalyanBranch.id],
    };

    // Ensure accounts 1040 and 1045 exist for both tenants
    await ledgerService.ensureBillingAccounts(ownerCtx);
    await ledgerService.ensureBillingAccounts(kalyanOwnerCtx);
  });

  afterAll(async () => {
    // Clean up created reconciliation matches, lines, imports, bank accounts, invoices
    if (createdMatchIds.length > 0) {
      await prisma.reconciliationMatch.deleteMany({
        where: { id: { in: createdMatchIds } },
      });
    }
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
    if (createdBankAccountIds.length > 0) {
      await prisma.bankAccount.deleteMany({
        where: { id: { in: createdBankAccountIds } },
      });
    }
    if (createdInvoiceIds.length > 0) {
      const journalEntries = await prisma.journalEntry.findMany({
        where: {
          organizationId: suvarnaOrg.id,
          sourceType: { in: ['INVOICE', 'PAYMENT'] },
          sourceId: { in: createdInvoiceIds },
        },
        select: { id: true },
      });
      const jeIds = journalEntries.map((j) => j.id);
      if (jeIds.length > 0) {
        await prisma.journalLine.deleteMany({ where: { journalEntryId: { in: jeIds } } });
        await prisma.journalEntry.deleteMany({ where: { id: { in: jeIds } } });
      }
      await prisma.stockMovement.deleteMany({ where: { ornamentId: { in: createdOrnamentIds } } });
      await prisma.invoicePayment.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
      await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
    }
    if (createdOrnamentIds.length > 0) {
      await prisma.ornament.deleteMany({ where: { id: { in: createdOrnamentIds } } });
    }
    if (createdCustomerIds.length > 0) {
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
  });

  // ============================================================================
  // 1. Bank Account Service & Multi-Tenancy Tests
  // ============================================================================
  describe('1. Bank Account Service & Multi-Tenancy Enforcement', () => {
    it('creates a centralized bank account without branchId', async () => {
      const ledgerAcc1040 = await prisma.ledgerAccount.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, code: '1040' },
      });

      const bankAcc = await bankAccountService.createBankAccount(ownerCtx, {
        accountName: `HDFC Main Current - ${Date.now()}`,
        bankName: 'HDFC Bank',
        accountType: 'CURRENT',
        accountNumberMasked: '******1234',
        ifscCode: 'HDFC0000001',
        ledgerAccountId: ledgerAcc1040.id,
        branchId: null,
      });

      createdBankAccountIds.push(bankAcc.id);

      expect(bankAcc.id).toBeDefined();
      expect(bankAcc.organizationId).toBe(suvarnaOrg.id);
      expect(bankAcc.branchId).toBeNull();
      expect(bankAcc.accountType).toBe('CURRENT');
      expect(bankAcc.isActive).toBe(true);
    });

    it('creates a branch-specific EDC settlement account', async () => {
      const ledgerAcc1030 = await prisma.ledgerAccount.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, code: '1030' },
      });

      const edcAcc = await bankAccountService.createBankAccount(accountantCtx, {
        accountName: `Pine Labs Fort Showroom - ${Date.now()}`,
        bankName: 'Pine Labs',
        accountType: 'EDC_SETTLEMENT',
        accountNumberMasked: 'MID-FORT-9911',
        ledgerAccountId: ledgerAcc1030.id,
        branchId: fortBranch.id,
      });

      createdBankAccountIds.push(edcAcc.id);

      expect(edcAcc.id).toBeDefined();
      expect(edcAcc.branchId).toBe(fortBranch.id);
      expect(edcAcc.accountType).toBe('EDC_SETTLEMENT');
    });

    it('rejects cross-tenant ledger account reference', async () => {
      // Kalyan owner tries to create a bank account in Kalyan org pointing to Suvarna's ledger account
      const suvarnaLedgerAcc = await prisma.ledgerAccount.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, code: '1040' },
      });

      await expect(
        bankAccountService.createBankAccount(kalyanOwnerCtx, {
          accountName: `Malicious Account - ${Date.now()}`,
          bankName: 'Axis Bank',
          accountNumberMasked: '******9999',
          ledgerAccountId: suvarnaLedgerAcc.id,
        })
      ).rejects.toThrow(BankAccountValidationError);
    });

    it('rejects bank account creation by unauthorized staff (SALES_STAFF)', async () => {
      const ledgerAcc1040 = await prisma.ledgerAccount.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, code: '1040' },
      });

      await expect(
        bankAccountService.createBankAccount(salesCtx, {
          accountName: `Unauthorized Account - ${Date.now()}`,
          bankName: 'ICICI Bank',
          accountNumberMasked: '******5555',
          ledgerAccountId: ledgerAcc1040.id,
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it('strictly isolates bank accounts between organizations', async () => {
      // Create account in Kalyan
      const kalyanLedger = await prisma.ledgerAccount.findFirstOrThrow({
        where: { organizationId: kalyanOrg.id, code: '1040' },
      });
      const kalyanAcc = await bankAccountService.createBankAccount(kalyanOwnerCtx, {
        accountName: `Kalyan Bank - ${Date.now()}`,
        bankName: 'SBI',
        accountNumberMasked: '******8888',
        ledgerAccountId: kalyanLedger.id,
      });
      createdBankAccountIds.push(kalyanAcc.id);

      // Suvarna owner listing accounts should NOT see Kalyan's bank account
      const suvarnaAccounts = await bankAccountService.listBankAccounts(ownerCtx, { includeInactive: true });
      expect(suvarnaAccounts.some((a) => a.id === kalyanAcc.id)).toBe(false);

      // Suvarna owner directly fetching Kalyan's bank account throws NotFound
      await expect(bankAccountService.getBankAccountById(ownerCtx, kalyanAcc.id)).rejects.toThrow(
        BankAccountNotFoundError
      );
    });

    it('deactivates a bank account without deleting it', async () => {
      const ledgerAcc1040 = await prisma.ledgerAccount.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, code: '1040' },
      });

      const tempAcc = await bankAccountService.createBankAccount(ownerCtx, {
        accountName: `Temporary Account - ${Date.now()}`,
        bankName: 'Kotak Bank',
        accountNumberMasked: '******7777',
        ledgerAccountId: ledgerAcc1040.id,
      });
      createdBankAccountIds.push(tempAcc.id);

      const deactivated = await bankAccountService.deactivateBankAccount(ownerCtx, tempAcc.id);
      expect(deactivated.isActive).toBe(false);

      // Listing active accounts excludes it
      const activeList = await bankAccountService.listBankAccounts(ownerCtx, { includeInactive: false });
      expect(activeList.some((a) => a.id === tempAcc.id)).toBe(false);

      // Listing all accounts includes it
      const allList = await bankAccountService.listBankAccounts(ownerCtx, { includeInactive: true });
      expect(allList.some((a) => a.id === tempAcc.id)).toBe(true);
    });
  });

  // ============================================================================
  // 2. Starter Account 1045 & Inward Clearing Correction
  // ============================================================================
  describe('2. Account 1045 Bank Transfer Inward Clearing Integration', () => {
    it('initializes account 1045 idempotently in starter chart of accounts', async () => {
      const acc1045Def = STARTER_CHART_OF_ACCOUNTS.find((a) => a.code === '1045');
      expect(acc1045Def).toBeDefined();
      expect(acc1045Def?.name).toBe('Bank Transfer Inward Clearing');
      expect(acc1045Def?.classification).toBe('ASSET');
      expect(acc1045Def?.normalBalance).toBe('DEBIT');

      // Verify account 1045 exists in live DB for Suvarna
      const dbAcc = await prisma.ledgerAccount.findUniqueOrThrow({
        where: {
          organizationId_code: {
            organizationId: suvarnaOrg.id,
            code: '1045',
          },
        },
      });
      expect(dbAcc.classification).toBe('ASSET');
      expect(dbAcc.normalBalance).toBe('DEBIT');
    });

    it('verifies PAYMENT_METHOD_ACCOUNT_MAP routes BANK_TRANSFER to 1045', () => {
      expect(PAYMENT_METHOD_ACCOUNT_MAP.BANK_TRANSFER).toBe('1045');
      expect(PAYMENT_METHOD_ACCOUNT_MAP.CASH).toBe('1010');
      expect(PAYMENT_METHOD_ACCOUNT_MAP.UPI).toBe('1020');
      expect(PAYMENT_METHOD_ACCOUNT_MAP.CARD).toBe('1030');
      expect(PAYMENT_METHOD_ACCOUNT_MAP.CHEQUE).toBe('1050');
    });

    it('creates an invoice with BANK_TRANSFER payment and debits 1045', async () => {
      const orn = await createTestOrnament(`BT-${Date.now().toString().slice(-4)}`);
      const cust = await createTestCustomer(`BT-${Date.now().toString().slice(-4)}`);

      // 5g @ 10,000/g = 50,000 metal. Making: 5,000. Taxable: 55,000. GST: 1,650. Grand Total: 56,650.
      const invoice = await billingService.createInvoice(salesCtx, {
        customerId: cust.id,
        customerPan: 'ABCDE1234F',
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '5.000',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [
          {
            paymentMethod: 'BANK_TRANSFER',
            amount: '56650.00',
            transactionRef: 'IMPS-HDFC-991823',
          },
        ],
      });
      createdInvoiceIds.push(invoice.id);

      expect(invoice.paymentStatus).toBe('PAID');

      // Verify the generated double-entry journal entry
      const journalEntry = await prisma.journalEntry.findFirstOrThrow({
        where: {
          organizationId: suvarnaOrg.id,
          sourceType: 'INVOICE',
          sourceId: invoice.id,
        },
        include: {
          lines: { include: { account: true } },
        },
      });

      expect(journalEntry.status).toBe('POSTED');
      expect(journalEntry.totalDebit.toString()).toBe('56650');
      expect(journalEntry.totalCredit.toString()).toBe('56650');

      // Tender clearing line MUST be 1045 (Bank Transfer Inward Clearing), NOT 1040
      const clearingLine = journalEntry.lines.find((l) => l.account.code === '1045');
      const directBankLine = journalEntry.lines.find((l) => l.account.code === '1040');

      expect(clearingLine).toBeDefined();
      expect(clearingLine?.debitAmount.toString()).toBe('56650');
      expect(directBankLine).toBeUndefined(); // Zero direct debits to 1040 before reconciliation!
    });
  });

  // ============================================================================
  // 3. Reconciliation Data Models & Relational Integrity
  // ============================================================================
  describe('3. Reconciliation Data Models & Constraints', () => {
    it('creates statement import and statement lines with tenant composite foreign keys', async () => {
      const ledgerAcc1040 = await prisma.ledgerAccount.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, code: '1040' },
      });

      const bankAcc = await bankAccountService.createBankAccount(ownerCtx, {
        accountName: `Recon Bank A/C - ${Date.now()}`,
        bankName: 'HDFC Bank',
        accountNumberMasked: '******0011',
        ledgerAccountId: ledgerAcc1040.id,
      });
      createdBankAccountIds.push(bankAcc.id);

      // 1. Create BankStatementImport
      const fileHash = `hash-${Date.now()}-${Math.random()}`;
      const statementImport = await prisma.bankStatementImport.create({
        data: {
          organizationId: suvarnaOrg.id,
          bankAccountId: bankAcc.id,
          sourceType: 'BANK_STATEMENT',
          fileFormat: 'HDFC_CSV',
          fileName: 'HDFC_Oct2026_Stmt.csv',
          fileHash,
          totalLinesCount: 2,
          importedByUserId: ownerUser.id,
          status: 'PROCESSED',
        },
      });
      createdImportIds.push(statementImport.id);

      expect(statementImport.id).toBeDefined();

      // 2. Create statement lines
      const line1 = await prisma.bankStatementLine.create({
        data: {
          organizationId: suvarnaOrg.id,
          importId: statementImport.id,
          bankAccountId: bankAcc.id,
          lineNumber: 1,
          transactionDate: new Date('2026-10-25T10:00:00Z'),
          description: 'UPI/CR/1234567890/Customer Payment',
          referenceNumber: '1234567890',
          lineType: 'CREDIT',
          amount: '25000.00',
          reconciliationStatus: 'UNMATCHED',
          duplicateFingerprint: 'fp-line-1',
        },
      });
      createdStatementLineIds.push(line1.id);

      // 3. Create duplicate-looking statement line with identical fingerprint (must be permitted for review!)
      const line2 = await prisma.bankStatementLine.create({
        data: {
          organizationId: suvarnaOrg.id,
          importId: statementImport.id,
          bankAccountId: bankAcc.id,
          lineNumber: 2,
          transactionDate: new Date('2026-10-25T10:00:00Z'),
          description: 'UPI/CR/1234567890/Customer Payment',
          referenceNumber: '1234567890',
          lineType: 'CREDIT',
          amount: '25000.00',
          reconciliationStatus: 'UNMATCHED',
          duplicateFingerprint: 'fp-line-1', // Non-unique fingerprint preserved for review
        },
      });
      createdStatementLineIds.push(line2.id);

      expect(line1.id).not.toBe(line2.id);
      expect(line1.duplicateFingerprint).toBe(line2.duplicateFingerprint);
    });

    it('supports one statement line matching multiple customer payments (batch settlement)', async () => {
      const ledgerAcc1040 = await prisma.ledgerAccount.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, code: '1040' },
      });

      const bankAcc = await bankAccountService.createBankAccount(ownerCtx, {
        accountName: `EDC Payout A/C - ${Date.now()}`,
        bankName: 'Pine Labs',
        accountType: 'EDC_SETTLEMENT',
        accountNumberMasked: 'MID-8819',
        ledgerAccountId: ledgerAcc1040.id,
      });
      createdBankAccountIds.push(bankAcc.id);

      const statementImport = await prisma.bankStatementImport.create({
        data: {
          organizationId: suvarnaOrg.id,
          bankAccountId: bankAcc.id,
          sourceType: 'EDC_SETTLEMENT',
          fileName: 'PineLabs_Batch_8819.csv',
          fileHash: `hash-edc-${Date.now()}`,
          importedByUserId: ownerUser.id,
        },
      });
      createdImportIds.push(statementImport.id);

      // Statement line: lump sum batch credit of ₹40,000
      const batchLine = await prisma.bankStatementLine.create({
        data: {
          organizationId: suvarnaOrg.id,
          importId: statementImport.id,
          bankAccountId: bankAcc.id,
          lineNumber: 1,
          transactionDate: new Date('2026-10-25T18:00:00Z'),
          description: 'PINE LABS BATCH SETTLEMENT #9921',
          referenceNumber: 'BATCH-9921',
          lineType: 'CREDIT',
          amount: '40000.00',
          reconciliationStatus: 'MATCHED',
        },
      });
      createdStatementLineIds.push(batchLine.id);

      // Create two invoices with payments to link to this batch line
      const orn1 = await createTestOrnament(`BATCH1-${Date.now().toString().slice(-4)}`);
      const cust1 = await createTestCustomer(`BATCH1-${Date.now().toString().slice(-4)}`);
      const inv1 = await billingService.createInvoice(salesCtx, {
        customerId: cust1.id,
        items: [
          {
            ornamentId: orn1.id,
            grossWeight: '5.000',
            ratePerGram: '3500.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '1500.00',
          },
        ],
        payments: [{ paymentMethod: 'CARD', amount: '19570.00' }],
      });
      createdInvoiceIds.push(inv1.id);

      const orn2 = await createTestOrnament(`BATCH2-${Date.now().toString().slice(-4)}`);
      const cust2 = await createTestCustomer(`BATCH2-${Date.now().toString().slice(-4)}`);
      const inv2 = await billingService.createInvoice(salesCtx, {
        customerId: cust2.id,
        items: [
          {
            ornamentId: orn2.id,
            grossWeight: '5.000',
            ratePerGram: '3600.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '1900.00',
          },
        ],
        payments: [{ paymentMethod: 'CARD', amount: '20497.00' }],
      });
      createdInvoiceIds.push(inv2.id);

      // Link match 1
      const match1 = await prisma.reconciliationMatch.create({
        data: {
          organizationId: suvarnaOrg.id,
          statementLineId: batchLine.id,
          paymentId: inv1.payments[0].id,
          matchType: 'BATCH_SETTLEMENT',
          matchedAmount: '19570.00',
          status: 'CONFIRMED',
          matchedByUserId: ownerUser.id,
        },
      });
      createdMatchIds.push(match1.id);

      // Link match 2
      const match2 = await prisma.reconciliationMatch.create({
        data: {
          organizationId: suvarnaOrg.id,
          statementLineId: batchLine.id,
          paymentId: inv2.payments[0].id,
          matchType: 'BATCH_SETTLEMENT',
          matchedAmount: '20430.00',
          status: 'CONFIRMED',
          matchedByUserId: ownerUser.id,
        },
      });
      createdMatchIds.push(match2.id);

      // Query line matches
      const matches = await prisma.reconciliationMatch.findMany({
        where: { statementLineId: batchLine.id },
      });
      expect(matches).toHaveLength(2);
      expect(matches.map((m) => m.paymentId)).toContain(inv1.payments[0].id);
      expect(matches.map((m) => m.paymentId)).toContain(inv2.payments[0].id);
    });

    it('rejects cross-tenant references at database constraint level', async () => {
      // Create statement import in Suvarna
      const ledgerAcc1040 = await prisma.ledgerAccount.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, code: '1040' },
      });
      const bankAcc = await bankAccountService.createBankAccount(ownerCtx, {
        accountName: `Cross Tenant Bank - ${Date.now()}`,
        bankName: 'HDFC',
        accountNumberMasked: '******4444',
        ledgerAccountId: ledgerAcc1040.id,
      });
      createdBankAccountIds.push(bankAcc.id);

      // Try to create a statement import in Kalyan referencing Suvarna's bank account
      await expect(
        prisma.bankStatementImport.create({
          data: {
            organizationId: kalyanOrg.id, // Kalyan tenant
            bankAccountId: bankAcc.id,    // Suvarna bank account
            sourceType: 'BANK_STATEMENT',
            fileName: 'malicious.csv',
            fileHash: `hash-malicious-${Date.now()}`,
          },
        })
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // 4. Deletion Protection & Historical Evidence Preservation (Phase 4D-1B)
  // ============================================================================
  describe('4. Deletion Protection & Historical Evidence Preservation', () => {
    it('rejects deletion of BankStatementImport while statement lines exist (ON DELETE RESTRICT)', async () => {
      const ledgerAcc1040 = await prisma.ledgerAccount.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, code: '1040' },
      });
      const bankAcc = await bankAccountService.createBankAccount(ownerCtx, {
        accountName: `Restrict Test Bank - ${Date.now()}`,
        bankName: 'Axis Bank',
        accountNumberMasked: '******3322',
        ledgerAccountId: ledgerAcc1040.id,
      });
      createdBankAccountIds.push(bankAcc.id);

      const stmtImport = await prisma.bankStatementImport.create({
        data: {
          organizationId: suvarnaOrg.id,
          bankAccountId: bankAcc.id,
          sourceType: 'BANK_STATEMENT',
          fileName: 'Statement_Evidence.csv',
          fileHash: `evidence-hash-${Date.now()}`,
          importedByUserId: ownerUser.id,
        },
      });
      createdImportIds.push(stmtImport.id);

      const stmtLine = await prisma.bankStatementLine.create({
        data: {
          organizationId: suvarnaOrg.id,
          importId: stmtImport.id,
          bankAccountId: bankAcc.id,
          lineNumber: 1,
          transactionDate: new Date('2026-10-25T12:00:00Z'),
          description: 'CR/NEFT/CLIENT/EVIDENCE',
          lineType: 'CREDIT',
          amount: '75000.00',
        },
      });
      createdStatementLineIds.push(stmtLine.id);

      // Attempting to delete the import MUST be rejected by Postgres RESTRICT constraint
      await expect(
        prisma.bankStatementImport.delete({
          where: { id: stmtImport.id },
        })
      ).rejects.toThrow();

      // Verify the import and line still exist intact
      const preservedImport = await prisma.bankStatementImport.findUnique({
        where: { id: stmtImport.id },
      });
      const preservedLine = await prisma.bankStatementLine.findUnique({
        where: { id: stmtLine.id },
      });
      expect(preservedImport).not.toBeNull();
      expect(preservedLine).not.toBeNull();
    });

    it('rejects deletion of BankStatementLine while reconciliation matches exist (ON DELETE RESTRICT)', async () => {
      const ledgerAcc1040 = await prisma.ledgerAccount.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, code: '1040' },
      });
      const bankAcc = await bankAccountService.createBankAccount(ownerCtx, {
        accountName: `Match Restrict Bank - ${Date.now()}`,
        bankName: 'ICICI Bank',
        accountNumberMasked: '******6655',
        ledgerAccountId: ledgerAcc1040.id,
      });
      createdBankAccountIds.push(bankAcc.id);

      const stmtImport = await prisma.bankStatementImport.create({
        data: {
          organizationId: suvarnaOrg.id,
          bankAccountId: bankAcc.id,
          sourceType: 'BANK_STATEMENT',
          fileName: 'Matched_Evidence.csv',
          fileHash: `match-hash-${Date.now()}`,
          importedByUserId: ownerUser.id,
        },
      });
      createdImportIds.push(stmtImport.id);

      const stmtLine = await prisma.bankStatementLine.create({
        data: {
          organizationId: suvarnaOrg.id,
          importId: stmtImport.id,
          bankAccountId: bankAcc.id,
          lineNumber: 1,
          transactionDate: new Date('2026-10-25T14:00:00Z'),
          description: 'CR/UPI/998811/MATCHED',
          lineType: 'CREDIT',
          amount: '15000.00',
          reconciliationStatus: 'MATCHED',
        },
      });
      createdStatementLineIds.push(stmtLine.id);

      const match = await prisma.reconciliationMatch.create({
        data: {
          organizationId: suvarnaOrg.id,
          statementLineId: stmtLine.id,
          matchType: 'MANUAL_MATCH',
          matchedAmount: '15000.00',
          status: 'CONFIRMED',
          matchedByUserId: ownerUser.id,
        },
      });
      createdMatchIds.push(match.id);

      // Attempting to delete the statement line MUST be rejected by Postgres RESTRICT constraint
      await expect(
        prisma.bankStatementLine.delete({
          where: { id: stmtLine.id },
        })
      ).rejects.toThrow();

      // Verify line and match are preserved
      const preservedLine = await prisma.bankStatementLine.findUnique({
        where: { id: stmtLine.id },
      });
      const preservedMatch = await prisma.reconciliationMatch.findUnique({
        where: { id: match.id },
      });
      expect(preservedLine).not.toBeNull();
      expect(preservedMatch).not.toBeNull();
    });

    it('verifies bank account deactivation preserves all imported lines and matches', async () => {
      const ledgerAcc1040 = await prisma.ledgerAccount.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, code: '1040' },
      });
      const bankAcc = await bankAccountService.createBankAccount(ownerCtx, {
        accountName: `Deactivation Bank - ${Date.now()}`,
        bankName: 'SBI Bank',
        accountNumberMasked: '******1199',
        ledgerAccountId: ledgerAcc1040.id,
      });
      createdBankAccountIds.push(bankAcc.id);

      const stmtImport = await prisma.bankStatementImport.create({
        data: {
          organizationId: suvarnaOrg.id,
          bankAccountId: bankAcc.id,
          sourceType: 'BANK_STATEMENT',
          fileName: 'Deact_Evidence.csv',
          fileHash: `deact-hash-${Date.now()}`,
          importedByUserId: ownerUser.id,
        },
      });
      createdImportIds.push(stmtImport.id);

      const stmtLine = await prisma.bankStatementLine.create({
        data: {
          organizationId: suvarnaOrg.id,
          importId: stmtImport.id,
          bankAccountId: bankAcc.id,
          lineNumber: 1,
          transactionDate: new Date('2026-10-25T15:00:00Z'),
          description: 'CR/IMPS/DEACT_PRESERVE',
          lineType: 'CREDIT',
          amount: '30000.00',
        },
      });
      createdStatementLineIds.push(stmtLine.id);

      // Ordinary bank account deactivation
      const deactivated = await bankAccountService.deactivateBankAccount(ownerCtx, bankAcc.id);
      expect(deactivated.isActive).toBe(false);

      // Verify all child historical evidence remains intact
      const lines = await prisma.bankStatementLine.findMany({
        where: { bankAccountId: bankAcc.id },
      });
      expect(lines).toHaveLength(1);
      expect(lines[0].id).toBe(stmtLine.id);
    });
  });
});
