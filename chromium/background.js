importScripts('ifd-storage-bridge.js');

const IFD_PROTOCOL_PREFIX = 'InternetFileDownloader://adddownload?d=';
const IFD_DEFAULT_BRIDGE_PORT = 26519;
const IFD_BRIDGE_HOST_CANDIDATES = ['127.0.0.1', 'localhost'];
const DEFAULT_M3U8_PREFS = {
  sendUserAgent: false,
  sendCookie: false,
  sendReferer: false,
  bridgePort: IFD_DEFAULT_BRIDGE_PORT
};
let IFD_BRIDGE_PORT = IFD_DEFAULT_BRIDGE_PORT;
let IFD_SEND_USER_AGENT = false;
let IFD_SEND_COOKIE = false;
let IFD_SEND_REFERER = false;
const PROBE_TIMEOUT_MS = 15000;
const PROBE_COMPLETE_GRACE_MS = 3000;
const LIVE_ITEMS_PER_TAB_LIMIT = 20;

const g_probeSessions = new Map();
const g_liveCapturedByTab = new Map();
let g_lastContextTabId = -1;
let g_settingsLoadPromise = null;

function t(key, fallback) {
  try {
    const s = chrome.i18n.getMessage(key);
    return s || fallback;
  } catch (_) {
    return fallback;
  }
}

function debugLog() {}

function isM3u8Url(url) {
  return !!url && /\.m3u8(?:$|\?)/i.test(url);
}

function isIgnoredM3u8Request(details) {
  const t0 = details && typeof details.type === 'string' ? details.type : '';
  return t0 === 'main_frame' || t0 === 'sub_frame';
}

function decodeCommonFileNameEncodings(name) {
  if (typeof ifdDecodeCommonFileNameEncodings === 'function') {
    return ifdDecodeCommonFileNameEncodings(name);
  }
  if (!name || typeof name !== 'string') return '';
  let s = name.trim();
  if (!s) return '';
  if (s.includes('%')) s = s.replace(/\+/g, ' ');
  for (let i = 0; i < 3; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(s)) break;
    try {
      const next = decodeURIComponent(s);
      if (next === s) break;
      s = next;
    } catch (_) {
      break;
    }
  }
  return s;
}

function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return '';
  return decodeCommonFileNameEncodings(name)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function stripSiteSuffixFromTitle(title) {
  if (!title) return '';
  let t0 = String(title).trim();
  t0 = t0.replace(/\s*[\[\(（【].{0,30}?[\]\)）】]\s*$/g, '').trim();
  const parts = t0.split(/\s*[-|_·]\s*/g).map((s) => s.trim()).filter(Boolean);
  let core = parts.length ? parts[0] : t0;
  core = core
    .replace(/\s*(在线观看|免費在線觀看|在线播放|線上看|高清|超清|完整版|全集|电影|影片|视频)\s*$/gi, '')
    .trim();
  return core || t0;
}

function ensureTsFilename(name) {
  const cleaned = sanitizeFilename(name || '');
  if (!cleaned) return 'video.ts';
  if (/\.[a-z0-9]{1,6}$/i.test(cleaned)) return cleaned.replace(/\.[a-z0-9]{1,6}$/i, '.ts');
  return `${cleaned}.ts`;
}

function deriveFilenameFromUrl(url, fallbackBase) {
  try {
    const u = new URL(url);
    const raw = u.pathname.split('/').pop() || '';
    let decoded = raw;
    try { decoded = decodeURIComponent(raw); } catch (_) {}
    decoded = sanitizeFilename(decoded);
    if (decoded) return decoded;
  } catch (_) {}
  const fallback = sanitizeFilename(fallbackBase || 'video');
  return ensureTsFilename(fallback || 'video');
}

function deriveFilenameFromPageTitle(pageTitle, urlFallback) {
  const core = stripSiteSuffixFromTitle(pageTitle || '');
  if (core) return ensureTsFilename(core);
  return deriveFilenameFromUrl(urlFallback, 'video');
}

