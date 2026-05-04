-- Add VOID to PayoutStatus
ALTER TYPE "PayoutStatus" ADD VALUE 'VOID';

-- New PayoutMethodType enum
CREATE TYPE "PayoutMethodType" AS ENUM ('GCASH', 'BANK');

-- Per-provider take rate (basis points; 500 = 5%)
ALTER TABLE "ProviderProfile" ADD COLUMN "takeRateBps" INTEGER NOT NULL DEFAULT 500;

-- Payout: add new columns nullable, backfill from amountCentavos, then NOT NULL.
ALTER TABLE "Payout"
  ADD COLUMN "grossCentavos" INTEGER,
  ADD COLUMN "feeCentavos"   INTEGER,
  ADD COLUMN "netCentavos"   INTEGER,
  ADD COLUMN "eligibleAt"    TIMESTAMP(3),
  ADD COLUMN "referenceCode" TEXT;

-- Backfill: legacy rows had no platform fee; pay full amount, eligible immediately.
UPDATE "Payout" SET
  "grossCentavos" = "amountCentavos",
  "feeCentavos"   = 0,
  "netCentavos"   = "amountCentavos",
  "eligibleAt"    = "createdAt";

ALTER TABLE "Payout"
  ALTER COLUMN "grossCentavos" SET NOT NULL,
  ALTER COLUMN "feeCentavos"   SET NOT NULL,
  ALTER COLUMN "netCentavos"   SET NOT NULL,
  ALTER COLUMN "eligibleAt"    SET NOT NULL;

ALTER TABLE "Payout" DROP COLUMN "amountCentavos";

-- Swap the (status, createdAt) index for (status, eligibleAt) — disbursement queue ordering.
DROP INDEX IF EXISTS "Payout_status_createdAt_idx";
CREATE INDEX "Payout_status_eligibleAt_idx" ON "Payout"("status", "eligibleAt");

-- ProviderPayoutMethod (1:1 with ProviderProfile for v1)
CREATE TABLE "ProviderPayoutMethod" (
  "id"                TEXT             NOT NULL,
  "providerProfileId" TEXT             NOT NULL,
  "type"              "PayoutMethodType" NOT NULL,
  "holderName"        TEXT             NOT NULL,
  "accountIdentifier" TEXT             NOT NULL,
  "bankCode"          TEXT,
  "createdAt"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "ProviderPayoutMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderPayoutMethod_providerProfileId_key"
  ON "ProviderPayoutMethod"("providerProfileId");

ALTER TABLE "ProviderPayoutMethod"
  ADD CONSTRAINT "ProviderPayoutMethod_providerProfileId_fkey"
  FOREIGN KEY ("providerProfileId") REFERENCES "ProviderProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
