import { test, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEV_PASSWORD = 'SuvarnaDev2026!';

test.describe.configure({ mode: 'serial' });

test.describe('Suvarna Milestone 3B — Inventory Browser End-to-End Workflows', () => {
  const TEST_SKU = 'E2E-SKU-901';
  const TEST_TAG = 'E2E-TAG-901';
  const TEST_NAME = 'E2E Royal Heritage Choker';

  async function loginAs(page: Page, email: string) {
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', DEV_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 20000 });
  }

  test.beforeAll(async () => {
    // Clean up any lingering test records
    const existingMovements = await prisma.stockMovement.findMany({
      where: { ornament: { tagCode: TEST_TAG } },
      select: { id: true },
    });
    if (existingMovements.length > 0) {
      await prisma.stockMovement.deleteMany({ where: { id: { in: existingMovements.map((m) => m.id) } } });
    }
    await prisma.ornament.deleteMany({ where: { tagCode: TEST_TAG } });
    await prisma.product.deleteMany({ where: { sku: TEST_SKU } });
  });

  test.afterAll(async () => {
    const existingMovements = await prisma.stockMovement.findMany({
      where: { ornament: { tagCode: TEST_TAG } },
      select: { id: true },
    });
    if (existingMovements.length > 0) {
      await prisma.stockMovement.deleteMany({ where: { id: { in: existingMovements.map((m) => m.id) } } });
    }
    await prisma.ornament.deleteMany({ where: { tagCode: TEST_TAG } });
    await prisma.product.deleteMany({ where: { sku: TEST_SKU } });
    await prisma.$disconnect();
  });

  test('Workflow 1: Owner login, inventory navigation, and persistent registration', async ({ page }) => {
    // 1. Sign In as OWNER
    await loginAs(page, 'owner@suvarna.test');

    // 2. Navigate to Inventory
    await page.click('a[href="/inventory"]');
    await page.waitForURL('**/inventory', { timeout: 15000 });

    // Verify Header & Live Postgres Status Badge
    await expect(page.locator('h1')).toContainText('Showroom');
    await expect(page.getByText('POSTGRES PERSISTED')).toBeVisible();

    // 3. Register New Jewellery Item
    await page.getByRole('button', { name: 'Add New Jewellery' }).click();
    const dialog = page.getByRole('dialog', { name: 'Register New Jewellery Piece' });
    await expect(dialog).toBeVisible();

    // Switch to "+ New Design"
    await dialog.getByRole('button', { name: '+ New Design' }).click();

    // Fill Product Catalogue Details
    await dialog.locator('input[placeholder="e.g. BR-NK-2026"]').fill(TEST_SKU);
    await dialog.locator('input[placeholder="e.g. Temple Gold Choker"]').fill(TEST_NAME);

    // Fill Physical Piece Details
    await dialog.locator('input[placeholder="e.g. TG-9901"]').fill(TEST_TAG);
    await dialog.locator('input[placeholder="e.g. AB12CD (6 chars)"]').fill('E2E901');

    // Enter Weights and verify automatic net weight calculation
    const grossInput = dialog.locator('input[placeholder="0.000"]').nth(0);
    const stoneInput = dialog.locator('input[placeholder="0.000"]').nth(1);
    const netInput = dialog.locator('input[placeholder="0.000"]').nth(2);

    await grossInput.fill('45.500');
    await stoneInput.fill('1.500');

    // Client-side automatic net weight calculation: 45.500 - 1.500 = 44.000
    await expect(netInput).toHaveValue('44.000');

    // Enter Pricing & Wholesale Cost
    await dialog.locator('input[placeholder="e.g. 120000"]').fill('240000.00');
    await dialog.locator('input[placeholder="e.g. 145000"]').fill('295000.00');

    // Submit Registration
    await dialog.getByRole('button', { name: 'Register & Inward to Live Inventory' }).click();

    // Verify Success notification banner
    await expect(page.locator('div:has-text("registered and inwarded to showroom stock")').first()).toBeVisible({
      timeout: 15000,
    });

    // 4. Verify Persistence after page reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify that the newly registered item is displayed in the showroom inventory
    await expect(page.getByText(TEST_TAG)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(TEST_NAME)).toBeVisible();
    await expect(page.getByText('44.000 g')).toBeVisible();
  });

  test('Workflow 2: Search, category filtering, and reset filters', async ({ page }) => {
    await loginAs(page, 'owner@suvarna.test');
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    // Search by Tag Code
    const searchInput = page.locator('input[placeholder*="Search tag code"]');
    await searchInput.fill(TEST_TAG);
    await expect(page.getByText(TEST_TAG)).toBeVisible();

    // Search by SKU
    await searchInput.fill(TEST_SKU);
    await expect(page.getByText(TEST_NAME)).toBeVisible();

    // Search for non-existent item
    await searchInput.fill('NON-EXISTENT-XYZ-999');
    await expect(page.getByText('No Jewellery Pieces Found')).toBeVisible();

    // Reset filters
    await page.click('button:has-text("Reset Filters")');
    await expect(page.getByText(TEST_TAG)).toBeVisible();

    // Filter by Purity: 22K (should show our piece)
    const puritySelect = page.locator('select:has-text("Purity:")');
    await puritySelect.selectOption('22K');
    await expect(page.getByText(TEST_TAG)).toBeVisible();

    // Filter by Purity: 14K (should not show our 22K piece)
    await puritySelect.selectOption('14K');
    await expect(page.getByText(TEST_TAG)).not.toBeVisible();

    // Reset back
    await puritySelect.selectOption('All');
    await expect(page.getByText(TEST_TAG)).toBeVisible();
  });

  test('Workflow 3: Ornament Details, Stock Movement Ledger, and Inter-Branch Transfer', async ({ page }) => {
    await loginAs(page, 'owner@suvarna.test');
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    // Filter to our test item
    const searchInput = page.locator('input[placeholder*="Search tag code"]');
    await searchInput.fill(TEST_TAG);
    await expect(page.getByText(TEST_TAG)).toBeVisible();

    // Open Details & Ledger
    await page.click('button:has-text("Details & Ledger")');

    const detailDialog = page.getByRole('dialog');
    await expect(detailDialog).toBeVisible();

    // Verify piece specifications
    await expect(detailDialog.getByText(`TAG: ${TEST_TAG}`)).toBeVisible();
    await expect(detailDialog.getByText('HUID: E2E901')).toBeVisible();
    await expect(detailDialog.getByText('45.500 g')).toBeVisible();
    await expect(detailDialog.getByText('1.500 g')).toBeVisible();
    await expect(detailDialog.getByText('44.000 g')).toBeVisible();

    // Verify wholesale cost is visible to Store Owner
    await expect(detailDialog.getByText('Wholesale Cost (Confidential)')).toBeVisible();
    await expect(detailDialog.getByText('₹2,40,000.00')).toBeVisible();

    // Verify Initial INWARD movement ledger entry
    await expect(detailDialog.getByText('INWARD', { exact: true })).toBeVisible();
    await expect(detailDialog.getByText('Received into Fort Main Showroom')).toBeVisible();

    // Click "Inter-Branch Transfer" button inside details
    await detailDialog.getByRole('button', { name: 'Inter-Branch Transfer' }).click();

    // Transfer Modal opens
    const transferDialog = page.getByRole('dialog');
    await expect(transferDialog).toBeVisible();
    await expect(transferDialog.getByText(TEST_TAG)).toBeVisible();

    // Select Destination: Navi Mumbai Studio
    const destSelect = transferDialog.locator('select');
    await destSelect.selectOption({ label: 'Navi Mumbai Studio (Navi Mumbai)' });

    // Fill Reason
    await transferDialog.locator('textarea').fill('Stock rebalancing for E2E festival exhibition (Challan #E2E-TR-01)');

    // Submit Transfer
    await transferDialog.getByRole('button', { name: 'Confirm Stock Transfer' }).click();

    // Verify Transfer Success notification banner
    await expect(page.locator('div:has-text("Successfully transferred")').first()).toBeVisible({ timeout: 15000 });

    // Verify item moved out of Fort showroom view
    await page.reload();
    await page.waitForLoadState('networkidle');
    await searchInput.fill(TEST_TAG);

    // Since default view is Fort Main Showroom, item is no longer at Fort
    await expect(page.getByText('No Jewellery Pieces Found')).toBeVisible();

    // Enable "Include all organization showrooms"
    await page.click('input[type="checkbox"]');
    await expect(page.getByText(TEST_TAG)).toBeVisible();
    await expect(page.getByText('Navi Mumbai Studio')).toBeVisible();

    // Open Details again and verify 2 ledger entries: INWARD and TRANSFER
    await page.click('button:has-text("Details & Ledger")');
    const updatedDialog = page.getByRole('dialog');
    await expect(updatedDialog).toBeVisible();

    await expect(updatedDialog.getByText('INWARD', { exact: true })).toBeVisible();
    await expect(updatedDialog.getByText('TRANSFER', { exact: true })).toBeVisible();
    await expect(updatedDialog.getByText('Transfer: Fort Main Showroom → Navi Mumbai Studio')).toBeVisible();
    await expect(updatedDialog.getByText('Challan #E2E-TR-01')).toBeVisible();

    await updatedDialog.getByRole('button', { name: 'Close Details' }).click();
  });

  test('Workflow 4: Input validation and rejection of invalid data', async ({ page }) => {
    await loginAs(page, 'owner@suvarna.test');
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Add New Jewellery' }).click();
    const dialog = page.getByRole('dialog', { name: 'Register New Jewellery Piece' });
    await expect(dialog).toBeVisible();

    // Attempt submission with empty Tag Code
    await dialog.getByRole('button', { name: 'Register & Inward to Live Inventory' }).click();
    await expect(dialog.getByText('A unique Tag Code is required for every jewellery piece.')).toBeVisible();

    // Enter Tag Code and invalid gross weight <= 0
    await dialog.locator('input[placeholder="e.g. TG-9901"]').fill('INVALID-TAG');
    const grossInput = dialog.locator('input[placeholder="0.000"]').nth(0);
    await grossInput.fill('0.000');
    await dialog.getByRole('button', { name: 'Register & Inward to Live Inventory' }).click();

    await expect(dialog.getByText('Gross weight must be strictly greater than zero.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Workflow 5: Role-based permissions & wholesale cost redaction for SALES_STAFF', async ({ page }) => {
    // Sign In as SALES_STAFF
    await loginAs(page, 'sales@suvarna.test');

    // Navigate to inventory
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    // 1. Verify "Add New Jewellery" button is NOT rendered for Sales Staff
    await expect(page.locator('button:has-text("Add New Jewellery")')).not.toBeVisible();

    // 2. Verify "Inter-Branch Transfer" action button is NOT rendered
    await expect(page.locator('button[title="Inter-Branch Transfer"]')).not.toBeVisible();

    // 3. Verify Wholesale Cost is NOT rendered on cards or tables
    await expect(page.locator('text=Cost:')).not.toBeVisible();
    await expect(page.locator('th:has-text("Cost")')).not.toBeVisible();

    // 4. Open any available item's details and check cost redaction
    const detailButtons = page.locator('button:has-text("Details & Ledger")');
    if ((await detailButtons.count()) > 0) {
      await detailButtons.first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Confirms confidential wholesale cost is replaced with RBAC protection notice
      await expect(dialog.getByText('Cost protected by RBAC')).toBeVisible();
      await expect(dialog.getByText('Wholesale Cost (Confidential)')).not.toBeVisible();

      // Confirms transfer button is absent in modal for sales staff
      await expect(dialog.locator('button:has-text("Inter-Branch Transfer")')).not.toBeVisible();

      await dialog.getByRole('button', { name: 'Close Details' }).click();
    }
  });
});
