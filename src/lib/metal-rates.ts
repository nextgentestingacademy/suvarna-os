import { PrismaClient, MetalRate } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
import { SecurityContext } from '@/types/security';
import { assertPermission } from '@/lib/rbac';
import { recordAuditLog } from '@/lib/audit';
import { Decimal } from '@/lib/decimal';
import { INDICATIVE_DAILY_RATES } from '@/lib/indicative-pricing';

// ==============================================================================
// TYPED ERROR CLASSES
// ==============================================================================

export class RateValidationError extends Error {
  constructor(message: string, public readonly code: string = 'RATE_VALIDATION_ERROR') {
    super(message);
    this.name = 'RateValidationError';
  }
}

export class RateUnavailableError extends Error {
  constructor(message: string, public readonly code: string = 'RATE_UNAVAILABLE') {
    super(message);
    this.name = 'RateUnavailableError';
  }
}

// ==============================================================================
// DOMAIN CONSTANTS & TYPES
// ==============================================================================

export const SUPPORTED_METALS = ['GOLD', 'SILVER'] as const;
export type SupportedMetal = (typeof SUPPORTED_METALS)[number];

export const SUPPORTED_GOLD_PURITIES = ['24K', '22K', '18K', '14K'] as const;
export const SUPPORTED_SILVER_PURITIES = ['SILVER', '999'] as const;

export type RateType = 'BUYING' | 'SELLING';
export type RateSource = 'MANUAL' | 'FEED' | 'IMPORT' | 'INDICATIVE_BASELINE';

export interface ConfigureRateInput {
  metalType: string;
  purity: string;
  rateType: RateType;
  ratePerGram: number | string | Decimal;
  effectiveFrom?: Date | string;
  branchId?: string | null;
  notes?: string | null;
  source?: 'MANUAL' | 'FEED' | 'IMPORT';
}

export interface ResolvedRate {
  ratePerGram: Decimal;
  metalType: string;
  purity: string;
  rateType: RateType;
  source: RateSource;
  effectiveFrom: Date;
  metalRateId?: string;
  isConfigured: boolean;
  notes?: string | null;
}

export interface ActiveRatesSummary {
  buying: Record<string, ResolvedRate | null>;
  selling: Record<string, ResolvedRate>;
}

// ==============================================================================
// METAL RATE SERVICE
// ==============================================================================

