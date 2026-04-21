-- Allow app-initiated account deletion by anonymizing login identifiers
-- while preserving historical registrations/payments linked by member id.
ALTER TABLE "Member"
ALTER COLUMN "email" DROP NOT NULL;
