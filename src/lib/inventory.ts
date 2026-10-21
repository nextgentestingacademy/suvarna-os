import { PrismaClient, Product, Ornament, StockMovement } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
import { SecurityContext, Role, AuthorizationError } from '@/types/security';
import { assertPermission, assertBranchAccess, hasPermission } from '@/lib/rbac';
import { recordAuditLog } from '@/lib/audit';
import { Decimal } from '@/lib/decimal';

// --- Typed Error Classes ---

export class InventoryValidationError extends Error {
  constructor(message: string, public readonly code: string = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'InventoryValidationError';
  }
}

export class InventoryConflictError extends Error {
  constructor(message: string, public readonly code: string = 'CONFLICT') {
    super(message);
    this.name = 'InventoryConflictError';
  }
}

// --- Service Input & Output Types ---

export interface CreateProductInput {
  sku: string;
  name: string;
  category: string;
  metalType?: string;
  purity?: string;
  description?: string | null;
  imageUrl?: string | null;
}

export interface RegisterOrnamentInput {
  branchId: string;
  productId: string;
  tagCode: string;
  huid?: string | null;
  metalType?: string;
  purity?: string;
  grossWeight: number | string | Decimal;
  stoneWeight?: number | string | Decimal;
  netWeight?: number | string | Decimal;
  makingChargeType?: 'PER_GRAM' | 'PERCENTAGE' | 'FLAT' | string | null;
  makingChargeValue?: number | string | Decimal | null;
  costAmount?: number | string | Decimal | null;
  priceAmount?: number | string | Decimal | null;
  reason?: string;
}

export interface ProductFilters {
  category?: string;
  isActive?: boolean;
  searchQuery?: string;
}

export interface OrnamentFilters {
  branchId?: string;
  productId?: string;
  status?: string;
  category?: string;
  searchQuery?: string;
}

export interface TransferOrnamentInput {
  ornamentId: string;
  fromBranchId: string;
  toBranchId: string;
  reason?: string;
}

export interface StockAdjustmentInput {
  ornamentId: string;
  adjustmentType: 'STATUS_CHANGE' | 'WEIGHT_CORRECTION';
  newStatus?: 'AVAILABLE' | 'RESERVED' | 'SOLD' | string;
  grossWeight?: number | string | Decimal;
  stoneWeight?: number | string | Decimal;
  netWeight?: number | string | Decimal;
  reason: string;
}

export interface SanitizedOrnament extends Omit<Ornament, 'costAmount'> {
  costAmount: Decimal | null;
}

export interface InventoryServiceOptions {
  prisma?: PrismaClient;
}

/**
 * Checks whether the given user role is permitted to view wholesale / manufacturer cost.
 * By default: OWNER, MANAGER, and ACCOUNTANT have financial/inventory access; SALES_STAFF is restricted.
 */
export function canViewCost(role: Role): boolean {
  return hasPermission(role, 'INVENTORY_MANAGE') || hasPermission(role, 'ACCOUNTS_VIEW');
}

/**
 * Sanitizes ornament record to redact cost amount for unauthorized roles.
 */
function sanitizeOrnamentForRole(ornament: Ornament, role: Role): SanitizedOrnament {
  if (canViewCost(role)) {
    return ornament;
  }
  return {
    ...ornament,
    costAmount: null,
  };
}

// ============================================================================
// INVENTORY SERVICE IMPLEMENTATION
// ============================================================================

export class InventoryService {
  private readonly db: PrismaClient;

  constructor(options?: InventoryServiceOptions) {
    this.db = options?.prisma || defaultPrisma;
  }

