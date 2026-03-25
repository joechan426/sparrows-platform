-- Stripe Connect + PayPal seller ids on admins; paid events point at recipient admin.

ALTER TABLE "admin_users" ADD COLUMN "stripe_connected_account_id" TEXT,
ADD COLUMN "stripe_connect_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paypal_merchant_id" TEXT,
ADD COLUMN "paypal_rest_client_id_enc" TEXT,
ADD COLUMN "paypal_rest_client_secret_enc" TEXT;

CREATE UNIQUE INDEX "admin_users_stripe_connected_account_id_key" ON "admin_users"("stripe_connected_account_id");

ALTER TABLE "CalendarEvent" ADD COLUMN "payment_account_admin_id" TEXT;

CREATE INDEX "CalendarEvent_payment_account_admin_id_idx" ON "CalendarEvent"("payment_account_admin_id");

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_payment_account_admin_id_fkey" FOREIGN KEY ("payment_account_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
