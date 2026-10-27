import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import {
  billingService,
  BillingValidationError,
  BillingConflictError,
  BillingNotFoundError,
} from '@/lib/billing';
import {
  ledgerService,
  LedgerValidationError,
  PAYMENT_METHOD_ACCOUNT_MAP,
} from '@/lib/ledger';
import { SecurityContext, AuthorizationError } from '@/types/security';
import { Decimal } from '@/lib/decimal';

describe('Suvarna Milestone 4C — Atomic POS Posting & Customer Payment Collection Integration Tests', () => {
  let suvarnaOrg: any;
  let kalyanOrg: any;
  let fortBranch: any;
  let vashiBranch: any;

  let ownerCtx: SecurityContext;
  let salesCtx: SecurityContext;
  let kalyanOwnerCtx: SecurityContext;

  // Track created fixtures for isolated teardown
  const createdInvoiceIds: string[] = [];
  const createdOrnamentIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdCustomerIds: string[] = [];

  // Helper to create an available synthetic ornament
  async function createTestOrnament(suffix: string, metalType = 'GOLD', karat = '22K', weight = '10.000') {
    const product = await prisma.product.create({
      data: {
        organizationId: suvarnaOrg.id,
        name: `Test Product ${suffix}`,
        sku: `SKU-TEST-${suffix}`,
        category: 'RINGS',
      },
    });
    createdProductIds.push(product.id);

    const ornament = await prisma.ornament.create({
      data: {
        organizationId: suvarnaOrg.id,
        productId: product.id,
        branchId: fortBranch.id,
        tagCode: `TAG-TEST-${suffix}`,
        metalType,
        purity: karat,
        grossWeight: weight,
        stoneWeight: '0.000',
        netWeight: weight,
        status: 'AVAILABLE',
      },
    });
    createdOrnamentIds.push(ornament.id);

    return ornament;
  }

  // Helper to create a synthetic customer
  async function createTestCustomer(suffix: string) {
    const customer = await prisma.customer.create({
      data: {
        organizationId: suvarnaOrg.id,
        primaryBranchId: fortBranch.id,
        name: `Customer ${suffix}`,
        phone: `98200${suffix.padStart(5, '0')}`,
        normalizedPhone: `98200${suffix.padStart(5, '0')}`,
        pan: 'ABCDE1234F',
        city: 'Mumbai',
        state: 'Maharashtra',
      },
    });
    createdCustomerIds.push(customer.id);
    return customer;
  }

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

    // 3. Construct SecurityContexts
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

    // 4. Ensure Chart of Accounts is initialized
    await ledgerService.initChartOfAccounts(ownerCtx);
  });

  afterAll(async () => {
    // Teardown created invoices and their accounting journals
    if (createdInvoiceIds.length > 0) {
      // Find journal entries associated with created invoices
      const journalEntries = await prisma.journalEntry.findMany({
        where: {
          organizationId: suvarnaOrg.id,
          sourceType: { in: ['INVOICE', 'PAYMENT'] },
          sourceId: { in: createdInvoiceIds },
        },
        select: { id: true },
      });
      const jeIds = journalEntries.map((j) => j.id);

      if (jeIds.length > 0) {
        // Clean up child reversals first to satisfy RESTRICT foreign key
        const childReversals = await prisma.journalEntry.findMany({
          where: { reversalOfId: { in: jeIds } },
          select: { id: true },
        });
        const childIds = childReversals.map((r) => r.id);
        if (childIds.length > 0) {
          await prisma.journalLine.deleteMany({
            where: { journalEntryId: { in: childIds } },
          });
          await prisma.journalEntry.deleteMany({
            where: { id: { in: childIds } },
          });
        }

        await prisma.journalLine.deleteMany({
          where: { journalEntryId: { in: jeIds } },
        });
        await prisma.journalEntry.deleteMany({
          where: { id: { in: jeIds } },
        });
      }

      await prisma.stockMovement.deleteMany({
        where: { ornamentId: { in: createdOrnamentIds } },
      });
      await prisma.invoicePayment.deleteMany({
        where: { invoiceId: { in: createdInvoiceIds } },
      });
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: { in: createdInvoiceIds } },
      });
      await prisma.invoice.deleteMany({
        where: { id: { in: createdInvoiceIds } },
      });
    }

    if (createdOrnamentIds.length > 0) {
      await prisma.ornament.deleteMany({
        where: { id: { in: createdOrnamentIds } },
      });
    }

    if (createdProductIds.length > 0) {
      await prisma.product.deleteMany({
        where: { id: { in: createdProductIds } },
      });
    }

    if (createdCustomerIds.length > 0) {
      await prisma.customer.deleteMany({
        where: { id: { in: createdCustomerIds } },
      });
    }
  });

  describe('1. Fully Paid POS Sale Double-Entry Posting', () => {
    it('creates a balanced journal entry crediting revenues & GST, and debiting tender clearing', async () => {
      const orn = await createTestOrnament(`FP-${Date.now().toString().slice(-4)}`, 'GOLD', '22K', '10.000');
      const cust = await createTestCustomer(`FP-${Date.now().toString().slice(-4)}`);

      // Rate: ₹10,000/g -> Metal: ₹1,00,000. Making: ₹1,000/g -> ₹10,000. Taxable: ₹1,10,000. GST 3%: ₹3,300 (CGST 1650, SGST 1650). Total: ₹1,13,300.
      const invoice = await billingService.createInvoice(salesCtx, {
        customerId: cust.id,
        customerPan: 'ABCDE1234F',
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '10.000',
            ratePerGram: '10000.00',
            makingChargeType: 'PER_GRAM',
            makingChargeRate: '1000.00',
          },
        ],
        payments: [
          {
            paymentMethod: 'UPI',
            amount: '113300.00',
            transactionRef: 'UPI-FP-12345',
          },
        ],
      });

      createdInvoiceIds.push(invoice.id);
      expect(invoice.paymentStatus).toBe('PAID');
      expect(invoice.balanceAmount.toString()).toBe('0');

      // Verify associated journal entry
      const journalEntry = await prisma.journalEntry.findFirst({
        where: {
          organizationId: suvarnaOrg.id,
          sourceType: 'INVOICE',
          sourceId: invoice.id,
        },
        include: {
          lines: {
            include: { account: true },
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      expect(journalEntry).toBeDefined();
      expect(journalEntry?.status).toBe('POSTED');
      expect(journalEntry?.totalDebit.toString()).toBe('113300');
      expect(journalEntry?.totalCredit.toString()).toBe('113300');

      // Check lines
      const lines = journalEntry!.lines;
      const upiLine = lines.find((l) => l.account.code === '1020'); // UPI Clearing
      const metalRevLine = lines.find((l) => l.account.code === '4010'); // Metal Revenue
      const makingRevLine = lines.find((l) => l.account.code === '4020'); // Making Revenue
      const cgstLine = lines.find((l) => l.account.code === '2010'); // CGST Payable
      const sgstLine = lines.find((l) => l.account.code === '2020'); // SGST Payable
      const arLine = lines.find((l) => l.account.code === '1110'); // Accounts Receivable

      expect(upiLine?.debitAmount.toString()).toBe('113300');
      expect(metalRevLine?.creditAmount.toString()).toBe('100000');
      expect(makingRevLine?.creditAmount.toString()).toBe('10000');
      expect(cgstLine?.creditAmount.toString()).toBe('1650');
      expect(sgstLine?.creditAmount.toString()).toBe('1650');
      expect(arLine).toBeUndefined(); // Zero balance, no AR line
    });
  });

  describe('2. Partially Paid POS Sale & Customer Receivable Posting', () => {
    it('correctly posts the partial tender paid and debits Accounts Receivable for remaining balance', async () => {
      const orn = await createTestOrnament(`PART-${Date.now().toString().slice(-4)}`, 'GOLD', '22K', '5.000');
      const cust = await createTestCustomer(`PART-${Date.now().toString().slice(-4)}`);

      // 5g @ 10,000/g = 50,000 metal. Making: 5,000. Taxable: 55,000. GST 3%: 1,650 (825+825). Total: 56,650.
      // Customer pays ₹20,000 via CASH. Balance remaining: ₹36,650.
      const invoice = await billingService.createInvoice(salesCtx, {
        customerId: cust.id,
        customerPan: 'ABCDE1234F',
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '5.000',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [
          {
            paymentMethod: 'CASH',
            amount: '20000.00',
          },
        ],
      });

      createdInvoiceIds.push(invoice.id);
      expect(invoice.paymentStatus).toBe('PARTIAL');
      expect(invoice.paidAmount.toString()).toBe('20000');
      expect(invoice.balanceAmount.toString()).toBe('36650');

      // Verify Journal Entry
      const journalEntry = await prisma.journalEntry.findFirst({
        where: {
          organizationId: suvarnaOrg.id,
          sourceType: 'INVOICE',
          sourceId: invoice.id,
        },
        include: {
          lines: {
            include: { account: true },
          },
        },
      });

      expect(journalEntry).toBeDefined();
      expect(journalEntry?.totalDebit.toString()).toBe('56650');
      expect(journalEntry?.totalCredit.toString()).toBe('56650');

      const cashLine = journalEntry!.lines.find((l) => l.account.code === '1010'); // Cash on Hand
      const arLine = journalEntry!.lines.find((l) => l.account.code === '1110'); // Accounts Receivable

      expect(cashLine?.debitAmount.toString()).toBe('20000');
      expect(arLine?.debitAmount.toString()).toBe('36650');
    });
  });

  describe('3. Split-Tender Sale Account Mapping', () => {
    it('correctly maps multi-tender checkout (CASH + CARD + CHEQUE) to their distinct clearing accounts', async () => {
      const orn = await createTestOrnament(`SPLIT-${Date.now().toString().slice(-4)}`, 'GOLD', '22K', '5.000');
      const cust = await createTestCustomer(`SPLIT-${Date.now().toString().slice(-4)}`);

      // Total: 56,650. Split: Cash: 10,000, Card: 26,650, Cheque: 20,000
      const invoice = await billingService.createInvoice(salesCtx, {
        customerId: cust.id,
        customerPan: 'ABCDE1234F',
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '5.000',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [
          { paymentMethod: 'CASH', amount: '10000.00' },
          { paymentMethod: 'CARD', amount: '26650.00', transactionRef: 'POS-AUTH-999' },
          { paymentMethod: 'CHEQUE', amount: '20000.00', transactionRef: 'CHQ-888201' },
        ],
      });

      createdInvoiceIds.push(invoice.id);
      expect(invoice.paymentStatus).toBe('PAID');

      const journalEntry = await prisma.journalEntry.findFirst({
        where: {
          organizationId: suvarnaOrg.id,
          sourceType: 'INVOICE',
          sourceId: invoice.id,
        },
        include: {
          lines: { include: { account: true } },
        },
      });

      const cashLine = journalEntry!.lines.find((l) => l.account.code === '1010');
      const cardLine = journalEntry!.lines.find((l) => l.account.code === '1030');
      const chequeLine = journalEntry!.lines.find((l) => l.account.code === '1050');

      expect(cashLine?.debitAmount.toString()).toBe('10000');
      expect(cardLine?.debitAmount.toString()).toBe('26650');
      expect(chequeLine?.debitAmount.toString()).toBe('20000');
    });
  });

  describe('4. Later Customer Payment Reduces Accounts Receivable', () => {
    it('reduces Accounts Receivable without recognizing revenue or GST a second time', async () => {
      const orn = await createTestOrnament(`LATER-${Date.now().toString().slice(-4)}`, 'GOLD', '22K', '5.000');
      const cust = await createTestCustomer(`LATER-${Date.now().toString().slice(-4)}`);

      // 1. Create partial invoice (Total: 56,650, paid 20,000, balance 36,650)
      const invoice = await billingService.createInvoice(salesCtx, {
        customerId: cust.id,
        customerPan: 'ABCDE1234F',
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '5.000',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [{ paymentMethod: 'UPI', amount: '20000.00' }],
      });
      createdInvoiceIds.push(invoice.id);

      // 2. Customer pays remaining ₹36,650 via BANK_TRANSFER
      const updatedInvoice = await billingService.recordInvoicePayment(salesCtx, {
        invoiceId: invoice.id,
        amount: '36650.00',
        paymentMethod: 'BANK_TRANSFER',
        transactionRef: 'NEFT-AXIS-99281',
      });

      expect(updatedInvoice.paymentStatus).toBe('PAID');
      expect(updatedInvoice.balanceAmount.toString()).toBe('0');
      expect(updatedInvoice.paidAmount.toString()).toBe('56650');
      expect(updatedInvoice.payments).toHaveLength(2);

      // 3. Find journal entry generated for this payment
      const paymentEntry = await prisma.journalEntry.findFirst({
        where: {
          organizationId: suvarnaOrg.id,
          sourceType: 'PAYMENT',
          sourceId: updatedInvoice.payments[1].id,
        },
        include: {
          lines: { include: { account: true } },
        },
      });

      expect(paymentEntry).toBeDefined();
      expect(paymentEntry?.totalDebit.toString()).toBe('36650');
      expect(paymentEntry?.totalCredit.toString()).toBe('36650');
      expect(paymentEntry?.lines).toHaveLength(2);

      // Verify line 1 is Debit 1045 (Bank Transfer Inward Clearing) and line 2 is Credit 1110 (Accounts Receivable)
      const bankLine = paymentEntry!.lines.find((l) => l.account.code === '1045');
      const arLine = paymentEntry!.lines.find((l) => l.account.code === '1110');

      expect(bankLine?.debitAmount.toString()).toBe('36650');
      expect(bankLine?.creditAmount.toString()).toBe('0');
      expect(arLine?.debitAmount.toString()).toBe('0');
      expect(arLine?.creditAmount.toString()).toBe('36650');

      // Verify NO revenue (4010, 4020, 4030) or GST (2010, 2020) accounts are present in payment entry
      const revenueCodes = ['4010', '4020', '4030', '2010', '2020', '2030'];
      const foundRevLines = paymentEntry!.lines.filter((l) => revenueCodes.includes(l.account.code));
      expect(foundRevLines).toHaveLength(0);
    });
  });

  describe('5. Atomic Rollback of Checkout Transaction', () => {
    it('rolls back invoice, payments, stock movement and journal posting if any step fails', async () => {
      const orn = await createTestOrnament(`ROLL-${Date.now().toString().slice(-4)}`, 'GOLD', '22K', '5.000');
      const cust = await createTestCustomer(`ROLL-${Date.now().toString().slice(-4)}`);

      // Attempt checkout with an unmapped / invalid payment method
      await expect(
        billingService.createInvoice(salesCtx, {
          customerId: cust.id,
          items: [
            {
              ornamentId: orn.id,
              grossWeight: '5.000',
              ratePerGram: '10000.00',
              makingChargeType: 'FIXED',
              makingChargeRate: '5000.00',
            },
          ],
          payments: [
            {
              paymentMethod: 'BITCOIN_CRYPTO' as any, // Invalid payment method
              amount: '56650.00',
            },
          ],
        })
      ).rejects.toThrow();

      // Verify NOTHING was persisted
      const dbInvoice = await prisma.invoice.findFirst({
        where: { customerId: cust.id },
      });
      expect(dbInvoice).toBeNull();

      // Verify ornament remained AVAILABLE and was not changed to SOLD
      const dbOrn = await prisma.ornament.findUnique({
        where: { id: orn.id },
      });
      expect(dbOrn?.status).toBe('AVAILABLE');

      // Verify zero stock movements were created
      const movements = await prisma.stockMovement.findMany({
        where: { ornamentId: orn.id },
      });
      expect(movements).toHaveLength(0);
    });
  });

  describe('6. Repeated Requests and Idempotency Protection', () => {
    it('returns existing invoice and does not create duplicate payments or journal entries on retry', async () => {
      const orn = await createTestOrnament(`IDEM-${Date.now().toString().slice(-4)}`, 'GOLD', '22K', '5.000');
      const cust = await createTestCustomer(`IDEM-${Date.now().toString().slice(-4)}`);
      const idempotencyKey = `IDEMP-CHECKOUT-${Date.now()}`;

      // First checkout call
      const firstInvoice = await billingService.createInvoice(salesCtx, {
        customerId: cust.id,
        idempotencyKey,
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '5.000',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [{ paymentMethod: 'UPI', amount: '56650.00' }],
      });
      createdInvoiceIds.push(firstInvoice.id);

      const invoiceCountBefore = await prisma.invoice.count({ where: { organizationId: suvarnaOrg.id } });
      const journalCountBefore = await prisma.journalEntry.count({ where: { organizationId: suvarnaOrg.id } });

      // Second checkout call with identical idempotencyKey
      const secondInvoice = await billingService.createInvoice(salesCtx, {
        customerId: cust.id,
        idempotencyKey,
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '5.000',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [{ paymentMethod: 'UPI', amount: '56650.00' }],
      });

      expect(secondInvoice.id).toBe(firstInvoice.id);
      expect(secondInvoice.invoiceNumber).toBe(firstInvoice.invoiceNumber);

      const invoiceCountAfter = await prisma.invoice.count({ where: { organizationId: suvarnaOrg.id } });
      const journalCountAfter = await prisma.journalEntry.count({ where: { organizationId: suvarnaOrg.id } });

      expect(invoiceCountAfter).toBe(invoiceCountBefore);
      expect(journalCountAfter).toBe(journalCountBefore);
    });
  });

  describe('7. Concurrent Payment Safeguards Against Overpayment', () => {
    it('rejects payments exceeding the current invoice balance', async () => {
      const orn = await createTestOrnament(`OVER-${Date.now().toString().slice(-4)}`, 'GOLD', '22K', '5.000');
      const cust = await createTestCustomer(`OVER-${Date.now().toString().slice(-4)}`);

      // Balance: ₹36,650
      const invoice = await billingService.createInvoice(salesCtx, {
        customerId: cust.id,
        customerPan: 'ABCDE1234F',
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '5.000',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [{ paymentMethod: 'CASH', amount: '20000.00' }],
      });
      createdInvoiceIds.push(invoice.id);

      // Attempt to pay ₹40,000 against balance of ₹36,650
      await expect(
        billingService.recordInvoicePayment(salesCtx, {
          invoiceId: invoice.id,
          amount: '40000.00',
          paymentMethod: 'UPI',
        })
      ).rejects.toThrow(BillingValidationError);

      // Invoice balance must remain exactly ₹36,650
      const refreshed = await billingService.getInvoiceById(salesCtx, invoice.id);
      expect(refreshed?.balanceAmount.toString()).toBe('36650');
    });

    it('rejects payments against an already fully paid invoice', async () => {
      const orn = await createTestOrnament(`ALRPAY-${Date.now().toString().slice(-4)}`, 'GOLD', '22K', '5.000');
      const cust = await createTestCustomer(`ALRPAY-${Date.now().toString().slice(-4)}`);

      const invoice = await billingService.createInvoice(salesCtx, {
        customerId: cust.id,
        customerPan: 'ABCDE1234F',
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '5.000',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [{ paymentMethod: 'UPI', amount: '56650.00' }],
      });
      createdInvoiceIds.push(invoice.id);

      await expect(
        billingService.recordInvoicePayment(salesCtx, {
          invoiceId: invoice.id,
          amount: '1000.00',
          paymentMethod: 'CASH',
        })
      ).rejects.toThrow(BillingConflictError);
    });
  });

  describe('8. Unsupported Payment Methods Fail Safely', () => {
    it('rejects unsupported payment methods at input validation', async () => {
      const orn = await createTestOrnament(`UNSUP-${Date.now().toString().slice(-4)}`, 'GOLD', '22K', '5.000');
      const cust = await createTestCustomer(`UNSUP-${Date.now().toString().slice(-4)}`);

      const invoice = await billingService.createInvoice(salesCtx, {
        customerId: cust.id,
        customerPan: 'ABCDE1234F',
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '5.000',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [{ paymentMethod: 'CASH', amount: '10000.00' }],
      });
      createdInvoiceIds.push(invoice.id);

      await expect(
        billingService.recordInvoicePayment(salesCtx, {
          invoiceId: invoice.id,
          amount: '5000.00',
          paymentMethod: 'GOLD_EXCHANGE' as any,
        })
      ).rejects.toThrow(BillingValidationError);
    });
  });

  describe('9. Cross-Tenant Invoice & Payment Access Rejection', () => {
    it('rejects payment recording on an invoice belonging to a different tenant', async () => {
      const orn = await createTestOrnament(`XTEN-${Date.now().toString().slice(-4)}`, 'GOLD', '22K', '5.000');
      const cust = await createTestCustomer(`XTEN-${Date.now().toString().slice(-4)}`);

      // Suvarna invoice
      const invoice = await billingService.createInvoice(salesCtx, {
        customerId: cust.id,
        customerPan: 'ABCDE1234F',
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '5.000',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [{ paymentMethod: 'CASH', amount: '10000.00' }],
      });
      createdInvoiceIds.push(invoice.id);

      // Kalyan owner attempts to record payment on Suvarna invoice
      await expect(
        billingService.recordInvoicePayment(kalyanOwnerCtx, {
          invoiceId: invoice.id,
          amount: '5000.00',
          paymentMethod: 'CASH',
        })
      ).rejects.toThrow(BillingNotFoundError);
    });
  });

  describe('10. Reversal Limits Enforcement', () => {
    it('prevents reversals exceeding the original entry amount or double-reversing', async () => {
      const orn = await createTestOrnament(`REVSAFE-${Date.now().toString().slice(-4)}`, 'GOLD', '22K', '5.000');
      const cust = await createTestCustomer(`REVSAFE-${Date.now().toString().slice(-4)}`);

      const invoice = await billingService.createInvoice(salesCtx, {
        customerId: cust.id,
        customerPan: 'ABCDE1234F',
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '5.000',
            ratePerGram: '10000.00',
            makingChargeType: 'FIXED',
            makingChargeRate: '5000.00',
          },
        ],
        payments: [{ paymentMethod: 'UPI', amount: '56650.00' }],
      });
      createdInvoiceIds.push(invoice.id);

      const originalJournal = await prisma.journalEntry.findFirstOrThrow({
        where: { sourceType: 'INVOICE', sourceId: invoice.id },
      });

      const accounts = await ledgerService.ensureBillingAccounts(ownerCtx);
      const upiAccId = accounts.get('1020')!;
      const metalAccId = accounts.get('4010')!;

      // 1. Partial reversal of ₹20,000 succeeds
      const rev1 = await ledgerService.postJournalEntry(ownerCtx, {
        sourceType: 'REVERSAL',
        reversalOfId: originalJournal.id,
        narration: 'Partial reversal 1',
        lines: [
          { accountId: metalAccId, debitAmount: '20000.00', creditAmount: '0.00' },
          { accountId: upiAccId, debitAmount: '0.00', creditAmount: '20000.00' },
        ],
      });
      expect(rev1.entry.reversalOfId).toBe(originalJournal.id);

      // 2. Second reversal of ₹40,000 exceeds remaining balance (₹56,650 - ₹20,000 = ₹36,650)
      await expect(
        ledgerService.postJournalEntry(ownerCtx, {
          sourceType: 'REVERSAL',
          reversalOfId: originalJournal.id,
          narration: 'Excessive reversal',
          lines: [
            { accountId: metalAccId, debitAmount: '40000.00', creditAmount: '0.00' },
            { accountId: upiAccId, debitAmount: '0.00', creditAmount: '40000.00' },
          ],
        })
      ).rejects.toThrow(LedgerValidationError);

      // 3. Second reversal of remaining ₹36,650 succeeds
      const rev2 = await ledgerService.postJournalEntry(ownerCtx, {
        sourceType: 'REVERSAL',
        reversalOfId: originalJournal.id,
        narration: 'Remaining reversal 2',
        lines: [
          { accountId: metalAccId, debitAmount: '36650.00', creditAmount: '0.00' },
          { accountId: upiAccId, debitAmount: '0.00', creditAmount: '36650.00' },
        ],
      });
      expect(rev2.entry.id).toBeDefined();

      // 4. Third reversal attempt on fully reversed entry is rejected
      await expect(
        ledgerService.postJournalEntry(ownerCtx, {
          sourceType: 'REVERSAL',
          reversalOfId: originalJournal.id,
          narration: 'Third reversal',
          lines: [
            { accountId: metalAccId, debitAmount: '100.00', creditAmount: '0.00' },
            { accountId: upiAccId, debitAmount: '0.00', creditAmount: '100.00' },
          ],
        })
      ).rejects.toThrow(LedgerValidationError);

      // 5. Sales staff cannot post reversals
      await expect(
        ledgerService.postJournalEntry(salesCtx, {
          sourceType: 'REVERSAL',
          reversalOfId: originalJournal.id,
          lines: [
            { accountId: metalAccId, debitAmount: '100.00', creditAmount: '0.00' },
            { accountId: upiAccId, debitAmount: '0.00', creditAmount: '100.00' },
          ],
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('11. Existing Invoice Calculations and Structure Integrity', () => {
    it('preserves existing invoice calculation engine and snapshots', async () => {
      const orn = await createTestOrnament(`SNAP-${Date.now().toString().slice(-4)}`, 'GOLD', '22K', '18.000');
      const cust = await createTestCustomer(`SNAP-${Date.now().toString().slice(-4)}`);

      // Rate: 12,150/g. Making: 750/g. Metal: 2,18,700. Making: 13,500. Taxable: 2,32,200. GST 3%: 6,966. Grand Total: 2,39,166.
      const invoice = await billingService.createInvoice(salesCtx, {
        customerId: cust.id,
        customerPan: 'ABCDE1234F',
        items: [
          {
            ornamentId: orn.id,
            grossWeight: '18.000',
            ratePerGram: '12150.00',
            makingChargeType: 'PER_GRAM',
            makingChargeRate: '750.00',
          },
        ],
        payments: [{ paymentMethod: 'UPI', amount: '239166.00' }],
      });
      createdInvoiceIds.push(invoice.id);

      expect(invoice.subtotal.toString()).toBe('232200');
      expect(invoice.taxableAmount.toString()).toBe('232200');
      expect(invoice.cgstAmount.toString()).toBe('3483');
      expect(invoice.sgstAmount.toString()).toBe('3483');
      expect(invoice.totalTax.toString()).toBe('6966');
      expect(invoice.grandTotal.toString()).toBe('239166');
      expect(invoice.items[0].netWeight.toString()).toBe('18');
      expect(invoice.items[0].metalValue.toString()).toBe('218700');
      expect(invoice.items[0].makingChargeAmount.toString()).toBe('13500');
    });
  });
});
