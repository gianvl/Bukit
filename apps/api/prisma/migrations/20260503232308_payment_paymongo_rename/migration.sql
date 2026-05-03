-- DropIndex
DROP INDEX "Payment_helixPayCheckoutId_key";

-- DropIndex
DROP INDEX "Payment_helixPayPaymentId_key";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "helixPayCheckoutId",
DROP COLUMN "helixPayPayload",
DROP COLUMN "helixPayPaymentId",
ADD COLUMN     "paymongoCheckoutId" TEXT,
ADD COLUMN     "paymongoPayload" JSONB,
ADD COLUMN     "paymongoPaymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymongoCheckoutId_key" ON "Payment"("paymongoCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymongoPaymentId_key" ON "Payment"("paymongoPaymentId");

