-- CreateTable
CREATE TABLE "metal_rates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "metalType" TEXT NOT NULL,
    "purity" TEXT NOT NULL,
    "rateType" TEXT NOT NULL,
    "ratePerGram" DECIMAL(12,2) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metal_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyback_vouchers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerAddress" TEXT,
    "customerPan" TEXT,
    "metalType" TEXT NOT NULL,
    "purity" TEXT NOT NULL,
    "grossWeight" DECIMAL(10,3) NOT NULL,
    "stoneWeight" DECIMAL(10,3) NOT NULL DEFAULT 0.000,
    "netWeight" DECIMAL(10,3) NOT NULL,
    "testingMethod" TEXT,
    "testingNotes" TEXT,
    "metalRateId" TEXT,
    "appliedRate" DECIMAL(12,2) NOT NULL,
    "rateEffectiveAt" TIMESTAMP(3) NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "deductionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "deductionReason" TEXT,
    "netPayable" DECIMAL(14,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "lotOrnamentId" TEXT,
    "journalEntryId" TEXT,
    "exchangeInvoiceId" TEXT,
    "idempotencyKey" TEXT,
    "operatorId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyback_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyback_sequences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'BB',
    "currentNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyback_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "metal_rates_organizationId_metalType_purity_rateType_isActi_idx" ON "metal_rates"("organizationId", "metalType", "purity", "rateType", "isActive");

-- CreateIndex
CREATE INDEX "metal_rates_organizationId_branchId_effectiveFrom_idx" ON "metal_rates"("organizationId", "branchId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "metal_rates_organizationId_id_key" ON "metal_rates"("organizationId", "id");

-- CreateIndex
CREATE INDEX "buyback_vouchers_organizationId_customerId_idx" ON "buyback_vouchers"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "buyback_vouchers_organizationId_branchId_createdAt_idx" ON "buyback_vouchers"("organizationId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "buyback_vouchers_organizationId_status_idx" ON "buyback_vouchers"("organizationId", "status");

-- CreateIndex
CREATE INDEX "buyback_vouchers_organizationId_lotOrnamentId_idx" ON "buyback_vouchers"("organizationId", "lotOrnamentId");

-- CreateIndex
CREATE INDEX "buyback_vouchers_organizationId_journalEntryId_idx" ON "buyback_vouchers"("organizationId", "journalEntryId");

-- CreateIndex
CREATE INDEX "buyback_vouchers_organizationId_exchangeInvoiceId_idx" ON "buyback_vouchers"("organizationId", "exchangeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "buyback_vouchers_organizationId_id_key" ON "buyback_vouchers"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "buyback_vouchers_organizationId_branchId_voucherNumber_key" ON "buyback_vouchers"("organizationId", "branchId", "voucherNumber");

-- CreateIndex
CREATE UNIQUE INDEX "buyback_vouchers_organizationId_idempotencyKey_key" ON "buyback_vouchers"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "buyback_sequences_organizationId_branchId_fiscalYear_key" ON "buyback_sequences"("organizationId", "branchId", "fiscalYear");

-- AddForeignKey
ALTER TABLE "metal_rates" ADD CONSTRAINT "metal_rates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metal_rates" ADD CONSTRAINT "metal_rates_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "branches"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metal_rates" ADD CONSTRAINT "metal_rates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyback_vouchers" ADD CONSTRAINT "buyback_vouchers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyback_vouchers" ADD CONSTRAINT "buyback_vouchers_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "branches"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyback_vouchers" ADD CONSTRAINT "buyback_vouchers_customerId_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "customers"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyback_vouchers" ADD CONSTRAINT "buyback_vouchers_metalRateId_fkey" FOREIGN KEY ("organizationId", "metalRateId") REFERENCES "metal_rates"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyback_vouchers" ADD CONSTRAINT "buyback_vouchers_lotOrnamentId_fkey" FOREIGN KEY ("organizationId", "lotOrnamentId") REFERENCES "ornaments"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyback_vouchers" ADD CONSTRAINT "buyback_vouchers_journalEntryId_fkey" FOREIGN KEY ("organizationId", "journalEntryId") REFERENCES "journal_entries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyback_vouchers" ADD CONSTRAINT "buyback_vouchers_exchangeInvoiceId_fkey" FOREIGN KEY ("organizationId", "exchangeInvoiceId") REFERENCES "invoices"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyback_vouchers" ADD CONSTRAINT "buyback_vouchers_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyback_vouchers" ADD CONSTRAINT "buyback_vouchers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyback_sequences" ADD CONSTRAINT "buyback_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyback_sequences" ADD CONSTRAINT "buyback_sequences_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "branches"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
