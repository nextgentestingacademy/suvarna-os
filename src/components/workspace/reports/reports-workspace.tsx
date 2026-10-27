'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  DatePreset,
  SalesSummaryReport,
  PaymentCollectionsReport,
  GstSummaryReport,
  InventoryValuationReport,
  TrialBalanceReport,
  ProfitAndLossReport,
  BalanceSheetReport,
} from '@/lib/reports';
import {
  getSalesSummaryAction,
  getPaymentCollectionsAction,
  getGstSummaryAction,
  getInventoryValuationAction,
  getTrialBalanceAction,
  getProfitAndLossAction,
  getBalanceSheetAction,
} from '@/app/actions/reports';
import { SalesSummaryView } from './sales-summary-view';
import { PaymentCollectionsView } from './payment-collections-view';
import { GstSummaryView } from './gst-summary-view';
import { InventoryValuationView } from './inventory-valuation-view';
import { TrialBalanceView } from './trial-balance-view';
import { ProfitAndLossView } from './profit-and-loss-view';
import { BalanceSheetView } from './balance-sheet-view';
import {
  BarChart3,
  CreditCard,
  FileSpreadsheet,
  PackageCheck,
  Scale,
  TrendingUp,
  Landmark,
  Calendar,
  Building2,
  RefreshCw,
  Download,
  Printer,
  AlertTriangle,
} from 'lucide-react';

export interface ReportsWorkspaceProps {
  permittedBranches?: readonly { id: string; name: string; code: string; isMain?: boolean }[];
  initialBranchId?: string;
  userRole?: string;
}

type ReportTab =
  | 'sales'
  | 'payments'
  | 'gst'
  | 'inventory'
  | 'trial-balance'
  | 'profit-and-loss'
  | 'balance-sheet';

