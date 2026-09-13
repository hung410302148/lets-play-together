# 本機驗證紀錄

日期：2026-09-14（Asia/Taipei）。正式網站已發布至 GitHub Pages，後端使用 Firebase 專案 `lets-play-together-ffbc8`。

另已通過正式建置的 Manifest、service worker 啟用、首次安裝後离線外殼測試；私人 API 與圖片未加入快取。

| 驗證                                             | 結果               |
| ------------------------------------------------ | ------------------ |
| TypeScript + Vite production build               | 通過               |
| 遊戲狀態機單元測試                               | 8/8 通過           |
| Firebase Emulator 三位匿名玩家整合               | 通過               |
| Firestore 直接寫入／跨玩家投影／內部狀態讀取     | 正確拒絕           |
| 同時投票、鎖票、匿名票單、平手                   | 通過               |
| 私人任務與未公開作品                             | 對其他玩家不可讀   |
| Storage 越權、錯誤 MIME、超過 2 MB               | 正確拒絕           |
| 偽裝 JPEG 的實際內容                             | 伺服器解碼驗證拒絕 |
| 作品核准、公開、投票、結算與圖片刪除             | 通過               |
| 兩個隔離 Chrome context：桌面 1280px、手機 390px | 完整三模式流程通過 |
| 網址加入、刷新保留身分、離線／重連               | 通過               |
| 手機與桌面水平溢出、未處理頁面例外               | 未發現             |
| 正式 Auth、Functions、Firestore 與 Storage 流程   | 通過               |

瀏覽器測試自動產生 `evidence/desktop-entry.png`、`mobile-lobby.png`、`mobile-question-box.png`、`mobile-vote-result.png`、`mobile-photo-result.png`、`desktop-photo-host.png`；已視覺檢查桌面入口及手機照片頁。

測試環境：Windows、Node 24.15.0、Java 17、Firebase CLI 13.35.1、Auth/Firestore/Functions/Storage 模擬器，以及正式 Firebase 服務。正式測試房間在測試結束後由主持人流程關閉並清理。

限制：尚未測試真實 iOS／Android 裝置、正式排程清理與 App Check；開發相依套件尚有中等級稽核警示，高／嚴重等級已修補。小型房間投影架構的容量與正式部署設定詳見 README。
