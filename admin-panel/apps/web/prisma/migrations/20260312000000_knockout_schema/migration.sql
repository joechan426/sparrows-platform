-- Add KNOCKOUT to MatchStage enum
ALTER TYPE "MatchStage" ADD VALUE 'KNOCKOUT';

-- Make poolId optional for division-level knockout matches
ALTER TABLE "Match" ALTER COLUMN "poolId" DROP NOT NULL;

-- Add seed columns for knockout matches (which seed each team is)
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "seedA" INTEGER;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "seedB" INTEGER;