export class MetalRateService {
  private readonly db: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.db = prismaClient || defaultPrisma;
  }

  /**
   * Normalizes and validates metal and purity combination.
   */
  public normalizeMetalAndPurity(metal: string, purity: string): { metalType: SupportedMetal; normalizedPurity: string } {
    const normMetal = (metal || '').toUpperCase().trim();
    const normPurity = (purity || '').toUpperCase().trim();

    if (normMetal === 'SILVER') {
      return {
        metalType: 'SILVER',
        normalizedPurity: 'SILVER',
      };
    }

    if (normMetal === 'GOLD') {
      if (!(SUPPORTED_GOLD_PURITIES as readonly string[]).includes(normPurity)) {
        throw new RateValidationError(
          `Unsupported gold purity: '${purity}'. Supported gold purities: ${SUPPORTED_GOLD_PURITIES.join(', ')}.`,
          'INVALID_PURITY'
        );
      }
      return {
        metalType: 'GOLD',
        normalizedPurity: normPurity,
      };
    }

    throw new RateValidationError(
      `Unsupported metal type: '${metal}'. Supported metals: ${SUPPORTED_METALS.join(', ')}.`,
      'INVALID_METAL_TYPE'
    );
  }

  /**
   * Configures a distinct buying or selling rate for a specific metal and purity.
   * - Restricts mutation to users with RATES_MANAGE permission (OWNER, MANAGER).
   * - Enforces tenant isolation.
   * - Stores buying and selling rates as distinct records (changing one never modifies the other).
   * - Retains full historical records with effective timestamps and creator attribution.
   */
  async configureRate(
    ctx: SecurityContext,
    input: ConfigureRateInput,
    options?: { tx?: PrismaClient }
  ): Promise<MetalRate> {
    assertPermission(ctx, 'RATES_MANAGE');

    const client = (options?.tx || this.db) as PrismaClient;
    const { metalType, normalizedPurity } = this.normalizeMetalAndPurity(input.metalType, input.purity);

    const rateType = input.rateType?.toUpperCase() as RateType;
    if (rateType !== 'BUYING' && rateType !== 'SELLING') {
      throw new RateValidationError("Rate type must be strictly 'BUYING' or 'SELLING'.", 'INVALID_RATE_TYPE');
    }

    if (input.ratePerGram === undefined || input.ratePerGram === null || String(input.ratePerGram).trim() === '') {
      throw new RateValidationError('Rate per gram is required.', 'INVALID_RATE_VALUE');
    }

    let rateDec: Decimal;
    try {
      rateDec = new Decimal(input.ratePerGram).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      if (rateDec.isNaN() || rateDec.lessThanOrEqualTo(0)) {
        throw new Error();
      }
    } catch {
      throw new RateValidationError(
        `Rate per gram must be a positive number with at most 2 decimal places. Received: '${input.ratePerGram}'.`,
        'INVALID_RATE_VALUE'
      );
    }

    const effectiveDate = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    if (isNaN(effectiveDate.getTime())) {
      throw new RateValidationError('Invalid effective date format.', 'INVALID_EFFECTIVE_DATE');
    }

    // Retain previous active rate history by setting effectiveTo
    await client.metalRate.updateMany({
      where: {
        organizationId: ctx.tenantId,
        metalType,
        purity: normalizedPurity,
        rateType,
        isActive: true,
        effectiveTo: null,
      },
      data: {
        effectiveTo: effectiveDate,
        isActive: false,
      },
    });

    const newRate = await client.metalRate.create({
      data: {
        organizationId: ctx.tenantId,
        branchId: input.branchId || null,
        metalType,
        purity: normalizedPurity,
        rateType,
        ratePerGram: rateDec.toFixed(2),
        source: input.source || 'MANUAL',
        effectiveFrom: effectiveDate,
        effectiveTo: null,
        isActive: true,
        notes: input.notes?.trim() || null,
        createdByUserId: ctx.userId,
      },
      include: {
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await recordAuditLog(client, ctx, {
      action: 'CREATE',
      entityType: 'MetalRate',
      entityId: newRate.id,
      changedFields: {
        metalType,
        purity: normalizedPurity,
        rateType,
        ratePerGram: rateDec.toFixed(2),
        source: input.source || 'MANUAL',
        effectiveFrom: effectiveDate.toISOString(),
      },
    });

    return newRate;
  }

  /**
   * Retrieves the effective buying rate for a given metal and purity.
   * - Checks tenant-specific configured buying rates.
   * - NEVER falls back to selling rate or unrelated purity.
   * - If no rate exists, throws RateUnavailableError with instructions.
   */
  async getBuyingRate(
    ctx: SecurityContext,
    query: { metalType: string; purity: string; branchId?: string | null; asOfDate?: Date },
    options?: { tx?: PrismaClient }
  ): Promise<ResolvedRate> {
    const client = (options?.tx || this.db) as PrismaClient;
    const { metalType, normalizedPurity } = this.normalizeMetalAndPurity(query.metalType, query.purity);
    const asOf = query.asOfDate || new Date();

    const rateRecord = await client.metalRate.findFirst({
      where: {
        organizationId: ctx.tenantId,
        metalType,
        purity: normalizedPurity,
        rateType: 'BUYING',
        isActive: true,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      include: { createdByUser: { select: { id: true, name: true } } },
    });

    if (!rateRecord) {
      throw new RateUnavailableError(
        `No active buying rate configured for ${metalType} (${normalizedPurity}). ` +
          `A Store Manager must configure the official buying rate before gold buybacks can be evaluated or completed.`,
        'BUYING_RATE_NOT_CONFIGURED'
      );
    }

    return {
      ratePerGram: new Decimal(rateRecord.ratePerGram),
      metalType,
      purity: normalizedPurity,
      rateType: 'BUYING',
      source: rateRecord.source as RateSource,
      effectiveFrom: rateRecord.effectiveFrom,
      metalRateId: rateRecord.id,
      isConfigured: true,
      notes: rateRecord.notes,
    };
  }

  /**
   * Retrieves effective selling rate. Falls back to indicative benchmark if tenant has not customized it.
   */
  async getSellingRate(
    ctx: SecurityContext,
    query: { metalType: string; purity: string; branchId?: string | null; asOfDate?: Date },
    options?: { tx?: PrismaClient }
  ): Promise<ResolvedRate> {
    const client = (options?.tx || this.db) as PrismaClient;
    const { metalType, normalizedPurity } = this.normalizeMetalAndPurity(query.metalType, query.purity);
    const asOf = query.asOfDate || new Date();

    const rateRecord = await client.metalRate.findFirst({
      where: {
        organizationId: ctx.tenantId,
        metalType,
        purity: normalizedPurity,
        rateType: 'SELLING',
        isActive: true,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (rateRecord) {
      return {
        ratePerGram: new Decimal(rateRecord.ratePerGram),
        metalType,
        purity: normalizedPurity,
        rateType: 'SELLING',
        source: rateRecord.source as RateSource,
        effectiveFrom: rateRecord.effectiveFrom,
        metalRateId: rateRecord.id,
        isConfigured: true,
        notes: rateRecord.notes,
      };
    }

    // Baseline fallback for selling rates (showroom display standard)
    const baselineRate =
      metalType === 'SILVER' ? INDICATIVE_DAILY_RATES['SILVER'] : INDICATIVE_DAILY_RATES[normalizedPurity];

    if (!baselineRate) {
      throw new RateUnavailableError(`No selling rate available for ${metalType} ${normalizedPurity}.`);
    }

    return {
      ratePerGram: new Decimal(baselineRate),
      metalType,
      purity: normalizedPurity,
      rateType: 'SELLING',
      source: 'INDICATIVE_BASELINE',
      effectiveFrom: new Date(),
      isConfigured: false,
    };
  }

  /**
   * Retrieves summary of active buying and selling rates across all standard purities.
   */
  async getActiveRatesSummary(ctx: SecurityContext): Promise<ActiveRatesSummary> {
    const purities: { metal: SupportedMetal; purity: string }[] = [
      { metal: 'GOLD', purity: '24K' },
      { metal: 'GOLD', purity: '22K' },
      { metal: 'GOLD', purity: '18K' },
      { metal: 'GOLD', purity: '14K' },
      { metal: 'SILVER', purity: 'SILVER' },
    ];

    const buying: Record<string, ResolvedRate | null> = {};
    const selling: Record<string, ResolvedRate> = {};

    for (const item of purities) {
      const key = item.metal === 'SILVER' ? 'SILVER' : item.purity;

      try {
        buying[key] = await this.getBuyingRate(ctx, { metalType: item.metal, purity: item.purity });
      } catch {
        buying[key] = null;
      }

      try {
        selling[key] = await this.getSellingRate(ctx, { metalType: item.metal, purity: item.purity });
      } catch {
        selling[key] = {
          ratePerGram: new Decimal(INDICATIVE_DAILY_RATES[key] || 0),
          metalType: item.metal,
          purity: item.purity,
          rateType: 'SELLING',
          source: 'INDICATIVE_BASELINE',
          effectiveFrom: new Date(),
          isConfigured: false,
        };
      }
    }

    return { buying, selling };
  }

  /**
   * Lists rate configuration history with user audit details.
   */
  async getRateHistory(
    ctx: SecurityContext,
    filters?: { metalType?: string; purity?: string; rateType?: string }
  ): Promise<MetalRate[]> {
    return this.db.metalRate.findMany({
      where: {
        organizationId: ctx.tenantId,
        ...(filters?.metalType ? { metalType: filters.metalType.toUpperCase() } : {}),
        ...(filters?.purity ? { purity: filters.purity.toUpperCase() } : {}),
        ...(filters?.rateType ? { rateType: filters.rateType.toUpperCase() } : {}),
      },
      include: {
        createdByUser: {
          select: { id: true, name: true, email: true },
        },
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { effectiveFrom: 'desc' },
      take: 100,
    });
  }
}

export const metalRateService = new MetalRateService();
