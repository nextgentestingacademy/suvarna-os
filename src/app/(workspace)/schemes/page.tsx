import React from 'react';
import { ComingSoonModule } from '@/components/coming-soon-module';

export default function SchemesPage() {
  return (
    <ComingSoonModule
      moduleName="Gold SIP & Savings Scheme Administration"
      subtitle="Customer Wealth & Retention"
      badge="Milestone 4 Pipeline"
      description="Administer monthly gold contribution plans, track member passbooks, reconcile instalments, and automate maturity benefits."
      features={[
        {
          title: 'Plan Configuration & Rules',
          description: 'Define 10-month or 11-month schemes with fixed rupee or gold-gram accumulator rules and jeweller bonus contribution terms.',
          milestone: 'Milestone 4A',
        },
        {
          title: 'Instalment Reminders & UPI Autopay',
          description: 'WhatsApp and SMS alerts for upcoming instalments and digital payment reconciliation.',
          milestone: 'Milestone 4B',
        },
        {
          title: 'Redemption & Jewellery Vouchers',
          description: 'Seamless redemption of matured schemes toward bridal or everyday jewellery purchases at POS.',
          milestone: 'Milestone 4B',
        },
      ]}
    />
  );
}
