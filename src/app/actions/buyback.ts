'use server';

import { getServerSecurityContext } from '@/lib/security-context';
import {
  metalRateService,
  ConfigureRateInput,
  ActiveRatesSummary,
  RateValidationError,
  RateUnavailableError,
} from '@/lib/metal-rates';
import {
  buybackService,
  CreateBuybackVoucherInput,
  BuybackCalculationInput,
  BuybackCalculationResult,
  BuybackVoucherFilters,
  BuybackValidationError,
  BuybackNotFoundError,
  VoucherRedemptionQuote,
} from '@/lib/buyback';
import { AuthorizationError } from '@/types/security';
import { Decimal } from '@/lib/decimal';
import { revalidatePath } from 'next/cache';

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface SerializedRate {
  id: string;
  metalType: string;
  purity: string;
  rateType: string;
  ratePerGram: string;
  source: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
  createdByName?: string | null;
}

export interface SerializedBuybackVoucher {
  id: string;
  voucherNumber: string;
  customerName: string;
  customerPhone: string;
  customerPan: string | null;
  metalType: string;
  purity: string;
  grossWeight: string;
  stoneWeight: string;
  netWeight: string;
  appliedRate: string;
  grossAmount: string;
  deductionAmount: string;
  deductionReason: string | null;
  netPayable: string;
  redeemedAmount: string;
  availableBalance: string;
  paymentMethod: string;
  paymentReference: string | null;
  status: string;
  approvedById?: string | null;
  branchName?: string;
  lotTagCode?: string;
  exchangeInvoiceNumber?: string | null;
  createdAt: string;
}

export async function configureRateAction(
  input: ConfigureRateInput,
  headers?: Headers
): Promise<ActionResult<SerializedRate>> {
  try {
    const ctx = await getServerSecurityContext({ headers });
    const rate = await metalRateService.configureRate(ctx, input);

    revalidatePath('/purchases');
    revalidatePath('/billing');

    return {
      success: true,
      data: {
        id: rate.id,
        metalType: rate.metalType,
        purity: rate.purity,
        rateType: rate.rateType,
        ratePerGram: rate.ratePerGram.toString(),
        source: rate.source,
        effectiveFrom: rate.effectiveFrom.toISOString(),
        effectiveTo: rate.effectiveTo ? rate.effectiveTo.toISOString() : null,
        isActive: rate.isActive,
        notes: rate.notes,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to configure metal rate',
      code: err.code || 'CONFIG_ERROR',
    };
  }
}

export interface SerializedResolvedRate {
  ratePerGram: string;
  metalType: string;
  purity: string;
  rateType: string;
  source: string;
  effectiveFrom: string;
  metalRateId?: string;
  isConfigured: boolean;
  notes?: string | null;
}

export interface SerializedActiveRatesSummary {
  buying: Record<string, SerializedResolvedRate | null>;
  selling: Record<string, SerializedResolvedRate>;
}

export async function getActiveRatesAction(headers?: Headers): Promise<ActionResult<SerializedActiveRatesSummary>> {
  try {
    const ctx = await getServerSecurityContext({ headers });
    const summary = await metalRateService.getActiveRatesSummary(ctx);

    const buying: Record<string, SerializedResolvedRate | null> = {};
    for (const [k, v] of Object.entries(summary.buying)) {
      buying[k] = v
        ? {
            ratePerGram: v.ratePerGram.toString(),
            metalType: v.metalType,
            purity: v.purity,
            rateType: v.rateType,
            source: v.source,
            effectiveFrom: v.effectiveFrom.toISOString(),
            metalRateId: v.metalRateId,
            isConfigured: v.isConfigured,
            notes: v.notes,
          }
        : null;
    }

    const selling: Record<string, SerializedResolvedRate> = {};
    for (const [k, v] of Object.entries(summary.selling)) {
      selling[k] = {
        ratePerGram: v.ratePerGram.toString(),
        metalType: v.metalType,
        purity: v.purity,
        rateType: v.rateType,
        source: v.source,
        effectiveFrom: v.effectiveFrom.toISOString(),
        metalRateId: v.metalRateId,
        isConfigured: v.isConfigured,
        notes: v.notes,
      };
    }

    return { success: true, data: { buying, selling } };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to fetch active rates',
      code: err.code || 'FETCH_ERROR',
    };
  }
}

export async function getRateHistoryAction(
  filters?: { metalType?: string; purity?: string; rateType?: string },
  headers?: Headers
): Promise<ActionResult<SerializedRate[]>> {
  try {
    const ctx = await getServerSecurityContext({ headers });
    const history = await metalRateService.getRateHistory(ctx, filters);

    return {
      success: true,
      data: history.map((r: any) => ({
        id: r.id,
        metalType: r.metalType,
        purity: r.purity,
        rateType: r.rateType,
        ratePerGram: r.ratePerGram.toString(),
        source: r.source,
        effectiveFrom: r.effectiveFrom.toISOString(),
        effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
        isActive: r.isActive,
        notes: r.notes,
        createdByName: r.createdByUser?.name || null,
      })),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to fetch rate history',
      code: err.code || 'FETCH_ERROR',
    };
  }
}

