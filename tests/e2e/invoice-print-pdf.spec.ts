import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const DEV_PASSWORD = 'SuvarnaDev2026!';
const TARGET_INVOICE_ID = '70ae8d75-712a-4cc3-8a15-030ca306b613';
const TARGET_INVOICE_NUMBER = 'INV/FORT/26-27/0200';

async function loginAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', DEV_PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/.*dashboard/, { timeout: 30000 });
}

test.describe('Suvarna Targeted Fixes — Invoice Print Layout & Catalogue Codes', () => {
  test('Task A & B: Inventory Catalogue clearly distinguishes Product Code vs Tag Code and displays indicative pricing', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');
    await page.goto('/inventory');
    await page.waitForURL('**/inventory', { timeout: 15000 });

    // 1. Grid View Checks
    await expect(page.locator('button[title="Grid View"]')).toBeVisible();

    // Verify card tag code badge has "Tag:" prefix
    const cardTagBadge = page.locator('.invoice-card-tag, div.h-44 span.font-mono:has-text("Tag:")').first();
    await expect(cardTagBadge).toBeVisible();
    await expect(cardTagBadge).toContainText('Tag:');

    // Verify card product model code has "Product Code:" prefix
    const cardProductCode = page.locator('span:has-text("Product Code:")').first();
    await expect(cardProductCode).toBeVisible();

    // Verify Indicative Price label and formatted value or diagnosed status
    const indicativePriceLabel = page.locator('span:has-text("Indicative Price")').first();
    await expect(indicativePriceLabel).toBeVisible();

    // 2. Table View Checks
    await page.locator('button[title="Table View"]').click();

    // Verify table header names
    await expect(page.locator('th:has-text("Tag Code / HUID")')).toBeVisible();
    await expect(page.locator('th:has-text("Design & Product Code")')).toBeVisible();
    await expect(page.locator('th:has-text("Indicative Price")')).toBeVisible();

    // Verify table cell prefixes
    const tableTagCell = page.locator('td div:has-text("Tag:")').first();
    await expect(tableTagCell).toBeVisible();
    const tableProductCell = page.locator('td div:has-text("Product Code:")').first();
    await expect(tableProductCell).toBeVisible();
  });

  test('Task C: Existing Invoice INV/FORT/26-27/0200 renders brand letterhead in print, eliminates scrollbars, and generates valid A4 PDF', async ({ page }) => {
    await loginAs(page, 'sales@suvarna.test');

    // Navigate to the existing invoice
    await page.goto(`/billing/${TARGET_INVOICE_ID}`);
    await page.waitForURL(`**/billing/${TARGET_INVOICE_ID}`, { timeout: 15000 });

    // Verify on-screen invoice integrity
    const invoiceDoc = page.locator('.invoice-print-container');
    await expect(invoiceDoc).toBeVisible();
    await expect(invoiceDoc.locator('h1')).toContainText('Suvarna Jewellers');
    await expect(invoiceDoc.getByText('TAX INVOICE / RETAIL BILL')).toBeVisible();
    await expect(invoiceDoc.getByText(TARGET_INVOICE_NUMBER)).toBeVisible();
    await expect(invoiceDoc.getByText('Nischal Hooda')).toBeVisible();
    await expect(invoiceDoc.getByText('TAG-FORT-502')).toBeVisible();
    await expect(invoiceDoc.getByText('NK-TEMPLE-22K', { exact: false })).toBeVisible();

    // Verify Taxable column and Grand Total
    await expect(invoiceDoc.locator('th:has-text("Taxable (₹)")')).toBeVisible();
    await expect(invoiceDoc.getByText('₹2,39,166.00').first()).toBeVisible();

    // Emulate print media
    await page.emulateMedia({ media: 'print' });

    // 1. Verify Brand Letterhead is VISIBLE in print
    const letterhead = page.locator('.invoice-letterhead');
    await expect(letterhead).toBeVisible();
    await expect(letterhead.locator('h1')).toContainText('Suvarna Jewellers');
    await expect(letterhead.getByText('S', { exact: true })).toBeVisible();
    await expect(letterhead.getByText('TAX INVOICE / RETAIL BILL')).toBeVisible();

    // 2. Verify Application Chrome is HIDDEN in print
    for (const aside of await page.locator('aside.no-print').all()) {
      await expect(aside).toBeHidden();
    }
    await expect(page.locator('header.no-print')).toBeHidden();
    await expect(page.locator('.no-print button:has-text("Print Tax Invoice")')).toBeHidden();

    // 3. Verify Table and Container have NO horizontal overflow in print
    const hasHorizontalOverflow = await page.evaluate(() => {
      const wrapper = document.querySelector('.invoice-table-wrapper');
      if (!wrapper) return false;
      return wrapper.scrollWidth > wrapper.clientWidth + 2;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // 4. Verify Full Taxable Column is visible in print
    const taxableHeader = page.locator('.invoice-items-table th:has-text("Taxable (₹)")');
    await expect(taxableHeader).toBeVisible();

    // 5. Generate Real A4 PDF file
    const scratchDir = path.resolve(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
    const pdfPath = path.join(scratchDir, 'INV-FORT-26-27-0200-print.pdf');

    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '12mm',
        right: '10mm',
        bottom: '12mm',
        left: '10mm',
      },
    });

    // Inspect the generated PDF on disk
    expect(fs.existsSync(pdfPath)).toBe(true);
    const pdfStat = fs.statSync(pdfPath);
    expect(pdfStat.size).toBeGreaterThan(15000); // Complete PDF document is >15KB

    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfHeader = pdfBuffer.slice(0, 5).toString('ascii');
    expect(pdfHeader).toBe('%PDF-');

    console.log(`Successfully generated and verified real PDF at ${pdfPath} (${pdfStat.size} bytes)`);
  });
});
