export default function StripeConnectReturnPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 560 }}>
      <h1>Stripe</h1>
      <p>若已完成帳戶設定，你可以關閉此頁並回到管理後台。</p>
      <p style={{ opacity: 0.75, fontSize: 14 }}>
        If onboarding finished, you can close this tab and return to the admin panel.
      </p>
    </main>
  );
}
