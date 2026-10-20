import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { resolveSecurityContext, getServerSecurityContext } from '@/lib/security-context';
import { hasPermission, assertPermission, assertBranchAccess } from '@/lib/rbac';
import { switchActiveBranchAction, switchActiveOrganizationAction } from '@/app/actions/workspace';
import { AuthorizationError, Permission } from '@/types/security';

describe('Checkpoint 2B.3 — Live Database-Backed Business & Branch Authorization', () => {
  const DEV_PASSWORD = 'SuvarnaDev2026!';

  let suvarnaOrg: any;
  let kalyanOrg: any;
  let fortBranch: any;
  let vashiBranch: any;
  let thaneBranch: any;
  let ownerUser: any;
  let managerUser: any;
  let accountantUser: any;
  let salesUser: any;
  let kalyanOwnerUser: any;

  // Cleanup tracking for temporary test records created during testing
  const tempUserIds: string[] = [];

  beforeAll(async () => {
    // 1. Resolve seeded Organizations
    suvarnaOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'suvarna-mumbai' },
    });
    kalyanOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'kalyan-test' },
    });

    // 2. Resolve seeded Branches
    fortBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: suvarnaOrg.id, code: 'FORT' } },
    });
    vashiBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: suvarnaOrg.id, code: 'VASHI' } },
    });
    thaneBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: kalyanOrg.id, code: 'THANE' } },
    });

    // 3. Resolve seeded Users
    ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@suvarna.test' } });
    managerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'manager@suvarna.test' } });
    accountantUser = await prisma.user.findUniqueOrThrow({ where: { email: 'accountant@suvarna.test' } });
    salesUser = await prisma.user.findUniqueOrThrow({ where: { email: 'sales@suvarna.test' } });
    kalyanOwnerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'owner@kalyan.test' } });
  });

  afterAll(async () => {
    // Safely clean up any temporary records created during tests
    for (const uid of tempUserIds) {
      try {
        await prisma.membershipBranchAccess.deleteMany({ where: { member: { userId: uid } } });
        await prisma.member.deleteMany({ where: { userId: uid } });
        await prisma.account.deleteMany({ where: { userId: uid } });
        await prisma.user.delete({ where: { id: uid } });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // Helper to acquire a real Better Auth session cookie for a given user
  async function getSessionHeaders(email: string): Promise<Headers> {
    const signInRes = await auth.api.signInEmail({
      body: { email, password: DEV_PASSWORD },
      asResponse: true,
    });
    const cookie = signInRes.headers.get('set-cookie');
    if (!cookie) {
      throw new Error(`Failed to sign in as ${email} to acquire test session cookie`);
    }
    return new Headers({ cookie });
  }

  // ============================================================================
  // 1. Unauthenticated Access Denied
  // ============================================================================
  it('1. denies access when request is missing authentication or session', async () => {
    // Missing userId
    await expect(
      resolveSecurityContext(prisma, { userId: '' })
    ).rejects.toThrow(AuthorizationError);

    // Empty session headers
    await expect(
      getServerSecurityContext({ headers: new Headers() })
    ).rejects.toThrow(/Authentication required/);
  });

  // ============================================================================
  // 2. User Without Business Membership Denied
  // ============================================================================
  it('2. denies access to an authenticated user who has no business membership', async () => {
    // Create an orphaned test user without any Member record
    const orphanUser = await prisma.user.create({
      data: {
        name: 'Orphan User Test',
        email: `orphan-${Date.now()}@test.local`,
        emailVerified: true,
      },
    });
    tempUserIds.push(orphanUser.id);

    await expect(
      resolveSecurityContext(prisma, { userId: orphanUser.id })
    ).rejects.toThrow(/You do not have an active business membership/);
  });

  // ============================================================================
  // 3. Suspended Membership Denied
  // ============================================================================
  it('3. denies access when a user membership is marked SUSPENDED', async () => {
    const suspendedUser = await prisma.user.create({
      data: {
        name: 'Suspended Staff Test',
        email: `suspended-${Date.now()}@test.local`,
        emailVerified: true,
      },
    });
    tempUserIds.push(suspendedUser.id);

    // Create a suspended membership
    await prisma.member.create({
      data: {
        organizationId: suvarnaOrg.id,
        userId: suspendedUser.id,
        role: 'SALES_STAFF',
        status: 'SUSPENDED',
      },
    });

    await expect(
      resolveSecurityContext(prisma, {
        userId: suspendedUser.id,
        targetTenantId: suvarnaOrg.id,
      })
    ).rejects.toThrow(/You are not an active member of business/);
  });

  // ============================================================================
  // 4. Cross-Tenant Isolation (Business A vs Business B)
  // ============================================================================
  it('4. strictly prevents cross-tenant access between Suvarna and Kalyan businesses', async () => {
    // Suvarna Owner attempts to target Kalyan's organization
    await expect(
      resolveSecurityContext(prisma, {
        userId: ownerUser.id,
        targetTenantId: kalyanOrg.id,
      })
    ).rejects.toThrow(/You are not an active member of business/);

    // Kalyan Owner attempts to target Suvarna's organization
    await expect(
      resolveSecurityContext(prisma, {
        userId: kalyanOwnerUser.id,
        targetTenantId: suvarnaOrg.id,
      })
    ).rejects.toThrow(/You are not an active member of business/);
  });

  // ============================================================================
  // 5. Cross-Branch Access Denied
  // ============================================================================
  it('5. prevents a manager scoped to FORT showroom from accessing VASHI showroom', async () => {
    // Pooja Verma (Manager) only has access to FORT in seed data
    const managerContext = await resolveSecurityContext(prisma, {
      userId: managerUser.id,
      targetTenantId: suvarnaOrg.id,
    });

    expect(managerContext.allowedBranchIds).toContain(fortBranch.id);
    expect(managerContext.allowedBranchIds).not.toContain(vashiBranch.id);

    // Attempting to request VASHI branch explicitly must throw UNAUTHORIZED_BRANCH
    await expect(
      resolveSecurityContext(prisma, {
        userId: managerUser.id,
        targetTenantId: suvarnaOrg.id,
        targetBranchId: vashiBranch.id,
      })
    ).rejects.toThrow(/You do not have access to branch/);

    // assertBranchAccess utility also strictly rejects it
    expect(() => assertBranchAccess(managerContext, vashiBranch.id)).toThrow(AuthorizationError);
  });

  // ============================================================================
  // 6. Role Enforcement: OWNER vs SALES_STAFF
  // ============================================================================
  it('6. enforces least-privilege: rejects SALES_STAFF from performing OWNER/MANAGER actions', async () => {
    const salesContext = await resolveSecurityContext(prisma, {
      userId: salesUser.id,
      targetTenantId: suvarnaOrg.id,
    });
    expect(salesContext.role).toBe('SALES_STAFF');

    const ownerOnlyPermissions: Permission[] = [
      'TENANT_MANAGE',
      'STAFF_MANAGE',
      'BILLING_VOID',
      'AUDIT_VIEW',
    ];

    for (const perm of ownerOnlyPermissions) {
      expect(hasPermission(salesContext.role, perm)).toBe(false);
      expect(() => assertPermission(salesContext, perm)).toThrow(/Permission denied/);
    }

    // Sales staff also cannot manage rates or inventory
    expect(hasPermission(salesContext.role, 'RATES_MANAGE')).toBe(false);
    expect(hasPermission(salesContext.role, 'INVENTORY_MANAGE')).toBe(false);
    expect(hasPermission(salesContext.role, 'ACCOUNTS_VIEW')).toBe(false);
  });

  // ============================================================================
  // 7. Policy Verification for MANAGER and ACCOUNTANT Roles
  // ============================================================================
  it('7. verifies documented permissions for MANAGER and ACCOUNTANT roles', async () => {
    const managerContext = await resolveSecurityContext(prisma, {
      userId: managerUser.id,
      targetTenantId: suvarnaOrg.id,
    });
    const accountantContext = await resolveSecurityContext(prisma, {
      userId: accountantUser.id,
      targetTenantId: suvarnaOrg.id,
    });

    // MANAGER:
    // Can manage branches, inventory, rates, create billing
    expect(hasPermission(managerContext.role, 'BRANCH_MANAGE')).toBe(true);
    expect(hasPermission(managerContext.role, 'INVENTORY_MANAGE')).toBe(true);
    expect(hasPermission(managerContext.role, 'RATES_MANAGE')).toBe(true);
    expect(hasPermission(managerContext.role, 'BILLING_CREATE')).toBe(true);
    // Cannot manage tenant, staff, view audit, or view financial ledgers
    expect(hasPermission(managerContext.role, 'TENANT_MANAGE')).toBe(false);
    expect(hasPermission(managerContext.role, 'STAFF_MANAGE')).toBe(false);
    expect(hasPermission(managerContext.role, 'AUDIT_VIEW')).toBe(false);
    expect(hasPermission(managerContext.role, 'ACCOUNTS_VIEW')).toBe(false);

    // ACCOUNTANT:
    // Can view inventory, create billing, view accounts ledgers
    expect(hasPermission(accountantContext.role, 'INVENTORY_VIEW')).toBe(true);
    expect(hasPermission(accountantContext.role, 'BILLING_CREATE')).toBe(true);
    expect(hasPermission(accountantContext.role, 'ACCOUNTS_VIEW')).toBe(true);
    // Cannot manage rates, manage inventory, manage tenant, or manage staff
    expect(hasPermission(accountantContext.role, 'RATES_MANAGE')).toBe(false);
    expect(hasPermission(accountantContext.role, 'INVENTORY_MANAGE')).toBe(false);
    expect(hasPermission(accountantContext.role, 'TENANT_MANAGE')).toBe(false);
    expect(hasPermission(accountantContext.role, 'STAFF_MANAGE')).toBe(false);
  });

  // ============================================================================
  // 8. Unauthorized Organization Switching Rejected
  // ============================================================================
  it('8. rejects switching active organization to a business the user does not belong to', async () => {
    const ownerHeaders = await getSessionHeaders('owner@suvarna.test');

    // Attempt to switch active organization to Kalyan Test Jewellers
    const res = await switchActiveOrganizationAction(kalyanOrg.id, { headers: ownerHeaders });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Access denied/);
  });

  // ============================================================================
  // 9. Unauthorized Branch Switching Rejected and Audited
  // ============================================================================
  it('9. rejects unauthorized branch switching and logs ACCESS_DENIED audit entry', async () => {
    // Acquire session for manager (who only has access to FORT)
    const managerHeaders = await getSessionHeaders('manager@suvarna.test');

    const managerCtx = await getServerSecurityContext({ headers: managerHeaders });
    expect(managerCtx.allowedBranchIds).not.toContain(vashiBranch.id);

    // Attempt to switch active branch to VASHI branch
    const switchRes = await switchActiveBranchAction(vashiBranch.id, { headers: managerHeaders });
    expect(switchRes.success).toBe(false);
    expect(switchRes.error).toMatch(/Access denied/);

    // Verify audit log has recorded the access denial
    const deniedAuditLog = await prisma.auditLog.findFirst({
      where: {
        organizationId: suvarnaOrg.id,
        action: 'ACCESS_DENIED',
        entityType: 'Branch',
        entityId: vashiBranch.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(deniedAuditLog).not.toBeNull();
    expect(deniedAuditLog?.action).toBe('ACCESS_DENIED');
  });

  // ============================================================================
  // 10. PostgreSQL Engine Composite Foreign Key Prevents Cross-Tenant Insertion
  // ============================================================================
  it('10. database engine rejects cross-tenant branch-access link via composite foreign keys', async () => {
    // Find Suvarna member
    const suvarnaMember = await prisma.member.findFirstOrThrow({
      where: { organizationId: suvarnaOrg.id, userId: ownerUser.id },
    });

    // Attempt to link a Suvarna member to a Kalyan branch (composite key mismatch)
    // In schema: (organizationId, branchId) references branches(organizationId, id)
    // Trying to insert suvarnaOrg.id with thaneBranch.id (which belongs to kalyanOrg.id) must violate FK constraint
    let caughtFkError = false;
    try {
      await prisma.membershipBranchAccess.create({
        data: {
          organizationId: suvarnaOrg.id,
          memberId: suvarnaMember.id,
          branchId: thaneBranch.id, // Belong to Kalyan, not Suvarna!
        },
      });
    } catch (err: any) {
      caughtFkError = true;
      // Prisma P2003 corresponds to PostgreSQL Foreign Key Constraint Violation
      expect(err.code).toBe('P2003');
    }

    expect(caughtFkError).toBe(true);
  });

  // ============================================================================
  // 11. Permitted Branch Switching Succeeds for Multi-Branch User
  // ============================================================================
  it('11. successfully resolves permitted branch switching for a multi-branch user', async () => {
    const ownerHeaders = await getSessionHeaders('owner@suvarna.test');

    // Owner has both FORT and VASHI in seed
    const ownerCtx = await getServerSecurityContext({ headers: ownerHeaders });
    expect(ownerCtx.allowedBranchIds).toContain(fortBranch.id);
    expect(ownerCtx.allowedBranchIds).toContain(vashiBranch.id);

    // Can resolve context targeting VASHI
    const vashiCtx = await resolveSecurityContext(prisma, {
      userId: ownerUser.id,
      targetTenantId: suvarnaOrg.id,
      targetBranchId: vashiBranch.id,
    });
    expect(vashiCtx.activeBranchId).toBe(vashiBranch.id);
    expect(vashiCtx.activeBranch?.code).toBe('VASHI');

    // Can resolve context targeting FORT
    const fortCtx = await resolveSecurityContext(prisma, {
      userId: ownerUser.id,
      targetTenantId: suvarnaOrg.id,
      targetBranchId: fortBranch.id,
    });
    expect(fortCtx.activeBranchId).toBe(fortBranch.id);
    expect(fortCtx.activeBranch?.code).toBe('FORT');
  });
});
