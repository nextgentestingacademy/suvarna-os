import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { resolveSecurityContext } from '@/lib/security-context';
import {
  BillingService,
  BillingValidationError,
  BillingConflictError,
  BillingNotFoundError,
} from '@/lib/billing';
import { InventoryService, InventoryConflictError } from '@/lib/inventory';
import {
  createInvoiceAction,
  getInvoiceByIdAction,
  listInvoicesAction,
} from '@/app/actions/billing';
import { SecurityContext, AuthorizationError } from '@/types/security';

describe('Suvarna Milestone 3A — Persistent Billing Service & Atomic Checkout Integration Tests', () => {
  const service = new BillingService({ prisma });
  const inventoryService = new InventoryService({ prisma });

  let suvarnaOrg: any;
  let kalyanOrg: any;
  let fortBranch: any;
  let vashiBranch: any;
  let thaneBranch: any;

  let ownerCtx: SecurityContext;
  let managerCtx: SecurityContext;
  let salesCtx: SecurityContext;
  let kalyanOwnerCtx: SecurityContext;

  let testCustomer: any;
  let kalyanCustomer: any;

  const DEV_PASSWORD = 'SuvarnaDev2026!';
  let salesHeaders: Headers;

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

  // Trackers for clean isolation
  const createdInvoiceIds: string[] = [];
  const createdOrnamentIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdCustomerIds: string[] = [];

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
    const salesUser = await prisma.user.findUniqueOrThrow({ where: { email: 'sales@suvarna.test' } });
    const kalyanOwnerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@kalyan.test' } });

    // 4. Resolve Security Contexts anchored to FORT showroom
    ownerCtx = await resolveSecurityContext(prisma, {
      userId: ownerUser.id,
      targetTenantId: suvarnaOrg.id,
      targetBranchId: fortBranch.id,
    });
    managerCtx = await resolveSecurityContext(prisma, {
      userId: managerUser.id,
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

    salesHeaders = await getSessionHeaders('sales@suvarna.test');

    // 5. Seed an isolated Customer in Suvarna
    testCustomer = await prisma.customer.create({
      data: {
        organizationId: suvarnaOrg.id,
        primaryBranchId: fortBranch.id,
        name: 'Mrs. Neha Mehta',
        phone: '+91 98200 99881',
        normalizedPhone: '9820099881',
        city: 'Mumbai',
        state: 'Maharashtra',
        pan: 'ABCDE1234F',
      },
    });
    createdCustomerIds.push(testCustomer.id);

    // 6. Seed an isolated Customer in Kalyan (for cross-tenant checks)
    kalyanCustomer = await prisma.customer.create({
      data: {
        organizationId: kalyanOrg.id,
        primaryBranchId: thaneBranch.id,
        name: 'Mr. Ramesh Shinde',
        phone: '+91 98200 99882',
        normalizedPhone: '9820099882',
        city: 'Thane',
        state: 'Maharashtra',
      },
    });
    createdCustomerIds.push(kalyanCustomer.id);
  });

  afterAll(async () => {
    // Clean up created test data in reverse relational order
    if (createdInvoiceIds.length > 0) {
      await prisma.invoicePayment.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
      await prisma.stockMovement.deleteMany({
        where: {
          metadata: {
            path: ['invoiceId'],
            string_contains: createdInvoiceIds[0], // or cleans movements for test ornaments
          },
        },
      });
      await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
    }

    if (createdOrnamentIds.length > 0) {
      await prisma.stockMovement.deleteMany({ where: { ornamentId: { in: createdOrnamentIds } } });
      await prisma.ornament.deleteMany({ where: { id: { in: createdOrnamentIds } } });
    }

    if (createdProductIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    }

    if (createdCustomerIds.length > 0) {
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
  });

  // Helper to quickly create an isolated product & available ornament
  async function createTestOrnament(branchId: string, orgId: string = suvarnaOrg.id, customTag?: string) {
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);
    const sku = `SKU-TEST-${timestamp}-${randomSuffix}`;
    const tagCode = customTag || `TAG-TEST-${timestamp}-${randomSuffix}`;

    const product = await prisma.product.create({
      data: {
        organizationId: orgId,
        sku,
        name: `Test Gold Bangle ${randomSuffix}`,
        category: 'Bangles',
        metalType: 'GOLD',
        purity: '22K',
      },
    });
    createdProductIds.push(product.id);

    const ornament = await prisma.ornament.create({
      data: {
        organizationId: orgId,
        branchId,
        productId: product.id,
        tagCode,
        huid: `H${randomSuffix}`,
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '15.500',
        stoneWeight: '0.500',
        netWeight: '15.000',
        makingChargeType: 'PER_GRAM',
        makingChargeValue: '600.00',
        costAmount: '90000.00',
        priceAmount: '120000.00',
        status: 'AVAILABLE',
      },
    });
    createdOrnamentIds.push(ornament.id);

    return ornament;
  }

  describe('1. Successful Atomic Checkout with Customer & Split Payments', () => {
    it('finalizes a retail sale, issues sequential invoice, marks stock SOLD, and records ledger SALE movement', async () => {
      const ornament = await createTestOrnament(fortBranch.id);

      const invoice = await service.createInvoice(salesCtx, {
        customerId: testCustomer.id,
        items: [
          {
            ornamentId: ornament.id,
            grossWeight: '15.500',
            stoneWeight: '0.500',
            ratePerGram: '7200.00',
            makingChargeType: 'PER_GRAM',
            makingChargeRate: '600.00',
            stoneCharges: '1000.00',
          },
        ],
        payments: [
          { paymentMethod: 'UPI', amount: '60000.00', transactionRef: 'UPI-REF-1001' },
          { paymentMethod: 'CARD', amount: '61540.00', transactionRef: 'CARD-APPR-992' },
        ],
      });
      createdInvoiceIds.push(invoice.id);

      // Verify Invoice Header
      expect(invoice.id).toBeDefined();
      expect(invoice.invoiceNumber).toMatch(/^INV\/FORT\/\d{2}-\d{2}\/\d{4}$/);
      expect(invoice.customerName).toBe('Mrs. Neha Mehta');
      expect(invoice.customerPhone).toBe('+91 98200 99881');
      expect(invoice.customerPan).toBe('ABCDE1234F');
      expect(invoice.status).toBe('COMPLETED');
      expect(invoice.paymentStatus).toBe('PAID');
      expect(Number(invoice.paidAmount)).toBe(121540);
      expect(Number(invoice.balanceAmount)).toBe(0);

      // Verify Ornament is now SOLD
      const updatedOrnament = await prisma.ornament.findUniqueOrThrow({ where: { id: ornament.id } });
      expect(updatedOrnament.status).toBe('SOLD');

      // Verify exactly one StockMovement of type SALE
      const movements = await prisma.stockMovement.findMany({
        where: { ornamentId: ornament.id },
      });
      expect(movements.length).toBe(1);
      expect(movements[0].movementType).toBe('SALE');
      expect(movements[0].fromBranchId).toBe(fortBranch.id);
      expect(movements[0].toBranchId).toBeNull();
      expect(movements[0].reason).toContain(invoice.invoiceNumber);

      // Verify Invoice Items and Payments
      expect(invoice.items.length).toBe(1);
      expect(invoice.items[0].tagCode).toBe(ornament.tagCode);
      expect(Number(invoice.items[0].netWeight)).toBe(15);
      expect(invoice.payments.length).toBe(2);
    });

    it('supports walk-in / guest sales without requiring CRM customer ID', async () => {
      const ornament = await createTestOrnament(fortBranch.id);

      const invoice = await service.createInvoice(salesCtx, {
        customerName: 'Aarav Sharma',
        customerPhone: '9876543210',
        items: [
          {
            ornamentId: ornament.id,
            grossWeight: '15.500',
            stoneWeight: '0.500',
            ratePerGram: '7000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [{ paymentMethod: 'CASH', amount: '113300.00' }],
      });
      createdInvoiceIds.push(invoice.id);

      expect(invoice.customerId).toBeNull();
      expect(invoice.customerName).toBe('Aarav Sharma');
      expect(invoice.customerPhone).toBe('9876543210');
      expect(invoice.paymentStatus).toBe('PAID');
    });

    it('correctly increments monotonic sequential numbers per branch', async () => {
      const orn1 = await createTestOrnament(fortBranch.id);
      const orn2 = await createTestOrnament(fortBranch.id);

      const inv1 = await service.createInvoice(salesCtx, {
        customerName: 'First Patron',
        items: [{ ornamentId: orn1.id, grossWeight: '15.000', ratePerGram: '7000' }],
      });
      createdInvoiceIds.push(inv1.id);

      const inv2 = await service.createInvoice(salesCtx, {
        customerName: 'Second Patron',
        items: [{ ornamentId: orn2.id, grossWeight: '15.000', ratePerGram: '7000' }],
      });
      createdInvoiceIds.push(inv2.id);

      expect(inv2.sequenceNumber).toBe(inv1.sequenceNumber + 1);
    });
  });

  describe('2. Idempotency Key & Duplicate Prevention', () => {
    it('returns existing invoice on retried checkout request with same idempotency key without double-selling', async () => {
      const ornament = await createTestOrnament(fortBranch.id);
      const idempotencyKey = `idem-key-${Date.now()}`;

      const firstCall = await service.createInvoice(salesCtx, {
        idempotencyKey,
        customerName: 'Rohit Verma',
        items: [{ ornamentId: ornament.id, grossWeight: '15.000', ratePerGram: '7000' }],
      });
      createdInvoiceIds.push(firstCall.id);

      // Repeat request with same key
      const secondCall = await service.createInvoice(salesCtx, {
        idempotencyKey,
        customerName: 'Rohit Verma',
        items: [{ ornamentId: ornament.id, grossWeight: '15.000', ratePerGram: '7000' }],
      });

      expect(secondCall.id).toBe(firstCall.id);
      expect(secondCall.invoiceNumber).toBe(firstCall.invoiceNumber);

      // Ensure stock movement was NOT recorded twice
      const movements = await prisma.stockMovement.findMany({ where: { ornamentId: ornament.id } });
      expect(movements.length).toBe(1);
    });

    it('rejects reusing idempotency key with a materially different checkout payload', async () => {
      const orn1 = await createTestOrnament(fortBranch.id);
      const orn2 = await createTestOrnament(fortBranch.id);
      const idempotencyKey = `conflict-key-${Date.now()}`;

      // First call with orn1
      const firstCall = await service.createInvoice(salesCtx, {
        idempotencyKey,
        customerName: 'Original Patron',
        items: [{ ornamentId: orn1.id, grossWeight: '15.000', ratePerGram: '7000' }],
      });
      createdInvoiceIds.push(firstCall.id);

      // Reusing the same key with orn2 must be safely rejected
      await expect(
        service.createInvoice(salesCtx, {
          idempotencyKey,
          customerName: 'Different Patron',
          items: [{ ornamentId: orn2.id, grossWeight: '15.000', ratePerGram: '7000' }],
        })
      ).rejects.toThrowError(/Idempotency conflict/);

      // Confirm orn2 was NOT sold
      const freshOrn2 = await prisma.ornament.findUniqueOrThrow({ where: { id: orn2.id } });
      expect(freshOrn2.status).toBe('AVAILABLE');
    });
  });

  describe('3. Concurrency Protection & Contested Stock Sales', () => {
    it('genuinely concurrent checkout attempts on the same ornament allow at most one sale to succeed and abort the second', async () => {
      const contestedOrnament = await createTestOrnament(fortBranch.id);

      // Execute two simultaneous checkout requests targeting the EXACT SAME available ornament
      const results = await Promise.allSettled([
        service.createInvoice(salesCtx, {
          customerName: 'Concurrent Buyer Alpha',
          items: [{ ornamentId: contestedOrnament.id, grossWeight: '15.000', ratePerGram: '7000' }],
        }),
        service.createInvoice(salesCtx, {
          customerName: 'Concurrent Buyer Beta',
          items: [{ ornamentId: contestedOrnament.id, grossWeight: '15.000', ratePerGram: '7000' }],
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

      // Exactly one must succeed, and one must be rejected
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      createdInvoiceIds.push(fulfilled[0].value.id);

      // Rejected request must have failed with BillingConflictError
      expect(rejected[0].reason).toBeInstanceOf(BillingConflictError);

      // In the database: status must be SOLD, exactly 1 SALE movement, and exactly 1 invoice
      const finalOrnament = await prisma.ornament.findUniqueOrThrow({ where: { id: contestedOrnament.id } });
      expect(finalOrnament.status).toBe('SOLD');

      const movements = await prisma.stockMovement.findMany({ where: { ornamentId: contestedOrnament.id } });
      expect(movements.length).toBe(1);
      expect(movements[0].movementType).toBe('SALE');

      const matchingInvoices = await prisma.invoiceItem.findMany({
        where: { ornamentId: contestedOrnament.id },
      });
      expect(matchingInvoices.length).toBe(1);
    });

    it('genuinely concurrent branch transfer against a retail sale permits exactly one winner and preserves stock consistency', async () => {
      const raceOrnament = await createTestOrnament(fortBranch.id);

      // Execute checkout at FORT and inter-branch transfer from FORT to VASHI simultaneously
      const results = await Promise.allSettled([
        service.createInvoice(salesCtx, {
          customerName: 'Race Retail Patron',
          items: [{ ornamentId: raceOrnament.id, grossWeight: '15.000', ratePerGram: '7000' }],
        }),
        inventoryService.transferOrnament(ownerCtx, {
          ornamentId: raceOrnament.id,
          fromBranchId: fortBranch.id,
          toBranchId: vashiBranch.id,
          reason: 'Showroom rebalance transfer',
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly one operation wins the row-level lock
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // The ornament state must be completely consistent:
      const finalState = await prisma.ornament.findUniqueOrThrow({ where: { id: raceOrnament.id } });
      if (finalState.status === 'SOLD') {
        // Sale won
        const saleResult = fulfilled[0] as PromiseFulfilledResult<any>;
        createdInvoiceIds.push(saleResult.value.id);
        expect(finalState.branchId).toBe(fortBranch.id);
      } else {
        // Transfer won
        expect(finalState.status).toBe('AVAILABLE');
        expect(finalState.branchId).toBe(vashiBranch.id);
      }
    });

    it('rejects adding the same ornament multiple times within one checkout payload', async () => {
      const duplicateTarget = await createTestOrnament(fortBranch.id);

      await expect(
        service.createInvoice(salesCtx, {
          customerName: 'Double Item Patron',
          items: [
            { ornamentId: duplicateTarget.id, grossWeight: '15.000', ratePerGram: '7000' },
            { ornamentId: duplicateTarget.id, grossWeight: '15.000', ratePerGram: '7000' },
          ],
        })
      ).rejects.toThrowError(/An ornament cannot be added more than once/);
    });

    it('prevents selling an ornament that is already marked as SOLD', async () => {
      const ornament = await createTestOrnament(fortBranch.id);

      // First sale succeeds
      const inv1 = await service.createInvoice(salesCtx, {
        customerName: 'Buyer One',
        items: [{ ornamentId: ornament.id, grossWeight: '15.000', ratePerGram: '7000' }],
      });
      createdInvoiceIds.push(inv1.id);

      // Second sale attempting to sell the same ornament must fail
      await expect(
        service.createInvoice(salesCtx, {
          customerName: 'Buyer Two',
          items: [{ ornamentId: ornament.id, grossWeight: '15.000', ratePerGram: '7000' }],
        })
      ).rejects.toThrowError(BillingConflictError);
    });

    it('rejects selling an ornament located at a different showroom branch', async () => {
      // Ornament is located at VASHI showroom
      const vashiOrnament = await createTestOrnament(vashiBranch.id);

      // salesCtx is operating at FORT showroom
      await expect(
        service.createInvoice(salesCtx, {
          customerName: 'Wrong Showroom Patron',
          items: [{ ornamentId: vashiOrnament.id, grossWeight: '15.000', ratePerGram: '7000' }],
        })
      ).rejects.toThrowError(/located at another branch/);
    });

    it('rolls back completely if one ornament in a multi-item sale is unavailable', async () => {
      const availOrn = await createTestOrnament(fortBranch.id);
      const soldOrn = await createTestOrnament(fortBranch.id);

      // Prematurely mark soldOrn as SOLD
      await prisma.ornament.update({
        where: { id: soldOrn.id },
        data: { status: 'SOLD' },
      });

      // Attempt to checkout both
      await expect(
        service.createInvoice(salesCtx, {
          customerName: 'Multi Item Patron',
          customerPan: 'ABCDE1234F',
          items: [
            { ornamentId: availOrn.id, grossWeight: '15.000', ratePerGram: '7000' },
            { ornamentId: soldOrn.id, grossWeight: '15.000', ratePerGram: '7000' },
          ],
        })
      ).rejects.toThrowError(BillingConflictError);

      // Verify that availOrn remained AVAILABLE (atomic rollback)
      const freshAvail = await prisma.ornament.findUniqueOrThrow({ where: { id: availOrn.id } });
      expect(freshAvail.status).toBe('AVAILABLE');

      // Verify no movements recorded for availOrn
      const movements = await prisma.stockMovement.findMany({ where: { ornamentId: availOrn.id } });
      expect(movements.length).toBe(0);
    });
  });

  describe('4. Regulatory & KYC Compliance Validation', () => {
    it('enforces Income Tax PAN capture on transactions >= ₹2,00,000 (Rule 114B)', async () => {
      const highValOrn = await createTestOrnament(fortBranch.id);

      // 35g @ ₹7,000 = ₹2,45,000 + GST = > ₹2,00,000
      await expect(
        service.createInvoice(salesCtx, {
          customerName: 'High Value Cash Patron',
          items: [
            {
              ornamentId: highValOrn.id,
              grossWeight: '35.000',
              ratePerGram: '7000.00',
            },
          ],
        })
      ).rejects.toThrowError(/Government KYC compliance requires a valid Income Tax PAN/);

      // Providing a valid PAN succeeds
      const successfulKycInvoice = await service.createInvoice(salesCtx, {
        customerName: 'High Value Cash Patron',
        customerPan: 'ABCDE1234F',
        items: [
          {
            ornamentId: highValOrn.id,
            grossWeight: '35.000',
            ratePerGram: '7000.00',
          },
        ],
      });
      createdInvoiceIds.push(successfulKycInvoice.id);

      expect(successfulKycInvoice.customerPan).toBe('ABCDE1234F');
      expect(Number(successfulKycInvoice.grandTotal)).toBeGreaterThan(200000);
    });
  });

  describe('5. Cross-Tenant Isolation & Security Boundaries', () => {
    it('rejects attempt to sell ornament belonging to another tenant', async () => {
      const kalyanOrnament = await createTestOrnament(thaneBranch.id, kalyanOrg.id);

      await expect(
        service.createInvoice(salesCtx, {
          customerName: 'Cross Tenant Tester',
          items: [{ ornamentId: kalyanOrnament.id, grossWeight: '15.000', ratePerGram: '7000' }],
        })
      ).rejects.toThrowError(/not found in your business catalogue/);
    });

    it('rejects linking an invoice to a customer belonging to another tenant', async () => {
      const ornament = await createTestOrnament(fortBranch.id);

      await expect(
        service.createInvoice(salesCtx, {
          customerId: kalyanCustomer.id, // from Kalyan
          items: [{ ornamentId: ornament.id, grossWeight: '15.000', ratePerGram: '7000' }],
        })
      ).rejects.toThrowError(/not found in your business records/);
    });

    it('prevents user from another tenant from retrieving or viewing invoices', async () => {
      const ornament = await createTestOrnament(fortBranch.id);
      const invoice = await service.createInvoice(salesCtx, {
        customerName: 'Secret Customer',
        items: [{ ornamentId: ornament.id, grossWeight: '15.000', ratePerGram: '7000' }],
      });
      createdInvoiceIds.push(invoice.id);

      // Kalyan owner trying to fetch Suvarna invoice by ID
      const result = await service.getInvoiceById(kalyanOwnerCtx, invoice.id);
      expect(result).toBeNull();
    });
  });

  describe('6. Retrieval, Showroom Filters & Audit Trails', () => {
    it('retrieves an invoice by ID with items and payments', async () => {
      const ornament = await createTestOrnament(fortBranch.id);
      const created = await service.createInvoice(ownerCtx, {
        customerName: 'Retrievable Patron',
        items: [{ ornamentId: ornament.id, grossWeight: '15.000', ratePerGram: '7000' }],
        payments: [{ paymentMethod: 'UPI', amount: '108150.00' }],
      });
      createdInvoiceIds.push(created.id);

      const fetched = await service.getInvoiceById(ownerCtx, created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.invoiceNumber).toBe(created.invoiceNumber);
      expect(fetched?.items.length).toBe(1);
      expect(fetched?.payments.length).toBe(1);
    });

    it('lists and paginates invoices scoped strictly to the caller tenant', async () => {
      const result = await service.listInvoices(ownerCtx, {
        branchId: fortBranch.id,
        limit: 10,
      });

      expect(result.invoices.length).toBeGreaterThan(0);
      expect(result.invoices.every((inv) => inv.organizationId === suvarnaOrg.id)).toBe(true);
      expect(result.invoices.every((inv) => inv.branchId === fortBranch.id)).toBe(true);
    });

    it('writes a privacy-safe audit log entry on invoice creation', async () => {
      const ornament = await createTestOrnament(fortBranch.id);
      const invoice = await service.createInvoice(salesCtx, {
        customerName: 'Audit Test Patron',
        customerPan: 'ABCDE1234F',
        items: [{ ornamentId: ornament.id, grossWeight: '15.000', ratePerGram: '7000' }],
      });
      createdInvoiceIds.push(invoice.id);

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: suvarnaOrg.id,
          entityType: 'Invoice',
          entityId: invoice.id,
        },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.action).toBe('CREATE');
      const changed = auditLog?.changedFields as any;
      expect(changed.invoiceNumber).toBe(invoice.invoiceNumber);
      // PAN is never leaked in changedFields
      expect(JSON.stringify(changed)).not.toContain('ABCDE1234F');
    });
  });

  describe('7. Server Action Enforcement & Serialization', () => {
    it('allows SALES_STAFF to create invoice via server action with serialized data', async () => {
      const ornament = await createTestOrnament(fortBranch.id);
      const freshSalesHeaders = await getSessionHeaders('sales@suvarna.test');

      const actionResult = await createInvoiceAction(
        {
          customerName: 'Action Patron',
          items: [{ ornamentId: ornament.id, grossWeight: '15.000', ratePerGram: '7000' }],
        },
        { headers: freshSalesHeaders }
      );

      expect(actionResult.success).toBe(true);
      expect(actionResult.data).toBeDefined();
      if (actionResult.data) {
        createdInvoiceIds.push(actionResult.data.id);
        expect(typeof actionResult.data.grandTotal).toBe('string');
        expect(typeof actionResult.data.invoiceDate).toBe('string');
      }
    });
  });

  describe('8. Payment Integrity, Multi-Tender Split & State Transitions', () => {
    it('supports completely unpaid invoice, setting UNPAID status and balance due equal to grand total', async () => {
      const ornament = await createTestOrnament(fortBranch.id);

      const invoice = await service.createInvoice(salesCtx, {
        customerName: 'Credit Line Patron',
        items: [{ ornamentId: ornament.id, grossWeight: '10.000', ratePerGram: '7000' }],
        payments: [], // No payments recorded at checkout
      });
      createdInvoiceIds.push(invoice.id);

      expect(invoice.paymentStatus).toBe('UNPAID');
      expect(Number(invoice.paidAmount)).toBe(0);
      expect(Number(invoice.balanceAmount)).toBe(Number(invoice.grandTotal));
      expect(invoice.payments.length).toBe(0);
    });

    it('supports partial payment, correctly recording balance due and PARTIAL status', async () => {
      const ornament = await createTestOrnament(fortBranch.id);

      // 10g @ 7000 = 70,000 + 3% GST = 72,100
      const invoice = await service.createInvoice(salesCtx, {
        customerName: 'Deposit Patron',
        items: [{ ornamentId: ornament.id, grossWeight: '10.000', ratePerGram: '7000' }],
        payments: [{ paymentMethod: 'UPI', amount: '30000.00', transactionRef: 'UPI-DEP-101' }],
      });
      createdInvoiceIds.push(invoice.id);

      expect(invoice.paymentStatus).toBe('PARTIAL');
      expect(Number(invoice.paidAmount)).toBe(30000);
      expect(Number(invoice.balanceAmount)).toBe(42100);
      expect(invoice.payments.length).toBe(1);
    });

    it('rejects overpayments where total tenders exceed invoice grand total', async () => {
      const ornament = await createTestOrnament(fortBranch.id);

      // 10g @ 7000 = 70,000 + 3% GST = 72,100
      await expect(
        service.createInvoice(salesCtx, {
          customerName: 'Excess Cash Patron',
          items: [{ ornamentId: ornament.id, grossWeight: '10.000', ratePerGram: '7000' }],
          payments: [{ paymentMethod: 'CASH', amount: '80000.00' }], // exceeds 72,100
        })
      ).rejects.toThrowError(/cannot exceed invoice grand total/);

      // Ensure ornament was NOT sold
      const freshOrn = await prisma.ornament.findUniqueOrThrow({ where: { id: ornament.id } });
      expect(freshOrn.status).toBe('AVAILABLE');
    });

    it('rejects non-positive payment tender amounts', async () => {
      const ornament = await createTestOrnament(fortBranch.id);

      await expect(
        service.createInvoice(salesCtx, {
          customerName: 'Zero Payment Patron',
          items: [{ ornamentId: ornament.id, grossWeight: '10.000', ratePerGram: '7000' }],
          payments: [{ paymentMethod: 'CASH', amount: '0.00' }],
        })
      ).rejects.toThrowError(/Payment amount must be greater than zero/);
    });
  });
});
