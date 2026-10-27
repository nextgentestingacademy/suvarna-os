import React from 'react';
import { getServerSecurityContext } from '@/lib/security-context';
import { hasPermission } from '@/lib/rbac';
import { AccessDeniedModule } from '@/components/access-denied-module';
import { ReconciliationWorkspace } from '@/components/workspace/reconciliation/reconciliation-workspace';
import { BankAccountService } from '@/lib/bank-accounts';
import { BankStatementImporter } from '@/lib/reconciliation/importer';
import { ReconciliationMatcher } from '@/lib/reconciliation/matcher';
import { prisma } from '@/lib/db';
import { Decimal } from 'decimal.js';

export const dynamic = 'force-dynamic';

export default async function ReconciliationPage() {
  const ctx = await getServerSecurityContext();

  // Enforce server-side authorization check: restricted to OWNER or ACCOUNTANT roles with ACCOUNTS_VIEW
  if (!hasPermission(ctx.role, 'ACCOUNTS_VIEW') || (ctx.role !== 'OWNER' && ctx.role !== 'ACCOUNTANT')) {
    return (
      <AccessDeniedModule
        moduleName="Bank & Payment Reconciliation"
        requiredRole="Store Owner or Accountant"
        requiredPermission="ACCOUNTS_VIEW"
        currentRole={ctx.role}
        description="Your user role does not have authorization to access the bank statement feeds, matching engine, or settlement journals."
      />
    );
  }

  const bankAccountService = new BankAccountService({ prisma });
  const matcher = new ReconciliationMatcher({ prisma });
  const importer = new BankStatementImporter({ prisma });

  // Fetch initial master data and feeds
  const [branches, ledgerAccounts, rawAccounts, rawSummary, rawLinesData, rawImports] = await Promise.all([
    prisma.branch.findMany({
      where: { organizationId: ctx.tenantId },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    prisma.ledgerAccount.findMany({
      where: {
        organizationId: ctx.tenantId,
        classification: 'ASSET',
        isActive: true,
      },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    bankAccountService.listBankAccounts(ctx, { includeInactive: true }),
    matcher.getReconciliationSummary(ctx),
    matcher.getStatementLines(ctx, {
      limit: 50,
      status: ['UNMATCHED', 'PARTIALLY_MATCHED', 'MATCHED', 'SETTLED', 'DISCREPANT', 'IGNORED'],
    }),
    importer.listStatementImports(ctx),
  ]);

  // Serialize records cleanly for Client Component boundary
  const initialBankAccounts = rawAccounts.map((acc: any) => ({
    id: acc.id,
    organizationId: acc.organizationId,
    branchId: acc.branchId,
    accountName: acc.accountName,
    bankName: acc.bankName,
    accountType: acc.accountType,
    accountNumberMasked: acc.accountNumberMasked,
    ifscCode: acc.ifscCode,
    ledgerAccountId: acc.ledgerAccountId,
    isActive: acc.isActive,
    branch: acc.branch ? { id: acc.branch.id, name: acc.branch.name, code: acc.branch.code } : null,
    ledgerAccount: acc.ledgerAccount
      ? { id: acc.ledgerAccount.id, code: acc.ledgerAccount.code, name: acc.ledgerAccount.name }
      : null,
  }));

  const initialStatementLines = {
    total: rawLinesData.total,
    lines: rawLinesData.lines.map((line: any) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      transactionDate: line.transactionDate.toISOString(),
      valueDate: line.valueDate ? line.valueDate.toISOString() : null,
      description: line.description,
      referenceNumber: line.referenceNumber,
      lineType: line.lineType,
      amount: new Decimal(line.amount.toString()).toFixed(2),
      runningBalance: line.runningBalance ? new Decimal(line.runningBalance.toString()).toFixed(2) : null,
      reconciliationStatus: line.reconciliationStatus,
      settlementJournalId: line.settlementJournalId,
      settledAt: line.settledAt ? line.settledAt.toISOString() : null,
      feeAmount: line.feeAmount ? new Decimal(line.feeAmount.toString()).toFixed(2) : null,
      bankAccount: line.bankAccount
        ? {
            id: line.bankAccount.id,
            accountName: line.bankAccount.accountName,
            bankName: line.bankAccount.bankName,
          }
        : null,
      matches: line.matches
        ? line.matches.map((m: any) => ({
            id: m.id,
            status: m.status,
            matchedAmount: new Decimal(m.matchedAmount.toString()).toFixed(2),
            payment: m.payment
              ? {
                  id: m.payment.id,
                  amount: new Decimal(m.payment.amount.toString()).toFixed(2),
                  paymentMethod: m.payment.paymentMethod,
                  transactionRef: m.payment.transactionRef,
                  invoice: m.payment.invoice
                    ? {
                        id: m.payment.invoice.id,
                        invoiceNumber: m.payment.invoice.invoiceNumber,
                        customerName: m.payment.invoice.customerName,
                      }
                    : null,
                }
              : null,
          }))
        : [],
    })),
  };

  const initialImports = rawImports.map((imp: any) => ({
    id: imp.id,
    fileName: imp.fileName,
    sourceType: imp.sourceType,
    fileFormat: imp.fileFormat,
    status: imp.status,
    totalLinesCount: imp.totalLinesCount,
    createdAt: imp.createdAt.toISOString(),
    bankAccount: imp.bankAccount
      ? {
          id: imp.bankAccount.id,
          accountName: imp.bankAccount.accountName,
          bankName: imp.bankAccount.bankName,
        }
      : null,
    importedByUser: imp.importedByUser
      ? {
          id: imp.importedByUser.id,
          name: imp.importedByUser.name,
          email: imp.importedByUser.email,
        }
      : null,
  }));

  return (
    <ReconciliationWorkspace
      user={{
        id: ctx.userId,
        role: ctx.role,
        tenantSlug: ctx.tenantSlug,
        tenantName: ctx.tenantName,
      }}
      branches={branches}
      ledgerAccounts={ledgerAccounts}
      initialBankAccounts={initialBankAccounts}
      initialSummary={rawSummary}
      initialStatementLines={initialStatementLines}
      initialImports={initialImports}
    />
  );
}
