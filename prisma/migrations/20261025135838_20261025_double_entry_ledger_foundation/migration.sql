-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "normalBalance" TEXT NOT NULL,
    "isSystemAccount" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "entryNumber" TEXT NOT NULL,
    "postingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "narration" TEXT,
    "totalDebit" DECIMAL(14,2) NOT NULL,
    "totalCredit" DECIMAL(14,2) NOT NULL,
    "reversalOfId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "creditAmount" DECIMAL(14,2) NOT NULL DEFAULT 0.00,
    "narration" TEXT,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_sequences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'JE',
    "currentNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_accounts_organizationId_classification_idx" ON "ledger_accounts"("organizationId", "classification");

-- CreateIndex
CREATE INDEX "ledger_accounts_organizationId_isActive_idx" ON "ledger_accounts"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_organizationId_code_key" ON "ledger_accounts"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_organizationId_id_key" ON "ledger_accounts"("organizationId", "id");

-- CreateIndex
CREATE INDEX "journal_entries_organizationId_postingDate_idx" ON "journal_entries"("organizationId", "postingDate");

-- CreateIndex
CREATE INDEX "journal_entries_organizationId_branchId_postingDate_idx" ON "journal_entries"("organizationId", "branchId", "postingDate");

-- CreateIndex
CREATE INDEX "journal_entries_organizationId_sourceType_sourceId_idx" ON "journal_entries"("organizationId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "journal_entries_organizationId_status_idx" ON "journal_entries"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_organizationId_id_key" ON "journal_entries"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_organizationId_entryNumber_key" ON "journal_entries"("organizationId", "entryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_organizationId_idempotencyKey_key" ON "journal_entries"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "journal_lines_organizationId_journalEntryId_idx" ON "journal_lines"("organizationId", "journalEntryId");

-- CreateIndex
CREATE INDEX "journal_lines_organizationId_accountId_createdAt_idx" ON "journal_lines"("organizationId", "accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "journal_lines_organizationId_id_key" ON "journal_lines"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_sequences_organizationId_fiscalYear_key" ON "journal_sequences"("organizationId", "fiscalYear");

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "branches"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organizationId_reversalOfId_fkey" FOREIGN KEY ("organizationId", "reversalOfId") REFERENCES "journal_entries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_organizationId_journalEntryId_fkey" FOREIGN KEY ("organizationId", "journalEntryId") REFERENCES "journal_entries"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_organizationId_accountId_fkey" FOREIGN KEY ("organizationId", "accountId") REFERENCES "ledger_accounts"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_sequences" ADD CONSTRAINT "journal_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_non_negative_amounts" CHECK ("debitAmount" >= 0 AND "creditAmount" >= 0);
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_single_positive_side" CHECK (("debitAmount" > 0 AND "creditAmount" = 0) OR ("debitAmount" = 0 AND "creditAmount" > 0));
