# IFD M3U8 捕获扩展

配合本机 [Internet File Downloader](https://app.zhi200bbs.com/apps/internetfiledownloader) 使用。在网页中查找 m3u8 链接、解析播放列表，并将选中项发送到桌面端。

## 目录

- `chromium/` — Chrome / Edge（Manifest V3）
- `firefox/` — Firefox（Manifest V2）
- `github/` — 隐私与发布说明

## 使用前准备

1. 安装并运行桌面端：https://app.zhi200bbs.com/apps/internetfiledownloader
2. 保持桌面端 **浏览器助手 / 桥接** 已开启（默认端口 **26519**）。

## 安装 — Google Chrome

1. 下载或克隆本仓库。
2. 打开 `chrome://extensions`。
3. 开启 **开发者模式**。
4. 点击 **加载已解压的扩展程序**，选择 **`chromium`** 文件夹。
5. 将扩展固定到工具栏。

## 安装 — Microsoft Edge

1. 下载或克隆本仓库。
2. 打开 `edge://extensions`。
3. 开启 **开发人员模式**。
4. 点击 **加载解压缩的扩展**，选择 **`chromium`** 文件夹。
5. 固定扩展。

## 安装 — Mozilla Firefox

1. 下载或克隆本仓库。
2. 打开 `about:debugging#/runtime/this-firefox`。
3. 点击 **临时载入附加组件…**，选择 **`firefox/manifest.json`**。
4. 退出 Firefox 后需重新载入（临时附加组件）。

> Chrome / Edge 使用 `chromium/`；Firefox 使用 `firefox/`。

## 使用方法

1. **选中捕获** — 选中含链接的文字 → 右键 → **从选中链接捕获 m3u8** → 勾选项目 → **下载**。
2. **单个链接** — 在 m3u8 链接上右键 → **使用 Internet File Downloader 下载此 m3u8**。
3. **页面面板** — 检测到流时，使用页面内面板发送。
4. **设置** — 桥接端口；可选 User-Agent、Cookie、Referer。

## 协议

GPL-3.0。见 [github/PRIVACY.md](github/PRIVACY.md)。

[README.md](README.md) — 其他语言
