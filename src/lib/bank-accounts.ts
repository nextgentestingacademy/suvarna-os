import { PrismaClient } from '@prisma/client';
import { SecurityContext, AuthorizationError } from '@/types/security';
import { assertPermission, assertBranchAccess } from '@/lib/rbac';
import { prisma as defaultPrisma } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';

// ==============================================================================
// ERROR TYPES
// ==============================================================================

export class BankAccountValidationError extends Error {
  constructor(message: string, public readonly code: string = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'BankAccountValidationError';
  }
}

export class BankAccountNotFoundError extends Error {
  constructor(message: string = 'Bank account not found or access denied.', public readonly code: string = 'NOT_FOUND') {
    super(message);
    this.name = 'BankAccountNotFoundError';
  }
}

export class BankAccountConflictError extends Error {
  constructor(message: string, public readonly code: string = 'CONFLICT') {
    super(message);
    this.name = 'BankAccountConflictError';
  }
}

// ==============================================================================
// INPUT / OUTPUT INTERFACES
// ==============================================================================

export type BankAccountType = 'CURRENT' | 'SAVINGS' | 'OVERDRAFT' | 'PAYMENT_GATEWAY' | 'EDC_SETTLEMENT';

export interface CreateBankAccountInput {
  accountName: string;
  bankName: string;
  accountType?: BankAccountType;
  accountNumberMasked: string;
  ifscCode?: string;
  ledgerAccountId: string;
  branchId?: string | null;
}

export interface ListBankAccountsOptions {
  branchId?: string;
  includeInactive?: boolean;
}

export interface BankAccountServiceOptions {
  prisma?: PrismaClient;
}

// ==============================================================================
// SERVICE IMPLEMENTATION
// ==============================================================================

export class BankAccountService {
  private readonly db: PrismaClient;

  constructor(options?: BankAccountServiceOptions) {
    this.db = options?.prisma ?? defaultPrisma;
  }

  /**
   * Asserts management permission for bank account mutation operations.
   * Scoped strictly to OWNER or ACCOUNTANT roles with ACCOUNTS_VIEW permission.
   */
  private assertManagementPermission(ctx: SecurityContext): void {
    assertPermission(ctx, 'ACCOUNTS_VIEW');
    if (ctx.role !== 'OWNER' && ctx.role !== 'ACCOUNTANT') {
      throw new AuthorizationError(
        `Permission denied: Role '${ctx.role}' is not authorized to configure bank accounts.`,
        'BANK_ACCOUNT_MANAGEMENT_DENIED'
      );
    }
  }

