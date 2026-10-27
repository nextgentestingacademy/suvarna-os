-- AlterTable
ALTER TABLE "bank_statement_lines" ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "settlementJournalId" TEXT;

-- AlterTable
ALTER TABLE "reconciliation_matches" ADD COLUMN     "feeAmount" DECIMAL(14,2),
ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "settlementJournalId" TEXT;

-- CreateIndex
CREATE INDEX "bank_statement_lines_organizationId_settlementJournalId_idx" ON "bank_statement_lines"("organizationId", "settlementJournalId");

-- CreateIndex
CREATE INDEX "reconciliation_matches_organizationId_settlementJournalId_idx" ON "reconciliation_matches"("organizationId", "settlementJournalId");

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_organizationId_settlementJournalId_fkey" FOREIGN KEY ("organizationId", "settlementJournalId") REFERENCES "journal_entries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_organizationId_settlementJournalId_fkey" FOREIGN KEY ("organizationId", "settlementJournalId") REFERENCES "journal_entries"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
