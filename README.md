# IFD M3U8 Capture

Companion extension for [Internet File Downloader](https://app.zhi200bbs.com/apps/internetfiledownloader). Find m3u8 links on web pages, parse playlists, and send selected items to the desktop app.

## Languages

| | |
|--|--|
| English | [README.en.md](README.en.md) |
| 简体中文 | [README.zh_CN.md](README.zh_CN.md) |
| 繁體中文 | [README.zh_TW.md](README.zh_TW.md) |
| Español … Filipino | [README.es.md](README.es.md) … [README.fil.md](README.fil.md) |
| Italiano | [README.it.md](README.it.md) |
| Português (Brasil) | [README.pt_BR.md](README.pt_BR.md) |

## Before you start

1. Install and run **Internet File Downloader** on your PC: https://app.zhi200bbs.com/apps/internetfiledownloader  
2. Keep the **browser helper / bridge** enabled (default port **26519**).

## Install — Google Chrome

1. Download or clone this repository.  
2. Open `chrome://extensions`.  
3. Enable **Developer mode**.  
4. Click **Load unpacked** and select the **`chromium`** folder.  
5. Pin the extension on the toolbar.

## Install — Microsoft Edge

1. Download or clone this repository.  
2. Open `edge://extensions`.  
3. Enable **Developer mode**.  
4. Click **Load unpacked** and select the **`chromium`** folder.  
5. Pin the extension.

## Install — Mozilla Firefox

1. Download or clone this repository.  
2. Open `about:debugging#/runtime/this-firefox`.  
3. Click **Load Temporary Add-on…** and select **`firefox/manifest.json`**.  
4. Reload after each Firefox restart (temporary add-on).

> Use `chromium/` for Chrome and Edge; `firefox/` for Firefox.

## Usage

1. Select text that contains one or more links → right-click → **Capture m3u8 from selected links** → choose items → **Download**.  
2. Right-click a single m3u8 link → **Download this m3u8 with Internet File Downloader**.  
3. Use the on-page panel when streams are detected on a page.  
4. Open extension **Settings** for bridge port and optional headers.

## License

GPL-3.0. See [github/PRIVACY.md](github/PRIVACY.md).
