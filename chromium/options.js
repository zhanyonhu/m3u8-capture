const bridgePortEl = document.getElementById('bridgePort');
const sendUaEl = document.getElementById('sendUa');
const sendCookieEl = document.getElementById('sendCookie');
const sendRefererEl = document.getElementById('sendReferer');
const statusEl = document.getElementById('status');

const DEFAULT_PORT = 26519;

function tr(key, fallback) {
  try {
    const s = chrome.i18n.getMessage(key);
    return s || fallback;
  } catch (_) {
    return fallback;
  }
}

function applyI18n() {
  document.title = tr('optionsTitle', 'IFD M3U8 Capture');
  document.getElementById('heading').textContent = tr('optionsBridgeHeading', 'Bridge settings');
  document.getElementById('intro').textContent = tr(
    'optionsBridgeIntro',
    'Set the same bridge port as the desktop app. Default is 26519.'
  );
  document.getElementById('labelBridgePort').textContent = tr('labelBridgePort', 'Bridge port');
  document.getElementById('hintBridgePort').textContent = tr(
    'hintBridgePort',
    'Must match the app Browser helper port. Default is 26519.'
  );
  document.getElementById('headingPrivacy').textContent = tr('headingPrivacy', 'Forwarded to the app');
  document.getElementById('introPrivacy').textContent = tr(
    'introPrivacy',
    'Optional. Only enable if a site requires the same browser identity or login cookies for the download.'
  );
  document.getElementById('labelSendUa').textContent = tr(
    'labelSendUa',
    'Include User-Agent when sending a download to the app'
  );
  document.getElementById('hintSendUa').textContent = tr(
    'hintSendUa',
    'Off by default. Turn on if the server rejects requests without a matching browser signature.'
  );
  document.getElementById('labelSendCookie').textContent = tr(
    'labelSendCookie',
    'Include cookies when sending a download to the app'
  );
  document.getElementById('hintSendCookie').textContent = tr(
    'hintSendCookie',
    'Off by default. Turn on for signed-in downloads. Data is sent only to the app on this computer.'
  );
  document.getElementById('labelSendReferer').textContent = tr(
    'labelSendReferer',
    'Include Referer when sending a download to the app'
  );
  document.getElementById('hintSendReferer').textContent = tr(
    'hintSendReferer',
    'On by default. Helps sites validate the request source.'
  );
  document.getElementById('hintApply').textContent = tr(
    'optionsBridgeHintApply',
    'Changes apply immediately after saving.'
  );
  document.getElementById('save').textContent = tr('btnSave', 'Save');
}

function normalizePort(raw) {
  const n = parseInt(String(raw || ''), 10);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return DEFAULT_PORT;
  return n;
}

async function loadMergedPrefs() {
  let sendUserAgent = false;
  let sendCookie = false;
  let sendReferer = false;
  let bridgePort = DEFAULT_PORT;

  const local = await chrome.storage.local.get(['ifd_m3u8_prefs', 'ifd_bridge_port']);
  let p = local.ifd_m3u8_prefs && typeof local.ifd_m3u8_prefs === 'object' ? local.ifd_m3u8_prefs : null;

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
      bridgePort = lp ?? sp ?? DEFAULT_PORT;
      await chrome.storage.local.set({
        ifd_m3u8_prefs: { sendUserAgent, sendCookie, sendReferer, bridgePort },
        ifd_bridge_port: bridgePort
      });
      return { sendUserAgent, sendCookie, sendReferer, bridgePort };
    }
  }

  if (typeof p.sendUserAgent === 'boolean') sendUserAgent = p.sendUserAgent;
  if (typeof p.sendCookie === 'boolean') sendCookie = p.sendCookie;
  if (typeof p.sendReferer === 'boolean') sendReferer = p.sendReferer;
  let bp = Number(p.bridgePort);
  if (!(Number.isInteger(bp) && bp >= 1 && bp <= 65535)) {
    const lp =
      Number.isInteger(local.ifd_bridge_port) && local.ifd_bridge_port >= 1 && local.ifd_bridge_port <= 65535
        ? local.ifd_bridge_port
        : null;
    bp = lp ?? DEFAULT_PORT;
  }
  bridgePort = bp;
  return { sendUserAgent, sendCookie, sendReferer, bridgePort };
}

async function persistPrefs(prefs) {
  await chrome.storage.local.set({
    ifd_m3u8_prefs: prefs,
    ifd_bridge_port: prefs.bridgePort
  });
  try {
    await chrome.storage.sync.set({ ifd_m3u8_prefs: prefs, ifd_bridge_port: prefs.bridgePort });
  } catch (_) {}
  try {
    await chrome.runtime.sendMessage({ type: 'ifd_settings_changed' });
  } catch (_) {}
}

applyI18n();

loadMergedPrefs()
  .then((prefs) => {
    bridgePortEl.value = String(prefs.bridgePort);
    sendUaEl.checked = !!prefs.sendUserAgent;
    sendCookieEl.checked = !!prefs.sendCookie;
    sendRefererEl.checked = !!prefs.sendReferer;
  })
  .catch(() => {
    bridgePortEl.value = String(DEFAULT_PORT);
  });

document.getElementById('save').addEventListener('click', async () => {
  const prefs = {
    bridgePort: normalizePort(bridgePortEl.value),
    sendUserAgent: !!sendUaEl.checked,
    sendCookie: !!sendCookieEl.checked,
    sendReferer: !!sendRefererEl.checked
  };
  bridgePortEl.value = String(prefs.bridgePort);
  try {
    await persistPrefs(prefs);
    statusEl.textContent = tr('statusSaved', 'Saved');
    setTimeout(() => {
      statusEl.textContent = '';
    }, 2000);
  } catch (_) {
    statusEl.textContent = tr('statusSaveError', 'Could not save settings. Try again.');
    setTimeout(() => {
      statusEl.textContent = '';
    }, 3000);
  }
});
