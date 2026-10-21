-- CreateTable: products (Jewellery Catalogue & Design Definitions)
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "metalType" TEXT NOT NULL DEFAULT 'GOLD',
    "purity" TEXT NOT NULL DEFAULT '22K',
    "description" TEXT,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ornaments (Physical Stock Items in Showroom Branches)
CREATE TABLE "ornaments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tagCode" TEXT NOT NULL,
    "huid" TEXT,
    "metalType" TEXT NOT NULL DEFAULT 'GOLD',
    "purity" TEXT NOT NULL DEFAULT '22K',
    "grossWeight" DECIMAL(10,3) NOT NULL,
    "stoneWeight" DECIMAL(10,3) NOT NULL DEFAULT 0.000,
    "netWeight" DECIMAL(10,3) NOT NULL,
    "makingChargeType" TEXT,
    "makingChargeValue" DECIMAL(12,2),
    "costAmount" DECIMAL(12,2),
    "priceAmount" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ornaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stock_movements (Immutable Stock Movement & Transfer Ledger)
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ornamentId" TEXT NOT NULL,
    "fromBranchId" TEXT,
    "toBranchId" TEXT,
    "movementType" TEXT NOT NULL,
    "reason" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- Indexes & Unique Constraints on products
CREATE INDEX "products_organizationId_category_idx" ON "products"("organizationId", "category");
CREATE INDEX "products_organizationId_isActive_idx" ON "products"("organizationId", "isActive");
CREATE UNIQUE INDEX "products_organizationId_sku_key" ON "products"("organizationId", "sku");
CREATE UNIQUE INDEX "products_organizationId_id_key" ON "products"("organizationId", "id");

-- Indexes & Unique Constraints on ornaments
CREATE INDEX "ornaments_organizationId_branchId_status_idx" ON "ornaments"("organizationId", "branchId", "status");
CREATE INDEX "ornaments_organizationId_productId_idx" ON "ornaments"("organizationId", "productId");
CREATE INDEX "ornaments_organizationId_huid_idx" ON "ornaments"("organizationId", "huid");
CREATE UNIQUE INDEX "ornaments_organizationId_tagCode_key" ON "ornaments"("organizationId", "tagCode");
CREATE UNIQUE INDEX "ornaments_organizationId_id_key" ON "ornaments"("organizationId", "id");

-- Indexes on stock_movements
CREATE INDEX "stock_movements_organizationId_ornamentId_createdAt_idx" ON "stock_movements"("organizationId", "ornamentId", "createdAt");
CREATE INDEX "stock_movements_organizationId_createdAt_idx" ON "stock_movements"("organizationId", "createdAt");

-- Foreign Keys: products
ALTER TABLE "products" ADD CONSTRAINT "products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign Keys: ornaments (Composite keys enforce tenant boundary and prevent cross-tenant assignment)
ALTER TABLE "ornaments" ADD CONSTRAINT "ornaments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ornaments" ADD CONSTRAINT "ornaments_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "branches"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ornaments" ADD CONSTRAINT "ornaments_organizationId_productId_fkey" FOREIGN KEY ("organizationId", "productId") REFERENCES "products"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign Keys: stock_movements (Restrict deletion of referenced branch or ornament to preserve audit trail)
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organizationId_ornamentId_fkey" FOREIGN KEY ("organizationId", "ornamentId") REFERENCES "ornaments"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organizationId_fromBranchId_fkey" FOREIGN KEY ("organizationId", "fromBranchId") REFERENCES "branches"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organizationId_toBranchId_fkey" FOREIGN KEY ("organizationId", "toBranchId") REFERENCES "branches"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Database Engine Check Constraints: Weight Integrity (in grams to milligram precision)
ALTER TABLE "ornaments" ADD CONSTRAINT "ornaments_gross_weight_gt_zero" CHECK ("grossWeight" > 0);
ALTER TABLE "ornaments" ADD CONSTRAINT "ornaments_stone_weight_gte_zero" CHECK ("stoneWeight" >= 0);
ALTER TABLE "ornaments" ADD CONSTRAINT "ornaments_weights_integrity" CHECK ("grossWeight" >= "stoneWeight" AND "netWeight" = ("grossWeight" - "stoneWeight"));
