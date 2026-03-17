/**
 * Admin password rules: min 8 chars, at least one letter, one digit, one special character.
 */
const MIN_LENGTH = 8;
const HAS_LETTER = /[a-zA-Z]/;
const HAS_DIGIT = /\d/;
const HAS_SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

export function validateAdminPassword(password: string): { ok: true } | { ok: false; message: string } {
  const t = password.trim();
  if (t.length < MIN_LENGTH) return { ok: false, message: "Password must be at least 8 characters" };
  if (!HAS_LETTER.test(t)) return { ok: false, message: "Password must contain at least one letter" };
  if (!HAS_DIGIT.test(t)) return { ok: false, message: "Password must contain at least one digit" };
  if (!HAS_SPECIAL.test(t)) return { ok: false, message: "Password must contain at least one special character (e.g. !@#$%^&*)" };
  return { ok: true };
}
