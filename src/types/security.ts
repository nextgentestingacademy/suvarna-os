export type Role = 'OWNER' | 'MANAGER' | 'ACCOUNTANT' | 'SALES_STAFF';

export type Permission =
  | 'TENANT_MANAGE'         // Business settings, GSTIN, legal name
  | 'BRANCH_MANAGE'         // Create/edit showroom branches
  | 'STAFF_MANAGE'          // Invite/suspend staff, assign roles
  | 'RATES_MANAGE'          // Set daily gold/silver rates
  | 'INVENTORY_VIEW'        // View jewellery items
  | 'INVENTORY_MANAGE'      // Add/edit items, stock transfers
  | 'BILLING_CREATE'        // Create invoices/bills
  | 'BILLING_VOID'          // Cancel/void confirmed bills
  | 'ACCOUNTS_VIEW'         // View financial ledgers, expenses, sales analytics
  | 'AUDIT_VIEW';           // Inspect compliance audit logs

export interface SecurityContext {
  readonly userId: string;
  readonly userEmail: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly membershipId: string;
  readonly role: Role;
  readonly activeBranchId?: string;
  readonly allowedBranchIds: readonly string[];
}

export class AuthorizationError extends Error {
  constructor(message: string, public readonly code: string = 'FORBIDDEN') {
    super(message);
    this.name = 'AuthorizationError';
  }
}
