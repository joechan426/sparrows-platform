import Stripe from "stripe";

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export function stripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;
}