function utf8BytesToBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function makeRequestId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return `ifd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shrinkHeadersForProtocol(url, headers, filename, requestId) {
  const baseHeaders = { ...(headers || {}) };
  let json = JSON.stringify({ url, headers: baseHeaders, filename: filename || '', requestId: requestId || '' });
  const maxJson = 48000;
  if (json.length <= maxJson) return json;
  const slim = {};
  for (const k of ['User-Agent', 'Referer', 'Cookie']) {
    if (baseHeaders[k]) slim[k] = baseHeaders[k];
  }
  return JSON.stringify({ url, headers: slim, filename: filename || '', requestId: requestId || '' });
}

async function postAddDownloadToLocalBridge(url, headers, filename, requestId) {
  const payload = {
    url,
    headers: { ...(headers || {}) },
    filename: filename || '',
    requestId: requestId || ''
  };
  const body = JSON.stringify(payload);
  const ports = [];
  ports.push(IFD_BRIDGE_PORT);
  if (IFD_BRIDGE_PORT !== IFD_DEFAULT_BRIDGE_PORT) ports.push(IFD_DEFAULT_BRIDGE_PORT);
  for (const host of IFD_BRIDGE_HOST_CANDIDATES) {
    for (const port of ports) {
      try {
        const resp = await fetch(`http://${host}:${port}/addDownload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          cache: 'no-store'
        });
        if (resp && resp.ok) return true;
      } catch (_) {}
    }
  }
  return false;
}

