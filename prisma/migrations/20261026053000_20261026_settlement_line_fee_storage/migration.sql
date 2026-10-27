-- AlterTable
ALTER TABLE "bank_statement_lines" ADD COLUMN "feeAmount" DECIMAL(14,2);

-- Backfill feeAmount from existing reconciliation_matches if present
UPDATE "bank_statement_lines" b
SET "feeAmount" = m."feeAmount"
FROM "reconciliation_matches" m
WHERE b.id = m."statementLineId"
  AND m."feeAmount" IS NOT NULL
  AND b."feeAmount" IS NULL;
