-- CreateTable
CREATE TABLE "stock_receipts" (
    "id" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_receipts_rawMaterialId_date_idx" ON "stock_receipts"("rawMaterialId", "date");

-- CreateIndex
CREATE INDEX "stock_receipts_date_idx" ON "stock_receipts"("date");

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

