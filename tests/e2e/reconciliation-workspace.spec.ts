import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();
const DEV_PASSWORD = 'SuvarnaDev2026!';

async function withDbRetry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  let err: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      await new Promise((r) => setTimeout(r, delay * Math.pow(2, i)));
    }
  }
  throw err;
}

test.describe.configure({ mode: 'serial' });

test.describe('Suvarna Phase 4D-5A — Reconciliation Workspace Browser Journeys', () => {
  let suvarnaOrg: any;
  let fortBranch: any;
  let ownerUser: any;
  let accountantUser: any;
  let salesUser: any;

  let testBankAccountId: string | null = null;
  let testCustomer: any = null;
  let testInvoice: any = null;
  let testPayment: any = null;
  let testImportId: string | null = null;
  let testStatementLineId: string | null = null;

  const TEST_REF = `E2E-UTR-${Date.now()}`;
  const TEST_AMOUNT = '35000.00';
  const CSV_FILE_PATH = path.join(process.cwd(), 'scratch', `e2e-statement-${Date.now()}.csv`);
  const INVALID_CSV_FILE_PATH = path.join(process.cwd(), 'scratch', `e2e-invalid-${Date.now()}.csv`);

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
    // Ensure scratch directory exists
    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }

    suvarnaOrg = await withDbRetry(() => prisma.organization.findUniqueOrThrow({ where: { slug: 'suvarna-mumbai' } }));
    fortBranch = await withDbRetry(() => prisma.branch.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id, code: 'FORT' },
    }));

    ownerUser = await withDbRetry(() => prisma.user.findFirstOrThrow({ where: { email: 'owner@suvarna.test' } }));
    accountantUser = await withDbRetry(() => prisma.user.findFirstOrThrow({ where: { email: 'accountant@suvarna.test' } }));
    salesUser = await withDbRetry(() => prisma.user.findFirstOrThrow({ where: { email: 'sales@suvarna.test' } }));

    // Find linked 1040 account
    const gl1040 = await prisma.ledgerAccount.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id, code: '1040' },
    });

    // Seed dedicated E2E Bank Account
    const acc = await prisma.bankAccount.create({
      data: {
        organizationId: suvarnaOrg.id,
        branchId: fortBranch.id,
        accountName: `E2E HDFC Showroom ${Date.now()}`,
        bankName: 'HDFC Bank',
        accountType: 'CURRENT',
        accountNumberMasked: 'XXXX-E2E-9999',
        ledgerAccountId: gl1040.id,
        isActive: true,
      },
    });
    testBankAccountId = acc.id;

    // Seed dedicated customer and invoice payment for matching tests
    testCustomer = await prisma.customer.create({
      data: {
        organizationId: suvarnaOrg.id,
        primaryBranchId: fortBranch.id,
        name: `E2E Recon Customer ${Date.now()}`,
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        normalizedPhone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        city: 'Mumbai',
        state: 'Maharashtra',
      },
    });

    testInvoice = await prisma.invoice.create({
      data: {
        organizationId: suvarnaOrg.id,
        branchId: fortBranch.id,
        invoiceNumber: `INV-E2E-RECON-${Date.now()}`,
        fiscalYear: '2026-2027',
        sequenceNumber: Math.floor(Math.random() * 900000) + 1,
        customerId: testCustomer.id,
        customerName: testCustomer.name,
        customerCity: 'Mumbai',
        customerState: 'Maharashtra',
        subtotal: TEST_AMOUNT,
        taxableAmount: TEST_AMOUNT,
        totalTax: '0.00',
        grandTotal: TEST_AMOUNT,
        paidAmount: TEST_AMOUNT,
        balanceAmount: '0.00',
        paymentStatus: 'PAID',
        userId: ownerUser.id,
      },
    });

    testPayment = await prisma.invoicePayment.create({
      data: {
        organizationId: suvarnaOrg.id,
        invoiceId: testInvoice.id,
        paymentMethod: 'UPI',
        amount: TEST_AMOUNT,
        transactionRef: TEST_REF,
        paymentDate: new Date(),
        receivedByUserId: ownerUser.id,
      },
    });

    // Write synthetic statement CSV files with current date so they sort to the top of the feed
    const validCsv = `Date,Description,Reference,Credit,Debit\n26/10/2026,UPI Settlement from customer,${TEST_REF},${TEST_AMOUNT},0.00\n26/10/2026,Second Deposit,REF-E2E-2,10000.00,0.00`;
    fs.writeFileSync(CSV_FILE_PATH, validCsv, 'utf8');

    const invalidCsv = `Date,Description,Reference,Credit,Debit\nInvalidDate,Malformed Row,REF-FAIL,NaN,0.00`;
    fs.writeFileSync(INVALID_CSV_FILE_PATH, invalidCsv, 'utf8');
  });

  test.afterAll(async () => {
    // Clean up temporary CSV files
    if (fs.existsSync(CSV_FILE_PATH)) fs.unlinkSync(CSV_FILE_PATH);
    if (fs.existsSync(INVALID_CSV_FILE_PATH)) fs.unlinkSync(INVALID_CSV_FILE_PATH);

    // Clean up DB entities
    if (testBankAccountId) {
      // 1. Delete matches
      await prisma.reconciliationMatch.deleteMany({
        where: { statementLine: { bankAccountId: testBankAccountId } },
      });
      // 2. Delete statement lines
      await prisma.bankStatementLine.deleteMany({
        where: { bankAccountId: testBankAccountId },
      });
      // 3. Delete imports
      await prisma.bankStatementImport.deleteMany({
        where: { bankAccountId: testBankAccountId },
      });
      // 4. Delete payments & invoices
      if (testPayment) {
        await prisma.invoicePayment.deleteMany({ where: { id: testPayment.id } });
      }
      if (testInvoice) {
        await prisma.invoice.deleteMany({ where: { id: testInvoice.id } });
      }
      if (testCustomer) {
        await prisma.customer.deleteMany({ where: { id: testCustomer.id } });
      }
      // 5. Delete bank account
      await prisma.bankAccount.deleteMany({ where: { id: testBankAccountId } });
    }
  });

  // ============================================================================
  // JOURNEY 1: Authorized Accountant Access & UI Elements
  // ============================================================================
  test('Journey 1: Accountant opens workspace, verifies KPI cards, filter toolbar and tabs load', async ({ page }) => {
    await loginAs(page, 'accountant@suvarna.test');
    await page.goto('/reconciliation');
    await page.waitForURL('**/reconciliation', { timeout: 20000 });

    // 1. Page Header & Title
    await expect(page.locator('h1:has-text("Bank & Payment Reconciliation")')).toBeVisible();
    await expect(page.locator('text=Double-Entry Reconciliation')).toBeVisible();

    // 2. KPI Cards
    await expect(page.getByText('Total Imported Lines', { exact: true })).toBeVisible();
    await expect(page.getByText('Unmatched Lines', { exact: true })).toBeVisible();
    await expect(page.getByText('Partially Matched', { exact: true })).toBeVisible();
    await expect(page.getByText('Matched (Ready)', { exact: true })).toBeVisible();
    await expect(page.getByText('Settled in Ledger', { exact: true })).toBeVisible();
    await expect(page.getByText('Discrepant Queue', { exact: true })).toBeVisible();

    // 3. Filter Toolbar & Action Buttons
    await expect(page.locator('select:has-text("All Bank & Settlement Accounts")')).toBeVisible();
    await expect(page.locator('button:has-text("Add Bank Account")')).toBeVisible();
    await expect(page.locator('button:has-text("Import Statement")')).toBeVisible();

    // 4. Tab Navigation
    await expect(page.locator('button:has-text("Statement Lines & Matching")')).toBeVisible();
    await expect(page.locator('button:has-text("Discrepancy Queue")')).toBeVisible();
    await expect(page.locator('button:has-text("Statement Imports")')).toBeVisible();
    await expect(page.locator('button:has-text("Bank Accounts")')).toBeVisible();
  });

  // ============================================================================
  // JOURNEY 2: Unauthorized Role Protection
  // ============================================================================
  test('Journey 2: Sales staff is rejected with 403 Forbidden AccessDeniedModule', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');
    await page.goto('/reconciliation');

    // Verify Access Denied Module is rendered
    await expect(page.locator('text=Access Restricted')).toBeVisible();
    await expect(page.locator('text=403 FORBIDDEN')).toBeVisible();
    await expect(page.locator('text=Bank & Payment Reconciliation')).toBeVisible();
    await expect(page.locator('text=Return to Dashboard')).toBeVisible();

    // Verify reconciliation action buttons are absent
    await expect(page.locator('button:has-text("Import Statement")')).not.toBeVisible();
    await expect(page.locator('button:has-text("Add Bank Account")')).not.toBeVisible();
  });

  // ============================================================================
  // JOURNEY 3: CSV Upload, Preview, Validation & Duplicate Detection
  // ============================================================================
  test('Journey 3: Upload CSV, preview rows, import, and verify duplicate prevention', async ({ page }) => {
    await loginAs(page, 'accountant@suvarna.test');
    await page.goto('/reconciliation');
    await page.waitForURL('**/reconciliation', { timeout: 20000 });

    // 1. Open Import Modal
    await page.click('button:has-text("Import Statement")');
    await expect(page.locator('h2:has-text("Import Bank Statement")')).toBeVisible();

    // 2. Select target test bank account
    const accountSelect = page.locator('div:has(> label:has-text("Target Bank Account")) select');
    await accountSelect.selectOption(testBankAccountId!);

    // 3. Test Invalid CSV Preview first
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(INVALID_CSV_FILE_PATH);
    await page.click('button:has-text("Preview & Validate Rows")');

    // Expect validation errors displayed
    await expect(page.locator('text=Validation Errors')).toBeVisible({ timeout: 15000 });

    // 4. Upload Valid CSV
    await fileInput.setInputFiles(CSV_FILE_PATH);
    await expect(page.locator(`text=${path.basename(CSV_FILE_PATH)}`)).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);
    await page.click('button:has-text("Preview & Validate Rows")');

    // Expect 2 valid rows parsed
    await expect(page.locator('text=2 valid rows parsed')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('div.fixed table tbody tr')).toHaveCount(2);

    // 5. Commit Import
    await page.click('button:has-text("Commit Import")');

    // Modal should close and lines appear in the table
    await expect(page.locator('h2:has-text("Import Bank Statement")')).not.toBeVisible({ timeout: 20000 });
    await expect(page.locator(`text=${TEST_REF}`)).toBeVisible({ timeout: 15000 });

    // 6. Test Duplicate Detection Warning: Re-open modal with same file
    await page.click('button:has-text("Import Statement")');
    await accountSelect.selectOption(testBankAccountId!);
    await fileInput.setInputFiles(CSV_FILE_PATH);
    await expect(page.locator(`text=${path.basename(CSV_FILE_PATH)}`)).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);
    await page.click('button:has-text("Preview & Validate Rows")');

    // Duplicate alert banner must appear
    await expect(page.locator('text=Duplicate File Detected')).toBeVisible({ timeout: 15000 });
    // Commit button must be disabled
    await expect(page.locator('button:has-text("Commit Import")')).toBeDisabled();

    // Close modal
    await page.click('button:has-text("Cancel")');
  });

  // ============================================================================
  // JOURNEY 4: Matching Review & Confirmation
  // ============================================================================
  test('Journey 4: Open unmatched line, review candidate match, confirm, and verify status update', async ({ page }) => {
    await loginAs(page, 'accountant@suvarna.test');
    await page.goto('/reconciliation');
    await page.waitForURL('**/reconciliation', { timeout: 20000 });

    // Search for TEST_REF to isolate target row
    await page.fill('input[placeholder*="Search narration or UTR"]', TEST_REF);
    await page.click('button:has-text("Search")');

    // Locate the row containing TEST_REF and click to open Matching Review Modal
    const targetRow = page.locator(`tr:has-text("${TEST_REF}")`).first();
    await expect(targetRow).toBeVisible();
    await targetRow.click();

    // Verify Matching Review Modal opens
    await expect(page.locator('h2:has-text("Reconciliation Review")')).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`text=${TEST_REF}`).first()).toBeVisible();

    // Verify Candidate Matches Section shows suggested candidate with HIGH confidence (Rule A: EXACT_REF_AND_AMOUNT)
    await expect(page.locator('text=HIGH CONFIDENCE')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=EXACT_REF_AND_AMOUNT')).toBeVisible();

    // Click "Confirm Match" on the candidate
    await page.click('button:has-text("Confirm Match")');

    // Status badge inside modal updates to MATCHED
    await expect(page.locator('div.fixed').getByText('MATCHED', { exact: true })).toBeVisible({ timeout: 15000 });

    // Top Right action button now shows "Post Settlement"
    await expect(page.locator('button:has-text("Post Settlement")')).toBeVisible();

    // Close review modal
    await page.click('button[aria-label="Close review modal"]');
    await expect(page.locator('h2:has-text("Reconciliation Review")')).not.toBeVisible({ timeout: 15000 });
  });

  // ============================================================================
  // JOURNEY 5: Settlement Posting
  // ============================================================================
  test('Journey 5: Open matched line, review gross/net/fee, and post settlement journal', async ({ page }) => {
    await loginAs(page, 'accountant@suvarna.test');
    await page.goto('/reconciliation');
    await page.waitForURL('**/reconciliation', { timeout: 20000 });

    // Search for TEST_REF to isolate target row
    await page.fill('input[placeholder*="Search narration or UTR"]', TEST_REF);
    await page.click('button:has-text("Search")');

    // Find row with TEST_REF (now MATCHED) and click Settle button
    const targetRow = page.locator(`tr:has-text("${TEST_REF}")`).first();
    await expect(targetRow.getByText('MATCHED', { exact: true })).toBeVisible({ timeout: 15000 });
    await targetRow.locator('button:has-text("Settle")').click();

    // Verify Settlement Modal opens
    await expect(page.locator('h2:has-text("Post Bank Settlement")')).toBeVisible({ timeout: 15000 });

    // Verify Net Deposit, Gross Cleared, and Balancing Status
    await expect(page.locator(`text=₹${TEST_AMOUNT}`).first()).toBeVisible();
    await expect(page.locator('text=Double-Entry Entry Perfectly Balanced')).toBeVisible();

    // Click "Post Settlement Journal"
    await page.click('button:has-text("Post Settlement Journal")');

    // Modal closes and row reflects SETTLED status
    await expect(page.locator('h2:has-text("Post Bank Settlement")')).not.toBeVisible({ timeout: 20000 });
    const settledRow = page.locator(`tr:has-text("${TEST_REF}")`).first();
    await expect(settledRow).toContainText('SETTLED', { timeout: 15000 });
  });

  // ============================================================================
  // JOURNEY 6: Settled Record Protection
  // ============================================================================
  test('Journey 6: Settled line is protected against ordinary matching, discrepancy or reversal', async ({ page }) => {
    await loginAs(page, 'accountant@suvarna.test');
    await page.goto('/reconciliation');
    await page.waitForURL('**/reconciliation', { timeout: 20000 });

    // Search for TEST_REF to isolate target row
    await page.fill('input[placeholder*="Search narration or UTR"]', TEST_REF);
    await page.click('button:has-text("Search")');

    // Click settled row to open review modal
    const settledRow = page.locator(`tr:has-text("${TEST_REF}")`).first();
    await settledRow.click();

    // Verify review modal opens
    await expect(page.locator('h2:has-text("Reconciliation Review")')).toBeVisible({ timeout: 15000 });

    // Verify Settled Immutability Alert is displayed
    await expect(page.locator('text=Settled Record — Protected Against Ordinary Matching Actions')).toBeVisible();

    // Verify ordinary matching buttons are NOT visible or disabled
    await expect(page.locator('button:has-text("Mark Discrepant")')).not.toBeVisible();
    await expect(page.locator('button:has-text("Ignore Line")')).not.toBeVisible();
    await expect(page.locator('button:has-text("Confirm Match")')).not.toBeVisible();

    // Match table action indicates "Locked"
    await expect(page.locator('text=Locked').first()).toBeVisible();

    // Close modal
    await page.click('button[aria-label="Close review modal"]');
  });

  // ============================================================================
  // JOURNEY 7: Settlement Reversal
  // ============================================================================
  test('Journey 7: Reverse settlement with audit reason and verify restored MATCHED status', async ({ page }) => {
    await loginAs(page, 'accountant@suvarna.test');
    await page.goto('/reconciliation');
    await page.waitForURL('**/reconciliation', { timeout: 20000 });

    // Search for TEST_REF to isolate target row
    await page.fill('input[placeholder*="Search narration or UTR"]', TEST_REF);
    await page.click('button:has-text("Search")');

    // Click "Settled" button on the settled row to open settlement reversal
    const settledRow = page.locator(`tr:has-text("${TEST_REF}")`).first();
    await settledRow.locator('button:has-text("Settled")').click();

    // Settlement modal opens in reversal mode
    await expect(page.locator('h2:has-text("Reverse Bank Settlement")')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Settlement Reversal Safeguards')).toBeVisible();

    // Enter mandatory reversal reason
    await page.fill('textarea', 'E2E Verified settlement reversal for test auditing');

    // Confirm reversal
    await page.click('button:has-text("Confirm Settlement Reversal")');

    // Modal closes and row returns to MATCHED status
    await expect(page.locator('h2:has-text("Reverse Bank Settlement")')).not.toBeVisible({ timeout: 20000 });
    const restoredRow = page.locator(`tr:has-text("${TEST_REF}")`).first();
    await expect(restoredRow.getByText('MATCHED', { exact: true })).toBeVisible({ timeout: 15000 });
  });

  // ============================================================================
  // JOURNEY 8: Filters, Tabs, Search & Bank Account Views
  // ============================================================================
  test('Journey 8: Test tab navigation, search filtering, and bank account directory', async ({ page }) => {
    await loginAs(page, 'accountant@suvarna.test');
    await page.goto('/reconciliation');
    await page.waitForURL('**/reconciliation', { timeout: 20000 });

    // 1. Test Search Input
    await page.fill('input[placeholder*="Search narration or UTR"]', TEST_REF);
    await page.click('button:has-text("Search")');
    await expect(page.locator(`tr:has-text("${TEST_REF}")`)).toBeVisible();

    // 2. Test Tab Navigation: Statement Imports
    await page.click('button:has-text("Statement Imports")');
    await expect(page.locator('h3:has-text("Statement Import Registry")')).toBeVisible();

    // 3. Test Tab Navigation: Bank Accounts
    await page.click('button:has-text("Bank Accounts")');
    await expect(page.locator('h3:has-text("Configured Bank & Settlement Accounts")')).toBeVisible();
    await expect(page.locator('h4:has-text("E2E HDFC Showroom")').first()).toBeVisible();

    // 4. Test Tab Navigation: Discrepancy Queue
    await page.click('button:has-text("Discrepancy Queue")');
    await expect(page.locator('h3:has-text("Unresolved Discrepancies Queue")')).toBeVisible();

    // 5. Return to Statement Lines Tab
    await page.click('button:has-text("Statement Lines & Matching")');
    await expect(page.locator('th:has-text("Deposit Amount (₹)")')).toBeVisible();
  });
});
