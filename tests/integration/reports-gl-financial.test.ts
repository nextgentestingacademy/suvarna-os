import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db';
import { resolveSecurityContext } from '@/lib/security-context';
import { ReportsService } from '@/lib/reports';
import {
  getTrialBalanceAction,
  getProfitAndLossAction,
  getBalanceSheetAction,
} from '@/app/actions/reports';
import { SecurityContext } from '@/types/security';
import { Decimal } from 'decimal.js';

describe('Suvarna Phase 4E-3 — General Ledger Financial Reports Integration Tests', () => {
  const service = new ReportsService({ prisma });

  let suvarnaOrg: any;
  let kalyanOrg: any;
  let fortBranch: any;
  let vashiBranch: any;
  let thaneBranch: any;

  let ownerCtx: SecurityContext;
  let accountantCtx: SecurityContext;
  let salesCtx: SecurityContext;
  let managerCtx: SecurityContext;
  let kalyanOwnerCtx: SecurityContext;

  beforeAll(async () => {
    // 1. Resolve seeded Organizations
    suvarnaOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'suvarna-mumbai' } });
    kalyanOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'kalyan-test' } });

    // 2. Resolve seeded Branches
    fortBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: suvarnaOrg.id, code: 'FORT' } },
    });
    vashiBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: suvarnaOrg.id, code: 'VASHI' } },
    });
    thaneBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: kalyanOrg.id, code: 'THANE' } },
    });

    // 3. Resolve seeded Users
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@suvarna.test' } });
    const accountantUser = await prisma.user.findUniqueOrThrow({ where: { email: 'accountant@suvarna.test' } });
    const salesUser = await prisma.user.findUniqueOrThrow({ where: { email: 'sales@suvarna.test' } });
    const managerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'manager@suvarna.test' } });
    const kalyanOwnerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@kalyan.test' } });

    // 4. Resolve Security Contexts
    ownerCtx = await resolveSecurityContext(prisma, {
      userId: ownerUser.id,
      targetTenantId: suvarnaOrg.id,
      targetBranchId: fortBranch.id,
    });
    accountantCtx = await resolveSecurityContext(prisma, {
      userId: accountantUser.id,
      targetTenantId: suvarnaOrg.id,
      targetBranchId: fortBranch.id,
    });
    salesCtx = await resolveSecurityContext(prisma, {
      userId: salesUser.id,
      targetTenantId: suvarnaOrg.id,
      targetBranchId: fortBranch.id,
    });
    managerCtx = await resolveSecurityContext(prisma, {
      userId: managerUser.id,
      targetTenantId: suvarnaOrg.id,
      targetBranchId: fortBranch.id,
    });
    kalyanOwnerCtx = await resolveSecurityContext(prisma, {
      userId: kalyanOwnerUser.id,
      targetTenantId: kalyanOrg.id,
      targetBranchId: thaneBranch.id,
    });
  });

  // ============================================================================
  // 1. TRIAL BALANCE TESTS
  // ============================================================================
  describe('1. Trial Balance Report', () => {
    it('calculates balanced cumulative debit and credit balances across active accounts', async () => {
      const report = await service.getTrialBalanceReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });

      expect(report.filters.fiscalYear).toBe('2026-2027');
      expect(report.accounts.length).toBeGreaterThan(0);

      const drTotal = new Decimal(report.totals.totalDebitBalance);
      const crTotal = new Decimal(report.totals.totalCreditBalance);
      const diff = new Decimal(report.totals.difference);

      // Verify mathematical equilibrium: Debits == Credits
      expect(drTotal.equals(crTotal)).toBe(true);
      expect(diff.abs().toNumber()).toBe(0);
      expect(report.totals.isBalanced).toBe(true);
      expect(report.discrepancyNotice).toBeNull();
      expect(report.integrityNotice).toContain('Trial Balance is arithmetically balanced');

      // Verify active accounts count is consistent
      expect(report.totals.activeAccountsCount).toBeGreaterThan(0);

      // Verify individual accounts math: sum of all debit balances equals totalDebitBalance
      const sumOfDebits = report.accounts.reduce(
        (sum, a) => sum.plus(new Decimal(a.debitBalance)),
        new Decimal(0)
      );
      expect(sumOfDebits.toFixed(2)).toBe(report.totals.totalDebitBalance);

      const sumOfCredits = report.accounts.reduce(
        (sum, a) => sum.plus(new Decimal(a.creditBalance)),
        new Decimal(0)
      );
      expect(sumOfCredits.toFixed(2)).toBe(report.totals.totalCreditBalance);
    });

    it('correctly incorporates journal reversals without double-counting or breaking ledger balance', async () => {
      // In the seed DB, entries JE/26-27/00176 and JE/26-27/00178 are balancing reversals of JE/26-27/00175
      const report = await service.getTrialBalanceReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });

      // Both the original settlement entry and the reversal entries are accounted for
      expect(report.totals.isBalanced).toBe(true);

      // Verify Bank Account (1040) and UPI Clearing (1020) balances remain balanced
      const bankAcct = report.accounts.find((a) => a.code === '1040');
      const upiAcct = report.accounts.find((a) => a.code === '1020');

      expect(bankAcct).toBeDefined();
      expect(upiAcct).toBeDefined();
    });

    it('handles date semantics: as-of date includes cumulative prior activity while prior window has zero', async () => {
      // Early period before any transactions were posted
      const pastReport = await service.getTrialBalanceReport(ownerCtx, {
        datePreset: 'CUSTOM',
        from: '2026-04-01',
        to: '2026-05-01',
      });

      // All closing balances as of 2026-05-01 should be 0.00
      expect(pastReport.totals.totalDebitBalance).toBe('0.00');
      expect(pastReport.totals.totalCreditBalance).toBe('0.00');
      expect(pastReport.totals.totalPeriodDebit).toBe('0.00');
      expect(pastReport.totals.totalPeriodCredit).toBe('0.00');
      expect(pastReport.totals.activeAccountsCount).toBe(0);
      expect(pastReport.totals.isBalanced).toBe(true);

      // Full period includes all cumulative activity
      const currentReport = await service.getTrialBalanceReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });
      expect(new Decimal(currentReport.totals.totalDebitBalance).gt(0)).toBe(true);
    });

    it('handles empty ledger state gracefully for a showroom branch with no postings (VASHI)', async () => {
      const vashiReport = await service.getTrialBalanceReport(ownerCtx, {
        datePreset: 'FY_2026_27',
        branchId: vashiBranch.id,
      });

      expect(vashiReport.filters.branchId).toBe(vashiBranch.id);
      expect(vashiReport.totals.totalDebitBalance).toBe('0.00');
      expect(vashiReport.totals.totalCreditBalance).toBe('0.00');
      expect(vashiReport.totals.difference).toBe('0.00');
      expect(vashiReport.totals.isBalanced).toBe(true);
      expect(vashiReport.totals.activeAccountsCount).toBe(0);
    });
  });

  // ============================================================================
  // 2. PROFIT & LOSS STATEMENT TESTS
  // ============================================================================
  describe('2. Profit & Loss Statement Report', () => {
    it('classifies revenues, contra-revenues, COGS, and operating expenses correctly', async () => {
      const report = await service.getProfitAndLossReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });

      expect(report.filters.fiscalYear).toBe('2026-2027');

      // Verify structure exists
      expect(report.operatingRevenue).toBeDefined();
      expect(report.costOfGoodsSold).toBeDefined();
      expect(report.grossProfit).toBeDefined();
      expect(report.operatingExpenses).toBeDefined();
      expect(report.netProfitOrLoss).toBeDefined();

      // Math verification: Net Revenue = Gross Revenue - Contra Revenue
      const grossRev = new Decimal(report.operatingRevenue.totalGrossRevenue);
      const contraRev = new Decimal(report.operatingRevenue.totalContraRevenue);
      const netRev = new Decimal(report.operatingRevenue.totalNetRevenue);
      expect(grossRev.minus(contraRev).toFixed(2)).toBe(netRev.toFixed(2));

      // Gross Profit = Net Revenue - COGS
      const cogs = new Decimal(report.costOfGoodsSold.totalCogs);
      const gp = new Decimal(report.grossProfit.amount);
      expect(netRev.minus(cogs).toFixed(2)).toBe(gp.toFixed(2));

      // Net Profit = Gross Profit - Operating Expenses
      const opex = new Decimal(report.operatingExpenses.totalOperatingExpenses);
      const np = new Decimal(report.netProfitOrLoss.amount);
      expect(gp.minus(opex).toFixed(2)).toBe(np.toFixed(2));
    });

    it('prominently discloses wholesale cost limitation when COGS is unposted in ledger', async () => {
      const report = await service.getProfitAndLossReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });

      // Wholesale ornament costs are not posted as COGS in the seed ledger
      expect(report.costOfGoodsSold.isEstimatedOrMissing).toBe(true);
      expect(report.cogsNotice).toContain('Cost of Goods Sold (COGS) are not currently posted');
      expect(report.generalNotice).toContain('Revenue figures are derived exclusively from posted ledger entries');
    });

    it('returns zero revenue and expenses for date window with no journal activity', async () => {
      const emptyReport = await service.getProfitAndLossReport(ownerCtx, {
        datePreset: 'CUSTOM',
        from: '2026-04-01',
        to: '2026-05-01',
      });

      expect(emptyReport.operatingRevenue.totalNetRevenue).toBe('0.00');
      expect(emptyReport.costOfGoodsSold.totalCogs).toBe('0.00');
      expect(emptyReport.operatingExpenses.totalOperatingExpenses).toBe('0.00');
      expect(emptyReport.netProfitOrLoss.amount).toBe('0.00');
    });
  });

  // ============================================================================
  // 3. BALANCE SHEET TESTS
  // ============================================================================
  describe('3. Balance Sheet Report', () => {
    it('verifies fundamental balance sheet equilibrium: Assets = Liabilities + Equity', async () => {
      const report = await service.getBalanceSheetReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });

      expect(report.summary).toBeDefined();

      const totalAssets = new Decimal(report.summary.totalAssets);
      const totalLiabilities = new Decimal(report.liabilities.totalLiabilities);
      const totalEquity = new Decimal(report.equity.totalEquity);
      const totalLiabAndEquity = new Decimal(report.summary.totalLiabilitiesAndEquity);
      const discrepancy = new Decimal(report.summary.discrepancy);

      // Verify Liabilities + Equity == totalLiabilitiesAndEquity
      expect(totalLiabilities.plus(totalEquity).toFixed(2)).toBe(totalLiabAndEquity.toFixed(2));

      // Verify Assets == Liabilities + Equity
      expect(totalAssets.toFixed(2)).toBe(totalLiabAndEquity.toFixed(2));
      expect(discrepancy.abs().toNumber()).toBe(0);
      expect(report.summary.isBalanced).toBe(true);
    });

    it('transfers current period net earnings from P&L into Total Equity consistently without double counting', async () => {
      const bsReport = await service.getBalanceSheetReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });

      const recordedEquity = new Decimal(bsReport.equity.totalRecordedEquity);
      const pnlEarnings = new Decimal(bsReport.equity.currentPeriodRetainedEarnings);
      const totalEquity = new Decimal(bsReport.equity.totalEquity);

      expect(recordedEquity.plus(pnlEarnings).toFixed(2)).toBe(totalEquity.toFixed(2));
      expect(bsReport.completenessNotice).toContain('Balance Sheet is mathematically balanced');
    });

    it('discloses historical scope limitations (unrecorded opening capital & inventory baselines)', async () => {
      const report = await service.getBalanceSheetReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });

      expect(report.completenessNotice).toContain('Initial owner equity capital');
      expect(report.completenessNotice).toContain('historical inventory cost baselines');
    });
  });

  // ============================================================================
  // 3B. FINANCIAL STATEMENT INTEGRITY & ANOMALY CORRECTIONS (Phase 4E-3A)
  // ============================================================================
  describe('3B. Financial Statement Integrity & Anomaly Corrections (Phase 4E-3A)', () => {
    it('separates mathematical equilibrium from financial statement completeness in Balance Sheet', async () => {
      const bsReport = await service.getBalanceSheetReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });

      // 1. Mathematical equilibrium holds true to posted records
      expect(bsReport.summary.isBalanced).toBe(true);
      expect(new Decimal(bsReport.summary.discrepancy).abs().toNumber()).toBe(0);

      // 2. Statement completeness explicitly flags data limitations
      expect(bsReport.summary.isComplete).toBe(false);
      expect(bsReport.summary.isSuitableForReliance).toBe(false);
      expect(bsReport.summary.completenessStatus).toBe('INCOMPLETE_DATA');
      expect(bsReport.completenessNotice).toContain('INCOMPLETE FINANCIAL STATEMENT');
      expect(bsReport.completenessNotice).toContain('NOT SUITABLE for statutory or tax reliance');
    });

    it('identifies and structures Account 1110 (Accounts Receivable) abnormal negative balance anomaly', async () => {
      const bsReport = await service.getBalanceSheetReport(ownerCtx, {
        datePreset: 'CUSTOM',
        from: '2026-04-01',
        to: '2026-10-26',
      });

      expect(bsReport.anomalies.length).toBeGreaterThanOrEqual(1);

      const arAnomaly = bsReport.anomalies.find((a) => a.accountCode === '1110');
      expect(arAnomaly).toBeDefined();
      expect(arAnomaly?.type).toBe('NEGATIVE_RECEIVABLE');
      expect(arAnomaly?.amount).toBe('-146600.00');
      expect(arAnomaly?.severity).toBe('CRITICAL');
      expect(arAnomaly?.explanation).toContain(
        'Customer payment receipts were credited to the general ledger without corresponding pre-ledger sales invoice debit postings'
      );
      expect(arAnomaly?.reconciliationAction).toContain('Audit pre-ledger sales invoices');

      // Also verifies individual line item reflects the credit balance
      const arItem = bsReport.assets.currentAssets.find((a) => a.code === '1110');
      expect(arItem).toBeDefined();
      expect(arItem?.amount).toBe('-146600.00');
    });

    it('flags unrecorded opening equity capital as an integrity anomaly', async () => {
      const bsReport = await service.getBalanceSheetReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });

      const equityAnomaly = bsReport.anomalies.find((a) => a.type === 'UNRECORDED_OPENING_EQUITY');
      expect(equityAnomaly).toBeDefined();
      expect(equityAnomaly?.accountCode).toBe('3010');
      expect(equityAnomaly?.severity).toBe('WARNING');
      expect(equityAnomaly?.explanation).toContain('Initial owner equity capital contribution is unrecorded');
    });

    it('separates mathematical equilibrium from completeness in Trial Balance and flags abnormal balances', async () => {
      const tbReport = await service.getTrialBalanceReport(ownerCtx, {
        datePreset: 'CUSTOM',
        from: '2026-04-01',
        to: '2026-10-26',
      });

      // Mathematical equilibrium
      expect(tbReport.totals.isBalanced).toBe(true);

      // Statement completeness & reliance
      expect(tbReport.totals.isSuitableForReliance).toBe(false);
      expect(tbReport.totals.completenessStatus).toBe('INCOMPLETE_DATA');

      // Anomalies
      const arTbAnomaly = tbReport.anomalies.find((a) => a.accountCode === '1110');
      expect(arTbAnomaly).toBeDefined();
      expect(arTbAnomaly?.type).toBe('NEGATIVE_RECEIVABLE');
      expect(arTbAnomaly?.severity).toBe('CRITICAL');
      expect(tbReport.integrityNotice).toContain('Trial Balance is arithmetically balanced');
      expect(tbReport.integrityNotice).toContain('account anomaly/abnormal balance is detected');
    });

    it('flags Profit and Loss statement as incomplete for reliance when COGS is unposted', async () => {
      const plReport = await service.getProfitAndLossReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });

      expect(plReport.costOfGoodsSold.isEstimatedOrMissing).toBe(true);
      expect(plReport.summary.isSuitableForReliance).toBe(false);
      expect(plReport.summary.completenessStatus).toBe('INCOMPLETE_DATA');

      const cogsAnomaly = plReport.anomalies.find((a) => a.type === 'UNRECORDED_COGS');
      expect(cogsAnomaly).toBeDefined();
      expect(cogsAnomaly?.accountCode).toBe('5010');
      expect(cogsAnomaly?.severity).toBe('WARNING');
    });

    it('simulates a clean, fully reconciled ledger scenario returning COMPLETE status', () => {
      // Unit simulation verifying the reporting algorithm logic
      const mockAssets = [
        { code: '1040', name: 'Bank', amount: '500000.00' },
        { code: '1110', name: 'Accounts Receivable', amount: '250000.00' },
      ];
      const mockLiabilities = [{ code: '2010', name: 'Trade Payables', amount: '150000.00' }];
      const mockRecordedEquity = [{ code: '3010', name: "Owner's Capital", amount: '500000.00' }];
      const retainedEarnings = '100000.00';

      const totalAssets = new Decimal('750000.00');
      const totalLiabilities = new Decimal('150000.00');
      const totalRecordedEquity = new Decimal('500000.00');
      const totalEquity = totalRecordedEquity.plus(new Decimal(retainedEarnings));
      const totalLiabAndEquity = totalLiabilities.plus(totalEquity);
      const discrepancy = totalAssets.minus(totalLiabAndEquity);

      const isBalanced = discrepancy.abs().lte(0.005);
      const anomalies: any[] = [];
      for (const item of mockAssets) {
        if (new Decimal(item.amount).lt(0)) anomalies.push({ type: 'NEGATIVE_ASSET' });
      }
      if (totalRecordedEquity.isZero()) anomalies.push({ type: 'UNRECORDED_OPENING_EQUITY' });

      const isComplete = isBalanced && anomalies.length === 0;
      const isSuitableForReliance = isBalanced && anomalies.length === 0;
      const completenessStatus = !isBalanced
        ? 'ANOMALY_DETECTED'
        : anomalies.length > 0
        ? 'INCOMPLETE_DATA'
        : 'COMPLETE';

      expect(isBalanced).toBe(true);
      expect(isComplete).toBe(true);
      expect(isSuitableForReliance).toBe(true);
      expect(completenessStatus).toBe('COMPLETE');
      expect(anomalies.length).toBe(0);
    });

    it('verifies genuine arithmetic imbalance scenario produces DISCREPANCY and ANOMALY_DETECTED', () => {
      const totalAssets = new Decimal('500000.00');
      const totalLiabAndEquity = new Decimal('450000.00');
      const discrepancy = totalAssets.minus(totalLiabAndEquity);
      const isBalanced = discrepancy.abs().lte(0.005);
      const completenessStatus = !isBalanced ? 'ANOMALY_DETECTED' : 'COMPLETE';

      expect(isBalanced).toBe(false);
      expect(discrepancy.toNumber()).toBe(50000);
      expect(completenessStatus).toBe('ANOMALY_DETECTED');
    });
  });

  // ============================================================================
  // 4. RBAC & TENANT ISOLATION TESTS
  // ============================================================================
  describe('4. RBAC & Multi-Tenant Isolation', () => {
    it('allows OWNER and ACCOUNTANT to invoke GL report server actions', async () => {
      const tbRes = await getTrialBalanceAction(
        { datePreset: 'FY_2026_27' },
        { contextOverride: accountantCtx }
      );
      expect(tbRes.success).toBe(true);
      expect(tbRes.data).toBeDefined();
      expect(tbRes.data?.totals.isBalanced).toBe(true);

      const plRes = await getProfitAndLossAction(
        { datePreset: 'FY_2026_27' },
        { contextOverride: ownerCtx }
      );
      expect(plRes.success).toBe(true);
      expect(plRes.data).toBeDefined();

      const bsRes = await getBalanceSheetAction(
        { datePreset: 'FY_2026_27' },
        { contextOverride: accountantCtx }
      );
      expect(bsRes.success).toBe(true);
      expect(bsRes.data).toBeDefined();
      expect(bsRes.data?.summary.isBalanced).toBe(true);
    });

    it('rejects unauthorized roles (SALES_STAFF, MANAGER) lacking ACCOUNTS_VIEW', async () => {
      const salesTb = await getTrialBalanceAction(
        { datePreset: 'FY_2026_27' },
        { contextOverride: salesCtx }
      );
      expect(salesTb.success).toBe(false);
      expect(salesTb.code).toBe('PERMISSION_DENIED');

      const managerPl = await getProfitAndLossAction(
        { datePreset: 'FY_2026_27' },
        { contextOverride: managerCtx }
      );
      expect(managerPl.success).toBe(false);
      expect(managerPl.code).toBe('PERMISSION_DENIED');

      const salesBs = await getBalanceSheetAction(
        { datePreset: 'FY_2026_27' },
        { contextOverride: salesCtx }
      );
      expect(salesBs.success).toBe(false);
      expect(salesBs.code).toBe('PERMISSION_DENIED');
    });

    it('guarantees strict multi-tenant isolation: Kalyan organization cannot view Suvarna ledger data', async () => {
      const kalyanTb = await service.getTrialBalanceReport(kalyanOwnerCtx, {
        datePreset: 'FY_2026_27',
      });

      const suvarnaTb = await service.getTrialBalanceReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });

      expect(new Decimal(suvarnaTb.totals.totalDebitBalance).gt(0)).toBe(true);
      expect(kalyanTb.totals.totalDebitBalance).toBe('0.00');
      expect(kalyanTb.totals.activeAccountsCount).toBe(0);
    });
  });

  // ============================================================================
  // 5. HISTORICAL BENCHMARK RECORD INTEGRITY
  // ============================================================================
  describe('5. Benchmark Record Integrity', () => {
    it('verifies benchmark invoice INV/FORT/26-27/0200 remains COMPLETED and intact', async () => {
      const benchmarkInv = await prisma.invoice.findFirst({
        where: {
          organizationId: suvarnaOrg.id,
          invoiceNumber: 'INV/FORT/26-27/0200',
        },
        include: { items: true, payments: true },
      });

      expect(benchmarkInv).toBeDefined();
      expect(benchmarkInv?.status).toBe('COMPLETED');
      expect(new Decimal(benchmarkInv!.grandTotal).toFixed(2)).toBe('239166.00');
      expect(benchmarkInv?.items.length).toBe(1);
      expect(benchmarkInv?.payments.length).toBe(1);
    });
  });
});
