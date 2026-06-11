# IFD M3U8 擷取擴充功能

搭配本機 [Internet File Downloader](https://app.zhi200bbs.com/apps/internetfiledownloader)。在網頁中尋找 m3u8 連結、解析播放清單，並將選取項目傳送到桌面版。

## 目錄

- `chromium/` — Chrome / Edge（Manifest V3）
- `firefox/` — Firefox（Manifest V2）
- `github/` — 隱私與發布說明

## 使用前準備

1. 安裝並執行桌面版：https://app.zhi200bbs.com/apps/internetfiledownloader
2. 保持 **瀏覽器助手 / 橋接** 已開啟（預設埠 **26519**）。

## 安裝 — Google Chrome

1. 下載或克隆本儲存庫。
2. 開啟 `chrome://extensions`。
3. 開啟 **開發人員模式**。
4. 點 **載入未封裝項目**，選擇 **`chromium`** 資料夾。
5. 釘選擴充功能。

## 安裝 — Microsoft Edge

1. 下載或克隆本儲存庫。
2. 開啟 `edge://extensions`。
3. 開啟 **開發人員模式**。
4. 點 **載入解壓縮的擴充功能**，選擇 **`chromium`**。
5. 釘選擴充功能。

## 安裝 — Mozilla Firefox

1. 下載或克隆本儲存庫。
2. 開啟 `about:debugging#/runtime/this-firefox`。
3. 點 **臨時載入附加元件…**，選擇 **`firefox/manifest.json`**。
4. 結束 Firefox 後需重新載入。

> Chrome / Edge 使用 `chromium/`；Firefox 使用 `firefox/`。

## 使用方法

1. **選取擷取** — 選取含連結的文字 → 右鍵 → **從選中連結捕獲 m3u8** → 勾選項目 → **下載**。
2. **單一連結** — 在 m3u8 連結上右鍵 → **使用 Internet File Downloader 下載此 m3u8**。
3. **頁面面板** — 偵測到串流時使用頁內面板。
4. **設定** — 橋接埠；可選 User-Agent、Cookie、Referer。

## 協議

GPL-3.0。見 [github/PRIVACY.md](github/PRIVACY.md)。

[README.md](README.md) — 其他語言
