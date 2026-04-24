-- Add credit permission module (PG14-safe: IF NOT EXISTS for enum values requires PG15+)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'AdminModule' AND e.enumlabel = 'CREDITS'
  ) THEN
    ALTER TYPE "AdminModule" ADD VALUE 'CREDITS';
  END IF;
END $$;

-- Add credit balance to members
ALTER TABLE "Member"
ADD COLUMN IF NOT EXISTS "creditCents" INTEGER NOT NULL DEFAULT 0;

-- Add credit usage/refund markers to event registrations
ALTER TABLE "EventRegistration"
ADD COLUMN IF NOT EXISTS "creditAppliedCents" INTEGER,
ADD COLUMN IF NOT EXISTS "creditRefundedAt" TIMESTAMP(3);

-- Credit ledger reason enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MemberCreditReason') THEN
    CREATE TYPE "MemberCreditReason" AS ENUM ('EVENT_REFUND', 'REGISTRATION_APPLY', 'MANUAL_ADJUST');
  END IF;
END $$;

-- Credit ledger table
CREATE TABLE IF NOT EXISTS "member_credit_ledger" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "registrationId" TEXT,
  "calendarEventId" TEXT,
  "deltaCents" INTEGER NOT NULL,
  "reason" "MemberCreditReason" NOT NULL,
  "created_by_admin_id" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "member_credit_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "member_credit_ledger_memberId_createdAt_idx"
  ON "member_credit_ledger"("memberId", "createdAt");
CREATE INDEX IF NOT EXISTS "member_credit_ledger_registrationId_idx"
  ON "member_credit_ledger"("registrationId");
CREATE INDEX IF NOT EXISTS "member_credit_ledger_calendarEventId_idx"
  ON "member_credit_ledger"("calendarEventId");
CREATE INDEX IF NOT EXISTS "member_credit_ledger_created_by_admin_id_idx"
  ON "member_credit_ledger"("created_by_admin_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_credit_ledger_memberId_fkey'
  ) THEN
    ALTER TABLE "member_credit_ledger"
    ADD CONSTRAINT "member_credit_ledger_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_credit_ledger_registrationId_fkey'
  ) THEN
    ALTER TABLE "member_credit_ledger"
    ADD CONSTRAINT "member_credit_ledger_registrationId_fkey"
      FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_credit_ledger_calendarEventId_fkey'
  ) THEN
    ALTER TABLE "member_credit_ledger"
    ADD CONSTRAINT "member_credit_ledger_calendarEventId_fkey"
      FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_credit_ledger_created_by_admin_id_fkey'
  ) THEN
    ALTER TABLE "member_credit_ledger"
    ADD CONSTRAINT "member_credit_ledger_created_by_admin_id_fkey"
      FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
