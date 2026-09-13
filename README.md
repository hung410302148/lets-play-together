# 一起玩吧 · 通用活動遊戲平台

獨立的 React + TypeScript 手機優先專案。沿用「厭世會社」的奶油色、橘色、圓角、匿名問題與固定 PASS 互動，沒有修改原專案。三種遊戲共享房間、玩家、暱稱、留言、六種表情及動態通知。

## 本機啟動

需求：Node.js **22.12+**（本次實測 24.15）、Java **17+**。本機用 Firebase Emulator，不需 Firebase 帳號或正式金鑰；首次安裝及下載模擬器需網路。

在本資料夾開啟終端機：

```powershell
npm ci
npm --prefix functions ci
npm run emulators:fresh
```

保留終端機，另開一個終端機：

```powershell
npm run dev
```

開啟 **http://127.0.0.1:15173/**。使用一般視窗和無痕視窗（或 Chrome 與 Edge）代表兩位不同玩家；同一瀏覽器設定檔的多個分頁會共享匿名身分，不能當成不同玩家。

1. 第一個視窗輸入暱稱，建立房間。
2. 複製頂端六位房間代碼或房間網址，在第二個視窗加入。
3. 主持人選遊戲；所有玩家同步切換，不需重新加入。
4. 主持人可直接切換遊戲、移交主持權、移除玩家或關閉房間。

本機端點均綁定 loopback，避免影響其他專案：網站 15173、Auth 19099、Firestore 18080、Functions 15001、Storage 19199、Emulator UI 14000。**localhost 網址不能直接讓另一支手機加入**；本次完成標準為同一台電腦兩個瀏覽器。若之後要實機區網測試，須另外調整 emulator/Vite 的 host、防火牆和安全連線；本交付未開放區網或公開部署。

`npm run emulators:fresh` 不匯入舊資料。要保留本機測試資料，先在模擬器運行時執行 `npx firebase emulators:export ../../work/emulator-data --project demo-party`，停止後改用 `npm run emulators`，便會匯入並在正常關閉時匯出。勿突然關閉程序，以免來不及保存。

## 三種完整流程

### 聊聊箱

玩家可具名／匿名投稿，選擇自己、另一位玩家或大家一起聊。投稿後直接進入可抽題庫，減少主持人的操作負擔；主持人仍可隱藏、刪除、指定題目、恢復題目、標記已玩與隨機抽題。抽下一題會將上一題標記已玩，不會自動重抽回答過的題目。沒有可抽取題目時顯示空狀態。

PASS 按鈕固定存在，指定題目只有回答者或主持人可 PASS；開放題任何房內玩家可 PASS。PASS 後按鈕保留為停用狀態，仍可留言。題目和每則留言都有 LINE 式六表情選單；同一人每個目標只有一種反應，再點同一種可取消。留言可由本人或主持人刪除。

### 誰最棒

內建 12 題系統題庫；可只抽系統、只抽玩家投稿或混合。玩家投稿會直接加入可抽題庫。每題開始時固定本輪投票名單，晚加入者下一題才可投票；可在鎖票前改票。主持人鎖票後同時公布總票數、最高票、平手及只收到一票的「唯一選擇」。零票不會產生假贏家。

預設匿名，主持人也無法經由客戶端讀取票單。主持人可切換下一題是否公布具名票單；設定在題目開始時固定，不能在投票途中更改匿名承諾。跳題／重抽將舊題標記已玩，舊輪投票不能寫入新輪。

### 今日任務

主持人發布共同任務或對每位當時成員分配不同私人任務，指定投稿截止時間。私人內容只有本人與主持人可見，公開後才成為晚間作品展。共同任務支援後加入玩家。完成狀態公開，但不會提前公開作品圖片或說明。

每人每任務一份作品。支援原檔 ≤10 MB 的 JPEG/PNG/WebP；前端重新編碼為最長邊 1600px、≤2 MB JPEG，移除 EXIF／GPS 中繼資料。Storage 規則再次限制身分、路徑、格式、大小、截止；伺服器以 sharp 真正解碼 JPEG，拒絕偽裝內容和超限尺寸。

主持人審核核准／隱藏作品，按「截止並公開核准作品」進入晚間展覽。公開會立即截止，之後核准作品也會出現在展覽。展覽支援留言、表情及每人每任務一票，結算前可改票；結算後禁止投票。提供各任務作品排行與跨任務玩家總排行，同票並列。作品可由本人或主持人刪除，連同 Storage 物件移除；刪除／隱藏作品不計入排行。

## 架構與資料

所有變更透過 `functions/index.mjs` 的 authenticated callable `command`；`functions/engine.mjs` 是可單元測試的遊戲狀態機。伺服器使用 Firestore transaction 同步寫入狀態與每位玩家可見的投影，避免同時投票／鎖票的競態。客戶端使用 `onSnapshot` 即時訂閱自己的投影，沒有用 localStorage 假裝多人同步。

