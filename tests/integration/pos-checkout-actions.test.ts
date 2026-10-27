import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, withDbRetry } from '@/lib/db';
import { auth } from '@/lib/auth';
import { resolveSecurityContext } from '@/lib/security-context';
import {
  calculateCartTotalsAction,
  getInvoiceByIdAction,
  createInvoiceAction,
} from '@/app/actions/billing';
import { InventoryService } from '@/lib/inventory';
import { BillingService } from '@/lib/billing';
import { SecurityContext } from '@/types/security';

describe('Suvarna Phase 3B — POS Checkout Server Actions & Real-Time Calculation Tests', () => {
  const inventoryService = new InventoryService({ prisma });
  const billingService = new BillingService({ prisma });

  let suvarnaOrg: any;
  let fortBranch: any;
  let vashiBranch: any;
  let kalyanOrg: any;
  let thaneBranch: any;

  let ownerCtx: SecurityContext;
  let salesCtx: SecurityContext;
  let kalyanOwnerCtx: SecurityContext;

  const DEV_PASSWORD = 'SuvarnaDev2026!';
  let salesHeaders: Headers;
  let kalyanHeaders: Headers;

  let testProduct: any;
  let testOrnament: any;
  let testCustomer: any;

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

    const salesUser = await withDbRetry(() => prisma.user.findUniqueOrThrow({ where: { email: 'sales@suvarna.test' } }), 3, 500);
    const ownerUser = await withDbRetry(() => prisma.user.findUniqueOrThrow({ where: { email: 'owner@suvarna.test' } }), 3, 500);
    const kalyanOwner = await withDbRetry(() => prisma.user.findUniqueOrThrow({ where: { email: 'owner@kalyan.test' } }), 3, 500);

    salesCtx = await resolveSecurityContext(prisma, {
      userId: salesUser.id,
      targetTenantId: suvarnaOrg.id,
      targetBranchId: fortBranch.id,
    });

    ownerCtx = await resolveSecurityContext(prisma, {
      userId: ownerUser.id,
      targetTenantId: suvarnaOrg.id,
      targetBranchId: fortBranch.id,
    });

    kalyanOwnerCtx = await resolveSecurityContext(prisma, {
      userId: kalyanOwner.id,
      targetTenantId: kalyanOrg.id,
      targetBranchId: thaneBranch.id,
    });

    salesHeaders = await getSessionHeaders('sales@suvarna.test');
    kalyanHeaders = await getSessionHeaders('owner@kalyan.test');

    // Create a catalog product and ornament in Fort branch
    testProduct = await inventoryService.createProduct(ownerCtx, {
      sku: `POS-PROD-${Date.now()}`,
      name: 'POS 22K Royal Choker',
      category: 'Necklaces',
      metalType: 'GOLD',
      purity: '22K',
    });

    const reg = await inventoryService.registerOrnament(ownerCtx, {
      productId: testProduct.id,
      branchId: fortBranch.id,
      tagCode: `POS-TAG-${Date.now()}`,
      metalType: 'GOLD',
      purity: '22K',
      grossWeight: '25.500',
      stoneWeight: '0.500',
      makingChargeType: 'PER_GRAM',
      makingChargeValue: '800.00',
      priceAmount: '320000.00',
    });
    testOrnament = reg.ornament;

    testCustomer = await prisma.customer.create({
      data: {
        organizationId: suvarnaOrg.id,
        name: 'POS Test Customer',
        phone: '9820055111',
        normalizedPhone: '9820055111',
        state: 'Maharashtra',
      },
    });
  });

  describe('1. calculateCartTotalsAction (Real-Time POS Authoritative Preview)', () => {
    it('calculates zero totals when cart is empty', async () => {
      const res = await calculateCartTotalsAction({ items: [] }, { headers: salesHeaders });
      expect(res.success).toBe(true);
      expect(res.data?.grandTotal).toBe('0.00');
      expect(res.data?.calculatedItems.length).toBe(0);
    });

    it('calculates exact line item and aggregate GST breakdown for in-store sale', async () => {
      const res = await calculateCartTotalsAction(
        {
          items: [
            {
              ornamentId: testOrnament.id,
              grossWeight: '25.500',
              stoneWeight: '0.500',
              ratePerGram: '12000.00',
              makingChargeType: 'PER_GRAM',
              makingChargeRate: '800.00',
              stoneCharges: '1000.00',
              itemDiscount: '0.00',
            },
          ],
          discountAmount: '0.00',
          customerState: 'Maharashtra',
        },
        { headers: salesHeaders }
      );

      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();

      // Net weight = 25.500 - 0.500 = 25.000g
      // Metal value = 25 * 12000 = 300,000.00
      // Making charge = 25 * 800 = 20,000.00
      // Stone charges = 1,000.00
      // Taxable = 321,000.00
      // Intra-state GST (3%): CGST 1.5% (4,815.00) + SGST 1.5% (4,815.00) = 9,630.00
      // Grand Total = 321,000 + 9,630 = 330,630.00
      expect(res.data?.subtotal).toBe('321000.00');
      expect(res.data?.taxableAmount).toBe('321000.00');
      expect(res.data?.isInterState).toBe(false);
      expect(res.data?.cgstAmount).toBe('4815.00');
      expect(res.data?.sgstAmount).toBe('4815.00');
      expect(res.data?.igstAmount).toBe('0.00');
      expect(res.data?.totalTax).toBe('9630.00');
      expect(res.data?.grandTotal).toBe('330630.00');
    });

    it('calculates inter-state IGST 3% when customer state differs from branch', async () => {
      const res = await calculateCartTotalsAction(
        {
          items: [
            {
              ornamentId: testOrnament.id,
              grossWeight: '10.000',
              stoneWeight: '0.000',
              ratePerGram: '10000.00',
              makingChargeType: 'FIXED',
              makingChargeRate: '5000.00',
            },
          ],
          customerState: 'Gujarat', // Inter-state from Maharashtra
        },
        { headers: salesHeaders }
      );

      expect(res.success).toBe(true);
      expect(res.data?.isInterState).toBe(true);
      // Taxable = 100,000 + 5,000 = 105,000
      // IGST 3% = 3,150.00
      expect(res.data?.cgstAmount).toBe('0.00');
      expect(res.data?.sgstAmount).toBe('0.00');
      expect(res.data?.igstAmount).toBe('3150.00');
      expect(res.data?.grandTotal).toBe('108150.00');
    });
  });

  describe('2. getInvoiceByIdAction (Rich Showroom & Legal Entity Details)', () => {
    it('retrieves an issued invoice with populated showroom branch and organization metadata', async () => {
      // Create a sale via createInvoiceAction
      const checkoutRes = await createInvoiceAction(
        {
          customerId: testCustomer.id,
          customerName: testCustomer.name,
          customerPhone: testCustomer.phone,
          customerPan: 'ABCDE1234F',
          items: [
            {
              ornamentId: testOrnament.id,
              grossWeight: '25.500',
              stoneWeight: '0.500',
              ratePerGram: '12000.00',
              makingChargeType: 'PER_GRAM',
              makingChargeRate: '800.00',
            },
          ],
          payments: [
            {
              paymentMethod: 'UPI',
              amount: '329600.00',
              transactionRef: 'UPI-TEST-12345',
            },
          ],
        },
        { headers: salesHeaders }
      );

      expect(checkoutRes.success).toBe(true);
      const invoiceId = checkoutRes.data?.id!;

      // Retrieve via getInvoiceByIdAction
      const getRes = await getInvoiceByIdAction(invoiceId, { headers: salesHeaders });
      expect(getRes.success).toBe(true);
      expect(getRes.data).toBeDefined();

      const inv = getRes.data!;
      expect(inv.id).toBe(invoiceId);
      expect(inv.invoiceNumber).toMatch(/^INV\/FORT\//);
      expect(inv.items.length).toBe(1);
      expect(inv.payments.length).toBe(1);

      // Verify enriched showroom branch & legal entity
      expect(inv.branch).toBeDefined();
      expect(inv.branch?.code).toBe('FORT');
      expect(inv.branch?.state).toBe('Maharashtra');

      expect(inv.organization).toBeDefined();
      expect(inv.organization?.name).toBe('Suvarna Jewellers Mumbai');
      expect(inv.organization?.legalName).toBe('Suvarna Jewellery Retail Pvt. Ltd.');
      expect(inv.organization?.gstin).toBe('27AAAAA0000A1Z5');
      expect(inv.organization?.pan).toBe('AAAAA0000A');
    });

    it('rejects cross-tenant invoice retrieval attempts', async () => {
      // Create another invoice in Suvarna
      const reg2 = await inventoryService.registerOrnament(ownerCtx, {
        productId: testProduct.id,
        branchId: fortBranch.id,
        tagCode: `POS-TAG-2-${Date.now()}`,
        grossWeight: '10.000',
        stoneWeight: '0.000',
      });

      const inv = await billingService.createInvoice(ownerCtx, {
        customerName: 'Guest Person',
        items: [{ ornamentId: reg2.ornament.id, grossWeight: '10.000', ratePerGram: '10000.00' }],
      });

      // Kalyan owner tries to get Suvarna invoice
      const res = await getInvoiceByIdAction(inv.id, { headers: kalyanHeaders });
      expect(res.success).toBe(false);
      expect(res.code).toBe('NOT_FOUND');
    });
  });

  describe('3. High-Value Sale & Registered Customer PAN Quoting', () => {
    it('accepts customerPan for a registered customer without PAN and enriches customer CRM record', async () => {
      // Create a registered customer who has no PAN
      const noPanCustomer = await prisma.customer.create({
        data: {
          organizationId: suvarnaOrg.id,
          name: 'Nischal Hooda',
          phone: `98200${Math.floor(10000 + Math.random() * 90000)}`,
          normalizedPhone: `98200${Math.floor(10000 + Math.random() * 90000)}`,
          pan: null,
          city: 'Mumbai',
          state: 'Maharashtra',
        },
      });

      // Register an ornament with value >= ₹2,00,000 (e.g. 20g @ ₹12,000/g = ₹2,40,000)
      const highValOrnament = await inventoryService.registerOrnament(ownerCtx, {
        productId: testProduct.id,
        branchId: fortBranch.id,
        tagCode: `POS-HV-${Date.now()}`,
        grossWeight: '20.000',
        stoneWeight: '0.000',
        makingChargeType: 'PER_GRAM',
        makingChargeValue: '500.00',
      });

      // 1. Attempt checkout without PAN -> should fail KYC PAN requirement
      const failRes = await createInvoiceAction(
        {
          customerId: noPanCustomer.id,
          items: [
            {
              ornamentId: highValOrnament.ornament.id,
              grossWeight: '20.000',
              ratePerGram: '12000.00',
              makingChargeType: 'PER_GRAM',
              makingChargeRate: '500.00',
            },
          ],
          payments: [{ paymentMethod: 'UPI', amount: '257500.00' }],
        },
        { headers: salesHeaders }
      );
      expect(failRes.success).toBe(false);
      expect(failRes.error).toContain('Rule 114B');

      // 2. Supply customerPan during checkout -> should succeed
      const successRes = await createInvoiceAction(
        {
          customerId: noPanCustomer.id,
          customerPan: 'ABCDE1234F',
          items: [
            {
              ornamentId: highValOrnament.ornament.id,
              grossWeight: '20.000',
              ratePerGram: '12000.00',
              makingChargeType: 'PER_GRAM',
              makingChargeRate: '500.00',
            },
          ],
          payments: [{ paymentMethod: 'UPI', amount: '257500.00' }],
        },
        { headers: salesHeaders }
      );

      expect(successRes.success).toBe(true);
      expect(successRes.data?.customerPan).toBe('ABCDE1234F');

      // 3. Verify that the registered customer CRM record was permanently enriched with the PAN
      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: noPanCustomer.id },
      });
      expect(updatedCustomer?.pan).toBe('ABCDE1234F');
    });

    it('rejects adding duplicate physical ornament ID on the same sales invoice', async () => {
      const dupOrnament = await inventoryService.registerOrnament(ownerCtx, {
        productId: testProduct.id,
        branchId: fortBranch.id,
        tagCode: `TAG-DUP-${Date.now()}`,
        grossWeight: '8.000',
        stoneWeight: '0.000',
        makingChargeType: 'FIXED',
        makingChargeValue: '1000.00',
      });

      const res = await createInvoiceAction(
        {
          customerId: testCustomer.id,
          items: [
            {
              ornamentId: dupOrnament.ornament.id,
              grossWeight: '8.000',
              ratePerGram: '7500.00',
              makingChargeType: 'FIXED',
              makingChargeRate: '1000.00',
            },
            {
              ornamentId: dupOrnament.ornament.id,
              grossWeight: '8.000',
              ratePerGram: '7500.00',
              makingChargeType: 'FIXED',
              makingChargeRate: '1000.00',
            },
          ],
          payments: [{ paymentMethod: 'CASH', amount: '125660.00' }],
        },
        { headers: salesHeaders }
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/duplicate|already exists|unique|more than once/i);
    });

    it('successfully checks out multiple distinct physical ornaments sharing the exact same SKU', async () => {
      // Create two distinct serialized ornaments for the same SKU
      const piece1 = await inventoryService.registerOrnament(ownerCtx, {
        productId: testProduct.id,
        branchId: fortBranch.id,
        tagCode: `TAG-SKU-1-${Date.now()}`,
        grossWeight: '10.000',
        stoneWeight: '0.000',
        makingChargeType: 'PER_GRAM',
        makingChargeValue: '400.00',
      });

      const piece2 = await inventoryService.registerOrnament(ownerCtx, {
        productId: testProduct.id,
        branchId: fortBranch.id,
        tagCode: `TAG-SKU-2-${Date.now()}`,
        grossWeight: '12.000',
        stoneWeight: '0.000',
        makingChargeType: 'PER_GRAM',
        makingChargeValue: '400.00',
      });

      // Calculate totals for both distinct pieces
      const calcRes = await calculateCartTotalsAction(
        {
          items: [
            {
              ornamentId: piece1.ornament.id,
              grossWeight: '10.000',
              ratePerGram: '7500.00',
              makingChargeType: 'PER_GRAM',
              makingChargeRate: '400.00',
            },
            {
              ornamentId: piece2.ornament.id,
              grossWeight: '12.000',
              ratePerGram: '7500.00',
              makingChargeType: 'PER_GRAM',
              makingChargeRate: '400.00',
            },
          ],
        },
        { headers: salesHeaders }
      );

      expect(calcRes.success).toBe(true);
      const expectedTotal = calcRes.data!.grandTotal;

      // Checkout both items on a single tax invoice
      const checkoutRes = await createInvoiceAction(
        {
          customerId: testCustomer.id,
          items: [
            {
              ornamentId: piece1.ornament.id,
              grossWeight: '10.000',
              ratePerGram: '7500.00',
              makingChargeType: 'PER_GRAM',
              makingChargeRate: '400.00',
            },
            {
              ornamentId: piece2.ornament.id,
              grossWeight: '12.000',
              ratePerGram: '7500.00',
              makingChargeType: 'PER_GRAM',
              makingChargeRate: '400.00',
            },
          ],
          payments: [{ paymentMethod: 'UPI', amount: expectedTotal }],
        },
        { headers: salesHeaders }
      );

      expect(checkoutRes.success).toBe(true);
      expect(checkoutRes.data?.items).toHaveLength(2);
      expect(checkoutRes.data?.items[0].sku).toBe(checkoutRes.data?.items[1].sku);
      expect(checkoutRes.data?.items[0].tagCode).not.toBe(checkoutRes.data?.items[1].tagCode);

      // Verify both inventory assets are atomically transitioned to SOLD
      const checkPiece1 = await prisma.ornament.findUnique({ where: { id: piece1.ornament.id } });
      const checkPiece2 = await prisma.ornament.findUnique({ where: { id: piece2.ornament.id } });
      expect(checkPiece1?.status).toBe('SOLD');
      expect(checkPiece2?.status).toBe('SOLD');

      // Verify retrieval by invoice number
      const fetchByNumber = await getInvoiceByIdAction(checkoutRes.data!.invoiceNumber, {
        headers: salesHeaders,
      });
      expect(fetchByNumber.success).toBe(true);
      expect(fetchByNumber.data?.id).toBe(checkoutRes.data?.id);
    });
  });
});
