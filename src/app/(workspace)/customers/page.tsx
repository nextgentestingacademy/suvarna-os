import React from 'react';
import { getServerSecurityContext } from '@/lib/security-context';
import { hasPermission } from '@/lib/rbac';
import { AccessDeniedModule } from '@/components/access-denied-module';
import { CustomerDirectory } from '@/components/workspace/customer/customer-directory';
import { listCustomers } from '@/lib/customer';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const ctx = await getServerSecurityContext();

  // Enforce server-side authorization check
  if (!hasPermission(ctx.role, 'BILLING_CREATE')) {
    return (
      <AccessDeniedModule
        moduleName="Customer Management & CRM"
        requiredRole="Store Owner, Manager, Accountant, or Sales Staff"
        requiredPermission="BILLING_CREATE"
        currentRole={ctx.role}
        description="Your user role does not have authorization to view or manage customer profiles and CRM records."
      />
    );
  }

  // Fetch initial customer listing for this tenant
  const result = await listCustomers(prisma, {
    ctx,
    page: 1,
    limit: 20,
  });

  // Fetch permitted branches for showroom attribution
  const branches = await prisma.branch.findMany({
    where: {
      organizationId: ctx.tenantId,
      id: { in: [...ctx.allowedBranchIds] },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      code: true,
      city: true,
    },
    orderBy: { name: 'asc' },
  });

  const serializedCustomers = result.customers.map((c: any) => ({
    id: c.id,
    organizationId: c.organizationId,
    primaryBranchId: c.primaryBranchId,
    customerCode: c.customerCode,
    name: c.name,
    phone: c.phone,
    normalizedPhone: c.normalizedPhone,
    alternatePhone: c.alternatePhone,
    email: c.email,
    addressLine1: c.addressLine1,
    addressLine2: c.addressLine2,
    city: c.city,
    state: c.state,
    pincode: c.pincode,
    pan: c.pan,
    dateOfBirth: c.dateOfBirth ? c.dateOfBirth.toISOString().split('T')[0] : null,
    anniversary: c.anniversary ? c.anniversary.toISOString().split('T')[0] : null,
    segment: c.segment,
    notes: c.notes,
    preferences: c.preferences,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    primaryBranch: c.primaryBranch
      ? {
          id: c.primaryBranch.id,
          name: c.primaryBranch.name,
          code: c.primaryBranch.code,
        }
      : null,
  }));

  return (
    <CustomerDirectory
      initialCustomers={serializedCustomers}
      initialTotalCount={result.totalCount}
      initialPage={result.page}
      initialLimit={result.limit}
      branches={branches}
      activeBranchId={ctx.activeBranchId}
      userRole={ctx.role}
    />
  );
}
