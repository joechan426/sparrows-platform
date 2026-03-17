-- CreateTable
CREATE TABLE "Division" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- AddColumn: divisionId nullable first for backfill
ALTER TABLE "TournamentRegistration" ADD COLUMN "divisionId" TEXT;

-- Backfill: create one Default division per tournament
INSERT INTO "Division" ("id", "tournamentId", "name", "sortOrder", "createdAt")
SELECT 
  'div_' || substr(md5("id"), 1, 20),
  "id",
  'Default',
  0,
  NOW()
FROM "Tournament";

-- Backfill: set divisionId on existing registrations
UPDATE "TournamentRegistration" tr
SET "divisionId" = (
  SELECT d."id" FROM "Division" d 
  WHERE d."tournamentId" = tr."tournamentId" 
  ORDER BY d."sortOrder", d."createdAt" 
  LIMIT 1
);

-- Make divisionId required
ALTER TABLE "TournamentRegistration" ALTER COLUMN "divisionId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Division_tournamentId_idx" ON "Division"("tournamentId");

-- AddForeignKey
ALTER TABLE "Division" ADD CONSTRAINT "Division_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
