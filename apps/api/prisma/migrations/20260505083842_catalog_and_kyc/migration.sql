-- ─── KYC enum + User column + KycSubmission table ────────────────────────

CREATE TYPE "KycStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "User"
  ADD COLUMN "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_SUBMITTED';

CREATE INDEX "User_kycStatus_idx" ON "User"("kycStatus");

CREATE TABLE "KycSubmission" (
  "id"              TEXT        NOT NULL,
  "userId"          TEXT        NOT NULL,
  "status"          "KycStatus" NOT NULL DEFAULT 'PENDING',
  "govIdType"       TEXT        NOT NULL,
  "govIdNumber"     TEXT        NOT NULL,
  "govIdImageUrl"   TEXT        NOT NULL,
  "selfieUrl"       TEXT        NOT NULL,
  "rejectionReason" TEXT,
  "reviewedById"    TEXT,
  "reviewedAt"      TIMESTAMP(3),
  "submittedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KycSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KycSubmission_userId_key" ON "KycSubmission"("userId");
CREATE INDEX "KycSubmission_status_submittedAt_idx" ON "KycSubmission"("status", "submittedAt");

ALTER TABLE "KycSubmission"
  ADD CONSTRAINT "KycSubmission_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KycSubmission"
  ADD CONSTRAINT "KycSubmission_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Service catalog: new Service parent + ServiceTier.serviceId ──────────

CREATE TABLE "Service" (
  "id"          TEXT        NOT NULL,
  "slug"        TEXT        NOT NULL,
  "name"        TEXT        NOT NULL,
  "description" TEXT        NOT NULL,
  "iconKey"     TEXT        NOT NULL DEFAULT 'sparkles',
  "sortOrder"   INTEGER     NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN     NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");
CREATE INDEX "Service_isActive_sortOrder_idx" ON "Service"("isActive", "sortOrder");

-- Seed a single "Cleaning" Service row to host the existing tiers. Using a
-- deterministic id so subsequent migrations or seeds can reference it.
INSERT INTO "Service" ("id", "slug", "name", "description", "iconKey", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES (
  'svc_cleaning_default',
  'cleaning',
  'Cleaning',
  'Vetted home cleaners for residential units across Metro Manila.',
  'sparkles',
  1,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;

-- Add the FK column nullable, backfill, then enforce NOT NULL.
ALTER TABLE "ServiceTier" ADD COLUMN "serviceId" TEXT;

UPDATE "ServiceTier"
SET "serviceId" = 'svc_cleaning_default'
WHERE "serviceId" IS NULL;

ALTER TABLE "ServiceTier" ALTER COLUMN "serviceId" SET NOT NULL;

CREATE INDEX "ServiceTier_serviceId_sortOrder_idx" ON "ServiceTier"("serviceId", "sortOrder");

ALTER TABLE "ServiceTier"
  ADD CONSTRAINT "ServiceTier_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
