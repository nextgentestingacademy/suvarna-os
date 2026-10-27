'use server';

import { getServerSecurityContext, GetServerSecurityContextOptions } from '@/lib/security-context';
import { assertPermission } from '@/lib/rbac';
import {
  reportsService,
  DashboardData,
  SalesSummaryFilters,
  SalesSummaryReport,
  PaymentCollectionsFilters,
  PaymentCollectionsReport,
  GstSummaryFilters,
  GstSummaryReport,
  InventoryValuationFilters,
  InventoryValuationReport,
  TrialBalanceFilters,
  TrialBalanceReport,
  ProfitAndLossFilters,
  ProfitAndLossReport,
  BalanceSheetFilters,
  BalanceSheetReport,
  serializeReportData,
} from '@/lib/reports';

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Server Action to fetch live operational dashboard metrics.
 */
export async function getDashboardSummaryAction(
  requestedBranchId?: string | null,
  options?: GetServerSecurityContextOptions
): Promise<ActionResult<DashboardData>> {
  try {
    const ctx = await getServerSecurityContext(options);
    const data = await reportsService.getDashboardSummary(ctx, requestedBranchId);
    return {
      success: true,
      data: serializeReportData(data),
    };
  } catch (err: any) {
    console.error('getDashboardSummaryAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to retrieve dashboard analytics.',
      code: err?.code || 'DASHBOARD_FETCH_FAILED',
    };
  }
}

/**
 * Server Action: Sales Summary Report.
 * Protected by ACCOUNTS_VIEW permission.
 */
export async function getSalesSummaryAction(
  filters: SalesSummaryFilters = {},
  options?: GetServerSecurityContextOptions
): Promise<ActionResult<SalesSummaryReport>> {
  try {
    const ctx = await getServerSecurityContext(options);
    assertPermission(ctx, 'ACCOUNTS_VIEW');
    const data = await reportsService.getSalesSummaryReport(ctx, filters);
    return {
      success: true,
      data: serializeReportData(data),
    };
  } catch (err: any) {
    console.error('getSalesSummaryAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to retrieve sales summary report.',
      code: err?.code || 'SALES_REPORT_FAILED',
    };
  }
}

/**
 * Server Action: Payment Collections Report.
 * Protected by ACCOUNTS_VIEW permission.
 */
export async function getPaymentCollectionsAction(
  filters: PaymentCollectionsFilters = {},
  options?: GetServerSecurityContextOptions
): Promise<ActionResult<PaymentCollectionsReport>> {
  try {
    const ctx = await getServerSecurityContext(options);
    assertPermission(ctx, 'ACCOUNTS_VIEW');
    const data = await reportsService.getPaymentCollectionsReport(ctx, filters);
    return {
      success: true,
      data: serializeReportData(data),
    };
  } catch (err: any) {
    console.error('getPaymentCollectionsAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to retrieve payment collections report.',
      code: err?.code || 'PAYMENTS_REPORT_FAILED',
    };
  }
}

/**
 * Server Action: GST Outward Summary Report.
 * Protected by ACCOUNTS_VIEW permission.
 */
export async function getGstSummaryAction(
  filters: GstSummaryFilters = {},
  options?: GetServerSecurityContextOptions
): Promise<ActionResult<GstSummaryReport>> {
  try {
    const ctx = await getServerSecurityContext(options);
    assertPermission(ctx, 'ACCOUNTS_VIEW');
    const data = await reportsService.getGstSummaryReport(ctx, filters);
    return {
      success: true,
      data: serializeReportData(data),
    };
  } catch (err: any) {
    console.error('getGstSummaryAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to retrieve GST outward summary.',
      code: err?.code || 'GST_REPORT_FAILED',
    };
  }
}

/**
 * Server Action: Inventory Valuation Report.
 * Protected by ACCOUNTS_VIEW permission (or INVENTORY_VIEW with cost redaction).
 */
export async function getInventoryValuationAction(
  filters: InventoryValuationFilters = {},
  options?: GetServerSecurityContextOptions
): Promise<ActionResult<InventoryValuationReport>> {
  try {
    const ctx = await getServerSecurityContext(options);
    assertPermission(ctx, 'ACCOUNTS_VIEW');
    const data = await reportsService.getInventoryValuationReport(ctx, filters);
    return {
      success: true,
      data: serializeReportData(data),
    };
  } catch (err: any) {
    console.error('getInventoryValuationAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to retrieve inventory valuation report.',
      code: err?.code || 'INVENTORY_REPORT_FAILED',
    };
  }
}

/**
 * Server Action: Trial Balance Report.
 * Protected by ACCOUNTS_VIEW permission.
 */
export async function getTrialBalanceAction(
  filters: TrialBalanceFilters = {},
  options?: GetServerSecurityContextOptions
): Promise<ActionResult<TrialBalanceReport>> {
  try {
    const ctx = await getServerSecurityContext(options);
    assertPermission(ctx, 'ACCOUNTS_VIEW');
    const data = await reportsService.getTrialBalanceReport(ctx, filters);
    return {
      success: true,
      data: serializeReportData(data),
    };
  } catch (err: any) {
    console.error('getTrialBalanceAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to retrieve trial balance report.',
      code: err?.code || 'TRIAL_BALANCE_FAILED',
    };
  }
}

/**
 * Server Action: Profit & Loss Statement Report.
 * Protected by ACCOUNTS_VIEW permission.
 */
export async function getProfitAndLossAction(
  filters: ProfitAndLossFilters = {},
  options?: GetServerSecurityContextOptions
): Promise<ActionResult<ProfitAndLossReport>> {
  try {
    const ctx = await getServerSecurityContext(options);
    assertPermission(ctx, 'ACCOUNTS_VIEW');
    const data = await reportsService.getProfitAndLossReport(ctx, filters);
    return {
      success: true,
      data: serializeReportData(data),
    };
  } catch (err: any) {
    console.error('getProfitAndLossAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to retrieve profit & loss report.',
      code: err?.code || 'PROFIT_LOSS_FAILED',
    };
  }
}

/**
 * Server Action: Balance Sheet Report.
 * Protected by ACCOUNTS_VIEW permission.
 */
export async function getBalanceSheetAction(
  filters: BalanceSheetFilters = {},
  options?: GetServerSecurityContextOptions
): Promise<ActionResult<BalanceSheetReport>> {
  try {
    const ctx = await getServerSecurityContext(options);
    assertPermission(ctx, 'ACCOUNTS_VIEW');
    const data = await reportsService.getBalanceSheetReport(ctx, filters);
    return {
      success: true,
      data: serializeReportData(data),
    };
  } catch (err: any) {
    console.error('getBalanceSheetAction error:', err);
    return {
      success: false,
      error: err?.message || 'Failed to retrieve balance sheet report.',
      code: err?.code || 'BALANCE_SHEET_FAILED',
    };
  }
}
