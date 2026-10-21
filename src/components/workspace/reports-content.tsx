import React from 'react';
import { getServerSecurityContext, GetServerSecurityContextOptions } from '@/lib/security-context';
import { hasPermission } from '@/lib/rbac';
import { ComingSoonModule } from '@/components/coming-soon-module';
import { AccessDeniedModule } from '@/components/access-denied-module';

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
    <ComingSoonModule
      moduleName="Showroom Analytics & Financial Reports"
      subtitle="Business Intelligence"
      badge="Milestone 5 Pipeline"
      description="Gain deep visibility into showroom margins, top design categories, dead-stock ageing, staff sales performance, and GST audit day-books."
      features={[
        {
          title: 'Daily Metal & Cash Reconciliation',
          description: 'Day-end closing registers tracking physical gold weight balance, cash drawers, card terminals, and UPI collections.',
          milestone: 'Milestone 5A',
        },
        {
          title: 'Making Charge & Margin Analytics',
          description: 'Gross margin breakdown per category (Necklaces vs Bangles) and Karigar labor expense reconciliation.',
          milestone: 'Milestone 5A',
        },
        {
          title: 'CA / Auditor GSTR-1 & GSTR-3B Exports',
          description: 'Export structured B2C and B2B invoice tables formatted for Indian GST compliance filings.',
          milestone: 'Milestone 5B',
        },
      ]}
    />
  );
}
