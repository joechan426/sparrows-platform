-- Seed admin_permissions rows for existing Super Managers.
-- This runs after the enum value 'ADMIN_USERS' has been committed.

INSERT INTO "admin_permissions" ("id", "admin_user_id", "module", "created_at")
SELECT
  'mig_au_' || au.id,
  au.id,
  'ADMIN_USERS'::"AdminModule",
  NOW()
FROM "admin_users" au
WHERE au.role = 'SUPER_MANAGER'
  AND NOT EXISTS (
    SELECT 1 FROM "admin_permissions" ap
    WHERE ap."admin_user_id" = au.id AND ap."module" = 'ADMIN_USERS'
  );

