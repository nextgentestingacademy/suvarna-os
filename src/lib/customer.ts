import { PrismaClient, Customer, CustomerInteraction } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
import { SecurityContext, AuthorizationError } from '@/types/security';
import { assertPermission, assertBranchAccess } from '@/lib/rbac';
import { recordAuditLog } from '@/lib/audit';

// --- Typed Error Classes ---

export class CustomerValidationError extends Error {
  constructor(message: string, public readonly code: string = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'CustomerValidationError';
  }
}

export class CustomerNotFoundError extends Error {
  constructor(message: string = 'Customer not found or access denied', public readonly code: string = 'NOT_FOUND') {
    super(message);
    this.name = 'CustomerNotFoundError';
  }
}

import { INDIAN_STATES_AND_UTS, IndianStateOrUT } from './customer-constants';
export { INDIAN_STATES_AND_UTS };
export type { IndianStateOrUT };

// --- Validation & Normalization Helpers ---

/**
 * Validates and normalizes customer name.
 * - Rejects empty, whitespace-only, or numeric-containing names.
 * - Supports legitimate Indian and international names, including Unicode scripts (Devanagari, Tamil, etc.),
 *   combining marks (\p{M}), spaces, hyphens, apostrophes, and periods for initials.
 */
export function validateCustomerName(raw: string): { valid: boolean; normalized: string; error?: string } {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, normalized: '', error: 'Customer name is required.' };
  }
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2) {
    return { valid: false, normalized: '', error: 'Customer name must be at least 2 characters.' };
  }
  if (trimmed.length > 100) {
    return { valid: false, normalized: '', error: 'Customer name cannot exceed 100 characters.' };
  }
  // Reject names containing digits
  if (/\d/.test(trimmed)) {
    return { valid: false, normalized: '', error: 'Customer name cannot contain numbers.' };
  }
  // Unicode letters (\p{L}), combining vowel/diacritic marks (\p{M}), spaces, periods, apostrophes, hyphens
  if (!/^[\p{L}\p{M}\s.'-]+$/u.test(trimmed)) {
    return {
      valid: false,
      normalized: '',
      error: 'Customer name can only contain letters, spaces, hyphens, apostrophes, and periods.',
    };
  }
  return { valid: true, normalized: trimmed };
}

/**
 * Normalizes Indian mobile phone numbers to a consistent 10-digit format for search and comparison.
 * Strips non-digits, leading country codes (+91, 91), and leading zeros.
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  
  // If 12 digits starting with 91 (e.g. 919820012345), strip 91
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  // If 11 digits starting with 0 (e.g. 09820012345), strip 0
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

/**
 * Validates whether a normalized phone number matches legitimate Indian mobile phone patterns (10 digits starting with 6, 7, 8, or 9).
 */
export function isValidIndianPhone(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  return /^[6-9]\d{9}$/.test(normalized);
}

/**
 * Validates optional alternate phone number.
 * Allows blank/empty values. When populated, strictly enforces Indian 10-digit format.
 */
export function validateAlternatePhone(raw?: string | null): { valid: boolean; normalized: string | null; error?: string } {
  if (!raw || !raw.trim()) {
    return { valid: true, normalized: null };
  }
  const trimmed = raw.trim();
  const normalized = normalizePhoneNumber(trimmed);
  if (!isValidIndianPhone(normalized)) {
    return {
      valid: false,
      normalized: null,
      error: 'Please enter a valid 10-digit Indian phone number for Alternate Phone.',
    };
  }
  return { valid: true, normalized };
}

/**
 * Validates Indian City names.
 * Rejects digits and numeric-only strings.
 * Supports Unicode and punctuation (e.g., Bengaluru, New Delhi, तिरुचिरापल्ली).
 */
