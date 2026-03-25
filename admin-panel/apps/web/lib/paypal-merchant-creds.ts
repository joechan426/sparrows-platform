import { prisma } from "./prisma";
import { decryptString, encryptString } from "./secret-box";

export type PayPalMerchantRestCreds = {
  clientId: string;
  clientSecret: string;
};

export async function setAdminPayPalRestCreds(params: {
  adminId: string;
  clientId: string;
  clientSecret: string;
}) {
  const clientIdEnc = encryptString(params.clientId);
  const clientSecretEnc = encryptString(params.clientSecret);
  return prisma.adminUser.update({
    where: { id: params.adminId },
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

export async function clearAdminPayPalRestCreds(adminId: string) {
  return prisma.adminUser.update({
    where: { id: adminId },
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

export async function getEventRecipientPayPalRestCreds(calendarEventId: string): Promise<PayPalMerchantRestCreds | null> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: calendarEventId },
    select: {
      paymentAccountAdmin: {
        select: {
          paypalRestClientIdEnc: true,
          paypalRestClientSecretEnc: true,
        },
      },
    },
  });
  const row = event?.paymentAccountAdmin;
  if (!row?.paypalRestClientIdEnc || !row?.paypalRestClientSecretEnc) return null;
  return {
    clientId: decryptString(row.paypalRestClientIdEnc),
    clientSecret: decryptString(row.paypalRestClientSecretEnc),
  };
}

