import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import {
  createProductAction,
  registerOrnamentAction,
  getInventoryListingAction,
  getProductsAction,
  getOrnamentDetailAction,
  getOrnamentMovementsAction,
  transferOrnamentAction,
  recordStockAdjustmentAction,
} from '@/app/actions/inventory';

describe('Milestone 3A — Secure Inventory Server Actions Integration Tests', () => {
  const DEV_PASSWORD = 'SuvarnaDev2026!';

  let suvarnaOrg: any;
  let fortBranch: any;
  let vashiBranch: any;

  let ownerHeaders: Headers;
  let managerHeaders: Headers;
  let salesHeaders: Headers;

  const testProductIds: string[] = [];
  const testOrnamentIds: string[] = [];

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
    suvarnaOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'suvarna-mumbai' } });
    fortBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: suvarnaOrg.id, code: 'FORT' } },
    });
    vashiBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: suvarnaOrg.id, code: 'VASHI' } },
    });

    // Clean up any lingering test records from previous runs
    const existingMovements = await prisma.stockMovement.findMany({
      where: { ornament: { tagCode: { startsWith: 'ACT-' } } },
      select: { id: true },
    });
    if (existingMovements.length > 0) {
      await prisma.stockMovement.deleteMany({ where: { id: { in: existingMovements.map(m => m.id) } } });
    }
    await prisma.ornament.deleteMany({ where: { tagCode: { startsWith: 'ACT-' } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: 'ACT-' } } });

    // Fetch session headers once
    ownerHeaders = await getSessionHeaders('owner@suvarna.test');
    managerHeaders = await getSessionHeaders('manager@suvarna.test');
    salesHeaders = await getSessionHeaders('sales@suvarna.test');
  }, 30000);

  afterAll(async () => {
    const existingMovements = await prisma.stockMovement.findMany({
      where: { ornament: { tagCode: { startsWith: 'ACT-' } } },
      select: { id: true },
    });
    if (existingMovements.length > 0) {
      await prisma.stockMovement.deleteMany({ where: { id: { in: existingMovements.map(m => m.id) } } });
    }
    await prisma.ornament.deleteMany({ where: { tagCode: { startsWith: 'ACT-' } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: 'ACT-' } } });
  }, 30000);

  describe('1. createProductAction', () => {
    it('permits OWNER to create a product and returns serialized data', async () => {
      const res = await createProductAction(
        {
          sku: 'ACT-PROD-001',
          name: 'Traditional Bridal Choker',
          category: 'Necklaces',
          metalType: 'GOLD',
          purity: '22K',
        },
        { headers: ownerHeaders }
      );

      expect(res.success).toBe(true);
      expect(res.data?.id).toBeDefined();
      expect(res.data?.sku).toBe('ACT-PROD-001');
      testProductIds.push(res.data!.id);
    });

    it('rejects product creation by SALES_STAFF with permission error', async () => {
      const res = await createProductAction(
        {
          sku: 'ACT-SALES-PROD',
          name: 'Unauthorized Ring',
          category: 'Rings',
        },
        { headers: salesHeaders }
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Permission denied/);
    });

    it('rejects duplicate SKU creation gracefully', async () => {
      const res = await createProductAction(
        {
          sku: 'ACT-PROD-001', // Already created above
          name: 'Duplicate SKU Choker',
          category: 'Necklaces',
        },
        { headers: ownerHeaders }
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already exists/i);
    });
  });

  describe('2. registerOrnamentAction', () => {
    it('permits MANAGER to register ornament at permitted branch (FORT)', async () => {
      const res = await registerOrnamentAction(
        {
          branchId: fortBranch.id,
          productId: testProductIds[0],
          tagCode: 'ACT-TAG-001',
          huid: 'HD9901',
          grossWeight: '22.500',
          stoneWeight: '0.500',
          netWeight: '22.000',
          costAmount: '120000.00',
          priceAmount: '145000.00',
        },
        { headers: managerHeaders }
      );

      expect(res.success).toBe(true);
      expect(res.data?.ornament.id).toBeDefined();
      expect(res.data?.ornament.tagCode).toBe('ACT-TAG-001');
      expect(res.data?.ornament.grossWeight).toBe('22.500');
      expect(res.data?.ornament.netWeight).toBe('22.000');
      expect(res.data?.movement.movementType).toBe('INWARD');
      testOrnamentIds.push(res.data!.ornament.id);
    });

    it('rejects ornament registration by MANAGER at unpermitted branch (VASHI)', async () => {
      const res = await registerOrnamentAction(
        {
          branchId: vashiBranch.id, // Manager only has FORT
          productId: testProductIds[0],
          tagCode: 'ACT-TAG-FAIL-BRANCH',
          grossWeight: '10.000',
        },
        { headers: managerHeaders }
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not authorized to perform operations in branch/);
    });

    it('rejects ornament registration with invalid weights (gross <= 0)', async () => {
      const res = await registerOrnamentAction(
        {
          branchId: fortBranch.id,
          productId: testProductIds[0],
          tagCode: 'ACT-TAG-ZERO',
          grossWeight: '0.000',
        },
        { headers: ownerHeaders }
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Gross weight must be strictly greater than zero/);
    });
  });

  describe('3. getInventoryListingAction & Role-Based Redaction', () => {
    it('returns wholesale costAmount to OWNER', async () => {
      const res = await getInventoryListingAction(
        { searchQuery: 'ACT-TAG-001' },
        { headers: ownerHeaders }
      );

      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(1);
      expect(res.data![0].costAmount).toBe('120000.00');
    });

    it('redacts wholesale costAmount to null for SALES_STAFF', async () => {
      const res = await getInventoryListingAction(
        { searchQuery: 'ACT-TAG-001' },
        { headers: salesHeaders }
      );

      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(1);
      expect(res.data![0].costAmount).toBeNull();
      // Price is intact
      expect(res.data![0].priceAmount).toBe('145000.00');
    });
  });

  describe('4. transferOrnamentAction & Concurrency Safety', () => {
    it('permits OWNER to transfer ornament from FORT to VASHI', async () => {
      const res = await transferOrnamentAction(
        {
          ornamentId: testOrnamentIds[0],
          fromBranchId: fortBranch.id,
          toBranchId: vashiBranch.id,
          reason: 'Showroom transfer test',
        },
        { headers: ownerHeaders }
      );

      expect(res.success).toBe(true);
      expect(res.data?.ornament.branchId).toBe(vashiBranch.id);
      expect(res.data?.movement.movementType).toBe('TRANSFER');
      expect(res.data?.movement.fromBranchId).toBe(fortBranch.id);
      expect(res.data?.movement.toBranchId).toBe(vashiBranch.id);
    });

    it('rejects self-transfer where source and destination are identical', async () => {
      const res = await transferOrnamentAction(
        {
          ornamentId: testOrnamentIds[0],
          fromBranchId: vashiBranch.id,
          toBranchId: vashiBranch.id,
          reason: 'Self transfer',
        },
        { headers: ownerHeaders }
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/distinct/i);
    });

    it('rejects transfer from outdated source branch state', async () => {
      // Ornament is now at VASHI, attempting to transfer from FORT
      const res = await transferOrnamentAction(
        {
          ornamentId: testOrnamentIds[0],
          fromBranchId: fortBranch.id,
          toBranchId: vashiBranch.id,
        },
        { headers: ownerHeaders }
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/currently at branch/i);
    });
  });

  describe('5. getOrnamentMovementsAction', () => {
    it('returns complete movement ledger history', async () => {
      const res = await getOrnamentMovementsAction(testOrnamentIds[0], { headers: ownerHeaders });

      expect(res.success).toBe(true);
      expect(res.data?.length).toBe(2);
      expect(res.data![0].movementType).toBe('INWARD');
      expect(res.data![1].movementType).toBe('TRANSFER');
    });
  });

  describe('6. recordStockAdjustmentAction', () => {
    it('records a validated status change adjustment', async () => {
      const res = await recordStockAdjustmentAction(
        {
          ornamentId: testOrnamentIds[0],
          adjustmentType: 'STATUS_CHANGE',
          newStatus: 'RESERVED',
          reason: 'VIP bridal consultation reserve',
        },
        { headers: ownerHeaders }
      );

      expect(res.success).toBe(true);
      expect(res.data?.ornament.status).toBe('RESERVED');
      expect(res.data?.movement.movementType).toBe('AUDIT_ADJUSTMENT');
      expect(res.data?.movement.reason).toContain('VIP bridal consultation reserve');
      expect(res.data?.movement.metadata).toEqual({
        adjustmentType: 'STATUS_CHANGE',
        before: { status: 'AVAILABLE' },
        after: { status: 'RESERVED' },
      });
    });

    it('records a validated weight correction with milligram precision before-and-after metadata', async () => {
      const res = await recordStockAdjustmentAction(
        {
          ornamentId: testOrnamentIds[0],
          adjustmentType: 'WEIGHT_CORRECTION',
          grossWeight: '22.450',
          stoneWeight: '0.500',
          reason: 'Post-polishing laser calibration',
        },
        { headers: ownerHeaders }
      );

      expect(res.success).toBe(true);
      expect(res.data?.ornament.grossWeight).toBe('22.450');
      expect(res.data?.ornament.netWeight).toBe('21.950');
      expect(res.data?.movement.movementType).toBe('AUDIT_ADJUSTMENT');
      expect(res.data?.movement.metadata).toEqual({
        adjustmentType: 'WEIGHT_CORRECTION',
        before: {
          grossWeight: '22.500',
          stoneWeight: '0.500',
          netWeight: '22.000',
        },
        after: {
          grossWeight: '22.450',
          stoneWeight: '0.500',
          netWeight: '21.950',
        },
      });
    });
  });
});
