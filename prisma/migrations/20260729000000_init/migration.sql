-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "raw_materials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'db',
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierName" TEXT,
    "supplierUrl" TEXT,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 14,
    "safetyBuffer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reserveDays" INTEGER,
    "orderMultiple" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgDailyUsage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorderPoint" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "shopifyProductId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "quantityPerUnit" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_history" (
    "id" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quantityUsed" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reorder_log" (
    "id" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "suggestedQuantity" DOUBLE PRECISION NOT NULL,
    "stockAtSend" DOUBLE PRECISION NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reorder_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_orders" (
    "id" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "orderName" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "raw_materials_active_idx" ON "raw_materials"("active");

-- CreateIndex
CREATE UNIQUE INDEX "products_shopifyProductId_key" ON "products"("shopifyProductId");

-- CreateIndex
CREATE INDEX "products_sku_idx" ON "products"("sku");

-- CreateIndex
CREATE INDEX "recipes_rawMaterialId_idx" ON "recipes"("rawMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_productId_rawMaterialId_key" ON "recipes"("productId", "rawMaterialId");

-- CreateIndex
CREATE INDEX "usage_history_rawMaterialId_date_idx" ON "usage_history"("rawMaterialId", "date");

-- CreateIndex
CREATE INDEX "usage_history_date_idx" ON "usage_history"("date");

-- CreateIndex
CREATE INDEX "reorder_log_rawMaterialId_sentAt_idx" ON "reorder_log"("rawMaterialId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "processed_orders_shopifyOrderId_key" ON "processed_orders"("shopifyOrderId");

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_history" ADD CONSTRAINT "usage_history_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_log" ADD CONSTRAINT "reorder_log_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

