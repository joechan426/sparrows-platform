import { getPayPalAccessToken, paypalApiBase } from "./paypal-server";
import { getCheckoutPublicBaseUrl } from "./payment-platform";

/**
 * PayPal Partner Referrals — seller completes onboarding in PayPal; you store paypal_merchant_id on AdminUser.
 * Requires a PayPal partner/business app (same PAYPAL_CLIENT_ID / SECRET as platform).
 */
export async function createPayPalPartnerReferralLink(trackingId: string): Promise<string | null> {
  const token = await getPayPalAccessToken();
  if (!token) return null;

  const base = getCheckoutPublicBaseUrl();
  const returnUrl = `${base}/admin/connect/paypal/return`;

  const body = {
    tracking_id: trackingId,
    partner_config_override: {
      return_url: returnUrl,
      return_url_description: "Return to Sparrows admin",
    },
    operations: [
      {
        operation: "API_INTEGRATION",
        api_integration_preference: {
          rest_api_integration: {
            integration_method: "PAYPAL",
            integration_type: "THIRD_PARTY",
            third_party_details: {
              features: ["PAYMENT", "REFUND"],
            },
          },
        },
      },
    ],
    products: ["EXPRESS_CHECKOUT"],
    legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
  };

  const res = await fetch(`${paypalApiBase()}/v2/customer/partner-referrals`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn("PayPal partner-referrals failed:", res.status, errText);
    return null;
  }

  const data = (await res.json()) as {
    links?: { href: string; rel: string; method?: string }[];
  };
  const action = data.links?.find((l) => l.rel === "action_url" && (!l.method || l.method === "GET"));
  return action?.href ?? null;
}