  // --------------------------------------------------------------------------
  // 1. Create Product Catalogue Entry
  // --------------------------------------------------------------------------
  async createProduct(ctx: SecurityContext, input: CreateProductInput): Promise<Product> {
    // 1. Security Check: INVENTORY_MANAGE required for catalogue mutations
    assertPermission(ctx, 'INVENTORY_MANAGE');

    // 2. Field Validations
    const sku = input.sku?.trim().toUpperCase();
    if (!sku) {
      throw new InventoryValidationError('Product SKU is required.');
    }
    const name = input.name?.trim();
    if (!name) {
      throw new InventoryValidationError('Product name is required.');
    }
    const category = input.category?.trim();
    if (!category) {
      throw new InventoryValidationError('Product category is required.');
    }

    const metalType = (input.metalType?.trim().toUpperCase() || 'GOLD');
    const purity = (input.purity?.trim().toUpperCase() || '22K');

    // 3. Tenant-scoped SKU uniqueness check
    const existing = await this.db.product.findUnique({
      where: {
        organizationId_sku: {
          organizationId: ctx.tenantId,
          sku,
        },
      },
    });

    if (existing) {
      throw new InventoryConflictError(
        `Product SKU '${sku}' already exists in your enterprise catalogue.`
      );
    }

    // 4. Persistence
    const product = await this.db.product.create({
      data: {
        organizationId: ctx.tenantId,
        sku,
        name,
        category,
        metalType,
        purity,
        description: input.description?.trim() || null,
        imageUrl: input.imageUrl?.trim() || null,
        isActive: true,
      },
    });

    // 5. Audit Logging
    await recordAuditLog(this.db, ctx, {
      action: 'CREATE',
      entityType: 'Product',
      entityId: product.id,
      changedFields: { sku, name, category, metalType, purity },
    });

    return product;
  }

