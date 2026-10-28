-- AlterTable
ALTER TABLE "buyback_vouchers" ADD COLUMN "redeemedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0.00;
ALTER TABLE "buyback_vouchers" ADD COLUMN "approvedById" TEXT;

-- CreateIndex
CREATE INDEX "buyback_vouchers_organizationId_approvedById_idx" ON "buyback_vouchers"("organizationId", "approvedById");

-- AddForeignKey
ALTER TABLE "buyback_vouchers" ADD CONSTRAINT "buyback_vouchers_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
