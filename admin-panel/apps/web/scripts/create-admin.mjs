/**
 * One-off script: create admin user (user name + random password).
 * Run from admin-panel/apps/web: node scripts/create-admin.mjs
 * Optional: ADMIN_USER_NAME=myuser (default: admin)
 * Requires: .env with DATABASE_URL, and migration already applied.
 */
import "dotenv/config";
import { randomFillSync } from "node:crypto";
import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;
const USER_NAME = process.env.ADMIN_USER_NAME || "admin";

// Min 8 chars, must include letter, digit, special (per admin password rules).
function randomPassword(length = 12) {
  const letters = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const special = "!@#$%^&*";
  const bytes = new Uint8Array(length);
  randomFillSync(bytes);
  let s = "";
  for (let i = 0; i < length; i++) s += letters[bytes[i] % letters.length];
  s = s.slice(0, -3) + digits[bytes[length - 3] % digits.length] + special[bytes[length - 2] % special.length] + letters[bytes[length - 1] % letters.length];
  return s;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Set it in .env and try again.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const password = randomPassword(12);
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const existing = await prisma.adminUser.findUnique({ where: { userName: USER_NAME } });
  if (existing) {
    await prisma.adminUser.update({
      where: { id: existing.id },
      data: { passwordHash, isActive: true },
    });
    console.log("Updated existing admin user.");
  } else {
    await prisma.adminUser.create({
      data: {
        userName: USER_NAME,
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
    });
    console.log("Created new admin user.");
  }

  console.log("\nUser name:", USER_NAME);
  console.log("Password: ", password);
  console.log("\nUse this to log in at the admin panel; change password after first login if you wish.\n");

  await prisma.$disconnect();
  pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
