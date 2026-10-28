import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { resolveSecurityContext } from '@/lib/security-context';
import { metalRateService, RateUnavailableError, RateValidationError } from '@/lib/metal-rates';
import { buybackService, BuybackValidationError } from '@/lib/buyback';
import { BillingService } from '@/lib/billing';
import { SecurityContext, AuthorizationError } from '@/types/security';
import { Decimal } from '@/lib/decimal';

describe('Integration: Metal Buying Rates & Gold Buyback Workflow', () => {
  const billingService = new BillingService({ prisma });

  let suvarnaOrg: any;
  let kalyanOrg: any;
  let thaneBranch: any;
  let fortBranch: any;

  let ownerCtx: SecurityContext;
  let managerCtx: SecurityContext;
  let accountantCtx: SecurityContext;
  let salesCtx: SecurityContext;
  let kalyanOwnerCtx: SecurityContext;

  // Cleanup trackers
  const createdRateIds: string[] = [];
  const createdVoucherIds: string[] = [];
  const createdOrnamentIds: string[] = [];
  const createdJournalIds: string[] = [];
  const createdInvoiceIds: string[] = [];

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
    const suvarnaAccountant = await prisma.user.findFirstOrThrow({
      where: { email: 'accountant@suvarna.test' },
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
    accountantCtx = await resolveSecurityContext(prisma, {
      userId: suvarnaAccountant.id,
      targetTenantId: suvarnaOrg.id,
    });
    salesCtx = await resolveSecurityContext(prisma, {
      userId: suvarnaSales.id,
      targetTenantId: suvarnaOrg.id,
      targetBranchId: fortBranch.id,
    });
    kalyanOwnerCtx = await resolveSecurityContext(prisma, {
      userId: kalyanOwner.id,
      targetTenantId: kalyanOrg.id,
      targetBranchId: thaneBranch.id,
    });
  });

  afterAll(async () => {
    // Clean up created test entities in reverse dependency order
    if (createdVoucherIds.length > 0) {
      await prisma.buybackVoucher.deleteMany({
        where: { id: { in: createdVoucherIds } },
      });
    }

    if (createdInvoiceIds.length > 0) {
      await prisma.invoicePayment.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
      await prisma.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
    }

    if (createdJournalIds.length > 0) {
      await prisma.journalLine.deleteMany({ where: { journalEntryId: { in: createdJournalIds } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: createdJournalIds } } });
    }

    if (createdOrnamentIds.length > 0) {
      await prisma.stockMovement.deleteMany({ where: { ornamentId: { in: createdOrnamentIds } } });
      await prisma.ornament.deleteMany({ where: { id: { in: createdOrnamentIds } } });
    }

    if (createdRateIds.length > 0) {
      await prisma.metalRate.deleteMany({
        where: { id: { in: createdRateIds } },
      });
    }
  });

  // --------------------------------------------------------------------------
  // 1. Independent Buying and Selling Rates
  // --------------------------------------------------------------------------
  it('stores buying and selling rates as distinct independent records; configuring one does not alter the other', async () => {
    // 1. Configure Buying rate for 22K Gold
    const buyingRate = await metalRateService.configureRate(managerCtx, {
      metalType: 'GOLD',
      purity: '22K',
      rateType: 'BUYING',
      ratePerGram: '11750.00',
      notes: 'Initial test buying rate',
    });
    createdRateIds.push(buyingRate.id);

    // 2. Configure Selling rate for 22K Gold
    const sellingRate = await metalRateService.configureRate(managerCtx, {
      metalType: 'GOLD',
      purity: '22K',
      rateType: 'SELLING',
      ratePerGram: '12400.00',
      notes: 'Initial test selling rate',
    });
    createdRateIds.push(sellingRate.id);

    // 3. Verify they resolve independently
    const resolvedBuying = await metalRateService.getBuyingRate(managerCtx, {
      metalType: 'GOLD',
      purity: '22K',
    });
    const resolvedSelling = await metalRateService.getSellingRate(managerCtx, {
      metalType: 'GOLD',
      purity: '22K',
    });

    expect(resolvedBuying.ratePerGram.toFixed(2)).toBe('11750.00');
    expect(resolvedSelling.ratePerGram.toFixed(2)).toBe('12400.00');
    expect(resolvedBuying.metalRateId).toBe(buyingRate.id);
    expect(resolvedSelling.metalRateId).toBe(sellingRate.id);

    // 4. Update ONLY buying rate to 11,800.00; selling rate MUST remain 12,400.00
    const updatedBuying = await metalRateService.configureRate(managerCtx, {
      metalType: 'GOLD',
      purity: '22K',
      rateType: 'BUYING',
      ratePerGram: '11800.00',
      notes: 'Updated buying rate',
    });
    createdRateIds.push(updatedBuying.id);

    const recheckBuying = await metalRateService.getBuyingRate(managerCtx, {
      metalType: 'GOLD',
      purity: '22K',
    });
    const recheckSelling = await metalRateService.getSellingRate(managerCtx, {
      metalType: 'GOLD',
      purity: '22K',
    });

    expect(recheckBuying.ratePerGram.toFixed(2)).toBe('11800.00');
    expect(recheckSelling.ratePerGram.toFixed(2)).toBe('12400.00'); // UNCHANGED
  });

  // --------------------------------------------------------------------------
  // 2. Tenant Isolation & RBAC Protection
  // --------------------------------------------------------------------------
  it('enforces RBAC: only OWNER and MANAGER can configure rates; ACCOUNTANT and SALES_STAFF are denied', async () => {
    // Accountant cannot configure rates
    await expect(
      metalRateService.configureRate(accountantCtx, {
        metalType: 'GOLD',
        purity: '24K',
        rateType: 'BUYING',
        ratePerGram: '12500.00',
      })
    ).rejects.toThrowError(AuthorizationError);

    // Sales staff cannot configure rates
    await expect(
      metalRateService.configureRate(salesCtx, {
        metalType: 'GOLD',
        purity: '24K',
        rateType: 'BUYING',
        ratePerGram: '12500.00',
      })
    ).rejects.toThrowError(AuthorizationError);
  });

  it('enforces tenant isolation: rates configured in Suvarna are inaccessible to Kalyan', async () => {
    // Suvarna sets a unique 14K buying rate
    const suvarna14K = await metalRateService.configureRate(ownerCtx, {
      metalType: 'GOLD',
      purity: '14K',
      rateType: 'BUYING',
      ratePerGram: '7500.00',
    });
    createdRateIds.push(suvarna14K.id);

    // Kalyan tenant has not set 14K buying rate -> must throw RateUnavailableError, NOT see Suvarna rate
    await expect(
      metalRateService.getBuyingRate(kalyanOwnerCtx, {
        metalType: 'GOLD',
        purity: '14K',
      })
    ).rejects.toThrowError(RateUnavailableError);
  });

  // --------------------------------------------------------------------------
  // 3. Missing Buying Rate Blocks Buyback
  // --------------------------------------------------------------------------
  it('blocks buyback completion and explains what must be configured if no buying rate exists for that purity', async () => {
    // Attempt buyback for 18K gold where no buying rate has been configured
    await expect(
      buybackService.createBuybackVoucher(salesCtx, {
        branchId: fortBranch.id,
        customerName: 'Sanjay Test Verma',
        customerPhone: '9820011111',
        metalType: 'GOLD',
        purity: '18K', // No buying rate configured for 18K in Suvarna yet
        grossWeight: '10.000',
        paymentMethod: 'CASH',
      })
    ).rejects.toThrowError(/No active buying rate configured for GOLD \(18K\)/);
  });

  // --------------------------------------------------------------------------
  // 4. Complete Atomic Buyback Creation & Ledger Posting
  // --------------------------------------------------------------------------
  it('creates an atomic buyback voucher with inward stock lot and balanced double-entry journal entry', async () => {
    // 1. Ensure buying rate exists for 22K
    const testRate = await metalRateService.configureRate(managerCtx, {
      metalType: 'GOLD',
      purity: '22K',
      rateType: 'BUYING',
      ratePerGram: '11500.00',
      notes: 'Active buyback testing rate',
    });
    createdRateIds.push(testRate.id);

    // 2. Post buyback voucher: 20.000g gross, 1.000g stone = 19.000g net @ ₹11,500 = ₹2,18,500.
    // Less deduction: ₹1,500 melting loss -> Net payable = ₹2,17,000 (Requires PAN & Manager Approval!)
    const voucher = await buybackService.createBuybackVoucher(salesCtx, {
      branchId: fortBranch.id,
      customerName: 'Anand Prakash Deshmukh',
      customerPhone: '9821122334',
      customerPan: 'ABCDE1234F',
      customerAddress: 'Fort, Mumbai',
      metalType: 'GOLD',
      purity: '22K',
      grossWeight: '20.000',
      stoneWeight: '1.000',
      testingMethod: 'XRF',
      testingNotes: 'XRF assayed at 91.6% fine gold content',
      deductionAmount: '1500.00',
      deductionReason: 'Melting and sampling tare loss',
      paymentMethod: 'CASH',
      paymentReference: 'Cash Voucher #CV-401',
      approvedById: managerCtx.userId,
      idempotencyKey: 'IDEMP-TEST-BUYBACK-001',
    });

    createdVoucherIds.push(voucher.id);
    if (voucher.lotOrnamentId) createdOrnamentIds.push(voucher.lotOrnamentId);
    if (voucher.journalEntryId) createdJournalIds.push(voucher.journalEntryId);

    // 3. Verify voucher fields
    expect(voucher.voucherNumber).toMatch(/^BB\/FORT\/\d{4}-\d{4}\/\d{4}$/);
    expect(new Decimal(voucher.netWeight).toFixed(3)).toBe('19.000');
    expect(new Decimal(voucher.appliedRate).toFixed(2)).toBe('11500.00');
    expect(new Decimal(voucher.grossAmount).toFixed(2)).toBe('218500.00');
    expect(new Decimal(voucher.deductionAmount).toFixed(2)).toBe('1500.00');
    expect(new Decimal(voucher.netPayable).toFixed(2)).toBe('217000.00');
    expect(voucher.status).toBe('SETTLED');
    expect(voucher.metalRateId).toBe(testRate.id);

    // 4. Verify inventory lot was created and inwarded
    expect(voucher.lotOrnamentId).toBeTruthy();
    const ornament = await prisma.ornament.findUniqueOrThrow({
      where: { id: voucher.lotOrnamentId! },
      include: { movements: true },
    });
    expect(ornament.status).toBe('AVAILABLE');
    expect(new Decimal(ornament.grossWeight).toFixed(3)).toBe('20.000');
    expect(new Decimal(ornament.stoneWeight).toFixed(3)).toBe('1.000');
    expect(new Decimal(ornament.netWeight).toFixed(3)).toBe('19.000');
    expect(new Decimal(ornament.costAmount!).toFixed(2)).toBe('217000.00');

    // Verify StockMovement
    expect(ornament.movements.length).toBe(1);
    const mvt = ornament.movements[0];
    expect(mvt.movementType).toBe('INWARD');
    expect(mvt.toBranchId).toBe(fortBranch.id);
    expect(mvt.reason).toContain(voucher.voucherNumber);

    // 5. Verify Double-Entry Accounting Entry
    expect(voucher.journalEntryId).toBeTruthy();
    const journal = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: voucher.journalEntryId! },
      include: {
        lines: {
          include: { account: true },
        },
      },
    });

    expect(journal.sourceType).toBe('BUYBACK');
    expect(new Decimal(journal.totalDebit).toFixed(2)).toBe('217000.00');
    expect(new Decimal(journal.totalCredit).toFixed(2)).toBe('217000.00');
    expect(journal.lines.length).toBe(2);

    // Line 1: Debit 1220 (Old Gold Inventory)
    const debitLine = journal.lines.find((l) => l.account.code === '1220' || l.account.code === '1210');
    expect(debitLine).toBeDefined();
    expect(new Decimal(debitLine!.debitAmount).toFixed(2)).toBe('217000.00');
    expect(new Decimal(debitLine!.creditAmount).toFixed(2)).toBe('0.00');

    // Line 2: Credit 1010 (Cash on Hand)
    const creditLine = journal.lines.find((l) => l.account.code === '1010');
    expect(creditLine).toBeDefined();
    expect(new Decimal(creditLine!.creditAmount).toFixed(2)).toBe('217000.00');
    expect(new Decimal(creditLine!.debitAmount).toFixed(2)).toBe('0.00');
  });

  // --------------------------------------------------------------------------
  // 5. Effective Rate Retention After Later Rate Change
  // --------------------------------------------------------------------------
  it('preserves the original rate on historical vouchers when the buying rate is changed later', async () => {
    // 1. Initial rate = 11,500
    const v1 = await buybackService.createBuybackVoucher(salesCtx, {
      branchId: fortBranch.id,
      customerName: 'Historical Rate Test Customer',
      customerPhone: '9820055555',
      metalType: 'GOLD',
      purity: '22K',
      grossWeight: '10.000',
      paymentMethod: 'CASH',
      approvedById: managerCtx.userId,
      idempotencyKey: 'IDEMP-HIST-RATE-001',
    });
    createdVoucherIds.push(v1.id);
    if (v1.lotOrnamentId) createdOrnamentIds.push(v1.lotOrnamentId);
    if (v1.journalEntryId) createdJournalIds.push(v1.journalEntryId);

    expect(new Decimal(v1.appliedRate).toFixed(2)).toBe('11500.00');
    expect(new Decimal(v1.netPayable).toFixed(2)).toBe('115000.00');

    // 2. Change the buying rate to 12,000
    const newRate = await metalRateService.configureRate(managerCtx, {
      metalType: 'GOLD',
      purity: '22K',
      rateType: 'BUYING',
      ratePerGram: '12000.00',
      notes: 'Rate raised next day',
    });
    createdRateIds.push(newRate.id);

    // 3. Re-read v1 from database; must retain 11,500 and not silently shift to 12,000
    const persistedV1 = await buybackService.getBuybackVoucher(salesCtx, v1.id);
    expect(persistedV1).toBeDefined();
    expect(new Decimal(persistedV1!.appliedRate).toFixed(2)).toBe('11500.00');
    expect(new Decimal(persistedV1!.netPayable).toFixed(2)).toBe('115000.00');
  });

  // --------------------------------------------------------------------------
  // 6. Idempotency & Duplicate Prevention
  // --------------------------------------------------------------------------
  it('prevents duplicate submissions: retrying with the same idempotency key returns existing voucher without re-posting', async () => {
    const key = `IDEMP-RETRY-${Date.now()}`;

    // First submission
    const firstCall = await buybackService.createBuybackVoucher(salesCtx, {
      branchId: fortBranch.id,
      customerName: 'Idempotency Customer',
      customerPhone: '9820066666',
      metalType: 'GOLD',
      purity: '22K',
      grossWeight: '5.000',
      paymentMethod: 'CASH',
      idempotencyKey: key,
    });
    createdVoucherIds.push(firstCall.id);
    if (firstCall.lotOrnamentId) createdOrnamentIds.push(firstCall.lotOrnamentId);
    if (firstCall.journalEntryId) createdJournalIds.push(firstCall.journalEntryId);

    // Duplicate retry with same idempotency key
    const secondCall = await buybackService.createBuybackVoucher(salesCtx, {
      branchId: fortBranch.id,
      customerName: 'Idempotency Customer',
      customerPhone: '9820066666',
      metalType: 'GOLD',
      purity: '22K',
      grossWeight: '5.000',
      paymentMethod: 'CASH',
      idempotencyKey: key,
    });

    expect(secondCall.id).toBe(firstCall.id);
    expect(secondCall.voucherNumber).toBe(firstCall.voucherNumber);

    // Ensure no duplicate stock movement or ornament was created
    const totalMovements = await prisma.stockMovement.count({
      where: { reason: { contains: firstCall.voucherNumber } },
    });
    expect(totalMovements).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 7. Old Gold Exchange Support — Limited Scope
  // --------------------------------------------------------------------------
  it('allows issuing an exchange credit voucher and linking it to a sales invoice without reducing GST taxable base', async () => {
    // 1. Customer brings 10g of 22K gold for exchange (Manager approved)
    const exchangeVoucher = await buybackService.createBuybackVoucher(salesCtx, {
      branchId: fortBranch.id,
      customerName: 'Exchange Buyer',
      customerPhone: '9820077777',
      metalType: 'GOLD',
      purity: '22K',
      grossWeight: '10.000',
      stoneWeight: '0.000',
      paymentMethod: 'EXCHANGE_CREDIT',
      approvedById: managerCtx.userId,
      idempotencyKey: `IDEMP-EXCHANGE-${Date.now()}`,
    });
    createdVoucherIds.push(exchangeVoucher.id);
    if (exchangeVoucher.lotOrnamentId) createdOrnamentIds.push(exchangeVoucher.lotOrnamentId);
    if (exchangeVoucher.journalEntryId) createdJournalIds.push(exchangeVoucher.journalEntryId);

    expect(exchangeVoucher.paymentMethod).toBe('EXCHANGE_CREDIT');
    expect(new Decimal(exchangeVoucher.netPayable).toFixed(2)).toBe('120000.00'); // 10g @ 12,000

    // Verify Exchange Journal: Dr 1220 (Old Gold Inventory) / Cr 2120 (Exchange Credit Liability)
    const buybackJournal = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: exchangeVoucher.journalEntryId! },
      include: { lines: { include: { account: true } } },
    });
    const creditLiabilityLine = buybackJournal.lines.find((l) => l.account.code === '2120');
    expect(creditLiabilityLine).toBeDefined();
    expect(new Decimal(creditLiabilityLine!.creditAmount).toFixed(2)).toBe('120000.00');

    // 2. Link exchange voucher to sales invoice
    const sampleInvoice = await prisma.invoice.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id },
    });

    const linked = await buybackService.linkBuybackToInvoice(
      salesCtx,
      exchangeVoucher.voucherNumber,
      sampleInvoice.id
    );
    expect(linked.status).toBe('EXCHANGED');
    expect(linked.exchangeInvoiceId).toBe(sampleInvoice.id);
  });
});
