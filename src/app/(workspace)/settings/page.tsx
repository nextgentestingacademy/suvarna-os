import React from 'react';
import { ComingSoonModule } from '@/components/coming-soon-module';

export default function SettingsPage() {
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
