import { test, expect, Page } from '@playwright/test';
import { prisma } from '@/lib/db';
import * as path from 'path';
import * as fs from 'fs';
import { Decimal } from 'decimal.js';

const DEV_PASSWORD = 'SuvarnaDev2026!';

test.describe.configure({ mode: 'serial' });

test.describe('Suvarna Pilot Milestone 1: Complete End-to-End Jeweller Sales & Accounting Workflow', () => {
  const runId = Date.now().toString().slice(-5);
  const TEST_SKU = `KL-CHOKER-${runId}`;
  const TEST_NAME = `Kalyan 22K Royal Choker ${runId}`;
  const TEST_TAG = `KL-TAG-${runId}`;
  const TEST_HUID = `KL${runId.slice(-4)}`;
  const TEST_PHONE = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const TEST_CUSTOMER_NAME = 'Pooja Pilot Sharma';
  const TEST_PAN = 'ABCDE1234F';
  const TEST_UPI_REF = `UPI-KL-${runId}`;

  // Metal: 25.0g * 12150 = 303,750 | MC: 25.0g * 750 = 18,750 | Taxable = 322,500 | GST 3% = 9,675 | Total = 332,175
  const EXPECTED_GRAND_TOTAL = '332175.00';

  let kalyanOrgId: string;
  let thaneBranchId: string;
  let kalyanBankAccountId: string;
  let csvFilePath: string;

  async function loginAs(page: Page, email: string) {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.waitForSelector('form[data-hydrated="true"]', { timeout: 30000 });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', DEV_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 60000 });
  }

  test.beforeAll(async () => {
    // 1. Identify isolated Kalyan test tenant
    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'kalyan-test' },
      include: { branches: true, bankAccounts: true },
    });
    kalyanOrgId = org.id;
    thaneBranchId = org.branches[0].id;
    kalyanBankAccountId = org.bankAccounts[0].id;

    // 2. Prepare synthetic bank statement CSV for reconciliation
    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
    csvFilePath = path.join(scratchDir, `pilot-statement-${runId}.csv`);
    const csvContent = [
      'Date,Description,Reference,Withdrawal,Deposit,Balance',
      `2026-10-27,UPI Collection ${TEST_UPI_REF},${TEST_UPI_REF},0,${EXPECTED_GRAND_TOTAL},1000000.00`,
    ].join('\n');
    fs.writeFileSync(csvFilePath, csvContent, 'utf-8');
  });

  test.afterAll(async () => {
    if (csvFilePath && fs.existsSync(csvFilePath)) {
      try {
        fs.unlinkSync(csvFilePath);
      } catch {
        // Ignore file cleanup error
      }
    }
    await prisma.$disconnect();
  });

  // ============================================================================
  // Step 1: Sign in and enter business workspace
  // ============================================================================
  test('Step 1: Authorized test-tenant user logs in to Kalyan Test Jewellers workspace', async ({ page }) => {
    await loginAs(page, 'owner@kalyan.test');

    // Verify Active Showroom is Thane Store
    await expect(page.locator('button:has-text("Active Showroom")')).toContainText('Thane Store');
    await expect(page.locator('h1')).toContainText('Thane Store Overview');
  });

  // ============================================================================
  // Step 2: Open inventory and inward a synthetic jewellery piece
  // ============================================================================
  test('Step 2: Inward synthetic jewellery piece with BIS hallmarking into live inventory', async ({ page }) => {
    await loginAs(page, 'owner@kalyan.test');
    await page.goto('/inventory');
    await page.waitForURL('**/inventory', { timeout: 15000 });

    await expect(page.locator('h1')).toContainText('Showroom');
    await expect(page.getByText('POSTGRES PERSISTED')).toBeVisible();

    // Click "Add New Jewellery"
    await page.getByRole('button', { name: 'Add New Jewellery' }).click();
    const dialog = page.getByRole('dialog', { name: 'Register New Jewellery Piece' });
    await expect(dialog).toBeVisible();

    // Switch to "+ New Design"
    await dialog.getByRole('button', { name: '+ New Design' }).click();

    // Product specifications
    await dialog.locator('input[placeholder="e.g. BR-NK-2026"]').fill(TEST_SKU);
    await dialog.locator('input[placeholder="e.g. Temple Gold Choker"]').fill(TEST_NAME);

    // Piece specifications
    await dialog.locator('input[placeholder="e.g. TG-9901"]').fill(TEST_TAG);
    await dialog.locator('input[placeholder="e.g. AB12CD (6 chars)"]').fill(TEST_HUID);

    // Weights
    const grossInput = dialog.locator('input[placeholder="0.000"]').nth(0);
    const stoneInput = dialog.locator('input[placeholder="0.000"]').nth(1);
    const netInput = dialog.locator('input[placeholder="0.000"]').nth(2);

    await grossInput.fill('25.500');
    await stoneInput.fill('0.500');
    await expect(netInput).toHaveValue('25.000');

    // Pricing & Making Charges
    await dialog.locator('input[placeholder="e.g. 120000"]').fill('150000.00');
    await dialog.locator('input[placeholder="e.g. 145000"]').fill('200000.00');

    // Register & Inward
    await dialog.getByRole('button', { name: 'Register & Inward to Live Inventory' }).click();

    // Success banner
    await expect(page.locator('div:has-text("registered and inwarded to showroom stock")').first()).toBeVisible({
      timeout: 15000,
    });

    // Verify presence in inventory
    await page.reload();
    await page.waitForLoadState('networkidle');
    const searchInput = page.locator('input[placeholder*="Search tag code"]');
    await searchInput.fill(TEST_TAG);
    await expect(page.getByText(TEST_TAG)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(TEST_NAME)).toBeVisible();
  });

  // ============================================================================
  // Step 3, 4, 5: Create customer, POS billing checkout, and record UPI payment
  // ============================================================================
  test('Steps 3, 4, 5: POS checkout with synthetic customer, full UPI payment tender, and sequential invoice issuance', async ({ page }) => {
    await loginAs(page, 'owner@kalyan.test');
    await page.goto('/billing');
    await page.waitForURL('**/billing', { timeout: 15000 });

    // 1. Add ornament to cart via barcode scan input
    const scanInput = page.locator('input[placeholder*="Scan Barcode"]');
    await scanInput.fill(TEST_TAG);
    await scanInput.press('Enter');

    // Verify item in cart
    await expect(page.getByText(TEST_TAG, { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(TEST_NAME, { exact: true })).toBeVisible();

    // 2. Register synthetic customer via POS Quick Add
    await page.locator('button[title="Quick register new customer in CRM"]').click();
    const quickAddDialog = page.locator('div:has-text("Register New Customer Profile")').first();
    await expect(quickAddDialog).toBeVisible();

    await quickAddDialog.locator('input[placeholder="e.g. Ramesh K. Joshi"]').fill(TEST_CUSTOMER_NAME);
    await quickAddDialog.locator('input[placeholder="9820012345"]').fill(TEST_PHONE);
    await quickAddDialog.locator('input[placeholder="ABCDE1234F"]').fill(TEST_PAN);
    await quickAddDialog.locator('input[placeholder="e.g. Mumbai"]').fill('Thane');

    await quickAddDialog.locator('button:has-text("Register & Select")').click();

    // Verify customer selected
    await expect(page.getByRole('button', { name: 'Change' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(TEST_PHONE)).toBeVisible();

    // 3. Verify Grand Total & Tax Calculation
    await expect(page.getByText('Bill & Tax Calculation')).toBeVisible();
    await expect(page.getByText('CGST 1.5% + SGST 1.5%')).toBeVisible();
    await expect(page.locator('text=Grand Total:').locator('xpath=..')).toContainText('3,32,175');

    // 4. Quick Tender: Full UPI
    await page.getByRole('button', { name: 'Full UPI' }).click();
    await expect(page.locator('text=Total Tendered:').locator('xpath=..')).toContainText('3,32,175');

    // Fill UPI transaction reference
    const refInput = page.locator('input[placeholder*="Transaction / Approval Ref"]');
    await refInput.fill(TEST_UPI_REF);

    // 5. Submit Checkout
    const checkoutBtn = page.getByRole('button', { name: 'Complete Sale & Issue Tax Invoice' });
    await expect(checkoutBtn).toBeEnabled();
    await checkoutBtn.click();

    // Confirmation Modal
    await expect(page.getByText('Confirm Sales Checkout')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm & Generate Invoice' }).click();

    // Verify Sale Completed Modal
    await expect(page.getByText('SALE COMPLETED')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('h3:has-text("Invoice #")')).toBeVisible();

    // Link to invoice document
    const printLink = page.getByRole('link', { name: 'View & Print Tax Invoice (A4)' });
    await expect(printLink).toBeVisible();
    const href = await printLink.getAttribute('href');
    expect(href).toMatch(/^\/billing\/[a-z0-9-]+$/);
  });

  // ============================================================================
  // Step 6: Verify Invoice, Payment, Stock Deduction, Movement, and Ledger
  // ============================================================================
  test('Step 6: Verify database state: Stock SOLD, StockMovement SALE, balanced Journal Entry', async () => {
    // 1. Verify invoice record
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { organizationId: kalyanOrgId, customerPhone: TEST_PHONE },
      include: { items: true, payments: true },
    });

    expect(invoice.status).toBe('COMPLETED');
    expect(invoice.paymentStatus).toBe('PAID');
    expect(new Decimal(invoice.grandTotal).toString()).toBe('332175');
    expect(new Decimal(invoice.paidAmount).toString()).toBe('332175');
    expect(new Decimal(invoice.balanceAmount).toNumber()).toBe(0);
    expect(invoice.items.length).toBe(1);
    expect(invoice.payments.length).toBe(1);
    expect(invoice.payments[0].paymentMethod).toBe('UPI');
    expect(invoice.payments[0].transactionRef).toBe(TEST_UPI_REF);

    // 2. Verify stock deduction
    const ornament = await prisma.ornament.findFirstOrThrow({
      where: { organizationId: kalyanOrgId, tagCode: TEST_TAG },
    });
    expect(ornament.status).toBe('SOLD');

    // 3. Verify stock movement audit log
    const movements = await prisma.stockMovement.findMany({
      where: { ornamentId: ornament.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements.length).toBeGreaterThanOrEqual(2); // INWARD + SALE
    const saleMovement = movements.find((m) => m.movementType === 'SALE');
    expect(saleMovement).toBeDefined();
    expect((saleMovement?.metadata as any)?.invoiceId).toBe(invoice.id);
    expect(saleMovement?.reason).toContain(invoice.invoiceNumber);

    // 4. Verify balanced general ledger journal entry
    const journal = await prisma.journalEntry.findFirstOrThrow({
      where: { organizationId: kalyanOrgId, sourceId: invoice.id },
      include: { lines: { include: { account: true } } },
    });

    expect(journal.status).toBe('POSTED');
    expect(journal.totalDebit.toString()).toBe(journal.totalCredit.toString());

    // Verify line classifications
    const upiDr = journal.lines.find((l) => l.account.code === '1020'); // UPI Clearing
    const metalCr = journal.lines.find((l) => l.account.code === '4010'); // Metal Sales Revenue
    const mcCr = journal.lines.find((l) => l.account.code === '4020'); // Making Charges Revenue
    const cgstCr = journal.lines.find((l) => l.account.code === '2010'); // Output CGST
    const sgstCr = journal.lines.find((l) => l.account.code === '2020'); // Output SGST

    expect(upiDr).toBeDefined();
    expect(new Decimal(upiDr!.debitAmount).toString()).toBe('332175');
    expect(metalCr).toBeDefined();
    expect(new Decimal(metalCr!.creditAmount).toString()).toBe('303750');
    expect(mcCr).toBeDefined();
    expect(new Decimal(mcCr!.creditAmount).toString()).toBe('18750');
    expect(cgstCr).toBeDefined();
    expect(new Decimal(cgstCr!.creditAmount).toString()).toBe('4837.5');
    expect(sgstCr).toBeDefined();
    expect(new Decimal(sgstCr!.creditAmount).toString()).toBe('4837.5');
  });

  // ============================================================================
  // Step 7: Bank Reconciliation (Import CSV, Match, Settle)
  // ============================================================================
  test('Step 7: Bank Reconciliation: Import synthetic CSV, confirm match, and post settlement journal', async ({ page }) => {
    await loginAs(page, 'owner@kalyan.test');
    await page.goto('/reconciliation');
    await page.waitForURL('**/reconciliation', { timeout: 20000 });

    // 1. Open Import Statement Modal
    await page.click('button:has-text("Import Statement")');
    await expect(page.locator('h2:has-text("Import Bank Statement")')).toBeVisible();

    // Select target bank account
    const accountSelect = page.locator('div:has(> label:has-text("Target Bank Account")) select');
    await accountSelect.selectOption(kalyanBankAccountId);

    // Upload synthetic CSV
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(csvFilePath);
    await expect(page.locator(`text=${path.basename(csvFilePath)}`)).toBeVisible({ timeout: 5000 });

    // Preview
    await page.click('button:has-text("Preview & Validate Rows")');
    await expect(page.locator('text=1 valid rows parsed')).toBeVisible({ timeout: 15000 });

    // Commit Import
    await page.click('button:has-text("Commit Import")');
    await expect(page.locator('h2:has-text("Import Bank Statement")')).not.toBeVisible({ timeout: 20000 });

    // Verify imported row appears in table
    await page.fill('input[placeholder*="Search narration or UTR"]', TEST_UPI_REF);
    await page.click('button:has-text("Search")');
    const targetRow = page.locator(`tr:has-text("${TEST_UPI_REF}")`).first();
    await expect(targetRow).toBeVisible({ timeout: 15000 });

    // 2. Open Matching Review Modal
    await targetRow.click();
    await expect(page.locator('h2:has-text("Reconciliation Review")')).toBeVisible({ timeout: 15000 });

    // Verify candidate match
    await expect(page.locator('text=HIGH CONFIDENCE')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=EXACT_REF_AND_AMOUNT')).toBeVisible();

    // Confirm Match
    await page.click('button:has-text("Confirm Match")');
    await expect(page.locator('div.fixed').getByText('MATCHED', { exact: true })).toBeVisible({ timeout: 15000 });

    // Close review modal
    await page.click('button[aria-label="Close review modal"]');
    await expect(page.locator('h2:has-text("Reconciliation Review")')).not.toBeVisible();

    // 3. Post Settlement
    await targetRow.locator('button:has-text("Settle")').click();
    await expect(page.locator('h2:has-text("Post Bank Settlement")')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Double-Entry Entry Perfectly Balanced')).toBeVisible();

    await page.click('button:has-text("Post Settlement Journal")');
    await expect(page.locator('h2:has-text("Post Bank Settlement")')).not.toBeVisible({ timeout: 20000 });

    // Verify row displays SETTLED status
    await expect(targetRow).toContainText('SETTLED', { timeout: 15000 });

    // Verify settlement journal in database: Dr 1040 (Bank), Cr 1020 (UPI Clearing)
    const settlementJE = await prisma.journalEntry.findFirstOrThrow({
      where: {
        organizationId: kalyanOrgId,
        sourceType: 'SETTLEMENT',
      },
      include: { lines: { include: { account: true } } },
      orderBy: { createdAt: 'desc' },
    });
    expect(settlementJE.totalDebit.toString()).toBe(settlementJE.totalCredit.toString());
    const bankDr = settlementJE.lines.find((l) => l.account.code === '1040');
    const upiCr = settlementJE.lines.find((l) => l.account.code === '1020');
    expect(bankDr).toBeDefined();
    expect(new Decimal(bankDr!.debitAmount).toString()).toBe('332175');
    expect(upiCr).toBeDefined();
    expect(new Decimal(upiCr!.creditAmount).toString()).toBe('332175');
  });

  // ============================================================================
  // Step 8: Open Financial & Operational Reports
  // ============================================================================
  test('Step 8: Verify Sales Summary, Collections, Trial Balance, P&L, Balance Sheet, and Integrity Disclosures', async ({ page }) => {
    await loginAs(page, 'owner@kalyan.test');
    await page.goto('/reports');
    await page.waitForURL('**/reports', { timeout: 20000 });

    // 1. Sales Summary
    await expect(page.getByText('Operational Reports Workspace')).toBeVisible();
    await expect(page.getByText('Gross Invoice Sales').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('text=Total GST Collected').locator('xpath=..')).toBeVisible();

    // 2. Payment Collections
    await page.getByRole('button', { name: 'Payment Collections' }).click();
    await expect(page.getByText('Total Collections').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Customer Collections Register')).toBeVisible();
    await expect(page.getByText('Bank Settlements & Merchant Clearing Realization')).toBeVisible();

    // 3. Inventory Valuation
    await page.getByRole('button', { name: 'Inventory Valuation' }).click();
    await expect(page.getByText('Available Showroom Stock').first()).toBeVisible({ timeout: 20000 });

    // 4. Trial Balance
    await page.getByRole('button', { name: 'Trial Balance' }).click();
    await expect(page.getByText('Trial Balance is Balanced').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('General Ledger Trial Balance Register')).toBeVisible();

    // 5. Profit & Loss
    await page.getByRole('button', { name: 'Profit & Loss' }).click();
    await expect(page.getByText('Statement of Profit and Loss').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Net Operating Revenue').first()).toBeVisible();
    await expect(page.getByText('Cost of Goods Sold (COGS)').first()).toBeVisible();

    // 6. Balance Sheet
    await page.getByRole('button', { name: 'Balance Sheet' }).click();
    await expect(page.getByText('Balance Sheet Equation in Equilibrium').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Total Assets').first()).toBeVisible();
    await expect(page.getByText('Total Liabilities & Equity').first()).toBeVisible();

    // Verify that financial completeness qualifications remain visible
    await expect(page.getByText('INCOMPLETE FINANCIAL STATEMENT').first()).toBeVisible();
  });

  // ============================================================================
  // Benchmark Protection Invariant
  // ============================================================================
  test('Safeguard: Protected benchmark invoice INV/FORT/26-27/0200 remains intact and untouched', async () => {
    const inv = await prisma.invoice.findFirstOrThrow({
      where: { invoiceNumber: 'INV/FORT/26-27/0200' },
      include: { items: true, payments: true, customer: true, branch: true },
    });

    expect(inv.status).toBe('COMPLETED');
    expect(inv.grandTotal.toString()).toBe('239166');
    expect(inv.items.length).toBe(1);
    expect(inv.payments.length).toBe(1);
    expect(inv.branch.code).toBe('FORT');
    expect(inv.customer?.name).toBe('Nischal Hooda');
  });
});
