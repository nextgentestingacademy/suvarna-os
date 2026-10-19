import React from 'react';
import { ComingSoonModule } from '@/components/coming-soon-module';

export default function BillingPage() {
  return (
    <ComingSoonModule
      moduleName="Point of Sale & GST Billing"
      subtitle="Retail Transactions"
      badge="Milestone 3 Pipeline"
      description="Create GST-compliant tax invoices, calculate gross/net weights, making charges, discounts, and support split payments (UPI, Card, Cash)."
      features={[
        {
          title: '3% Indian Jewellery GST Breakdown',
          description: 'Automatic computation of 1.5% CGST + 1.5% SGST for intra-state or 3% IGST for inter-state transactions with 2-decimal rounding.',
          milestone: 'Milestone 3A',
        },
        {
          title: 'Sequential Document Numbering',
          description: 'Concurrency-safe financial year invoice sequences (e.g. SUV/26-27/0001) scoped per branch.',
          milestone: 'Milestone 3A',
        },
        {
          title: 'Split Tender & Thermal Printing',
          description: 'Payment receipts, advance adjustments, and thermal/A4 tax invoice PDF generation.',
          milestone: 'Milestone 3B',
        },
      ]}
    />
  );
}
