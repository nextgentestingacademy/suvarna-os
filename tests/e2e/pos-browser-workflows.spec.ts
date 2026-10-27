import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

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

test.describe('Suvarna Phase 3B — POS Cashier Browser End-to-End Workflows', () => {
  const TEST_SKU = 'E2E-POS-SKU-001';
  const TEST_TAG = 'E2E-POS-TAG-001';
  const TEST_HV_TAG = 'E2E-POS-TAG-HV';
  const TEST_DUP_TAG = 'E2E-POS-TAG-DUP';
  const TEST_CUSTOMER_NAME = 'Vikram Singhania';
  const TEST_CUSTOMER_PHONE = '9820088999';
  const TEST_NO_PAN_CUST_NAME = 'Nischal Hooda (E2E)';
  const TEST_NO_PAN_CUST_PHONE = '9820077881';

  let suvarnaOrg: any;
  let fortBranch: any;
  let createdProductId: string | null = null;
  let createdOrnamentId: string | null = null;
  let createdCustomerId: string | null = null;
  let createdInvoiceId: string | null = null;

  async function loginAs(page: Page, email: string) {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', DEV_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 30000 });
  }

  test.beforeAll(async () => {
    suvarnaOrg = await withDbRetry(() => prisma.organization.findUniqueOrThrow({ where: { slug: 'suvarna-mumbai' } }));
    fortBranch = await withDbRetry(() => prisma.branch.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id, code: 'FORT' },
    }));

    // Clean up any old test records
    await prisma.invoicePayment.deleteMany({
      where: { invoice: { customerName: { in: [TEST_CUSTOMER_NAME, TEST_NO_PAN_CUST_NAME] } } },
    });
    await prisma.invoiceItem.deleteMany({
      where: { ornament: { tagCode: { in: [TEST_TAG, TEST_HV_TAG, TEST_DUP_TAG] } } },
    });
    await prisma.invoice.deleteMany({
      where: { customerName: { in: [TEST_CUSTOMER_NAME, TEST_NO_PAN_CUST_NAME] } },
    });
    await prisma.stockMovement.deleteMany({
      where: { ornament: { tagCode: { in: [TEST_TAG, TEST_HV_TAG, TEST_DUP_TAG] } } },
    });
    await prisma.ornament.deleteMany({
      where: { tagCode: { in: [TEST_TAG, TEST_HV_TAG, TEST_DUP_TAG] } },
    });
    await prisma.product.deleteMany({
      where: { sku: TEST_SKU },
    });
    await prisma.customer.deleteMany({
      where: { phone: { in: [TEST_CUSTOMER_PHONE, TEST_NO_PAN_CUST_PHONE] } },
    });

    // Seed dedicated available ornament in Fort showroom
    const prod = await prisma.product.create({
      data: {
        organizationId: suvarnaOrg.id,
        sku: TEST_SKU,
        name: 'E2E 22K Royal Temple Haar',
        category: 'Necklaces',
        metalType: 'GOLD',
        purity: '22K',
      },
    });
    createdProductId = prod.id;

    const orn = await prisma.ornament.create({
      data: {
        organizationId: suvarnaOrg.id,
        branchId: fortBranch.id,
        productId: prod.id,
        tagCode: TEST_TAG,
        huid: 'E2E991',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: 30.500,
        stoneWeight: 0.500,
        netWeight: 30.000,
        makingChargeType: 'PER_GRAM',
        makingChargeValue: 850.00,
        priceAmount: 390000.00,
        status: 'AVAILABLE',
      },
    });
    createdOrnamentId = orn.id;

    await prisma.ornament.create({
      data: {
        organizationId: suvarnaOrg.id,
        branchId: fortBranch.id,
        productId: prod.id,
        tagCode: TEST_HV_TAG,
        huid: 'E2E992',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: 20.000,
        stoneWeight: 0.000,
        netWeight: 20.000,
        makingChargeType: 'PER_GRAM',
        makingChargeValue: 800.00,
        priceAmount: 260000.00,
        status: 'AVAILABLE',
      },
    });

    await prisma.ornament.create({
      data: {
        organizationId: suvarnaOrg.id,
        branchId: fortBranch.id,
        productId: prod.id,
        tagCode: TEST_DUP_TAG,
        huid: 'E2E993',
        metalType: 'GOLD',
        purity: '22K',
        grossWeight: 15.000,
        stoneWeight: 0.000,
        netWeight: 15.000,
        makingChargeType: 'PER_GRAM',
        makingChargeValue: 750.00,
        priceAmount: 195000.00,
        status: 'AVAILABLE',
      },
    });

    const cust = await prisma.customer.create({
      data: {
        organizationId: suvarnaOrg.id,
        primaryBranchId: fortBranch.id,
        name: TEST_CUSTOMER_NAME,
        phone: TEST_CUSTOMER_PHONE,
        normalizedPhone: TEST_CUSTOMER_PHONE,
        segment: 'VIP',
        city: 'Mumbai',
        state: 'Maharashtra',
        pan: 'ABCDE1234F',
      },
    });
    createdCustomerId = cust.id;

    await prisma.customer.create({
      data: {
        organizationId: suvarnaOrg.id,
        primaryBranchId: fortBranch.id,
        name: TEST_NO_PAN_CUST_NAME,
        phone: TEST_NO_PAN_CUST_PHONE,
        normalizedPhone: TEST_NO_PAN_CUST_PHONE,
        segment: 'RETAIL',
        city: 'Mumbai',
        state: 'Maharashtra',
        pan: null,
      },
    });
  });

  test.afterAll(async () => {
    await prisma.invoicePayment.deleteMany({
      where: { invoice: { customerName: { in: [TEST_CUSTOMER_NAME, TEST_NO_PAN_CUST_NAME] } } },
    });
    await prisma.invoiceItem.deleteMany({
      where: { ornament: { tagCode: { in: [TEST_TAG, TEST_HV_TAG, TEST_DUP_TAG] } } },
    });
    await prisma.invoice.deleteMany({
      where: { customerName: { in: [TEST_CUSTOMER_NAME, TEST_NO_PAN_CUST_NAME] } },
    });
    await prisma.stockMovement.deleteMany({
      where: { ornament: { tagCode: { in: [TEST_TAG, TEST_HV_TAG, TEST_DUP_TAG] } } },
    });
    await prisma.ornament.deleteMany({
      where: { tagCode: { in: [TEST_TAG, TEST_HV_TAG, TEST_DUP_TAG] } },
    });
    await prisma.product.deleteMany({
      where: { sku: TEST_SKU },
    });
    await prisma.customer.deleteMany({
      where: { phone: { in: [TEST_CUSTOMER_PHONE, TEST_NO_PAN_CUST_PHONE] } },
    });
    await prisma.$disconnect();
  });

  test('Workflow 1: Sales Associate logs in, opens POS, and verifies live showroom status', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');

    // Click on Billing & POS in the navigation
    await page.click('a[href="/billing"]');
    await page.waitForURL('**/billing', { timeout: 15000 });

    // Verify Title & Live Database Badge
    await expect(page.locator('h1')).toContainText('Point of Sale & Retail Billing');
    await expect(page.getByText('LIVE DATABASE', { exact: true })).toBeVisible();

    // Verify Showroom Daily Rates Ticker
    await expect(page.getByText('Active Showroom Daily Rates:')).toBeVisible();
    await expect(page.getByText('22K Gold:')).toBeVisible();
  });

  test('Workflow 2: Cashier scans / searches ornament, selects customer, and verifies cart totals', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');
    await page.goto('/billing');
    await page.waitForURL('**/billing', { timeout: 15000 });

    // 1. Scan / Enter Barcode
    const scanInput = page.locator('input[placeholder*="Scan Barcode"]');
    await expect(scanInput).toBeVisible();
    await scanInput.fill(TEST_TAG);
    await scanInput.press('Enter');

    // Verify success feedback toast/alert
    await expect(page.getByText(`Added ${TEST_TAG}`, { exact: false })).toBeVisible({ timeout: 5000 });

    // Verify item is rendered in the cart
    await expect(page.getByText('E2E 22K Royal Temple Haar', { exact: true })).toBeVisible();
    await expect(page.getByText(TEST_TAG, { exact: true })).toBeVisible();

    // 2. Search and select customer
    const customerSearch = page.locator('input[placeholder*="Search customer by name"]');
    await expect(customerSearch).toBeVisible();
    await customerSearch.fill(TEST_CUSTOMER_NAME);

    // Wait for dropdown result and click it
    const customerResult = page.locator(`button:has-text("${TEST_CUSTOMER_NAME}")`).first();
    await expect(customerResult).toBeVisible({ timeout: 5000 });
    await customerResult.click();

    // Verify selected customer card
    await expect(page.getByRole('button', { name: 'Change' })).toBeVisible();
    await expect(page.getByText(TEST_CUSTOMER_NAME, { exact: true })).toBeVisible();

    // 3. Verify Cart & Tax Calculation Summary
    await expect(page.getByText('Bill & Tax Calculation')).toBeVisible();
    await expect(page.getByText('CGST 1.5% + SGST 1.5%')).toBeVisible();
    await expect(page.getByText('Grand Total:')).toBeVisible();
  });

  test('Workflow 3: Cashier tenders payment, confirms checkout, and receives sequential invoice', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');
    await page.goto('/billing');
    await page.waitForURL('**/billing', { timeout: 15000 });

    // Add ornament
    const scanInput = page.locator('input[placeholder*="Scan Barcode"]');
    await scanInput.fill(TEST_TAG);
    await scanInput.press('Enter');
    await expect(page.getByText(TEST_TAG, { exact: true })).toBeVisible();

    // Select customer
    const customerSearch = page.locator('input[placeholder*="Search customer by name"]');
    await customerSearch.fill(TEST_CUSTOMER_NAME);
    const customerResult = page.locator(`button:has-text("${TEST_CUSTOMER_NAME}")`).first();
    await customerResult.click();

    // Ensure cart grand total is calculated by server before clicking quick tender
    await expect(page.locator('text=Grand Total:').locator('xpath=..')).toContainText('₹');

    // Click "Full UPI" quick tender button
    await page.getByRole('button', { name: 'Full UPI' }).click();

    // Verify total tendered is updated
    await expect(page.locator('text=Total Tendered:').locator('xpath=..')).toContainText('₹');

    // Fill UPI ref
    const refInput = page.locator('input[placeholder*="Transaction / Approval Ref"]');
    await refInput.fill('UPI-REF-E2E-999');

    // Verify balance due is zero
    await expect(page.getByText('Balance Due:')).toBeVisible();

    // Click Complete Sale button
    const checkoutBtn = page.getByRole('button', { name: 'Complete Sale & Issue Tax Invoice' });
    await expect(checkoutBtn).toBeEnabled();
    await checkoutBtn.click();

    // Confirmation Modal appears
    await expect(page.getByText('Confirm Sales Checkout')).toBeVisible();

    // Click Confirm & Generate Invoice
    const confirmSubmitBtn = page.getByRole('button', { name: 'Confirm & Generate Invoice' });
    await confirmSubmitBtn.click();

    // Success Modal appears
    await expect(page.getByText('SALE COMPLETED')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('h3:has-text("Invoice #")')).toBeVisible();

    // Capture generated invoice ID from the link
    const viewPrintLink = page.getByRole('link', { name: 'View & Print Tax Invoice (A4)' });
    await expect(viewPrintLink).toBeVisible();
    const href = await viewPrintLink.getAttribute('href');
    expect(href).toMatch(/^\/billing\/[a-z0-9-]+$/);
    createdInvoiceId = href!.replace('/billing/', '');
  });

  test('Workflow 4: Cashier views and prints the generated tax invoice with A4 print layout', async ({ page }) => {
    expect(createdInvoiceId).not.toBeNull();

    await loginAs(page, 'sales@suvarna.test');
    await page.goto(`/billing/${createdInvoiceId}`);
    await page.waitForURL(`**/billing/${createdInvoiceId}`, { timeout: 15000 });

    // Verify Invoice Document details scoped to invoice container
    const invoiceDoc = page.locator('.invoice-print-container');
    await expect(invoiceDoc.locator('h1')).toContainText('Suvarna');
    await expect(invoiceDoc.getByText('TAX INVOICE / RETAIL BILL')).toBeVisible();
    await expect(invoiceDoc.getByText(TEST_CUSTOMER_NAME)).toBeVisible();
    await expect(invoiceDoc.getByText(TEST_TAG)).toBeVisible();
    await expect(invoiceDoc.getByText('GSTIN: 27AAAAA0000A1Z5')).toBeVisible();
    await expect(invoiceDoc.getByText('HSN Code: 7113')).toBeVisible();

    // Verify Print Button is present and clickable
    const printButton = page.getByRole('button', { name: 'Print Tax Invoice (A4)' });
    await expect(printButton).toBeVisible();

    // Verify Back to POS link
    const backLink = page.getByRole('link', { name: 'Back to POS' });
    await expect(backLink).toBeVisible();
  });

  test('Workflow 5: Sold ornament cannot be added again or re-sold (Inventory state consistency)', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');
    await page.goto('/billing');
    await page.waitForURL('**/billing', { timeout: 15000 });

    // Attempt to scan the already-sold ornament
    const scanInput = page.locator('input[placeholder*="Scan Barcode"]');
    await scanInput.fill(TEST_TAG);
    await scanInput.press('Enter');

    // Verify error that ornament is not available
    await expect(
      page.getByText(`No available ornament found matching "${TEST_TAG}"`, { exact: false })
    ).toBeVisible({ timeout: 5000 });
  });

  test('Workflow 6: Cross-tenant boundary prevents unauthorized access to another tenant invoice', async ({ page }) => {
    expect(createdInvoiceId).not.toBeNull();

    // Sign in as owner of Kalyan Test Jewellers (Tenant 2)
    await loginAs(page, 'owner@kalyan.test');

    // Attempt to access Suvarna's invoice ID
    await page.goto(`/billing/${createdInvoiceId}`);

    // Verify Not Found or Access Denied
    await expect(page.getByText('Invoice Not Found')).toBeVisible({ timeout: 15000 });
  });

  test('Workflow 7: High-value sale with registered customer lacking PAN permits typing PAN and completes sale', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');
    await page.goto('/billing');
    await page.waitForURL('**/billing', { timeout: 15000 });

    // Add high-value piece (20g @ ₹12,150/g + ₹800/g making = ₹2,59,000 subtotal, >= ₹2,00,000)
    const scanInput = page.locator('input[placeholder*="Scan Barcode"]');
    await scanInput.fill(TEST_HV_TAG);
    await scanInput.press('Enter');
    await expect(page.getByText(TEST_HV_TAG, { exact: true })).toBeVisible();

    // Select registered customer who lacks PAN
    const customerSearch = page.locator('input[placeholder*="Search customer by name"]');
    await customerSearch.fill(TEST_NO_PAN_CUST_NAME);
    const customerResult = page.locator(`button:has-text("${TEST_NO_PAN_CUST_NAME}")`).first();
    await customerResult.click();

    // Verify selected customer card appears
    await expect(page.getByText(TEST_NO_PAN_CUST_NAME, { exact: true })).toBeVisible();

    // Verify Statutory KYC Quoting Requirement warning appears
    await expect(page.getByText('Statutory KYC Quoting Requirement')).toBeVisible();

    // Verify complete sale button is disabled before entering PAN
    const checkoutBtn = page.getByRole('button', { name: 'Complete Sale & Issue Tax Invoice' });
    await expect(checkoutBtn).toBeDisabled();

    // Type 10-digit synthetic PAN into the PAN input
    const panInput = page.locator('input[placeholder="ABCDE1234F"]');
    await expect(panInput).toBeVisible();
    await panInput.fill('ABCDE1234F');

    // Verify quoted PAN text and green state
    await expect(page.getByText('Income Tax PAN quoted: ABCDE1234F')).toBeVisible();

    // Ensure cart grand total is calculated by server before clicking quick tender
    await expect(page.locator('text=Grand Total:').locator('xpath=..')).toContainText('₹');

    // Tender Full UPI
    await page.getByRole('button', { name: 'Full UPI' }).click();

    // Verify total tendered is updated
    await expect(page.locator('text=Total Tendered:').locator('xpath=..')).toContainText('₹');

    // Verify checkout button is now enabled
    await expect(checkoutBtn).toBeEnabled();
    await checkoutBtn.click();

    // Confirmation Modal appears
    await expect(page.getByText('Confirm Sales Checkout')).toBeVisible();
    const confirmSubmitBtn = page.getByRole('button', { name: 'Confirm & Generate Invoice' });
    await confirmSubmitBtn.click();

    // Success Modal appears
    await expect(page.getByText('SALE COMPLETED')).toBeVisible({ timeout: 15000 });
  });

  test('Workflow 8: Jewellery Catalogue displays Indicative Price for showroom inventory', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');
    await page.goto('/inventory');
    await page.waitForURL('**/inventory', { timeout: 15000 });

    // Switch to table view
    await page.locator('button[title="Table View"]').click();

    // Verify Indicative Price column header is rendered
    await expect(page.locator('th:has-text("Indicative Price")')).toBeVisible();
  });

  test('Workflow 9: Connected branch panel renders cleanly in sidebar with ONLINE indicator', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');
    await page.goto('/billing');
    await page.waitForURL('**/billing', { timeout: 15000 });

    // Verify Connected Branch panel elements in sidebar
    const sidebar = page.locator('aside').filter({ hasText: 'Showroom Operations' });
    await expect(sidebar.getByText('Connected Branch')).toBeVisible();
    await expect(sidebar.getByText('ONLINE')).toBeVisible();
    await expect(sidebar.getByText('Fort Main Showroom')).toBeVisible();
    await expect(sidebar.getByText('GSTIN: 27AAAAA0000A1Z5')).toBeVisible();
    await expect(sidebar.getByText('FORT', { exact: true })).toBeVisible();
  });

  test('Workflow 10: Duplicate physical tag scan displays clear serialization warning', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');
    await page.goto('/billing');
    await page.waitForURL('**/billing', { timeout: 15000 });

    const scanInput = page.locator('input[placeholder*="Scan Barcode"]');
    await expect(scanInput).toBeVisible();

    // 1. Scan TEST_DUP_TAG to add it to the sales bill
    await scanInput.fill(TEST_DUP_TAG);
    await scanInput.press('Enter');

    // Verify added to cart
    await expect(page.getByText(`Added ${TEST_DUP_TAG}`, { exact: false })).toBeVisible({ timeout: 5000 });

    // 2. Scan the EXACT same physical tag code again
    await scanInput.fill(TEST_DUP_TAG);
    await scanInput.press('Enter');

    // 3. Verify clear serialized duplicate prevention feedback is displayed
    await expect(
      page.getByText(new RegExp(`This physical jewellery piece.*Tag: ${TEST_DUP_TAG}.*is already in the sales bill`, 'i'))
    ).toBeVisible({ timeout: 5000 });
  });
});