export function ReportsWorkspace({
  permittedBranches = [],
  initialBranchId,
  userRole,
}: ReportsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(initialBranchId || 'ALL');

  const [salesReport, setSalesReport] = useState<SalesSummaryReport | null>(null);
  const [paymentsReport, setPaymentsReport] = useState<PaymentCollectionsReport | null>(null);
  const [gstReport, setGstReport] = useState<GstSummaryReport | null>(null);
  const [inventoryReport, setInventoryReport] = useState<InventoryValuationReport | null>(null);
  const [trialBalanceReport, setTrialBalanceReport] = useState<TrialBalanceReport | null>(null);
  const [profitAndLossReport, setProfitAndLossReport] = useState<ProfitAndLossReport | null>(null);
  const [balanceSheetReport, setBalanceSheetReport] = useState<BalanceSheetReport | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadActiveReport = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const baseFilter = {
      datePreset,
      from: datePreset === 'CUSTOM' ? customFrom : undefined,
      to: datePreset === 'CUSTOM' ? customTo : undefined,
      branchId: selectedBranchId === 'ALL' ? undefined : selectedBranchId,
    };

    try {
      if (activeTab === 'sales') {
        const res = await getSalesSummaryAction(baseFilter);
        if (res.success && res.data) {
          setSalesReport(res.data);
        } else {
          setErrorMessage(res.error || 'Failed to load Sales Summary Report.');
        }
      } else if (activeTab === 'payments') {
        const res = await getPaymentCollectionsAction(baseFilter);
        if (res.success && res.data) {
          setPaymentsReport(res.data);
        } else {
          setErrorMessage(res.error || 'Failed to load Payment Collections Report.');
        }
      } else if (activeTab === 'gst') {
        const res = await getGstSummaryAction(baseFilter);
        if (res.success && res.data) {
          setGstReport(res.data);
        } else {
          setErrorMessage(res.error || 'Failed to load GST Outward Summary.');
        }
      } else if (activeTab === 'inventory') {
        const res = await getInventoryValuationAction({
          branchId: selectedBranchId === 'ALL' ? undefined : selectedBranchId,
        });
        if (res.success && res.data) {
          setInventoryReport(res.data);
        } else {
          setErrorMessage(res.error || 'Failed to load Inventory Valuation Report.');
        }
      } else if (activeTab === 'trial-balance') {
        const res = await getTrialBalanceAction(baseFilter);
        if (res.success && res.data) {
          setTrialBalanceReport(res.data);
        } else {
          setErrorMessage(res.error || 'Failed to load Trial Balance Report.');
        }
      } else if (activeTab === 'profit-and-loss') {
        const res = await getProfitAndLossAction(baseFilter);
        if (res.success && res.data) {
          setProfitAndLossReport(res.data);
        } else {
          setErrorMessage(res.error || 'Failed to load Profit & Loss Statement.');
        }
      } else if (activeTab === 'balance-sheet') {
        const res = await getBalanceSheetAction(baseFilter);
        if (res.success && res.data) {
          setBalanceSheetReport(res.data);
        } else {
          setErrorMessage(res.error || 'Failed to load Balance Sheet.');
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected error fetching report.');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, datePreset, customFrom, customTo, selectedBranchId]);

  useEffect(() => {
    loadActiveReport();
  }, [loadActiveReport]);

  // Client CSV Export
  const handleExportCsv = () => {
    const escapeCsv = (val: string | number) => {
      let s = String(val ?? '');
      if (/^[=\+\-@\t\r]/.test(s)) {
        s = `'${s}`;
      }
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    let csvLines: string[] = [];
    const filename = `suvarna-${activeTab}-report`;

    if (activeTab === 'sales' && salesReport) {
      csvLines = [
        `# Suvarna Jewelry ERP - Sales Summary Report`,
        `# Generated: ${new Date().toISOString()}`,
        `# Branch: ${salesReport.filters.branchName}`,
        `# Period: ${salesReport.filters.datePreset} (${salesReport.filters.startDate} to ${salesReport.filters.endDate})`,
        ``,
        `[REPORT TOTALS]`,
        ['Metric', 'Value'].map(escapeCsv).join(','),
        ['Total Invoices', salesReport.totals.invoiceCount].map(escapeCsv).join(','),
        ['Gross Turnover (INR)', salesReport.totals.grossSales].map(escapeCsv).join(','),
        ['Taxable Turnover (INR)', salesReport.totals.taxableAmount].map(escapeCsv).join(','),
        ['Total GST (INR)', salesReport.totals.totalTax].map(escapeCsv).join(','),
        ['Total Paid (INR)', salesReport.totals.paidAmount].map(escapeCsv).join(','),
        ['Outstanding Balance (INR)', salesReport.totals.balanceAmount].map(escapeCsv).join(','),
        ['Metal Value (INR)', salesReport.totals.metalValue].map(escapeCsv).join(','),
        ['Making Charges (INR)', salesReport.totals.makingCharges].map(escapeCsv).join(','),
        ['Stone Charges (INR)', salesReport.totals.stoneCharges].map(escapeCsv).join(','),
        ``,
        `[CATEGORY BREAKDOWN]`,
        ['Category', 'Items Sold', 'Net Weight (g)', 'Metal Value (INR)', 'Making Charges (INR)', 'Taxable Turnover (INR)', 'Gross Total (INR)'].map(escapeCsv).join(','),
        ...salesReport.categoryBreakdown.map((c) =>
          [c.category, c.itemCount, c.netWeightGrams, c.metalValue, c.makingCharges, c.taxableAmount, c.totalAmount].map(escapeCsv).join(',')
        ),
        ``,
        `[DAY-END SALES REGISTER]`,
        ['Date', 'Invoices Count', 'Taxable Value (INR)', 'Total GST (INR)', 'Gross Invoiced (INR)'].map(escapeCsv).join(','),
        ...salesReport.dailyTrend.map((d) =>
          [d.date, d.invoiceCount, d.taxableAmount, d.taxAmount, d.grossSales].map(escapeCsv).join(',')
        ),
      ];
    } else if (activeTab === 'payments' && paymentsReport) {
      csvLines = [
        `# Suvarna Jewelry ERP - Payment Collections & Bank Settlement Realization Report`,
        `# Generated: ${new Date().toISOString()}`,
        `# Branch: ${paymentsReport.filters.branchName}`,
        `# Period: ${paymentsReport.filters.datePreset} (${paymentsReport.filters.startDate} to ${paymentsReport.filters.endDate})`,
        `# Note: Cumulative Outstanding Receivables is an all-time balance. The period filter applies to collections during the date range.`,
        ``,
        `[COLLECTIONS SUMMARY]`,
        ['Metric', 'Value'].map(escapeCsv).join(','),
        ['Total Collected (INR)', paymentsReport.totals.totalCollected].map(escapeCsv).join(','),
        ['Payment Transactions Count', paymentsReport.totals.paymentCount].map(escapeCsv).join(','),
        ['Cash Collected (INR)', paymentsReport.totals.cashCollected].map(escapeCsv).join(','),
        ['Digital Collections (INR)', paymentsReport.totals.digitalCollected].map(escapeCsv).join(','),
        ['Settled to Bank (Net) (INR)', paymentsReport.settlementTotals.totalSettledNet].map(escapeCsv).join(','),
        ['Settlement Processing Fees (INR)', paymentsReport.settlementTotals.totalSettlementFees].map(escapeCsv).join(','),
        ['Gross Bank Settled (INR)', paymentsReport.settlementTotals.totalSettledGross].map(escapeCsv).join(','),
        ['Settled Bank Lines Count', paymentsReport.settlementTotals.settledLinesCount].map(escapeCsv).join(','),
        ['Cumulative Outstanding Receivables (All Time) (INR)', paymentsReport.totals.outstandingReceivables].map(escapeCsv).join(','),
        ``,
        `[CUSTOMER PAYMENT COLLECTIONS REGISTER]`,
        ['Payment Date', 'Method', 'Reference', 'Invoice Number', 'Customer', 'Branch', 'Amount (INR)'].map(escapeCsv).join(','),
        ...paymentsReport.collections.map((p) =>
          [p.paymentDate, p.paymentMethod, p.transactionRef || '-', p.invoiceNumber, p.customerName, p.branchName, p.amount].map(escapeCsv).join(',')
        ),
        ``,
        `[BANK SETTLEMENT REALIZATION REGISTER]`,
        ['Settlement Date', 'Bank Name', 'Account Number', 'Reference', 'Net Deposited (INR)', 'Processing Fee (INR)', 'Gross Amount (INR)', 'Settlement Journal'].map(escapeCsv).join(','),
        ...paymentsReport.settlements.map((s) =>
          [s.transactionDate, s.bankName, s.accountNumber, s.referenceNumber || '-', s.depositAmount, s.feeAmount, s.grossAmount, s.settlementJournalNumber || '-'].map(escapeCsv).join(',')
        ),
      ];
    } else if (activeTab === 'gst' && gstReport) {
      csvLines = [
        `# Suvarna Jewelry ERP - GST Outward Tax Summary`,
        `# Generated: ${new Date().toISOString()}`,
        `# Branch: ${gstReport.filters.branchName}`,
        `# Period: ${gstReport.filters.datePreset} (${gstReport.filters.startDate} to ${gstReport.filters.endDate})`,
        `# STATUTORY NOTICE: Operational summary for internal reference only. NOT an official or filing-ready GSTR-1 or GSTR-3B return.`,
        `# STATUTORY NOTICE: Recipient GSTINs and item-level HSN classifications are not captured/validated. All sales are reported under standard precious jewelry assumptions (HSN 7113, GST 3%).`,
        `# STATUTORY NOTICE: Must be independently verified by a qualified tax professional before statutory return filing.`,
        ``,
        `[GST SUMMARY TOTALS]`,
        ['Metric', 'Value'].map(escapeCsv).join(','),
        ['Total Invoices', gstReport.totals.totalInvoices].map(escapeCsv).join(','),
        ['Intra-State Invoices (B2C Local)', gstReport.totals.intraStateCount].map(escapeCsv).join(','),
        ['Inter-State Invoices (B2C Interstate)', gstReport.totals.interStateCount].map(escapeCsv).join(','),
        ['Total Taxable Value (INR)', gstReport.totals.totalTaxableAmount].map(escapeCsv).join(','),
        ['Total CGST (INR)', gstReport.totals.totalCgstAmount].map(escapeCsv).join(','),
        ['Total SGST (INR)', gstReport.totals.totalSgstAmount].map(escapeCsv).join(','),
        ['Total IGST (INR)', gstReport.totals.totalIgstAmount].map(escapeCsv).join(','),
        ['Total Tax Liability (INR)', gstReport.totals.totalTaxLiability].map(escapeCsv).join(','),
        ['Total Gross Invoice Value (INR)', gstReport.totals.totalInvoiceValue].map(escapeCsv).join(','),
        ``,
        `[TAX RATE SCHEDULE (HSN 7113)]`,
        ['HSN Code', 'Description', 'GST Rate', 'Taxable Value (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Total Tax (INR)'].map(escapeCsv).join(','),
        ...gstReport.rateSchedules.map((r) =>
          [r.hsnCode, r.description, r.ratePercent, r.taxableAmount, r.cgstAmount, r.sgstAmount, r.igstAmount, r.totalTax].map(escapeCsv).join(',')
        ),
        ``,
        `[DAY-END TAX SCHEDULE]`,
        ['Date', 'Invoices Count', 'Taxable Value (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Total Tax (INR)', 'Gross Invoice Value (INR)'].map(escapeCsv).join(','),
        ...gstReport.dailySchedule.map((d) =>
          [d.date, d.invoiceCount, d.taxableAmount, d.cgstAmount, d.sgstAmount, d.igstAmount, d.totalTax, d.grossInvoiceValue].map(escapeCsv).join(',')
        ),
        ``,
        `[INVOICE-LEVEL TAX REGISTER]`,
        ['Invoice Number', 'Date', 'Customer', 'Place of Supply', 'Taxable Value (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Total Tax (INR)', 'Grand Total (INR)'].map(escapeCsv).join(','),
        ...gstReport.invoices.map((inv) =>
          [inv.invoiceNumber, inv.invoiceDate, inv.customerName, inv.placeOfSupply, inv.taxableAmount, inv.cgstAmount, inv.sgstAmount, inv.igstAmount, inv.totalTax, inv.grandTotal].map(escapeCsv).join(',')
        ),
      ];
    } else if (activeTab === 'inventory' && inventoryReport) {
      csvLines = [
        `# Suvarna Jewelry ERP - Inventory Valuation Report`,
        `# Generated: ${new Date().toISOString()}`,
        `# Branch: ${inventoryReport.filters.branchName}`,
        `# DISCLOSURE: Cost is recorded as Not Recorded / 0.00 for historic items. Indicative valuation is mark-to-market using current benchmark bullion rates and is non-statutory.`,
        ``,
        `[VALUATION SUMMARY]`,
        ['Metric', 'Value'].map(escapeCsv).join(','),
        ['Total Ornaments', inventoryReport.totals.totalOrnaments].map(escapeCsv).join(','),
        ['Total Gross Weight (g)', inventoryReport.totals.totalGrossWeightGrams].map(escapeCsv).join(','),
        ['Total Stone Weight (g)', inventoryReport.totals.totalStoneWeightGrams].map(escapeCsv).join(','),
        ['Total Net Metal Weight (g)', inventoryReport.totals.totalNetWeightGrams].map(escapeCsv).join(','),
        ['Total Recorded Cost', inventoryReport.totals.totalRecordedCost].map(escapeCsv).join(','),
        ['Items with Recorded Cost', inventoryReport.totals.recordedCostItemsCount].map(escapeCsv).join(','),
        ['Total Indicative Bullion Estimate (INR)', inventoryReport.totals.totalIndicativeEstimate].map(escapeCsv).join(','),
        ['Unvalued Items (Unsupported Metal/Purity)', inventoryReport.totals.unvaluedItemsCount].map(escapeCsv).join(','),
        ``,
        `[CATEGORY STOCK SUMMARY]`,
        ['Category', 'Ornament Count', 'Gross Weight (g)', 'Net Metal Weight (g)', 'Indicative Valuation (INR)'].map(escapeCsv).join(','),
        ...inventoryReport.categoryBreakdown.map((c) =>
          [c.category, c.ornamentCount, c.grossWeightGrams, c.netWeightGrams, c.indicativeValuation].map(escapeCsv).join(',')
        ),
        ``,
        `[AVAILABLE PHYSICAL ORNAMENTS REGISTER]`,
        ['Tag Code', 'HUID', 'Design Name', 'Category', 'Purity', 'Gross Weight (g)', 'Net Weight (g)', 'Recorded Cost', 'Indicative Price (Est.)'].map(escapeCsv).join(','),
        ...inventoryReport.items.map((i) =>
          [i.tagCode, i.huid || '-', i.productName, i.category, i.purity, i.grossWeight, i.netWeight, i.costAmount, i.indicativePrice].map(escapeCsv).join(',')
        ),
      ];
    } else if (activeTab === 'trial-balance' && trialBalanceReport) {
      csvLines = [
        `# Suvarna Jewelry ERP - General Ledger Trial Balance`,
        `# Generated: ${new Date().toISOString()}`,
        `# Branch: ${trialBalanceReport.filters.branchName}`,
        `# Period: ${trialBalanceReport.filters.datePreset} (${trialBalanceReport.filters.startDate} to ${trialBalanceReport.filters.endDate})`,
        `# As Of Date: ${trialBalanceReport.filters.asOfDate}`,
        `# Fiscal Year: ${trialBalanceReport.filters.fiscalYear}`,
        `# Mathematical Equilibrium: ${trialBalanceReport.totals.isBalanced ? 'EQUILIBRIUM' : 'DISCREPANCY'}`,
        `# Financial Completeness: ${trialBalanceReport.totals.completenessStatus ?? 'INCOMPLETE_DATA'}`,
        `# Statutory Reliance: ${trialBalanceReport.totals.isSuitableForReliance ? 'SUITABLE' : 'NOT SUITABLE (INCOMPLETE HISTORICAL DATA)'}`,
        `# Notice: Reflects posted double-entry journal vouchers up to as-of date. Historical unposted invoices are not included.`,
        ``,
        `[TRIAL BALANCE SUMMARY]`,
        ['Metric', 'Value'].map(escapeCsv).join(','),
        ['Total Debit Balances (INR)', trialBalanceReport.totals.totalDebitBalance].map(escapeCsv).join(','),
        ['Total Credit Balances (INR)', trialBalanceReport.totals.totalCreditBalance].map(escapeCsv).join(','),
        ['Net Difference (INR)', trialBalanceReport.totals.difference].map(escapeCsv).join(','),
        ['Is Balanced', trialBalanceReport.totals.isBalanced ? 'YES' : 'NO'].map(escapeCsv).join(','),
        ['Is Suitable for Reliance', trialBalanceReport.totals.isSuitableForReliance ? 'YES' : 'NO'].map(escapeCsv).join(','),
        ['Completeness Status', trialBalanceReport.totals.completenessStatus ?? 'INCOMPLETE_DATA'].map(escapeCsv).join(','),
        ['Total Period Debits (INR)', trialBalanceReport.totals.totalPeriodDebit].map(escapeCsv).join(','),
        ['Total Period Credits (INR)', trialBalanceReport.totals.totalPeriodCredit].map(escapeCsv).join(','),
        ['Active Accounts Count', trialBalanceReport.totals.activeAccountsCount].map(escapeCsv).join(','),
        ``,
        ...(trialBalanceReport.anomalies && trialBalanceReport.anomalies.length > 0 ? [
          `[INTEGRITY ANOMALIES & AUDIT RECONCILIATION]`,
          ['Anomaly Type', 'Account Code', 'Account Name', 'Amount (INR)', 'Severity', 'Explanation', 'Reconciliation Action'].map(escapeCsv).join(','),
          ...trialBalanceReport.anomalies.map((a) =>
            [a.type, a.accountCode ?? 'N/A', a.accountName ?? 'N/A', a.amount, a.severity, a.explanation, a.reconciliationAction].map(escapeCsv).join(',')
          ),
          ``,
        ] : []),
        `[GENERAL LEDGER ACCOUNT BALANCES REGISTER]`,
        ['Code', 'Account Name', 'Classification', 'Normal Balance', 'Period Debit (INR)', 'Period Credit (INR)', 'Debit Closing Balance (INR)', 'Credit Closing Balance (INR)'].map(escapeCsv).join(','),
        ...trialBalanceReport.accounts.map((a) =>
          [a.code, a.name, a.classification, a.normalBalance, a.periodDebit, a.periodCredit, a.debitBalance, a.creditBalance].map(escapeCsv).join(',')
        ),
      ];
    } else if (activeTab === 'profit-and-loss' && profitAndLossReport) {
      csvLines = [
        `# Suvarna Jewelry ERP - Statement of Profit and Loss (Income Statement)`,
        `# Generated: ${new Date().toISOString()}`,
        `# Branch: ${profitAndLossReport.filters.branchName}`,
        `# Period: ${profitAndLossReport.filters.datePreset} (${profitAndLossReport.filters.startDate} to ${profitAndLossReport.filters.endDate})`,
        `# Fiscal Year: ${profitAndLossReport.filters.fiscalYear}`,
        `# Financial Completeness: ${profitAndLossReport.summary?.completenessStatus ?? 'INCOMPLETE_DATA'}`,
        `# Statutory Reliance: ${profitAndLossReport.summary?.isSuitableForReliance ? 'SUITABLE' : 'NOT SUITABLE (INCOMPLETE COGS DATA)'}`,
        `# NOTICE: COGS and wholesale ornament acquisition costs are not currently posted to the general ledger. Results reflect recorded vouchers only.`,
        ``,
        `[PROFIT AND LOSS SUMMARY]`,
        ['Metric', 'Value'].map(escapeCsv).join(','),
        ['Total Gross Revenue (INR)', profitAndLossReport.operatingRevenue.totalGrossRevenue].map(escapeCsv).join(','),
        ['Total Contra-Revenue & Discounts (INR)', profitAndLossReport.operatingRevenue.totalContraRevenue].map(escapeCsv).join(','),
        ['Net Operating Revenue (INR)', profitAndLossReport.operatingRevenue.totalNetRevenue].map(escapeCsv).join(','),
        ['Cost of Goods Sold (COGS) (INR)', profitAndLossReport.costOfGoodsSold.totalCogs].map(escapeCsv).join(','),
        ['Gross Profit (INR)', profitAndLossReport.grossProfit.amount].map(escapeCsv).join(','),
        ['Gross Profit Margin', profitAndLossReport.grossProfit.percentage].map(escapeCsv).join(','),
        ['Total Operating Expenses (INR)', profitAndLossReport.operatingExpenses.totalOperatingExpenses].map(escapeCsv).join(','),
        ['Net Operating Result (INR)', profitAndLossReport.netProfitOrLoss.amount].map(escapeCsv).join(','),
        ['Result Classification', profitAndLossReport.netProfitOrLoss.isProfit ? 'PROFIT' : 'LOSS'].map(escapeCsv).join(','),
        ['Is Suitable for Reliance', profitAndLossReport.summary?.isSuitableForReliance ? 'YES' : 'NO'].map(escapeCsv).join(','),
        ['Completeness Status', profitAndLossReport.summary?.completenessStatus ?? 'INCOMPLETE_DATA'].map(escapeCsv).join(','),
        ``,
        ...(profitAndLossReport.anomalies && profitAndLossReport.anomalies.length > 0 ? [
          `[INTEGRITY ANOMALIES & AUDIT RECONCILIATION]`,
          ['Anomaly Type', 'Account Code', 'Account Name', 'Amount (INR)', 'Severity', 'Explanation', 'Reconciliation Action'].map(escapeCsv).join(','),
          ...profitAndLossReport.anomalies.map((a) =>
            [a.type, a.accountCode ?? 'N/A', a.accountName ?? 'N/A', a.amount, a.severity, a.explanation, a.reconciliationAction].map(escapeCsv).join(',')
          ),
          ``,
        ] : []),
        `[OPERATING REVENUE REGISTER]`,
        ['Code', 'Account Name', 'Amount (INR)'].map(escapeCsv).join(','),
        ...profitAndLossReport.operatingRevenue.items.map((i) => [i.code, i.name, i.amount].map(escapeCsv).join(',')),
        ``,
        `[CONTRA-REVENUE & DEDUCTIONS REGISTER]`,
        ['Code', 'Account Name', 'Amount (INR)'].map(escapeCsv).join(','),
        ...profitAndLossReport.operatingRevenue.contraItems.map((c) => [c.code, c.name, c.amount].map(escapeCsv).join(',')),
        ``,
        `[COST OF GOODS SOLD REGISTER]`,
        ['Code', 'Account Name', 'Amount (INR)'].map(escapeCsv).join(','),
        ...profitAndLossReport.costOfGoodsSold.items.map((c) => [c.code, c.name, c.amount].map(escapeCsv).join(',')),
        ``,
        `[OPERATING EXPENSES REGISTER]`,
        ['Code', 'Account Name', 'Amount (INR)'].map(escapeCsv).join(','),
        ...profitAndLossReport.operatingExpenses.items.map((e) => [e.code, e.name, e.amount].map(escapeCsv).join(',')),
      ];
    } else if (activeTab === 'balance-sheet' && balanceSheetReport) {
      csvLines = [
        `# Suvarna Jewelry ERP - Balance Sheet (Financial Position)`,
        `# Generated: ${new Date().toISOString()}`,
        `# Branch: ${balanceSheetReport.filters.branchName}`,
        `# As Of Date: ${balanceSheetReport.filters.asOfDate}`,
        `# Period: ${balanceSheetReport.filters.datePreset} (${balanceSheetReport.filters.startDate} to ${balanceSheetReport.filters.endDate})`,
        `# Fiscal Year: ${balanceSheetReport.filters.fiscalYear}`,
        `# Mathematical Equilibrium: ${balanceSheetReport.summary.isBalanced ? 'EQUILIBRIUM' : 'DISCREPANCY'}`,
        `# Financial Completeness: ${balanceSheetReport.summary.completenessStatus}`,
        `# Statutory Reliance: ${balanceSheetReport.summary.isSuitableForReliance ? 'SUITABLE' : 'NOT SUITABLE (INCOMPLETE HISTORICAL DATA)'}`,
        `# NOTICE: Reflects cumulative ledger vouchers. Unrecorded historical opening equity or wholesale inventory baselines are excluded.`,
        ``,
        `[BALANCE SHEET EQUILIBRIUM SUMMARY]`,
        ['Metric', 'Value'].map(escapeCsv).join(','),
        ['Total Assets (INR)', balanceSheetReport.summary.totalAssets].map(escapeCsv).join(','),
        ['Total Liabilities (INR)', balanceSheetReport.liabilities.totalLiabilities].map(escapeCsv).join(','),
        ['Total Recorded Equity (INR)', balanceSheetReport.equity.totalRecordedEquity].map(escapeCsv).join(','),
        ['Current Period Retained Earnings (INR)', balanceSheetReport.equity.currentPeriodRetainedEarnings].map(escapeCsv).join(','),
        ['Total Equity (INR)', balanceSheetReport.equity.totalEquity].map(escapeCsv).join(','),
        ['Total Liabilities & Equity (INR)', balanceSheetReport.summary.totalLiabilitiesAndEquity].map(escapeCsv).join(','),
        ['Discrepancy (INR)', balanceSheetReport.summary.discrepancy].map(escapeCsv).join(','),
        ['Is Balanced (Equilibrium)', balanceSheetReport.summary.isBalanced ? 'YES' : 'NO'].map(escapeCsv).join(','),
        ['Is Complete (Historical Coverage)', balanceSheetReport.summary.isComplete ? 'YES' : 'NO'].map(escapeCsv).join(','),
        ['Is Suitable for Statutory Reliance', balanceSheetReport.summary.isSuitableForReliance ? 'YES' : 'NO'].map(escapeCsv).join(','),
        ['Completeness Status', balanceSheetReport.summary.completenessStatus].map(escapeCsv).join(','),
        ``,
        ...(balanceSheetReport.anomalies && balanceSheetReport.anomalies.length > 0 ? [
          `[INTEGRITY ANOMALIES & AUDIT RECONCILIATION]`,
          ['Anomaly Type', 'Account Code', 'Account Name', 'Amount (INR)', 'Severity', 'Explanation', 'Reconciliation Action'].map(escapeCsv).join(','),
          ...balanceSheetReport.anomalies.map((a) =>
            [a.type, a.accountCode ?? 'N/A', a.accountName ?? 'N/A', a.amount, a.severity, a.explanation, a.reconciliationAction].map(escapeCsv).join(',')
          ),
          ``,
        ] : []),
        `[ASSETS REGISTER]`,
        ['Code', 'Account Name', 'Amount (INR)'].map(escapeCsv).join(','),
        ...balanceSheetReport.assets.currentAssets.map((a) => [a.code, a.name, a.amount].map(escapeCsv).join(',')),
        ``,
        `[LIABILITIES REGISTER]`,
        ['Code', 'Account Name', 'Amount (INR)'].map(escapeCsv).join(','),
        ...balanceSheetReport.liabilities.currentLiabilities.map((l) => [l.code, l.name, l.amount].map(escapeCsv).join(',')),
        ``,
        `[EQUITY REGISTER]`,
        ['Code', 'Account Name', 'Amount (INR)'].map(escapeCsv).join(','),
        ...balanceSheetReport.equity.recordedEquity.map((e) => [e.code, e.name, e.amount].map(escapeCsv).join(',')),
      ];
    }

    if (csvLines.length === 0) return;

    const csvContent = csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-serif font-bold text-[#d49a24] uppercase tracking-widest">
              Financial Intelligence & Showroom Registers
            </span>
            <span className="px-2 py-0.5 bg-[#e2f6e8] border border-[#a3e3b5] text-[#246743] rounded text-[10px] font-bold">
              LIVE REGISTERS
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-serif font-bold text-[#542047]">
            Operational Reports Workspace
          </h1>
          <p className="text-xs text-[#68647a]">
            Auditable sales summaries, payment channel registers, GST day-books, and stock valuations.
          </p>
        </div>

        {/* Global Toolbar: Date Preset, Branch Selector, Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Showroom Branch Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-[#eee2dc] rounded-xl px-3 py-1.5 shadow-xs text-xs">
            <Building2 className="w-3.5 h-3.5 text-[#d49a24]" />
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="bg-transparent text-[#542047] font-semibold focus:outline-none cursor-pointer"
              aria-label="Filter by Showroom Branch"
            >
              <option value="ALL">All Permitted Showrooms</option>
              {permittedBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Preset Selector (Hidden for Inventory Valuation which is snapshot-based) */}
          {activeTab !== 'inventory' && (
            <div className="flex items-center gap-1.5 bg-white border border-[#eee2dc] rounded-xl px-3 py-1.5 shadow-xs text-xs">
              <Calendar className="w-3.5 h-3.5 text-[#d49a24]" />
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                className="bg-transparent text-[#542047] font-semibold focus:outline-none cursor-pointer"
                aria-label="Select Date Range Preset"
              >
                <option value="TODAY">Today</option>
                <option value="THIS_WEEK">This Week</option>
                <option value="THIS_MONTH">This Month (MTD)</option>
                <option value="FY_2026_27">FY 2026–27</option>
                <option value="CUSTOM">Custom Date Window</option>
              </select>
            </div>
          )}

          {/* Custom Date Pickers */}
          {activeTab !== 'inventory' && datePreset === 'CUSTOM' && (
            <div className="flex items-center gap-1 text-xs bg-white border border-[#eee2dc] rounded-xl px-2 py-1 shadow-xs">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-[11px] text-[#542047] border border-[#eee2dc] rounded p-1 focus:outline-none"
                placeholder="From Date"
              />
              <span className="text-[#68647a]">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-[11px] text-[#542047] border border-[#eee2dc] rounded p-1 focus:outline-none"
                placeholder="To Date"
              />
            </div>
          )}

          {/* Action Buttons */}
          <button
            onClick={loadActiveReport}
            disabled={isLoading}
            className="p-2 bg-white border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-semibold flex items-center gap-1 transition shadow-xs disabled:opacity-50"
            title="Refresh report"
            aria-label="Refresh report data"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#d49a24] ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleExportCsv}
            disabled={isLoading}
            className="px-3 py-2 bg-white border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
            title="Download report data as CSV spreadsheet"
          >
            <Download className="w-3.5 h-3.5 text-[#246743]" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="px-3 py-2 bg-white border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
            title="Print report document"
          >
            <Printer className="w-3.5 h-3.5 text-[#542047]" />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 bg-[#fff1f2] border border-[#fecdd3] rounded-2xl flex items-center justify-between text-xs text-[#9f1239]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#e11d48]" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={loadActiveReport}
            className="px-2.5 py-1 bg-white border border-[#fecdd3] rounded-lg font-semibold hover:bg-[#ffe4e6] transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-[#eee2dc] pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('sales')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition whitespace-nowrap ${
            activeTab === 'sales'
              ? 'bg-[#542047] text-[#ffe8a8] shadow-sm'
              : 'text-[#68647a] hover:bg-[#fff0dc] hover:text-[#542047]'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Sales Summary</span>
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition whitespace-nowrap ${
            activeTab === 'payments'
              ? 'bg-[#542047] text-[#ffe8a8] shadow-sm'
              : 'text-[#68647a] hover:bg-[#fff0dc] hover:text-[#542047]'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Payment Collections</span>
        </button>

        <button
          onClick={() => setActiveTab('gst')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition whitespace-nowrap ${
            activeTab === 'gst'
              ? 'bg-[#542047] text-[#ffe8a8] shadow-sm'
              : 'text-[#68647a] hover:bg-[#fff0dc] hover:text-[#542047]'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>GST Outward Summary</span>
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'bg-[#542047] text-[#ffe8a8] shadow-sm'
              : 'text-[#68647a] hover:bg-[#fff0dc] hover:text-[#542047]'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          <span>Inventory Valuation</span>
        </button>

        <button
          onClick={() => setActiveTab('trial-balance')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition whitespace-nowrap ${
            activeTab === 'trial-balance'
              ? 'bg-[#542047] text-[#ffe8a8] shadow-sm'
              : 'text-[#68647a] hover:bg-[#fff0dc] hover:text-[#542047]'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Trial Balance</span>
        </button>

        <button
          onClick={() => setActiveTab('profit-and-loss')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition whitespace-nowrap ${
            activeTab === 'profit-and-loss'
              ? 'bg-[#542047] text-[#ffe8a8] shadow-sm'
              : 'text-[#68647a] hover:bg-[#fff0dc] hover:text-[#542047]'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Profit & Loss</span>
        </button>

        <button
          onClick={() => setActiveTab('balance-sheet')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition whitespace-nowrap ${
            activeTab === 'balance-sheet'
              ? 'bg-[#542047] text-[#ffe8a8] shadow-sm'
              : 'text-[#68647a] hover:bg-[#fff0dc] hover:text-[#542047]'
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>Balance Sheet</span>
        </button>
      </div>

      {/* Report View Rendering */}
      <div>
        {isLoading ? (
          <div className="bg-white border border-[#eee2dc] rounded-2xl p-12 text-center text-xs text-[#68647a] shadow-xs">
            <RefreshCw className="w-6 h-6 text-[#d49a24] animate-spin mx-auto mb-3" />
            <span className="font-semibold text-sm text-[#542047] block mb-1">
              Calculating Showroom Financial Analytics...
            </span>
            <p>Aggregating transactional records, line-item valuations, and statutory tax registers.</p>
          </div>
        ) : (
          <>
            {activeTab === 'sales' && salesReport && <SalesSummaryView report={salesReport} />}
            {activeTab === 'payments' && paymentsReport && (
              <PaymentCollectionsView report={paymentsReport} />
            )}
            {activeTab === 'gst' && gstReport && <GstSummaryView report={gstReport} />}
            {activeTab === 'inventory' && inventoryReport && (
              <InventoryValuationView report={inventoryReport} />
            )}
            {activeTab === 'trial-balance' && trialBalanceReport && (
              <TrialBalanceView report={trialBalanceReport} />
            )}
            {activeTab === 'profit-and-loss' && profitAndLossReport && (
              <ProfitAndLossView report={profitAndLossReport} />
            )}
            {activeTab === 'balance-sheet' && balanceSheetReport && (
              <BalanceSheetView report={balanceSheetReport} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
