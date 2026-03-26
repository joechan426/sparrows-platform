-- Payment profile active flag + PAYMENT_PROFILES admin module.
-- NOTE: Postgres enum values must be committed before they can be used.
-- Therefore, we add the enum value here, but seed admin_permissions in a later migration.

ALTER TYPE "AdminModule" ADD VALUE 'PAYMENT_PROFILES';

ALTER TABLE "payment_profiles" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