export function validateCity(raw?: string | null): { valid: boolean; normalized: string | null; error?: string } {
  if (!raw || !raw.trim()) {
    return { valid: true, normalized: null };
  }
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2) {
    return { valid: false, normalized: null, error: 'City name must be at least 2 characters.' };
  }
  if (trimmed.length > 60) {
    return { valid: false, normalized: null, error: 'City name cannot exceed 60 characters.' };
  }
  if (/\d/.test(trimmed)) {
    return { valid: false, normalized: null, error: 'City name cannot contain numbers.' };
  }
  if (!/^[\p{L}\p{M}\s.'-]+$/u.test(trimmed)) {
    return {
      valid: false,
      normalized: null,
      error: 'City name can only contain letters, spaces, hyphens, and periods.',
    };
  }
  return { valid: true, normalized: trimmed };
}

/**
 * Validates Indian State / Union Territory.
 * Case-insensitively matches against standard 36 States/UTs.
 * Returns canonical capitalization.
 */
export function validateState(raw?: string | null): { valid: boolean; normalized: string | null; error?: string } {
  if (!raw || !raw.trim()) {
    return { valid: true, normalized: null };
  }
  const trimmed = raw.trim();
  const matched = INDIAN_STATES_AND_UTS.find(
    (s) => s.toLowerCase() === trimmed.toLowerCase()
  );
  if (!matched) {
    return {
      valid: false,
      normalized: null,
      error: 'Please select a valid Indian State or Union Territory.',
    };
  }
  return { valid: true, normalized: matched };
}

/**
 * Validates Indian Permanent Account Number (PAN) format: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).
 */
export function isValidPAN(pan: string): boolean {
  if (!pan) return true;
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.trim().toUpperCase());
}

/**
 * Validates Indian postal PIN code: exactly 6 digits.
 */
export function isValidPincode(pincode: string): boolean {
  if (!pincode) return true;
  return /^\d{6}$/.test(pincode.trim());
}

/**
 * Validates birthday and anniversary dates.
 * - Rejects malformed dates and impossible calendar dates (e.g., Feb 30).
 * - Enforces sensible year boundaries:
 *   - Birthday: 0 to 120 years old (currentYear - 120 <= year <= currentYear). No future births.
 *   - Anniversary: currentYear - 100 <= year <= currentYear + 1.
 * - Anchors persisted Date object at UTC 12:00:00 to prevent timezone day shifts.
 */
export function validateCustomerDate(
  raw: string | Date | null | undefined,
  type: 'BIRTHDAY' | 'ANNIVERSARY'
): { valid: boolean; date: Date | null; error?: string } {
  if (!raw) return { valid: true, date: null };

  let dateStr = '';
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) {
      return { valid: false, date: null, error: 'Invalid date format.' };
    }
    dateStr = raw.toISOString().split('T')[0];
  } else if (typeof raw === 'string') {
    dateStr = raw.trim();
  }

  if (!dateStr) return { valid: true, date: null };

  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { valid: false, date: null, error: 'Date must be in YYYY-MM-DD format.' };
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { valid: false, date: null, error: 'Invalid calendar month or day.' };
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();

  if (type === 'BIRTHDAY') {
    const minYear = currentYear - 120;
    if (year < minYear || year > currentYear) {
      if (year > currentYear) {
        return { valid: false, date: null, error: `Birthday cannot be in the future (Year must be between ${minYear} and ${currentYear}).` };
      }
      return {
        valid: false,
        date: null,
        error: `Year must be between ${minYear} and ${currentYear}.`,
      };
    }
  } else if (type === 'ANNIVERSARY') {
    const minYear = currentYear - 100;
    const maxYear = currentYear + 1;
    if (year < minYear || year > maxYear) {
      return {
        valid: false,
        date: null,
        error: `Year must be between ${minYear} and ${maxYear}.`,
      };
    }
  }

  // Verify calendar validity (leap days, month day counts)
  const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (year < 100) {
    utcDate.setUTCFullYear(year);
  }
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return { valid: false, date: null, error: 'Invalid calendar date for the given month and year.' };
  }

  if (type === 'BIRTHDAY' && utcDate > now) {
    return { valid: false, date: null, error: 'Birthday cannot be in the future.' };
  }

  return { valid: true, date: utcDate };
}

