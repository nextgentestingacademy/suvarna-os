import { Role, Permission, SecurityContext, AuthorizationError } from '@/types/security';

/**
 * Declarative Role-Based Access Control matrix.
 * Defines exactly what each staff role can perform.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: [
    'TENANT_MANAGE',
    'BRANCH_MANAGE',
    'STAFF_MANAGE',
    'RATES_MANAGE',
    'INVENTORY_VIEW',
    'INVENTORY_MANAGE',
    'BILLING_CREATE',
    'BILLING_VOID',
    'ACCOUNTS_VIEW',
    'AUDIT_VIEW',
  ],
  MANAGER: [
    'BRANCH_MANAGE',
    'RATES_MANAGE',
    'INVENTORY_VIEW',
    'INVENTORY_MANAGE',
    'BILLING_CREATE',
  ],
  ACCOUNTANT: [
    'INVENTORY_VIEW',
    'BILLING_CREATE',
    'ACCOUNTS_VIEW',
  ],
  SALES_STAFF: [
    'INVENTORY_VIEW',
    'BILLING_CREATE',
  ],
};

/**
 * Checks if a given role possesses the specified permission.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Asserts that the active SecurityContext has the required permission.
 * Throws a typed AuthorizationError if denied.
 */
export function assertPermission(ctx: SecurityContext, permission: Permission): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new AuthorizationError(
      `Permission denied: Role '${ctx.role}' does not have '${permission}' access.`,
      'PERMISSION_DENIED'
    );
  }
}

/**
 * Asserts that the requested branchId is authorized for the given SecurityContext.
 * Throws a typed AuthorizationError if the user is scoped to other branches.
 */
export function assertBranchAccess(ctx: SecurityContext, branchId: string): void {
  if (!ctx.allowedBranchIds.includes(branchId)) {
    throw new AuthorizationError(
      `Access denied: You are not authorized to perform operations in branch '${branchId}'.`,
      'UNAUTHORIZED_BRANCH'
    );
  }
}
