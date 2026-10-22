-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "primaryBranchId" TEXT,
    "customerCode" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "alternatePhone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT DEFAULT 'Maharashtra',
    "pincode" TEXT,
    "pan" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "anniversary" TIMESTAMP(3),
    "segment" TEXT NOT NULL DEFAULT 'RETAIL',
    "notes" TEXT,
    "preferences" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_interactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WALK_IN',
    "notes" TEXT NOT NULL,
    "followUpDate" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_organizationId_id_key" ON "customers"("organizationId", "id");

-- CreateIndex
CREATE INDEX "customers_organizationId_normalizedPhone_idx" ON "customers"("organizationId", "normalizedPhone");

-- CreateIndex
CREATE INDEX "customers_organizationId_name_idx" ON "customers"("organizationId", "name");

-- CreateIndex
CREATE INDEX "customers_organizationId_customerCode_idx" ON "customers"("organizationId", "customerCode");

-- CreateIndex
CREATE INDEX "customers_organizationId_primaryBranchId_idx" ON "customers"("organizationId", "primaryBranchId");

-- CreateIndex
CREATE INDEX "customers_organizationId_isActive_idx" ON "customers"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "customers_organizationId_createdAt_idx" ON "customers"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_interactions_organizationId_customerId_createdAt_idx" ON "customer_interactions"("organizationId", "customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organizationId_primaryBranchId_fkey" FOREIGN KEY ("organizationId", "primaryBranchId") REFERENCES "branches"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_organizationId_customerId_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "customers"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraints for Data Integrity
ALTER TABLE "customers" ADD CONSTRAINT "customers_name_not_empty" CHECK (LENGTH(TRIM("name")) > 0);
ALTER TABLE "customers" ADD CONSTRAINT "customers_phone_not_empty" CHECK (LENGTH(TRIM("phone")) > 0);
ALTER TABLE "customers" ADD CONSTRAINT "customers_normalized_phone_not_empty" CHECK (LENGTH(TRIM("normalizedPhone")) > 0);
ALTER TABLE "customers" ADD CONSTRAINT "customers_pan_format" CHECK ("pan" IS NULL OR LENGTH(TRIM("pan")) = 10);
ALTER TABLE "customers" ADD CONSTRAINT "customers_pincode_format" CHECK ("pincode" IS NULL OR LENGTH(TRIM("pincode")) = 6);
ALTER TABLE "customer_interactions" ADD CONSTRAINT "customer_interactions_notes_not_empty" CHECK (LENGTH(TRIM("notes")) > 0);
