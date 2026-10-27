import { test, expect, Page } from '@playwright/test';

const DEV_PASSWORD = 'SuvarnaDev2026!';

test.describe.configure({ mode: 'serial' });

test.describe('Suvarna Phase 4E-2 — Operational Reports Workspace Browser Verification', () => {
  async function loginAs(page: Page, email: string) {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.waitForSelector('form[data-hydrated="true"]', { timeout: 30000 });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', DEV_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 60000 });
  }

  test('Journey 1: Owner logs in and verifies Reports Workspace loads with live operational metrics', async ({ page }) => {
    await loginAs(page, 'owner@suvarna.test');

    // Navigate to Reports Workspace
    await page.goto('/reports');
    await expect(page).toHaveURL(/.*reports/);

    // Verify Workspace Header & Badge
    await expect(page.getByText('Operational Reports Workspace')).toBeVisible();
    await expect(page.getByText('LIVE REGISTERS', { exact: true })).toBeVisible();

    // Verify 7 Tab Triggers are rendered
    const salesTab = page.getByRole('button', { name: 'Sales Summary' });
    const paymentsTab = page.getByRole('button', { name: 'Payment Collections' });
    const gstTab = page.getByRole('button', { name: 'GST Outward Summary' });
    const inventoryTab = page.getByRole('button', { name: 'Inventory Valuation' });
    const trialBalanceTab = page.getByRole('button', { name: 'Trial Balance' });
    const pnlTab = page.getByRole('button', { name: 'Profit & Loss' });
    const balanceSheetTab = page.getByRole('button', { name: 'Balance Sheet' });

    await expect(salesTab).toBeVisible();
    await expect(paymentsTab).toBeVisible();
    await expect(gstTab).toBeVisible();
    await expect(inventoryTab).toBeVisible();
    await expect(trialBalanceTab).toBeVisible();
    await expect(pnlTab).toBeVisible();
    await expect(balanceSheetTab).toBeVisible();

    // Default tab is Sales Summary: Verify KPI Cards
    await expect(page.getByText('Gross Invoice Sales').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Taxable Turnover').first()).toBeVisible();
    await expect(page.getByText('Total GST Collected').first()).toBeVisible();
    await expect(page.getByText('Customer Collections').first()).toBeVisible();

    // Verify Sales Breakdown Tables
    await expect(page.getByText('Sales Performance by Design Category')).toBeVisible();
    await expect(page.getByText('Day-End Sales Register')).toBeVisible();
  });

  test('Journey 2: Tab navigation across all 4 operational reports', async ({ page }) => {
    await loginAs(page, 'owner@suvarna.test');
    await page.goto('/reports');

    // 1. Switch to Payment Collections
    await page.getByRole('button', { name: 'Payment Collections' }).click();
    await expect(page.getByText('Total Collections').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Cash Tender Received').first()).toBeVisible();
    await expect(page.getByText('Cumulative Outstanding Receivables (All Time)').first()).toBeVisible();
    await expect(page.getByText('Customer Collections Register')).toBeVisible();
    await expect(page.getByText('Bank Settlements & Merchant Clearing Realization')).toBeVisible();
    await expect(page.getByText('Accounting Invariant:')).toBeVisible();

    // 2. Switch to GST Outward Summary
    await page.getByRole('button', { name: 'GST Outward Summary' }).click();
    await expect(page.getByText('Total GST Liability').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('HSN Tax Rate Schedule')).toBeVisible();
    await expect(page.getByText('Outward Supplies Tax Register')).toBeVisible();

    // 3. Switch to Inventory Valuation
    await page.getByRole('button', { name: 'Inventory Valuation' }).click();
    await expect(page.getByText('Available Showroom Stock').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Total Net Metal Weight').first()).toBeVisible();
    await expect(page.getByText('Recorded Wholesale Cost').first()).toBeVisible();
    await expect(page.getByText('Not Recorded').first()).toBeVisible();
    await expect(page.getByText('Available Physical Ornaments Stock Register')).toBeVisible();
  });

  test('Journey 3: Date presets and showroom filtering operate correctly', async ({ page }) => {
    await loginAs(page, 'owner@suvarna.test');
    await page.goto('/reports');

    // Filter by FY 2026-27
    const presetSelect = page.locator('select[aria-label="Select Date Range Preset"]');
    await expect(presetSelect).toBeVisible();
    await presetSelect.selectOption('FY_2026_27');

    // Verify update
    await expect(page.getByText('Gross Invoice Sales')).toBeVisible({ timeout: 20000 });

    // Filter by Showroom
    const showroomSelect = page.locator('select[aria-label="Filter by Showroom Branch"]');
    await expect(showroomSelect).toBeVisible();
    await showroomSelect.selectOption({ label: 'Navi Mumbai Studio (VASHI)' });

    // Navi Mumbai Studio has 0 completed sales, verify zero state
    await expect(page.getByText('No sales recorded for the selected criteria.').first()).toBeVisible({ timeout: 20000 });
  });

  test('Journey 4: Unauthorized role (SALES_STAFF) is blocked by AccessDeniedModule', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');

    // Attempt to access /reports
    await page.goto('/reports');

    // Verify Access Denied Module renders
    await expect(page.getByText('Showroom Analytics & Financial Reports')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Access Restricted')).toBeVisible();
    await expect(page.getByText('ACCOUNTS_VIEW')).toBeVisible();
    await expect(page.getByText('Operational Reports Workspace')).not.toBeVisible();
  });

  test('Journey 5: General Ledger financial reports navigation (Trial Balance, P&L, Balance Sheet)', async ({ page }) => {
    await loginAs(page, 'owner@suvarna.test');
    await page.goto('/reports');

    // 1. Switch to Trial Balance
    await page.getByRole('button', { name: 'Trial Balance' }).click();
    await expect(page.getByText('Trial Balance is Balanced').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Total Debit Balances').first()).toBeVisible();
    await expect(page.getByText('Total Credit Balances').first()).toBeVisible();
    await expect(page.getByText('General Ledger Trial Balance Register').first()).toBeVisible();

    // 2. Switch to Profit & Loss
    await page.getByRole('button', { name: 'Profit & Loss' }).click();
    await expect(page.getByText('Statement of Profit and Loss').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Net Operating Revenue').first()).toBeVisible();
    await expect(page.getByText('Cost of Goods Sold (COGS)').first()).toBeVisible();
    await expect(page.getByText('Operating & Administrative Expenses').first()).toBeVisible();

    // 3. Switch to Balance Sheet
    await page.getByRole('button', { name: 'Balance Sheet' }).click();
    await expect(page.getByText('Balance Sheet Equation in Equilibrium').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Total Assets').first()).toBeVisible();
    await expect(page.getByText('Total Liabilities').first()).toBeVisible();
    await expect(page.getByText('Total Equity').first()).toBeVisible();
    await expect(page.getByText('Assets (Application of Funds)').first()).toBeVisible();
  });
});
