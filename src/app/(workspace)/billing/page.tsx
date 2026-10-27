import React from 'react';
import { getServerSecurityContext } from '@/lib/security-context';
import { hasPermission } from '@/lib/rbac';
import { AccessDeniedModule } from '@/components/access-denied-module';
import { PosInterface } from '@/components/workspace/billing/pos-interface';
import { InventoryService } from '@/lib/inventory';
import { billingService } from '@/lib/billing';
import { listCustomers } from '@/lib/customer';
import { prisma } from '@/lib/db';
import { Decimal } from 'decimal.js';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const ctx = await getServerSecurityContext();

  // Enforce server-side authorization check: only roles with BILLING_CREATE can issue bills
  if (!hasPermission(ctx.role, 'BILLING_CREATE')) {
    return (
      <AccessDeniedModule
        moduleName="Point of Sale & GST Billing"
        requiredRole="Store Owner, Manager, Accountant, or Sales Staff"
        requiredPermission="BILLING_CREATE"
        currentRole={ctx.role}
        description="Your user role does not have authorization to access the Point of Sale or issue sales invoices."
      />
    );
  }

  const branchId = ctx.activeBranchId || (ctx.allowedBranchIds.length > 0 ? ctx.allowedBranchIds[0] : null);
  if (!branchId) {
    return (
      <AccessDeniedModule
        moduleName="Point of Sale & GST Billing"
        requiredRole="Staff with Assigned Branch"
        requiredPermission="BILLING_CREATE"
        currentRole={ctx.role}
        description="You do not have any permitted showroom branches assigned to your account."
      />
    );
  }

  const branch = await prisma.branch.findUnique({
    where: {
      organizationId_id: {
        organizationId: ctx.tenantId,
        id: branchId,
      },
    },
    select: {
      id: true,
      name: true,
      code: true,
      city: true,
      state: true,
      addressLine1: true,
      phone: true,
    },
  });

  const activeBranch = branch || {
    id: branchId,
    name: 'Showroom Branch',
    code: 'MAIN',
    city: 'Mumbai',
    state: 'Maharashtra',
    addressLine1: 'Heritage Chambers',
    phone: '+91 22 2200 0001',
  };

  // Fetch real available inventory from this showroom branch
  const inventoryService = new InventoryService();
  const availableOrnaments = await inventoryService.getOrnaments(ctx, {
    branchId,
    status: 'AVAILABLE',
  });

  // Serialize available ornaments for client boundary
  const serializedOrnaments = availableOrnaments.map((orn: any) => ({
    id: orn.id,
    organizationId: orn.organizationId,
    branchId: orn.branchId,
    productId: orn.productId,
    tagCode: orn.tagCode,
    huid: orn.huid,
    metalType: orn.metalType,
    purity: orn.purity,
    grossWeight: orn.grossWeight !== null && orn.grossWeight !== undefined ? new Decimal(orn.grossWeight).toFixed(3) : '0.000',
    stoneWeight: orn.stoneWeight !== null && orn.stoneWeight !== undefined ? new Decimal(orn.stoneWeight).toFixed(3) : '0.000',
    netWeight: orn.netWeight !== null && orn.netWeight !== undefined ? new Decimal(orn.netWeight).toFixed(3) : '0.000',
    makingChargeType: orn.makingChargeType,
    makingChargeValue: orn.makingChargeValue !== null && orn.makingChargeValue !== undefined ? new Decimal(orn.makingChargeValue).toString() : null,
    costAmount: null, // Redacted for POS
    priceAmount: orn.priceAmount !== null && orn.priceAmount !== undefined ? new Decimal(orn.priceAmount).toFixed(2) : null,
    status: orn.status,
    createdAt: orn.createdAt instanceof Date ? orn.createdAt.toISOString() : orn.createdAt,
    updatedAt: orn.updatedAt instanceof Date ? orn.updatedAt.toISOString() : orn.updatedAt,
    product: orn.product
      ? {
          id: orn.product.id,
          organizationId: orn.product.organizationId,
          sku: orn.product.sku,
          name: orn.product.name,
          category: orn.product.category,
          metalType: orn.product.metalType,
          purity: orn.product.purity,
          description: orn.product.description,
          imageUrl: orn.product.imageUrl,
          isActive: orn.product.isActive,
          createdAt: orn.product.createdAt instanceof Date ? orn.product.createdAt.toISOString() : orn.product.createdAt,
          updatedAt: orn.product.updatedAt instanceof Date ? orn.product.updatedAt.toISOString() : orn.product.updatedAt,
        }
      : undefined,
  }));

  // Fetch initial customers for quick selection
  const customerResult = await listCustomers(prisma, {
    ctx,
    page: 1,
    limit: 15,
  });

  const serializedCustomers = customerResult.customers.map((c: any) => ({
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
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  }));

  // Fetch recent invoices for active showroom branch
  const recentInvoicesResult = await billingService.listInvoices(ctx, {
    branchId,
    limit: 10,
  });

  const serializedRecentInvoices = recentInvoicesResult.invoices.map((inv) => ({
    id: inv.id,
    organizationId: inv.organizationId,
    branchId: inv.branchId,
    customerId: inv.customerId,
    invoiceNumber: inv.invoiceNumber,
    fiscalYear: inv.fiscalYear,
    sequenceNumber: inv.sequenceNumber,
    idempotencyKey: inv.idempotencyKey,
    invoiceDate: inv.invoiceDate.toISOString(),
    status: inv.status,
    customerName: inv.customerName,
    customerPhone: inv.customerPhone,
    customerPan: inv.customerPan,
    customerAddress: inv.customerAddress,
    customerCity: inv.customerCity,
    customerState: inv.customerState,
    customerPincode: inv.customerPincode,
    currency: inv.currency,
    subtotal: inv.subtotal.toString(),
    discountAmount: inv.discountAmount.toString(),
    taxableAmount: inv.taxableAmount.toString(),
    isInterState: inv.isInterState,
    cgstAmount: inv.cgstAmount.toString(),
    sgstAmount: inv.sgstAmount.toString(),
    igstAmount: inv.igstAmount.toString(),
    totalTax: inv.totalTax.toString(),
    roundOff: inv.roundOff.toString(),
    grandTotal: inv.grandTotal.toString(),
    paidAmount: inv.paidAmount.toString(),
    balanceAmount: inv.balanceAmount.toString(),
    paymentStatus: inv.paymentStatus,
    notes: inv.notes,
    userId: inv.userId,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
    items: inv.items.map((item) => ({
      id: item.id,
      organizationId: item.organizationId,
      invoiceId: item.invoiceId,
      ornamentId: item.ornamentId,
      tagCode: item.tagCode,
      huid: item.huid,
      productName: item.productName,
      sku: item.sku,
      category: item.category,
      metalType: item.metalType,
      purity: item.purity,
      grossWeight: item.grossWeight.toString(),
      stoneWeight: item.stoneWeight.toString(),
      netWeight: item.netWeight.toString(),
      pricingMode: item.pricingMode,
      ratePerGram: item.ratePerGram.toString(),
      metalValue: item.metalValue.toString(),
      makingChargeType: item.makingChargeType,
      makingChargeRate: item.makingChargeRate.toString(),
      makingChargeAmount: item.makingChargeAmount.toString(),
      stoneCharges: item.stoneCharges.toString(),
      itemDiscount: item.itemDiscount.toString(),
      taxableAmount: item.taxableAmount.toString(),
      gstRate: item.gstRate.toString(),
      gstAmount: item.gstAmount.toString(),
      totalAmount: item.totalAmount.toString(),
    })),
    payments: inv.payments.map((p) => ({
      id: p.id,
      organizationId: p.organizationId,
      invoiceId: p.invoiceId,
      paymentMethod: p.paymentMethod,
      amount: p.amount.toString(),
      transactionRef: p.transactionRef,
      paymentDate: p.paymentDate.toISOString(),
      notes: p.notes,
      receivedByUserId: p.receivedByUserId,
    })),
  }));

  return (
    <PosInterface
      activeBranch={activeBranch}
      availableOrnaments={serializedOrnaments}
      initialCustomers={serializedCustomers}
      recentInvoices={serializedRecentInvoices}
    />
  );
}
