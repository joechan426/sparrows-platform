"use client";

import { useEffect } from "react";

export default function StripeConnectReturnPage() {
  useEffect(() => {
    // After completing Stripe Connect onboarding, bring admins back to
    // the Payment profiles list so they can verify the status.
    window.location.replace("/payment-profiles");
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 560 }}>
      <h1>Stripe</h1>
      <p>Redirecting back to Payment profiles…</p>
    </main>
  );
}
