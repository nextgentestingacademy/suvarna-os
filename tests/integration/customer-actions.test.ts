import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import {
  createCustomerAction,
  updateCustomerAction,
  getCustomerByIdAction,
  listCustomersAction,
  checkCustomerDuplicatesAction,
  logCustomerInteractionAction,
} from '@/app/actions/customer';

describe('Suvarna Phase 2 — Secure Customer Server Actions Integration Tests', () => {
  const DEV_PASSWORD = 'SuvarnaDev2026!';

  let suvarnaOrg: any;
  let fortBranch: any;

  let ownerHeaders: Headers;
  let salesHeaders: Headers;
  let kalyanOwnerHeaders: Headers;

  const createdActionCustomerIds: string[] = [];

  async function getSessionHeaders(email: string): Promise<Headers> {
    const signInRes = await auth.api.signInEmail({
      body: { email, password: DEV_PASSWORD },
      asResponse: true,
    });
    const cookie = signInRes.headers.get('set-cookie');
    if (!cookie) {
      throw new Error(`Failed to sign in as ${email}`);
    }
    return new Headers({ cookie });
  }

  beforeAll(async () => {
    suvarnaOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'suvarna-mumbai' } });
    fortBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: suvarnaOrg.id, code: 'FORT' } },
    });

    await prisma.customerInteraction.deleteMany({
      where: { customer: { name: 'Deepika Padukone' } },
    });
    await prisma.customer.deleteMany({
      where: { name: 'Deepika Padukone' },
    });

    ownerHeaders = await getSessionHeaders('owner@suvarna.test');
    salesHeaders = await getSessionHeaders('sales@suvarna.test');
    kalyanOwnerHeaders = await getSessionHeaders('owner@kalyan.test');
  });

  afterAll(async () => {
    if (createdActionCustomerIds.length > 0) {
      await prisma.customerInteraction.deleteMany({
        where: { customerId: { in: createdActionCustomerIds } },
      });
      await prisma.customer.deleteMany({
        where: { id: { in: createdActionCustomerIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          entityType: { in: ['Customer', 'CustomerInteraction'] },
          entityId: { in: createdActionCustomerIds },
        },
      });
    }
  });

  it('rejects unauthenticated invocation without session cookie', async () => {
    const res = await createCustomerAction(
      {
        name: 'Unauth User',
        phone: '9820999000',
      },
      { headers: new Headers() } // No cookies
    );

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Authentication required/);
    expect(res.code).toBe('UNAUTHENTICATED');
  });

  it('allows SALES_STAFF to register a customer profile via server action', async () => {
    const res = await createCustomerAction(
      {
        name: 'Deepika Padukone',
        phone: '9820777888',
        segment: 'BRIDAL',
        city: 'Mumbai',
        notes: 'Enquired about heritage jadau necklaces',
      },
      { headers: salesHeaders }
    );

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data?.name).toBe('Deepika Padukone');
    expect(res.data?.phone).toBe('9820777888');
    expect(res.data?.customerCode).toMatch(/^CUST-\d+/);
    if (res.data?.id) createdActionCustomerIds.push(res.data.id);
  });

  it('checks for duplicates and identifies existing phone matches', async () => {
    const checkRes = await checkCustomerDuplicatesAction(
      '9820777888',
      'Deepika',
      undefined,
      { headers: salesHeaders }
    );

    expect(checkRes.success).toBe(true);
    expect(checkRes.data?.hasDuplicates).toBe(true);
    expect(checkRes.data?.phoneMatches[0].name).toBe('Deepika Padukone');
  });

  it('allows updating an existing customer via server action', async () => {
    const customerId = createdActionCustomerIds[0];
    const updateRes = await updateCustomerAction(
      customerId,
      {
        notes: 'Updated notes: Confirmed bridal consultation on Dhanteras',
        segment: 'VIP',
      },
      { headers: ownerHeaders }
    );

    expect(updateRes.success).toBe(true);
    expect(updateRes.data?.segment).toBe('VIP');
    expect(updateRes.data?.notes).toContain('Dhanteras');
  });

  it('logs a customer interaction note via server action', async () => {
    const customerId = createdActionCustomerIds[0];
    const intRes = await logCustomerInteractionAction(
      customerId,
      {
        channel: 'WHATSAPP',
        notes: 'Sent PDF catalog of antique choker designs on WhatsApp.',
        followUpDate: '2026-11-05',
      },
      { headers: salesHeaders }
    );

    expect(intRes.success).toBe(true);
    expect(intRes.data?.channel).toBe('WHATSAPP');
    expect(intRes.data?.notes).toContain('PDF catalog');
  });

  it('fetches complete customer profile with honest empty extension points', async () => {
    const customerId = createdActionCustomerIds[0];
    const profileRes = await getCustomerByIdAction(customerId, { headers: salesHeaders });

    expect(profileRes.success).toBe(true);
    expect(profileRes.data?.name).toBe('Deepika Padukone');
    expect(profileRes.data?.interactions.length).toBeGreaterThanOrEqual(1);
    expect(profileRes.data?.salesInvoices).toEqual([]);
    expect(profileRes.data?.goldPurchases).toEqual([]);
    expect(profileRes.data?.outstandingBalance).toBe('0.00');
  });

  it('rejects cross-tenant getCustomerByIdAction from another organization', async () => {
    const customerId = createdActionCustomerIds[0];
    // Kalyan owner attempts to inspect Suvarna customer profile
    const profileRes = await getCustomerByIdAction(customerId, { headers: kalyanOwnerHeaders });

    expect(profileRes.success).toBe(false);
    expect(profileRes.code).toBe('NOT_FOUND');
  });

  it('lists and paginates customers scoped strictly to the caller tenant', async () => {
    const listRes = await listCustomersAction(
      { searchQuery: 'Deepika' },
      1,
      20,
      { headers: salesHeaders }
    );

    expect(listRes.success).toBe(true);
    expect(listRes.data?.customers.length).toBe(1);
    expect(listRes.data?.customers[0].name).toBe('Deepika Padukone');

    // Kalyan owner listing with same search finds 0
    const kalyanListRes = await listCustomersAction(
      { searchQuery: 'Deepika' },
      1,
      20,
      { headers: kalyanOwnerHeaders }
    );

    expect(kalyanListRes.success).toBe(true);
    expect(kalyanListRes.data?.customers.length).toBe(0);
  });
});
