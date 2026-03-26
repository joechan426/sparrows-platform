-- Super Manager role + payment_profiles; calendar events use payment_profile_id; drop per-admin payout columns.

ALTER TYPE "AdminRole" ADD VALUE 'SUPER_MANAGER';

CREATE TABLE "payment_profiles" (
    "id" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "stripe_connected_account_id" TEXT,
    "stripe_connect_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
    "paypal_merchant_id" TEXT,
    "paypal_rest_client_id_enc" TEXT,
    "paypal_rest_client_secret_enc" TEXT,
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_profiles_nickname_key" ON "payment_profiles"("nickname");

CREATE UNIQUE INDEX "payment_profiles_stripe_connected_account_id_key" ON "payment_profiles"("stripe_connected_account_id");

ALTER TABLE "payment_profiles" ADD CONSTRAINT "payment_profiles_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "payment_profiles" ("id", "nickname", "stripe_connected_account_id", "stripe_connect_charges_enabled", "paypal_merchant_id", "paypal_rest_client_id_enc", "paypal_rest_client_secret_enc", "created_by_admin_id", "created_at", "updated_at")
SELECT
  'pp_mig_' || "id",
  'migrated-' || "user_name",
  "stripe_connected_account_id",
  COALESCE("stripe_connect_charges_enabled", false),
  "paypal_merchant_id",
  "paypal_rest_client_id_enc",
  "paypal_rest_client_secret_enc",
  "id",
  NOW(),
  NOW()
FROM "admin_users"
WHERE "stripe_connected_account_id" IS NOT NULL
   OR "paypal_rest_client_id_enc" IS NOT NULL;

ALTER TABLE "CalendarEvent" ADD COLUMN "payment_profile_id" TEXT;

UPDATE "CalendarEvent" ce
SET "payment_profile_id" = (
  SELECT pp.id FROM "payment_profiles" pp
  WHERE pp.created_by_admin_id = ce.payment_account_admin_id
  LIMIT 1
)
WHERE ce.payment_account_admin_id IS NOT NULL;

ALTER TABLE "CalendarEvent" DROP CONSTRAINT IF EXISTS "CalendarEvent_payment_account_admin_id_fkey";

DROP INDEX IF EXISTS "CalendarEvent_payment_account_admin_id_idx";

ALTER TABLE "CalendarEvent" DROP COLUMN "payment_account_admin_id";

CREATE INDEX "CalendarEvent_payment_profile_id_idx" ON "CalendarEvent"("payment_profile_id");

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_payment_profile_id_fkey" FOREIGN KEY ("payment_profile_id") REFERENCES "payment_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "admin_users_stripe_connected_account_id_key";

ALTER TABLE "admin_users" DROP COLUMN IF EXISTS "stripe_connected_account_id";
ALTER TABLE "admin_users" DROP COLUMN IF EXISTS "stripe_connect_charges_enabled";
ALTER TABLE "admin_users" DROP COLUMN IF EXISTS "paypal_merchant_id";
ALTER TABLE "admin_users" DROP COLUMN IF EXISTS "paypal_rest_client_id_enc";
ALTER TABLE "admin_users" DROP COLUMN IF EXISTS "paypal_rest_client_secret_enc";
