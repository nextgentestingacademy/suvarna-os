import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Organization, Branch, User } from '@prisma/client';
import { SecurityContext, AuthorizationError } from '@/types/security';
import {
  BankStatementImporter,
  StatementValidationError,
  StatementAlreadyImportedError,
  StatementSecurityError,
  CsvColumnMapping,
} from '@/lib/reconciliation';
import { BankAccountService } from '@/lib/bank-accounts';
import { LedgerService } from '@/lib/ledger';

const prisma = new PrismaClient();
const importer = new BankStatementImporter({ prisma });
const bankAccountService = new BankAccountService({ prisma });
const ledgerService = new LedgerService({ prisma });

describe('Suvarna Milestone 4D-2 — Statement Import and Duplicate Detection Integration Tests', () => {
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
  let fortOnlyAccountantCtx: SecurityContext;
  let kalyanOwnerCtx: SecurityContext;

  let suvarnaActiveAccountId: string;
  let suvarnaVashiAccountId: string;
  let suvarnaInactiveAccountId: string;
  let kalyanAccountId: string;

  const createdBankAccountIds: string[] = [];
  const createdImportIds: string[] = [];

  const standardMapping: CsvColumnMapping = {
    dateColumn: 'Date',
    descriptionColumn: 'Narration',
    referenceColumn: 'Chq/Ref No',
    amountMode: 'SEPARATE_COLUMNS',
    debitColumn: 'Withdrawal Amt',
    creditColumn: 'Deposit Amt',
    balanceColumn: 'Closing Balance',
    dateFormat: 'DD/MM/YYYY',
  };

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

    fortOnlyAccountantCtx = {
      userId: accountantUser.id,
      userEmail: accountantUser.email,
      tenantId: suvarnaOrg.id,
      tenantSlug: suvarnaOrg.slug,
      membershipId: 'mem-acct-suvarna-fort-only',
      role: 'ACCOUNTANT',
      activeBranchId: fortBranch.id,
      allowedBranchIds: [fortBranch.id], // Restricted to FORT branch only
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
      activeBranchId: kalyanBranch.id,
      allowedBranchIds: [kalyanBranch.id],
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

    // 5. Create test BankAccounts
    // A: Suvarna Central Active Account
    const accA = await bankAccountService.createBankAccount(ownerCtx, {
      accountName: 'HDFC Statement Import Test A/C',
      bankName: 'HDFC Bank',
      accountNumberMasked: '******111222',
      ifscCode: 'HDFC0000001',
      accountType: 'CURRENT',
      ledgerAccountId: suvarnaLedger1040.id,
    });
    suvarnaActiveAccountId = accA.id;
    createdBankAccountIds.push(accA.id);

    // B: Suvarna Branch-scoped Account (Vashi Branch)
    const accB = await bankAccountService.createBankAccount(ownerCtx, {
      accountName: 'ICICI Vashi Branch A/C',
      bankName: 'ICICI Bank',
      accountNumberMasked: '******333444',
      ifscCode: 'ICIC0000002',
      accountType: 'CURRENT',
      branchId: vashiBranch.id,
      ledgerAccountId: suvarnaLedger1040.id,
    });
    suvarnaVashiAccountId = accB.id;
    createdBankAccountIds.push(accB.id);

    // C: Suvarna Inactive Account
    const accC = await bankAccountService.createBankAccount(ownerCtx, {
      accountName: 'Axis Inactive Test A/C',
      bankName: 'Axis Bank',
      accountNumberMasked: '******555666',
      ifscCode: 'UTIB0000003',
      accountType: 'CURRENT',
      ledgerAccountId: suvarnaLedger1040.id,
    });
    // Mark inactive
    await prisma.bankAccount.update({
      where: { id: accC.id },
      data: { isActive: false },
    });
    suvarnaInactiveAccountId = accC.id;
    createdBankAccountIds.push(accC.id);

    // D: Kalyan Bank Account (Different Tenant)
    const accD = await bankAccountService.createBankAccount(kalyanOwnerCtx, {
      accountName: 'SBI Kalyan Account',
      bankName: 'State Bank of India',
      accountNumberMasked: '******666555',
      ifscCode: 'SBIN0000004',
      accountType: 'CURRENT',
      ledgerAccountId: kalyanLedger1040.id,
    });
    kalyanAccountId = accD.id;
    createdBankAccountIds.push(accD.id);
  });

  afterAll(async () => {
    // 1. Delete all statement lines for created imports
    if (createdImportIds.length > 0) {
      await prisma.bankStatementLine.deleteMany({
        where: { importId: { in: createdImportIds } },
      });
      // 2. Delete created imports
      await prisma.bankStatementImport.deleteMany({
        where: { id: { in: createdImportIds } },
      });
    }

    // 3. Delete created bank accounts
    if (createdBankAccountIds.length > 0) {
      await prisma.bankAccount.deleteMany({
        where: { id: { in: createdBankAccountIds } },
      });
    }

    await prisma.$disconnect();
  });

  // ============================================================================
  // TEST SUITE 1: SUCCESSFUL IMPORT & SCHEMA VERIFICATION
  // ============================================================================
  describe('Successful Statement Import', () => {
    it('imports a valid CSV statement with credit, debit, and quotes', async () => {
      const csvData = [
        'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
        '25/10/2026,"UPI/529910/Kavita Sharma",UPI529910,,55000.00,155000.00',
        '25/10/2026,"NEFT/667788/Bullion Refiner",NEFT667788,25000.00,,130000.00',
        '26/10/2026,"POS Settlement / Merchant 900",EDC90022,,12450.00,142450.00',
      ].join('\n');

      const result = await importer.importStatement(accountantCtx, {
        bankAccountId: suvarnaActiveAccountId,
        fileName: 'hdfc_statement_oct2026.csv',
        fileContent: csvData,
        sourceType: 'BANK_STATEMENT',
        columnMapping: standardMapping,
      });

      expect(result.importId).toBeDefined();
      expect(result.bankAccountId).toBe(suvarnaActiveAccountId);
      expect(result.fileName).toBe('hdfc_statement_oct2026.csv');
      expect(result.linesCount).toBe(3);
      expect(result.status).toBe('PROCESSED');
      expect(result.fileHash).toHaveLength(64);

      createdImportIds.push(result.importId);

      // Verify BankStatementImport record in database
      const dbImport = await prisma.bankStatementImport.findUniqueOrThrow({
        where: { id: result.importId },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });

      expect(dbImport.organizationId).toBe(suvarnaOrg.id);
      expect(dbImport.bankAccountId).toBe(suvarnaActiveAccountId);
      expect(dbImport.importedByUserId).toBe(accountantUser.id);
      expect(dbImport.totalLinesCount).toBe(3);
      expect(dbImport.sourceType).toBe('BANK_STATEMENT');
      expect(dbImport.fileFormat).toBe('GENERIC_CSV');

      // Dates should reflect earliest and latest dates
      expect(dbImport.statementStartDate?.toISOString().startsWith('2026-10-25')).toBe(true);
      expect(dbImport.statementEndDate?.toISOString().startsWith('2026-10-26')).toBe(true);

      // Verify line details
      expect(dbImport.lines).toHaveLength(3);

      const [line1, line2, line3] = dbImport.lines;

      // Line 1: Credit ₹55,000.00
      expect(line1.lineNumber).toBe(1);
      expect(line1.description).toBe('UPI/529910/Kavita Sharma');
      expect(line1.referenceNumber).toBe('UPI529910');
      expect(line1.lineType).toBe('CREDIT');
      expect(line1.amount.toString()).toBe('55000');
      expect(line1.runningBalance?.toString()).toBe('155000');
      expect(line1.reconciliationStatus).toBe('UNMATCHED');
      expect(line1.duplicateFingerprint).toHaveLength(64);

      // Line 2: Debit ₹25,000.00
      expect(line2.lineNumber).toBe(2);
      expect(line2.description).toBe('NEFT/667788/Bullion Refiner');
      expect(line2.referenceNumber).toBe('NEFT667788');
      expect(line2.lineType).toBe('DEBIT');
      expect(line2.amount.toString()).toBe('25000');
      expect(line2.runningBalance?.toString()).toBe('130000');
      expect(line2.reconciliationStatus).toBe('UNMATCHED');

      // Line 3: Credit ₹12,450.00
      expect(line3.lineNumber).toBe(3);
      expect(line3.lineType).toBe('CREDIT');
      expect(line3.amount.toString()).toBe('12450');
    });

    it('records an audit log entry for the bank statement import', async () => {
      const csvData = [
        'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
        '27/10/2026,Audit Check Deposit,REF-AUDIT-1,,10000.00,10000.00',
      ].join('\n');

      const result = await importer.importStatement(ownerCtx, {
        bankAccountId: suvarnaActiveAccountId,
        fileName: 'audit_test_statement.csv',
        fileContent: csvData,
        columnMapping: standardMapping,
      });
      createdImportIds.push(result.importId);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityType: 'BankStatementImport',
          entityId: result.importId,
          organizationId: suvarnaOrg.id,
        },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.action).toBe('CREATE');
      expect(auditLog?.userId).toBe(ownerUser.id);
      expect(auditLog?.changedFields).toMatchObject({
        fileName: 'audit_test_statement.csv',
        totalLinesCount: 1,
        bankAccountId: suvarnaActiveAccountId,
      });
    });
  });

  // ============================================================================
  // TEST SUITE 2: DUPLICATE DETECTION (FILE-LEVEL & LINE-LEVEL)
  // ============================================================================
  describe('Duplicate Detection', () => {
    it('rejects duplicate file upload with StatementAlreadyImportedError', async () => {
      const csvData = [
        'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
        '28/10/2026,Unique File Import 100,REF100,,7500.00,7500.00',
      ].join('\n');

      // First upload succeeds
      const firstResult = await importer.importStatement(accountantCtx, {
        bankAccountId: suvarnaActiveAccountId,
        fileName: 'unique_monthly_oct.csv',
        fileContent: csvData,
        columnMapping: standardMapping,
      });
      createdImportIds.push(firstResult.importId);

      // Second upload with the exact same content and bank account must fail
      await expect(
        importer.importStatement(accountantCtx, {
          bankAccountId: suvarnaActiveAccountId,
          fileName: 'unique_monthly_oct_renamed.csv',
          fileContent: csvData,
          columnMapping: standardMapping,
        })
      ).rejects.toThrow(StatementAlreadyImportedError);

      try {
        await importer.importStatement(accountantCtx, {
          bankAccountId: suvarnaActiveAccountId,
          fileName: 'unique_monthly_oct_renamed.csv',
          fileContent: csvData,
          columnMapping: standardMapping,
        });
      } catch (err: any) {
        expect(err).toBeInstanceOf(StatementAlreadyImportedError);
        expect(err.code).toBe('FILE_ALREADY_IMPORTED');
        expect(err.existingImportId).toBe(firstResult.importId);
      }
    });

    it('allows same file content to be imported into a DIFFERENT bank account (tenant-scoped)', async () => {
      // The same settlement CSV might be applicable to another account if legitimate
      const csvData = [
        'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
        '28/10/2026,Multi Account Content,REF-MULTI,,8800.00,8800.00',
      ].join('\n');

      const res1 = await importer.importStatement(ownerCtx, {
        bankAccountId: suvarnaActiveAccountId,
        fileName: 'multi_account_file.csv',
        fileContent: csvData,
        columnMapping: standardMapping,
      });
      createdImportIds.push(res1.importId);

      const res2 = await importer.importStatement(ownerCtx, {
        bankAccountId: suvarnaVashiAccountId,
        fileName: 'multi_account_file.csv',
        fileContent: csvData,
        columnMapping: standardMapping,
      });
      createdImportIds.push(res2.importId);

      expect(res1.importId).not.toBe(res2.importId);
    });

    it('preserves duplicate-looking lines as distinct records with identical fingerprints', async () => {
      // Two identical transactions on the same date with identical amounts (e.g. 2 cash deposits of ₹10,000)
      const csvData = [
        'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
        '29/10/2026,Cash Deposit Counter 1,CASH-DEP,,10000.00,10000.00',
        '29/10/2026,Cash Deposit Counter 1,CASH-DEP,,10000.00,20000.00',
      ].join('\n');

      const result = await importer.importStatement(accountantCtx, {
        bankAccountId: suvarnaActiveAccountId,
        fileName: 'identical_lines_statement.csv',
        fileContent: csvData,
        columnMapping: standardMapping,
      });
      createdImportIds.push(result.importId);

      const lines = await prisma.bankStatementLine.findMany({
        where: { importId: result.importId },
        orderBy: { lineNumber: 'asc' },
      });

      // Both lines must be preserved
      expect(lines).toHaveLength(2);
      expect(lines[0].lineNumber).toBe(1);
      expect(lines[1].lineNumber).toBe(2);

      // Both lines have the exact same fingerprint for reconciliation review
      expect(lines[0].duplicateFingerprint).toBe(lines[1].duplicateFingerprint);
      expect(lines[0].reconciliationStatus).toBe('UNMATCHED');
      expect(lines[1].reconciliationStatus).toBe('UNMATCHED');
    });
  });

  // ============================================================================
  // TEST SUITE 3: VALIDATION AND ATOMIC ROLLBACK
  // ============================================================================
  describe('Validation and Atomic Rollback', () => {
    it('rolls back completely if a single row has validation errors', async () => {
      const initialImportCount = await prisma.bankStatementImport.count({
        where: { organizationId: suvarnaOrg.id },
      });
      const initialLineCount = await prisma.bankStatementLine.count({
        where: { organizationId: suvarnaOrg.id },
      });

      const invalidCsv = [
        'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
        '25/10/2026,Valid Line 1,REF001,,1500.00,1500.00',
        'INVALID-DATE,Malformed Date Row,REF002,500.00,,1000.00',
        '25/10/2026,Conflicting Debit and Credit,REF003,200.00,300.00,1100.00',
      ].join('\n');

      await expect(
        importer.importStatement(accountantCtx, {
          bankAccountId: suvarnaActiveAccountId,
          fileName: 'invalid_rows_statement.csv',
          fileContent: invalidCsv,
          columnMapping: standardMapping,
        })
      ).rejects.toThrow(StatementValidationError);

      // Verify zero records were inserted in the database
      const finalImportCount = await prisma.bankStatementImport.count({
        where: { organizationId: suvarnaOrg.id },
      });
      const finalLineCount = await prisma.bankStatementLine.count({
        where: { organizationId: suvarnaOrg.id },
      });

      expect(finalImportCount).toBe(initialImportCount);
      expect(finalLineCount).toBe(initialLineCount);
    });

    it('rejects oversized files exceeding 5 MB limit', async () => {
      // Create a mock large file content > 5MB
      const line = '25/10/2026,Padding Description Here,REF12345,,100.00,100.00\n';
      const repeatCount = Math.ceil((5.1 * 1024 * 1024) / line.length);
      const oversizedCsv = 'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance\n' + line.repeat(repeatCount);

      await expect(
        importer.importStatement(accountantCtx, {
          bankAccountId: suvarnaActiveAccountId,
          fileName: 'oversized_statement.csv',
          fileContent: oversizedCsv,
          columnMapping: standardMapping,
        })
      ).rejects.toThrow(StatementValidationError);
    });

    it('rejects empty file content', async () => {
      await expect(
        importer.importStatement(accountantCtx, {
          bankAccountId: suvarnaActiveAccountId,
          fileName: 'empty.csv',
          fileContent: '',
          columnMapping: standardMapping,
        })
      ).rejects.toThrow(StatementValidationError);
    });
  });

  // ============================================================================
  // TEST SUITE 4: SECURITY, TENANT ISOLATION & RBAC
  // ============================================================================
  describe('Security, Tenant Isolation & RBAC', () => {
    it('rejects cross-tenant bank account access', async () => {
      const csvData = [
        'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
        '25/10/2026,Cross Tenant Attack,REF999,,5000.00,5000.00',
      ].join('\n');

      // Suvarna owner attempts to import into Kalyan's bank account
      await expect(
        importer.importStatement(ownerCtx, {
          bankAccountId: kalyanAccountId,
          fileName: 'cross_tenant_test.csv',
          fileContent: csvData,
          columnMapping: standardMapping,
        })
      ).rejects.toThrow(StatementSecurityError);

      // Verify no import created for Kalyan
      const kalyanImports = await prisma.bankStatementImport.count({
        where: { bankAccountId: kalyanAccountId },
      });
      expect(kalyanImports).toBe(0);
    });

    it('rejects import into an inactive bank account', async () => {
      const csvData = [
        'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
        '25/10/2026,Inactive Account Import,REF888,,4000.00,4000.00',
      ].join('\n');

      await expect(
        importer.importStatement(ownerCtx, {
          bankAccountId: suvarnaInactiveAccountId,
          fileName: 'inactive_account_test.csv',
          fileContent: csvData,
          columnMapping: standardMapping,
        })
      ).rejects.toThrow(StatementValidationError);
    });

    it('denies access to unauthorized role SALES_STAFF', async () => {
      const csvData = [
        'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
        '25/10/2026,Sales Staff Attempt,REF777,,3000.00,3000.00',
      ].join('\n');

      await expect(
        importer.importStatement(salesCtx, {
          bankAccountId: suvarnaActiveAccountId,
          fileName: 'sales_staff_attempt.csv',
          fileContent: csvData,
          columnMapping: standardMapping,
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it('enforces branch-scoping on branch-specific bank accounts', async () => {
      const csvData = [
        'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
        '25/10/2026,Branch Access Check,REF666,,2000.00,2000.00',
      ].join('\n');

      // fortOnlyAccountantCtx is restricted to FORT branch only
      // suvarnaVashiAccountId is scoped to VASHI branch
      await expect(
        importer.importStatement(fortOnlyAccountantCtx, {
          bankAccountId: suvarnaVashiAccountId,
          fileName: 'branch_access_check.csv',
          fileContent: csvData,
          columnMapping: standardMapping,
        })
      ).rejects.toThrow(AuthorizationError);

      // But full accountantCtx (with VASHI allowed) succeeds
      const result = await importer.importStatement(accountantCtx, {
        bankAccountId: suvarnaVashiAccountId,
        fileName: 'branch_access_permitted.csv',
        fileContent: csvData,
        columnMapping: standardMapping,
      });
      createdImportIds.push(result.importId);
      expect(result.status).toBe('PROCESSED');
    });
  });

  // ============================================================================
  // TEST SUITE 5: ISOLATION FROM BILLING, LEDGER & INVENTORY
  // ============================================================================
  describe('Isolation From Other Subsystems', () => {
    it('does not create any invoices, customer payments, stock movements, or journal entries', async () => {
      const invoiceCountBefore = await prisma.invoice.count({ where: { organizationId: suvarnaOrg.id } });
      const paymentCountBefore = await prisma.invoicePayment.count({ where: { organizationId: suvarnaOrg.id } });
      const stockMovementCountBefore = await prisma.stockMovement.count({ where: { organizationId: suvarnaOrg.id } });
      const journalEntryCountBefore = await prisma.journalEntry.count({ where: { organizationId: suvarnaOrg.id } });

      const csvData = [
        'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
        '30/10/2026,Clean Ingestion Test,ISO-01,,9999.00,9999.00',
      ].join('\n');

      const result = await importer.importStatement(accountantCtx, {
        bankAccountId: suvarnaActiveAccountId,
        fileName: 'isolation_test.csv',
        fileContent: csvData,
        columnMapping: standardMapping,
      });
      createdImportIds.push(result.importId);

      const invoiceCountAfter = await prisma.invoice.count({ where: { organizationId: suvarnaOrg.id } });
      const paymentCountAfter = await prisma.invoicePayment.count({ where: { organizationId: suvarnaOrg.id } });
      const stockMovementCountAfter = await prisma.stockMovement.count({ where: { organizationId: suvarnaOrg.id } });
      const journalEntryCountAfter = await prisma.journalEntry.count({ where: { organizationId: suvarnaOrg.id } });

      expect(invoiceCountAfter).toBe(invoiceCountBefore);
      expect(paymentCountAfter).toBe(paymentCountBefore);
      expect(stockMovementCountAfter).toBe(stockMovementCountBefore);
      expect(journalEntryCountAfter).toBe(journalEntryCountBefore);
    });
  });
});
