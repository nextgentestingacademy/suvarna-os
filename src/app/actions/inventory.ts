'use server';

import { getServerSecurityContext } from '@/lib/security-context';
import {
  InventoryService,
  CreateProductInput,
  RegisterOrnamentInput,
  ProductFilters,
  OrnamentFilters,
  TransferOrnamentInput,
  StockAdjustmentInput,
  SanitizedOrnament,
} from '@/lib/inventory';
import { Product, StockMovement } from '@prisma/client';
import { Decimal } from 'decimal.js';

export interface ActionOptions {
  headers?: Headers;
}

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface SerializedProduct {
  id: string;
  organizationId: string;
  sku: string;
  name: string;
  category: string;
  metalType: string;
  purity: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedOrnament {
  id: string;
  organizationId: string;
  branchId: string;
  productId: string;
  tagCode: string;
  huid: string | null;
  metalType: string;
  purity: string;
  grossWeight: string;
  stoneWeight: string;
  netWeight: string;
  makingChargeType: string | null;
  makingChargeValue: string | null;
  costAmount: string | null;
  priceAmount: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  product?: SerializedProduct;
  branch?: {
    id: string;
    name: string;
    code: string;
    city: string;
  };
}

export interface SerializedStockMovement {
  id: string;
  organizationId: string;
  ornamentId: string;
  fromBranchId: string | null;
  toBranchId: string | null;
  movementType: string;
  reason: string | null;
  metadata?: Record<string, any> | null;
  userId: string | null;
  createdAt: string;
  fromBranch?: { id: string; name: string; code: string; city: string } | null;
  toBranch?: { id: string; name: string; code: string; city: string } | null;
  user?: { id: string; name: string | null; email: string } | null;
}

// --- Serialization Helpers for Server Action Boundary ---

function serializeProduct(prod: Product): SerializedProduct {
  return {
    id: prod.id,
    organizationId: prod.organizationId,
    sku: prod.sku,
    name: prod.name,
    category: prod.category,
    metalType: prod.metalType,
    purity: prod.purity,
    description: prod.description,
    imageUrl: prod.imageUrl,
    isActive: prod.isActive,
    createdAt: prod.createdAt.toISOString(),
    updatedAt: prod.updatedAt.toISOString(),
  };
}

function serializeOrnament(orn: any): SerializedOrnament {
  return {
    id: orn.id,
    organizationId: orn.organizationId,
    branchId: orn.branchId,
    productId: orn.productId,
    tagCode: orn.tagCode,
    huid: orn.huid,
    metalType: orn.metalType,
    purity: orn.purity,
    grossWeight: orn.grossWeight !== null && orn.grossWeight !== undefined ? new Decimal(orn.grossWeight).toFixed(3) : '0.000',
    stoneWeight: orn.stoneWeight !== null && orn.stoneWeight !== undefined ? new Decimal(orn.stoneWeight).toFixed(3) : '0.000',
    netWeight: orn.netWeight !== null && orn.netWeight !== undefined ? new Decimal(orn.netWeight).toFixed(3) : '0.000',
    makingChargeType: orn.makingChargeType,
    makingChargeValue: orn.makingChargeValue !== null && orn.makingChargeValue !== undefined ? new Decimal(orn.makingChargeValue).toString() : null,
    costAmount: orn.costAmount !== null && orn.costAmount !== undefined ? new Decimal(orn.costAmount).toFixed(2) : null,
    priceAmount: orn.priceAmount !== null && orn.priceAmount !== undefined ? new Decimal(orn.priceAmount).toFixed(2) : null,
    status: orn.status,
    createdAt: orn.createdAt instanceof Date ? orn.createdAt.toISOString() : orn.createdAt,
    updatedAt: orn.updatedAt instanceof Date ? orn.updatedAt.toISOString() : orn.updatedAt,
    product: orn.product ? serializeProduct(orn.product) : undefined,
    branch: orn.branch
      ? {
          id: orn.branch.id,
          name: orn.branch.name,
          code: orn.branch.code,
          city: orn.branch.city,
        }
      : undefined,
  };
}

function serializeMovement(m: any): SerializedStockMovement {
  return {
    id: m.id,
    organizationId: m.organizationId,
    ornamentId: m.ornamentId,
    fromBranchId: m.fromBranchId,
    toBranchId: m.toBranchId,
    movementType: m.movementType,
    reason: m.reason,
    metadata: m.metadata ? (typeof m.metadata === 'object' ? m.metadata : JSON.parse(m.metadata)) : null,
    userId: m.userId,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
    fromBranch: m.fromBranch ? { id: m.fromBranch.id, name: m.fromBranch.name, code: m.fromBranch.code, city: m.fromBranch.city } : null,
    toBranch: m.toBranch ? { id: m.toBranch.id, name: m.toBranch.name, code: m.toBranch.code, city: m.toBranch.city } : null,
    user: m.user ? { id: m.user.id, name: m.user.name, email: m.user.email } : null,
  };
}

// ----------------------------------------------------------------------------
// SERVER ACTIONS
// ----------------------------------------------------------------------------

const inventoryService = new InventoryService();

/**
 * Creates a new catalogue design product.
 * Requires INVENTORY_MANAGE permission.
 */
export async function createProductAction(
  input: CreateProductInput,
  options?: ActionOptions
): Promise<ActionResult<SerializedProduct>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const product = await inventoryService.createProduct(ctx, input);
    return { success: true, data: serializeProduct(product) };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to create product in catalogue.',
      code: err.code || 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Registers an individual physical ornament and atomically logs its initial INWARD movement.
 * Requires INVENTORY_MANAGE permission and branch access.
 */
export async function registerOrnamentAction(
  input: RegisterOrnamentInput,
  options?: ActionOptions
): Promise<ActionResult<{ ornament: SerializedOrnament; movement: SerializedStockMovement }>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const result = await inventoryService.registerOrnament(ctx, input);
    return {
      success: true,
      data: {
        ornament: serializeOrnament(result.ornament),
        movement: serializeMovement(result.movement),
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to register ornament.',
      code: err.code || 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Retrieves the permitted inventory listing for the active user's branches.
 * Cost amounts are automatically redacted for roles without financial visibility.
 */
export async function getInventoryListingAction(
  filters?: OrnamentFilters,
  options?: ActionOptions
): Promise<ActionResult<SerializedOrnament[]>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const ornaments = await inventoryService.getOrnaments(ctx, filters);
    return {
      success: true,
      data: ornaments.map(serializeOrnament),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to retrieve inventory.',
      code: err.code || 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Retrieves catalogue products for design selection in registration workflows.
 */
export async function getProductsAction(
  filters?: ProductFilters,
  options?: ActionOptions
): Promise<ActionResult<SerializedProduct[]>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const products = await inventoryService.getProducts(ctx, filters);
    return {
      success: true,
      data: products.map(serializeProduct),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to retrieve catalogue products.',
      code: err.code || 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Retrieves full details of a specific ornament.
 * Verifies branch access and enforces field-level redaction.
 */
export async function getOrnamentDetailAction(
  ornamentId: string,
  options?: ActionOptions
): Promise<ActionResult<SerializedOrnament | null>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const ornament = await inventoryService.getOrnamentById(ctx, ornamentId);
    return {
      success: true,
      data: ornament ? serializeOrnament(ornament) : null,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to retrieve ornament details.',
      code: err.code || 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Retrieves the immutable audit ledger of stock movements for an ornament.
 */
export async function getOrnamentMovementsAction(
  ornamentId: string,
  options?: ActionOptions
): Promise<ActionResult<SerializedStockMovement[]>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const movements = await inventoryService.getOrnamentMovements(ctx, ornamentId);
    return {
      success: true,
      data: movements.map(serializeMovement),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to retrieve movement ledger.',
      code: err.code || 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Transfers an available ornament between authorized branches in an atomic transaction.
 * Concurrency protection ensures outdated stock states are safely rejected.
 */
export async function transferOrnamentAction(
  input: TransferOrnamentInput,
  options?: ActionOptions
): Promise<ActionResult<{ ornament: SerializedOrnament; movement: SerializedStockMovement }>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const result = await inventoryService.transferOrnament(ctx, input);
    return {
      success: true,
      data: {
        ornament: serializeOrnament(result.ornament),
        movement: serializeMovement(result.movement),
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to transfer ornament.',
      code: err.code || 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Records a validated stock adjustment with mandatory audit explanation.
 */
export async function recordStockAdjustmentAction(
  input: StockAdjustmentInput,
  options?: ActionOptions
): Promise<ActionResult<{ ornament: SerializedOrnament; movement: SerializedStockMovement }>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const result = await inventoryService.recordStockAdjustment(ctx, input);
    return {
      success: true,
      data: {
        ornament: serializeOrnament(result.ornament),
        movement: serializeMovement(result.movement),
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to record stock adjustment.',
      code: err.code || 'UNKNOWN_ERROR',
    };
  }
}
