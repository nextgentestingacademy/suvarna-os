-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "idempotencyKey" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerPan" TEXT,
    "customerAddress" TEXT,
    "customerCity" TEXT,
    "customerState" TEXT,
    "customerPincode" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "taxableAmount" DECIMAL(14,2) NOT NULL,
    "isInterState" BOOLEAN NOT NULL DEFAULT false,
    "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "totalTax" DECIMAL(12,2) NOT NULL,
    "roundOff" DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    "grandTotal" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "balanceAmount" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
    "notes" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "ornamentId" TEXT NOT NULL,
    "tagCode" TEXT NOT NULL,
    "huid" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "metalType" TEXT NOT NULL,
    "purity" TEXT NOT NULL,
    "grossWeight" DECIMAL(10,3) NOT NULL,
    "stoneWeight" DECIMAL(10,3) NOT NULL DEFAULT 0.000,
    "netWeight" DECIMAL(10,3) NOT NULL,
    "pricingMode" TEXT NOT NULL DEFAULT 'WEIGHT_BASED',
    "ratePerGram" DECIMAL(12,2) NOT NULL,
    "metalValue" DECIMAL(12,2) NOT NULL,
    "makingChargeType" TEXT NOT NULL,
    "makingChargeRate" DECIMAL(12,2) NOT NULL,
    "makingChargeAmount" DECIMAL(12,2) NOT NULL,
    "stoneCharges" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "itemDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "taxableAmount" DECIMAL(12,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 3.00,
    "gstAmount" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "transactionRef" TEXT,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "receivedByUserId" TEXT,

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_sequences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'INV',
    "currentNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_organizationId_customerId_invoiceDate_idx" ON "invoices"("organizationId", "customerId", "invoiceDate");

-- CreateIndex
CREATE INDEX "invoices_organizationId_branchId_invoiceDate_idx" ON "invoices"("organizationId", "branchId", "invoiceDate");

-- CreateIndex
CREATE INDEX "invoices_organizationId_status_idx" ON "invoices"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organizationId_id_key" ON "invoices"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organizationId_branchId_invoiceNumber_key" ON "invoices"("organizationId", "branchId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organizationId_idempotencyKey_key" ON "invoices"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "invoice_items_organizationId_ornamentId_idx" ON "invoice_items"("organizationId", "ornamentId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_organizationId_id_key" ON "invoice_items"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_organizationId_invoiceId_ornamentId_key" ON "invoice_items"("organizationId", "invoiceId", "ornamentId");

-- CreateIndex
CREATE INDEX "invoice_payments_organizationId_invoiceId_idx" ON "invoice_payments"("organizationId", "invoiceId");

-- CreateIndex
CREATE INDEX "invoice_payments_organizationId_paymentMethod_paymentDate_idx" ON "invoice_payments"("organizationId", "paymentMethod", "paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_payments_organizationId_id_key" ON "invoice_payments"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_sequences_organizationId_branchId_fiscalYear_key" ON "invoice_sequences"("organizationId", "branchId", "fiscalYear");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "branches"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_customerId_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "customers"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_organizationId_invoiceId_fkey" FOREIGN KEY ("organizationId", "invoiceId") REFERENCES "invoices"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_organizationId_ornamentId_fkey" FOREIGN KEY ("organizationId", "ornamentId") REFERENCES "ornaments"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_organizationId_invoiceId_fkey" FOREIGN KEY ("organizationId", "invoiceId") REFERENCES "invoices"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "branches"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
