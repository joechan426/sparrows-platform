-- Seed admin_permissions rows for existing Super Managers.
-- This runs after the enum value 'PAYMENT_PROFILES' has been committed.

INSERT INTO "admin_permissions" ("id", "admin_user_id", "module", "created_at")
SELECT
  'mig_pp_' || au.id,
  au.id,
  'PAYMENT_PROFILES'::"AdminModule",
  NOW()
FROM "admin_users" au
WHERE au.role = 'SUPER_MANAGER'
  AND NOT EXISTS (
    SELECT 1 FROM "admin_permissions" ap
    WHERE ap."admin_user_id" = au.id AND ap."module" = 'PAYMENT_PROFILES'
  );

