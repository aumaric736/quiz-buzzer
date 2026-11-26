# 課堂搶答系統

大學軟體工程期末專題。提供教師建立課堂活動、匯入 Guided Notes、控制搶答階段，以及讓學生以組別加入並提交答案。搶答結束後，學生可查看各題勝出組別與答案；教師可檢視完整作答紀錄，並預覽將答案寫回 Google Sheets。

本專題以本機模擬為目標。預設 API 綁定 `127.0.0.1`，其他電腦或手機無法直接連線；在同一台電腦上可用不同瀏覽器或瀏覽器個人資料模擬教師與學生。

## 技術

- 前端：React、TypeScript、Vite、Tailwind CSS
- 後端：Node.js、Express、TypeScript、WebSocket
- 資料庫：SQLite
- 測試：Vitest
- Guided Notes：Google Sheets API

## 本機需求

- Node.js `22.12` 或更新版本
- npm

## 安裝與啟動

在 Windows PowerShell 開啟專案根目錄：

```powershell
Set-Location "$env:USERPROFILE\Documents\quiz-buzzer2"
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

`.env` 是本機設定檔，已列入 `.gitignore`。若 `.env` 已存在，請勿覆蓋；保留既有設定即可。

開兩個 PowerShell 視窗，並在兩個視窗都切換到專案根目錄。

視窗一啟動 API：

```powershell
npm.cmd run dev --workspace=server
```

視窗二啟動前端：

```powershell
npm.cmd run dev --workspace=client
```

在瀏覽器開啟 Vite 顯示的網址，預設為 <http://127.0.0.1:5173/>。`http://127.0.0.1:3000/` 是 API 服務，不提供前端首頁。

## Google Sheets 設定

使用 Guided Notes 前，請在 Google Cloud 啟用 Google Sheets API、建立服務帳號與 JSON 金鑰，並只在本機 `.env` 設定：

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=服務帳號的client_email
GOOGLE_PRIVATE_KEY="服務帳號JSON中的private_key"
```

不要將 `.env`、服務帳號 JSON 或私鑰提交至 GitHub。把 Guided Notes 試算表分享給服務帳號：匯入至少需要檢視權限，寫回答案需要編輯權限。更新 `.env` 後請重啟後端。

## 測試與建置

```powershell
npm.cmd test
npm.cmd run build
```

## 教師登入帳號密碼

預設帳號為`teacher`
預設密碼為`0000`
詳細資訊請參考`.env.example`，須設定至`.env`才可啟動服務

## 專案設計文件

- 功能規格、規劃、任務及驗收步驟位於 [`specs/`](./specs/)。
- PlantUML 原始圖與 PNG 圖位於 [`diagrams/`](./diagrams/)。
- 第三方套件與授權來源記錄於 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。
