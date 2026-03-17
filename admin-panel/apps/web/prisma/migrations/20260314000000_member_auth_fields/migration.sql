-- AlterTable
ALTER TABLE "Member" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "Member" ADD COLUMN "appleId" TEXT;
ALTER TABLE "Member" ADD COLUMN "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Member_appleId_key" ON "Member"("appleId");
CREATE UNIQUE INDEX "Member_googleId_key" ON "Member"("googleId");
