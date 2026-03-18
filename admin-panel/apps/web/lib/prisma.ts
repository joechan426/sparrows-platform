import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Reuse PrismaClient (and Pool) during HMR in development.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pool?: Pool;
};

let prismaSingleton: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (prismaSingleton) return prismaSingleton;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Please configure it in your .env file.");
  }

  const pool =
    globalForPrisma.pool ??
    new Pool({
      connectionString,
    });

  const adapter = new PrismaPg(pool);

  const client =
    globalForPrisma.prisma ??
    new PrismaClient({
      adapter,
      log: ["error", "warn"],
    });

  prismaSingleton = client;

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.pool = pool;
  }

  return client;
}

/**
 * Lazy proxy: getPrisma() is only called on first property access.
 * This avoids running DB init (and DATABASE_URL check) when the module is
 * merely loaded during Next.js build (e.g. "Collecting page data") where
 * env may be unavailable. Fails only at request time when DB is actually used.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string) {
    return (getPrisma() as unknown as Record<string, unknown>)[prop];
  },
});