// --- Service Types ---

export interface CreateCustomerInput {
  name: string;
  phone: string;
  alternatePhone?: string | null;
  email?: string | null;
  primaryBranchId?: string | null;
  customerCode?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  pan?: string | null;
  dateOfBirth?: string | Date | null;
  anniversary?: string | Date | null;
  segment?: string;
  notes?: string | null;
  preferences?: Record<string, unknown> | null;
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string;
  alternatePhone?: string | null;
  email?: string | null;
  primaryBranchId?: string | null;
  customerCode?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  pan?: string | null;
  dateOfBirth?: string | Date | null;
  anniversary?: string | Date | null;
  segment?: string;
  notes?: string | null;
  preferences?: Record<string, unknown> | null;
  isActive?: boolean;
}

export interface CustomerFilters {
  searchQuery?: string;
  segment?: string;
  branchId?: string;
  isActive?: boolean;
}

export interface LogCustomerInteractionInput {
  channel: 'WALK_IN' | 'PHONE' | 'WHATSAPP' | 'FOLLOW_UP' | string;
  notes: string;
  followUpDate?: string | Date | null;
}

export interface CustomerDuplicateMatch {
  id: string;
  customerCode: string | null;
  name: string;
  phone: string;
  segment: string;
  createdAt: Date;
}

export interface DuplicateCheckResult {
  hasDuplicates: boolean;
  phoneMatches: CustomerDuplicateMatch[];
  nameMatches: CustomerDuplicateMatch[];
}

export interface CustomerProfile extends Customer {
  primaryBranch: { id: string; name: string; code: string; city: string } | null;
  interactions: (CustomerInteraction & {
    user: { id: string; name: string; email: string } | null;
  })[];
  salesInvoices: never[];
  goldPurchases: never[];
  outstandingBalance: string;
}

// --- Service Implementation ---

/**
 * Checks for potential customer duplicates within the tenant by normalized phone and optionally name.
 * Does NOT reject creation; returns potential matches for informational/warning purposes.
 */
export async function checkCustomerDuplicates(
  prismaClient: PrismaClient,
  options: {
    ctx: SecurityContext;
    phone: string;
    name?: string;
    excludeCustomerId?: string;
  }
): Promise<DuplicateCheckResult> {
  const { ctx, phone, name, excludeCustomerId } = options;
  assertPermission(ctx, 'BILLING_CREATE');

  const normalized = normalizePhoneNumber(phone);
  if (!normalized) {
    return { hasDuplicates: false, phoneMatches: [], nameMatches: [] };
  }

  const phoneQuery: any = {
    organizationId: ctx.tenantId,
    normalizedPhone: normalized,
  };
  if (excludeCustomerId) {
    phoneQuery.id = { not: excludeCustomerId };
  }

  const phoneMatches = await (prismaClient as any).customer.findMany({
    where: phoneQuery,
    select: {
      id: true,
      customerCode: true,
      name: true,
      phone: true,
      segment: true,
      createdAt: true,
    },
    take: 5,
  });

  let nameMatches: CustomerDuplicateMatch[] = [];
  if (name && name.trim().length >= 3) {
    const nameQuery: any = {
      organizationId: ctx.tenantId,
      name: { contains: name.trim(), mode: 'insensitive' },
    };
    if (excludeCustomerId) {
      nameQuery.id = { not: excludeCustomerId };
    }
    const phoneMatchIds = new Set(phoneMatches.map((m: any) => m.id));
    nameMatches = (
      await (prismaClient as any).customer.findMany({
        where: nameQuery,
        select: {
          id: true,
          customerCode: true,
          name: true,
          phone: true,
          segment: true,
          createdAt: true,
        },
        take: 5,
      })
    ).filter((m: any) => !phoneMatchIds.has(m.id));
  }

  const hasDuplicates = phoneMatches.length > 0;
  return { hasDuplicates, phoneMatches, nameMatches };
}

