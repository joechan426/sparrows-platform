"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function CheckoutReturnInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const app = sp.get("app") === "1";
  const canceled = sp.get("canceled") === "1";
  const sessionId = sp.get("session_id");
  const [msg, setMsg] = useState<string>(canceled ? "Checkout was canceled." : "Confirming payment…");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (canceled || !sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stripe/verify-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setErr(typeof data.message === "string" ? data.message : "Could not verify payment");
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
        if (!cancelled) setErr("Network error while confirming payment.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canceled, sessionId]);

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

  if (!sessionId) {
    if (app) {
      window.location.replace("sparrows-app://profile?payment=missing");
      return null;
    }
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Missing session</h1>
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

export default function CheckoutReturnPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24, fontFamily: "system-ui" }}>
          <p>Loading…</p>
        </main>
      }
    >
      <CheckoutReturnInner />
    </Suspense>
  );
}
