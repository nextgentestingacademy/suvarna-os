'use server';

import { getServerSecurityContext } from '@/lib/security-context';
import { prisma as defaultPrisma } from '@/lib/db';
import {
  createCustomer,
  updateCustomer,
  getCustomerById,
  listCustomers,
  checkCustomerDuplicates,
  logCustomerInteraction,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerFilters,
  LogCustomerInteractionInput,
  DuplicateCheckResult,
  CustomerValidationError,
  CustomerNotFoundError,
} from '@/lib/customer';
import { Customer, CustomerInteraction } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { AuthorizationError } from '@/types/security';

export interface ActionOptions {
  headers?: Headers;
}

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface SerializedCustomer {
  id: string;
  organizationId: string;
  primaryBranchId: string | null;
  customerCode: string | null;
  name: string;
  phone: string;
  normalizedPhone: string;
  alternatePhone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  pan: string | null;
  dateOfBirth: string | null;
  anniversary: string | null;
  segment: string;
  notes: string | null;
  preferences: Record<string, any> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  primaryBranch?: {
    id: string;
    name: string;
    code: string;
    city?: string;
  } | null;
}

export interface SerializedCustomerInteraction {
  id: string;
  organizationId: string;
  customerId: string;
  channel: string;
  notes: string;
  followUpDate: string | null;
  userId: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface SerializedCustomerProfile extends SerializedCustomer {
  interactions: SerializedCustomerInteraction[];
  salesInvoices: never[];
  goldPurchases: never[];
  outstandingBalance: string;
}

export interface PaginatedCustomersResult {
  customers: SerializedCustomer[];
  totalCount: number;
  page: number;
  totalPages: number;
  limit: number;
}

function serializeCustomer(cust: any): SerializedCustomer {
  return {
    id: cust.id,
    organizationId: cust.organizationId,
    primaryBranchId: cust.primaryBranchId,
    customerCode: cust.customerCode,
    name: cust.name,
    phone: cust.phone,
    normalizedPhone: cust.normalizedPhone,
    alternatePhone: cust.alternatePhone,
    email: cust.email,
    addressLine1: cust.addressLine1,
    addressLine2: cust.addressLine2,
    city: cust.city,
    state: cust.state,
    pincode: cust.pincode,
    pan: cust.pan,
    dateOfBirth: cust.dateOfBirth ? cust.dateOfBirth.toISOString().split('T')[0] : null,
    anniversary: cust.anniversary ? cust.anniversary.toISOString().split('T')[0] : null,
    segment: cust.segment,
    notes: cust.notes,
    preferences: cust.preferences,
    isActive: cust.isActive,
    createdAt: cust.createdAt instanceof Date ? cust.createdAt.toISOString() : cust.createdAt,
    updatedAt: cust.updatedAt instanceof Date ? cust.updatedAt.toISOString() : cust.updatedAt,
    primaryBranch: cust.primaryBranch
      ? {
          id: cust.primaryBranch.id,
          name: cust.primaryBranch.name,
          code: cust.primaryBranch.code,
          city: cust.primaryBranch.city,
        }
      : null,
  };
}

function serializeInteraction(int: any): SerializedCustomerInteraction {
  return {
    id: int.id,
    organizationId: int.organizationId,
    customerId: int.customerId,
    channel: int.channel,
    notes: int.notes,
    followUpDate: int.followUpDate
      ? int.followUpDate instanceof Date
        ? int.followUpDate.toISOString().split('T')[0]
        : int.followUpDate
      : null,
    userId: int.userId,
    createdAt: int.createdAt instanceof Date ? int.createdAt.toISOString() : int.createdAt,
    user: int.user
      ? {
          id: int.user.id,
          name: int.user.name,
          email: int.user.email,
        }
      : null,
  };
}

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Gracefully ignore outside Next.js request context (e.g. during integration test suites)
  }
}

/**
 * Server action to register a new customer profile.
 */
export async function createCustomerAction(
  input: CreateCustomerInput,
  options?: ActionOptions
): Promise<ActionResult<SerializedCustomer>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const customer = await createCustomer(defaultPrisma, { ctx, input });
    safeRevalidatePath('/customers');
    return { success: true, data: serializeCustomer(customer) };
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: err.message, code: err.code };
    }
    if (err instanceof CustomerValidationError) {
      return { success: false, error: err.message, code: err.code };
    }
    return {
      success: false,
      error: err.message || 'An unexpected error occurred while registering the customer profile.',
      code: 'SERVER_ERROR',
    };
  }
}

