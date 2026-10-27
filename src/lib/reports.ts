import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
import { Decimal } from 'decimal.js';
import { SecurityContext } from '@/types/security';
import { assertBranchAccess } from '@/lib/rbac';
import { getIndianFiscalYear, AccountClassification, NormalBalance } from '@/lib/ledger';
import { INDICATIVE_DAILY_RATES } from '@/lib/indicative-pricing';

// ==============================================================================
// 1. DATE & IST TIMEZONE UTILITIES
// ==============================================================================

/**
 * Indian Standard Time (IST) is UTC+05:30.
 * In milliseconds: 5 hours * 3600000 + 30 minutes * 60000 = 19,800,000 ms.
 */
export const IST_OFFSET_MS = 19800000;

export type DatePreset = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'FY_2026_27' | 'CUSTOM';

/**
 * Resolves indicative benchmark bullion rate for a given metal and purity.
 * Returns null rate with an explicit reason for unsupported metals (e.g. Platinum)
 * or purities without benchmark rates. (F-01)
 */
export function resolveIndicativeBullionRate(
  metalType?: string | null,
  purity?: string | null
): { rate: Decimal | null; reason: string | null } {
  const normMetal = (metalType || '').trim().toUpperCase();
  const normPurity = (purity || '').trim().toUpperCase();

  if (normMetal === 'SILVER') {
    const silverRate = INDICATIVE_DAILY_RATES['SILVER'];
    if (silverRate) {
      return { rate: new Decimal(silverRate), reason: null };
    }
    return { rate: null, reason: 'Silver rate unavailable' };
  } else if (normMetal === 'GOLD') {
    const goldRate = INDICATIVE_DAILY_RATES[normPurity];
    if (goldRate) {
      return { rate: new Decimal(goldRate), reason: null };
    }
    return { rate: null, reason: `Unsupported gold purity: ${purity || 'Unknown'}` };
  }
  return { rate: null, reason: `Unsupported metal: ${metalType || 'Unknown'}` };
}

export interface IstDateRange {
  startDate: Date;
  endDate: Date;
  fiscalYear: string;
}

/**
 * Calculates start and end Date boundaries aligned to Indian Standard Time (IST)
 * without accidental local machine or server timezone shifts.
 */
export function getIstDateRange(options?: {
  date?: Date;
  type?: 'MTD' | 'FY' | 'TODAY' | 'THIS_WEEK' | 'CUSTOM';
  from?: Date | string;
  to?: Date | string;
}): IstDateRange {
  const refDate = options?.date ?? new Date();
  const type = options?.type ?? 'MTD';

  const istTime = refDate.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istTime);
  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth(); // 0 = Jan, 9 = Oct
  const day = istDate.getUTCDate();

  const fiscalYear = getIndianFiscalYear(refDate);

  if (type === 'TODAY') {
    const startDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - IST_OFFSET_MS);
    const endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - IST_OFFSET_MS);
    return { startDate, endDate, fiscalYear };
  }

  if (type === 'THIS_WEEK') {
    const dayOfWeek = istDate.getUTCDay(); // 0 = Sunday, 1 = Monday
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startDate = new Date(Date.UTC(year, month, day - diffToMonday, 0, 0, 0, 0) - IST_OFFSET_MS);
    const endDate = new Date(Date.UTC(year, month, day - diffToMonday + 6, 23, 59, 59, 999) - IST_OFFSET_MS);
    return { startDate, endDate, fiscalYear };
  }

  if (type === 'MTD') {
    const startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - IST_OFFSET_MS);
    const endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999) - IST_OFFSET_MS);
    return { startDate, endDate, fiscalYear };
  }

  if (type === 'FY') {
    const fyStartYear = month >= 3 ? year : year - 1;
    const fyEndYear = fyStartYear + 1;
    const startDate = new Date(Date.UTC(fyStartYear, 3, 1, 0, 0, 0, 0) - IST_OFFSET_MS);
    const endDate = new Date(Date.UTC(fyEndYear, 2, 31, 23, 59, 59, 999) - IST_OFFSET_MS);
    return { startDate, endDate, fiscalYear };
  }

  if (type === 'CUSTOM') {
    if (!options?.from || !options?.to) {
      throw new Error("Custom date range requires both 'from' and 'to' parameters.");
    }

    const parseCustomBoundary = (input: Date | string, isEnd: boolean): Date => {
      if (typeof input === 'string') {
        const trimmed = input.trim();
        const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
        if (dateOnlyMatch) {
          const y = parseInt(dateOnlyMatch[1], 10);
          const m = parseInt(dateOnlyMatch[2], 10) - 1;
          const d = parseInt(dateOnlyMatch[3], 10);
          if (isEnd) {
            return new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - IST_OFFSET_MS);
          } else {
            return new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - IST_OFFSET_MS);
          }
        }
        return new Date(trimmed);
      }
      return input;
    };

    const fromDate = parseCustomBoundary(options.from, false);
    const toDate = parseCustomBoundary(options.to, true);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new Error('Invalid custom date range provided.');
    }
    if (fromDate > toDate) {
      throw new Error("'from' date cannot be after 'to' date.");
    }
    return { startDate: fromDate, endDate: toDate, fiscalYear: getIndianFiscalYear(fromDate) };
  }

  // Default to MTD
  const startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - IST_OFFSET_MS);
  const endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999) - IST_OFFSET_MS);
  return { startDate, endDate, fiscalYear };
}

/**
 * Resolves DatePreset string to IstDateRange.
 */
export function resolvePresetDateRange(
  preset: DatePreset = 'THIS_MONTH',
  from?: string | Date,
  to?: string | Date
): IstDateRange {
  switch (preset) {
    case 'TODAY':
      return getIstDateRange({ type: 'TODAY' });
    case 'THIS_WEEK':
      return getIstDateRange({ type: 'THIS_WEEK' });
    case 'THIS_MONTH':
      return getIstDateRange({ type: 'MTD' });
    case 'FY_2026_27':
      return getIstDateRange({ type: 'FY' });
    case 'CUSTOM':
      return getIstDateRange({ type: 'CUSTOM', from, to });
    default:
      return getIstDateRange({ type: 'MTD' });
  }
}

/**
 * Formats a Date in Indian Standard Time (IST) locale.
 */
export function formatIstDate(date: Date | string, includeTime: boolean = false): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : {}),
  });
}

/**
 * Formats a numeric value or Decimal into Indian Rupee currency string.
 */
