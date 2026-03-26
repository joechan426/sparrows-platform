"use client";

import { useEffect } from "react";

export default function StripeConnectRefreshPage() {
  useEffect(() => {
    // Refresh page may be used when Connect onboarding is incomplete.
    // Still send admins back to Payment profiles for status review.
    window.location.replace("/payment-profiles");
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 560 }}>
      <h1>Redirecting…</h1>
      <p>Returning to Payment profiles.</p>
    </main>
  );
}