export async function previewBuybackCalculationAction(
  input: BuybackCalculationInput,
  headers?: Headers
): Promise<ActionResult<any>> {
  try {
    const calc = buybackService.calculateBuyback(input);
    return {
      success: true,
      data: {
        grossWeight: calc.grossWeight.toFixed(3),
        stoneWeight: calc.stoneWeight.toFixed(3),
        netWeight: calc.netWeight.toFixed(3),
        appliedRate: calc.appliedRate.toFixed(2),
        grossAmount: calc.grossAmount.toFixed(2),
        deductionAmount: calc.deductionAmount.toFixed(2),
        deductionReason: calc.deductionReason,
        netPayable: calc.netPayable.toFixed(2),
        isPanRequired: calc.isPanRequired,
        isPanValid: calc.isPanValid,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Calculation validation failed',
      code: err.code || 'CALC_ERROR',
    };
  }
}

export async function createBuybackVoucherAction(
  input: CreateBuybackVoucherInput,
  headers?: Headers
): Promise<ActionResult<SerializedBuybackVoucher>> {
  try {
    const ctx = await getServerSecurityContext({ headers });
    const voucher = await buybackService.createBuybackVoucher(ctx, input);

    revalidatePath('/purchases');
    revalidatePath('/inventory');
    revalidatePath('/reports');

    const netPayableDec = new Decimal(voucher.netPayable);
    const redeemedAmountDec = new Decimal(voucher.redeemedAmount);
    const availableBalanceDec = netPayableDec.minus(redeemedAmountDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      success: true,
      data: {
        id: voucher.id,
        voucherNumber: voucher.voucherNumber,
        customerName: voucher.customerName,
        customerPhone: voucher.customerPhone,
        customerPan: voucher.customerPan,
        metalType: voucher.metalType,
        purity: voucher.purity,
        grossWeight: voucher.grossWeight.toString(),
        stoneWeight: voucher.stoneWeight.toString(),
        netWeight: voucher.netWeight.toString(),
        appliedRate: voucher.appliedRate.toString(),
        grossAmount: voucher.grossAmount.toString(),
        deductionAmount: voucher.deductionAmount.toString(),
        deductionReason: voucher.deductionReason,
        netPayable: netPayableDec.toFixed(2),
        redeemedAmount: redeemedAmountDec.toFixed(2),
        availableBalance: availableBalanceDec.toFixed(2),
        paymentMethod: voucher.paymentMethod,
        paymentReference: voucher.paymentReference,
        status: voucher.status,
        approvedById: voucher.approvedById,
        lotTagCode: voucher.lotOrnament?.tagCode,
        createdAt: voucher.createdAt.toISOString(),
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to create buyback voucher',
      code: err.code || 'VOUCHER_ERROR',
    };
  }
}

export async function listBuybackVouchersAction(
  filters?: BuybackVoucherFilters,
  headers?: Headers
): Promise<ActionResult<SerializedBuybackVoucher[]>> {
  try {
    const ctx = await getServerSecurityContext({ headers });
    const vouchers = await buybackService.listBuybackVouchers(ctx, filters);

    return {
      success: true,
      data: vouchers.map((v: any) => {
        const netDec = new Decimal(v.netPayable);
        const redDec = new Decimal(v.redeemedAmount);
        const availDec = netDec.minus(redDec).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        return {
          id: v.id,
          voucherNumber: v.voucherNumber,
          customerName: v.customerName,
          customerPhone: v.customerPhone,
          customerPan: v.customerPan,
          metalType: v.metalType,
          purity: v.purity,
          grossWeight: v.grossWeight.toString(),
          stoneWeight: v.stoneWeight.toString(),
          netWeight: v.netWeight.toString(),
          appliedRate: v.appliedRate.toString(),
          grossAmount: v.grossAmount.toString(),
          deductionAmount: v.deductionAmount.toString(),
          deductionReason: v.deductionReason,
          netPayable: netDec.toFixed(2),
          redeemedAmount: redDec.toFixed(2),
          availableBalance: availDec.toFixed(2),
          paymentMethod: v.paymentMethod,
          paymentReference: v.paymentReference,
          status: v.status,
          approvedById: v.approvedById,
          branchName: v.branch?.name,
          lotTagCode: v.lotOrnament?.tagCode,
          exchangeInvoiceNumber: v.exchangeInvoice?.invoiceNumber || null,
          createdAt: v.createdAt.toISOString(),
        };
      }),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to list buyback vouchers',
      code: err.code || 'LIST_ERROR',
    };
  }
}

export async function getVoucherForRedemptionAction(
  voucherNumber: string,
  headers?: Headers
): Promise<ActionResult<VoucherRedemptionQuote>> {
  try {
    const ctx = await getServerSecurityContext({ headers });
    const quote = await buybackService.getVoucherForRedemption(ctx, voucherNumber);
    return { success: true, data: quote };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to look up voucher for redemption',
      code: err.code || 'LOOKUP_ERROR',
    };
  }
}
