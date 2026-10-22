import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEV_PASSWORD = 'SuvarnaDev2026!';

test.describe.configure({ mode: 'serial' });

test.describe('Suvarna Phase 2 — Customer CRM Browser End-to-End Workflows', () => {
  const TEST_NAME = 'Ananya Roy';
  const TEST_PHONE = '9820999111';

  async function loginAs(page: Page, email: string) {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', DEV_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 30000 });
  }

  test.beforeAll(async () => {
    // Clean up any lingering test records
    await prisma.customerInteraction.deleteMany({
      where: { customer: { name: TEST_NAME } },
    });
    await prisma.customer.deleteMany({
      where: { name: TEST_NAME },
    });
  });

  test.afterAll(async () => {
    await prisma.customerInteraction.deleteMany({
      where: { customer: { name: TEST_NAME } },
    });
    await prisma.customer.deleteMany({
      where: { name: TEST_NAME },
    });
    await prisma.$disconnect();
  });

  test('Workflow 1: Sales Staff registers a customer profile and verifies live persistence', async ({ page }) => {
    // 1. Sign in as SALES_STAFF
    await loginAs(page, 'sales@suvarna.test');

    // 2. Navigate to Customers & CRM
    await page.click('a[href="/customers"]');
    await page.waitForURL('**/customers', { timeout: 15000 });

    // Verify Header & Live Database Status Badge
    await expect(page.locator('h1')).toContainText('Customer Directory');
    await expect(page.getByText('LIVE DATABASE', { exact: true })).toBeVisible();

    // 3. Open Add Customer Modal
    await page.click('button:has-text("Add New Customer")');
    const addModal = page.locator('div.fixed:has-text("Register New Customer Profile")');
    await expect(addModal).toBeVisible();

    // 4. Fill in Customer Form
    await addModal.locator('input[placeholder="e.g. Meera Joshi"]').fill(TEST_NAME);
    await addModal.locator('input[placeholder="e.g. 98200 12345"]').fill(TEST_PHONE);
    await addModal.locator('select:has(option[value="VIP"])').selectOption('VIP');
    await addModal.locator('textarea[placeholder*="prefers 22K antique"]').fill('Enquired for 22K polki bridal set');

    // 5. Submit Form
    await addModal.locator('button:has-text("Save Customer Profile")').click();

    // Verify Success notice
    await expect(page.getByText(`Customer profile registered for "${TEST_NAME}"`)).toBeVisible({
      timeout: 10000,
    });

    // Verify Customer row appears in directory table
    await expect(page.locator('table')).toContainText(TEST_NAME);
    await expect(page.locator('table')).toContainText(TEST_PHONE);
    await expect(page.locator('table')).toContainText('VIP');
  });

  test('Workflow 2: Live duplicate warning displays on phone input', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');
    await page.goto('/customers');
    await page.waitForSelector('h1:has-text("Customer Directory")');

    // Open Add Customer Modal
    await page.click('button:has-text("Add New Customer")');
    const addModal = page.locator('div.fixed:has-text("Register New Customer Profile")');
    await expect(addModal).toBeVisible();

    // Type the existing patron phone number
    await addModal.locator('input[placeholder="e.g. 98200 12345"]').fill(TEST_PHONE);

    // Verify live warning appears
    await expect(page.getByText('Shared Mobile Phone Notice')).toBeVisible({ timeout: 10000 });
    await expect(addModal.getByText(TEST_NAME)).toBeVisible();

    // Cancel modal
    await addModal.locator('button:has-text("Cancel")').click();
    await expect(addModal).not.toBeVisible();
  });

  test('Workflow 3: Search, customer profile drawer, interaction log, and transaction empty states', async ({
    page,
  }) => {
    await loginAs(page, 'sales@suvarna.test');
    await page.goto('/customers');
    await page.waitForSelector('h1:has-text("Customer Directory")');

    // 1. Search for customer
    const searchInput = page.locator('input[placeholder*="Search by customer name"]');
    await searchInput.fill('Ananya');

    // Verify table filters down to test customer
    await expect(page.locator('table')).toContainText(TEST_NAME);

    // 2. Open Profile Drawer
    await page.click('button:has-text("Profile")');
    await expect(page.getByText(TEST_NAME).first()).toBeVisible();
    await expect(page.getByText(TEST_PHONE).first()).toBeVisible();
    await expect(page.getByText('Enquired for 22K polki bridal set')).toBeVisible();

    // 3. Test Activity & Enquiries Tab
    await page.click('button:has-text("Activity & Enquiries")');
    await expect(page.getByText('Chronological Showroom Activity & Enquiries')).toBeVisible();

    // Log a new interaction
    await page.click('button:has-text("Log New Interaction")');
    await expect(page.getByText(`Log Interaction for ${TEST_NAME}`)).toBeVisible();
    await page.fill(
      'textarea[placeholder*="Visited showroom to look at bridal"]',
      'Patron visited showroom with family to see 22K necklace samples.'
    );
    await page.click('button:has-text("Save Interaction")');

    // Verify interaction is displayed in timeline
    await expect(
      page.getByText('Patron visited showroom with family to see 22K necklace samples.')
    ).toBeVisible({ timeout: 10000 });

    // 4. Test Billing & Gold History Tab (Honest Empty States)
    await page.click('button:has-text("Billing & Gold History")');
    await expect(page.getByText('No sales recorded yet.')).toBeVisible();
    await expect(page.getByText('No gold purchases or exchanges recorded yet.')).toBeVisible();
    await expect(page.getByText('₹0.00')).toBeVisible();

    // Close drawer
    await page.click('button:has-text("Close Profile")');
  });

  test('Workflow 4: Edit customer details and verify database persistence after reload', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');
    await page.goto('/customers');
    await page.waitForSelector('h1:has-text("Customer Directory")');

    // Find test customer and click Edit
    const row = page.locator(`tr:has-text("${TEST_NAME}")`);
    await row.locator('button[title="Edit Patron"]').click();

    // Verify Edit Modal opens
    const editModal = page.locator('div.fixed:has-text("Edit Customer Details")');
    await expect(editModal).toBeVisible();

    // Update Address & Notes
    await editModal.locator('input[placeholder="Flat / Building, Street"]').fill('Flat 502, Sea Green Apts');
    await editModal.locator('input[placeholder="e.g. Mumbai"]').fill('Mumbai');
    await editModal.locator('textarea').fill('Updated: Prefers lightweight jewellery for daily wear.');

    // Save changes
    await editModal.locator('button:has-text("Update Profile")').click();

    // Verify success banner
    await expect(page.getByText(`Updated customer details for "${TEST_NAME}"`)).toBeVisible({
      timeout: 10000,
    });

    // Reload page to verify persistence directly from database
    await page.reload();
    await page.waitForSelector('h1:has-text("Customer Directory")');

    // Open profile drawer
    const reloadedRow = page.locator(`tr:has-text("${TEST_NAME}")`);
    await reloadedRow.locator('button:has-text("Profile")').click();

    // Verify updated address and notes persisted
    await expect(page.getByText('Flat 502, Sea Green Apts')).toBeVisible();
    await expect(page.getByText('Updated: Prefers lightweight jewellery for daily wear.')).toBeVisible();

    // Close profile
    await page.click('button:has-text("Close Profile")');
  });

  test('Workflow 5: Strict multi-tenant isolation prevents cross-tenant access', async ({ page }) => {
    // 1. Log in as Kalyan Jewellery Owner
    await loginAs(page, 'owner@kalyan.test');

    // 2. Navigate to Customers
    await page.goto('/customers');
    await page.waitForSelector('h1:has-text("Customer Directory")');

    // 3. Search for Suvarna test customer
    const searchInput = page.locator('input[placeholder*="Search by customer name"]');
    await searchInput.fill('Ananya');

    // 4. Verify 0 results found (Suvarna customer is invisible to Kalyan tenant)
    await expect(page.getByText('No customer profiles found')).toBeVisible();
    await expect(page.locator('table')).not.toContainText(TEST_NAME);
  });
});
