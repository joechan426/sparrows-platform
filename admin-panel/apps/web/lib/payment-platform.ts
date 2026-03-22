import { prisma } from "./prisma";

const SETTINGS_ID = "default";

export async function getPaymentPlatformSettings() {
  let row = await prisma.paymentPlatformSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) {
    row = await prisma.paymentPlatformSettings.create({
      data: { id: SETTINGS_ID, stripeEnabled: false, paypalEnabled: false, squareEnabled: false },
    });
  }
  return row;
}

export async function updatePaymentPlatformSettings(data: {
  stripeEnabled?: boolean;
  paypalEnabled?: boolean;
  squareEnabled?: boolean;
}) {
  await getPaymentPlatformSettings();
  return prisma.paymentPlatformSettings.update({
    where: { id: SETTINGS_ID },
    data,
  });
}

/** Public base URL for return links (web app), e.g. https://sparrowsweb.netlify.app */
export function getCheckoutPublicBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_CHECKOUT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_WEB_APP_URL ||
    "";
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:3000";
}
