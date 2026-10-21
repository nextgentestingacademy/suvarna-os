import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { resolveSecurityContext } from '@/lib/security-context';
import {
  InventoryService,
  InventoryValidationError,
  InventoryConflictError,
} from '@/lib/inventory';
import { SecurityContext, AuthorizationError } from '@/types/security';
import { Decimal } from '@/lib/decimal';

describe('Milestone 3A — Persistent Inventory Service & Ledger Integration Tests', () => {
  const service = new InventoryService({ prisma });

  let suvarnaOrg: any;
  let kalyanOrg: any;
  let fortBranch: any;
  let vashiBranch: any;
  let thaneBranch: any;

  let ownerCtx: SecurityContext;
  let managerCtx: SecurityContext;
  let accountantCtx: SecurityContext;
  let salesCtx: SecurityContext;
  let kalyanOwnerCtx: SecurityContext;

  // Cleanup trackers
  const createdProductIds: string[] = [];
  const createdOrnamentIds: string[] = [];

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
    const managerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'manager@suvarna.test' } });
    const accountantUser = await prisma.user.findUniqueOrThrow({ where: { email: 'accountant@suvarna.test' } });
    const salesUser = await prisma.user.findUniqueOrThrow({ where: { email: 'sales@suvarna.test' } });
    const kalyanOwnerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@kalyan.test' } });

    // 4. Resolve verified Security Contexts
    ownerCtx = await resolveSecurityContext(prisma, { userId: ownerUser.id, targetTenantId: suvarnaOrg.id });
    managerCtx = await resolveSecurityContext(prisma, { userId: managerUser.id, targetTenantId: suvarnaOrg.id });
    accountantCtx = await resolveSecurityContext(prisma, { userId: accountantUser.id, targetTenantId: suvarnaOrg.id });
    salesCtx = await resolveSecurityContext(prisma, { userId: salesUser.id, targetTenantId: suvarnaOrg.id });
    kalyanOwnerCtx = await resolveSecurityContext(prisma, { userId: kalyanOwnerUser.id, targetTenantId: kalyanOrg.id });
  });

  afterAll(async () => {
    // Clean up created test ornaments & movements (movements cascade delete or delete first)
    if (createdOrnamentIds.length > 0) {
      await prisma.stockMovement.deleteMany({ where: { ornamentId: { in: createdOrnamentIds } } });
      await prisma.ornament.deleteMany({ where: { id: { in: createdOrnamentIds } } });
    }
    if (createdProductIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    }
  });

  // ==========================================================================
  // Suite 1: Product Catalogue Operations & Validations
  // ==========================================================================
  describe('1. Product Catalogue Management', () => {
    const testSku = 'TEST-NK-001';

    it('successfully creates a catalogue product with valid attributes', async () => {
      const prod = await service.createProduct(ownerCtx, {
        sku: testSku,
        name: 'Heritage Peacock Royal Choker',
        category: 'Necklaces',
        metalType: 'GOLD',
        purity: '22K',
        description: 'Fine handcrafted temple necklace',
      });

      createdProductIds.push(prod.id);
      expect(prod.id).toBeDefined();
      expect(prod.sku).toBe(testSku);
      expect(prod.organizationId).toBe(suvarnaOrg.id);
      expect(prod.isActive).toBe(true);
    });

    it('rejects duplicate SKU within the same business organization', async () => {
      await expect(
        service.createProduct(ownerCtx, {
          sku: testSku,
          name: 'Duplicate SKU Necklace',
          category: 'Necklaces',
        })
      ).rejects.toThrow(InventoryConflictError);
    });

    it('allows identical SKU in a different organization (tenant isolation)', async () => {
      const kalyanProd = await service.createProduct(kalyanOwnerCtx, {
        sku: testSku, // Same SKU, different organization
        name: 'Kalyan Peacock Choker',
        category: 'Necklaces',
      });

      createdProductIds.push(kalyanProd.id);
      expect(kalyanProd.sku).toBe(testSku);
      expect(kalyanProd.organizationId).toBe(kalyanOrg.id);
      expect(kalyanProd.id).not.toBe(createdProductIds[0]);
    });

    it('denies product creation to unauthorized staff (SALES_STAFF and ACCOUNTANT)', async () => {
      await expect(
        service.createProduct(salesCtx, {
          sku: 'SALES-SKU-1',
          name: 'Unauthorized Product',
          category: 'Rings',
        })
      ).rejects.toThrow(AuthorizationError);

      await expect(
        service.createProduct(accountantCtx, {
          sku: 'ACC-SKU-1',
          name: 'Unauthorized Product',
          category: 'Rings',
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it('rejects empty or whitespace-only product attributes', async () => {
      await expect(
        service.createProduct(ownerCtx, { sku: '   ', name: 'Valid Name', category: 'Chains' })
      ).rejects.toThrow(InventoryValidationError);

      await expect(
        service.createProduct(ownerCtx, { sku: 'VALID-SKU', name: '', category: 'Chains' })
      ).rejects.toThrow(InventoryValidationError);
    });
  });

  // ==========================================================================
  // Suite 2: Ornament Registration & Atomic Inward Ledger
  // ==========================================================================
  describe('2. Physical Ornament Registration & Inward Movement', () => {
    let baseProduct: any;

    beforeAll(async () => {
      baseProduct = await service.createProduct(ownerCtx, {
        sku: 'TEST-BANG-001',
        name: 'Royal Filigree Kada',
        category: 'Bangles',
        metalType: 'GOLD',
        purity: '22K',
      });
      createdProductIds.push(baseProduct.id);
    });

    it('atomically registers an ornament and records initial INWARD stock movement', async () => {
      const res = await service.registerOrnament(ownerCtx, {
        branchId: fortBranch.id,
        productId: baseProduct.id,
        tagCode: 'TAG-KADA-001',
        huid: 'AB1234',
        grossWeight: '25.850',
        stoneWeight: '1.200',
        netWeight: '24.650',
        costAmount: '150000.00',
        priceAmount: '175000.00',
        makingChargeType: 'PER_GRAM',
        makingChargeValue: '650.00',
        reason: 'New workshop delivery inward',
      });

      createdOrnamentIds.push(res.ornament.id);

      // Verify Ornament state
      expect(res.ornament.tagCode).toBe('TAG-KADA-001');
      expect(res.ornament.branchId).toBe(fortBranch.id);
      expect(res.ornament.status).toBe('AVAILABLE');
      expect(new Decimal(res.ornament.grossWeight).toFixed(3)).toBe('25.850');
      expect(new Decimal(res.ornament.stoneWeight).toFixed(3)).toBe('1.200');
      expect(new Decimal(res.ornament.netWeight).toFixed(3)).toBe('24.650');

      // Verify Initial Movement state
      expect(res.movement).toBeDefined();
      expect(res.movement.ornamentId).toBe(res.ornament.id);
      expect(res.movement.movementType).toBe('INWARD');
      expect(res.movement.fromBranchId).toBeNull();
      expect(res.movement.toBranchId).toBe(fortBranch.id);
      expect(res.movement.userId).toBe(ownerCtx.userId);
    });

    it('rejects registration with zero or negative gross weight', async () => {
      await expect(
        service.registerOrnament(ownerCtx, {
          branchId: fortBranch.id,
          productId: baseProduct.id,
          tagCode: 'TAG-FAIL-ZERO',
          grossWeight: '0.000',
        })
      ).rejects.toThrow(InventoryValidationError);

      await expect(
        service.registerOrnament(ownerCtx, {
          branchId: fortBranch.id,
          productId: baseProduct.id,
          tagCode: 'TAG-FAIL-NEG',
          grossWeight: '-10.500',
        })
      ).rejects.toThrow(InventoryValidationError);
    });

    it('rejects registration with negative stone weight', async () => {
      await expect(
        service.registerOrnament(ownerCtx, {
          branchId: fortBranch.id,
          productId: baseProduct.id,
          tagCode: 'TAG-FAIL-STONE',
          grossWeight: '15.000',
          stoneWeight: '-0.500',
        })
      ).rejects.toThrow(InventoryValidationError);
    });

    it('rejects registration when stone weight exceeds gross weight', async () => {
      await expect(
        service.registerOrnament(ownerCtx, {
          branchId: fortBranch.id,
          productId: baseProduct.id,
          tagCode: 'TAG-FAIL-HEAVY-STONE',
          grossWeight: '10.000',
          stoneWeight: '15.000',
        })
      ).rejects.toThrow(InventoryValidationError);
    });

    it('rejects registration when net weight does not equal gross minus stone', async () => {
      await expect(
        service.registerOrnament(ownerCtx, {
          branchId: fortBranch.id,
          productId: baseProduct.id,
          tagCode: 'TAG-FAIL-NET-MISMATCH',
          grossWeight: '20.000',
          stoneWeight: '2.000',
          netWeight: '17.500', // Expected 18.000
        })
      ).rejects.toThrow(InventoryValidationError);
    });

    it('rejects duplicate tag code within the same enterprise', async () => {
      await expect(
        service.registerOrnament(ownerCtx, {
          branchId: fortBranch.id,
          productId: baseProduct.id,
          tagCode: 'TAG-KADA-001', // Already used
          grossWeight: '20.000',
        })
      ).rejects.toThrow(InventoryConflictError);
    });

    it('rejects registration when user attempts to stock at an unauthorized branch', async () => {
      // managerCtx is only authorized for FORT, attempting to stock at VASHI
      await expect(
        service.registerOrnament(managerCtx, {
          branchId: vashiBranch.id,
          productId: baseProduct.id,
          tagCode: 'TAG-MGR-UNAUTH',
          grossWeight: '10.000',
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it('rejects cross-tenant product reference (Suvarna branch + Kalyan product)', async () => {
      const kalyanProd = await service.createProduct(kalyanOwnerCtx, {
        sku: 'KALYAN-PROD-99',
        name: 'Kalyan Only Ring',
        category: 'Rings',
      });
      createdProductIds.push(kalyanProd.id);

      await expect(
        service.registerOrnament(ownerCtx, {
          branchId: fortBranch.id,
          productId: kalyanProd.id, // Belongs to Kalyan!
          tagCode: 'TAG-CROSS-TENANT',
          grossWeight: '8.000',
        })
      ).rejects.toThrow(InventoryValidationError);
    });
  });

  // ==========================================================================
  // Suite 3: Stock Queries, Branch Scoping & Role-Based Redaction
  // ==========================================================================
  describe('3. Stock Queries & Role-Based Redaction', () => {
    let sampleOrnament: any;

    beforeAll(async () => {
      const prod = await service.createProduct(ownerCtx, {
        sku: 'TEST-RING-001',
        name: 'Solitaire Ring',
        category: 'Rings',
      });
      createdProductIds.push(prod.id);

      const res = await service.registerOrnament(ownerCtx, {
        branchId: fortBranch.id,
        productId: prod.id,
        tagCode: 'TAG-RING-SECRET',
        grossWeight: '6.500',
        costAmount: '45000.00',
        priceAmount: '58000.00',
      });
      sampleOrnament = res.ornament;
      createdOrnamentIds.push(sampleOrnament.id);
    });

    it('OWNER and ACCOUNTANT can see wholesale costAmount', async () => {
      const ownerItem = await service.getOrnamentById(ownerCtx, sampleOrnament.id);
      expect(ownerItem?.costAmount).not.toBeNull();
      expect(new Decimal(ownerItem!.costAmount!).toFixed(2)).toBe('45000.00');

      const accountantList = await service.getOrnaments(accountantCtx, { searchQuery: 'TAG-RING-SECRET' });
      expect(accountantList.length).toBe(1);
      expect(accountantList[0].costAmount).not.toBeNull();
      expect(new Decimal(accountantList[0].costAmount!).toFixed(2)).toBe('45000.00');
    });

    it('SALES_STAFF cannot see costAmount (cost is redacted to null)', async () => {
      const salesItem = await service.getOrnamentById(salesCtx, sampleOrnament.id);
      expect(salesItem?.costAmount).toBeNull();

      const salesList = await service.getOrnaments(salesCtx, { searchQuery: 'TAG-RING-SECRET' });
      expect(salesList.length).toBe(1);
      expect(salesList[0].costAmount).toBeNull();
      // Retail price is preserved
      expect(new Decimal(salesList[0].priceAmount!).toFixed(2)).toBe('58000.00');
    });

    it('enforces branch isolation in stock listing', async () => {
      // Register an ornament at VASHI branch
      const prod = createdProductIds[0];
      const vashiRes = await service.registerOrnament(ownerCtx, {
        branchId: vashiBranch.id,
        productId: prod,
        tagCode: 'TAG-VASHI-EXCLUSIVE',
        grossWeight: '12.000',
      });
      createdOrnamentIds.push(vashiRes.ornament.id);

      // Manager (FORT only) must NOT see Vashi stock
      const managerList = await service.getOrnaments(managerCtx);
      const vashiFound = managerList.find((o) => o.tagCode === 'TAG-VASHI-EXCLUSIVE');
      expect(vashiFound).toBeUndefined();

      // Owner (FORT and VASHI) CAN see it
      const ownerList = await service.getOrnaments(ownerCtx);
      const vashiOwnerFound = ownerList.find((o) => o.tagCode === 'TAG-VASHI-EXCLUSIVE');
      expect(vashiOwnerFound).toBeDefined();
    });

    it('rejects getOrnamentById when user is not authorized for holding branch', async () => {
      // Find the Vashi ornament ID
      const vashiItem = await prisma.ornament.findFirstOrThrow({
        where: { branchId: vashiBranch.id, tagCode: 'TAG-VASHI-EXCLUSIVE' },
      });

      // Manager only has FORT access
      await expect(
        service.getOrnamentById(managerCtx, vashiItem.id)
      ).rejects.toThrow(/You are not authorized to view stock located at branch/);
    });
  });

  // ==========================================================================
  // Suite 4: Inter-Branch Stock Transfers & Concurrency Protection
  // ==========================================================================
  describe('4. Inter-Branch Stock Transfers', () => {
    let transferOrnament: any;

    beforeAll(async () => {
      const prod = createdProductIds[0];
      const res = await service.registerOrnament(ownerCtx, {
        branchId: fortBranch.id,
        productId: prod,
        tagCode: 'TAG-TRANSFER-TEST',
        grossWeight: '18.400',
        stoneWeight: '0.400',
        netWeight: '18.000',
      });
      transferOrnament = res.ornament;
      createdOrnamentIds.push(transferOrnament.id);
    });

    it('successfully transfers an available ornament between authorized branches', async () => {
      // Owner is authorized for both FORT and VASHI
      const res = await service.transferOrnament(ownerCtx, {
        ornamentId: transferOrnament.id,
        fromBranchId: fortBranch.id,
        toBranchId: vashiBranch.id,
        reason: 'Showroom display rotation to Vashi',
      });

      // Verify Ornament updated state
      expect(res.ornament.branchId).toBe(vashiBranch.id);
      expect(res.ornament.status).toBe('AVAILABLE');

      // Verify Transfer Ledger movement
      expect(res.movement.movementType).toBe('TRANSFER');
      expect(res.movement.fromBranchId).toBe(fortBranch.id);
      expect(res.movement.toBranchId).toBe(vashiBranch.id);
      expect(res.movement.userId).toBe(ownerCtx.userId);

      // Verify database persistence
      const inDb = await prisma.ornament.findUniqueOrThrow({ where: { id: transferOrnament.id } });
      expect(inDb.branchId).toBe(vashiBranch.id);
    });

    it('rejects transfer if source and destination branches are identical', async () => {
      await expect(
        service.transferOrnament(ownerCtx, {
          ornamentId: transferOrnament.id,
          fromBranchId: vashiBranch.id,
          toBranchId: vashiBranch.id,
          reason: 'Self transfer',
        })
      ).rejects.toThrow(InventoryValidationError);
    });

    it('rejects transfer if acting user lacks authorization for destination branch', async () => {
      // Manager has access to FORT, but NOT VASHI
      await expect(
        service.transferOrnament(managerCtx, {
          ornamentId: transferOrnament.id,
          fromBranchId: fortBranch.id,
          toBranchId: vashiBranch.id,
        })
      ).rejects.toThrow(AuthorizationError);
    });

    it('rejects transfer if ornament is not currently at the stated source branch', async () => {
      // The ornament is now at VASHI, attempting to transfer stating it is at FORT
      await expect(
        service.transferOrnament(ownerCtx, {
          ornamentId: transferOrnament.id,
          fromBranchId: fortBranch.id, // Wrong source!
          toBranchId: vashiBranch.id,
        })
      ).rejects.toThrow(InventoryConflictError);
    });

    it('rejects transfer if ornament status is not AVAILABLE (e.g. RESERVED)', async () => {
      // Put ornament on RESERVED status via adjustment
      await service.recordStockAdjustment(ownerCtx, {
        ornamentId: transferOrnament.id,
        adjustmentType: 'STATUS_CHANGE',
        newStatus: 'RESERVED',
        reason: 'Customer holding advance',
      });

      await expect(
        service.transferOrnament(ownerCtx, {
          ornamentId: transferOrnament.id,
          fromBranchId: vashiBranch.id,
          toBranchId: fortBranch.id,
        })
      ).rejects.toThrow(InventoryConflictError);

      // Restore status to AVAILABLE
      await service.recordStockAdjustment(ownerCtx, {
        ornamentId: transferOrnament.id,
        adjustmentType: 'STATUS_CHANGE',
        newStatus: 'AVAILABLE',
        reason: 'Hold released',
      });
    });

    it('concurrency protection prevents duplicate transfer of the same ornament', async () => {
      // Run two transfers concurrently from VASHI to FORT
      const transfer1 = service.transferOrnament(ownerCtx, {
        ornamentId: transferOrnament.id,
        fromBranchId: vashiBranch.id,
        toBranchId: fortBranch.id,
        reason: 'Concurrent transfer 1',
      });

      const transfer2 = service.transferOrnament(ownerCtx, {
        ornamentId: transferOrnament.id,
        fromBranchId: vashiBranch.id,
        toBranchId: fortBranch.id,
        reason: 'Concurrent transfer 2',
      });

      const results = await Promise.allSettled([transfer1, transfer2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly one must succeed, and the other must be rejected
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InventoryConflictError);
    });
  });

  // ==========================================================================
  // Suite 5: Stock Movement History & Append-Only Behavior
  // ==========================================================================
  describe('5. Stock Movement Ledger & History Integrity', () => {
    let historyOrnamentId: string;

    beforeAll(async () => {
      const prod = createdProductIds[0];
      const res = await service.registerOrnament(ownerCtx, {
        branchId: fortBranch.id,
        productId: prod,
        tagCode: 'TAG-LEDGER-AUDIT',
        grossWeight: '30.000',
        stoneWeight: '2.000',
        netWeight: '28.000',
      });
      historyOrnamentId = res.ornament.id;
      createdOrnamentIds.push(historyOrnamentId);

      // Perform a transfer to Vashi
      await service.transferOrnament(ownerCtx, {
        ornamentId: historyOrnamentId,
        fromBranchId: fortBranch.id,
        toBranchId: vashiBranch.id,
        reason: 'Exhibition display',
      });

      // Perform an adjustment
      await service.recordStockAdjustment(ownerCtx, {
        ornamentId: historyOrnamentId,
        adjustmentType: 'WEIGHT_CORRECTION',
        grossWeight: '29.980',
        stoneWeight: '2.000',
        reason: 'Precision lab scale recalibration',
      });
    });

    it('returns chronologically complete audit history of stock movements', async () => {
      const history = await service.getOrnamentMovements(ownerCtx, historyOrnamentId);

      expect(history.length).toBe(3);

      // Event 1: Inward
      expect(history[0].movementType).toBe('INWARD');
      expect(history[0].fromBranchId).toBeNull();
      expect(history[0].toBranchId).toBe(fortBranch.id);

      // Event 2: Transfer
      expect(history[1].movementType).toBe('TRANSFER');
      expect(history[1].fromBranchId).toBe(fortBranch.id);
      expect(history[1].toBranchId).toBe(vashiBranch.id);

      // Event 3: Audit Adjustment
      expect(history[2].movementType).toBe('AUDIT_ADJUSTMENT');
      expect(history[2].reason).toContain('WEIGHT_CORRECTION');
    });

    it('guarantees append-only ledger: no update or delete mutations are exposed in service', () => {
      const anyService = service as any;
      expect(anyService.updateStockMovement).toBeUndefined();
      expect(anyService.deleteStockMovement).toBeUndefined();
      expect(anyService.modifyStockMovement).toBeUndefined();
    });

    it('rolls back atomic transaction completely if any step fails', async () => {
      const beforeCount = await prisma.ornament.count({ where: { tagCode: 'TAG-FAIL-ROLLBACK' } });
      const beforeMovements = await prisma.stockMovement.count();

      // Trigger a transaction failure by passing a non-existent branch ID in raw registration
      await expect(
        service.registerOrnament(ownerCtx, {
          branchId: 'non-existent-branch-id',
          productId: createdProductIds[0],
          tagCode: 'TAG-FAIL-ROLLBACK',
          grossWeight: '10.000',
        })
      ).rejects.toThrow();

      const afterCount = await prisma.ornament.count({ where: { tagCode: 'TAG-FAIL-ROLLBACK' } });
      const afterMovements = await prisma.stockMovement.count();

      expect(afterCount).toBe(beforeCount);
      expect(afterMovements).toBe(beforeMovements);
    });
  });

  // ==========================================================================
  // Suite 6: Stock Adjustment Structured Audit Ledger & Before-and-After Verification
  // ==========================================================================
  describe('6. Stock Adjustment Structured Audit Ledger & Before-and-After Verification', () => {
    let adjOrnament: any;

    beforeAll(async () => {
      const prod = createdProductIds[0];
      const res = await service.registerOrnament(ownerCtx, {
        branchId: fortBranch.id,
        productId: prod,
        tagCode: 'TAG-ADJUST-AUDIT',
        grossWeight: '25.500',
        stoneWeight: '1.500',
        netWeight: '24.000',
      });
      adjOrnament = res.ornament;
      createdOrnamentIds.push(adjOrnament.id);
    });

    it('records database-derived before-and-after states for STATUS_CHANGE in StockMovement.metadata', async () => {
      // Ornament currently AVAILABLE -> transition to RESERVED
      const res = await service.recordStockAdjustment(ownerCtx, {
        ornamentId: adjOrnament.id,
        adjustmentType: 'STATUS_CHANGE',
        newStatus: 'RESERVED',
        reason: 'Customer holding deposit received',
      });

      expect(res.ornament.status).toBe('RESERVED');
      expect(res.movement.movementType).toBe('AUDIT_ADJUSTMENT');
      expect(res.movement.metadata).toEqual({
        adjustmentType: 'STATUS_CHANGE',
        before: { status: 'AVAILABLE' },
        after: { status: 'RESERVED' },
      });

      // Verify database persistence in stock_movements table
      const dbMovement = await prisma.stockMovement.findUniqueOrThrow({
        where: { id: res.movement.id },
      });
      expect(dbMovement.metadata).toEqual({
        adjustmentType: 'STATUS_CHANGE',
        before: { status: 'AVAILABLE' },
        after: { status: 'RESERVED' },
      });

      // Verify audit_logs table also captured before and after
      const dbAudit = await prisma.auditLog.findFirstOrThrow({
        where: {
          entityType: 'Ornament',
          entityId: adjOrnament.id,
          action: 'UPDATE',
        },
        orderBy: { createdAt: 'desc' },
      });
      const changed = dbAudit.changedFields as any;
      expect(changed.before).toEqual({ status: 'AVAILABLE' });
      expect(changed.after).toEqual({ status: 'RESERVED' });
    });

    it('records database-derived before-and-after weights with exact milligram precision for WEIGHT_CORRECTION', async () => {
      // Ornament currently gross 25.500, stone 1.500, net 24.000
      // Correct to gross 25.350, stone 1.500, net 23.850
      const res = await service.recordStockAdjustment(ownerCtx, {
        ornamentId: adjOrnament.id,
        adjustmentType: 'WEIGHT_CORRECTION',
        grossWeight: '25.350',
        stoneWeight: '1.500',
        reason: 'Laboratory precision scale calibration check',
      });

      expect(new Decimal(res.ornament.grossWeight).toFixed(3)).toBe('25.350');
      expect(new Decimal(res.ornament.netWeight).toFixed(3)).toBe('23.850');
      expect(res.movement.movementType).toBe('AUDIT_ADJUSTMENT');

      expect(res.movement.metadata).toEqual({
        adjustmentType: 'WEIGHT_CORRECTION',
        before: {
          grossWeight: '25.500',
          stoneWeight: '1.500',
          netWeight: '24.000',
        },
        after: {
          grossWeight: '25.350',
          stoneWeight: '1.500',
          netWeight: '23.850',
        },
      });

      // Verify exact Decimal strings in database
      const dbMovement = await prisma.stockMovement.findUniqueOrThrow({
        where: { id: res.movement.id },
      });
      expect(dbMovement.metadata).toEqual({
        adjustmentType: 'WEIGHT_CORRECTION',
        before: {
          grossWeight: '25.500',
          stoneWeight: '1.500',
          netWeight: '24.000',
        },
        after: {
          grossWeight: '25.350',
          stoneWeight: '1.500',
          netWeight: '23.850',
        },
      });
    });

    it('preserves actor (userId), reason, and timestamp (createdAt) on adjustment movements', async () => {
      const res = await service.recordStockAdjustment(ownerCtx, {
        ornamentId: adjOrnament.id,
        adjustmentType: 'STATUS_CHANGE',
        newStatus: 'AVAILABLE',
        reason: 'Hold reservation expired',
      });

      expect(res.movement.userId).toBe(ownerCtx.userId);
      expect(res.movement.reason).toContain('Hold reservation expired');
      expect(res.movement.createdAt).toBeInstanceOf(Date);
    });

    it('commits ornament update and stock movement atomically; fails atomically without partial writes', async () => {
      const beforeOrnament = await prisma.ornament.findUniqueOrThrow({ where: { id: adjOrnament.id } });
      const beforeMovements = await prisma.stockMovement.count({ where: { ornamentId: adjOrnament.id } });

      // Trigger a failure by passing an invalid target status
      await expect(
        service.recordStockAdjustment(ownerCtx, {
          ornamentId: adjOrnament.id,
          adjustmentType: 'STATUS_CHANGE',
          newStatus: 'INVALID_STATUS' as any,
          reason: 'Corrupt adjustment test',
        })
      ).rejects.toThrow(InventoryValidationError);

      const afterOrnament = await prisma.ornament.findUniqueOrThrow({ where: { id: adjOrnament.id } });
      const afterMovements = await prisma.stockMovement.count({ where: { ornamentId: adjOrnament.id } });

      expect(afterOrnament.status).toBe(beforeOrnament.status);
      expect(afterMovements).toBe(beforeMovements);
    });

    it('enforces branch authorization: rejects adjustment if user lacks branch access', async () => {
      // First move ornament to Vashi branch
      await prisma.ornament.update({
        where: { id: adjOrnament.id },
        data: { branchId: vashiBranch.id },
      });

      // Manager only has FORT access, so attempting adjustment on Vashi item is rejected
      await expect(
        service.recordStockAdjustment(managerCtx, {
          ornamentId: adjOrnament.id,
          adjustmentType: 'STATUS_CHANGE',
          newStatus: 'AVAILABLE',
          reason: 'Unauthorized branch adjustment',
        })
      ).rejects.toThrow(AuthorizationError);

      // Restore back to Fort branch
      await prisma.ornament.update({
        where: { id: adjOrnament.id },
        data: { branchId: fortBranch.id },
      });
    });

    it('preserves backwards compatibility: existing movements without metadata remain readable', async () => {
      // Insert a historical legacy movement record without metadata (metadata: null)
      const legacyMovement = await prisma.stockMovement.create({
        data: {
          organizationId: suvarnaOrg.id,
          ornamentId: adjOrnament.id,
          fromBranchId: fortBranch.id,
          toBranchId: fortBranch.id,
          movementType: 'LEGACY_AUDIT',
          reason: 'Pre-migration historical movement',
          metadata: undefined,
          userId: ownerCtx.userId,
        },
      });

      expect(legacyMovement.metadata).toBeNull();

      // Ensure getOrnamentMovements reads legacy records without error
      const allMovements = await service.getOrnamentMovements(ownerCtx, adjOrnament.id);
      const found = allMovements.find((m) => m.id === legacyMovement.id);
      expect(found).toBeDefined();
      expect(found!.metadata).toBeNull();

      // Clean up legacy record
      await prisma.stockMovement.delete({ where: { id: legacyMovement.id } });
    });
  });
});
