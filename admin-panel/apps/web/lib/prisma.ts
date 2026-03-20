import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createRequire } from "module";

// PrismaClient named exports can vary across environments.
// Use `require` + `any` to avoid build-time type export mismatches.
const require = createRequire(import.meta.url);

// Reuse PrismaClient (and Pool) during HMR in development.
const globalForPrisma = globalThis as unknown as { prisma?: any; pool?: Pool };

let prismaSingleton: any | undefined;

export function getPrisma(): any {
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
    (() => {
      const { PrismaClient } = require("@prisma/client") as { PrismaClient: any };
      return new PrismaClient({
      adapter,
      log: ["error", "warn"],
      });
    })();

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
export const prisma = new Proxy({} as any, {
  get(_target, prop: string) {
    return (getPrisma() as Record<string, unknown>)[prop];
  },
});