/**
 * Server action to update an existing customer profile.
 */
export async function updateCustomerAction(
  customerId: string,
  input: UpdateCustomerInput,
  options?: ActionOptions
): Promise<ActionResult<SerializedCustomer>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const updated = await updateCustomer(defaultPrisma, { ctx, customerId, input });
    safeRevalidatePath('/customers');
    return { success: true, data: serializeCustomer(updated) };
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: err.message, code: err.code };
    }
    if (err instanceof CustomerNotFoundError) {
      return { success: false, error: err.message, code: err.code };
    }
    if (err instanceof CustomerValidationError) {
      return { success: false, error: err.message, code: err.code };
    }
    return {
      success: false,
      error: err.message || 'An unexpected error occurred while updating the customer profile.',
      code: 'SERVER_ERROR',
    };
  }
}

/**
 * Server action to retrieve a customer profile with interactions and branch details.
 */
export async function getCustomerByIdAction(
  customerId: string,
  options?: ActionOptions
): Promise<ActionResult<SerializedCustomerProfile>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const profile = await getCustomerById(defaultPrisma, { ctx, customerId });
    return {
      success: true,
      data: {
        ...serializeCustomer(profile),
        interactions: (profile.interactions || []).map(serializeInteraction),
        salesInvoices: [],
        goldPurchases: [],
        outstandingBalance: '0.00',
      },
    };
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: err.message, code: err.code };
    }
    if (err instanceof CustomerNotFoundError) {
      return { success: false, error: err.message, code: err.code };
    }
    return {
      success: false,
      error: err.message || 'An unexpected error occurred while retrieving the customer profile.',
      code: 'SERVER_ERROR',
    };
  }
}

/**
 * Server action to search and paginate customers.
 */
export async function listCustomersAction(
  filters?: CustomerFilters,
  page: number = 1,
  limit: number = 20,
  options?: ActionOptions
): Promise<ActionResult<PaginatedCustomersResult>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const result = await listCustomers(defaultPrisma, { ctx, filters, page, limit });
    return {
      success: true,
      data: {
        customers: result.customers.map(serializeCustomer),
        totalCount: result.totalCount,
        page: result.page,
        totalPages: result.totalPages,
        limit: result.limit,
      },
    };
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: err.message, code: err.code };
    }
    return {
      success: false,
      error: err.message || 'An unexpected error occurred while listing customers.',
      code: 'SERVER_ERROR',
    };
  }
}

/**
 * Server action to check for duplicate customers by phone or name.
 */
export async function checkCustomerDuplicatesAction(
  phone: string,
  name?: string,
  excludeCustomerId?: string,
  options?: ActionOptions
): Promise<ActionResult<DuplicateCheckResult>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const result = await checkCustomerDuplicates(defaultPrisma, { ctx, phone, name, excludeCustomerId });
    return { success: true, data: result };
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: err.message, code: err.code };
    }
    return {
      success: false,
      error: err.message || 'An unexpected error occurred while checking for duplicates.',
      code: 'SERVER_ERROR',
    };
  }
}

/**
 * Server action to log a customer interaction or follow-up note.
 */
export async function logCustomerInteractionAction(
  customerId: string,
  input: LogCustomerInteractionInput,
  options?: ActionOptions
): Promise<ActionResult<SerializedCustomerInteraction>> {
  try {
    const ctx = await getServerSecurityContext({ headers: options?.headers });
    const interaction = await logCustomerInteraction(defaultPrisma, { ctx, customerId, input });
    safeRevalidatePath('/customers');
    return { success: true, data: serializeInteraction(interaction) };
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return { success: false, error: err.message, code: err.code };
    }
    if (err instanceof CustomerNotFoundError) {
      return { success: false, error: err.message, code: err.code };
    }
    if (err instanceof CustomerValidationError) {
      return { success: false, error: err.message, code: err.code };
    }
    return {
      success: false,
      error: err.message || 'An unexpected error occurred while recording the customer interaction.',
      code: 'SERVER_ERROR',
    };
  }
}
