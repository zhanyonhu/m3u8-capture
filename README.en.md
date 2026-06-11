# IFD M3U8 Capture

Companion extension for [Internet File Downloader](https://app.zhi200bbs.com/apps/internetfiledownloader). Find m3u8 links on web pages, parse playlists, and send selected items to the desktop app.

## Folders

- `chromium/` — Chrome / Edge (Manifest V3)  
- `firefox/` — Firefox (Manifest V2)  
- `github/` — privacy and publisher notes  

## Before you start

Install and run the desktop app: https://app.zhi200bbs.com/apps/internetfiledownloader  
Keep the **browser helper / bridge** enabled in the desktop app (default port **26519**).

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
4. The add-on is removed when Firefox exits; load it again after a restart.

## Usage

1. **Selection capture** — Select text with one or more links → right-click → **Capture m3u8 from selected links** → pick items → **Download**.  
2. **Single link** — Right-click an m3u8 link → **Download this m3u8 with Internet File Downloader**.  
3. **Live panel** — When the extension detects streams on a page, use the on-page panel to send items to the app.  
4. **Settings** — Bridge port; optional User-Agent, Cookie, and Referer when sending to the desktop app.

## License

GPL-3.0. See [github/PRIVACY.md](github/PRIVACY.md).

[README.md](README.md)
