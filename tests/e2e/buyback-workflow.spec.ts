import { test, expect, Page } from '@playwright/test';
import { prisma } from '@/lib/db';

const DEV_PASSWORD = 'SuvarnaDev2026!';

test.describe.configure({ mode: 'serial' });

test.describe('E2E: Metal Buying Rates & Gold Buyback Workflow', () => {
  const runId = Date.now().toString().slice(-5);
  const TEST_SELLER_NAME = `Meera Walkin ${runId}`;
  const TEST_PHONE = `99${Math.floor(10000000 + Math.random() * 90000000)}`;

  let suvarnaOrgId: string;
  let fortBranchId: string;
  const createdVoucherNumbers: string[] = [];
  const createdRateIds: string[] = [];

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
    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'suvarna-mumbai' },
      include: { branches: true },
    });
    suvarnaOrgId = org.id;
    const fort = org.branches.find((b) => b.code === 'FORT');
    fortBranchId = fort ? fort.id : org.branches[0].id;
  });

  test.afterAll(async () => {
    if (createdVoucherNumbers.length > 0) {
      const vouchers = await prisma.buybackVoucher.findMany({
        where: { voucherNumber: { in: createdVoucherNumbers } },
      });
      const voucherIds = vouchers.map((v) => v.id);
      const ornamentIds = vouchers.map((v) => v.lotOrnamentId).filter(Boolean) as string[];
      const journalIds = vouchers.map((v) => v.journalEntryId).filter(Boolean) as string[];

      await prisma.buybackVoucher.deleteMany({ where: { id: { in: voucherIds } } });
      if (journalIds.length > 0) {
        await prisma.journalLine.deleteMany({ where: { journalEntryId: { in: journalIds } } });
        await prisma.journalEntry.deleteMany({ where: { id: { in: journalIds } } });
      }
      if (ornamentIds.length > 0) {
        await prisma.stockMovement.deleteMany({ where: { ornamentId: { in: ornamentIds } } });
        await prisma.ornament.deleteMany({ where: { id: { in: ornamentIds } } });
      }
    }

    if (createdRateIds.length > 0) {
      await prisma.metalRate.deleteMany({ where: { id: { in: createdRateIds } } });
    }
  });

  test('Stage 1: Navigate to Gold Purchase and configure independent 22K buying rate', async ({ page }) => {
    await loginAs(page, 'manager@suvarna.test');

    // 1. Navigate to Purchases via sidebar
    await page.click('a[href="/purchases"]');
    await expect(page).toHaveURL(/.*purchases/);
    await expect(page.getByText('Gold Purchase & Buyback Counter')).toBeVisible();

    // 2. Switch to Rates tab
    await page.getByRole('button', { name: 'Buying & Selling Rates' }).click();
    await expect(page.getByText('Active Showroom Bullion Rates')).toBeVisible();

    // 3. Fill Rate Update Form
    await page.fill('input[placeholder="e.g. 11800.00"]', '11650.00');
    await page.fill('input[placeholder="e.g. Morning market baseline update"]', `E2E Playwright Rate ${runId}`);
    await page.getByRole('button', { name: 'Save Rate & Audit Log' }).click();

    // 4. Verify confirmation banner
    await expect(page.getByText(/Successfully updated BUYING rate for GOLD \(22K\) to ₹11650.00\/g/)).toBeVisible();

    // Record rate ID for cleanup
    const latestRate = await prisma.metalRate.findFirst({
      where: { organizationId: suvarnaOrgId, purity: '22K', rateType: 'BUYING' },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (latestRate) createdRateIds.push(latestRate.id);
  });

  test('Stage 2: Evaluate old gold, preview valuation and post buyback voucher', async ({ page }) => {
    await loginAs(page, 'manager@suvarna.test');
    await page.goto('/purchases');

    // 1. Ensure on Buyback Counter tab
    await page.getByRole('button', { name: 'Buyback Counter' }).click();

    // 2. Fill Customer Details
    await page.fill('input[placeholder="e.g. Ramesh Chandra Verma"]', TEST_SELLER_NAME);
    await page.fill('input[placeholder="10-digit mobile number"]', TEST_PHONE);

    // 3. Fill Weights (Gross 15.000, Stone 1.000 -> Net 14.000)
    await page.fill('input[placeholder="0.000"] >> nth=0', '15.000');
    await page.fill('input[placeholder="0.000"] >> nth=1', '1.000');

    // 4. Fill Disclosed Deduction (Melting loss ₹1,000.00)
    await page.fill('input[placeholder="0.00"] >> nth=0', '1000.00');
    await page.fill('input[placeholder="e.g. Melting loss 1.5% or dirt removal"]', 'Assay melt sampling deduction');

    // 5. Verify Valuation Preview updates dynamically:
    // Net: 14.000g @ ₹11,650.00/g = Gross ₹1,63,100.00 - ₹1,000.00 = Net Payable ₹1,62,100.00
    await expect(page.getByText('₹1,62,100.00')).toBeVisible();

    // 6. Confirm & Post Voucher
    await page.getByRole('button', { name: 'Confirm & Post Buyback Voucher' }).click();

    // 7. Verify Success Banner
    await expect(page.getByText(/Buyback Voucher #BB\/FORT\/.* Posted Successfully!/)).toBeVisible();

    // Find created voucher in database to register for cleanup
    const created = await prisma.buybackVoucher.findFirst({
      where: { organizationId: suvarnaOrgId, customerName: TEST_SELLER_NAME },
      orderBy: { createdAt: 'desc' },
    });
    expect(created).toBeDefined();
    if (created) createdVoucherNumbers.push(created.voucherNumber);
  });

  test('Stage 3: Verify buyback voucher in register and view voucher details', async ({ page }) => {
    await loginAs(page, 'manager@suvarna.test');
    await page.goto('/purchases');

    // 1. Switch to Vouchers Register
    await page.getByRole('button', { name: 'Buyback Vouchers' }).click();
    await expect(page.getByText('Buyback Vouchers Register')).toBeVisible();

    // 2. Verify seller is listed in table
    await expect(page.getByText(TEST_SELLER_NAME)).toBeVisible();

    // 3. Click View on first voucher
    await page.getByRole('button', { name: 'View' }).first().click();

    // 4. Verify Voucher Modal content
    await expect(page.getByText('Official Buyback Receipt')).toBeVisible();
    await expect(page.locator('.fixed').getByText(TEST_SELLER_NAME)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print Voucher' })).toBeVisible();

    // Close modal
    await page.getByRole('button', { name: 'Close' }).click();
  });
});
