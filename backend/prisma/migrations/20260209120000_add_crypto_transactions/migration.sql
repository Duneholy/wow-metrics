-- CreateEnum
CREATE TYPE "CryptoTransactionType" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "CryptoTransaction" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "CryptoTransactionType" NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "totalRub" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CryptoTransaction_assetId_idx" ON "CryptoTransaction"("assetId");

-- AddForeignKey
ALTER TABLE "CryptoTransaction" ADD CONSTRAINT "CryptoTransaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
