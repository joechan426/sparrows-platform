-- Attendance for calendar event registrations + COACH admin role

-- 1) Add COACH to AdminRole enum
DO $$
BEGIN
  ALTER TYPE "AdminRole" ADD VALUE 'COACH';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) Attendance status enum
DO $$
BEGIN
  CREATE TYPE "EventAttendanceStatus" AS ENUM ('DEFAULT', 'PRESENT', 'ABSENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3) Add attendance column to existing EventRegistration rows
ALTER TABLE "EventRegistration"
  ADD COLUMN IF NOT EXISTS "attendance" "EventAttendanceStatus" NOT NULL DEFAULT 'DEFAULT';