/**
 * Creates a new customer profile within the authenticated tenant.
 */
export async function createCustomer(
  prismaClient: PrismaClient,
  options: {
    ctx: SecurityContext;
    input: CreateCustomerInput;
  }
): Promise<Customer & { primaryBranch: { id: string; name: string; code: string; city: string } | null }> {
  const { ctx, input } = options;
  assertPermission(ctx, 'BILLING_CREATE');

  // Validate Name (Defect A: reject digits, support Unicode Indian names)
  const nameValidation = validateCustomerName(input.name);
  if (!nameValidation.valid) {
    throw new CustomerValidationError(nameValidation.error!);
  }
  const cleanName = nameValidation.normalized;

  // Validate and Normalize Primary Phone
  const rawPhone = input.phone?.trim();
  if (!rawPhone) {
    throw new CustomerValidationError('Primary phone number is required.');
  }
  const normalizedPhone = normalizePhoneNumber(rawPhone);
  if (!isValidIndianPhone(normalizedPhone)) {
    throw new CustomerValidationError('Please enter a valid 10-digit Indian mobile number.');
  }

  // Validate Alternate Phone (Defect B: validate when provided, allow blank)
  const altValidation = validateAlternatePhone(input.alternatePhone);
  if (!altValidation.valid) {
    throw new CustomerValidationError(altValidation.error!);
  }
  const cleanAlternatePhone = altValidation.normalized;

  // Validate Email if present
  let cleanEmail: string | null = null;
  if (input.email && input.email.trim()) {
    cleanEmail = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new CustomerValidationError('Invalid email address format.');
    }
  }

  // Validate PAN if present
  let cleanPAN: string | null = null;
  if (input.pan && input.pan.trim()) {
    cleanPAN = input.pan.trim().toUpperCase();
    if (!isValidPAN(cleanPAN)) {
      throw new CustomerValidationError('Invalid PAN format. Must be 10 alphanumeric characters (e.g. ABCDE1234F).');
    }
  }

  // Validate City (Defect C: reject digits, validate length & Unicode)
  const cityValidation = validateCity(input.city);
  if (!cityValidation.valid) {
    throw new CustomerValidationError(cityValidation.error!);
  }
  const cleanCity = cityValidation.normalized;

  // Validate State (Defect C & F: validate against 36 Indian States/UTs, do not default to Maharashtra)
  const stateValidation = validateState(input.state);
  if (!stateValidation.valid) {
    throw new CustomerValidationError(stateValidation.error!);
  }
  const cleanState = stateValidation.normalized;

  // Validate Pincode if present
  let cleanPincode: string | null = null;
  if (input.pincode && input.pincode.trim()) {
    cleanPincode = input.pincode.trim();
    if (!isValidPincode(cleanPincode)) {
      throw new CustomerValidationError('Invalid PIN code format. Must be exactly 6 digits.');
    }
  }

  // Validate Dates (Defect D: reject early years like 0011, impossible dates, future birthdays)
  const dobValidation = validateCustomerDate(input.dateOfBirth, 'BIRTHDAY');
  if (!dobValidation.valid) {
    throw new CustomerValidationError(dobValidation.error!);
  }
  const dateOfBirth = dobValidation.date;

  const annivValidation = validateCustomerDate(input.anniversary, 'ANNIVERSARY');
  if (!annivValidation.valid) {
    throw new CustomerValidationError(annivValidation.error!);
  }
  const anniversary = annivValidation.date;

  // Branch Access verification (Defect E: persist selected showroom branch)
  let primaryBranchId: string | null = null;
  if (input.primaryBranchId && input.primaryBranchId.trim()) {
    assertBranchAccess(ctx, input.primaryBranchId.trim());
    primaryBranchId = input.primaryBranchId.trim();
  } else if (ctx.activeBranchId && ctx.allowedBranchIds.includes(ctx.activeBranchId)) {
    primaryBranchId = ctx.activeBranchId;
  } else if (ctx.allowedBranchIds.length > 0) {
    primaryBranchId = ctx.allowedBranchIds[0];
  }

  // Customer Code generation if not provided
  let customerCode = input.customerCode?.trim();
  if (!customerCode) {
    const count = await (prismaClient as any).customer.count({
      where: { organizationId: ctx.tenantId },
    });
    customerCode = `CUST-${(count + 1001).toString()}`;
  }

  // Persist customer with primaryBranch relation included
  const customer = await (prismaClient as any).customer.create({
    data: {
      organizationId: ctx.tenantId,
      primaryBranchId,
      customerCode,
      name: cleanName,
      phone: rawPhone,
      normalizedPhone,
      alternatePhone: cleanAlternatePhone,
      email: cleanEmail,
      addressLine1: input.addressLine1?.trim() || null,
      addressLine2: input.addressLine2?.trim() || null,
      city: cleanCity,
      state: cleanState,
      pincode: cleanPincode,
      pan: cleanPAN,
      dateOfBirth,
      anniversary,
      segment: input.segment?.trim() || 'RETAIL',
      notes: input.notes?.trim() || null,
      preferences: input.preferences || undefined,
      isActive: true,
    },
    include: {
      primaryBranch: {
        select: { id: true, name: true, code: true, city: true },
      },
    },
  });

  // Record Audit Log (sensitive data like PAN is automatically redacted by sanitizeAuditData)
  await recordAuditLog(prismaClient, ctx, {
    action: 'CREATE',
    entityType: 'Customer',
    entityId: customer.id,
    changedFields: {
      name: customer.name,
      phone: customer.phone,
      customerCode: customer.customerCode,
      segment: customer.segment,
      primaryBranchId: customer.primaryBranchId,
      city: customer.city,
      state: customer.state,
    },
  });

  return customer;
}

