import crypto from "crypto";

type SecretBoxPayloadV1 = {
  v: 1;
  alg: "aes-256-gcm";
  iv: string; // base64
  tag: string; // base64
  data: string; // base64
};

function getKey(): Buffer {
  const raw = process.env.PAYPAL_CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("PAYPAL_CREDENTIALS_ENCRYPTION_KEY is not set");
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("PAYPAL_CREDENTIALS_ENCRYPTION_KEY must be base64");
  }
  if (key.length !== 32) {
    throw new Error("PAYPAL_CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}

export function encryptString(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: SecretBoxPayloadV1 = {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64"),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decryptString(enc: string): string {
  const key = getKey();
  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(Buffer.from(enc, "base64").toString("utf8"));
  } catch {
    throw new Error("Invalid encrypted payload");
  }
  const p = payloadRaw as Partial<SecretBoxPayloadV1>;
  if (p.v !== 1 || p.alg !== "aes-256-gcm" || !p.iv || !p.tag || !p.data) {
    throw new Error("Unsupported encrypted payload format");
  }
  const iv = Buffer.from(p.iv, "base64");
  const tag = Buffer.from(p.tag, "base64");
  const data = Buffer.from(p.data, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString("utf8");
}

