import React from 'react';
import { ComingSoonModule } from '@/components/coming-soon-module';

export default function PurchasesPage() {
  return (
    <ComingSoonModule
      moduleName="Gold Purchase & Old Gold Exchange"
      subtitle="Metal Counter"
      badge="Milestone 4 Pipeline"
      description="Evaluate customer old gold, deduct stones/melting loss, test purity, and generate purchase receipts or exchange credit notes."
      features={[
        {
          title: 'Assay & Purity Valuation',
          description: 'Record gross weight, non-gold stone deduction, and acid/touchstone or XRF assay results to calculate pure gold value.',
          milestone: 'Milestone 4A',
        },
        {
          title: 'Exchange Credit Vouchers',
          description: 'Instant conversion of old gold into purchase credit applied toward new retail jewellery invoices.',
          milestone: 'Milestone 4A',
        },
        {
          title: 'Statutory Compliance & PAN Verification',
          description: 'Enforce PAN recording thresholds for cash metal purchases in accordance with Indian Income Tax requirements.',
          milestone: 'Milestone 4B',
        },
      ]}
    />
  );
}
