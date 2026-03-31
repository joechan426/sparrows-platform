-- Add ANNOUNCEMENTS module to admin permissions enum/check.
DO $$
BEGIN
  BEGIN
    ALTER TYPE "AdminModule" ADD VALUE 'ANNOUNCEMENTS';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE "admin_permissions"
  DROP CONSTRAINT IF EXISTS "admin_permissions_module_check";

-- IMPORTANT:
-- Do not reference the newly added enum value "ANNOUNCEMENTS" in the same migration transaction.
-- Postgres treats this as unsafe until the enum change is committed.
-- The constraint update is handled in a follow-up migration.

CREATE TABLE IF NOT EXISTS "announcements" (
  "id" TEXT PRIMARY KEY,
  "message" TEXT NOT NULL,
  "created_by_admin_id" TEXT REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "announcements_created_at_idx" ON "announcements"("created_at");
