-- Allow CREDITS in legacy admin_permissions check constraint.
-- Some databases still have admin_permissions_module_check that predates CREDITS.

ALTER TABLE "admin_permissions"
  DROP CONSTRAINT IF EXISTS "admin_permissions_module_check";

ALTER TABLE "admin_permissions"
  ADD CONSTRAINT "admin_permissions_module_check"
  CHECK (
    "module" IN (
      'TOURNAMENTS',
      'TEAMS',
      'CALENDAR_EVENTS',
      'MEMBERS',
      'ANNOUNCEMENTS',
      'PAYMENT_PROFILES',
      'ADMIN_USERS',
      'PAYMENTS',
      'CREDITS'
    )
  );
