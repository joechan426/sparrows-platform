/*
  Warnings:

  - A unique constraint covering the columns `[sourceEventId,sourceType]` on the table `CalendarEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "CalendarEvent_sourceEventId_sourceType_idx";

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_sourceEventId_sourceType_key" ON "CalendarEvent"("sourceEventId", "sourceType");
