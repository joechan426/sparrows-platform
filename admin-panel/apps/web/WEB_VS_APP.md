# Web 版與 Sparrows App 的差異說明

## 已盡量與 App 一致的部分

- **顏色與風格**：白底、黑字、Sparrows 綠 (`#007333`)、狀態膠囊（Pending 深灰、Approved 綠、Waiting list 橙、Rejected 紅）、What happens NEXT 黃橙漸層與邊框。
- **排版順序**：首頁 → 登入/註冊（Login | Register 分段，無 Apple）；My Profile（Logo + Hello/My account → My Next Sparrows Events → My Sparrows History 連結 → Scoreboard → Sparrows News → Contact Us）；Calendar（Events on date → What happens NEXT）；活動詳情彈窗；My Scheduled Events / My Sparrows History 列表。
- **表單與按鈕**：圓角輸入框、主要按鈕綠色、Log out 紅色、次要按鈕邊框樣式；登入/註冊同一頁用分段切換（與 App 的 My account 一致），**網頁版取消 Apple 登入**。
- **狀態顯示**：已報名活動在 Calendar 與 What happens NEXT 顯示狀態膠囊，不顯示 Register 按鈕。

---

## 無法與 App 完全一致的地方

1. **導覽列位置**  
   App 為底部 Tab Bar（Shop、Videos、Calendar、Ongoing Tournament、My Profile）；網頁版改為**頂部導覽**，因瀏覽器沒有固定底部 Tab 的慣例，且需放「Log out」等動作，頂部較適合。

2. **Logo 圖片**  
   App 使用 `Image("SparrowsLogo")` 資源；網頁版目前用文字「Sparrows」代替，因未將同一個 logo 圖檔加入 web 專案。若日後提供 logo 檔，可替換為 `<img>` 或背景圖。

3. **Scoreboard**  
   App 可橫向旋轉使用 Scoreboard；網頁版不支援裝置旋轉與同一套 Scoreboard UI，因此改為說明「Use the app for the Scoreboard.」。

4. **Sparrows News**  
   App 內嵌 MyProfileNewsPreviewSection（RSS/預覽）；網頁版改為「Sparrows News」區塊 + 「More News」按鈕連到 https://sparrowsvolleyball.com.au/news ，沒有內嵌預覽。

5. **Contact Us**  
   App 用 `ContactLogoIcon`（Volleyball / Pickleball 圖）與 `openURL(instagram://...)`；網頁版改為文字連結連到 Instagram 網頁版，沒有 app 專用圖示與 `instagram://` 協定。

6. **日曆選日**  
   App 有月曆格點、選日、依所選日期篩選「Events on &lt;date&gt;」；網頁版目前「Events on &lt;date&gt;」固定為**今天**的日期標題，列表為所有即將舉行的活動（未做依日篩選）。若要做成與 App 一樣的選日與篩選，需再實作月曆 UI 與狀態。

7. **Pull-to-refresh**  
   App 在 My Profile、Calendar 等可下拉重新整理；網頁版未做下拉手勢，需用重整頁面或未來加「重新整理」按鈕。

8. **字體**  
   App 使用系統字體；網頁使用 `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`，視平台可能與 App 略有差異。

---

## 網頁版刻意不同或更適合的做法

1. **頂部導覽**  
   在網頁上頂部導覽比底部 Tab 更常見，且方便放「Log out」與多個連結，不需像 App 限制在 5 個 Tab。

2. **單一登入頁 + 分段**  
   登入與註冊放在同一頁用分段切換（Login | Register），與 App 的 My account 未登入時一致；另保留獨立 `/register` 路由方便直接分享註冊連結。

3. **Contact Us 用網頁連結**  
   網頁無法開啟 `instagram://`，改連 Instagram 網頁版，在桌面與手機瀏覽器都可使用。

4. **無 Apple Sign In**  
   依需求在網頁版取消 Apple 登入，僅保留 email + 密碼，與「與 App 一致但移除 Apple」相符。

5. **My Sparrows History 獨立頁**  
   App 用 NavigationLink 推入新頁；網頁版用獨立路由 `/history`，行為對應，且符合網頁多頁面與書籤習慣。
