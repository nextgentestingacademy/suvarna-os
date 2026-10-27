import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db';
import { resolveSecurityContext } from '@/lib/security-context';
import { ReportsService } from '@/lib/reports';
import { getDashboardSummaryAction } from '@/app/actions/reports';
import { SecurityContext, AuthorizationError } from '@/types/security';
import { Decimal } from 'decimal.js';

describe('Suvarna Phase 4E-1 — Live Dashboard KPIs & Reporting Service Integration Tests', () => {
  const service = new ReportsService({ prisma });

  let suvarnaOrg: any;
  let kalyanOrg: any;
  let fortBranch: any;
  let vashiBranch: any;
  let thaneBranch: any;

  let ownerCtx: SecurityContext;
  let accountantCtx: SecurityContext;
  let salesCtx: SecurityContext;
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
    kalyanOwnerCtx = await resolveSecurityContext(prisma, {
      userId: kalyanOwnerUser.id,
      targetTenantId: kalyanOrg.id,
      targetBranchId: thaneBranch.id,
    });
  });

  it('calculates live operational KPIs accurately for Fort showroom', async () => {
    const data = await service.getDashboardSummary(ownerCtx, fortBranch.id);

    expect(data.kpis.branchId).toBe(fortBranch.id);
    expect(data.kpis.branchName).toBe(fortBranch.name);

    // Verify against direct DB query
    const dbInvoiceAgg = await prisma.invoice.aggregate({
      where: {
        organizationId: suvarnaOrg.id,
        branchId: fortBranch.id,
        status: 'COMPLETED',
      },
      _sum: { grandTotal: true, balanceAmount: true },
      _count: true,
    });

    const expectedSales = dbInvoiceAgg._sum.grandTotal
      ? new Decimal(dbInvoiceAgg._sum.grandTotal).toFixed(2)
      : '0.00';
    expect(data.kpis.grossSalesMtd).toBe(expectedSales);
    expect(data.kpis.invoicesCountMtd).toBe(dbInvoiceAgg._count);

    // Verify outstanding dues
    const expectedDues = dbInvoiceAgg._sum.balanceAmount
      ? new Decimal(dbInvoiceAgg._sum.balanceAmount).toFixed(2)
      : '0.00';
    expect(data.kpis.outstandingDues).toBe(expectedDues);

    // Verify available inventory metrics
    const dbOrnamentCount = await prisma.ornament.count({
      where: {
        organizationId: suvarnaOrg.id,
        branchId: fortBranch.id,
        status: 'AVAILABLE',
      },
    });
    expect(data.kpis.activeOrnamentsCount).toBe(dbOrnamentCount);
    expect(parseFloat(data.kpis.activeNetWeightGrams)).toBeGreaterThanOrEqual(0);

    // Verify recent transactions
    expect(data.recentTransactions.length).toBeLessThanOrEqual(5);
    if (data.recentTransactions.length > 0) {
      expect(data.recentTransactions[0].invoiceNumber).toBeDefined();
      expect(data.recentTransactions[0].customerName).toBeDefined();
      expect(data.recentTransactions[0].totalAmount).toBeDefined();
      expect(data.recentTransactions[0].paymentMethods.length).toBeGreaterThan(0);
    }
  });

  it('correctly returns zero/empty states for a branch with no sales (Vashi)', async () => {
    const data = await service.getDashboardSummary(ownerCtx, vashiBranch.id);

    expect(data.kpis.branchId).toBe(vashiBranch.id);
    expect(data.kpis.branchName).toBe(vashiBranch.name);
    expect(data.kpis.grossSalesMtd).toBe('0.00');
    expect(data.kpis.invoicesCountMtd).toBe(0);
    expect(data.kpis.outstandingDues).toBe('0.00');
    expect(data.kpis.pendingInvoicesCount).toBe(0);
    expect(data.kpis.activeOrnamentsCount).toBe(0);
    expect(data.kpis.activeDesignsCount).toBe(0);
    expect(data.kpis.activeNetWeightGrams).toBe('0.000');
    expect(data.recentTransactions).toEqual([]);
    expect(data.lowStockItems).toEqual([]);
  });

  it('does not exclude customers with null primaryBranchId when counting registered customers', async () => {
    const data = await service.getDashboardSummary(ownerCtx, fortBranch.id);

    const totalTenantCustomers = await prisma.customer.count({
      where: {
        organizationId: suvarnaOrg.id,
        isActive: true,
      },
    });

    const customersWithNullBranch = await prisma.customer.count({
      where: {
        organizationId: suvarnaOrg.id,
        primaryBranchId: null,
        isActive: true,
      },
    });

    // Fort count should include all Fort-assigned customers PLUS customers with no primary branch assigned
    expect(data.kpis.registeredCustomersCount).toBeGreaterThanOrEqual(customersWithNullBranch);
    expect(data.kpis.registeredCustomersCount).toBeLessThanOrEqual(totalTenantCustomers);
  });

  it('enforces branch authorization check when requesting an unauthorized branch', async () => {
    // Attempting to query Kalyan's Thane branch from Suvarna owner context
    await expect(
      service.getDashboardSummary(ownerCtx, thaneBranch.id)
    ).rejects.toThrow(AuthorizationError);

    await expect(
      service.getDashboardSummary(salesCtx, thaneBranch.id)
    ).rejects.toThrow(AuthorizationError);
  });

  it('strictly enforces multi-tenant isolation', async () => {
    const suvarnaData = await service.getDashboardSummary(ownerCtx, fortBranch.id);
    const kalyanData = await service.getDashboardSummary(kalyanOwnerCtx, thaneBranch.id);

    expect(suvarnaData.kpis.branchId).toBe(fortBranch.id);
    expect(kalyanData.kpis.branchId).toBe(thaneBranch.id);

    // Invoices and customers should not leak across tenants
    const suvarnaInvoices = suvarnaData.recentTransactions.map((tx) => tx.invoiceNumber);
    const kalyanInvoices = kalyanData.recentTransactions.map((tx) => tx.invoiceNumber);

    for (const inv of suvarnaInvoices) {
      expect(kalyanInvoices).not.toContain(inv);
    }
  });

  it('verifies historical invoice INV/FORT/26-27/0200 remains completely intact', async () => {
    const inv = await prisma.invoice.findFirstOrThrow({
      where: { invoiceNumber: 'INV/FORT/26-27/0200' },
      include: { payments: true, items: true },
    });

    expect(inv.status).toBe('COMPLETED');
    expect(inv.paymentStatus).toBe('PAID');
    expect(inv.grandTotal.toString()).toBe('239166');
    expect(inv.paidAmount.toString()).toBe('239166');
    expect(inv.balanceAmount.toString()).toBe('0');
    expect(inv.items.length).toBe(1);
    expect(inv.payments.length).toBe(1);
  });
});
