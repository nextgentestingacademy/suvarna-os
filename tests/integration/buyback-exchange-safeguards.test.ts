import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { resolveSecurityContext } from '@/lib/security-context';
import { metalRateService } from '@/lib/metal-rates';
import {
  buybackService,
  BuybackValidationError,
  BuybackConflictError,
  BuybackNotFoundError,
} from '@/lib/buyback';
import { BillingService, BillingValidationError, BillingConflictError } from '@/lib/billing';
import { SecurityContext, AuthorizationError } from '@/types/security';
import { Decimal } from '@/lib/decimal';

describe('Integration: Buyback Exchange Credit & Authorization Safeguards', () => {
  const billingService = new BillingService({ prisma });

  let suvarnaOrg: any;
  let kalyanOrg: any;
  let fortBranch: any;
  let thaneBranch: any;

  let ownerCtx: SecurityContext;
  let managerCtx: SecurityContext;
  let salesCtx: SecurityContext;
  let otherSalesCtx: SecurityContext;
  let kalyanOwnerCtx: SecurityContext;

  let testProduct: any;

  // Cleanup tracking arrays
  const createdVoucherIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdOrnamentIds: string[] = [];
  const createdJournalIds: string[] = [];
  const createdRateIds: string[] = [];

  // Helper to create available ornament for sale testing
  async function createTestOrnament(tagCode: string, priceAmount: string = '50000.00') {
    const orn = await prisma.ornament.create({
      data: {
        organizationId: suvarnaOrg.id,
        branchId: fortBranch.id,
        productId: testProduct.id,
        tagCode,
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '4.500',
        stoneWeight: '0.000',
        netWeight: '4.500',
        priceAmount,
        makingChargeType: 'FIXED',
        makingChargeValue: '2000.00',
        status: 'AVAILABLE',
      },
    });
    createdOrnamentIds.push(orn.id);
    return orn;
  }

  beforeAll(async () => {
    suvarnaOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'suvarna-mumbai' } });
    kalyanOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'kalyan-test' } });

    fortBranch = await prisma.branch.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id, code: 'FORT' },
    });
    thaneBranch = await prisma.branch.findFirstOrThrow({
      where: { organizationId: kalyanOrg.id, code: 'THANE' },
    });

    const suvarnaOwner = await prisma.user.findFirstOrThrow({
      where: { email: 'owner@suvarna.test' },
    });
    const suvarnaManager = await prisma.user.findFirstOrThrow({
      where: { email: 'manager@suvarna.test' },
    });
    const suvarnaSales = await prisma.user.findFirstOrThrow({
      where: { email: 'sales@suvarna.test' },
    });
    const kalyanOwner = await prisma.user.findFirstOrThrow({
      where: { email: 'owner@kalyan.test' },
    });

    ownerCtx = await resolveSecurityContext(prisma, {
      userId: suvarnaOwner.id,
      targetTenantId: suvarnaOrg.id,
      targetBranchId: fortBranch.id,
    });
    managerCtx = await resolveSecurityContext(prisma, {
      userId: suvarnaManager.id,
      targetTenantId: suvarnaOrg.id,
      targetBranchId: fortBranch.id,
    });
    salesCtx = await resolveSecurityContext(prisma, {
      userId: suvarnaSales.id,
      targetTenantId: suvarnaOrg.id,
      targetBranchId: fortBranch.id,
    });
    otherSalesCtx = { ...salesCtx }; // same role, for approval checks
    kalyanOwnerCtx = await resolveSecurityContext(prisma, {
      userId: kalyanOwner.id,
      targetTenantId: kalyanOrg.id,
      targetBranchId: thaneBranch.id,
    });

    // Ensure metal rates exist
    const buyingRate = await metalRateService.configureRate(managerCtx, {
      metalType: 'GOLD',
      purity: '22K',
      rateType: 'BUYING',
      ratePerGram: '10000.00',
      notes: 'Test buying rate 10k',
    });
    createdRateIds.push(buyingRate.id);

    const sellingRate = await metalRateService.configureRate(managerCtx, {
      metalType: 'GOLD',
      purity: '22K',
      rateType: 'SELLING',
      ratePerGram: '11000.00',
      notes: 'Test selling rate 11k',
    });
    createdRateIds.push(sellingRate.id);

    testProduct = await prisma.product.findFirst({
      where: { organizationId: suvarnaOrg.id },
    });
    if (!testProduct) {
      testProduct = await prisma.product.create({
        data: {
          organizationId: suvarnaOrg.id,
          sku: 'SAFEGUARD-TEST-RING',
          name: 'Safeguard Test Ring',
          category: 'Rings',
          metalType: 'GOLD',
          purity: '22K',
        },
      });
    }
  });

  afterAll(async () => {
    // 1. Delete buyback vouchers first to remove FK references to invoices, metal_rates, and ornaments
    await prisma.buybackVoucher.deleteMany({
      where: {
        OR: [
          { id: { in: createdVoucherIds } },
          { metalRateId: { in: createdRateIds } },
          { exchangeInvoiceId: { in: createdInvoiceIds } },
        ],
      },
    });

    // 2. Reverse dependency cleanup for invoices
    if (createdInvoiceIds.length > 0) {
      await prisma.stockMovement.deleteMany({
        where: { metadata: { path: ['invoiceId'], string_contains: createdInvoiceIds[0] } },
      });
      await prisma.invoicePayment.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
      await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
    }

    if (createdOrnamentIds.length > 0) {
      await prisma.stockMovement.deleteMany({ where: { ornamentId: { in: createdOrnamentIds } } });
      await prisma.ornament.deleteMany({ where: { id: { in: createdOrnamentIds } } });
    }

    if (createdJournalIds.length > 0) {
      await prisma.journalLine.deleteMany({ where: { journalEntryId: { in: createdJournalIds } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: createdJournalIds } } });
    }

    if (createdRateIds.length > 0) {
      await prisma.metalRate.deleteMany({ where: { id: { in: createdRateIds } } });
    }
  });

  // ============================================================================
  // 1. Authorization Safeguards & High-Value Approvals
  // ============================================================================
  describe('Authorization Safeguards', () => {
    it('rejects rate configuration from SALES_STAFF role', async () => {
      await expect(
        metalRateService.configureRate(salesCtx, {
          metalType: 'GOLD',
          purity: '22K',
          rateType: 'BUYING',
          ratePerGram: '9900.00',
        })
      ).rejects.toThrowError(AuthorizationError);
    });

    it('rejects high-value buyback (> ₹1,00,000) created by SALES_STAFF without manager authorization', async () => {
      // 15g @ 10,000/g = ₹1,50,000 net payable (> 100,000 threshold)
      await expect(
        buybackService.createBuybackVoucher(salesCtx, {
          branchId: fortBranch.id,
          customerName: 'High Value Customer',
          customerPhone: '9820011111',
          metalType: 'GOLD',
          purity: '22K',
          grossWeight: '15.000',
          stoneWeight: '0.000',
          paymentMethod: 'EXCHANGE_CREDIT',
        })
      ).rejects.toThrowError(/require Manager or Owner authorization/i);
    });

    it('rejects high-value buyback if designated approver is not a Manager/Owner', async () => {
      await expect(
        buybackService.createBuybackVoucher(salesCtx, {
          branchId: fortBranch.id,
          customerName: 'High Value Customer',
          customerPhone: '9820011111',
          metalType: 'GOLD',
          purity: '22K',
          grossWeight: '15.000',
          paymentMethod: 'EXCHANGE_CREDIT',
          approvedById: salesCtx.userId, // Sales staff cannot approve their own or other's high value buyback
        })
      ).rejects.toThrowError(/not an active Manager or Owner/i);
    });

    it('accepts high-value buyback by SALES_STAFF when valid manager approvedById is provided', async () => {
      const voucher = await buybackService.createBuybackVoucher(salesCtx, {
        branchId: fortBranch.id,
        customerName: 'Approved High Value Seller',
        customerPhone: '9820011111',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '12.000',
        stoneWeight: '0.000',
        paymentMethod: 'EXCHANGE_CREDIT',
        approvedById: managerCtx.userId,
      });
      createdVoucherIds.push(voucher.id);
      if (voucher.lotOrnamentId) createdOrnamentIds.push(voucher.lotOrnamentId);
      if (voucher.journalEntryId) createdJournalIds.push(voucher.journalEntryId);

      expect(voucher.approvedById).toBe(managerCtx.userId);
      expect(new Decimal(voucher.netPayable).toFixed(2)).toBe('120000.00');
    });

    it('automatically self-approves high-value buyback when created by MANAGER or OWNER', async () => {
      const voucher = await buybackService.createBuybackVoucher(managerCtx, {
        branchId: fortBranch.id,
        customerName: 'Manager Managed Seller',
        customerPhone: '9820022222',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '15.000',
        paymentMethod: 'EXCHANGE_CREDIT',
      });
      createdVoucherIds.push(voucher.id);
      if (voucher.lotOrnamentId) createdOrnamentIds.push(voucher.lotOrnamentId);
      if (voucher.journalEntryId) createdJournalIds.push(voucher.journalEntryId);

      expect(voucher.approvedById).toBe(managerCtx.userId);
    });
  });

  // ============================================================================
  // 2. Exchange Credit Redemption & Balance Tracking
  // ============================================================================
  describe('Exchange Credit Redemption & Balance Tracking', () => {
    it('supports full redemption of an exchange voucher in POS checkout', async () => {
      // 1. Issue buyback voucher for 5g @ 10k = ₹50,000
      const voucher = await buybackService.createBuybackVoucher(salesCtx, {
        branchId: fortBranch.id,
        customerName: 'Full Redeem Buyer',
        customerPhone: '9820033333',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '5.000',
        stoneWeight: '0.000',
        paymentMethod: 'EXCHANGE_CREDIT',
      });
      createdVoucherIds.push(voucher.id);
      if (voucher.lotOrnamentId) createdOrnamentIds.push(voucher.lotOrnamentId);
      if (voucher.journalEntryId) createdJournalIds.push(voucher.journalEntryId);

      expect(new Decimal(voucher.netPayable).toFixed(2)).toBe('50000.00');
      expect(new Decimal(voucher.redeemedAmount).toFixed(2)).toBe('0.00');
      expect(voucher.status).toBe('COMPLETED');

      // 2. Prepare ornament for sale (₹50,000 taxable -> grand total around ₹51,500 with GST)
      const orn = await createTestOrnament(`TEST-TAG-${Date.now()}-1`, '48543.69');

      // 3. Check out using exact voucher value ₹50,000 as exchange credit, remainder cash
      const inv = await billingService.createInvoice(salesCtx, {
        customerName: 'Full Redeem Buyer',
        customerPhone: '9820033333',
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '4.500',
            pricingMode: 'WEIGHT_BASED',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '3543.69',
          },
        ],
        payments: [
          {
            paymentMethod: 'EXCHANGE_CREDIT',
            amount: '50000.00',
            transactionRef: voucher.voucherNumber,
          },
        ],
      });
      createdInvoiceIds.push(inv.id);

      // 4. Verify Voucher balance and status
      const updatedVoucher = await prisma.buybackVoucher.findUniqueOrThrow({
        where: { id: voucher.id },
      });
      expect(new Decimal(updatedVoucher.redeemedAmount).toFixed(2)).toBe('50000.00');
      expect(updatedVoucher.status).toBe('EXCHANGED');
      expect(updatedVoucher.exchangeInvoiceId).toBe(inv.id);

      // Verify immutable appliedRate and netPayable are completely preserved
      expect(new Decimal(updatedVoucher.appliedRate).toFixed(2)).toBe('10000.00');
      expect(new Decimal(updatedVoucher.netPayable).toFixed(2)).toBe('50000.00');

      // 5. Verify General Ledger: Dr 2120 Exchange Credit / Cr 4010 Metal Revenue, etc.
      const invoiceJournal = await prisma.journalEntry.findFirstOrThrow({
        where: { sourceId: inv.id },
        include: { lines: { include: { account: true } } },
      });
      const exchangeDr = invoiceJournal.lines.find((l) => l.account.code === '2120');
      expect(exchangeDr).toBeDefined();
      expect(new Decimal(exchangeDr!.debitAmount).toFixed(2)).toBe('50000.00');
    });

    it('supports partial redemption across multiple sales until balance is fully exhausted', async () => {
      // 1. Customer brings 8g @ 10k = ₹80,000 exchange voucher
      const voucher = await buybackService.createBuybackVoucher(salesCtx, {
        branchId: fortBranch.id,
        customerName: 'Partial Redeem Buyer',
        customerPhone: '9820044444',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '8.000',
        paymentMethod: 'EXCHANGE_CREDIT',
      });
      createdVoucherIds.push(voucher.id);
      if (voucher.lotOrnamentId) createdOrnamentIds.push(voucher.lotOrnamentId);
      if (voucher.journalEntryId) createdJournalIds.push(voucher.journalEntryId);

      expect(new Decimal(voucher.netPayable).toFixed(2)).toBe('80000.00');

      // 2. First sale: partial redemption of ₹30,000
      const orn1 = await createTestOrnament(`TEST-TAG-${Date.now()}-2`, '30000.00');
      const inv1 = await billingService.createInvoice(salesCtx, {
        customerName: 'Partial Redeem Buyer',
        customerPhone: '9820044444',
        items: [
          {
            ornamentId: orn1.id,
            grossWeight: '4.500',
            pricingMode: 'WEIGHT_BASED',
            ratePerGram: '6000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '3000.00',
          },
        ],
        payments: [
          {
            paymentMethod: 'EXCHANGE_CREDIT',
            amount: '30000.00',
            transactionRef: voucher.voucherNumber,
          },
        ],
      });
      createdInvoiceIds.push(inv1.id);

      // Verify voucher is now PARTIALLY_REDEEMED with remaining balance of ₹50,000
      const vAfterSale1 = await prisma.buybackVoucher.findUniqueOrThrow({
        where: { id: voucher.id },
      });
      expect(new Decimal(vAfterSale1.redeemedAmount).toFixed(2)).toBe('30000.00');
      expect(vAfterSale1.status).toBe('PARTIALLY_REDEEMED');

      // Quote check
      const quote1 = await buybackService.getVoucherForRedemption(salesCtx, voucher.voucherNumber);
      expect(quote1.availableBalance).toBe('50000.00');
      expect(quote1.isEligible).toBe(true);

      // 3. Second sale: consumes remaining ₹50,000
      const orn2 = await createTestOrnament(`TEST-TAG-${Date.now()}-3`, '50000.00');
      const inv2 = await billingService.createInvoice(salesCtx, {
        customerName: 'Partial Redeem Buyer',
        customerPhone: '9820044444',
        items: [
          {
            ornamentId: orn2.id,
            grossWeight: '4.500',
            pricingMode: 'WEIGHT_BASED',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [
          {
            paymentMethod: 'EXCHANGE_CREDIT',
            amount: '50000.00',
            transactionRef: voucher.voucherNumber,
          },
        ],
      });
      createdInvoiceIds.push(inv2.id);

      // Verify voucher is now fully EXCHANGED with 0 remaining balance
      const vAfterSale2 = await prisma.buybackVoucher.findUniqueOrThrow({
        where: { id: voucher.id },
      });
      expect(new Decimal(vAfterSale2.redeemedAmount).toFixed(2)).toBe('80000.00');
      expect(vAfterSale2.status).toBe('EXCHANGED');

      // 4. Third attempt on same voucher must fail as exhausted
      const orn3 = await createTestOrnament(`TEST-TAG-${Date.now()}-4`, '10000.00');
      await expect(
        billingService.createInvoice(salesCtx, {
          customerName: 'Partial Redeem Buyer',
          customerPhone: '9820044444',
          items: [
            {
              ornamentId: orn3.id,
              grossWeight: '4.500',
              pricingMode: 'WEIGHT_BASED',
              ratePerGram: '2000.00',
              makingChargeType: 'FIXED',
              makingChargeRate: '1000.00',
            },
          ],
          payments: [
            {
              paymentMethod: 'EXCHANGE_CREDIT',
              amount: '5000.00',
              transactionRef: voucher.voucherNumber,
            },
          ],
        })
      ).rejects.toThrowError(/already fully redeemed/i);
    });

    it('rejects attempted over-redemption exceeding available voucher balance', async () => {
      // Voucher with ₹40,000 net payable
      const voucher = await buybackService.createBuybackVoucher(salesCtx, {
        branchId: fortBranch.id,
        customerName: 'Over-redemption Test',
        customerPhone: '9820055555',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '4.000',
        paymentMethod: 'EXCHANGE_CREDIT',
      });
      createdVoucherIds.push(voucher.id);
      if (voucher.lotOrnamentId) createdOrnamentIds.push(voucher.lotOrnamentId);
      if (voucher.journalEntryId) createdJournalIds.push(voucher.journalEntryId);

      const orn = await createTestOrnament(`TEST-TAG-${Date.now()}-5`, '50000.00');

      // Attempt to redeem ₹45,000 (exceeds ₹40,000 balance)
      await expect(
        billingService.createInvoice(salesCtx, {
          customerName: 'Over-redemption Test',
          customerPhone: '9820055555',
          items: [
            {
              ornamentId: orn.id,
              grossWeight: '4.500',
              pricingMode: 'WEIGHT_BASED',
              ratePerGram: '9000.00',
              makingChargeType: 'FIXED',
              makingChargeRate: '5000.00',
            },
          ],
          payments: [
            {
              paymentMethod: 'EXCHANGE_CREDIT',
              amount: '45000.00',
              transactionRef: voucher.voucherNumber,
            },
          ],
        })
      ).rejects.toThrowError(/exceeds available balance/i);

      // Verify voucher was NOT modified
      const rechecked = await prisma.buybackVoucher.findUniqueOrThrow({
        where: { id: voucher.id },
      });
      expect(new Decimal(rechecked.redeemedAmount).toFixed(2)).toBe('0.00');
      expect(rechecked.status).toBe('COMPLETED');
    });

    it('prevents two concurrent attempts from redeeming more than the available balance', async () => {
      // 1. Create an exchange voucher with netPayable ~₹50,000
      const voucher = await buybackService.createBuybackVoucher(salesCtx, {
        branchId: fortBranch.id,
        customerName: 'Concurrent Test Customer',
        customerPhone: '9820055555',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '5.263',
        stoneWeight: '0',
        paymentMethod: 'EXCHANGE_CREDIT',
      });
      createdVoucherIds.push(voucher.id);

      // 2. Prepare two separate ornaments for two concurrent checkouts
      const ornA = await createTestOrnament(`TEST-CONC-A-${Date.now()}`, '50000.00');
      const ornB = await createTestOrnament(`TEST-CONC-B-${Date.now()}`, '50000.00');

      // Both try to redeem ₹40,000 each (combined ₹80,000 exceeds available balance)
      const redeemAmount = '40000.00';

      const attemptA = billingService.createInvoice(salesCtx, {
        customerName: 'Concurrent Customer A',
        customerPhone: '9820055555',
        items: [
          {
            ornamentId: ornA.id,
            grossWeight: '4.500',
            pricingMode: 'WEIGHT_BASED',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [
          {
            paymentMethod: 'EXCHANGE_CREDIT',
            amount: redeemAmount,
            transactionRef: voucher.voucherNumber,
          },
        ],
      });

      const attemptB = billingService.createInvoice(salesCtx, {
        customerName: 'Concurrent Customer B',
        customerPhone: '9820055555',
        items: [
          {
            ornamentId: ornB.id,
            grossWeight: '4.500',
            pricingMode: 'WEIGHT_BASED',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [
          {
            paymentMethod: 'EXCHANGE_CREDIT',
            amount: redeemAmount,
            transactionRef: voucher.voucherNumber,
          },
        ],
      });

      const results = await Promise.allSettled([attemptA, attemptB]);

      // Exactly one must succeed, and the other must be rejected
      const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      createdInvoiceIds.push(fulfilled[0].value.id);

      // Verify database state: total redeemed must equal exactly one redemption (₹40,000), never exceeding available balance
      const rechecked = await prisma.buybackVoucher.findUniqueOrThrow({
        where: { id: voucher.id },
      });
      expect(new Decimal(rechecked.redeemedAmount).toFixed(2)).toBe('40000.00');
      expect(rechecked.status).toBe('PARTIALLY_REDEEMED');
    });

    it('strictly blocks cross-tenant exchange voucher redemption', async () => {
      // 1. Create exchange voucher in Kalyan tenant
      const kalyanBuyingRate = await metalRateService.configureRate(kalyanOwnerCtx, {
        metalType: 'GOLD',
        purity: '22K',
        rateType: 'BUYING',
        ratePerGram: '9500.00',
      });
      createdRateIds.push(kalyanBuyingRate.id);

      const kalyanVoucher = await buybackService.createBuybackVoucher(kalyanOwnerCtx, {
        branchId: thaneBranch.id,
        customerName: 'Kalyan Customer',
        customerPhone: '9820088888',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '5.000',
        paymentMethod: 'EXCHANGE_CREDIT',
      });
      createdVoucherIds.push(kalyanVoucher.id);
      if (kalyanVoucher.lotOrnamentId) createdOrnamentIds.push(kalyanVoucher.lotOrnamentId);
      if (kalyanVoucher.journalEntryId) createdJournalIds.push(kalyanVoucher.journalEntryId);

      // 2. Attempt to redeem Kalyan voucher in Suvarna sales invoice
      const orn = await createTestOrnament(`TEST-TAG-${Date.now()}-6`, '50000.00');

      await expect(
        billingService.createInvoice(salesCtx, {
          customerName: 'Suvarna Customer',
          customerPhone: '9820099999',
          items: [
            {
              ornamentId: orn.id,
              grossWeight: '4.500',
              pricingMode: 'WEIGHT_BASED',
              ratePerGram: '9000.00',
              makingChargeType: 'FIXED',
              makingChargeRate: '5000.00',
            },
          ],
          payments: [
            {
              paymentMethod: 'EXCHANGE_CREDIT',
              amount: '40000.00',
              transactionRef: kalyanVoucher.voucherNumber,
            },
          ],
        })
      ).rejects.toThrowError(/not found or access denied/i);
    });

    it('enforces customer matching: blocks redemption when invoice customer phone does not match voucher phone', async () => {
      // Voucher issued to phone 9820012345
      const voucher = await buybackService.createBuybackVoucher(salesCtx, {
        branchId: fortBranch.id,
        customerName: 'Mr. Original Seller',
        customerPhone: '9820012345',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '3.000',
        paymentMethod: 'EXCHANGE_CREDIT',
      });
      createdVoucherIds.push(voucher.id);
      if (voucher.lotOrnamentId) createdOrnamentIds.push(voucher.lotOrnamentId);
      if (voucher.journalEntryId) createdJournalIds.push(voucher.journalEntryId);

      const orn = await createTestOrnament(`TEST-TAG-${Date.now()}-7`, '35000.00');

      // Attempt redemption by different customer with phone 9820099999
      await expect(
        billingService.createInvoice(salesCtx, {
          customerName: 'Different Customer',
          customerPhone: '9820099999',
          items: [
            {
              ornamentId: orn.id,
              grossWeight: '4.500',
              pricingMode: 'WEIGHT_BASED',
              ratePerGram: '6000.00',
              makingChargeType: 'FIXED',
              makingChargeRate: '2000.00',
            },
          ],
          payments: [
            {
              paymentMethod: 'EXCHANGE_CREDIT',
              amount: '25000.00',
              transactionRef: voucher.voucherNumber,
            },
          ],
        })
      ).rejects.toThrowError(/registered phone .* does not match invoice customer phone/i);
    });

    it('rejects redemption of vouchers settled via CASH or marked CANCELLED', async () => {
      // 1. Voucher settled via CASH
      const cashVoucher = await buybackService.createBuybackVoucher(salesCtx, {
        branchId: fortBranch.id,
        customerName: 'Cash Settled Seller',
        customerPhone: '9820077777',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '2.000',
        paymentMethod: 'CASH',
      });
      createdVoucherIds.push(cashVoucher.id);
      if (cashVoucher.lotOrnamentId) createdOrnamentIds.push(cashVoucher.lotOrnamentId);
      if (cashVoucher.journalEntryId) createdJournalIds.push(cashVoucher.journalEntryId);

      const orn1 = await createTestOrnament(`TEST-TAG-${Date.now()}-8`, '25000.00');
      await expect(
        billingService.createInvoice(salesCtx, {
          customerName: 'Cash Settled Seller',
          customerPhone: '9820077777',
          items: [
            {
              ornamentId: orn1.id,
              grossWeight: '4.500',
              pricingMode: 'WEIGHT_BASED',
              ratePerGram: '4000.00',
              makingChargeType: 'FIXED',
              makingChargeRate: '2000.00',
            },
          ],
          payments: [
            {
              paymentMethod: 'EXCHANGE_CREDIT',
              amount: '20000.00',
              transactionRef: cashVoucher.voucherNumber,
            },
          ],
        })
      ).rejects.toThrowError(/was issued with settlement method 'CASH'/i);

      // 2. Voucher with status CANCELLED
      const cancelledVoucher = await buybackService.createBuybackVoucher(salesCtx, {
        branchId: fortBranch.id,
        customerName: 'Cancelled Voucher Seller',
        customerPhone: '9820088888',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '2.000',
        paymentMethod: 'EXCHANGE_CREDIT',
      });
      createdVoucherIds.push(cancelledVoucher.id);
      if (cancelledVoucher.lotOrnamentId) createdOrnamentIds.push(cancelledVoucher.lotOrnamentId);
      if (cancelledVoucher.journalEntryId) createdJournalIds.push(cancelledVoucher.journalEntryId);

      await prisma.buybackVoucher.update({
        where: { id: cancelledVoucher.id },
        data: { status: 'CANCELLED' },
      });

      const orn2 = await createTestOrnament(`TEST-TAG-${Date.now()}-9`, '25000.00');
      await expect(
        billingService.createInvoice(salesCtx, {
          customerName: 'Cancelled Voucher Seller',
          customerPhone: '9820088888',
          items: [
            {
              ornamentId: orn2.id,
              grossWeight: '4.500',
              pricingMode: 'WEIGHT_BASED',
              ratePerGram: '4000.00',
              makingChargeType: 'FIXED',
              makingChargeRate: '2000.00',
            },
          ],
          payments: [
            {
              paymentMethod: 'EXCHANGE_CREDIT',
              amount: '20000.00',
              transactionRef: cancelledVoucher.voucherNumber,
            },
          ],
        })
      ).rejects.toThrowError(/marked as 'CANCELLED'/i);
    });

    it('rolls back voucher redemption completely if invoice creation fails or aborts', async () => {
      // 1. Issue voucher of ₹30,000
      const voucher = await buybackService.createBuybackVoucher(salesCtx, {
        branchId: fortBranch.id,
        customerName: 'Rollback Test Seller',
        customerPhone: '9820099991',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '3.000',
        paymentMethod: 'EXCHANGE_CREDIT',
      });
      createdVoucherIds.push(voucher.id);
      if (voucher.lotOrnamentId) createdOrnamentIds.push(voucher.lotOrnamentId);
      if (voucher.journalEntryId) createdJournalIds.push(voucher.journalEntryId);

      // Create an ornament already in SOLD status (will trigger BillingConflictError inside tx)
      const soldOrn = await createTestOrnament(`TEST-TAG-${Date.now()}-10`, '30000.00');
      await prisma.ornament.update({
        where: { id: soldOrn.id },
        data: { status: 'SOLD' },
      });

      // Attempt checkout with sold ornament + exchange credit
      await expect(
        billingService.createInvoice(salesCtx, {
          customerName: 'Rollback Test Seller',
          customerPhone: '9820099991',
          items: [
            {
              ornamentId: soldOrn.id,
              grossWeight: '4.500',
              pricingMode: 'WEIGHT_BASED',
              ratePerGram: '6000.00',
              makingChargeType: 'FIXED',
              makingChargeRate: '2000.00',
            },
          ],
          payments: [
            {
              paymentMethod: 'EXCHANGE_CREDIT',
              amount: '25000.00',
              transactionRef: voucher.voucherNumber,
            },
          ],
        })
      ).rejects.toThrowError(/already marked as SOLD/i);

      // 2. Verify voucher state was NOT mutated (atomic transaction rollback)
      const recheckedVoucher = await prisma.buybackVoucher.findUniqueOrThrow({
        where: { id: voucher.id },
      });
      expect(new Decimal(recheckedVoucher.redeemedAmount).toFixed(2)).toBe('0.00');
      expect(recheckedVoucher.status).toBe('COMPLETED');
      expect(recheckedVoucher.exchangeInvoiceId).toBeNull();
    });

    it('supports invoice settlement payment via exchange credit through recordInvoicePayment', async () => {
      // 1. Create an invoice with unpaid balance
      const orn = await createTestOrnament(`TEST-TAG-${Date.now()}-11`, '40000.00');
      const inv = await billingService.createInvoice(salesCtx, {
        customerName: 'Credit Settlement Customer',
        customerPhone: '9820099992',
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '4.500',
            pricingMode: 'WEIGHT_BASED',
            ratePerGram: '8000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '4000.00',
          },
        ],
        payments: [], // Unpaid invoice (100% on credit / AR)
      });
      createdInvoiceIds.push(inv.id);

      expect(new Decimal(inv.balanceAmount).toNumber()).toBeGreaterThan(0);
      const balanceToPay = new Decimal(inv.balanceAmount).toFixed(2);

      // 2. Customer brings buyback metal for exchange credit to pay off the invoice
      const voucher = await buybackService.createBuybackVoucher(salesCtx, {
        branchId: fortBranch.id,
        customerName: 'Credit Settlement Customer',
        customerPhone: '9820099992',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: '5.000', // 50,000 credit
        paymentMethod: 'EXCHANGE_CREDIT',
      });
      createdVoucherIds.push(voucher.id);
      if (voucher.lotOrnamentId) createdOrnamentIds.push(voucher.lotOrnamentId);
      if (voucher.journalEntryId) createdJournalIds.push(voucher.journalEntryId);

      // 3. Record subsequent payment using EXCHANGE_CREDIT
      const updatedInv = await billingService.recordInvoicePayment(salesCtx, {
        invoiceId: inv.id,
        paymentMethod: 'EXCHANGE_CREDIT',
        amount: balanceToPay,
        transactionRef: voucher.voucherNumber,
      });

      expect(new Decimal(updatedInv.balanceAmount).toFixed(2)).toBe('0.00');
      expect(updatedInv.paymentStatus).toBe('PAID');

      // 4. Verify Voucher balance was deducted
      const updatedVoucher = await prisma.buybackVoucher.findUniqueOrThrow({
        where: { id: voucher.id },
      });
      expect(new Decimal(updatedVoucher.redeemedAmount).toFixed(2)).toBe(balanceToPay);

      // 5. Verify General Ledger: Dr 2120 (Exchange Credit) / Cr 1110 (Accounts Receivable)
      const paymentJe = await prisma.journalEntry.findFirstOrThrow({
        where: {
          sourceType: 'PAYMENT',
          narration: { contains: inv.invoiceNumber },
        },
        include: { lines: { include: { account: true } } },
      });
      const drLine = paymentJe.lines.find((l) => l.account.code === '2120');
      const crLine = paymentJe.lines.find((l) => l.account.code === '1110');
      expect(drLine).toBeDefined();
      expect(crLine).toBeDefined();
      expect(new Decimal(drLine!.debitAmount).toFixed(2)).toBe(balanceToPay);
      expect(new Decimal(crLine!.creditAmount).toFixed(2)).toBe(balanceToPay);
    });
  });

  // ============================================================================
  // 3. Benchmark Invoice Protection
  // ============================================================================
  describe('Benchmark Protection', () => {
    it('confirms the historical benchmark invoice INV/FORT/26-27/0200 remains completely intact', async () => {
      const benchmark = await prisma.invoice.findFirst({
        where: { invoiceNumber: 'INV/FORT/26-27/0200' },
        include: { items: true, payments: true },
      });

      expect(benchmark).not.toBeNull();
      expect(benchmark?.invoiceNumber).toBe('INV/FORT/26-27/0200');
      expect(new Decimal(benchmark!.grandTotal).toFixed(2)).toBe('239166.00');
    });
  });
});
