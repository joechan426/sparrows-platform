-- CreateTable
CREATE TABLE "Pool" (
    "id" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "TournamentRegistration" ADD COLUMN "poolId" TEXT;

-- CreateIndex
CREATE INDEX "Pool_divisionId_idx" ON "Pool"("divisionId");

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (SetNull when pool is deleted)
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE SET NULL ON UPDATE CASCADE;
