-- List query performance indexes for admin-panel list pages.
-- Requested:
-- 1) CalendarEvent.startAt
-- 2) EventRegistration(calendarEventId, createdAt)
-- 3) EventRegistration(paymentStatus, paidAt)
-- 4) Member preferredName/email trigram search indexes

-- Ensure pg_trgm is available before trigram indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1) calendar_events: index on start_at (Prisma: "CalendarEvent"."startAt")
CREATE INDEX IF NOT EXISTS "CalendarEvent_startAt_idx"
  ON "CalendarEvent"("startAt");

-- 2) event_registrations: composite index (calendar_event_id, created_at)
CREATE INDEX IF NOT EXISTS "EventRegistration_calendarEventId_createdAt_idx"
  ON "EventRegistration"("calendarEventId", "createdAt");

-- 3) event_registrations: composite index (payment_status, paid_at)
CREATE INDEX IF NOT EXISTS "EventRegistration_paymentStatus_paidAt_idx"
  ON "EventRegistration"("paymentStatus", "paidAt");

-- 4) members: GIN pg_trgm indexes for case-insensitive text search
CREATE INDEX IF NOT EXISTS "Member_preferredName_trgm_idx"
  ON "Member" USING GIN ("preferredName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Member_email_trgm_idx"
  ON "Member" USING GIN ("email" gin_trgm_ops)
  WHERE "email" IS NOT NULL;
