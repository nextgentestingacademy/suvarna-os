import React from 'react';
import { ComingSoonModule } from '@/components/coming-soon-module';

export default function AiCopilotPage() {
  return (
    <ComingSoonModule
      moduleName="Suvarna AI Sales Co-Pilot"
      subtitle="Retail Intelligence & Retention"
      badge="Stage 2 Roadmap"
      description="Connect showroom customer records with actionable AI follow-up suggestions, bridal consultation matching, and catalogue-grounded recommendations."
      features={[
        {
          title: 'Daily AI Action Queue for Sales Staff',
          description: 'Surfaces bridal consultations needing follow-up, opted-in customer anniversary reminders, and pending quotations.',
          milestone: 'Stage 2A',
        },
        {
          title: 'Catalogue-Grounded Inquiry Matching',
          description: 'Matches customer budget and style requirements against real, available showroom inventory without fabricating availability.',
          milestone: 'Stage 2B',
        },
        {
          title: 'Multi-Lingual Draft Messaging',
          description: 'Generates WhatsApp and SMS draft replies in English, Hindi, and Marathi subject to staff approval before sending.',
          milestone: 'Stage 2B',
        },
      ]}
    />
  );
}
