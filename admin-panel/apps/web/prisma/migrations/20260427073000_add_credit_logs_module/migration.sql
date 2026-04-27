-- Add CREDIT_LOGS admin permission module.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AdminModule' AND e.enumlabel = 'CREDIT_LOGS'
  ) THEN
    ALTER TYPE "AdminModule" ADD VALUE 'CREDIT_LOGS';
  END IF;
END
$$;