| 路徑                                         | 內容                                                    | 客戶端權限                           |
| -------------------------------------------- | ------------------------------------------------------- | ------------------------------------ |
| `internal/{code}`                            | 權威狀態、題目作者 UID、私人任務、原始票單、去重請求 ID | 完全禁止讀寫                         |
| `rooms/{code}`                               | 主持人、成員 UID、七天到期時間                          | 僅有效成員可 get，不可 list/write    |
| `rooms/{code}/views/{uid}`                   | 依角色裁剪後的完整遊戲畫面                              | 僅該成員可讀；不可寫                 |
| `rooms/{code}/access/{uid}_{missionId}`      | 圖片 owner、deadline、submitted、visible                | 僅 Storage rules 與伺服器使用        |
| Storage `rooms/{code}/{uid}/{missionId}.jpg` | 私人 JPEG                                               | 本人／主持人；公開核准後有效房員可讀 |

每房最多 40 人、250 題、500 則留言。任務權限項目最多 200（共同任務以 40 項估算），整份狀態最多 800 KB；超限會明確報錯。這是聚會規模的 transaction／投影實作，不是大型公開社群架構。每位玩家每 45 秒更新最近上線狀態；不宣稱精確在線人數。

匿名是「對房內玩家與主持人 UI 隱藏」，專案管理員仍有後端資料存取權。房間代碼是邀請憑證，不是密碼。被踢的匿名 UID 不能重新加入，且立即失去 Firestore／Storage 讀取權；清除瀏覽器資料後建立全新匿名身分無法從技術上判定為同一真人。

## 安全、刪除與保存

`firestore.rules` 預設拒絕寫入與跨玩家讀取；`storage.rules` 預設拒絕，限制圖片建立與下載。圖片用 authenticated `getBlob` 取得，沒有生成永久公開下載網址。Storage 物件不可覆寫；先刪舊作品才能重新投稿。

房間七天到期後規則立即拒絕讀寫。`cleanup` 排程每天刪除到期房間、所有子文件與該房間全部圖片（包括中途失敗的孤立上傳）。排程僅正式 Firebase 設定後運作，本機沒有自動排程，測試資料由模擬器重置／匯出管理。雲端刪除不是跨 Firestore/Storage 的原子交易；如果刪除物件當下失敗，前端顯示錯誤，最終由到期清理收回。正式上線前需設定 Storage CORS、排程權限、App Check／用量控管及帳務；本次未部署任何服務。

## 離線與安裝感

Anonymous Authentication 在同一瀏覽器保留身分；localStorage 只保存房間碼與暱稱。連線中斷時保留目前畫面並停用送出，重連後自動同步；不會偷偷補送已截止的投票。送出失敗會保留表單文字並顯示錯誤。打開不同房間連結會進入該房間的加入入口。

提供手機底部分頁、安全區間距、Web App Manifest、192/512 PNG 圖示與 production service worker。Service worker 只快取公開網站外殼與靜態 assets，不快取 Firebase 資料或私人照片。可安裝功能需瀏覽器支援與 localhost／HTTPS；離線外殼不代表離線可玩多人遊戲。Vite 開發模式不註冊 service worker。

## 驗證

```powershell
npm test
npm run build
# 先啟動 Firebase 模擬器：
npm run test:integration
# 再啟動網站，並安裝桌面 Chrome：
npm run test:browser
# 另開終端機 npm run preview，再執行正式版外殼測試：
npm run test:pwa
```

單元測試涵蓋主持人權限、踢人、審核、匿名投影、PASS、題目去重、票單保密、鎖票、平手、晚加入、私人任務、截止、留言反應與結算。整合測試使用三位真實 Emulator 匿名身分，驗證 Firestore/Storage 拒絕越權、並發投票、照片公開和刪除。雙瀏覽器測試使用兩個隔離 Chrome context，390px 手機與1280px 桌面，走完三種模式、重連、刷新和照片上傳；截圖在 `evidence/`。

使用鎖定依賴，已修正稽核中的高／嚴重等級項目；目前 Firebase CLI 與後端 Google 相依套件仍有中等級傳遞依賴警示。測試與本機交付已完成，未宣稱這些依賴沒有任何弱點。

## 日後連接正式 Firebase

`.env.example` 可複製為 `.env.local`；預設始終是 `demo-party` 模擬器。取得發布授權後，才建立獨立 Firebase 專案，開啟 Anonymous Auth、Firestore、Storage、Functions，填入專案設定並將 `VITE_USE_EMULATORS=false`。需一併設定 Functions、兩份規則、Storage CORS、匿名登入允許網域與每日清理排程。**不要沿用「厭世會社」正式資料庫或把此專案覆蓋到原站。**

官方參考：[Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)、[Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)、[Firestore rules](https://firebase.google.com/docs/firestore/security/rules-conditions)、[Storage Emulator](https://firebase.google.com/docs/emulator-suite/connect_storage)。