  /**
   * Creates a new bank account or payment gateway settlement account.
   * - Enforces tenant isolation.
   * - Rejects cross-tenant ledger account associations.
   * - Rejects cross-tenant branch associations.
   * - Records audit trail.
   */
  async createBankAccount(ctx: SecurityContext, input: CreateBankAccountInput) {
    this.assertManagementPermission(ctx);

    const tenantId = ctx.tenantId;

    // 1. Validate required fields
    const accountName = input.accountName?.trim();
    if (!accountName) {
      throw new BankAccountValidationError('Account display name is required.', 'MISSING_ACCOUNT_NAME');
    }

    const bankName = input.bankName?.trim();
    if (!bankName) {
      throw new BankAccountValidationError('Bank or provider name is required.', 'MISSING_BANK_NAME');
    }

    const accountNumberMasked = input.accountNumberMasked?.trim();
    if (!accountNumberMasked) {
      throw new BankAccountValidationError('Account number or identifier is required.', 'MISSING_ACCOUNT_NUMBER');
    }

    const ledgerAccountId = input.ledgerAccountId?.trim();
    if (!ledgerAccountId) {
      throw new BankAccountValidationError('Linked general ledger account ID is required.', 'MISSING_LEDGER_ACCOUNT');
    }

    // 2. Validate branch scoping if provided
    let branchId: string | null = null;
    if (input.branchId?.trim()) {
      branchId = input.branchId.trim();
      assertBranchAccess(ctx, branchId);

      const branch = await this.db.branch.findFirst({
        where: { id: branchId, organizationId: tenantId },
      });
      if (!branch) {
        throw new BankAccountValidationError(
          `Showroom branch '${branchId}' not found or belongs to another business.`,
          'INVALID_BRANCH'
        );
      }
    }

    // 3. Validate ledger account exists and belongs to active tenant (prevent cross-tenant reference)
    const ledgerAccount = await this.db.ledgerAccount.findFirst({
      where: { id: ledgerAccountId, organizationId: tenantId },
    });
    if (!ledgerAccount) {
      throw new BankAccountValidationError(
        `Ledger account '${ledgerAccountId}' not found or belongs to another business.`,
        'INVALID_LEDGER_ACCOUNT'
      );
    }

    // 4. Validate unique account name within organization
    const existing = await this.db.bankAccount.findUnique({
      where: {
        organizationId_accountName: {
          organizationId: tenantId,
          accountName,
        },
      },
    });
    if (existing) {
      throw new BankAccountConflictError(
        `Bank account with display name '${accountName}' already exists for this business.`,
        'ACCOUNT_NAME_CONFLICT'
      );
    }

    // 5. Create bank account record
    const account = await this.db.bankAccount.create({
      data: {
        organizationId: tenantId,
        branchId,
        accountName,
        bankName,
        accountType: input.accountType ?? 'CURRENT',
        accountNumberMasked,
        ifscCode: input.ifscCode?.trim().toUpperCase() || null,
        ledgerAccountId,
        isActive: true,
      },
      include: {
        branch: true,
        ledgerAccount: true,
      },
    });

    // 6. Record audit log
    await recordAuditLog(this.db, ctx, {
      action: 'CREATE',
      entityType: 'BankAccount',
      entityId: account.id,
      changedFields: {
        accountName,
        bankName,
        accountType: account.accountType,
        accountNumberMasked,
        branchId,
        ledgerAccountId,
      },
    });

    return account;
  }

  /**
   * Lists bank accounts for the authorized organization and permitted branch scope.
   */
  async listBankAccounts(ctx: SecurityContext, options?: ListBankAccountsOptions) {
    assertPermission(ctx, 'ACCOUNTS_VIEW');

    const tenantId = ctx.tenantId;

    if (options?.branchId) {
      assertBranchAccess(ctx, options.branchId);
    }

    return this.db.bankAccount.findMany({
      where: {
        organizationId: tenantId,
        ...(options?.includeInactive ? {} : { isActive: true }),
        ...(options?.branchId
          ? {
              OR: [
                { branchId: options.branchId },
                { branchId: null }, // Centralized business bank accounts apply across branches
              ],
            }
          : {}),
      },
      include: {
        branch: true,
        ledgerAccount: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Retrieves a single bank account by ID within the authorized tenant.
   */
  async getBankAccountById(ctx: SecurityContext, id: string) {
    assertPermission(ctx, 'ACCOUNTS_VIEW');

    const account = await this.db.bankAccount.findFirst({
      where: {
        id,
        organizationId: ctx.tenantId,
      },
      include: {
        branch: true,
        ledgerAccount: true,
      },
    });

    if (!account) {
      throw new BankAccountNotFoundError();
    }

    if (account.branchId) {
      assertBranchAccess(ctx, account.branchId);
    }

    return account;
  }

  /**
   * Deactivates a bank account without deleting historical records or broken references.
   */
  async deactivateBankAccount(ctx: SecurityContext, id: string) {
    this.assertManagementPermission(ctx);

    const account = await this.db.bankAccount.findFirst({
      where: {
        id,
        organizationId: ctx.tenantId,
      },
    });

    if (!account) {
      throw new BankAccountNotFoundError();
    }

    if (account.branchId) {
      assertBranchAccess(ctx, account.branchId);
    }

    const updated = await this.db.bankAccount.update({
      where: { id },
      data: { isActive: false },
      include: {
        branch: true,
        ledgerAccount: true,
      },
    });

    await recordAuditLog(this.db, ctx, {
      action: 'UPDATE',
      entityType: 'BankAccount',
      entityId: id,
      changedFields: { isActive: false },
    });

    return updated;
  }
}

export const bankAccountService = new BankAccountService();