  // --------------------------------------------------------------------------
  // 2. Register Physical Ornament & Atomic Initial Inward Movement
  // --------------------------------------------------------------------------
  async registerOrnament(
    ctx: SecurityContext,
    input: RegisterOrnamentInput
  ): Promise<{ ornament: SanitizedOrnament; movement: StockMovement }> {
    // 1. Security Check: INVENTORY_MANAGE + Branch Authorization
    assertPermission(ctx, 'INVENTORY_MANAGE');
    assertBranchAccess(ctx, input.branchId);

    // 2. Verify Product exists and belongs to the same organization
    const product = await this.db.product.findUnique({
      where: {
        organizationId_id: {
          organizationId: ctx.tenantId,
          id: input.productId,
        },
      },
    });

    if (!product) {
      throw new InventoryValidationError(
        `Product '${input.productId}' does not exist in your enterprise catalogue.`
      );
    }
    if (!product.isActive) {
      throw new InventoryValidationError(
        `Product '${product.sku}' is inactive and cannot receive new stock.`
      );
    }

    // 3. Verify Branch belongs to the organization
    const branch = await this.db.branch.findUnique({
      where: {
        organizationId_id: {
          organizationId: ctx.tenantId,
          id: input.branchId,
        },
      },
    });

    if (!branch) {
      throw new InventoryValidationError(
        `Branch '${input.branchId}' does not belong to your business.`
      );
    }

    // 4. Tag Code Validation & Tenant Uniqueness
    const tagCode = input.tagCode?.trim().toUpperCase();
    if (!tagCode) {
      throw new InventoryValidationError('Ornament tag code is required.');
    }

    const existingTag = await this.db.ornament.findUnique({
      where: {
        organizationId_tagCode: {
          organizationId: ctx.tenantId,
          tagCode,
        },
      },
    });

    if (existingTag) {
      throw new InventoryConflictError(
        `Ornament tag code '${tagCode}' already exists in your business.`
      );
    }

    // 5. Decimal Weight Validations
    let gross: Decimal;
    try {
      gross = new Decimal(input.grossWeight);
    } catch {
      throw new InventoryValidationError('Invalid gross weight value.');
    }

    if (gross.isNaN() || gross.lessThanOrEqualTo(0)) {
      throw new InventoryValidationError('Gross weight must be strictly greater than zero.');
    }

    let stone: Decimal;
    try {
      stone = new Decimal(input.stoneWeight ?? 0);
    } catch {
      throw new InventoryValidationError('Invalid stone weight value.');
    }

    if (stone.isNaN() || stone.lessThan(0)) {
      throw new InventoryValidationError('Stone weight cannot be negative.');
    }

    if (stone.greaterThan(gross)) {
      throw new InventoryValidationError('Stone weight cannot exceed gross weight.');
    }

    const computedNet = gross.minus(stone);
    let net: Decimal;

    if (input.netWeight !== undefined && input.netWeight !== null) {
      try {
        net = new Decimal(input.netWeight);
      } catch {
        throw new InventoryValidationError('Invalid net weight value.');
      }
      if (!net.equals(computedNet)) {
        throw new InventoryValidationError(
          `Net weight mismatch: specified net weight (${net.toFixed(3)}g) does not equal gross (${gross.toFixed(3)}g) - stone (${stone.toFixed(3)}g) = ${computedNet.toFixed(3)}g.`
        );
      }
    } else {
      net = computedNet;
    }

    // Standardize to 3 decimal places (milligram precision)
    const grossStr = gross.toFixed(3);
    const stoneStr = stone.toFixed(3);
    const netStr = net.toFixed(3);

    // 6. Monetary and Pricing Validations
    let costStr: string | null = null;
    if (input.costAmount !== undefined && input.costAmount !== null) {
      const cost = new Decimal(input.costAmount);
      if (cost.lessThan(0)) throw new InventoryValidationError('Cost amount cannot be negative.');
      costStr = cost.toFixed(2);
    }

    let priceStr: string | null = null;
    if (input.priceAmount !== undefined && input.priceAmount !== null) {
      const price = new Decimal(input.priceAmount);
      if (price.lessThan(0)) throw new InventoryValidationError('Price amount cannot be negative.');
      priceStr = price.toFixed(2);
    }

    let makingValueStr: string | null = null;
    if (input.makingChargeValue !== undefined && input.makingChargeValue !== null) {
      const mc = new Decimal(input.makingChargeValue);
      if (mc.lessThan(0)) throw new InventoryValidationError('Making charge value cannot be negative.');
      makingValueStr = mc.toFixed(2);
    }

    const huid = input.huid?.trim().toUpperCase() || null;

    // 7. Atomic Database Transaction: Ornament + Initial Inward Movement
    const result = await this.db.$transaction(async (tx) => {
      const ornament = await tx.ornament.create({
        data: {
          organizationId: ctx.tenantId,
          branchId: input.branchId,
          productId: input.productId,
          tagCode,
          huid,
          metalType: input.metalType?.trim().toUpperCase() || product.metalType,
          purity: input.purity?.trim().toUpperCase() || product.purity,
          grossWeight: grossStr,
          stoneWeight: stoneStr,
          netWeight: netStr,
          makingChargeType: input.makingChargeType || null,
          makingChargeValue: makingValueStr,
          costAmount: costStr,
          priceAmount: priceStr,
          status: 'AVAILABLE',
        },
      });

      const movement = await tx.stockMovement.create({
        data: {
          organizationId: ctx.tenantId,
          ornamentId: ornament.id,
          toBranchId: input.branchId,
          fromBranchId: null,
          movementType: 'INWARD',
          reason: input.reason || 'Initial showroom inward registration',
          userId: ctx.userId,
        },
      });

      await recordAuditLog(tx, ctx, {
        action: 'CREATE',
        entityType: 'Ornament',
        entityId: ornament.id,
        changedFields: {
          tagCode,
          branchId: input.branchId,
          grossWeight: grossStr,
          netWeight: netStr,
          movementId: movement.id,
        },
      });

      return { ornament, movement };
    });

    return {
      ornament: sanitizeOrnamentForRole(result.ornament, ctx.role),
      movement: result.movement,
    };
  }

