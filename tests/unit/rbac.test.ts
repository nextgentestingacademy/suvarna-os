import { describe, it, expect } from 'vitest';
import { hasPermission, assertPermission, assertBranchAccess } from '@/lib/rbac';
import { SecurityContext, AuthorizationError } from '@/types/security';

describe('RBAC & Branch Scoping Policy', () => {
  const baseContext: SecurityContext = {
    userId: 'user-1',
    userEmail: 'staff@suvarna.test',
    tenantId: 'tenant-1',
    tenantSlug: 'suvarna-mumbai',
    membershipId: 'mem-1',
    role: 'SALES_STAFF',
    activeBranchId: 'branch-fort',
    allowedBranchIds: ['branch-fort'],
  };

  it('correctly reports permission flags for different staff roles', () => {
    // Owner permissions
    expect(hasPermission('OWNER', 'TENANT_MANAGE')).toBe(true);
    expect(hasPermission('OWNER', 'BRANCH_MANAGE')).toBe(true);
    expect(hasPermission('OWNER', 'STAFF_MANAGE')).toBe(true);
    expect(hasPermission('OWNER', 'BILLING_VOID')).toBe(true);
    expect(hasPermission('OWNER', 'AUDIT_VIEW')).toBe(true);

    // Sales staff permissions
    expect(hasPermission('SALES_STAFF', 'BILLING_CREATE')).toBe(true);
    expect(hasPermission('SALES_STAFF', 'INVENTORY_VIEW')).toBe(true);
    expect(hasPermission('SALES_STAFF', 'TENANT_MANAGE')).toBe(false);
    expect(hasPermission('SALES_STAFF', 'RATES_MANAGE')).toBe(false);
    expect(hasPermission('SALES_STAFF', 'BILLING_VOID')).toBe(false);
    expect(hasPermission('SALES_STAFF', 'AUDIT_VIEW')).toBe(false);

    // Accountant permissions
    expect(hasPermission('ACCOUNTANT', 'ACCOUNTS_VIEW')).toBe(true);
    expect(hasPermission('ACCOUNTANT', 'BILLING_CREATE')).toBe(true);
    expect(hasPermission('ACCOUNTANT', 'STAFF_MANAGE')).toBe(false);
    expect(hasPermission('ACCOUNTANT', 'RATES_MANAGE')).toBe(false);
  });

  it('assertPermission allows authorized operations and throws AuthorizationError on denial', () => {
    const salesCtx: SecurityContext = { ...baseContext, role: 'SALES_STAFF' };
    const ownerCtx: SecurityContext = { ...baseContext, role: 'OWNER' };

    // Allowed
    expect(() => assertPermission(salesCtx, 'BILLING_CREATE')).not.toThrow();
    expect(() => assertPermission(ownerCtx, 'STAFF_MANAGE')).not.toThrow();

    // Denied for sales staff
    expect(() => assertPermission(salesCtx, 'STAFF_MANAGE')).toThrow(AuthorizationError);
    expect(() => assertPermission(salesCtx, 'STAFF_MANAGE')).toThrow(/Permission denied/);
  });

  it('assertBranchAccess enforces branch boundaries', () => {
    const singleBranchCtx: SecurityContext = {
      ...baseContext,
      activeBranchId: 'branch-fort',
      allowedBranchIds: ['branch-fort'],
    };

    // Access to assigned branch is allowed
    expect(() => assertBranchAccess(singleBranchCtx, 'branch-fort')).not.toThrow();

    // Access to unassigned branch is denied
    expect(() => assertBranchAccess(singleBranchCtx, 'branch-vashi')).toThrow(AuthorizationError);
    expect(() => assertBranchAccess(singleBranchCtx, 'branch-vashi')).toThrow(/not authorized to perform operations in branch 'branch-vashi'/);
  });
});
