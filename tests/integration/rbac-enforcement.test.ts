import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { getServerSecurityContext } from '@/lib/security-context';
import { assertPermission, hasPermission } from '@/lib/rbac';
import { switchActiveBranchAction, switchActiveOrganizationAction } from '@/app/actions/workspace';
import { AuthorizationError } from '@/types/security';
import { ReportsContent } from '@/components/workspace/reports-content';
import { SettingsContent } from '@/components/workspace/settings-content';
import { AccessDeniedModule } from '@/components/access-denied-module';
import { ComingSoonModule } from '@/components/coming-soon-module';
import { ReportsWorkspace } from '@/components/workspace/reports/reports-workspace';

describe('RBAC Navigation & Server-Side Authorization Enforcement', () => {
  const DEV_PASSWORD = 'SuvarnaDev2026!';

  let suvarnaOrg: any;
  let kalyanOrg: any;
  let fortBranch: any;
  let vashiBranch: any;

  let ownerHeaders: Headers;
  let managerHeaders: Headers;
  let accountantHeaders: Headers;
  let salesHeaders: Headers;

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

  beforeAll(async () => {
    suvarnaOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'suvarna-mumbai' },
    });
    kalyanOrg = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'kalyan-test' },
    });

    fortBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: suvarnaOrg.id, code: 'FORT' } },
    });
    vashiBranch = await prisma.branch.findUniqueOrThrow({
      where: { organizationId_code: { organizationId: suvarnaOrg.id, code: 'VASHI' } },
    });
  });

  // Re-acquire fresh sessions before tests to isolate from parallel auth-session logout tests
  beforeEach(async () => {
    ownerHeaders = await getSessionHeaders('owner@suvarna.test');
    managerHeaders = await getSessionHeaders('manager@suvarna.test');
    accountantHeaders = await getSessionHeaders('accountant@suvarna.test');
    salesHeaders = await getSessionHeaders('sales@suvarna.test');
  });

  describe('1. Session Context Resolution Across All 4 Roles', () => {
    it('resolves OWNER with correct role and full branch access', async () => {
      const ctx = await getServerSecurityContext({ headers: ownerHeaders });
      expect(ctx.role).toBe('OWNER');
      expect(ctx.tenantId).toBe(suvarnaOrg.id);
      expect(ctx.allowedBranchIds).toContain(fortBranch.id);
      expect(ctx.allowedBranchIds).toContain(vashiBranch.id);
    });

    it('resolves MANAGER with correct role and scoped branch access', async () => {
      const ctx = await getServerSecurityContext({ headers: managerHeaders });
      expect(ctx.role).toBe('MANAGER');
      expect(ctx.tenantId).toBe(suvarnaOrg.id);
      expect(ctx.allowedBranchIds).toContain(fortBranch.id);
      expect(ctx.allowedBranchIds).not.toContain(vashiBranch.id);
    });

    it('resolves ACCOUNTANT with correct role and all-branch reporting scope', async () => {
      const ctx = await getServerSecurityContext({ headers: accountantHeaders });
      expect(ctx.role).toBe('ACCOUNTANT');
      expect(ctx.tenantId).toBe(suvarnaOrg.id);
      expect(ctx.allowedBranchIds).toContain(fortBranch.id);
      expect(ctx.allowedBranchIds).toContain(vashiBranch.id);
    });

    it('resolves SALES_STAFF with correct role and single-branch counter scope', async () => {
      const ctx = await getServerSecurityContext({ headers: salesHeaders });
      expect(ctx.role).toBe('SALES_STAFF');
      expect(ctx.tenantId).toBe(suvarnaOrg.id);
      expect(ctx.allowedBranchIds).toContain(fortBranch.id);
      expect(ctx.allowedBranchIds).not.toContain(vashiBranch.id);
    });
  });

  describe('2. Server Component Enforcement: /reports (ACCOUNTS_VIEW)', () => {
    it('OWNER is permitted to access ReportsPage', async () => {
      const page = await ReportsContent({ headers: ownerHeaders });
      expect(page.type).toBe(ReportsWorkspace);
      expect(page.props.userRole).toBe('OWNER');
    });

    it('ACCOUNTANT is permitted to access ReportsPage', async () => {
      const page = await ReportsContent({ headers: accountantHeaders });
      expect(page.type).toBe(ReportsWorkspace);
      expect(page.props.userRole).toBe('ACCOUNTANT');
    });

    it('MANAGER is denied direct access to ReportsPage (renders AccessDeniedModule)', async () => {
      const page = await ReportsContent({ headers: managerHeaders });
      expect(page.type).toBe(AccessDeniedModule);
      expect(page.props.currentRole).toBe('MANAGER');
      expect(page.props.requiredPermission).toBe('ACCOUNTS_VIEW');
    });

    it('SALES_STAFF is denied direct access to ReportsPage (renders AccessDeniedModule)', async () => {
      const page = await ReportsContent({ headers: salesHeaders });
      expect(page.type).toBe(AccessDeniedModule);
      expect(page.props.currentRole).toBe('SALES_STAFF');
      expect(page.props.requiredPermission).toBe('ACCOUNTS_VIEW');
    });
  });

  describe('3. Server Component Enforcement: /settings (BRANCH_MANAGE / TENANT_MANAGE / STAFF_MANAGE)', () => {
    it('OWNER is permitted to access SettingsPage', async () => {
      const page = await SettingsContent({ headers: ownerHeaders });
      expect(page.type).toBe(ComingSoonModule);
      expect(page.props.moduleName).toBe('Branches, Staff & Showroom Settings');
    });

    it('MANAGER is permitted to access SettingsPage (BRANCH_MANAGE)', async () => {
      const page = await SettingsContent({ headers: managerHeaders });
      expect(page.type).toBe(ComingSoonModule);
      expect(page.props.moduleName).toBe('Branches, Staff & Showroom Settings');
    });

    it('ACCOUNTANT is denied direct access to SettingsPage (renders AccessDeniedModule)', async () => {
      const page = await SettingsContent({ headers: accountantHeaders });
      expect(page.type).toBe(AccessDeniedModule);
      expect(page.props.currentRole).toBe('ACCOUNTANT');
    });

    it('SALES_STAFF is denied direct access to SettingsPage (renders AccessDeniedModule)', async () => {
      const page = await SettingsContent({ headers: salesHeaders });
      expect(page.type).toBe(AccessDeniedModule);
      expect(page.props.currentRole).toBe('SALES_STAFF');
    });
  });

  describe('4. Server Action Enforcement & Tenant / Branch Restrictions', () => {
    it('rejects unauthorized branch switch attempt by SALES_STAFF to VASHI branch', async () => {
      const res = await switchActiveBranchAction(vashiBranch.id, { headers: salesHeaders });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Access denied: You are not authorized to access branch/);
    });

    it('permits authorized branch switch by OWNER to VASHI branch', async () => {
      const res = await switchActiveBranchAction(vashiBranch.id, { headers: ownerHeaders });
      expect(res.success).toBe(true);
      expect(res.activeBranchId).toBe(vashiBranch.id);
    });

    it('rejects cross-tenant organization switch attempt by Suvarna staff', async () => {
      const res = await switchActiveOrganizationAction(kalyanOrg.id, { headers: salesHeaders });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Access denied: You do not have an active membership/);
    });

    it('assertPermission throws typed AuthorizationError for unauthorized mutations', async () => {
      const salesCtx = await getServerSecurityContext({ headers: salesHeaders });
      expect(() => assertPermission(salesCtx, 'INVENTORY_MANAGE')).toThrow(AuthorizationError);
      expect(() => assertPermission(salesCtx, 'RATES_MANAGE')).toThrow(AuthorizationError);
      expect(() => assertPermission(salesCtx, 'STAFF_MANAGE')).toThrow(AuthorizationError);

      const accountantCtx = await getServerSecurityContext({ headers: accountantHeaders });
      expect(() => assertPermission(accountantCtx, 'STAFF_MANAGE')).toThrow(AuthorizationError);
      expect(() => assertPermission(accountantCtx, 'INVENTORY_MANAGE')).toThrow(AuthorizationError);
    });
  });
});