export function formatInr(val: string | number | Decimal): string {
  try {
    const dec = new Decimal(val || 0);
    const num = dec.toNumber();
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch {
    return '₹0.00';
  }
}

// ==============================================================================
// 2. TYPES & INTERFACES FOR OPERATIONAL REPORTS
// ==============================================================================

export interface BaseReportFilter {
  datePreset?: DatePreset;
  from?: string | Date;
  to?: string | Date;
  branchId?: string | null;
}

// ------------------------------------------------------------------------------
// A. Sales Summary Types
// ------------------------------------------------------------------------------

export interface SalesSummaryFilters extends BaseReportFilter {
  paymentStatus?: 'ALL' | 'PAID' | 'PARTIAL' | 'UNPAID';
}

export interface DailySalesSummary {
  date: string;
  invoiceCount: number;
  grossSales: string;
  taxableAmount: string;
  taxAmount: string;
  paidAmount: string;
  balanceAmount: string;
}

export interface CategorySalesSummary {
  category: string;
  itemCount: number;
  netWeightGrams: string;
  metalValue: string;
  makingCharges: string;
  stoneCharges: string;
  taxableAmount: string;
  totalAmount: string;
}

export interface SalesSummaryReport {
  filters: {
    datePreset: DatePreset;
    startDate: string;
    endDate: string;
    branchId: string | null;
    branchName: string;
    paymentStatus: string;
  };
  totals: {
    invoiceCount: number;
    grossSales: string;
    taxableAmount: string;
    totalTax: string;
    cgstAmount: string;
    sgstAmount: string;
    igstAmount: string;
    discountAmount: string;
    roundOffAmount: string;
    paidAmount: string;
    balanceAmount: string;
    metalValue: string;
    makingCharges: string;
    stoneCharges: string;
  };
  dailyTrend: DailySalesSummary[];
  categoryBreakdown: CategorySalesSummary[];
}

// ------------------------------------------------------------------------------
// B. Payment Collections Types
// ------------------------------------------------------------------------------

export interface PaymentCollectionsFilters extends BaseReportFilter {
  paymentMethod?: 'ALL' | 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE';
}

export interface PaymentMethodBreakdown {
  paymentMethod: string;
  count: number;
  totalAmount: string;
  percentage: string;
}

export interface PaymentCollectionItem {
  id: string;
  paymentDate: string;
  paymentMethod: string;
  amount: string;
  transactionRef: string | null;
  invoiceNumber: string;
  customerName: string;
  branchName: string;
  notes: string | null;
}

export interface BankSettlementSummaryItem {
  id: string;
  transactionDate: string;
  bankName: string;
  accountNumber: string;
  referenceNumber: string | null;
  depositAmount: string; // Net bank deposit
  feeAmount: string; // Processing fee deducted
  grossAmount: string; // Deposit + Fee
  settlementJournalNumber: string | null;
}

export interface PaymentCollectionsReport {
  filters: {
    datePreset: DatePreset;
    startDate: string;
    endDate: string;
    branchId: string | null;
    branchName: string;
    paymentMethod: string;
  };
  totals: {
    totalCollected: string;
    paymentCount: number;
    cashCollected: string;
    digitalCollected: string;
    outstandingReceivables: string;
  };
  settlementTotals: {
    totalSettledNet: string;
    totalSettlementFees: string;
    totalSettledGross: string;
    settledLinesCount: number;
  };
  methodBreakdown: PaymentMethodBreakdown[];
  collections: PaymentCollectionItem[];
  settlements: BankSettlementSummaryItem[];
}

// ------------------------------------------------------------------------------
// C. GST Outward Summary Types
// ------------------------------------------------------------------------------

export interface GstSummaryFilters extends BaseReportFilter {}

export interface DailyGstSummary {
  date: string;
  invoiceCount: number;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalTax: string;
  grossInvoiceValue: string;
}

export interface InvoiceGstItem {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerPan: string | null;
  placeOfSupply: string;
  isInterState: boolean;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalTax: string;
  grandTotal: string;
}

export interface GstSummaryReport {
  filters: {
    datePreset: DatePreset;
    startDate: string;
    endDate: string;
    branchId: string | null;
    branchName: string;
  };
  totals: {
    totalInvoices: number;
    intraStateCount: number;
    interStateCount: number;
    totalTaxableAmount: string;
    totalCgstAmount: string;
    totalSgstAmount: string;
    totalIgstAmount: string;
    totalTaxLiability: string;
    totalInvoiceValue: string;
  };
  rateSchedules: {
    hsnCode: string;
    description: string;
    ratePercent: string;
    taxableAmount: string;
    cgstAmount: string;
    sgstAmount: string;
    igstAmount: string;
    totalTax: string;
  }[];
  dailySchedule: DailyGstSummary[];
  invoices: InvoiceGstItem[];
  statutoryDisclosure: string;
}

// ------------------------------------------------------------------------------
// D. Inventory Valuation Types
// ------------------------------------------------------------------------------

export interface InventoryValuationFilters {
  branchId?: string | null;
  metalType?: 'ALL' | 'GOLD' | 'SILVER' | 'PLATINUM';
  purity?: 'ALL' | '24K' | '22K' | '18K' | '14K';
  category?: string;
}

export interface CategoryValuationSummary {
  category: string;
  ornamentCount: number;
  grossWeightGrams: string;
  netWeightGrams: string;
  indicativeValuation: string;
}

export interface OrnamentValuationItem {
  id: string;
  tagCode: string;
  huid: string | null;
  productName: string;
  sku: string;
  category: string;
  metalType: string;
  purity: string;
  grossWeight: string;
  netWeight: string;
  costAmount: string; // "Not Recorded" if null
  indicativePrice: string;
  branchName: string;
}

export interface InventoryValuationReport {
  filters: {
    branchId: string | null;
    branchName: string;
    metalType: string;
    purity: string;
    category: string;
  };
  totals: {
    totalOrnaments: number;
    totalGrossWeightGrams: string;
    totalStoneWeightGrams: string;
    totalNetWeightGrams: string;
    totalRecordedCost: string; // "Not Recorded"
    recordedCostItemsCount: number;
    totalIndicativeEstimate: string; // Benchmark bullion rate estimate
    unvaluedItemsCount: number;
  };
  categoryBreakdown: CategoryValuationSummary[];
  items: OrnamentValuationItem[];
  costDisclosure: string;
}

// ------------------------------------------------------------------------------
// E0. Financial Statement Integrity & Anomaly Types
// ------------------------------------------------------------------------------

export type AnomalyType =
  | 'NEGATIVE_RECEIVABLE'
  | 'NEGATIVE_ASSET'
  | 'NEGATIVE_TOTAL_ASSETS'
  | 'ABNORMAL_LIABILITY_BALANCE'
  | 'UNRECORDED_OPENING_EQUITY'
  | 'UNRECORDED_COGS'
  | 'MISSING_HISTORICAL_INVOICES';

export type AnomalySeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type StatementCompletenessStatus =
  | 'COMPLETE'
  | 'INCOMPLETE_DATA'
  | 'ANOMALY_DETECTED';

export interface FinancialStatementAnomaly {
  type: AnomalyType;
  accountCode?: string;
  accountName?: string;
  amount: string;
  severity: AnomalySeverity;
  explanation: string;
  reconciliationAction: string;
}

// ------------------------------------------------------------------------------
// E. Trial Balance Types (General Ledger)
// ------------------------------------------------------------------------------

export interface TrialBalanceFilters extends BaseReportFilter {}

export interface TrialBalanceAccountItem {
  id: string;
  code: string;
  name: string;
  classification: AccountClassification;
  normalBalance: NormalBalance;
  // Cumulative Closing Balances as of asOfDate
  debitBalance: string;
  creditBalance: string;
  // Net balance formatted according to normal balance
  netBalance: string;
  // Period Activity during [startDate, endDate]
  periodDebit: string;
  periodCredit: string;
}

export interface TrialBalanceReport {
  filters: {
    datePreset: DatePreset;
    startDate: string;
    endDate: string;
    asOfDate: string;
    fiscalYear: string;
    branchId: string | null;
    branchName: string;
  };
  totals: {
    totalDebitBalance: string;
    totalCreditBalance: string;
    difference: string;
    isBalanced: boolean;
    isSuitableForReliance: boolean;
    completenessStatus: StatementCompletenessStatus;
    totalPeriodDebit: string;
    totalPeriodCredit: string;
    activeAccountsCount: number;
  };
  accounts: TrialBalanceAccountItem[];
  anomalies: FinancialStatementAnomaly[];
  ledgerCommencementDate: string | null;
  integrityNotice: string;
  discrepancyNotice: string | null;
}

// ------------------------------------------------------------------------------
// F. Profit & Loss Statement Types (General Ledger)
// ------------------------------------------------------------------------------

export interface ProfitAndLossFilters extends BaseReportFilter {}

export interface ProfitAndLossLineItem {
  code: string;
  name: string;
  amount: string;
}

export interface ProfitAndLossReport {
  filters: {
    datePreset: DatePreset;
    startDate: string;
    endDate: string;
    fiscalYear: string;
    branchId: string | null;
    branchName: string;
  };
  operatingRevenue: {
    items: ProfitAndLossLineItem[];
    totalGrossRevenue: string;
    contraItems: ProfitAndLossLineItem[];
    totalContraRevenue: string;
    totalNetRevenue: string;
  };
  costOfGoodsSold: {
    items: ProfitAndLossLineItem[];
    totalCogs: string;
    isEstimatedOrMissing: boolean;
  };
  grossProfit: {
    amount: string;
    percentage: string;
  };
  operatingExpenses: {
    items: ProfitAndLossLineItem[];
    totalOperatingExpenses: string;
  };
  netProfitOrLoss: {
    amount: string;
    isProfit: boolean;
  };
  summary: {
    isSuitableForReliance: boolean;
    completenessStatus: StatementCompletenessStatus;
  };
  anomalies: FinancialStatementAnomaly[];
  ledgerCommencementDate: string | null;
  cogsNotice: string;
  generalNotice: string;
}

// ------------------------------------------------------------------------------
// G. Balance Sheet Types (General Ledger)
// ------------------------------------------------------------------------------

export interface BalanceSheetFilters extends BaseReportFilter {}

export interface BalanceSheetLineItem {
  code: string;
  name: string;
  amount: string;
}

export interface BalanceSheetReport {
  filters: {
    datePreset: DatePreset;
    asOfDate: string;
    startDate: string;
    endDate: string;
    fiscalYear: string;
    branchId: string | null;
    branchName: string;
  };
  assets: {
    currentAssets: BalanceSheetLineItem[];
    totalCurrentAssets: string;
    totalAssets: string;
  };
  liabilities: {
    currentLiabilities: BalanceSheetLineItem[];
    totalCurrentLiabilities: string;
    totalLiabilities: string;
  };
  equity: {
    recordedEquity: BalanceSheetLineItem[];
    totalRecordedEquity: string;
    currentPeriodRetainedEarnings: string;
    totalEquity: string;
  };
  summary: {
    totalAssets: string;
    totalLiabilitiesAndEquity: string;
    discrepancy: string;
    isBalanced: boolean;
    isComplete: boolean;
    isSuitableForReliance: boolean;
    completenessStatus: StatementCompletenessStatus;
  };
  anomalies: FinancialStatementAnomaly[];
  ledgerCommencementDate: string | null;
  completenessNotice: string;
}

// ------------------------------------------------------------------------------
// H. Dashboard KPI Types
// ------------------------------------------------------------------------------

export interface DashboardKpiData {
  grossSalesMtd: string;
  invoicesCountMtd: number;
  outstandingDues: string;
  pendingInvoicesCount: number;
  registeredCustomersCount: number;
  activeOrnamentsCount: number;
  activeDesignsCount: number;
  activeNetWeightGrams: string;
  branchName: string;
  branchId: string | null;
}

export interface DashboardTransactionItem {
  id: string;
  invoiceNumber: string;
  customerName: string;
  date: string;
  totalAmount: string;
  paymentStatus: string;
  paymentMethods: string[];
}

export interface DashboardLowStockItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  purity: string;
  stock: number;
  netWeight: number;
}

export interface DashboardData {
  kpis: DashboardKpiData;
  recentTransactions: DashboardTransactionItem[];
  lowStockItems: DashboardLowStockItem[];
}

// ==============================================================================
// 3. SAFE SERIALIZATION HELPER
// ==============================================================================

/**
 * Recursively converts Decimal values into plain strings so data can safely cross
 * Next.js Server Action boundaries.
 */
export function serializeReportData<T>(data: T): T {
  if (data === null || data === undefined) return data;
  return JSON.parse(
    JSON.stringify(data, (_, value) => {
      if (typeof value === 'object' && value !== null && typeof value.toFixed === 'function') {
        return value.toString();
      }
      return value;
    })
  );
}

// ==============================================================================
// 4. REPORTING SERVICE IMPLEMENTATION
// ==============================================================================

export interface ReportsServiceOptions {
  prisma?: PrismaClient;
}

export class ReportsService {
  private db: PrismaClient;

  constructor(options?: ReportsServiceOptions) {
    this.db = options?.prisma ?? defaultPrisma;
  }

  /**
   * Resolves the target branch ID based on the trusted SecurityContext and
   * optional requestedBranchId.
   */
  resolveTargetBranchId(ctx: SecurityContext, requestedBranchId?: string | null): string | null {
    if (requestedBranchId && requestedBranchId.trim() && requestedBranchId.trim() !== 'ALL') {
      const cleanBranchId = requestedBranchId.trim();
      assertBranchAccess(ctx, cleanBranchId);
      return cleanBranchId;
    }

    if (requestedBranchId === 'ALL') {
      return null;
    }

    if (ctx.activeBranchId && ctx.allowedBranchIds.includes(ctx.activeBranchId)) {
      return ctx.activeBranchId;
    }

    if (ctx.allowedBranchIds.length > 0) {
      return ctx.allowedBranchIds[0];
    }

    return null;
  }

