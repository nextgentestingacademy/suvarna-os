import React from 'react';
import { getServerSecurityContext, GetServerSecurityContextOptions } from '@/lib/security-context';
import { hasPermission } from '@/lib/rbac';
import { ComingSoonModule } from '@/components/coming-soon-module';
import { AccessDeniedModule } from '@/components/access-denied-module';

export async function SettingsContent(options?: GetServerSecurityContextOptions) {
  const ctx = await getServerSecurityContext(options);

  const canManageSettings =
    hasPermission(ctx.role, 'BRANCH_MANAGE') ||
    hasPermission(ctx.role, 'TENANT_MANAGE') ||
    hasPermission(ctx.role, 'STAFF_MANAGE');

  if (!canManageSettings) {
    return (
      <AccessDeniedModule
        moduleName="Branches, Staff & Showroom Settings"
        requiredRole="Store Owner or Store Manager"
        requiredPermission="BRANCH_MANAGE, TENANT_MANAGE, or STAFF_MANAGE"
        currentRole={ctx.role}
        description="Your staff account does not possess administrative permissions to configure showroom branches, staff invitations, or business credentials."
      />
    );
  }

  return (
    <ComingSoonModule
      moduleName="Branches, Staff & Showroom Settings"
      subtitle="Enterprise Configuration"
      badge="Milestone 3 Pipeline"
      description="Configure showroom branches, staff roles (Owner, Manager, Accountant, Sales), GSTIN credentials, tax rate rules, and thermal barcode printers."
      features={[
        {
          title: 'Multi-Showroom Branch Hierarchy',
          description: 'Manage main showrooms, design studios, and regional warehouse locations under a unified jewellery enterprise.',
          milestone: 'Milestone 3A',
        },
        {
          title: 'Staff Invitations & Granular RBAC',
          description: 'Send email invitations to new staff members and restrict counter sales associates to their local branch.',
          milestone: 'Milestone 3A',
        },
        {
          title: 'Barcode & Thermal Printer Drivers',
          description: 'Configure standard jewelry tag printers (Zebra, Citizen, TSC) for physical HUID and barcode labels.',
          milestone: 'Milestone 3B',
        },
      ]}
    />
  );
}