async function postBatchToLocalBridge(itemsPayload, batchRequestId) {
  const body = JSON.stringify({
    items: Array.isArray(itemsPayload) ? itemsPayload : [],
    requestId: batchRequestId || ''
  });
  const ports = [];
  ports.push(IFD_BRIDGE_PORT);
  if (IFD_BRIDGE_PORT !== IFD_DEFAULT_BRIDGE_PORT) ports.push(IFD_DEFAULT_BRIDGE_PORT);
  for (const host of IFD_BRIDGE_HOST_CANDIDATES) {
    for (const port of ports) {
      try {
        const resp = await fetch(`http://${host}:${port}/addDownload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          cache: 'no-store'
        });
        if (resp && resp.ok) return true;
      } catch (_) {}
    }
  }
  return false;
}

async function loadM3u8Settings() {
  IFD_SEND_USER_AGENT = false;
  IFD_SEND_COOKIE = false;
  IFD_SEND_REFERER = false;
  IFD_BRIDGE_PORT = IFD_DEFAULT_BRIDGE_PORT;
  try {
    const local = await chrome.storage.local.get(['ifd_m3u8_prefs', 'ifd_bridge_port']);
    let p = local.ifd_m3u8_prefs && typeof local.ifd_m3u8_prefs === 'object' ? local.ifd_m3u8_prefs : null;
    let needPersist = false;
    if (!p) {
      const sync = await chrome.storage.sync.get(['ifd_m3u8_prefs', 'ifd_bridge_port']);
      const fromSync = sync.ifd_m3u8_prefs && typeof sync.ifd_m3u8_prefs === 'object' ? sync.ifd_m3u8_prefs : null;
      if (fromSync) {
        p = fromSync;
      } else {
        const lp =
          Number.isInteger(local.ifd_bridge_port) && local.ifd_bridge_port >= 1 && local.ifd_bridge_port <= 65535
            ? local.ifd_bridge_port
            : null;
        const sp =
          Number.isInteger(sync.ifd_bridge_port) && sync.ifd_bridge_port >= 1 && sync.ifd_bridge_port <= 65535
            ? sync.ifd_bridge_port
            : null;
        const port = lp ?? sp ?? IFD_DEFAULT_BRIDGE_PORT;
        p = { sendUserAgent: false, sendCookie: false, sendReferer: false, bridgePort: port };
        needPersist = true;
      }
    }
    if (typeof p.sendUserAgent === 'boolean') IFD_SEND_USER_AGENT = p.sendUserAgent;
    if (typeof p.sendCookie === 'boolean') IFD_SEND_COOKIE = p.sendCookie;
    IFD_SEND_REFERER = typeof p.sendReferer === 'boolean' ? p.sendReferer : false;
    let bp = Number(p.bridgePort);
    if (!(Number.isInteger(bp) && bp >= 1 && bp <= 65535)) {
      const lp =
        Number.isInteger(local.ifd_bridge_port) && local.ifd_bridge_port >= 1 && local.ifd_bridge_port <= 65535
          ? local.ifd_bridge_port
          : null;
      bp = lp ?? IFD_DEFAULT_BRIDGE_PORT;
      needPersist = true;
    }
    IFD_BRIDGE_PORT = bp;
    if (needPersist) {
      const merged = {
        sendUserAgent: IFD_SEND_USER_AGENT,
        sendCookie: IFD_SEND_COOKIE,
        sendReferer: IFD_SEND_REFERER,
        bridgePort: IFD_BRIDGE_PORT
      };
      await chrome.storage.local.set({ ifd_m3u8_prefs: merged, ifd_bridge_port: IFD_BRIDGE_PORT });
    }
  } catch (_) {
    IFD_BRIDGE_PORT = IFD_DEFAULT_BRIDGE_PORT;
    IFD_SEND_USER_AGENT = false;
    IFD_SEND_COOKIE = false;
    IFD_SEND_REFERER = false;
  }
}

async function cookieHeaderForUrl(url) {
  if (!url) return '';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 80));
    try {
      const cookies = await chrome.cookies.getAll({ url });
      if (cookies && cookies.length) {
        return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      }
    } catch (_) {}
  }
  return '';
}

async function buildOutboundHeadersForUrl(url, referer) {
  const headers = {};
  if (IFD_SEND_REFERER && referer && typeof referer === 'string') headers.Referer = referer;
  if (IFD_SEND_USER_AGENT) {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (ua) headers['User-Agent'] = ua;
  }
  if (IFD_SEND_COOKIE) {
    const cookieScopeUrl =
      (IFD_SEND_REFERER && referer && typeof referer === 'string' && referer.includes('://')) ? referer : url;
    if (cookieScopeUrl) {
      const cookieHeader = await cookieHeaderForUrl(cookieScopeUrl);
      if (cookieHeader) headers.Cookie = cookieHeader;
    }
  }
  return headers;
}

function ensureM3u8SettingsLoaded(forceReload = false) {
  if (forceReload) g_settingsLoadPromise = null;
  if (!g_settingsLoadPromise) {
    g_settingsLoadPromise = loadM3u8Settings().finally(() => {
      g_settingsLoadPromise = null;
    });
  }
  return g_settingsLoadPromise;
}

async function openProtocolViaEphemeralTab(proto) {
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
  if (!tab || typeof tab.id !== 'number') throw new Error('Failed to create temporary tab');
  await chrome.tabs.update(tab.id, { url: proto, active: false });
}

async function sendDownloadToAppViaProtocol(url, headers, filename) {
  const requestId = makeRequestId();
  if (await postAddDownloadToLocalBridge(url, headers, filename, requestId)) return;
  const json = shrinkHeadersForProtocol(url, headers, filename, requestId);
  const d = utf8BytesToBase64Url(json);
  const proto = IFD_PROTOCOL_PREFIX + encodeURIComponent(d);
  const maxTotal = 8000;
  if (proto.length > maxTotal) throw new Error('Protocol URL too long');
  await openProtocolViaEphemeralTab(proto);
}

async function sendBatchDownloadToAppViaProtocol(items) {
  const raw = Array.isArray(items) ? items : [];
  const normalized = [];
  for (const it of raw) {
    const url = it && typeof it.url === 'string' ? it.url.trim() : '';
    if (!url) continue;
    const baseHeaders = it && typeof it.headers === 'object' && it.headers ? it.headers : {};
    const ref = typeof baseHeaders.Referer === 'string' ? baseHeaders.Referer : '';
    const optHeaders = await buildOutboundHeadersForUrl(url, ref);
    const headers = { ...baseHeaders, ...optHeaders };
    const filename = it && typeof it.filename === 'string' ? it.filename : '';
    normalized.push({ url, headers, filename });
  }
  if (!normalized.length) return;

  const batchRequestId = makeRequestId();
  const payloadItems = normalized.map((it) => ({
    ...it,
    customHeaders: Object.entries(it.headers || {})
      .filter(([k]) => typeof k === 'string' && k.trim())
      .map(([k, v]) => `${k}: ${v == null ? '' : String(v)}`)
  }));

  if (await postBatchToLocalBridge(payloadItems, batchRequestId)) return;

  const bridgeFailed = [];
  for (const it of normalized) {
    const itemRid = makeRequestId();
    const ok = await postAddDownloadToLocalBridge(it.url, it.headers, it.filename, itemRid);
    if (!ok) bridgeFailed.push(it);
  }
  if (!bridgeFailed.length) return;

  const protocolRid = makeRequestId();
  let protoPayloadItems = bridgeFailed.map((it) => ({ ...it }));
  let json = JSON.stringify({ items: protoPayloadItems, requestId: protocolRid });
  let d = utf8BytesToBase64Url(json);
  let proto = IFD_PROTOCOL_PREFIX + encodeURIComponent(d);
  if (proto.length > 8000) {
    protoPayloadItems = protoPayloadItems.map((it0) => {
      const hdr = { ...(it0.headers || {}) };
      delete hdr.Cookie;
      return { ...it0, headers: hdr };
    });
    json = JSON.stringify({ items: protoPayloadItems, requestId: protocolRid });
    d = utf8BytesToBase64Url(json);
    proto = IFD_PROTOCOL_PREFIX + encodeURIComponent(d);
  }
  const maxTotal = 8000;
  if (proto.length > maxTotal) throw new Error('Protocol URL too long');
  await openProtocolViaEphemeralTab(proto);
}

function extractUrlsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  const unique = [];
  const seen = new Set();
  for (const raw of matches) {
    const trimmed = raw.replace(/[),.;!?]+$/g, '');
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

async function getSelectedLinksFromTab(tabId) {
  if (typeof tabId !== 'number' || tabId < 0) return [];
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'ifd_get_selected_links' });
    if (!resp || !Array.isArray(resp.links)) return [];
    const unique = [];
    const seen = new Set();
    for (const raw of resp.links) {
      const u = (raw || '').trim();
      if (!u || seen.has(u)) continue;
      seen.add(u);
      unique.push(u);
    }
    return unique;
  } catch (_) {
    return [];
  }
}

function parseMasterVariantMeta(line) {
  const meta = {};
  if (!line) return meta;
  const bw = line.match(/BANDWIDTH=(\d+)/i);
  const res = line.match(/RESOLUTION=([0-9x]+)/i);
  if (bw) meta.bandwidth = Number(bw[1]) || 0;
  if (res) meta.resolution = res[1];
  return meta;
}

function resolveM3u8Ref(baseUrl, ref) {
  try {
    return new URL(ref, baseUrl).toString();
  } catch (_) {
    return '';
  }
}

async function notifyContentScriptM3u8Found(tabId, m3u8Url, referer) {
  if (typeof tabId !== 'number' || tabId < 0) return;
  let urlSet = g_liveCapturedByTab.get(tabId);
  if (!urlSet) {
    urlSet = new Set();
    g_liveCapturedByTab.set(tabId, urlSet);
  }
  if (urlSet.has(m3u8Url)) return;
  if (urlSet.size >= LIVE_ITEMS_PER_TAB_LIMIT) return;
  urlSet.add(m3u8Url);

  let tabTitle = '';
  try {
    const tab = await chrome.tabs.get(tabId);
    tabTitle = (tab && typeof tab.title === 'string') ? tab.title : '';
  } catch (_) {}
  const item = {
    mediaUrl: m3u8Url,
    referer: referer || '',
    filename: deriveFilenameFromPageTitle(tabTitle, m3u8Url)
  };
  chrome.tabs.sendMessage(tabId, { type: 'ifd_live_m3u8_captured', item }).catch(() => {});
}

function handleNetworkRequestCapture(details) {
  const reqUrl = details && details.url ? details.url : '';
  if (!isM3u8Url(reqUrl)) return;
  if (isIgnoredM3u8Request(details)) return;

  const referer = details.initiator || details.documentUrl || '';
  if (typeof details.tabId === 'number' && details.tabId >= 0) {
    notifyContentScriptM3u8Found(details.tabId, reqUrl, referer);
  }

  const session = g_probeSessions.get(details.tabId);
  if (session) {
    if (!session.found.has(reqUrl)) {
      session.found.add(reqUrl);
      session.foundOrdered.push(reqUrl);
    }
  }
}

chrome.webRequest.onBeforeRequest.addListener(
  handleNetworkRequestCapture,
  { urls: ['<all_urls>'] },
  []
);

function stopProbeSession(tabId) {
  const session = g_probeSessions.get(tabId);
  if (!session) return [];
  if (session.timeoutHandle) clearTimeout(session.timeoutHandle);
  g_probeSessions.delete(tabId);
  return Array.from(session.foundOrdered || []);
}

chrome.tabs.onRemoved.addListener((tabId) => {
  g_liveCapturedByTab.delete(tabId);
  const session = g_probeSessions.get(tabId);
  if (session && session.finalize) session.finalize();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const session = g_probeSessions.get(tabId);
  if (!session) return;
  if (changeInfo.status === 'complete') {
    setTimeout(() => {
      const s = g_probeSessions.get(tabId);
      if (s && s.finalize) s.finalize();
    }, PROBE_COMPLETE_GRACE_MS);
  }
});

function probeM3u8ByBackgroundTab(pageUrl, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise(async (resolve) => {
    let tabId = -1;
    let pageTitle = '';
    let finalized = false;
    const finalize = async () => {
      if (finalized) return;
      finalized = true;
      try {
        if (tabId >= 0) {
          const tab = await chrome.tabs.get(tabId);
          pageTitle = (tab && typeof tab.title === 'string') ? tab.title : pageTitle;
        }
      } catch (_) {}
      const found = stopProbeSession(tabId);
      if (tabId >= 0) chrome.tabs.remove(tabId).catch(() => {});
      resolve({ found, pageTitle });
    };

    try {
      const tab = await chrome.tabs.create({ url: pageUrl, active: false });
      tabId = typeof tab.id === 'number' ? tab.id : -1;
      pageTitle = (tab && typeof tab.title === 'string') ? tab.title : '';
      if (tabId < 0) {
        resolve({ found: [], pageTitle: '' });
        return;
      }
      const timeoutHandle = setTimeout(() => { finalize(); }, timeoutMs);
      g_probeSessions.set(tabId, { found: new Set(), foundOrdered: [], timeoutHandle, finalize });
    } catch (_) {
      resolve({ found: [], pageTitle: '' });
    }
  });
}

async function fetchM3u8MediaCandidates(url) {
  const resp = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  let pendingVariant = null;
  for (const line of lines) {
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      pendingVariant = parseMasterVariantMeta(line.substring('#EXT-X-STREAM-INF:'.length));
      continue;
    }
    if (line.startsWith('#')) continue;
    const abs = resolveM3u8Ref(url, line);
    if (!abs) continue;
    if (pendingVariant) {
      out.push({
        source: abs,
        type: 'variant',
        title: pendingVariant.resolution
          ? `${pendingVariant.resolution}${pendingVariant.bandwidth ? ` • ${Math.round(pendingVariant.bandwidth / 1000)} kbps` : ''}`
          : (pendingVariant.bandwidth ? `${Math.round(pendingVariant.bandwidth / 1000)} kbps` : abs)
      });
      pendingVariant = null;
    } else {
      out.push({ source: abs, type: 'media', title: abs });
    }
  }
  if (!out.length) out.push({ source: url, type: 'media', title: url });
  return out;
}

async function openCaptureList(selectionText, refererUrl, selectedLinks) {
  const urls = [];
  const seen = new Set();
  const pushUrl = (u) => {
    const v = (u || '').trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    urls.push(v);
  };
  for (const u of (selectedLinks || [])) pushUrl(u);
  for (const u of extractUrlsFromText(selectionText)) pushUrl(u);
  const directM3u8Urls = urls.filter((u) => isM3u8Url(u));
  const pageUrls = urls.filter((u) => !isM3u8Url(u));
  const pages = [];
  const totalProbePages = pageUrls.length;
  let probedPages = 0;
  try {
    await chrome.tabs.sendMessage(g_lastContextTabId, { type: 'ifd_close_selection_capture_panel' });
    await chrome.tabs.sendMessage(g_lastContextTabId, { type: 'ifd_show_selection_capture_panel', payload: { reset: true, pages: [] } });
  } catch (_) {}
  try {
    await chrome.tabs.sendMessage(g_lastContextTabId, {
      type: 'ifd_selection_probe_progress',
      payload: { status: 'start', done: 0, total: totalProbePages }
    });
  } catch (_) {}

  for (const m3u8 of directM3u8Urls) {
    const page = {
      pageUrl: m3u8,
      pageTitle: '',
      referer: refererUrl || '',
      m3u8s: [m3u8],
      filenameHint: deriveFilenameFromPageTitle('', m3u8)
    };
    pages.push(page);
    try {
      await chrome.tabs.sendMessage(g_lastContextTabId, { type: 'ifd_selection_capture_append', payload: { page } });
    } catch (_) {}
  }

  for (const pageUrl of pageUrls) {
    const result = await probeM3u8ByBackgroundTab(pageUrl);
    const discovered = result.found || [];
    const pageTitle = result.pageTitle || '';
    probedPages += 1;
    try {
      await chrome.tabs.sendMessage(g_lastContextTabId, {
        type: 'ifd_selection_probe_progress',
        payload: { status: 'probing', done: probedPages, total: totalProbePages, currentUrl: pageUrl }
      });
    } catch (_) {}
    if (!discovered.length) continue;
    const page = {
      pageUrl,
      pageTitle,
      referer: refererUrl || '',
      m3u8s: discovered,
      filenameHint: deriveFilenameFromPageTitle(pageTitle, pageUrl)
    };
    pages.push(page);
    try {
      await chrome.tabs.sendMessage(g_lastContextTabId, { type: 'ifd_selection_capture_append', payload: { page } });
    } catch (_) {}
  }

  if (!pages.length) {
    throw new Error(t('capture_no_m3u8_found', 'No m3u8 links found from selected links or their page requests.'));
  }
  try {
    await chrome.tabs.sendMessage(g_lastContextTabId, {
      type: 'ifd_selection_probe_progress',
      payload: { status: 'done', done: totalProbePages, total: totalProbePages }
    });
  } catch (err) {
    throw err;
  }
}

function storageLocalSet(obj) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(obj, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

function createMenus() {
  if (!chrome.contextMenus) return;
  ifdRebuildContextMenus(async () => {
    await ifdCreateContextMenuItem({
      id: 'ifd-download-m3u8-link',
      title: t('ctx_download_m3u8_link', 'Download this m3u8 with Internet File Downloader'),
      contexts: ['link'],
      targetUrlPatterns: ['*://*/*.m3u8*']
    }, 'M3U8');
    await ifdCreateContextMenuItem({
      id: 'ifd-capture-m3u8-link',
      title: t('ctx_capture_m3u8_link', 'Capture m3u8 from this link'),
      contexts: ['link']
    }, 'M3U8');
    await ifdCreateContextMenuItem({
      id: 'ifd-capture-m3u8-selection',
      title: t('ctx_capture_m3u8_selection', 'Capture m3u8 from selected links'),
      contexts: ['selection']
    }, 'M3U8');
  }, 'M3U8');
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    storageLocalSet({
      ifd_m3u8_prefs: { ...DEFAULT_M3U8_PREFS },
      ifd_bridge_port: IFD_DEFAULT_BRIDGE_PORT
    }).catch(() => {});
  }
  createMenus();
  ensureM3u8SettingsLoaded(true);
});
chrome.runtime.onStartup.addListener(() => {
  ensureM3u8SettingsLoaded(true);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  (async () => {
    await ensureM3u8SettingsLoaded();
    if (info.menuItemId === 'ifd-download-m3u8-link' && info.linkUrl) {
      const referer = (tab && tab.url) ? tab.url : '';
      const filename = deriveFilenameFromUrl(info.linkUrl, 'video');
      const headers = await buildOutboundHeadersForUrl(info.linkUrl, referer);
      await sendDownloadToAppViaProtocol(info.linkUrl, headers, filename);
      return;
    }
    if (info.menuItemId === 'ifd-capture-m3u8-selection') {
      const selected = info.selectionText || '';
      const referer = (tab && tab.url) ? tab.url : '';
      g_lastContextTabId = tab && typeof tab.id === 'number' ? tab.id : -1;
      const selectedLinks = await getSelectedLinksFromTab(tab && typeof tab.id === 'number' ? tab.id : -1);
      await openCaptureList(selected, referer, selectedLinks);
    }
    if (info.menuItemId === 'ifd-capture-m3u8-link' && info.linkUrl) {
      const referer = (tab && tab.url) ? tab.url : '';
      g_lastContextTabId = tab && typeof tab.id === 'number' ? tab.id : -1;
      await openCaptureList('', referer, [info.linkUrl]);
    }
  })().catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'ifd_settings_changed') {
    ensureM3u8SettingsLoaded(true);
    return;
  }
  if (msg.type === 'ifd_capture_download' && msg.url) {
    (async () => {
      await ensureM3u8SettingsLoaded();
      const ref = msg.referer && typeof msg.referer === 'string' ? msg.referer : '';
      const headers = await buildOutboundHeadersForUrl(msg.url, ref);
      const finalFilename = sanitizeFilename(msg.filename || '') || deriveFilenameFromUrl(msg.url, 'video');
      await sendDownloadToAppViaProtocol(msg.url, headers, finalFilename);
    })();
  }
  if (msg.type === 'ifd_capture_batch_download' && Array.isArray(msg.items)) {
    (async () => {
      await ensureM3u8SettingsLoaded();
      const items = [];
      for (const it of msg.items) {
        const url = it && typeof it.url === 'string' ? it.url.trim() : '';
        if (!url) continue;
        const referer = it && typeof it.referer === 'string' ? it.referer : '';
        const headers = await buildOutboundHeadersForUrl(url, referer);
        const titleHint = it && typeof it.pageTitle === 'string' ? it.pageTitle : '';
        const finalFilename = sanitizeFilename(it && it.filename ? it.filename : '') || deriveFilenameFromPageTitle(titleHint, url);
        items.push({ url, headers, filename: finalFilename });
      }
      if (items.length) {
        await sendBatchDownloadToAppViaProtocol(items);
      }
      sendResponse({ ok: true });
    })().catch((e) => {
      sendResponse({ ok: false, error: e && e.message ? e.message : 'batch_failed' });
    });
    return true;
  }
});

ensureM3u8SettingsLoaded();
