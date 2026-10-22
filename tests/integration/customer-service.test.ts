import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { resolveSecurityContext } from '@/lib/security-context';
import {
  createCustomer,
  updateCustomer,
  getCustomerById,
  listCustomers,
  checkCustomerDuplicates,
  logCustomerInteraction,
  CustomerValidationError,
  CustomerNotFoundError,
} from '@/lib/customer';
import { SecurityContext, AuthorizationError } from '@/types/security';

describe('Suvarna Phase 2 — Customer Management & CRM Service Integration Tests', () => {
  let suvarnaOrg: any;
  let kalyanOrg: any;
  let fortBranch: any;
  let vashiBranch: any;
  let thaneBranch: any;

  let ownerCtx: SecurityContext;
  let managerCtx: SecurityContext;
  let accountantCtx: SecurityContext;
  let salesCtx: SecurityContext;
  let kalyanOwnerCtx: SecurityContext;

  const createdCustomerIds: string[] = [];

  beforeAll(async () => {
    suvarnaOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'suvarna-mumbai' } });
    kalyanOrg = await prisma.organization.findUniqueOrThrow({ where: { slug: 'kalyan-test' } });

    fortBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: suvarnaOrg.id, code: 'FORT' } },
    });
    vashiBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: suvarnaOrg.id, code: 'VASHI' } },
    });
    thaneBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: kalyanOrg.id, code: 'THANE' } },
    });

    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@suvarna.test' } });
    const managerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'manager@suvarna.test' } });
    const accountantUser = await prisma.user.findUniqueOrThrow({ where: { email: 'accountant@suvarna.test' } });
    const salesUser = await prisma.user.findUniqueOrThrow({ where: { email: 'sales@suvarna.test' } });
    const kalyanOwnerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@kalyan.test' } });

    ownerCtx = await resolveSecurityContext(prisma, { userId: ownerUser.id, targetTenantId: suvarnaOrg.id });
    managerCtx = await resolveSecurityContext(prisma, { userId: managerUser.id, targetTenantId: suvarnaOrg.id });
    accountantCtx = await resolveSecurityContext(prisma, { userId: accountantUser.id, targetTenantId: suvarnaOrg.id });
    salesCtx = await resolveSecurityContext(prisma, { userId: salesUser.id, targetTenantId: suvarnaOrg.id });
    kalyanOwnerCtx = await resolveSecurityContext(prisma, { userId: kalyanOwnerUser.id, targetTenantId: kalyanOrg.id });
  });

  afterAll(async () => {
    // Clean up created test customer records and associated audit logs
    if (createdCustomerIds.length > 0) {
      await prisma.customerInteraction.deleteMany({
        where: { customerId: { in: createdCustomerIds } },
      });
      await prisma.customer.deleteMany({
        where: { id: { in: createdCustomerIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          entityType: { in: ['Customer', 'CustomerInteraction'] },
          entityId: { in: createdCustomerIds },
        },
      });
    }
  });

  describe('1. Customer Creation & Validation', () => {
    it('creates a customer with minimal required fields (name, phone)', async () => {
      const customer = await createCustomer(prisma, {
        ctx: salesCtx,
        input: {
          name: 'Pooja Mehta',
          phone: '+91 98201 11222',
        },
      });
      createdCustomerIds.push(customer.id);

      expect(customer.id).toBeDefined();
      expect(customer.organizationId).toBe(suvarnaOrg.id);
      expect(customer.name).toBe('Pooja Mehta');
      expect(customer.phone).toBe('+91 98201 11222');
      expect(customer.normalizedPhone).toBe('9820111222');
      expect(customer.customerCode).toMatch(/^CUST-\d+/);
      expect(customer.isActive).toBe(true);
      expect(customer.segment).toBe('RETAIL');

      // Verify audit log creation
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'Customer', entityId: customer.id, action: 'CREATE' },
      });
      expect(audit).toBeDefined();
      expect(audit?.organizationId).toBe(suvarnaOrg.id);
    });

    it('creates a customer with complete optional fields and showroom attribution', async () => {
      const customer = await createCustomer(prisma, {
        ctx: ownerCtx,
        input: {
          name: 'Vikramaditya Singhania',
          phone: '9820222333',
          alternatePhone: '9820555666',
          email: 'vikram@singhania.test',
          primaryBranchId: fortBranch.id,
          segment: 'VIP',
          pan: 'ABCDE1234F',
          addressLine1: 'Singhania Towers, 14th Floor',
          addressLine2: 'Nariman Point',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400021',
          dateOfBirth: '1985-06-15',
          anniversary: '2010-12-04',
          notes: 'Prefeers 22K antique temple jewellery and solitaires',
        },
      });
      createdCustomerIds.push(customer.id);

      expect(customer.primaryBranchId).toBe(fortBranch.id);
      expect((customer as any).primaryBranch).toBeDefined();
      expect((customer as any).primaryBranch.name).toBe(fortBranch.name);
      expect(customer.pan).toBe('ABCDE1234F');
      expect(customer.segment).toBe('VIP');
      expect(customer.city).toBe('Mumbai');
      expect(customer.pincode).toBe('400021');

      // Verify PAN is redacted in audit log
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'Customer', entityId: customer.id, action: 'CREATE' },
      });
      expect(audit).toBeDefined();
      // Ensure PAN was not stored in plaintext in changedFields if present
      const changed = audit?.changedFields as any;
      if (changed?.pan) {
        expect(changed.pan).toBe('[REDACTED]');
      }
    });

    it('rejects creation with blank name', async () => {
      await expect(
        createCustomer(prisma, {
          ctx: salesCtx,
          input: { name: '   ', phone: '9820333444' },
        })
      ).rejects.toThrow(CustomerValidationError);
    });

    it('rejects creation with name containing digits', async () => {
      await expect(
        createCustomer(prisma, {
          ctx: salesCtx,
          input: { name: 'Customer 123', phone: '9820333444' },
        })
      ).rejects.toThrow(/cannot contain numbers/);
    });

    it('rejects creation with invalid phone number', async () => {
      await expect(
        createCustomer(prisma, {
          ctx: salesCtx,
          input: { name: 'Rahul Shah', phone: '12345' },
        })
      ).rejects.toThrow(/valid 10-digit/);
    });

    it('rejects creation with invalid alternate phone', async () => {
      await expect(
        createCustomer(prisma, {
          ctx: salesCtx,
          input: { name: 'Rahul Shah', phone: '9820333444', alternatePhone: '123' },
        })
      ).rejects.toThrow(/valid 10-digit Indian phone number/);
    });

    it('rejects creation with city containing digits', async () => {
      await expect(
        createCustomer(prisma, {
          ctx: salesCtx,
          input: { name: 'Rahul Shah', phone: '9820333444', city: 'Mumbai 400001' },
        })
      ).rejects.toThrow(/cannot contain numbers/);
    });

    it('rejects creation with invalid Indian state', async () => {
      await expect(
        createCustomer(prisma, {
          ctx: salesCtx,
          input: { name: 'Rahul Shah', phone: '9820333444', state: 'California' },
        })
      ).rejects.toThrow(/valid Indian State or Union Territory/);
    });

    it('rejects creation with impossible date of birth (e.g. 0011-01-01)', async () => {
      await expect(
        createCustomer(prisma, {
          ctx: salesCtx,
          input: { name: 'Rahul Shah', phone: '9820333444', dateOfBirth: '0011-01-01' },
        })
      ).rejects.toThrow(/Year must be between/);
    });

    it('rejects creation with malformed PAN', async () => {
      await expect(
        createCustomer(prisma, {
          ctx: salesCtx,
          input: { name: 'Rahul Shah', phone: '9820333444', pan: 'INVALIDPAN' },
        })
      ).rejects.toThrow(/Invalid PAN format/);
    });

    it('rejects creation with invalid PIN code', async () => {
      await expect(
        createCustomer(prisma, {
          ctx: salesCtx,
          input: { name: 'Rahul Shah', phone: '9820333444', pincode: '4001' },
        })
      ).rejects.toThrow(/Invalid PIN code/);
    });

    it('rejects cross-tenant primaryBranchId assignment', async () => {
      // Sales staff at Suvarna cannot assign Thane branch (which belongs to Kalyan)
      await expect(
        createCustomer(prisma, {
          ctx: salesCtx,
          input: {
            name: 'Smita Kadam',
            phone: '9820444555',
            primaryBranchId: thaneBranch.id,
          },
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('2. Duplicate Detection Policy', () => {
    it('detects existing customer with matching normalized phone number', async () => {
      const check = await checkCustomerDuplicates(prisma, {
        ctx: salesCtx,
        phone: '+91-98201-11222', // Same normalized phone as Pooja Mehta
        name: 'Pooja',
      });

      expect(check.hasDuplicates).toBe(true);
      expect(check.phoneMatches.length).toBeGreaterThan(0);
      expect(check.phoneMatches[0].name).toBe('Pooja Mehta');
    });

    it('allows registering a family member with the same phone without blocking', async () => {
      // Husband registering with the same mobile number
      const familyMember = await createCustomer(prisma, {
        ctx: salesCtx,
        input: {
          name: 'Rajesh Mehta',
          phone: '9820111222', // Same mobile as Pooja Mehta
          notes: 'Spouse of Pooja Mehta',
        },
      });
      createdCustomerIds.push(familyMember.id);

      expect(familyMember.id).toBeDefined();
      expect(familyMember.name).toBe('Rajesh Mehta');
      expect(familyMember.normalizedPhone).toBe('9820111222');
    });
  });

  describe('3. Customer Profile Updates & Audit Diff', () => {
    it('updates permitted customer fields and records audit diff', async () => {
      const customer = await createCustomer(prisma, {
        ctx: salesCtx,
        input: {
          name: 'Kavita Patel',
          phone: '9820555666',
          city: 'Thane',
        },
      });
      createdCustomerIds.push(customer.id);

      const updated = await updateCustomer(prisma, {
        ctx: managerCtx,
        customerId: customer.id,
        input: {
          name: 'Kavita Rajesh Patel',
          city: 'Mumbai',
          notes: 'Prefeers diamond studded pendants',
          segment: 'BRIDAL',
        },
      });

      expect(updated.name).toBe('Kavita Rajesh Patel');
      expect(updated.city).toBe('Mumbai');
      expect(updated.segment).toBe('BRIDAL');

      // Verify update audit log
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'Customer', entityId: customer.id, action: 'UPDATE' },
      });
      expect(audit).toBeDefined();
      const diff = audit?.changedFields as any;
      expect(diff?.name?.before).toBe('Kavita Patel');
      expect(diff?.name?.after).toBe('Kavita Rajesh Patel');
    });

    it('rejects updating non-existent customer', async () => {
      await expect(
        updateCustomer(prisma, {
          ctx: salesCtx,
          customerId: '00000000-0000-0000-0000-000000000000',
          input: { name: 'Ghost' },
        })
      ).rejects.toThrow(CustomerNotFoundError);
    });
  });

  describe('4. Search, Filtering, and Pagination', () => {
    it('searches customer by name', async () => {
      const res = await listCustomers(prisma, {
        ctx: salesCtx,
        filters: { searchQuery: 'Singhania' },
      });
      expect(res.customers.length).toBeGreaterThanOrEqual(1);
      expect(res.customers[0].name).toContain('Singhania');
    });

    it('searches customer by phone digits', async () => {
      const res = await listCustomers(prisma, {
        ctx: salesCtx,
        filters: { searchQuery: '9820222333' },
      });
      expect(res.customers.length).toBeGreaterThanOrEqual(1);
      expect(res.customers[0].phone).toBe('9820222333');
    });

    it('filters customer by segment', async () => {
      const res = await listCustomers(prisma, {
        ctx: salesCtx,
        filters: { segment: 'VIP' },
      });
      expect(res.customers.length).toBeGreaterThanOrEqual(1);
      expect(res.customers.every((c) => c.segment === 'VIP')).toBe(true);
    });

    it('paginates customer directory properly', async () => {
      const page1 = await listCustomers(prisma, {
        ctx: salesCtx,
        page: 1,
        limit: 2,
      });
      expect(page1.limit).toBe(2);
      expect(page1.page).toBe(1);
      expect(page1.totalCount).toBeGreaterThanOrEqual(3);
      expect(page1.totalPages).toBeGreaterThanOrEqual(2);
    });
  });

  describe('5. Strict Multi-Tenant Isolation & Cross-Tenant Defense', () => {
    it('prevents Kalyan org from viewing Suvarna customers in directory search', async () => {
      const res = await listCustomers(prisma, {
        ctx: kalyanOwnerCtx,
        filters: { searchQuery: 'Singhania' },
      });
      // Should find 0 records because Singhania belongs to Suvarna
      expect(res.customers.length).toBe(0);
      expect(res.totalCount).toBe(0);
    });

    it('rejects cross-tenant getCustomerById lookup attack', async () => {
      const suvarnaCust = await prisma.customer.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, name: 'Pooja Mehta' },
      });

      // Kalyan owner attempts to inspect Suvarna customer by ID
      await expect(
        getCustomerById(prisma, {
          ctx: kalyanOwnerCtx,
          customerId: suvarnaCust.id,
        })
      ).rejects.toThrow(CustomerNotFoundError);
    });

    it('rejects cross-tenant customer update mutation attack', async () => {
      const suvarnaCust = await prisma.customer.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, name: 'Pooja Mehta' },
      });

      // Kalyan owner attempts to tamper with Suvarna customer
      await expect(
        updateCustomer(prisma, {
          ctx: kalyanOwnerCtx,
          customerId: suvarnaCust.id,
          input: { name: 'Tampered Name' },
        })
      ).rejects.toThrow(CustomerNotFoundError);
    });
  });

  describe('6. Customer Activity, Interaction History & Extension Points', () => {
    it('records showroom interaction and retrieves chronological history', async () => {
      const customer = await prisma.customer.findFirstOrThrow({
        where: { organizationId: suvarnaOrg.id, name: 'Pooja Mehta' },
      });

      const interaction = await logCustomerInteraction(prisma, {
        ctx: salesCtx,
        customerId: customer.id,
        input: {
          channel: 'WALK_IN',
          notes: 'Customer visited showroom to check bridal necklace designs. Requested WhatsApp catalog.',
          followUpDate: '2026-11-01',
        },
      });

      expect(interaction.id).toBeDefined();
      expect(interaction.channel).toBe('WALK_IN');
      expect(interaction.notes).toContain('bridal necklace');
      expect(interaction.userId).toBe(salesCtx.userId);

      // Fetch profile and verify interactions
      const profile = await getCustomerById(prisma, {
        ctx: salesCtx,
        customerId: customer.id,
      });

      expect(profile.interactions.length).toBeGreaterThanOrEqual(1);
      expect(profile.interactions[0].channel).toBe('WALK_IN');
      expect(profile.interactions[0].user?.email).toBe('sales@suvarna.test');

      // Verify honest transaction extension points
      expect(profile.salesInvoices).toEqual([]);
      expect(profile.goldPurchases).toEqual([]);
      expect(profile.outstandingBalance).toBe('0.00');
    });
  });
});
