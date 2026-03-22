export default function PayPalConnectReturnPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 560 }}>
      <h1>PayPal</h1>
      <p>若 PayPal 顯示已完成，請回到管理後台確認 Merchant ID 是否已寫入；若沒有，請在 PayPal 商家後台複製 Merchant ID，並使用 API 更新設定。</p>
      <p style={{ opacity: 0.75, fontSize: 14 }}>
        After PayPal onboarding, confirm your merchant id is saved in admin settings (or PATCH{" "}
        <code>/api/admin-auth/me/payment-connections</code>).
      </p>
    </main>
  );
}