  /**
   * Resolves branch name for report header.
   */
  async resolveBranchName(tenantId: string, branchId: string | null): Promise<string> {
    if (!branchId) return 'All Permitted Showrooms';
    const branch = await this.db.branch.findUnique({
      where: {
        organizationId_id: {
          organizationId: tenantId,
          id: branchId,
        },
      },
      select: { name: true },
    });
    return branch?.name ?? 'Showroom Branch';
  }

  // ----------------------------------------------------------------------------
  // 1. SALES SUMMARY REPORT
  // ----------------------------------------------------------------------------
  async getSalesSummaryReport(
    ctx: SecurityContext,
    filters: SalesSummaryFilters = {}
  ): Promise<SalesSummaryReport> {
    const tenantId = ctx.tenantId;
    const targetBranchId = this.resolveTargetBranchId(ctx, filters.branchId);
    const branchName = await this.resolveBranchName(tenantId, targetBranchId);

    const dateRange = resolvePresetDateRange(
      filters.datePreset ?? 'THIS_MONTH',
      filters.from,
      filters.to
    );

    const branchFilter = targetBranchId
      ? { branchId: targetBranchId }
      : { branchId: { in: Array.from(ctx.allowedBranchIds) } };

    const paymentStatusFilter =
      filters.paymentStatus && filters.paymentStatus !== 'ALL'
        ? { paymentStatus: filters.paymentStatus }
        : {};

    // Fetch all eligible completed invoices in period
    const invoices = await this.db.invoice.findMany({
      where: {
        organizationId: tenantId,
        ...branchFilter,
        status: 'COMPLETED',
        ...paymentStatusFilter,
        invoiceDate: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        grandTotal: true,
        taxableAmount: true,
        totalTax: true,
        cgstAmount: true,
        sgstAmount: true,
        igstAmount: true,
        discountAmount: true,
        roundOff: true,
        paidAmount: true,
        balanceAmount: true,
        items: {
          select: {
            category: true,
            metalValue: true,
            makingChargeAmount: true,
            stoneCharges: true,
            itemDiscount: true,
            taxableAmount: true,
            totalAmount: true,
            netWeight: true,
          },
        },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    let totalGrossSales = new Decimal(0);
    let totalTaxable = new Decimal(0);
    let totalTax = new Decimal(0);
    let totalCgst = new Decimal(0);
    let totalSgst = new Decimal(0);
    let totalIgst = new Decimal(0);
    let totalInvoiceDiscounts = new Decimal(0);
    let totalRoundOff = new Decimal(0);
    let totalPaid = new Decimal(0);
    let totalBalance = new Decimal(0);

    let totalMetalValue = new Decimal(0);
    let totalMakingCharges = new Decimal(0);
    let totalStoneCharges = new Decimal(0);
    let totalItemDiscounts = new Decimal(0);

    const dailyMap = new Map<
      string,
      {
        count: number;
        gross: Decimal;
        taxable: Decimal;
        tax: Decimal;
        paid: Decimal;
        balance: Decimal;
      }
    >();

    const categoryMap = new Map<
      string,
      {
        count: number;
        netWeight: Decimal;
        metal: Decimal;
        making: Decimal;
        stone: Decimal;
        taxable: Decimal;
        total: Decimal;
      }
    >();

    for (const inv of invoices) {
      const gross = new Decimal(inv.grandTotal);
      const taxable = new Decimal(inv.taxableAmount);
      const tax = new Decimal(inv.totalTax);
      const cgst = new Decimal(inv.cgstAmount);
      const sgst = new Decimal(inv.sgstAmount);
      const igst = new Decimal(inv.igstAmount);
      const discount = new Decimal(inv.discountAmount);
      const roundOff = new Decimal(inv.roundOff);
      const paid = new Decimal(inv.paidAmount);
      const balance = new Decimal(inv.balanceAmount);

      totalGrossSales = totalGrossSales.plus(gross);
      totalTaxable = totalTaxable.plus(taxable);
      totalTax = totalTax.plus(tax);
      totalCgst = totalCgst.plus(cgst);
      totalSgst = totalSgst.plus(sgst);
      totalIgst = totalIgst.plus(igst);
      totalInvoiceDiscounts = totalInvoiceDiscounts.plus(discount);
      totalRoundOff = totalRoundOff.plus(roundOff);
      totalPaid = totalPaid.plus(paid);
      totalBalance = totalBalance.plus(balance);

      // Daily trend mapping (IST Date string YYYY-MM-DD)
      const dayKey = formatIstDate(inv.invoiceDate);
      const dayEntry = dailyMap.get(dayKey) ?? {
        count: 0,
        gross: new Decimal(0),
        taxable: new Decimal(0),
        tax: new Decimal(0),
        paid: new Decimal(0),
        balance: new Decimal(0),
      };
      dayEntry.count += 1;
      dayEntry.gross = dayEntry.gross.plus(gross);
      dayEntry.taxable = dayEntry.taxable.plus(taxable);
      dayEntry.tax = dayEntry.tax.plus(tax);
      dayEntry.paid = dayEntry.paid.plus(paid);
      dayEntry.balance = dayEntry.balance.plus(balance);
      dailyMap.set(dayKey, dayEntry);

      // Line items breakdown
      for (const item of inv.items) {
        const cat = item.category?.trim() || 'General Jewellery';
        const mVal = new Decimal(item.metalValue);
        const mkVal = new Decimal(item.makingChargeAmount);
        const stVal = new Decimal(item.stoneCharges);
        const itmDisc = new Decimal(item.itemDiscount);
        const itmTaxable = new Decimal(item.taxableAmount);
        const itmTotal = new Decimal(item.totalAmount);
        const itmWt = new Decimal(item.netWeight);

        totalMetalValue = totalMetalValue.plus(mVal);
        totalMakingCharges = totalMakingCharges.plus(mkVal);
        totalStoneCharges = totalStoneCharges.plus(stVal);
        totalItemDiscounts = totalItemDiscounts.plus(itmDisc);

        const catEntry = categoryMap.get(cat) ?? {
          count: 0,
          netWeight: new Decimal(0),
          metal: new Decimal(0),
          making: new Decimal(0),
          stone: new Decimal(0),
          taxable: new Decimal(0),
          total: new Decimal(0),
        };
        catEntry.count += 1;
        catEntry.netWeight = catEntry.netWeight.plus(itmWt);
        catEntry.metal = catEntry.metal.plus(mVal);
        catEntry.making = catEntry.making.plus(mkVal);
        catEntry.stone = catEntry.stone.plus(stVal);
        catEntry.taxable = catEntry.taxable.plus(itmTaxable);
        catEntry.total = catEntry.total.plus(itmTotal);
        categoryMap.set(cat, catEntry);
      }
    }

    const totalDiscounts = totalInvoiceDiscounts.plus(totalItemDiscounts);

    const dailyTrend: DailySalesSummary[] = Array.from(dailyMap.entries()).map(([date, d]) => ({
      date,
      invoiceCount: d.count,
      grossSales: d.gross.toFixed(2),
      taxableAmount: d.taxable.toFixed(2),
      taxAmount: d.tax.toFixed(2),
      paidAmount: d.paid.toFixed(2),
      balanceAmount: d.balance.toFixed(2),
    }));

    const categoryBreakdown: CategorySalesSummary[] = Array.from(categoryMap.entries()).map(
      ([category, c]) => ({
        category,
        itemCount: c.count,
        netWeightGrams: c.netWeight.toFixed(3),
        metalValue: c.metal.toFixed(2),
        makingCharges: c.making.toFixed(2),
        stoneCharges: c.stone.toFixed(2),
        taxableAmount: c.taxable.toFixed(2),
        totalAmount: c.total.toFixed(2),
      })
    );

    return {
      filters: {
        datePreset: filters.datePreset ?? 'THIS_MONTH',
        startDate: formatIstDate(dateRange.startDate),
        endDate: formatIstDate(dateRange.endDate),
        branchId: targetBranchId,
        branchName,
        paymentStatus: filters.paymentStatus ?? 'ALL',
      },
      totals: {
        invoiceCount: invoices.length,
        grossSales: totalGrossSales.toFixed(2),
        taxableAmount: totalTaxable.toFixed(2),
        totalTax: totalTax.toFixed(2),
        cgstAmount: totalCgst.toFixed(2),
        sgstAmount: totalSgst.toFixed(2),
        igstAmount: totalIgst.toFixed(2),
        discountAmount: totalDiscounts.toFixed(2),
        roundOffAmount: totalRoundOff.toFixed(2),
        paidAmount: totalPaid.toFixed(2),
        balanceAmount: totalBalance.toFixed(2),
        metalValue: totalMetalValue.toFixed(2),
        makingCharges: totalMakingCharges.toFixed(2),
        stoneCharges: totalStoneCharges.toFixed(2),
      },
      dailyTrend,
      categoryBreakdown,
    };
  }

  // ----------------------------------------------------------------------------
  // 2. PAYMENT COLLECTIONS REPORT
  // ----------------------------------------------------------------------------
  async getPaymentCollectionsReport(
    ctx: SecurityContext,
    filters: PaymentCollectionsFilters = {}
  ): Promise<PaymentCollectionsReport> {
    const tenantId = ctx.tenantId;
    const targetBranchId = this.resolveTargetBranchId(ctx, filters.branchId);
    const branchName = await this.resolveBranchName(tenantId, targetBranchId);

    const dateRange = resolvePresetDateRange(
      filters.datePreset ?? 'THIS_MONTH',
      filters.from,
      filters.to
    );

    const branchFilter = targetBranchId
      ? { branchId: targetBranchId }
      : { branchId: { in: Array.from(ctx.allowedBranchIds) } };

    const paymentMethodFilter =
      filters.paymentMethod && filters.paymentMethod !== 'ALL'
        ? { paymentMethod: filters.paymentMethod }
        : {};

    // 1. Query Customer Payments from completed invoices
    const payments = await this.db.invoicePayment.findMany({
      where: {
        organizationId: tenantId,
        ...paymentMethodFilter,
        paymentDate: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
        invoice: {
          organizationId: tenantId,
          status: 'COMPLETED',
          ...branchFilter,
        },
      },
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            customerName: true,
            branch: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });

    let totalCollected = new Decimal(0);
    let cashCollected = new Decimal(0);
    let digitalCollected = new Decimal(0);

    const methodMap = new Map<string, { count: number; total: Decimal }>();

    const collections: PaymentCollectionItem[] = payments.map((p) => {
      const pAmt = new Decimal(p.amount);
      totalCollected = totalCollected.plus(pAmt);

      if (p.paymentMethod === 'CASH') {
        cashCollected = cashCollected.plus(pAmt);
      } else {
        digitalCollected = digitalCollected.plus(pAmt);
      }

      const mEntry = methodMap.get(p.paymentMethod) ?? { count: 0, total: new Decimal(0) };
      mEntry.count += 1;
      mEntry.total = mEntry.total.plus(pAmt);
      methodMap.set(p.paymentMethod, mEntry);

      return {
        id: p.id,
        paymentDate: formatIstDate(p.paymentDate, true),
        paymentMethod: p.paymentMethod,
        amount: pAmt.toFixed(2),
        transactionRef: p.transactionRef,
        invoiceNumber: p.invoice.invoiceNumber,
        customerName: p.invoice.customerName?.trim() || 'Walk-in Customer',
        branchName: p.invoice.branch.name,
        notes: p.notes,
      };
    });

    const methodBreakdown: PaymentMethodBreakdown[] = Array.from(methodMap.entries()).map(
      ([paymentMethod, m]) => {
        const pct = totalCollected.gt(0)
          ? m.total.dividedBy(totalCollected).times(100).toFixed(1)
          : '0.0';
        return {
          paymentMethod,
          count: m.count,
          totalAmount: m.total.toFixed(2),
          percentage: `${pct}%`,
        };
      }
    );

    // Outstanding customer receivables in active scope
    const duesAgg = await this.db.invoice.aggregate({
      where: {
        organizationId: tenantId,
        ...branchFilter,
        status: 'COMPLETED',
        balanceAmount: { gt: 0 },
      },
      _sum: { balanceAmount: true },
    });
    const outstandingReceivables = duesAgg._sum.balanceAmount
      ? new Decimal(duesAgg._sum.balanceAmount).toFixed(2)
      : '0.00';

    // 2. Separate Bank Settlements Section (Reconciliation settlements credited to bank)
    const settledLines = await this.db.bankStatementLine.findMany({
      where: {
        organizationId: tenantId,
        reconciliationStatus: 'SETTLED',
        settledAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
        ...(targetBranchId ? { bankAccount: { branchId: targetBranchId } } : {}),
      },
      include: {
        bankAccount: {
          select: { bankName: true, accountNumberMasked: true },
        },
        settlementJournal: {
          select: { entryNumber: true },
        },
      },
      orderBy: { transactionDate: 'desc' },
    });

    let totalSettledNet = new Decimal(0);
    let totalSettlementFees = new Decimal(0);

    const settlements: BankSettlementSummaryItem[] = settledLines.map((line) => {
      const netDeposit = new Decimal(line.amount);
      const fee = line.feeAmount ? new Decimal(line.feeAmount) : new Decimal(0);
      const gross = netDeposit.plus(fee);

      totalSettledNet = totalSettledNet.plus(netDeposit);
      totalSettlementFees = totalSettlementFees.plus(fee);

      return {
        id: line.id,
        transactionDate: formatIstDate(line.transactionDate),
        bankName: line.bankAccount.bankName,
        accountNumber: line.bankAccount.accountNumberMasked,
        referenceNumber: line.referenceNumber,
        depositAmount: netDeposit.toFixed(2),
        feeAmount: fee.gt(0) ? fee.toFixed(2) : '0.00',
        grossAmount: gross.toFixed(2),
        settlementJournalNumber: line.settlementJournal?.entryNumber ?? '-',
      };
    });

    const totalSettledGross = totalSettledNet.plus(totalSettlementFees);

    return {
      filters: {
        datePreset: filters.datePreset ?? 'THIS_MONTH',
        startDate: formatIstDate(dateRange.startDate),
        endDate: formatIstDate(dateRange.endDate),
        branchId: targetBranchId,
        branchName,
        paymentMethod: filters.paymentMethod ?? 'ALL',
      },
      totals: {
        totalCollected: totalCollected.toFixed(2),
        paymentCount: payments.length,
        cashCollected: cashCollected.toFixed(2),
        digitalCollected: digitalCollected.toFixed(2),
        outstandingReceivables,
      },
      settlementTotals: {
        totalSettledNet: totalSettledNet.toFixed(2),
        totalSettlementFees: totalSettlementFees.toFixed(2),
        totalSettledGross: totalSettledGross.toFixed(2),
        settledLinesCount: settledLines.length,
      },
      methodBreakdown,
      collections,
      settlements,
    };
  }

  // ----------------------------------------------------------------------------
  // 3. GST OUTWARD SUMMARY REPORT
  // ----------------------------------------------------------------------------
  async getGstSummaryReport(
    ctx: SecurityContext,
    filters: GstSummaryFilters = {}
  ): Promise<GstSummaryReport> {
    const tenantId = ctx.tenantId;
    const targetBranchId = this.resolveTargetBranchId(ctx, filters.branchId);
    const branchName = await this.resolveBranchName(tenantId, targetBranchId);

    const dateRange = resolvePresetDateRange(
      filters.datePreset ?? 'THIS_MONTH',
      filters.from,
      filters.to
    );

    const branchFilter = targetBranchId
      ? { branchId: targetBranchId }
      : { branchId: { in: Array.from(ctx.allowedBranchIds) } };

    const invoices = await this.db.invoice.findMany({
      where: {
        organizationId: tenantId,
        ...branchFilter,
        status: 'COMPLETED',
        invoiceDate: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    let totalTaxable = new Decimal(0);
    let totalCgst = new Decimal(0);
    let totalSgst = new Decimal(0);
    let totalIgst = new Decimal(0);
    let totalTaxLiability = new Decimal(0);
    let totalInvoiceValue = new Decimal(0);

    let intraStateCount = 0;
    let interStateCount = 0;

    const dailyScheduleMap = new Map<
      string,
      {
        count: number;
        taxable: Decimal;
        cgst: Decimal;
        sgst: Decimal;
        igst: Decimal;
        tax: Decimal;
        gross: Decimal;
      }
    >();

    const invoiceItems: InvoiceGstItem[] = [];

    for (const inv of invoices) {
      const taxable = new Decimal(inv.taxableAmount);
      const cgst = new Decimal(inv.cgstAmount);
      const sgst = new Decimal(inv.sgstAmount);
      const igst = new Decimal(inv.igstAmount);
      const tax = new Decimal(inv.totalTax);
      const gross = new Decimal(inv.grandTotal);

      totalTaxable = totalTaxable.plus(taxable);
      totalCgst = totalCgst.plus(cgst);
      totalSgst = totalSgst.plus(sgst);
      totalIgst = totalIgst.plus(igst);
      totalTaxLiability = totalTaxLiability.plus(tax);
      totalInvoiceValue = totalInvoiceValue.plus(gross);

      if (inv.isInterState) {
        interStateCount += 1;
      } else {
        intraStateCount += 1;
      }

      const dayKey = formatIstDate(inv.invoiceDate);
      const dayEntry = dailyScheduleMap.get(dayKey) ?? {
        count: 0,
        taxable: new Decimal(0),
        cgst: new Decimal(0),
        sgst: new Decimal(0),
        igst: new Decimal(0),
        tax: new Decimal(0),
        gross: new Decimal(0),
      };
      dayEntry.count += 1;
      dayEntry.taxable = dayEntry.taxable.plus(taxable);
      dayEntry.cgst = dayEntry.cgst.plus(cgst);
      dayEntry.sgst = dayEntry.sgst.plus(sgst);
      dayEntry.igst = dayEntry.igst.plus(igst);
      dayEntry.tax = dayEntry.tax.plus(tax);
      dayEntry.gross = dayEntry.gross.plus(gross);
      dailyScheduleMap.set(dayKey, dayEntry);

      invoiceItems.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: formatIstDate(inv.invoiceDate),
        customerName: inv.customerName?.trim() || 'Retail Customer',
        customerPan: inv.customerPan,
        placeOfSupply: inv.customerState || 'Maharashtra (27)',
        isInterState: inv.isInterState,
        taxableAmount: taxable.toFixed(2),
        cgstAmount: cgst.toFixed(2),
        sgstAmount: sgst.toFixed(2),
        igstAmount: igst.toFixed(2),
        totalTax: tax.toFixed(2),
        grandTotal: gross.toFixed(2),
      });
    }

    const dailySchedule: DailyGstSummary[] = Array.from(dailyScheduleMap.entries()).map(
      ([date, d]) => ({
        date,
        invoiceCount: d.count,
        taxableAmount: d.taxable.toFixed(2),
        cgstAmount: d.cgst.toFixed(2),
        sgstAmount: d.sgst.toFixed(2),
        igstAmount: d.igst.toFixed(2),
        totalTax: d.tax.toFixed(2),
        grossInvoiceValue: d.gross.toFixed(2),
      })
    );

    const rateSchedules = [
      {
        hsnCode: '7113',
        description: 'Articles of jewellery and parts thereof, of precious metal',
        ratePercent: '3.00%',
        taxableAmount: totalTaxable.toFixed(2),
        cgstAmount: totalCgst.toFixed(2),
        sgstAmount: totalSgst.toFixed(2),
        igstAmount: totalIgst.toFixed(2),
        totalTax: totalTaxLiability.toFixed(2),
      },
    ];

    return {
      filters: {
        datePreset: filters.datePreset ?? 'THIS_MONTH',
        startDate: formatIstDate(dateRange.startDate),
        endDate: formatIstDate(dateRange.endDate),
        branchId: targetBranchId,
        branchName,
      },
      totals: {
        totalInvoices: invoices.length,
        intraStateCount,
        interStateCount,
        totalTaxableAmount: totalTaxable.toFixed(2),
        totalCgstAmount: totalCgst.toFixed(2),
        totalSgstAmount: totalSgst.toFixed(2),
        totalIgstAmount: totalIgst.toFixed(2),
        totalTaxLiability: totalTaxLiability.toFixed(2),
        totalInvoiceValue: totalInvoiceValue.toFixed(2),
      },
      rateSchedules,
      dailySchedule,
      invoices: invoiceItems,
      statutoryDisclosure:
        'Statutory Notice: Retail sales are currently recorded as B2C Outward Supplies under Jewellery HSN 7113. Customer GSTIN and 8-digit HSN codes are not stored per invoice item. This summary reflects recorded business tax liability and must be reconciled prior to statutory GSTR-1 / GSTR-3B filing.',
    };
  }

  // ----------------------------------------------------------------------------
  // 4. INVENTORY VALUATION REPORT
  // ----------------------------------------------------------------------------
  async getInventoryValuationReport(
    ctx: SecurityContext,
    filters: InventoryValuationFilters = {}
  ): Promise<InventoryValuationReport> {
    const tenantId = ctx.tenantId;
    const targetBranchId = this.resolveTargetBranchId(ctx, filters.branchId);
    const branchName = await this.resolveBranchName(tenantId, targetBranchId);

    const branchFilter = targetBranchId
      ? { branchId: targetBranchId }
      : { branchId: { in: Array.from(ctx.allowedBranchIds) } };

    const metalFilter =
      filters.metalType && filters.metalType !== 'ALL' ? { metalType: filters.metalType } : {};
    const purityFilter =
      filters.purity && filters.purity !== 'ALL' ? { purity: filters.purity } : {};
    const categoryFilter =
      filters.category && filters.category !== 'ALL'
        ? { product: { category: filters.category } }
        : {};

    const ornaments = await this.db.ornament.findMany({
      where: {
        organizationId: tenantId,
        ...branchFilter,
        status: 'AVAILABLE',
        ...metalFilter,
        ...purityFilter,
        ...categoryFilter,
      },
      include: {
        product: {
          select: { name: true, sku: true, category: true },
        },
        branch: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalGrossWeight = new Decimal(0);
    let totalStoneWeight = new Decimal(0);
    let totalNetWeight = new Decimal(0);
    let totalRecordedCost = new Decimal(0);
    let recordedCostCount = 0;
    let totalIndicativeEstimate = new Decimal(0);
    let unvaluedItemsCount = 0;

    const categoryMap = new Map<
      string,
      { count: number; gross: Decimal; net: Decimal; indicative: Decimal }
    >();

    const items: OrnamentValuationItem[] = ornaments.map((orn) => {
      const gross = new Decimal(orn.grossWeight);
      const stone = new Decimal(orn.stoneWeight);
      const net = new Decimal(orn.netWeight);

      totalGrossWeight = totalGrossWeight.plus(gross);
      totalStoneWeight = totalStoneWeight.plus(stone);
      totalNetWeight = totalNetWeight.plus(net);

      let costStr = 'Not Recorded';
      if (orn.costAmount !== null && orn.costAmount !== undefined) {
        const costDec = new Decimal(orn.costAmount);
        totalRecordedCost = totalRecordedCost.plus(costDec);
        recordedCostCount += 1;
        costStr = costDec.toFixed(2);
      }

      const catName = orn.product.category?.trim() || 'General';
      const catEntry = categoryMap.get(catName) ?? {
        count: 0,
        gross: new Decimal(0),
        net: new Decimal(0),
        indicative: new Decimal(0),
      };
      catEntry.count += 1;
      catEntry.gross = catEntry.gross.plus(gross);
      catEntry.net = catEntry.net.plus(net);

      // Benchmark bullion valuation rate resolution (F-01)
      const { rate: rateDec, reason: unvaluedReason } = resolveIndicativeBullionRate(
        orn.metalType,
        orn.purity
      );

      let indicativePriceStr = 'Price Unavailable';
      if (rateDec) {
        const indicativeVal = net.times(rateDec);
        totalIndicativeEstimate = totalIndicativeEstimate.plus(indicativeVal);
        indicativePriceStr = indicativeVal.toFixed(2);
        catEntry.indicative = catEntry.indicative.plus(indicativeVal);
      } else {
        unvaluedItemsCount += 1;
        indicativePriceStr = `Price Unavailable (${unvaluedReason})`;
      }

      categoryMap.set(catName, catEntry);

      return {
        id: orn.id,
        tagCode: orn.tagCode,
        huid: orn.huid,
        productName: orn.product.name,
        sku: orn.product.sku,
        category: orn.product.category,
        metalType: orn.metalType,
        purity: orn.purity,
        grossWeight: gross.toFixed(3),
        netWeight: net.toFixed(3),
        costAmount: costStr,
        indicativePrice: indicativePriceStr,
        branchName: orn.branch.name,
      };
    });

    const categoryBreakdown: CategoryValuationSummary[] = Array.from(categoryMap.entries()).map(
      ([category, c]) => ({
        category,
        ornamentCount: c.count,
        grossWeightGrams: c.gross.toFixed(3),
        netWeightGrams: c.net.toFixed(3),
        indicativeValuation: c.indicative.toFixed(2),
      })
    );

    return {
      filters: {
        branchId: targetBranchId,
        branchName,
        metalType: filters.metalType ?? 'ALL',
        purity: filters.purity ?? 'ALL',
        category: filters.category ?? 'ALL',
      },
      totals: {
        totalOrnaments: ornaments.length,
        totalGrossWeightGrams: totalGrossWeight.toFixed(3),
        totalStoneWeightGrams: totalStoneWeight.toFixed(3),
        totalNetWeightGrams: totalNetWeight.toFixed(3),
        totalRecordedCost: recordedCostCount > 0 ? totalRecordedCost.toFixed(2) : 'Not Recorded',
        recordedCostItemsCount: recordedCostCount,
        totalIndicativeEstimate: totalIndicativeEstimate.toFixed(2),
        unvaluedItemsCount,
      },
      categoryBreakdown,
      items,
      costDisclosure:
        unvaluedItemsCount > 0
          ? `Inventory Valuation Notice: ${recordedCostCount} of ${ornaments.length} items have recorded cost. ${unvaluedItemsCount} item(s) have unsupported metal/purity and are excluded from indicative subtotal. The Indicative Valuation is an unrealized market estimate based on hallmark bullion board rates and does NOT represent accounting book value.`
          : recordedCostCount === 0
            ? `Inventory Valuation Notice: 0 of ${ornaments.length} available ornaments have recorded wholesale acquisition cost. Cost figures are marked as Not Recorded. The Indicative Valuation is an unrealized market estimate based on daily benchmark bullion board rates and does NOT represent accounting book value.`
            : `Inventory Valuation Notice: ${recordedCostCount} of ${ornaments.length} ornaments have recorded cost. Benchmark valuation is an unrealized estimate based on bullion market rates.`,
    };
  }

  // ----------------------------------------------------------------------------
  // 5. TRIAL BALANCE REPORT (General Ledger)
  // ----------------------------------------------------------------------------
  async getTrialBalanceReport(
    ctx: SecurityContext,
    filters: TrialBalanceFilters = {}
  ): Promise<TrialBalanceReport> {
    const tenantId = ctx.tenantId;
    const targetBranchId = this.resolveTargetBranchId(ctx, filters.branchId);
    const branchName = await this.resolveBranchName(tenantId, targetBranchId);

    const dateRange = resolvePresetDateRange(
      filters.datePreset ?? 'FY_2026_27',
      filters.from,
      filters.to
    );

    const branchFilter = targetBranchId
      ? { branchId: targetBranchId }
      : {
          OR: [
            { branchId: { in: Array.from(ctx.allowedBranchIds) } },
            { branchId: null },
          ],
        };

    // 1. Fetch active chart of accounts for the tenant
    const accounts = await this.db.ledgerAccount.findMany({
      where: {
        organizationId: tenantId,
        isActive: true,
      },
      orderBy: { code: 'asc' },
    });

    // 2. Fetch posted journal lines up to the period end date (as-of date)
    const lines = await this.db.journalLine.findMany({
      where: {
        organizationId: tenantId,
        journalEntry: {
          status: 'POSTED',
          postingDate: { lte: dateRange.endDate },
          ...branchFilter,
        },
      },
      select: {
        accountId: true,
        debitAmount: true,
        creditAmount: true,
        journalEntry: {
          select: {
            postingDate: true,
          },
        },
      },
    });

    // 3. Find earliest posted journal entry to establish commencement date
    const earliestEntry = await this.db.journalEntry.findFirst({
      where: {
        organizationId: tenantId,
        status: 'POSTED',
      },
      orderBy: { postingDate: 'asc' },
      select: { postingDate: true },
    });
    const ledgerCommencementDate = earliestEntry ? formatIstDate(earliestEntry.postingDate) : null;

    // 4. Aggregate cumulative balances and period activity by account
    const accountLineMap = new Map<
      string,
      {
        cumDebit: Decimal;
        cumCredit: Decimal;
        periodDebit: Decimal;
        periodCredit: Decimal;
      }
    >();

    for (const line of lines) {
      let entry = accountLineMap.get(line.accountId);
      if (!entry) {
        entry = {
          cumDebit: new Decimal(0),
          cumCredit: new Decimal(0),
          periodDebit: new Decimal(0),
          periodCredit: new Decimal(0),
        };
        accountLineMap.set(line.accountId, entry);
      }

      const dr = new Decimal(line.debitAmount);
      const cr = new Decimal(line.creditAmount);

      entry.cumDebit = entry.cumDebit.plus(dr);
      entry.cumCredit = entry.cumCredit.plus(cr);

      const pDate = line.journalEntry.postingDate;
      if (pDate >= dateRange.startDate && pDate <= dateRange.endDate) {
        entry.periodDebit = entry.periodDebit.plus(dr);
        entry.periodCredit = entry.periodCredit.plus(cr);
      }
    }

    let totalDebitBalance = new Decimal(0);
    let totalCreditBalance = new Decimal(0);
    let totalPeriodDebit = new Decimal(0);
    let totalPeriodCredit = new Decimal(0);
    let activeAccountsCount = 0;

    const accountRows: TrialBalanceAccountItem[] = accounts.map((acct) => {
      const stats = accountLineMap.get(acct.id) ?? {
        cumDebit: new Decimal(0),
        cumCredit: new Decimal(0),
        periodDebit: new Decimal(0),
        periodCredit: new Decimal(0),
      };

      let drBal = new Decimal(0);
      let crBal = new Decimal(0);

      if (stats.cumDebit.gt(stats.cumCredit)) {
        drBal = stats.cumDebit.minus(stats.cumCredit);
      } else if (stats.cumCredit.gt(stats.cumDebit)) {
        crBal = stats.cumCredit.minus(stats.cumDebit);
      }

      totalDebitBalance = totalDebitBalance.plus(drBal);
      totalCreditBalance = totalCreditBalance.plus(crBal);
      totalPeriodDebit = totalPeriodDebit.plus(stats.periodDebit);
      totalPeriodCredit = totalPeriodCredit.plus(stats.periodCredit);

      if (!drBal.isZero() || !crBal.isZero() || !stats.periodDebit.isZero() || !stats.periodCredit.isZero()) {
        activeAccountsCount++;
      }

      // Format signed net balance according to normal balance
      const signedNet = acct.normalBalance === 'DEBIT'
        ? stats.cumDebit.minus(stats.cumCredit)
        : stats.cumCredit.minus(stats.cumDebit);

      return {
        id: acct.id,
        code: acct.code,
        name: acct.name,
        classification: acct.classification as AccountClassification,
        normalBalance: acct.normalBalance as NormalBalance,
        debitBalance: drBal.toFixed(2),
        creditBalance: crBal.toFixed(2),
        netBalance: signedNet.toFixed(2),
        periodDebit: stats.periodDebit.toFixed(2),
        periodCredit: stats.periodCredit.toFixed(2),
      };
    });

    const difference = totalDebitBalance.minus(totalCreditBalance);
    const isBalanced = difference.abs().lte(0.005);

    const anomalies: FinancialStatementAnomaly[] = [];
    for (const row of accountRows) {
      const net = new Decimal(row.netBalance);
      if (net.lt(0)) {
        if (row.code === '1110') {
          anomalies.push({
            type: 'NEGATIVE_RECEIVABLE',
            accountCode: row.code,
            accountName: row.name,
            amount: row.netBalance,
            severity: 'CRITICAL',
            explanation: `Accounts Receivable has an abnormal credit balance (${row.netBalance} INR). Customer payment receipts were credited to the general ledger without corresponding pre-ledger sales invoice debit postings.`,
            reconciliationAction: 'Audit pre-ledger sales invoices and post opening accounts receivable balances or historical sales journals before relying on this statement for statutory or tax filing.',
          });
        } else if (row.classification === 'ASSET') {
          anomalies.push({
            type: 'NEGATIVE_ASSET',
            accountCode: row.code,
            accountName: row.name,
            amount: row.netBalance,
            severity: 'CRITICAL',
            explanation: `Asset account ${row.name} (${row.code}) has an abnormal credit balance of ${row.netBalance} INR contrary to normal DEBIT balance.`,
            reconciliationAction: `Reconcile journal entries affecting ${row.code} to ensure all debits are recorded.`,
          });
        } else if (row.classification === 'LIABILITY' || row.classification === 'EQUITY') {
          anomalies.push({
            type: 'ABNORMAL_LIABILITY_BALANCE',
            accountCode: row.code,
            accountName: row.name,
            amount: row.netBalance,
            severity: 'WARNING',
            explanation: `${row.classification} account ${row.name} (${row.code}) has an abnormal debit balance of ${row.netBalance} INR contrary to normal CREDIT balance.`,
            reconciliationAction: `Audit disbursements and opening obligations for ${row.code}.`,
          });
        }
      }
    }

    const hasCriticalAnomaly = anomalies.some((a) => a.severity === 'CRITICAL');
    const isSuitableForReliance = isBalanced && !hasCriticalAnomaly;
    const completenessStatus: StatementCompletenessStatus = !isBalanced
      ? 'ANOMALY_DETECTED'
      : anomalies.length > 0
      ? 'INCOMPLETE_DATA'
      : 'COMPLETE';

    const integrityNotice = isBalanced
      ? anomalies.length > 0
        ? `Trial Balance is arithmetically balanced (Total Debits = Total Credits). However, ${anomalies.length} account anomaly/abnormal balance is detected (including Accounts Receivable credit balance). Balances reflect cumulative posted double-entry journal lines as of ${formatIstDate(dateRange.endDate)}. Historical invoices or payments preceding ledger activation (${ledgerCommencementDate ?? 'N/A'}) are not represented.`
        : `Trial Balance is arithmetically balanced (Total Debits = Total Credits). Balances reflect cumulative posted double-entry journal lines as of ${formatIstDate(dateRange.endDate)}.`
      : `Trial Balance Discrepancy: Total debits (₹${totalDebitBalance.toFixed(2)}) do not match total credits (₹${totalCreditBalance.toFixed(2)}). Discrepancy: ₹${difference.abs().toFixed(2)}. This indicates an unbalanced journal entry or database transaction.`;

    const discrepancyNotice = isBalanced
      ? null
      : `Discrepancy of ₹${difference.abs().toFixed(2)} detected between debit and credit balances.`;

    return {
      filters: {
        datePreset: filters.datePreset ?? 'FY_2026_27',
        startDate: formatIstDate(dateRange.startDate),
        endDate: formatIstDate(dateRange.endDate),
        asOfDate: formatIstDate(dateRange.endDate),
        fiscalYear: dateRange.fiscalYear,
        branchId: targetBranchId,
        branchName,
      },
      totals: {
        totalDebitBalance: totalDebitBalance.toFixed(2),
        totalCreditBalance: totalCreditBalance.toFixed(2),
        difference: difference.toFixed(2),
        isBalanced,
        isSuitableForReliance,
        completenessStatus,
        totalPeriodDebit: totalPeriodDebit.toFixed(2),
        totalPeriodCredit: totalPeriodCredit.toFixed(2),
        activeAccountsCount,
      },
      accounts: accountRows,
      anomalies,
      ledgerCommencementDate,
      integrityNotice,
      discrepancyNotice,
    };
  }

  // ----------------------------------------------------------------------------
  // 6. PROFIT & LOSS STATEMENT (General Ledger)
  // ----------------------------------------------------------------------------
  async getProfitAndLossReport(
    ctx: SecurityContext,
    filters: ProfitAndLossFilters = {}
  ): Promise<ProfitAndLossReport> {
    const tenantId = ctx.tenantId;
    const targetBranchId = this.resolveTargetBranchId(ctx, filters.branchId);
    const branchName = await this.resolveBranchName(tenantId, targetBranchId);

    const dateRange = resolvePresetDateRange(
      filters.datePreset ?? 'FY_2026_27',
      filters.from,
      filters.to
    );

    const branchFilter = targetBranchId
      ? { branchId: targetBranchId }
      : {
          OR: [
            { branchId: { in: Array.from(ctx.allowedBranchIds) } },
            { branchId: null },
          ],
        };

    // 1. Fetch active REVENUE and EXPENSE accounts
    const plAccounts = await this.db.ledgerAccount.findMany({
      where: {
        organizationId: tenantId,
        classification: { in: ['REVENUE', 'EXPENSE'] },
        isActive: true,
      },
      orderBy: { code: 'asc' },
    });

    // 2. Fetch journal lines posted strictly in the selected period
    const lines = await this.db.journalLine.findMany({
      where: {
        organizationId: tenantId,
        journalEntry: {
          status: 'POSTED',
          postingDate: {
            gte: dateRange.startDate,
            lte: dateRange.endDate,
          },
          ...branchFilter,
        },
        account: {
          classification: { in: ['REVENUE', 'EXPENSE'] },
        },
      },
      select: {
        accountId: true,
        debitAmount: true,
        creditAmount: true,
      },
    });

    // 3. Find earliest posted journal entry to establish commencement date
    const earliestEntry = await this.db.journalEntry.findFirst({
      where: {
        organizationId: tenantId,
        status: 'POSTED',
      },
      orderBy: { postingDate: 'asc' },
      select: { postingDate: true },
    });
    const ledgerCommencementDate = earliestEntry ? formatIstDate(earliestEntry.postingDate) : null;

    // 4. Aggregate period debits and credits by account
    const lineMap = new Map<string, { debit: Decimal; credit: Decimal }>();
    for (const l of lines) {
      let entry = lineMap.get(l.accountId);
      if (!entry) {
        entry = { debit: new Decimal(0), credit: new Decimal(0) };
        lineMap.set(l.accountId, entry);
      }
      entry.debit = entry.debit.plus(new Decimal(l.debitAmount));
      entry.credit = entry.credit.plus(new Decimal(l.creditAmount));
    }

    const operatingRevenueItems: ProfitAndLossLineItem[] = [];
    const contraRevenueItems: ProfitAndLossLineItem[] = [];
    const cogsItems: ProfitAndLossLineItem[] = [];
    const operatingExpenseItems: ProfitAndLossLineItem[] = [];

    let totalGrossRevenue = new Decimal(0);
    let totalContraRevenue = new Decimal(0);
    let totalCogs = new Decimal(0);
    let totalOperatingExpenses = new Decimal(0);

    for (const acct of plAccounts) {
      const stats = lineMap.get(acct.id) ?? { debit: new Decimal(0), credit: new Decimal(0) };

      if (acct.classification === 'REVENUE') {
        if (acct.normalBalance === 'CREDIT') {
          // Gross Revenue (Credit normal): Net = Credit - Debit
          const net = stats.credit.minus(stats.debit);
          operatingRevenueItems.push({
            code: acct.code,
            name: acct.name,
            amount: net.toFixed(2),
          });
          totalGrossRevenue = totalGrossRevenue.plus(net);
        } else {
          // Contra-Revenue (Debit normal, e.g. 4110 Discounts, 4120 Returns): Net = Debit - Credit
          const net = stats.debit.minus(stats.credit);
          contraRevenueItems.push({
            code: acct.code,
            name: acct.name,
            amount: net.toFixed(2),
          });
          totalContraRevenue = totalContraRevenue.plus(net);
        }
      } else if (acct.classification === 'EXPENSE') {
        const net = stats.debit.minus(stats.credit);
        if (acct.code === '5010') {
          // Cost of Goods Sold
          cogsItems.push({
            code: acct.code,
            name: acct.name,
            amount: net.toFixed(2),
          });
          totalCogs = totalCogs.plus(net);
        } else {
          // Operating Expenses (e.g. 5110 Payment Processing Fees)
          operatingExpenseItems.push({
            code: acct.code,
            name: acct.name,
            amount: net.toFixed(2),
          });
          totalOperatingExpenses = totalOperatingExpenses.plus(net);
        }
      }
    }

    const totalNetRevenue = totalGrossRevenue.minus(totalContraRevenue);
    const grossProfitAmount = totalNetRevenue.minus(totalCogs);
    const grossProfitPercentage = totalNetRevenue.gt(0)
      ? grossProfitAmount.div(totalNetRevenue).times(100).toFixed(2) + '%'
      : '0.00%';

    const totalExpenses = totalCogs.plus(totalOperatingExpenses);
    const netProfitOrLossAmount = totalNetRevenue.minus(totalExpenses);
    const isProfit = netProfitOrLossAmount.gte(0);

    const isCogsMissing = totalCogs.isZero();
    const cogsNotice = isCogsMissing
      ? 'Accounting Limitation Notice: Wholesale jewellery acquisition costs and Cost of Goods Sold (COGS) are not currently posted in the general ledger. Gross Profit and Net Profit shown above reflect recorded revenue and fee vouchers only, and do NOT represent final audited earnings.'
      : 'Cost of Goods Sold is calculated from posted inventory derecognition journals (Account 5010).';

    const plAnomalies: FinancialStatementAnomaly[] = [];
    if (isCogsMissing) {
      plAnomalies.push({
        type: 'UNRECORDED_COGS',
        accountCode: '5010',
        accountName: 'Cost of Goods Sold',
        amount: '0.00',
        severity: 'WARNING',
        explanation: 'Wholesale jewellery acquisition costs and inventory derecognition journals (COGS) are not posted in the general ledger.',
        reconciliationAction: 'Post periodic inventory derecognition journals or manual COGS vouchers before treating Gross Profit as taxable earnings.',
      });
    }

    const isSuitableForReliance = !isCogsMissing;
    const completenessStatus: StatementCompletenessStatus = isCogsMissing ? 'INCOMPLETE_DATA' : 'COMPLETE';

    const generalNotice = `Profit & Loss Statement reflects double-entry journal activity from ${formatIstDate(dateRange.startDate)} to ${formatIstDate(dateRange.endDate)}. Revenue figures are derived exclusively from posted ledger entries and exclude unposted historical billing invoices. Ledger commencement: ${ledgerCommencementDate ?? 'N/A'}.`;

    return {
      filters: {
        datePreset: filters.datePreset ?? 'FY_2026_27',
        startDate: formatIstDate(dateRange.startDate),
        endDate: formatIstDate(dateRange.endDate),
        fiscalYear: dateRange.fiscalYear,
        branchId: targetBranchId,
        branchName,
      },
      operatingRevenue: {
        items: operatingRevenueItems,
        totalGrossRevenue: totalGrossRevenue.toFixed(2),
        contraItems: contraRevenueItems,
        totalContraRevenue: totalContraRevenue.toFixed(2),
        totalNetRevenue: totalNetRevenue.toFixed(2),
      },
      costOfGoodsSold: {
        items: cogsItems,
        totalCogs: totalCogs.toFixed(2),
        isEstimatedOrMissing: isCogsMissing,
      },
      grossProfit: {
        amount: grossProfitAmount.toFixed(2),
        percentage: grossProfitPercentage,
      },
      operatingExpenses: {
        items: operatingExpenseItems,
        totalOperatingExpenses: totalOperatingExpenses.toFixed(2),
      },
      netProfitOrLoss: {
        amount: netProfitOrLossAmount.toFixed(2),
        isProfit,
      },
      summary: {
        isSuitableForReliance,
        completenessStatus,
      },
      anomalies: plAnomalies,
      ledgerCommencementDate,
      cogsNotice,
      generalNotice,
    };
  }

  // ----------------------------------------------------------------------------
  // 7. BALANCE SHEET (General Ledger)
  // ----------------------------------------------------------------------------
  async getBalanceSheetReport(
    ctx: SecurityContext,
    filters: BalanceSheetFilters = {}
  ): Promise<BalanceSheetReport> {
    const tenantId = ctx.tenantId;
    const targetBranchId = this.resolveTargetBranchId(ctx, filters.branchId);
    const branchName = await this.resolveBranchName(tenantId, targetBranchId);

    const dateRange = resolvePresetDateRange(
      filters.datePreset ?? 'FY_2026_27',
      filters.from,
      filters.to
    );

    const branchFilter = targetBranchId
      ? { branchId: targetBranchId }
      : {
          OR: [
            { branchId: { in: Array.from(ctx.allowedBranchIds) } },
            { branchId: null },
          ],
        };

    // 1. Fetch all active accounts
    const allAccounts = await this.db.ledgerAccount.findMany({
      where: {
        organizationId: tenantId,
        isActive: true,
      },
      orderBy: { code: 'asc' },
    });

    // 2. Fetch all journal lines up to the period end date (as-of date)
    const lines = await this.db.journalLine.findMany({
      where: {
        organizationId: tenantId,
        journalEntry: {
          status: 'POSTED',
          postingDate: { lte: dateRange.endDate },
          ...branchFilter,
        },
      },
      select: {
        accountId: true,
        debitAmount: true,
        creditAmount: true,
      },
    });

    // 3. Find earliest posted journal entry to establish commencement date
    const earliestEntry = await this.db.journalEntry.findFirst({
      where: {
        organizationId: tenantId,
        status: 'POSTED',
      },
      orderBy: { postingDate: 'asc' },
      select: { postingDate: true },
    });
    const ledgerCommencementDate = earliestEntry ? formatIstDate(earliestEntry.postingDate) : null;

    // 4. Aggregate cumulative debits and credits by account
    const lineMap = new Map<string, { debit: Decimal; credit: Decimal }>();
    for (const l of lines) {
      let entry = lineMap.get(l.accountId);
      if (!entry) {
        entry = { debit: new Decimal(0), credit: new Decimal(0) };
        lineMap.set(l.accountId, entry);
      }
      entry.debit = entry.debit.plus(new Decimal(l.debitAmount));
      entry.credit = entry.credit.plus(new Decimal(l.creditAmount));
    }

    const currentAssets: BalanceSheetLineItem[] = [];
    const currentLiabilities: BalanceSheetLineItem[] = [];
    const recordedEquity: BalanceSheetLineItem[] = [];

    let totalAssets = new Decimal(0);
    let totalLiabilities = new Decimal(0);
    let totalRecordedEquity = new Decimal(0);

    // Cumulative P&L totals up to asOfDate to calculate Current Period Retained Earnings
    let cumRevenue = new Decimal(0);
    let cumExpense = new Decimal(0);

    for (const acct of allAccounts) {
      const stats = lineMap.get(acct.id) ?? { debit: new Decimal(0), credit: new Decimal(0) };

      if (acct.classification === 'ASSET') {
        // Assets: Normal balance is DEBIT => Net = Debit - Credit
        const net = stats.debit.minus(stats.credit);
        currentAssets.push({
          code: acct.code,
          name: acct.name,
          amount: net.toFixed(2),
        });
        totalAssets = totalAssets.plus(net);
      } else if (acct.classification === 'LIABILITY') {
        // Liabilities: Normal balance is CREDIT => Net = Credit - Debit
        const net = stats.credit.minus(stats.debit);
        currentLiabilities.push({
          code: acct.code,
          name: acct.name,
          amount: net.toFixed(2),
        });
        totalLiabilities = totalLiabilities.plus(net);
      } else if (acct.classification === 'EQUITY') {
        // Equity: Normal balance is CREDIT => Net = Credit - Debit
        const net = stats.credit.minus(stats.debit);
        recordedEquity.push({
          code: acct.code,
          name: acct.name,
          amount: net.toFixed(2),
        });
        totalRecordedEquity = totalRecordedEquity.plus(net);
      } else if (acct.classification === 'REVENUE') {
        if (acct.normalBalance === 'CREDIT') {
          cumRevenue = cumRevenue.plus(stats.credit.minus(stats.debit));
        } else {
          cumRevenue = cumRevenue.minus(stats.debit.minus(stats.credit));
        }
      } else if (acct.classification === 'EXPENSE') {
        cumExpense = cumExpense.plus(stats.debit.minus(stats.credit));
      }
    }

    // Current period net result transferred to Equity
    const currentPeriodRetainedEarnings = cumRevenue.minus(cumExpense);
    const totalEquity = totalRecordedEquity.plus(currentPeriodRetainedEarnings);
    const totalLiabilitiesAndEquity = totalLiabilities.plus(totalEquity);

    const discrepancy = totalAssets.minus(totalLiabilitiesAndEquity);
    const isBalanced = discrepancy.abs().lte(0.005);

    const anomalies: FinancialStatementAnomaly[] = [];

    // 1. Check individual asset accounts for abnormal credit balances (e.g. negative AR)
    for (const item of currentAssets) {
      const amt = new Decimal(item.amount);
      if (amt.lt(0)) {
        if (item.code === '1110') {
          anomalies.push({
            type: 'NEGATIVE_RECEIVABLE',
            accountCode: item.code,
            accountName: item.name,
            amount: item.amount,
            severity: 'CRITICAL',
            explanation: `Accounts Receivable has an abnormal negative balance (${item.amount} INR). Customer payment receipts were credited to the general ledger without corresponding pre-ledger sales invoice debit postings.`,
            reconciliationAction: 'Audit pre-ledger sales invoices and post opening accounts receivable balances or historical sales journals before relying on this statement for statutory or tax filing.',
          });
        } else {
          anomalies.push({
            type: 'NEGATIVE_ASSET',
            accountCode: item.code,
            accountName: item.name,
            amount: item.amount,
            severity: 'CRITICAL',
            explanation: `Asset account ${item.name} (${item.code}) has an abnormal negative balance of ${item.amount} INR.`,
            reconciliationAction: `Reconcile journal entries affecting ${item.code} to ensure all debits are recorded.`,
          });
        }
      }
    }

    // 2. Check individual liability accounts for abnormal debit balances
    for (const item of currentLiabilities) {
      const amt = new Decimal(item.amount);
      if (amt.lt(0)) {
        anomalies.push({
          type: 'ABNORMAL_LIABILITY_BALANCE',
          accountCode: item.code,
          accountName: item.name,
          amount: item.amount,
          severity: 'WARNING',
          explanation: `Liability account ${item.name} (${item.code}) has an abnormal debit balance of ${item.amount} INR contrary to normal CREDIT balance.`,
          reconciliationAction: `Audit disbursements and opening obligations for ${item.code}.`,
        });
      }
    }

    // 3. Check negative total assets
    if (totalAssets.lt(0)) {
      anomalies.push({
        type: 'NEGATIVE_TOTAL_ASSETS',
        amount: totalAssets.toFixed(2),
        severity: 'CRITICAL',
        explanation: `Total Assets is negative (${totalAssets.toFixed(2)} INR) as a result of unposted historical asset baselines.`,
        reconciliationAction: 'Establish verified opening asset balance vouchers across all bank, cash, and receivable accounts.',
      });
    }

    // 4. Check unrecorded opening equity
    if (totalRecordedEquity.isZero()) {
      anomalies.push({
        type: 'UNRECORDED_OPENING_EQUITY',
        accountCode: '3010',
        accountName: "Owner's Capital",
        amount: '0.00',
        severity: 'WARNING',
        explanation: "Initial owner equity capital contribution is unrecorded in the general ledger (Account 3010 is zero).",
        reconciliationAction: "Record opening equity balance vouchers to document initial capital contributions from business owners.",
      });
    }

    const hasCriticalAnomaly = anomalies.some((a) => a.severity === 'CRITICAL');
    const isComplete = isBalanced && anomalies.length === 0;
    const isSuitableForReliance = isBalanced && !hasCriticalAnomaly && !totalRecordedEquity.isZero();
    const completenessStatus: StatementCompletenessStatus = !isBalanced
      ? 'ANOMALY_DETECTED'
      : anomalies.length > 0
      ? 'INCOMPLETE_DATA'
      : 'COMPLETE';

    let completenessNotice: string;
    if (!isBalanced) {
      completenessNotice = `Balance Sheet Discrepancy: Assets (₹${totalAssets.toFixed(2)}) do not equal Liabilities & Equity (₹${totalLiabilitiesAndEquity.toFixed(2)}). Discrepancy: ₹${discrepancy.abs().toFixed(2)}. This indicates an asymmetrical journal entry in the database.`;
    } else if (anomalies.length > 0) {
      completenessNotice = `INCOMPLETE FINANCIAL STATEMENT: Balance Sheet is mathematically balanced as of ${formatIstDate(dateRange.endDate)} (Assets = Liabilities + Equity). However, ${anomalies.length} integrity anomalies exist (including abnormal account balances such as Accounts Receivable ${currentAssets.find((a) => a.code === '1110')?.amount ?? '0.00'} INR, unrecorded opening capital (Initial owner equity capital), and historical inventory cost baselines). NOT SUITABLE for statutory or tax reliance until pre-ledger transactions are reconciled.`;
    } else {
      completenessNotice = `Balance Sheet is mathematically balanced and fully reconciled as of ${formatIstDate(dateRange.endDate)} (Assets = Liabilities + Equity).`;
    }

    return {
      filters: {
        datePreset: filters.datePreset ?? 'FY_2026_27',
        asOfDate: formatIstDate(dateRange.endDate),
        startDate: formatIstDate(dateRange.startDate),
        endDate: formatIstDate(dateRange.endDate),
        fiscalYear: dateRange.fiscalYear,
        branchId: targetBranchId,
        branchName,
      },
      assets: {
        currentAssets,
        totalCurrentAssets: totalAssets.toFixed(2),
        totalAssets: totalAssets.toFixed(2),
      },
      liabilities: {
        currentLiabilities,
        totalCurrentLiabilities: totalLiabilities.toFixed(2),
        totalLiabilities: totalLiabilities.toFixed(2),
      },
      equity: {
        recordedEquity,
        totalRecordedEquity: totalRecordedEquity.toFixed(2),
        currentPeriodRetainedEarnings: currentPeriodRetainedEarnings.toFixed(2),
        totalEquity: totalEquity.toFixed(2),
      },
      summary: {
        totalAssets: totalAssets.toFixed(2),
        totalLiabilitiesAndEquity: totalLiabilitiesAndEquity.toFixed(2),
        discrepancy: discrepancy.toFixed(2),
        isBalanced,
        isComplete,
        isSuitableForReliance,
        completenessStatus,
      },
      anomalies,
      ledgerCommencementDate,
      completenessNotice,
    };
  }

  // ----------------------------------------------------------------------------
  // 8. LIVE DASHBOARD SUMMARY
  // ----------------------------------------------------------------------------
  async getDashboardSummary(
    ctx: SecurityContext,
    requestedBranchId?: string | null,
    options?: { referenceDate?: Date }
  ): Promise<DashboardData> {
    const tenantId = ctx.tenantId;
    const targetBranchId = this.resolveTargetBranchId(ctx, requestedBranchId);
    const branchName = await this.resolveBranchName(tenantId, targetBranchId);

    const mtdRange = getIstDateRange({
      date: options?.referenceDate ?? new Date(),
      type: 'MTD',
    });

    const branchFilter = targetBranchId
      ? { branchId: targetBranchId }
      : { branchId: { in: Array.from(ctx.allowedBranchIds) } };

    const mtdAgg = await this.db.invoice.aggregate({
      where: {
        organizationId: tenantId,
        ...branchFilter,
        status: 'COMPLETED',
        invoiceDate: {
          gte: mtdRange.startDate,
          lte: mtdRange.endDate,
        },
      },
      _sum: {
        grandTotal: true,
      },
      _count: true,
    });

    const grossSalesMtd = mtdAgg._sum.grandTotal
      ? new Decimal(mtdAgg._sum.grandTotal).toFixed(2)
      : '0.00';
    const invoicesCountMtd = mtdAgg._count || 0;

    const outstandingAgg = await this.db.invoice.aggregate({
      where: {
        organizationId: tenantId,
        ...branchFilter,
        status: 'COMPLETED',
        balanceAmount: { gt: 0 },
      },
      _sum: {
        balanceAmount: true,
      },
      _count: true,
    });

    const outstandingDues = outstandingAgg._sum.balanceAmount
      ? new Decimal(outstandingAgg._sum.balanceAmount).toFixed(2)
      : '0.00';
    const pendingInvoicesCount = outstandingAgg._count || 0;

    const customerWhere = targetBranchId
      ? {
          organizationId: tenantId,
          isActive: true,
          OR: [
            { primaryBranchId: targetBranchId },
            { primaryBranchId: null },
          ],
        }
      : {
          organizationId: tenantId,
          isActive: true,
          OR: [
            { primaryBranchId: { in: Array.from(ctx.allowedBranchIds) } },
            { primaryBranchId: null },
          ],
        };

    const registeredCustomersCount = await this.db.customer.count({
      where: customerWhere,
    });

    const ornamentAgg = await this.db.ornament.aggregate({
      where: {
        organizationId: tenantId,
        ...branchFilter,
        status: 'AVAILABLE',
      },
      _count: true,
      _sum: {
        netWeight: true,
      },
    });

    const activeOrnamentsCount = ornamentAgg._count || 0;
    const activeNetWeightGrams = ornamentAgg._sum.netWeight
      ? new Decimal(ornamentAgg._sum.netWeight).toFixed(3)
      : '0.000';

    const designsGroup = await this.db.ornament.groupBy({
      by: ['productId'],
      where: {
        organizationId: tenantId,
        ...branchFilter,
        status: 'AVAILABLE',
      },
    });
    const activeDesignsCount = designsGroup.length;

    const recentInvoices = await this.db.invoice.findMany({
      where: {
        organizationId: tenantId,
        ...branchFilter,
        status: 'COMPLETED',
      },
      orderBy: {
        invoiceDate: 'desc',
      },
      take: 5,
      include: {
        payments: {
          select: {
            paymentMethod: true,
            amount: true,
          },
        },
      },
    });

    const recentTransactions: DashboardTransactionItem[] = recentInvoices.map((inv) => {
      const paymentMethods = Array.from(
        new Set(inv.payments.map((p) => p.paymentMethod))
      );
      if (paymentMethods.length === 0) {
        paymentMethods.push(inv.paymentStatus === 'PAID' ? 'CASH' : 'PENDING');
      }

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName?.trim() || 'Walk-in Customer',
        date: formatIstDate(inv.invoiceDate),
        totalAmount: new Decimal(inv.grandTotal).toFixed(2),
        paymentStatus: inv.paymentStatus,
        paymentMethods,
      };
    });

    const lowStockGroups = await this.db.ornament.groupBy({
      by: ['productId'],
      where: {
        organizationId: tenantId,
        ...branchFilter,
        status: 'AVAILABLE',
      },
      _count: {
        id: true,
      },
      _sum: {
        netWeight: true,
      },
      having: {
        id: {
          _count: {
            lte: 4,
          },
        },
      },
      orderBy: {
        _count: {
          id: 'asc',
        },
      },
      take: 5,
    });

    let lowStockItems: DashboardLowStockItem[] = [];
    if (lowStockGroups.length > 0) {
      const productIds = lowStockGroups.map((g) => g.productId);
      const products = await this.db.product.findMany({
        where: {
          organizationId: tenantId,
          id: { in: productIds },
        },
        select: {
          id: true,
          name: true,
          sku: true,
          category: true,
          purity: true,
        },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      lowStockItems = lowStockGroups.map((g) => {
        const prod = productMap.get(g.productId);
        return {
          id: g.productId,
          name: prod?.name ?? 'Fine Jewellery Item',
          sku: prod?.sku ?? 'SKU-PENDING',
          category: prod?.category ?? 'Jewellery',
          purity: prod?.purity ?? '22K',
          stock: g._count.id,
          netWeight: Number(g._sum.netWeight ?? 0),
        };
      });
    }

    return {
      kpis: {
        grossSalesMtd,
        invoicesCountMtd,
        outstandingDues,
        pendingInvoicesCount,
        registeredCustomersCount,
        activeOrnamentsCount,
        activeDesignsCount,
        activeNetWeightGrams,
        branchName,
        branchId: targetBranchId,
      },
      recentTransactions,
      lowStockItems,
    };
  }
}

export const reportsService = new ReportsService();
