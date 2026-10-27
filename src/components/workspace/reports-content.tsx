import React from 'react';
import { getServerSecurityContext, GetServerSecurityContextOptions } from '@/lib/security-context';
import { hasPermission } from '@/lib/rbac';
import { AccessDeniedModule } from '@/components/access-denied-module';
import { ReportsWorkspace } from '@/components/workspace/reports/reports-workspace';

export async function ReportsContent(options?: GetServerSecurityContextOptions) {
  const ctx = await getServerSecurityContext(options);

  if (!hasPermission(ctx.role, 'ACCOUNTS_VIEW')) {
    return (
      <AccessDeniedModule
        moduleName="Showroom Analytics & Financial Reports"
        requiredRole="Store Owner or Chartered Accountant"
        requiredPermission="ACCOUNTS_VIEW"
        currentRole={ctx.role}
        description="Your staff account does not possess permission to view financial ledgers, margins, day-end registers, or sales analytics."
      />
    );
  }

  return (
    <ReportsWorkspace
      permittedBranches={ctx.permittedBranches}
      initialBranchId={ctx.activeBranchId}
      userRole={ctx.role}
    />
  );
}
