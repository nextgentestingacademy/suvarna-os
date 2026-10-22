import { PrismaClient } from '@prisma/client';
import { SecurityContext } from '@/types/security';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'otp',
  'pan',
  'aadhaar',
]);

/**
 * Recursively redacts sensitive keys from audit log payloads.
 */
export function sanitizeAuditData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'object') {
    if (Array.isArray(data)) {
      return data.map(sanitizeAuditData);
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeAuditData(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return data;
}

export interface RecordAuditParams {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ACCESS_DENIED' | 'LOGIN' | 'LOGOUT';
  entityType: 'Branch' | 'Member' | 'Organization' | 'User' | 'Product' | 'Ornament' | 'StockMovement' | 'Customer' | 'CustomerInteraction';
  entityId: string;
  changedFields?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Records a privacy-safe audit trail entry.
 */
export async function recordAuditLog(
  prismaClient: any,
  ctx: SecurityContext,
  params: RecordAuditParams
) {
  const sanitizedFields = params.changedFields
    ? (sanitizeAuditData(params.changedFields) as object)
    : undefined;

  return prismaClient.auditLog.create({
    data: {
      organizationId: ctx.tenantId,
      branchId: ctx.activeBranchId,
      userId: ctx.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      changedFields: sanitizedFields ?? undefined,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });
}
