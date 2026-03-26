-- Admin users section visibility: ADMIN_USERS module.
-- NOTE: Postgres enum values must be committed before they can be used.
-- Therefore, we add the enum value here, but seed admin_permissions in a later migration.

ALTER TYPE "AdminModule" ADD VALUE 'ADMIN_USERS';
