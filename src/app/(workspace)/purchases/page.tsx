'use client';

import React from 'react';
import { useWorkspace } from '@/components/layout/workspace-shell';
import { BuybackWorkspace } from '@/components/workspace/purchases/buyback-workspace';
import { Scale } from 'lucide-react';

export default function PurchasesPage() {
  const { activeBranch, user, availableBranches = [] } = useWorkspace();

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2 text-sm text-[#8a7a85]">
          <Scale className="w-5 h-5 animate-pulse text-[#d49a24]" />
          <span>Loading Gold Buyback Counter...</span>
        </div>
      </div>
    );
  }

  const branches = availableBranches.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
  }));

  return (
    <BuybackWorkspace
      user={{
        id: user.id || '',
        name: user.name || 'Staff User',
        role: user.role || 'SALES_STAFF',
        tenantSlug: user.tenantSlug || 'kalyan-test',
        tenantName: user.tenantName || 'Jeweller Workspace',
      }}
      branches={branches}
      activeBranchId={activeBranch?.id}
    />
  );
}
