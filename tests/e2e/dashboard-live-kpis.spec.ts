import { test, expect, Page } from '@playwright/test';

const DEV_PASSWORD = 'SuvarnaDev2026!';

test.describe.configure({ mode: 'serial' });

test.describe('Suvarna Phase 4E-1 — Live Dashboard KPIs Browser Verification', () => {
  async function loginAs(page: Page, email: string) {
    await page.context().clearCookies();
    await page.goto('/login');
    await page.waitForSelector('form[data-hydrated="true"]', { timeout: 30000 });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', DEV_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 60000 });
  }

  test('Journey 1: Owner logs in and verifies live dashboard KPIs replace mock data', async ({ page }) => {
    await loginAs(page, 'owner@suvarna.test');

    // Verify Page Header
    await expect(page.getByText('Showroom Intelligence')).toBeVisible();
    await expect(page.getByText('LIVE DATA', { exact: true })).toBeVisible();
    await expect(page.getByText('DEMO DATA', { exact: true })).not.toBeVisible();
    await expect(page.locator('h1')).toContainText('Overview');

    // Verify Indicative Bullion Board
    await expect(page.getByText('24K GOLD · 999')).toBeVisible();
    await expect(page.getByText('22K GOLD · 916')).toBeVisible();
    await expect(page.getByText('SILVER · 999')).toBeVisible();

    // Verify KPI Cards are rendered with live data, not mock constants
    await expect(page.getByText('Gross Sales (MTD)')).toBeVisible();
    await expect(page.getByText('Outstanding Dues')).toBeVisible();
    await expect(page.getByText('Registered Customers')).toBeVisible();
    await expect(page.getByText('Active Catalogue')).toBeVisible();

    // Mock constants should not exist
    await expect(page.getByText('₹8,42,000')).not.toBeVisible();
    await expect(page.getByText('126 invoices raised in demo period')).not.toBeVisible();

    // Wait for live data to load in Recent Invoices table
    await expect(page.getByRole('heading', { name: 'Recent Invoices' })).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 20000 });
    const rowCount = await page.locator('table tbody tr').count();
    expect(rowCount).toBeGreaterThan(0);

    // Verify live Low Stock Watchlist has loaded items
    await expect(page.getByRole('heading', { name: 'Low Stock Watchlist' })).toBeVisible();
    await expect(page.locator('text=in stock').first()).toBeVisible({ timeout: 20000 });
  });

  test('Journey 2: Branch switching updates live KPIs and renders empty states correctly', async ({ page }) => {
    await loginAs(page, 'owner@suvarna.test');

    // Ensure Fort Main Showroom data is loaded first
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 20000 });

    // Open branch switcher in top bar
    const branchBtn = page.locator('header button:has-text("Active Showroom")');
    await branchBtn.click();

    // Click Navi Mumbai Studio (Vashi)
    const vashiOption = page.locator('div:has-text("Switch Showroom") button:has-text("Navi Mumbai Studio")').first();
    await vashiOption.click();

    // Verify title reflects Navi Mumbai Studio
    await expect(page.locator('h1')).toContainText('Navi Mumbai Studio Overview');

    // Verify sensible zero/empty state for Vashi
    await expect(page.getByText('₹0.00').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('0 completed invoices raised this month')).toBeVisible();
    await expect(page.getByText('No completed invoices recorded for this showroom yet.')).toBeVisible();
    await expect(page.getByText('0 designs')).toBeVisible();

    // Switch back to Fort Main Showroom
    const vashiBtn = page.locator('header button:has-text("Active Showroom")');
    await vashiBtn.click();
    const fortOption = page.locator('div:has-text("Switch Showroom") button:has-text("Fort Main Showroom")').first();
    await fortOption.click();

    // Verify Fort Main Showroom data restores
    await expect(page.locator('h1')).toContainText('Fort Main Showroom Overview');
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 20000 });
  });

  test('Journey 3: Multi-tenant isolation prevents cross-tenant data leakage', async ({ page }) => {
    // Login as owner of Kalyan Test Jewellers
    await loginAs(page, 'owner@kalyan.test');

    await expect(page.locator('h1')).toContainText('Thane Store Overview');

    // Suvarna's Fort branch invoices must not appear in Kalyan's recent invoices
    await expect(page.getByText('INV-E2E-RECON-')).not.toBeVisible();
    await expect(page.getByText('Fort Main Showroom')).not.toBeVisible();
  });
});
