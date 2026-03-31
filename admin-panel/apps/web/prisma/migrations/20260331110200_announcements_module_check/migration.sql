-- Finish AdminModule/permissions wiring for announcements.
-- This migration must run after `20260331110000_announcements_module_and_table`
-- so the enum value "ANNOUNCEMENTS" is already committed.

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
      'PAYMENTS'
    )
  );

