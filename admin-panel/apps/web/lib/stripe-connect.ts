import type Stripe from "stripe";
import { getCheckoutPublicBaseUrl } from "./payment-platform";

export function adminStripeConnectReturnUrls(): { returnUrl: string; refreshUrl: string } {
  const base = getCheckoutPublicBaseUrl();
  return {
    returnUrl: `${base}/admin/connect/stripe/return`,
    refreshUrl: `${base}/admin/connect/stripe/refresh`,
  };
}

export async function createStripeExpressAccount(
  stripe: Stripe,
  params: { adminUserId: string; email: string | null },
): Promise<Stripe.Account> {
  const country = (process.env.STRIPE_CONNECT_DEFAULT_COUNTRY || "AU").toUpperCase();
  return stripe.accounts.create({
    type: "express",
    country,
    email: params.email?.trim() || undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { adminUserId: params.adminUserId },
  });
}

export async function createStripeAccountOnboardingLink(
  stripe: Stripe,
  accountId: string,
): Promise<string | null> {
  const { returnUrl, refreshUrl } = adminStripeConnectReturnUrls();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}
