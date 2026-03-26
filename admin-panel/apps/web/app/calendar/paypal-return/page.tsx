"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function PayPalReturnInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const app = sp.get("app") === "1";
  const canceled = sp.get("canceled") === "1";
  const orderId = sp.get("token")?.trim() || "";
  const [msg, setMsg] = useState<string>(canceled ? "PayPal checkout was canceled." : "Completing payment…");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (canceled || !orderId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/paypal/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled)
            setErr(typeof data.message === "string" ? data.message : "Could not complete PayPal payment");
          return;
        }
        if (!cancelled) {
          setMsg("Payment received. Your registration is pending manager approval.");
          // If opened from iOS app, deep-link back into the app.
          if (app) {
            window.location.replace("sparrows-app://profile?payment=1");
          } else {
            router.replace("/profile");
          }
        }
      } catch {
        if (!cancelled) setErr("Network error while capturing payment.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canceled, orderId]);

  if (canceled) {
    if (app) {
      window.location.replace("sparrows-app://profile?payment=canceled");
      return null;
    }
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Checkout canceled</h1>
        <p>You can close this window and try again from the app.</p>
      </main>
    );
  }

  if (!orderId) {
    if (app) {
      window.location.replace("sparrows-app://profile?payment=missing");
      return null;
    }
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Missing order</h1>
        <p>Return to the app to register again.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Thank you</h1>
      {err ? <p style={{ color: "crimson" }}>{err}</p> : <p>{msg}</p>}
      <p style={{ marginTop: 16, opacity: 0.8 }}>You may close this window.</p>
    </main>
  );
}

export default function PayPalReturnPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24, fontFamily: "system-ui" }}>
          <p>Loading…</p>
        </main>
      }
    >
      <PayPalReturnInner />
    </Suspense>
  );
}
