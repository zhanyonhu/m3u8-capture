(async function () {
  function t(key, fallback) {
    try {
      const s = chrome.i18n.getMessage(key);
      return s || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function getCaptureId() {
    const u = new URL(location.href);
    return u.searchParams.get('id') || '';
  }

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (typeof text === 'string') n.textContent = text;
    return n;
  }

  const title = document.getElementById('title');
  const desc = document.getElementById('desc');
  const list = document.getElementById('list');
  title.textContent = t('capture_page_title', 'M3U8 Media List');
  desc.textContent = t('capture_page_desc', 'Select an item and click download to send it to Internet File Downloader.');

  const id = getCaptureId();
  if (!id) {
    list.appendChild(el('div', 'empty', t('capture_missing_data', 'Capture data is missing. Please run capture again from the webpage.')));
    return;
  }

  const store = await ifdStorageGet('local', id);
  const payload = store[id];
  if (!payload || !Array.isArray(payload.items) || !payload.items.length) {
    list.appendChild(el('div', 'empty', t('capture_no_items', 'No media items were found.')));
    return;
  }

  for (const item of payload.items) {
    const card = el('div', 'card');
    const row = el('div', 'row');
    const left = el('div');
    const name = el('div', 'title', item.title || item.mediaUrl || '');
    left.appendChild(name);
    if (item.type) {
      const tag = el('span', 'tag', item.type);
      left.appendChild(tag);
    }
    const meta = el('div', 'meta', `${t('capture_source', 'Source')}: ${item.from || ''}`);
    left.appendChild(meta);
    row.appendChild(left);
    const btn = el('button', 'btn', t('capture_download_btn', 'Download'));
    if (!item.mediaUrl) btn.disabled = true;
    btn.addEventListener('click', async () => {
      if (!item.mediaUrl) return;
      btn.disabled = true;
      try {
        await chrome.runtime.sendMessage({
          type: 'ifd_capture_download',
          url: item.mediaUrl,
          referer: item.referer || payload.referer || '',
          filename: item.filename || ''
        });
        btn.textContent = t('capture_sent_btn', 'Sent');
      } catch (_) {
        btn.disabled = false;
      }
    });
    row.appendChild(btn);
    card.appendChild(row);
    const media = el('div', 'meta', item.mediaUrl || t('capture_parse_failed', 'Parse failed'));
    card.appendChild(media);
    list.appendChild(card);
  }
})();
