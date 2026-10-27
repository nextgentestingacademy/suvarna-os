import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db';
import { resolveSecurityContext } from '@/lib/security-context';
import { ReportsService, resolveIndicativeBullionRate } from '@/lib/reports';
import {
  getSalesSummaryAction,
  getPaymentCollectionsAction,
  getGstSummaryAction,
  getInventoryValuationAction,
} from '@/app/actions/reports';
import { SecurityContext } from '@/types/security';
import { Decimal } from 'decimal.js';

describe('Suvarna Phase 4E-2 — Operational Reports Integration Tests', () => {
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

  describe('1. Sales Summary Report', () => {
    it('aggregates gross sales, taxable turnover, taxes, charges and discounts', async () => {
      const report = await service.getSalesSummaryReport(ownerCtx, {
        datePreset: 'FY_2026_27',
        branchId: fortBranch.id,
      });

      expect(report.filters.branchId).toBe(fortBranch.id);
      expect(report.filters.branchName).toBe(fortBranch.name);
      expect(report.totals.invoiceCount).toBeGreaterThan(0);

      // Verify gross sales is positive Decimal string
      const grossSales = new Decimal(report.totals.grossSales);
      expect(grossSales.gt(0)).toBe(true);

      // Verify taxable turnover + total tax + roundoff equals gross sales
      const taxable = new Decimal(report.totals.taxableAmount);
      const totalTax = new Decimal(report.totals.totalTax);
      const roundOff = new Decimal(report.totals.roundOffAmount);
      expect(taxable.plus(totalTax).plus(roundOff).toFixed(2)).toBe(grossSales.toFixed(2));

      // Verify category breakdown exists
      expect(report.categoryBreakdown.length).toBeGreaterThan(0);
      const catGrossSum = report.categoryBreakdown.reduce(
        (sum, c) => sum.plus(new Decimal(c.totalAmount)),
        new Decimal(0)
      );
      expect(catGrossSum.gt(0)).toBe(true);
      expect(catGrossSum.lte(grossSales)).toBe(true);

      // Verify daily trend exists and sums exactly to gross sales
      expect(report.dailyTrend.length).toBeGreaterThan(0);
      const trendGrossSum = report.dailyTrend.reduce(
        (sum, d) => sum.plus(new Decimal(d.grossSales)),
        new Decimal(0)
      );
      expect(trendGrossSum.toFixed(2)).toBe(grossSales.toFixed(2));
    });

    it('excludes CANCELLED and non-COMPLETED invoices from revenue totals', async () => {
      const report = await service.getSalesSummaryReport(ownerCtx, {
        datePreset: 'FY_2026_27',
        branchId: fortBranch.id,
      });

      // Total completed invoices in DB
      const completedInDb = await prisma.invoice.count({
        where: {
          organizationId: suvarnaOrg.id,
          branchId: fortBranch.id,
          status: 'COMPLETED',
        },
      });

      expect(report.totals.invoiceCount).toBe(completedInDb);
    });

    it('returns empty zero-state for a branch with no sales (Vashi)', async () => {
      const report = await service.getSalesSummaryReport(ownerCtx, {
        datePreset: 'THIS_MONTH',
        branchId: vashiBranch.id,
      });

      expect(report.filters.branchId).toBe(vashiBranch.id);
      expect(report.totals.invoiceCount).toBe(0);
      expect(report.totals.grossSales).toBe('0.00');
      expect(report.totals.taxableAmount).toBe('0.00');
      expect(report.categoryBreakdown.length).toBe(0);
      expect(report.dailyTrend.length).toBe(0);
    });
  });

  describe('2. Payment Collections Report', () => {
    it('aggregates customer tenders by payment method and provides collections register', async () => {
      const report = await service.getPaymentCollectionsReport(ownerCtx, {
        datePreset: 'FY_2026_27',
        branchId: fortBranch.id,
      });

      expect(report.filters.branchId).toBe(fortBranch.id);
      expect(report.totals.paymentCount).toBeGreaterThan(0);

      const totalCollections = new Decimal(report.totals.totalCollected);
      expect(totalCollections.gt(0)).toBe(true);

      // Verify tender breakdown sum equals totalCollected
      const breakdownSum = report.methodBreakdown.reduce(
        (sum, m) => sum.plus(new Decimal(m.totalAmount)),
        new Decimal(0)
      );
      expect(breakdownSum.toFixed(2)).toBe(totalCollections.toFixed(2));

      // Collections list contains detailed payment rows
      expect(report.collections.length).toBe(report.totals.paymentCount);
      const first = report.collections[0];
      expect(first).toHaveProperty('paymentDate');
      expect(first).toHaveProperty('invoiceNumber');
      expect(first).toHaveProperty('customerName');
      expect(first).toHaveProperty('paymentMethod');
      expect(first).toHaveProperty('amount');
    });

    it('includes bank settlement realization section with separate settlement figures', async () => {
      const report = await service.getPaymentCollectionsReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });

      expect(report.settlementTotals).toBeDefined();

      // Check math consistency on settlements
      const net = new Decimal(report.settlementTotals.totalSettledNet);
      const fee = new Decimal(report.settlementTotals.totalSettlementFees);
      const gross = new Decimal(report.settlementTotals.totalSettledGross);
      expect(net.plus(fee).toFixed(2)).toBe(gross.toFixed(2));
    });

    it('reports cumulative outstanding receivables across all time regardless of period filter (F-04)', async () => {
      const mtdReport = await service.getPaymentCollectionsReport(ownerCtx, {
        datePreset: 'THIS_MONTH',
        branchId: fortBranch.id,
      });

      const fyReport = await service.getPaymentCollectionsReport(ownerCtx, {
        datePreset: 'FY_2026_27',
        branchId: fortBranch.id,
      });

      // Outstanding receivables is calculated across all-time unpaid balances
      expect(mtdReport.totals.outstandingReceivables).toBeDefined();
      expect(fyReport.totals.outstandingReceivables).toBeDefined();
      expect(mtdReport.totals.outstandingReceivables).toBe(fyReport.totals.outstandingReceivables);
    });
  });

  describe('3. GST Outward Summary Report', () => {
    it('computes taxable turnover and 3% GST split (intra-state vs inter-state)', async () => {
      const report = await service.getGstSummaryReport(ownerCtx, {
        datePreset: 'FY_2026_27',
        branchId: fortBranch.id,
      });

      expect(report.totals.totalInvoices).toBeGreaterThan(0);
      const taxable = new Decimal(report.totals.totalTaxableAmount);
      const cgst = new Decimal(report.totals.totalCgstAmount);
      const sgst = new Decimal(report.totals.totalSgstAmount);
      const igst = new Decimal(report.totals.totalIgstAmount);
      const totalTax = new Decimal(report.totals.totalTaxLiability);

      expect(cgst.plus(sgst).plus(igst).toFixed(2)).toBe(totalTax.toFixed(2));

      // Verify rate schedule contains HSN 7113
      expect(report.rateSchedules.length).toBeGreaterThan(0);
      const hsn7113 = report.rateSchedules.find((h) => h.hsnCode === '7113');
      expect(hsn7113).toBeDefined();
      expect(hsn7113?.ratePercent).toBe('3.00%');

      // Verify invoice tax register entries
      expect(report.invoices.length).toBe(report.totals.totalInvoices);
      const firstInv = report.invoices[0];
      expect(firstInv).toHaveProperty('invoiceNumber');
      expect(firstInv).toHaveProperty('placeOfSupply');
      expect(firstInv).toHaveProperty('taxableAmount');
      expect(firstInv).toHaveProperty('totalTax');
    });
  });

  describe('4. Inventory Valuation Report', () => {
    it('reports available physical pieces, net metal weight, and missing cost as Not Recorded (F-02)', async () => {
      const report = await service.getInventoryValuationReport(ownerCtx, {
        branchId: fortBranch.id,
      });

      expect(report.totals.totalOrnaments).toBeGreaterThan(0);

      // Verify weight totals (Total Net Metal Weight, not fine weight - F-02)
      const grossWeight = new Decimal(report.totals.totalGrossWeightGrams);
      const netWeight = new Decimal(report.totals.totalNetWeightGrams);
      expect(grossWeight.gt(0)).toBe(true);
      expect(netWeight.gt(0)).toBe(true);
      expect(grossWeight.gte(netWeight)).toBe(true);

      // In Suvarna, purchase cost price is not tracked on ornaments, so costStatus must disclose "Not Recorded"
      expect(report.totals.totalRecordedCost).toBe('Not Recorded');
      expect(report.totals.recordedCostItemsCount).toBe(0);

      // Indicative market value estimate is provided based on bullion rate
      const marketVal = new Decimal(report.totals.totalIndicativeEstimate);
      expect(marketVal.gt(0)).toBe(true);

      // Unvalued items count is tracked (F-01)
      expect(typeof report.totals.unvaluedItemsCount).toBe('number');
      expect(report.totals.unvaluedItemsCount).toBeGreaterThanOrEqual(0);

      // Category breakdown is present
      expect(report.categoryBreakdown.length).toBeGreaterThan(0);

      // Ornaments list contains detailed pieces
      expect(report.items.length).toBeGreaterThan(0);
      const firstOrnament = report.items[0];
      expect(firstOrnament).toHaveProperty('tagCode');
      expect(firstOrnament).toHaveProperty('grossWeight');
      expect(firstOrnament).toHaveProperty('netWeight');
      expect(firstOrnament).toHaveProperty('purity');
      expect(firstOrnament).toHaveProperty('indicativePrice');
    });

    it('safely handles supported gold, silver, unsupported platinum, and unknown purity without 22K fallback (F-01)', () => {
      // 1. Supported Gold purities
      const gold24 = resolveIndicativeBullionRate('GOLD', '24K');
      expect(gold24.rate).not.toBeNull();
      expect(gold24.rate!.toNumber()).toBe(13250);
      expect(gold24.reason).toBeNull();

      const gold22 = resolveIndicativeBullionRate('GOLD', '22K');
      expect(gold22.rate).not.toBeNull();
      expect(gold22.rate!.toNumber()).toBe(12150);
      expect(gold22.reason).toBeNull();

      const gold18 = resolveIndicativeBullionRate('GOLD', '18K');
      expect(gold18.rate).not.toBeNull();
      expect(gold18.rate!.toNumber()).toBe(9940);
      expect(gold18.reason).toBeNull();

      const gold14 = resolveIndicativeBullionRate('GOLD', '14K');
      expect(gold14.rate).not.toBeNull();
      expect(gold14.rate!.toNumber()).toBe(7730);
      expect(gold14.reason).toBeNull();

      // 2. Supported Silver
      const silver = resolveIndicativeBullionRate('SILVER', '999');
      expect(silver.rate).not.toBeNull();
      expect(silver.rate!.toNumber()).toBe(168);
      expect(silver.reason).toBeNull();

      // 3. Unsupported Platinum - MUST NOT fall back to 22K gold rate
      const platinum = resolveIndicativeBullionRate('PLATINUM', '950PT');
      expect(platinum.rate).toBeNull();
      expect(platinum.reason).toBe('Unsupported metal: PLATINUM');

      // 4. Unknown gold purity - MUST NOT fall back to 22K gold rate
      const unknownGold = resolveIndicativeBullionRate('GOLD', '10K');
      expect(unknownGold.rate).toBeNull();
      expect(unknownGold.reason).toBe('Unsupported gold purity: 10K');

      // 5. Unknown metal
      const unknownMetal = resolveIndicativeBullionRate('TITANIUM', 'N/A');
      expect(unknownMetal.rate).toBeNull();
      expect(unknownMetal.reason).toBe('Unsupported metal: TITANIUM');
    });
  });

  describe('5. RBAC & Security Context Protection', () => {
    it('allows OWNER and ACCOUNTANT to invoke operational report actions', async () => {
      const salesRes = await getSalesSummaryAction(
        { datePreset: 'THIS_MONTH' },
        { contextOverride: ownerCtx }
      );
      expect(salesRes.success).toBe(true);
      expect(salesRes.data).toBeDefined();

      const payRes = await getPaymentCollectionsAction(
        { datePreset: 'THIS_MONTH' },
        { contextOverride: accountantCtx }
      );
      expect(payRes.success).toBe(true);
      expect(payRes.data).toBeDefined();

      const gstRes = await getGstSummaryAction(
        { datePreset: 'THIS_MONTH' },
        { contextOverride: accountantCtx }
      );
      expect(gstRes.success).toBe(true);
      expect(gstRes.data).toBeDefined();

      const invRes = await getInventoryValuationAction(
        {},
        { contextOverride: ownerCtx }
      );
      expect(invRes.success).toBe(true);
      expect(invRes.data).toBeDefined();
    });

    it('rejects unauthorized roles (SALES_STAFF, MANAGER) lacking ACCOUNTS_VIEW', async () => {
      // SALES_STAFF
      const salesAttempt = await getSalesSummaryAction(
        { datePreset: 'THIS_MONTH' },
        { contextOverride: salesCtx }
      );
      expect(salesAttempt.success).toBe(false);
      expect(salesAttempt.code).toBe('PERMISSION_DENIED');

      // MANAGER
      const managerAttempt = await getGstSummaryAction(
        { datePreset: 'THIS_MONTH' },
        { contextOverride: managerCtx }
      );
      expect(managerAttempt.success).toBe(false);
      expect(managerAttempt.code).toBe('PERMISSION_DENIED');

      const invAttempt = await getInventoryValuationAction(
        {},
        { contextOverride: salesCtx }
      );
      expect(invAttempt.success).toBe(false);
      expect(invAttempt.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('6. Multi-Tenant Isolation', () => {
    it('guarantees tenant isolation: Kalyan organization cannot view Suvarna reports', async () => {
      const kalyanReport = await service.getSalesSummaryReport(kalyanOwnerCtx, {
        datePreset: 'FY_2026_27',
      });

      const suvarnaReport = await service.getSalesSummaryReport(ownerCtx, {
        datePreset: 'FY_2026_27',
      });

      expect(suvarnaReport.totals.invoiceCount).toBeGreaterThan(0);
      expect(kalyanReport.totals.invoiceCount).toBe(0);
      expect(kalyanReport.totals.grossSales).toBe('0.00');
    });
  });

  describe('7. Historical Benchmark Integrity', () => {
    it('verifies benchmark invoice INV/FORT/26-27/0200 remains intact and included in FY 26-27 sales', async () => {
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

      // Check that GST report includes it
      const report = await service.getGstSummaryReport(ownerCtx, {
        datePreset: 'FY_2026_27',
        branchId: fortBranch.id,
      });

      const found = report.invoices.find((i) => i.invoiceNumber === 'INV/FORT/26-27/0200');
      expect(found).toBeDefined();
      expect(found?.grandTotal).toBe('239166.00');
    });
  });
});