  // --------------------------------------------------------------------------
  // 3. Retrieve Product Catalogue
  // --------------------------------------------------------------------------
  async getProducts(ctx: SecurityContext, filters?: ProductFilters): Promise<Product[]> {
    assertPermission(ctx, 'INVENTORY_VIEW');

    return this.db.product.findMany({
      where: {
        organizationId: ctx.tenantId,
        ...(filters?.category && filters.category !== 'All' ? { category: filters.category } : {}),
        ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
        ...(filters?.searchQuery
          ? {
              OR: [
                { sku: { contains: filters.searchQuery, mode: 'insensitive' } },
                { name: { contains: filters.searchQuery, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  // --------------------------------------------------------------------------
  // 4. Retrieve Ornaments (Tenant- & Branch-Scoped with Role Redaction)
  // --------------------------------------------------------------------------
  async getOrnaments(ctx: SecurityContext, filters?: OrnamentFilters): Promise<SanitizedOrnament[]> {
    assertPermission(ctx, 'INVENTORY_VIEW');

    // Enforce branch boundaries: if filter specifies a branch, verify user has access.
    // Otherwise, restrict to user's permitted branch access list.
    let branchScope: { branchId?: string | { in: string[] } } = {};
    if (filters?.branchId) {
      assertBranchAccess(ctx, filters.branchId);
      branchScope = { branchId: filters.branchId };
    } else {
      branchScope = { branchId: { in: [...ctx.allowedBranchIds] } };
    }

    const ornaments = await this.db.ornament.findMany({
      where: {
        organizationId: ctx.tenantId,
        ...branchScope,
        ...(filters?.status && filters.status !== 'All' ? { status: filters.status } : {}),
        ...(filters?.productId ? { productId: filters.productId } : {}),
        ...(filters?.searchQuery
          ? {
              OR: [
                { tagCode: { contains: filters.searchQuery, mode: 'insensitive' } },
                { huid: { contains: filters.searchQuery, mode: 'insensitive' } },
                { product: { name: { contains: filters.searchQuery, mode: 'insensitive' } } },
                { product: { sku: { contains: filters.searchQuery, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        product: true,
        branch: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return ornaments.map((orn) => sanitizeOrnamentForRole(orn, ctx.role));
  }

  // --------------------------------------------------------------------------
  // 5. Retrieve Ornament by ID
  // --------------------------------------------------------------------------
  async getOrnamentById(ctx: SecurityContext, ornamentId: string): Promise<SanitizedOrnament | null> {
    assertPermission(ctx, 'INVENTORY_VIEW');

    const ornament = await this.db.ornament.findUnique({
      where: {
        organizationId_id: {
          organizationId: ctx.tenantId,
          id: ornamentId,
        },
      },
      include: {
        product: true,
        branch: true,
      },
    });

    if (!ornament) {
      return null;
    }

    // Verify branch access
    if (!ctx.allowedBranchIds.includes(ornament.branchId)) {
      throw new AuthorizationError(
        `Access denied: You are not authorized to view stock located at branch '${ornament.branchId}'.`,
        'UNAUTHORIZED_BRANCH'
      );
    }

    return sanitizeOrnamentForRole(ornament, ctx.role);
  }

  // --------------------------------------------------------------------------
  // 6. Retrieve Stock Movement History (Read-Only)
  // --------------------------------------------------------------------------
  async getOrnamentMovements(ctx: SecurityContext, ornamentId: string): Promise<StockMovement[]> {
    assertPermission(ctx, 'INVENTORY_VIEW');

    // First verify user is allowed to access the ornament
    const ornament = await this.getOrnamentById(ctx, ornamentId);
    if (!ornament) {
      throw new InventoryValidationError('Ornament not found or access denied.');
    }

    return this.db.stockMovement.findMany({
      where: {
        organizationId: ctx.tenantId,
        ornamentId,
      },
      include: {
        fromBranch: { select: { id: true, name: true, code: true, city: true } },
        toBranch: { select: { id: true, name: true, code: true, city: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // --------------------------------------------------------------------------
  // 7. Transfer Ornament Between Showrooms (Concurrency-Safe & Atomic)
  // --------------------------------------------------------------------------
  async transferOrnament(
    ctx: SecurityContext,
    input: TransferOrnamentInput
  ): Promise<{ ornament: SanitizedOrnament; movement: StockMovement }> {
    // 1. Security Check: INVENTORY_MANAGE + User must be authorized for BOTH source and destination
    assertPermission(ctx, 'INVENTORY_MANAGE');
    assertBranchAccess(ctx, input.fromBranchId);
    assertBranchAccess(ctx, input.toBranchId);

    // 2. Validate distinct branches
    if (input.fromBranchId === input.toBranchId) {
      throw new InventoryValidationError(
        'Source and destination branches must be distinct for an inter-branch transfer.'
      );
    }

    // 3. Verify destination branch exists in tenant
    const toBranch = await this.db.branch.findUnique({
      where: {
        organizationId_id: {
          organizationId: ctx.tenantId,
          id: input.toBranchId,
        },
      },
    });

    if (!toBranch) {
      throw new InventoryValidationError(
        `Destination branch '${input.toBranchId}' does not belong to your business.`
      );
    }

    // 4. Concurrency-Safe Atomic Transfer
    const result = await this.db.$transaction(async (tx) => {
      // Conditional update ensures only available stock at fromBranchId is moved.
      // If a concurrent transfer moved it or state changed, count is 0.
      const updateResult = await tx.ornament.updateMany({
        where: {
          id: input.ornamentId,
          organizationId: ctx.tenantId,
          branchId: input.fromBranchId,
          status: 'AVAILABLE',
        },
        data: {
          branchId: input.toBranchId,
          status: 'AVAILABLE', // Remains available at new showroom
        },
      });

      if (updateResult.count === 0) {
        // Detailed error diagnosis
        const current = await tx.ornament.findUnique({
          where: { id: input.ornamentId },
        });

        if (!current || current.organizationId !== ctx.tenantId) {
          throw new InventoryValidationError('Ornament not found in your enterprise stock.');
        }
        if (current.branchId !== input.fromBranchId) {
          throw new InventoryConflictError(
            `Transfer rejected: Ornament is currently at branch '${current.branchId}', not expected source branch '${input.fromBranchId}'.`
          );
        }
        if (current.status !== 'AVAILABLE') {
          throw new InventoryConflictError(
            `Transfer rejected: Ornament status is '${current.status}'. Only AVAILABLE stock may be transferred.`
          );
        }
        throw new InventoryConflictError('Concurrent transfer conflict detected. Please retry.');
      }

      // Record immutable ledger entry
      const movement = await tx.stockMovement.create({
        data: {
          organizationId: ctx.tenantId,
          ornamentId: input.ornamentId,
          fromBranchId: input.fromBranchId,
          toBranchId: input.toBranchId,
          movementType: 'TRANSFER',
          reason: input.reason || 'Inter-branch showroom stock transfer',
          userId: ctx.userId,
        },
      });

      const updatedOrnament = await tx.ornament.findUniqueOrThrow({
        where: { id: input.ornamentId },
        include: { product: true, branch: true },
      });

      await recordAuditLog(tx, ctx, {
        action: 'UPDATE',
        entityType: 'Ornament',
        entityId: updatedOrnament.id,
        changedFields: {
          action: 'TRANSFER',
          fromBranchId: input.fromBranchId,
          toBranchId: input.toBranchId,
          movementId: movement.id,
        },
      });

      return { ornament: updatedOrnament, movement };
    });

    return {
      ornament: sanitizeOrnamentForRole(result.ornament, ctx.role),
      movement: result.movement,
    };
  }

  // --------------------------------------------------------------------------
  // 8. Record Supported Stock Adjustments (Ledger-Backed)
  // --------------------------------------------------------------------------
  async recordStockAdjustment(
    ctx: SecurityContext,
    input: StockAdjustmentInput
  ): Promise<{ ornament: SanitizedOrnament; movement: StockMovement }> {
    assertPermission(ctx, 'INVENTORY_MANAGE');

    if (!input.reason?.trim()) {
      throw new InventoryValidationError('A valid audit reason is required for stock adjustments.');
    }

    // Resolve ornament & verify branch access
    const existing = await this.db.ornament.findUnique({
      where: {
        organizationId_id: {
          organizationId: ctx.tenantId,
          id: input.ornamentId,
        },
      },
    });

    if (!existing) {
      throw new InventoryValidationError('Ornament not found.');
    }

    assertBranchAccess(ctx, existing.branchId);

    const result = await this.db.$transaction(async (tx) => {
      // 1. Fetch current ornament state within the atomic transaction
      const current = await tx.ornament.findUnique({
        where: { id: input.ornamentId },
      });

      if (!current || current.organizationId !== ctx.tenantId) {
        throw new InventoryValidationError('Ornament not found in your enterprise stock.');
      }

      let updateData: Record<string, any> = {};
      let beforeState: Record<string, any> = {};
      let afterState: Record<string, any> = {};

      if (input.adjustmentType === 'STATUS_CHANGE') {
        const allowedStatuses = ['AVAILABLE', 'RESERVED', 'SOLD'];
        if (!input.newStatus || !allowedStatuses.includes(input.newStatus)) {
          throw new InventoryValidationError(
            `Invalid target status '${input.newStatus}'. Allowed: ${allowedStatuses.join(', ')}`
          );
        }
        beforeState = { status: current.status };
        afterState = { status: input.newStatus };
        updateData.status = input.newStatus;
      } else if (input.adjustmentType === 'WEIGHT_CORRECTION') {
        let gross = new Decimal(input.grossWeight ?? current.grossWeight);
        let stone = new Decimal(input.stoneWeight ?? current.stoneWeight);
        if (gross.lessThanOrEqualTo(0)) throw new InventoryValidationError('Gross weight must be > 0.');
        if (stone.lessThan(0)) throw new InventoryValidationError('Stone weight cannot be negative.');
        if (stone.greaterThan(gross)) throw new InventoryValidationError('Stone weight cannot exceed gross weight.');
        const net = gross.minus(stone);

        beforeState = {
          grossWeight: new Decimal(current.grossWeight).toFixed(3),
          stoneWeight: new Decimal(current.stoneWeight).toFixed(3),
          netWeight: new Decimal(current.netWeight).toFixed(3),
        };
        afterState = {
          grossWeight: gross.toFixed(3),
          stoneWeight: stone.toFixed(3),
          netWeight: net.toFixed(3),
        };

        updateData.grossWeight = gross.toFixed(3);
        updateData.stoneWeight = stone.toFixed(3);
        updateData.netWeight = net.toFixed(3);
      }

      const updatedOrnament = await tx.ornament.update({
        where: { id: input.ornamentId },
        data: updateData,
        include: { product: true, branch: true },
      });

      const metadata = {
        adjustmentType: input.adjustmentType,
        before: beforeState,
        after: afterState,
      };

      const movement = await tx.stockMovement.create({
        data: {
          organizationId: ctx.tenantId,
          ornamentId: input.ornamentId,
          fromBranchId: current.branchId,
          toBranchId: current.branchId,
          movementType: 'AUDIT_ADJUSTMENT',
          reason: `[${input.adjustmentType}] ${input.reason}`,
          metadata,
          userId: ctx.userId,
        },
      });

      await recordAuditLog(tx, ctx, {
        action: 'UPDATE',
        entityType: 'Ornament',
        entityId: updatedOrnament.id,
        changedFields: {
          adjustmentType: input.adjustmentType,
          before: beforeState,
          after: afterState,
          movementId: movement.id,
        },
      });

      return { ornament: updatedOrnament, movement };
    });

    return {
      ornament: sanitizeOrnamentForRole(result.ornament, ctx.role),
      movement: result.movement,
    };
  }
}
