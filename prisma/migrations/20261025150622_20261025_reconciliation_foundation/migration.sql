-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "accountName" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'CURRENT',
    "accountNumberMasked" TEXT NOT NULL,
    "ifscCode" TEXT,
    "ledgerAccountId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_imports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "fileFormat" TEXT NOT NULL DEFAULT 'GENERIC_CSV',
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "statementStartDate" TIMESTAMP(3),
    "statementEndDate" TIMESTAMP(3),
    "totalLinesCount" INTEGER NOT NULL DEFAULT 0,
    "importedByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "lineType" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "runningBalance" DECIMAL(14,2),
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "duplicateFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_matches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "statementLineId" TEXT NOT NULL,
    "paymentId" TEXT,
    "matchType" TEXT NOT NULL,
    "matchedAmount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "matchedByUserId" TEXT,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_accounts_organizationId_branchId_idx" ON "bank_accounts"("organizationId", "branchId");

-- CreateIndex
CREATE INDEX "bank_accounts_organizationId_ledgerAccountId_idx" ON "bank_accounts"("organizationId", "ledgerAccountId");

-- CreateIndex
CREATE INDEX "bank_accounts_organizationId_isActive_idx" ON "bank_accounts"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_organizationId_id_key" ON "bank_accounts"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_organizationId_accountName_key" ON "bank_accounts"("organizationId", "accountName");

-- CreateIndex
CREATE INDEX "bank_statement_imports_organizationId_bankAccountId_created_idx" ON "bank_statement_imports"("organizationId", "bankAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_imports_organizationId_id_key" ON "bank_statement_imports"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_imports_organizationId_bankAccountId_fileHas_key" ON "bank_statement_imports"("organizationId", "bankAccountId", "fileHash");

-- CreateIndex
CREATE INDEX "bank_statement_lines_organizationId_bankAccountId_transacti_idx" ON "bank_statement_lines"("organizationId", "bankAccountId", "transactionDate");

-- CreateIndex
CREATE INDEX "bank_statement_lines_organizationId_importId_idx" ON "bank_statement_lines"("organizationId", "importId");

-- CreateIndex
CREATE INDEX "bank_statement_lines_organizationId_reconciliationStatus_idx" ON "bank_statement_lines"("organizationId", "reconciliationStatus");

-- CreateIndex
CREATE INDEX "bank_statement_lines_organizationId_referenceNumber_idx" ON "bank_statement_lines"("organizationId", "referenceNumber");

-- CreateIndex
CREATE INDEX "bank_statement_lines_organizationId_duplicateFingerprint_idx" ON "bank_statement_lines"("organizationId", "duplicateFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_organizationId_id_key" ON "bank_statement_lines"("organizationId", "id");

-- CreateIndex
CREATE INDEX "reconciliation_matches_organizationId_statementLineId_idx" ON "reconciliation_matches"("organizationId", "statementLineId");

-- CreateIndex
CREATE INDEX "reconciliation_matches_organizationId_paymentId_idx" ON "reconciliation_matches"("organizationId", "paymentId");

-- CreateIndex
CREATE INDEX "reconciliation_matches_organizationId_status_idx" ON "reconciliation_matches"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_matches_organizationId_id_key" ON "reconciliation_matches"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "branches"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organizationId_ledgerAccountId_fkey" FOREIGN KEY ("organizationId", "ledgerAccountId") REFERENCES "ledger_accounts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_organizationId_bankAccountId_fkey" FOREIGN KEY ("organizationId", "bankAccountId") REFERENCES "bank_accounts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_organizationId_importId_fkey" FOREIGN KEY ("organizationId", "importId") REFERENCES "bank_statement_imports"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_organizationId_bankAccountId_fkey" FOREIGN KEY ("organizationId", "bankAccountId") REFERENCES "bank_accounts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_organizationId_statementLineId_fkey" FOREIGN KEY ("organizationId", "statementLineId") REFERENCES "bank_statement_lines"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_organizationId_paymentId_fkey" FOREIGN KEY ("organizationId", "paymentId") REFERENCES "invoice_payments"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_matchedByUserId_fkey" FOREIGN KEY ("matchedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
