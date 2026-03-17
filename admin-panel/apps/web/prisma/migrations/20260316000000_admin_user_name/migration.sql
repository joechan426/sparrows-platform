-- Add user_name for login (plain text, unique). Backfill from email. Make email optional.
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "user_name" TEXT;
UPDATE "admin_users" SET "user_name" = "email" WHERE "user_name" IS NULL;
ALTER TABLE "admin_users" ALTER COLUMN "user_name" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "admin_users_user_name_key" ON "admin_users"("user_name");
ALTER TABLE "admin_users" ALTER COLUMN "email" DROP NOT NULL;
