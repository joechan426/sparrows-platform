export default function StripeConnectRefreshPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 560 }}>
      <h1>繼續 Stripe 設定</h1>
      <p>請從管理後台再次開啟「連接 Stripe」以繼續未完成步驟。</p>
      <p style={{ opacity: 0.75, fontSize: 14 }}>
        Re-open Stripe Connect from the admin panel to continue onboarding.
      </p>
    </main>
  );
}
