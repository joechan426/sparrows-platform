/**
 * PayPal Orders v2 (server-side). Credentials from PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_MODE.
 */

export function paypalApiBase(): string {
  return process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

/**
 * JWT for partner acting on behalf of seller (required for many Orders v2 calls with payee.merchant_id).
 * @see https://developer.paypal.com/docs/multiparty/troubleshoot
 */
export function buildPayPalAuthAssertion(clientId: string, payerId: string): string {
  const enc = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header = enc({ alg: "none" });
  const payload = enc({ iss: clientId, payer_id: payerId });
  return `${header}.${payload}.`;
}

export async function getPayPalAccessToken(): Promise<string | null> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) return null;
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export type CreatePayPalOrderResult =
  | { ok: true; id: string; approveUrl: string }
  | { ok: false; httpStatus: number; paypalError: unknown };

export async function createPayPalOrder(params: {
  accessToken: string;
  clientId: string;
  currencyCode: string;
  value: string;
  customId: string;
  returnUrl: string;
  cancelUrl: string;
  /** Seller merchant id (PayPal Commerce / third-party). Funds go to this account. */
  payeeMerchantId?: string;
}): Promise<CreatePayPalOrderResult> {
  const unit: Record<string, unknown> = {
    amount: { currency_code: params.currencyCode, value: params.value },
    custom_id: params.customId,
  };
  if (params.payeeMerchantId) {
    unit.payee = { merchant_id: params.payeeMerchantId };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.accessToken}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (params.payeeMerchantId) {
    headers["PayPal-Auth-Assertion"] = buildPayPalAuthAssertion(params.clientId, params.payeeMerchantId);
  }

  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [unit],
      application_context: {
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
        user_action: "PAY_NOW",
      },
    }),
  });

  const rawText = await res.text().catch(() => "");
  let parsed: unknown = rawText;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { raw: rawText };
  }

  if (!res.ok) {
    return { ok: false, httpStatus: res.status, paypalError: parsed };
  }

  const order = parsed as {
    id?: string;
    links?: { href: string; rel: string; method?: string }[];
  };
  const id = order.id;
  if (!id) {
    return { ok: false, httpStatus: res.status || 500, paypalError: { message: "No order id", body: parsed } };
  }
  const approve =
    order.links?.find((l) => l.rel === "approve" && (!l.method || l.method === "GET")) ??
    order.links?.find((l) => l.rel === "payer-action");
  if (!approve?.href) {
    return { ok: false, httpStatus: 500, paypalError: { message: "No approve link", links: order.links } };
  }
  return { ok: true, id, approveUrl: approve.href };
}

export async function capturePayPalOrder(
  accessToken: string,
  orderId: string,
): Promise<{ status?: string; id?: string } | null> {
  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as { status?: string; id?: string };
}