/**
 * Updates an existing customer profile within the authenticated tenant.
 */
export async function updateCustomer(
  prismaClient: PrismaClient,
  options: {
    ctx: SecurityContext;
    customerId: string;
    input: UpdateCustomerInput;
  }
): Promise<Customer & { primaryBranch: { id: string; name: string; code: string; city: string } | null }> {
  const { ctx, customerId, input } = options;
  assertPermission(ctx, 'BILLING_CREATE');

  // Verify existing customer exists in tenant
  const existing = await (prismaClient as any).customer.findFirst({
    where: {
      id: customerId,
      organizationId: ctx.tenantId,
    },
  });

  if (!existing) {
    throw new CustomerNotFoundError();
  }

  const updateData: any = {};
  const changedFields: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const nameValidation = validateCustomerName(input.name);
    if (!nameValidation.valid) {
      throw new CustomerValidationError(nameValidation.error!);
    }
    updateData.name = nameValidation.normalized;
    changedFields.name = { before: existing.name, after: nameValidation.normalized };
  }

  if (input.phone !== undefined) {
    const raw = input.phone.trim();
    const normalized = normalizePhoneNumber(raw);
    if (!isValidIndianPhone(normalized)) {
      throw new CustomerValidationError('Please enter a valid 10-digit Indian mobile number.');
    }
    updateData.phone = raw;
    updateData.normalizedPhone = normalized;
    changedFields.phone = { before: existing.phone, after: raw };
  }

  if (input.alternatePhone !== undefined) {
    const altValidation = validateAlternatePhone(input.alternatePhone);
    if (!altValidation.valid) {
      throw new CustomerValidationError(altValidation.error!);
    }
    updateData.alternatePhone = altValidation.normalized;
    changedFields.alternatePhone = { before: existing.alternatePhone, after: altValidation.normalized };
  }

  if (input.email !== undefined) {
    if (input.email && input.email.trim()) {
      const cleanEmail = input.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        throw new CustomerValidationError('Invalid email address format.');
      }
      updateData.email = cleanEmail;
    } else {
      updateData.email = null;
    }
  }

  if (input.pan !== undefined) {
    if (input.pan && input.pan.trim()) {
      const cleanPAN = input.pan.trim().toUpperCase();
      if (!isValidPAN(cleanPAN)) {
        throw new CustomerValidationError('Invalid PAN format. Must be 10 alphanumeric characters.');
      }
      updateData.pan = cleanPAN;
    } else {
      updateData.pan = null;
    }
  }

  if (input.city !== undefined) {
    const cityValidation = validateCity(input.city);
    if (!cityValidation.valid) {
      throw new CustomerValidationError(cityValidation.error!);
    }
    updateData.city = cityValidation.normalized;
  }

  if (input.state !== undefined) {
    const stateValidation = validateState(input.state);
    if (!stateValidation.valid) {
      throw new CustomerValidationError(stateValidation.error!);
    }
    updateData.state = stateValidation.normalized;
    changedFields.state = { before: existing.state, after: stateValidation.normalized };
  }

  if (input.pincode !== undefined) {
    if (input.pincode && input.pincode.trim()) {
      const cleanPincode = input.pincode.trim();
      if (!isValidPincode(cleanPincode)) {
        throw new CustomerValidationError('Invalid PIN code format. Must be exactly 6 digits.');
      }
      updateData.pincode = cleanPincode;
    } else {
      updateData.pincode = null;
    }
  }

  if (input.primaryBranchId !== undefined) {
    if (input.primaryBranchId && input.primaryBranchId.trim()) {
      assertBranchAccess(ctx, input.primaryBranchId.trim());
      updateData.primaryBranchId = input.primaryBranchId.trim();
    } else {
      updateData.primaryBranchId = null;
    }
    changedFields.primaryBranchId = { before: existing.primaryBranchId, after: updateData.primaryBranchId };
  }

  if (input.dateOfBirth !== undefined) {
    const dobValidation = validateCustomerDate(input.dateOfBirth, 'BIRTHDAY');
    if (!dobValidation.valid) {
      throw new CustomerValidationError(dobValidation.error!);
    }
    updateData.dateOfBirth = dobValidation.date;
  }

  if (input.anniversary !== undefined) {
    const annivValidation = validateCustomerDate(input.anniversary, 'ANNIVERSARY');
    if (!annivValidation.valid) {
      throw new CustomerValidationError(annivValidation.error!);
    }
    updateData.anniversary = annivValidation.date;
  }

  if (input.addressLine1 !== undefined) updateData.addressLine1 = input.addressLine1?.trim() || null;
  if (input.addressLine2 !== undefined) updateData.addressLine2 = input.addressLine2?.trim() || null;
  if (input.segment !== undefined) updateData.segment = input.segment?.trim() || existing.segment;
  if (input.notes !== undefined) updateData.notes = input.notes?.trim() || null;
  if (input.preferences !== undefined) updateData.preferences = input.preferences || null;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;

  const updated = await (prismaClient as any).customer.update({
    where: { id: customerId },
    data: updateData,
    include: {
      primaryBranch: {
        select: { id: true, name: true, code: true, city: true },
      },
    },
  });

  await recordAuditLog(prismaClient, ctx, {
    action: 'UPDATE',
    entityType: 'Customer',
    entityId: updated.id,
    changedFields,
  });

  return updated;
}

