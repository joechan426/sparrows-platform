import { prisma } from "./prisma";
import { decryptString, encryptString } from "./secret-box";

export type PayPalMerchantRestCreds = {
  clientId: string;
  clientSecret: string;
};

export async function setPaymentProfilePayPalRestCreds(params: {
  paymentProfileId: string;
  clientId: string;
  clientSecret: string;
}) {
  const clientIdEnc = encryptString(params.clientId);
  const clientSecretEnc = encryptString(params.clientSecret);
  return prisma.paymentProfile.update({
    where: { id: params.paymentProfileId },
    data: {
      paypalRestClientIdEnc: clientIdEnc,
      paypalRestClientSecretEnc: clientSecretEnc,
    },
    select: {
      paypalRestClientIdEnc: true,
      paypalRestClientSecretEnc: true,
    },
  });
}

export async function clearPaymentProfilePayPalRestCreds(paymentProfileId: string) {
  return prisma.paymentProfile.update({
    where: { id: paymentProfileId },
    data: {
      paypalRestClientIdEnc: null,
      paypalRestClientSecretEnc: null,
    },
    select: {
      paypalRestClientIdEnc: true,
      paypalRestClientSecretEnc: true,
    },
  });
}

export async function getEventPaymentProfilePayPalRestCreds(
  calendarEventId: string,
): Promise<PayPalMerchantRestCreds | null> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: calendarEventId },
    select: {
      paymentProfile: {
        select: {
          paypalRestClientIdEnc: true,
          paypalRestClientSecretEnc: true,
        },
      },
    },
  });
  const row = event?.paymentProfile;
  if (!row?.paypalRestClientIdEnc || !row?.paypalRestClientSecretEnc) return null;
  return {
    clientId: decryptString(row.paypalRestClientIdEnc),
    clientSecret: decryptString(row.paypalRestClientSecretEnc),
  };
}
