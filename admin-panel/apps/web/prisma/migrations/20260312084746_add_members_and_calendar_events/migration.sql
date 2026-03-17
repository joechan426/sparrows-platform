-- CreateEnum
CREATE TYPE "CalendarEventSourceType" AS ENUM ('GOOGLE', 'MANUAL');

-- CreateEnum
CREATE TYPE "SportType" AS ENUM ('VOLLEYBALL', 'PICKLEBALL', 'TENNIS');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('NORMAL', 'SPECIAL');

-- CreateEnum
CREATE TYPE "EventRegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'WAITING_LIST', 'REJECTED');

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_poolId_fkey";

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "preferredName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "sourceType" "CalendarEventSourceType" NOT NULL,
    "sportType" "SportType" NOT NULL,
    "eventType" "CalendarEventType" NOT NULL,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "calendarEventId" TEXT NOT NULL,
    "teamName" TEXT,
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");

-- CreateIndex
CREATE INDEX "CalendarEvent_sourceEventId_sourceType_idx" ON "CalendarEvent"("sourceEventId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_memberId_calendarEventId_key" ON "EventRegistration"("memberId", "calendarEventId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