/**
 * Retrieves a customer profile by ID, ensuring strict tenant scoping.
 * Returns profile with primary branch, interaction history, and future transaction extension points.
 */
export async function getCustomerById(
  prismaClient: PrismaClient,
  options: {
    ctx: SecurityContext;
    customerId: string;
  }
): Promise<CustomerProfile> {
  const { ctx, customerId } = options;
  assertPermission(ctx, 'BILLING_CREATE');

  const customer = await (prismaClient as any).customer.findFirst({
    where: {
      id: customerId,
      organizationId: ctx.tenantId,
    },
    include: {
      primaryBranch: {
        select: { id: true, name: true, code: true, city: true },
      },
      interactions: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  if (!customer) {
    throw new CustomerNotFoundError();
  }

  return {
    ...customer,
    salesInvoices: [],
    goldPurchases: [],
    outstandingBalance: '0.00',
  };
}

/**
 * Searches and paginates customers within the authenticated tenant.
 */
export async function listCustomers(
  prismaClient: PrismaClient,
  options: {
    ctx: SecurityContext;
    filters?: CustomerFilters;
    page?: number;
    limit?: number;
  }
): Promise<{
  customers: (Customer & { primaryBranch: { id: string; name: string; code: string; city?: string } | null })[];
  totalCount: number;
  page: number;
  totalPages: number;
  limit: number;
}> {
  const { ctx, filters = {}, page = 1, limit = 20 } = options;
  assertPermission(ctx, 'BILLING_CREATE');

  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const skip = (safePage - 1) * safeLimit;

  const where: any = {
    organizationId: ctx.tenantId,
  };

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters.segment && filters.segment !== 'All') {
    where.segment = filters.segment;
  }

  if (filters.branchId) {
    where.primaryBranchId = filters.branchId;
  }

  if (filters.searchQuery && filters.searchQuery.trim()) {
    const rawQuery = filters.searchQuery.trim();
    const normalizedDigits = normalizePhoneNumber(rawQuery);

    const orConditions: any[] = [
      { name: { contains: rawQuery, mode: 'insensitive' } },
      { customerCode: { contains: rawQuery, mode: 'insensitive' } },
      { email: { contains: rawQuery, mode: 'insensitive' } },
    ];

    if (normalizedDigits.length >= 3) {
      orConditions.push({ normalizedPhone: { contains: normalizedDigits } });
    }

    where.OR = orConditions;
  }

  const [totalCount, customers] = await Promise.all([
    (prismaClient as any).customer.count({ where }),
    (prismaClient as any).customer.findMany({
      where,
      include: {
        primaryBranch: {
          select: { id: true, name: true, code: true, city: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: safeLimit,
    }),
  ]);

  return {
    customers,
    totalCount,
    page: safePage,
    totalPages: Math.ceil(totalCount / safeLimit) || 1,
    limit: safeLimit,
  };
}

/**
 * Logs a customer interaction or enquiry (e.g. showroom walk-in, phone follow-up, bridal appointment).
 */
export async function logCustomerInteraction(
  prismaClient: PrismaClient,
  options: {
    ctx: SecurityContext;
    customerId: string;
    input: LogCustomerInteractionInput;
  }
): Promise<CustomerInteraction> {
  const { ctx, customerId, input } = options;
  assertPermission(ctx, 'BILLING_CREATE');

  const trimmedNotes = input.notes?.trim();
  if (!trimmedNotes || trimmedNotes.length < 2) {
    throw new CustomerValidationError('Interaction notes are required.');
  }

  // Verify customer belongs to tenant
  const customer = await (prismaClient as any).customer.findFirst({
    where: {
      id: customerId,
      organizationId: ctx.tenantId,
    },
  });

  if (!customer) {
    throw new CustomerNotFoundError();
  }

  const followUpDate = input.followUpDate ? new Date(input.followUpDate) : null;

  const interaction = await (prismaClient as any).customerInteraction.create({
    data: {
      organizationId: ctx.tenantId,
      customerId: customer.id,
      channel: input.channel || 'WALK_IN',
      notes: trimmedNotes,
      followUpDate,
      userId: ctx.userId,
    },
  });

  await recordAuditLog(prismaClient, ctx, {
    action: 'CREATE',
    entityType: 'CustomerInteraction',
    entityId: interaction.id,
    changedFields: {
      customerId: customer.id,
      channel: interaction.channel,
      followUpDate: interaction.followUpDate,
    },
  });

  return interaction;
}
