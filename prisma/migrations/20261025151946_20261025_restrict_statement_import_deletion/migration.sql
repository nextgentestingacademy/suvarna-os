-- DropForeignKey
ALTER TABLE "bank_statement_lines" DROP CONSTRAINT "bank_statement_lines_organizationId_importId_fkey";

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_organizationId_importId_fkey" FOREIGN KEY ("organizationId", "importId") REFERENCES "bank_statement_imports"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
