import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import {
  LedgerService,
  LedgerValidationError,
  LedgerConflictError,
  LedgerImmutabilityError,
  STARTER_CHART_OF_ACCOUNTS,
} from '@/lib/ledger';
import { SecurityContext, AuthorizationError } from '@/types/security';
import { Decimal } from '@/lib/decimal';

describe('Suvarna Milestone 4B — Double-Entry Ledger Service Integration Tests', () => {
  const service = new LedgerService({ prisma });

  let suvarnaOrg: any;
  let kalyanOrg: any;
  let fortBranch: any;
  let vashiBranch: any;

  let ownerCtx: SecurityContext;
  let salesCtx: SecurityContext;
  let kalyanOwnerCtx: SecurityContext;

  // Track created records for isolated cleanup
  const createdJournalEntryIds: string[] = [];
  const createdAccountIds: string[] = [];

  // Reusable account maps for Suvarna
  let cashAccount: any;
  let metalRevAccount: any;
  let makingRevAccount: any;
  let cgstAccount: any;
  let sgstAccount: any;
  let roundingAccount: any;

  // Reusable account map for Kalyan
  let kalyanCashAccount: any;

  beforeAll(async () => {
    // 1. Resolve seeded Organizations
    suvarnaOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'suvarna-mumbai' } });
    kalyanOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'kalyan-test' } });

    // 2. Resolve seeded Branches & Users
    fortBranch = await prisma.branch.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id, code: 'FORT' },
    });
    vashiBranch = await prisma.branch.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id, code: 'VASHI' },
    });

    const suvarnaOwner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@suvarna.test' } });
    const suvarnaSales = await prisma.user.findUniqueOrThrow({ where: { email: 'sales@suvarna.test' } });
    const kalyanOwner = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@kalyan.test' } });

    // 3. Construct SecurityContext fixtures
    ownerCtx = {
      userId: suvarnaOwner.id,
      userName: suvarnaOwner.name,
      userEmail: suvarnaOwner.email,
      tenantId: suvarnaOrg.id,
      tenantName: 'Suvarna Jewellers Mumbai',
      tenantSlug: 'suvarna-mumbai',
      membershipId: 'mem-suvarna-owner',
      role: 'OWNER',
      activeBranchId: fortBranch.id,
      allowedBranchIds: [fortBranch.id, vashiBranch.id],
    };

    salesCtx = {
      userId: suvarnaSales.id,
      userName: suvarnaSales.name,
      userEmail: suvarnaSales.email,
      tenantId: suvarnaOrg.id,
      tenantName: 'Suvarna Jewellers Mumbai',
      tenantSlug: 'suvarna-mumbai',
      membershipId: 'mem-suvarna-sales',
      role: 'SALES_STAFF',
      activeBranchId: fortBranch.id,
      allowedBranchIds: [fortBranch.id],
    };

    kalyanOwnerCtx = {
      userId: kalyanOwner.id,
      userName: kalyanOwner.name,
      userEmail: kalyanOwner.email,
      tenantId: kalyanOrg.id,
      tenantName: 'Kalyan Test Jewellers',
      tenantSlug: 'kalyan-test',
      membershipId: 'mem-kalyan-owner',
      role: 'OWNER',
      allowedBranchIds: [],
    };

    // 4. Initialize Starter COA for both tenants
    const suvarnaAccounts = await service.initChartOfAccounts(ownerCtx);
    const kalyanAccounts = await service.initChartOfAccounts(kalyanOwnerCtx);

    cashAccount = suvarnaAccounts.find((a) => a.code === '1010')!;
    metalRevAccount = suvarnaAccounts.find((a) => a.code === '4010')!;
    makingRevAccount = suvarnaAccounts.find((a) => a.code === '4020')!;
    cgstAccount = suvarnaAccounts.find((a) => a.code === '2010')!;
    sgstAccount = suvarnaAccounts.find((a) => a.code === '2020')!;
    roundingAccount = suvarnaAccounts.find((a) => a.code === '4090')!;

    kalyanCashAccount = kalyanAccounts.find((a) => a.code === '1010')!;
  });

  afterAll(async () => {
    // Clean up created journal entries and lines in test
    if (createdJournalEntryIds.length > 0) {
      await prisma.journalLine.deleteMany({
        where: { journalEntryId: { in: createdJournalEntryIds } },
      });
      await prisma.journalEntry.deleteMany({
        where: { id: { in: createdJournalEntryIds } },
      });
    }

    if (createdAccountIds.length > 0) {
      await prisma.ledgerAccount.deleteMany({
        where: { id: { in: createdAccountIds } },
      });
    }
  });

  describe('1. Idempotent Chart of Accounts Initialization', () => {
    it('creates all 19 starter accounts on first run', async () => {
      const accounts = await service.listAccounts(ownerCtx);
      expect(accounts.length).toBeGreaterThanOrEqual(19);

      const codes = accounts.map((a) => a.code);
      for (const starter of STARTER_CHART_OF_ACCOUNTS) {
        expect(codes).toContain(starter.code);
      }
    });

    it('is safe to run repeatedly and does not overwrite customized account names', async () => {
      // Create a custom account name for 1010
      await prisma.ledgerAccount.update({
        where: {
          organizationId_code: {
            organizationId: suvarnaOrg.id,
            code: '1010',
          },
        },
        data: { name: 'Main Fort Cash Vault' },
      });

      // Re-run initializer
      const accountsAfter = await service.initChartOfAccounts(ownerCtx);
      const updated1010 = accountsAfter.find((a) => a.code === '1010');

      // Must preserve the custom name
      expect(updated1010?.name).toBe('Main Fort Cash Vault');

      // Restore standard name
      await prisma.ledgerAccount.update({
        where: {
          organizationId_code: {
            organizationId: suvarnaOrg.id,
            code: '1010',
          },
        },
        data: { name: 'Cash on Hand' },
      });
    });

    it('denies chart-of-accounts access to unauthorized roles (SALES_STAFF)', async () => {
      await expect(service.initChartOfAccounts(salesCtx)).rejects.toThrow(AuthorizationError);
    });
  });

  describe('2. Valid Balanced Journal Entry Posting', () => {
    it('posts a multi-line balanced entry with exact Decimal sums and status POSTED', async () => {
      const result = await service.postJournalEntry(ownerCtx, {
        branchId: fortBranch.id,
        sourceType: 'INVOICE',
        sourceId: 'inv-test-001',
        idempotencyKey: 'idemp-valid-001',
        narration: 'Retail sale invoice INV/FORT/26-27/0001 settlement',
        lines: [
          {
            accountId: cashAccount.id,
            debitAmount: '239166.00',
            creditAmount: '0.00',
            narration: 'Cash received at counter',
          },
          {
            accountId: metalRevAccount.id,
            debitAmount: '0.00',
            creditAmount: '218700.00',
            narration: 'Gold 22K 18g metal value',
          },
          {
            accountId: makingRevAccount.id,
            debitAmount: '0.00',
            creditAmount: '13500.00',
            narration: 'Making charges @ 750/g',
          },
          {
            accountId: cgstAccount.id,
            debitAmount: '0.00',
            creditAmount: '3483.00',
            narration: '1.5% Output CGST',
          },
          {
            accountId: sgstAccount.id,
            debitAmount: '0.00',
            creditAmount: '3483.00',
            narration: '1.5% Output SGST',
          },
        ],
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.entry.id).toBeDefined();
      createdJournalEntryIds.push(result.entry.id);

      expect(result.entry.status).toBe('POSTED');
      expect(result.entry.organizationId).toBe(suvarnaOrg.id);
      expect(result.entry.branchId).toBe(fortBranch.id);
      expect(result.entry.totalDebit.toString()).toBe('239166');
      expect(result.entry.totalCredit.toString()).toBe('239166');
      expect(result.entry.lines).toHaveLength(5);
      expect(result.entry.entryNumber).toMatch(/^JE\/\d{2}-\d{2}\/\d{5}$/);

      // Verify lines in database
      const dbLines = await prisma.journalLine.findMany({
        where: { journalEntryId: result.entry.id },
        orderBy: { lineNumber: 'asc' },
      });
      expect(dbLines).toHaveLength(5);
      expect(dbLines[0].debitAmount.toString()).toBe('239166');
      expect(dbLines[0].creditAmount.toString()).toBe('0');
    });

    it('supports explicitly provided entry numbers when unique', async () => {
      const explicitEntryNumber = `JE-MANUAL-${Date.now()}`;
      const result = await service.postJournalEntry(ownerCtx, {
        branchId: fortBranch.id,
        entryNumber: explicitEntryNumber,
        sourceType: 'MANUAL',
        lines: [
          {
            accountId: cashAccount.id,
            debitAmount: '500.00',
            creditAmount: '0.00',
          },
          {
            accountId: roundingAccount.id,
            debitAmount: '0.00',
            creditAmount: '500.00',
          },
        ],
      });

      expect(result.entry.entryNumber).toBe(explicitEntryNumber);
      createdJournalEntryIds.push(result.entry.id);
    });

    it('rejects duplicate entry numbers within the organization', async () => {
      const duplicateNumber = `JE-DUP-${Date.now()}`;
      const first = await service.postJournalEntry(ownerCtx, {
        entryNumber: duplicateNumber,
        sourceType: 'MANUAL',
        lines: [
          { accountId: cashAccount.id, debitAmount: '100.00', creditAmount: '0.00' },
          { accountId: roundingAccount.id, debitAmount: '0.00', creditAmount: '100.00' },
        ],
      });
      createdJournalEntryIds.push(first.entry.id);

      await expect(
        service.postJournalEntry(ownerCtx, {
          entryNumber: duplicateNumber,
          sourceType: 'MANUAL',
          lines: [
            { accountId: cashAccount.id, debitAmount: '100.00', creditAmount: '0.00' },
            { accountId: roundingAccount.id, debitAmount: '0.00', creditAmount: '100.00' },
          ],
        })
      ).rejects.toThrow(LedgerConflictError);
    });
  });

  describe('3. Unbalanced Entry Rejection & Zero Orphaned Headers', () => {
    it('rejects an unbalanced entry and persists nothing to database', async () => {
      const countBefore = await prisma.journalEntry.count({
        where: { organizationId: suvarnaOrg.id },
      });

      await expect(
        service.postJournalEntry(ownerCtx, {
          branchId: fortBranch.id,
          sourceType: 'INVOICE',
          lines: [
            {
              accountId: cashAccount.id,
              debitAmount: '1000.00',
              creditAmount: '0.00',
            },
            {
              accountId: metalRevAccount.id,
              debitAmount: '0.00',
              creditAmount: '999.00', // Unbalanced by ₹1.00
            },
          ],
        })
      ).rejects.toThrow(LedgerValidationError);

      const countAfter = await prisma.journalEntry.count({
        where: { organizationId: suvarnaOrg.id },
      });
      expect(countAfter).toBe(countBefore);
    });

    it('rejects entries with fewer than 2 lines', async () => {
      await expect(
        service.postJournalEntry(ownerCtx, {
          sourceType: 'INVOICE',
          lines: [
            {
              accountId: cashAccount.id,
              debitAmount: '100.00',
              creditAmount: '0.00',
            },
          ],
        })
      ).rejects.toThrow(LedgerValidationError);
    });
  });

  describe('4. Invalid Line Constraints Rejection', () => {
    it('rejects lines with negative amounts', async () => {
      await expect(
        service.postJournalEntry(ownerCtx, {
          sourceType: 'MANUAL',
          lines: [
            { accountId: cashAccount.id, debitAmount: '-500.00', creditAmount: '0.00' },
            { accountId: roundingAccount.id, debitAmount: '0.00', creditAmount: '-500.00' },
          ],
        })
      ).rejects.toThrow(LedgerValidationError);
    });

    it('rejects lines with both debit and credit positive', async () => {
      await expect(
        service.postJournalEntry(ownerCtx, {
          sourceType: 'MANUAL',
          lines: [
            { accountId: cashAccount.id, debitAmount: '500.00', creditAmount: '500.00' },
            { accountId: roundingAccount.id, debitAmount: '0.00', creditAmount: '1000.00' },
          ],
        })
      ).rejects.toThrow(LedgerValidationError);
    });

    it('rejects lines with zero debit and zero credit', async () => {
      await expect(
        service.postJournalEntry(ownerCtx, {
          sourceType: 'MANUAL',
          lines: [
            { accountId: cashAccount.id, debitAmount: '0.00', creditAmount: '0.00' },
            { accountId: roundingAccount.id, debitAmount: '100.00', creditAmount: '100.00' },
          ],
        })
      ).rejects.toThrow(LedgerValidationError);
    });
  });

  describe('5. Cross-Tenant Isolation Enforcement', () => {
    it('rejects journal lines referencing accounts from a different organization', async () => {
      // Kalyan Cash Account passed inside Suvarna context
      await expect(
        service.postJournalEntry(ownerCtx, {
          sourceType: 'MANUAL',
          lines: [
            { accountId: kalyanCashAccount.id, debitAmount: '100.00', creditAmount: '0.00' },
            { accountId: metalRevAccount.id, debitAmount: '0.00', creditAmount: '100.00' },
          ],
        })
      ).rejects.toThrow(LedgerValidationError);
    });

    it('rejects branches that do not belong to the active organization', async () => {
      const kalyanThaneBranch = await prisma.branch.findFirstOrThrow({
        where: { organizationId: kalyanOrg.id, code: 'THANE' },
      });

      await expect(
        service.postJournalEntry(ownerCtx, {
          branchId: kalyanThaneBranch.id, // Foreign branch under Suvarna context
          sourceType: 'MANUAL',
          lines: [
            { accountId: cashAccount.id, debitAmount: '100.00', creditAmount: '0.00' },
            { accountId: roundingAccount.id, debitAmount: '0.00', creditAmount: '100.00' },
          ],
        })
      ).rejects.toThrow(LedgerValidationError);
    });

    it('strictly isolates journal entry queries between tenants', async () => {
      // Post an entry in Suvarna
      const suvarnaEntry = await service.postJournalEntry(ownerCtx, {
        sourceType: 'MANUAL',
        lines: [
          { accountId: cashAccount.id, debitAmount: '150.00', creditAmount: '0.00' },
          { accountId: roundingAccount.id, debitAmount: '0.00', creditAmount: '150.00' },
        ],
      });
      createdJournalEntryIds.push(suvarnaEntry.entry.id);

      // Kalyan owner attempts to get Suvarna entry
      await expect(
        service.getJournalEntryById(kalyanOwnerCtx, suvarnaEntry.entry.id)
      ).rejects.toThrow();
    });
  });

  describe('6. Idempotency & Duplicate Protection', () => {
    it('returns the existing entry and does not create duplicates when posting with duplicate idempotency key', async () => {
      const idempotencyKey = `idemp-dup-test-${Date.now()}`;

      const firstPost = await service.postJournalEntry(ownerCtx, {
        idempotencyKey,
        sourceType: 'INVOICE',
        sourceId: 'inv-dup-001',
        lines: [
          { accountId: cashAccount.id, debitAmount: '750.00', creditAmount: '0.00' },
          { accountId: roundingAccount.id, debitAmount: '0.00', creditAmount: '750.00' },
        ],
      });
      expect(firstPost.isDuplicate).toBe(false);
      createdJournalEntryIds.push(firstPost.entry.id);

      const totalCountBefore = await prisma.journalEntry.count({
        where: { organizationId: suvarnaOrg.id },
      });

      // Second post with exact same idempotencyKey
      const secondPost = await service.postJournalEntry(ownerCtx, {
        idempotencyKey,
        sourceType: 'INVOICE',
        sourceId: 'inv-dup-001',
        lines: [
          { accountId: cashAccount.id, debitAmount: '750.00', creditAmount: '0.00' },
          { accountId: roundingAccount.id, debitAmount: '0.00', creditAmount: '750.00' },
        ],
      });

      expect(secondPost.isDuplicate).toBe(true);
      expect(secondPost.entry.id).toBe(firstPost.entry.id);
      expect(secondPost.entry.entryNumber).toBe(firstPost.entry.entryNumber);

      const totalCountAfter = await prisma.journalEntry.count({
        where: { organizationId: suvarnaOrg.id },
      });
      expect(totalCountAfter).toBe(totalCountBefore);
    });
  });

  describe('7. Ledger Immutability Enforcement', () => {
    it('prevents direct mutation or deletion of posted journal entries through the service', async () => {
      await expect(service.updateJournalEntry()).rejects.toThrow(LedgerImmutabilityError);
      await expect(service.deleteJournalEntry()).rejects.toThrow(LedgerImmutabilityError);
    });
  });

  describe('8. Reversal References & Audit Trail', () => {
    it('allows a reversal entry referencing the original journal entry within the tenant', async () => {
      // 1. Post original sale
      const original = await service.postJournalEntry(ownerCtx, {
        sourceType: 'INVOICE',
        sourceId: 'inv-rev-001',
        narration: 'Original sale to be refunded',
        lines: [
          { accountId: cashAccount.id, debitAmount: '1200.00', creditAmount: '0.00' },
          { accountId: metalRevAccount.id, debitAmount: '0.00', creditAmount: '1200.00' },
        ],
      });
      createdJournalEntryIds.push(original.entry.id);

      // 2. Post reversal entry referencing original.entry.id
      const reversal = await service.postJournalEntry(ownerCtx, {
        sourceType: 'REVERSAL',
        sourceId: 'inv-rev-001-refund',
        reversalOfId: original.entry.id,
        narration: `Reversal of journal entry ${original.entry.entryNumber}`,
        lines: [
          { accountId: metalRevAccount.id, debitAmount: '1200.00', creditAmount: '0.00' },
          { accountId: cashAccount.id, debitAmount: '0.00', creditAmount: '1200.00' },
        ],
      });
      createdJournalEntryIds.push(reversal.entry.id);

      expect(reversal.entry.reversalOfId).toBe(original.entry.id);

      // Verify audit logs were recorded
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: suvarnaOrg.id,
          entityType: 'JournalEntry',
          entityId: reversal.entry.id,
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.action).toBe('CREATE');
    });

    it('rejects reversal referencing an entry belonging to another organization', async () => {
      // Post in Kalyan
      const kalyanEntry = await service.postJournalEntry(kalyanOwnerCtx, {
        sourceType: 'MANUAL',
        lines: [
          { accountId: kalyanCashAccount.id, debitAmount: '500.00', creditAmount: '0.00' },
          {
            accountId: (await service.listAccounts(kalyanOwnerCtx)).find((a) => a.code === '4090')!.id,
            debitAmount: '0.00',
            creditAmount: '500.00',
          },
        ],
      });
      createdJournalEntryIds.push(kalyanEntry.entry.id);

      // Suvarna attempts to reverse Kalyan entry
      await expect(
        service.postJournalEntry(ownerCtx, {
          sourceType: 'REVERSAL',
          reversalOfId: kalyanEntry.entry.id,
          lines: [
            { accountId: cashAccount.id, debitAmount: '500.00', creditAmount: '0.00' },
            { accountId: roundingAccount.id, debitAmount: '0.00', creditAmount: '500.00' },
          ],
        })
      ).rejects.toThrow(LedgerValidationError);
    });
  });
});
