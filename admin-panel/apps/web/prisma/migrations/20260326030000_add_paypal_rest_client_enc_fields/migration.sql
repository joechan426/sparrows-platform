-- Added PayPal per-merchant REST app credentials (encrypted at rest).
-- Used when PayPal is not in Partner/third-party mode; each recipient provides its own REST App.

ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "paypal_rest_client_id_enc" TEXT;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "paypal_rest_client_secret_enc" TEXT;

