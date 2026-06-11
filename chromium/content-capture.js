(function () {
  const PANEL_ID = 'ifd-m3u8-capture-panel';
  const LIST_ID = 'ifd-m3u8-capture-list';
  const seen = new Set();
  const SEL_PANEL_ID = 'ifd-m3u8-selection-panel';
  const SEL_LIST_ID = 'ifd-m3u8-selection-list';
  const SEL_PICK_ID = 'ifd-m3u8-selection-pick';
  const SEL_STATUS_ID = 'ifd-m3u8-selection-status';
  const selectionState = { pages: [], selectedKeys: new Set(), pickIndex: 0, items: [] };
  function t(key, fallback) {
    try {
      const s = chrome.i18n.getMessage(key);
      return s || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483647',
      'width:340px',
      'max-height:50vh',
      'overflow:auto',
      'background:#111827',
      'color:#fff',
      'border-radius:10px',
      'box-shadow:0 8px 24px rgba(0,0,0,.28)',
      'font-family:Segoe UI,Arial,sans-serif',
      'padding:10px 10px 8px',
      'display:none'
    ].join(';');

    const title = document.createElement('div');
    title.textContent = t('live_panel_title', 'Captured video file');
    title.style.cssText = 'font-size:13px;font-weight:600;margin-bottom:8px;';
    panel.appendChild(title);

    const list = document.createElement('div');
    list.id = LIST_ID;
    panel.appendChild(list);
    document.documentElement.appendChild(panel);
    return panel;
  }

  function addCapturedItem(item) {
    if (!item || !item.mediaUrl) return;
    if (seen.has(item.mediaUrl)) return;
    seen.add(item.mediaUrl);

    const panel = ensurePanel();
    const list = document.getElementById(LIST_ID);
    if (!list) return;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:space-between;margin:6px 0;padding:6px;background:rgba(255,255,255,.06);border-radius:8px;';

    const text = document.createElement('div');
    text.style.cssText = 'font-size:12px;line-height:1.4;word-break:break-all;flex:1;';
    text.textContent = item.filename || item.mediaUrl;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = t('live_download_btn', 'Download');
    btn.style.cssText = 'border:0;border-radius:7px;padding:6px 10px;background:#2563eb;color:#fff;cursor:pointer;font-size:12px;';
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await chrome.runtime.sendMessage({
          type: 'ifd_capture_download',
          url: item.mediaUrl,
          referer: item.referer || location.href,
          filename: item.filename || ''
        });
        startSentCooldown(btn, t('live_download_btn', 'Download'), t('live_sent_btn', 'Sent'));
      } catch (_) {
        btn.disabled = false;
        btn.textContent = t('live_download_btn', 'Download');
      }
    });

    row.appendChild(text);
    row.appendChild(btn);
    list.prepend(row);
    panel.style.display = 'block';
  }

  function ensureTsFilename(name) {
    const v = String(name || '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
    if (!v) return 'video.ts';
    if (/\.[a-z0-9]{1,6}$/i.test(v)) return v.replace(/\.[a-z0-9]{1,6}$/i, '.ts');
    return `${v}.ts`;
  }

  function startSentCooldown(button, restoreText, sentText) {
    if (!button) return;
    let remain = 5;
    button.disabled = true;
    button.textContent = `${sentText} (${remain}s)`;
    const timer = setInterval(() => {
      remain -= 1;
      if (remain <= 0) {
        clearInterval(timer);
        button.disabled = false;
        button.textContent = restoreText;
        return;
      }
      button.textContent = `${sentText} (${remain}s)`;
    }, 1000);
  }

  function ensureSelectionPanel() {
    let panel = document.getElementById(SEL_PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = SEL_PANEL_ID;
    panel.style.cssText = [
      'position:fixed', 'right:16px', 'top:16px', 'z-index:2147483647',
      'width:420px', 'max-height:70vh', 'overflow:auto', 'background:#0f172a',
      'color:#fff', 'border-radius:10px', 'box-shadow:0 8px 24px rgba(0,0,0,.28)',
      'font-family:Segoe UI,Arial,sans-serif', 'padding:10px', 'display:none'
    ].join(';');

    const title = document.createElement('div');
    title.textContent = t('selection_panel_title', 'M3U8 from selected links');
    title.style.cssText = 'font-size:13px;font-weight:600;margin-bottom:8px;';
    panel.appendChild(title);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;';

    const pickLabel = document.createElement('span');
    pickLabel.textContent = t('selection_pick_label', 'Pick per page');
    pickLabel.style.cssText = 'font-size:12px;opacity:.9;';
    controls.appendChild(pickLabel);

    const pick = document.createElement('select');
    pick.id = SEL_PICK_ID;
    pick.style.cssText = 'background:#1f2937;color:#fff;border:1px solid #334155;border-radius:6px;padding:4px 6px;font-size:12px;';
    for (let i = 1; i <= 5; i++) {
      const op = document.createElement('option');
      op.value = String(i - 1);
      op.textContent = t('selection_pick_n', `No.${i}`).replace('{n}', String(i));
      pick.appendChild(op);
    }
    pick.addEventListener('change', () => {
      selectionState.pickIndex = Math.max(0, Number(pick.value) || 0);
      renderSelectionItems();
    });
    controls.appendChild(pick);

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.textContent = t('selection_select_all', 'Select all');
    allBtn.style.cssText = 'border:0;border-radius:7px;padding:5px 8px;background:#334155;color:#fff;cursor:pointer;font-size:12px;';
    allBtn.addEventListener('click', () => {
      for (const it of selectionState.items) selectionState.selectedKeys.add(it.key);
      renderSelectionItems();
    });
    controls.appendChild(allBtn);

    const noneBtn = document.createElement('button');
    noneBtn.type = 'button';
    noneBtn.textContent = t('selection_clear_all', 'Clear');
    noneBtn.style.cssText = 'border:0;border-radius:7px;padding:5px 8px;background:#334155;color:#fff;cursor:pointer;font-size:12px;';
    noneBtn.addEventListener('click', () => {
      selectionState.selectedKeys.clear();
      renderSelectionItems();
    });
    controls.appendChild(noneBtn);

    const batchBtn = document.createElement('button');
    batchBtn.type = 'button';
    batchBtn.textContent = t('selection_batch_download', 'Batch download');
    batchBtn.style.cssText = 'border:0;border-radius:7px;padding:5px 8px;background:#2563eb;color:#fff;cursor:pointer;font-size:12px;';
    batchBtn.addEventListener('click', async () => {
      const picked = selectionState.items.filter((it) => selectionState.selectedKeys.has(it.key));
      if (!picked.length) return;
      if (batchBtn.disabled) return;
      const batchLabel = String(batchBtn.textContent || t('selection_batch_download', 'Batch download'));
      const sentLabel = t('capture_sent_btn', 'Sent');
      batchBtn.disabled = true;
      try {
        await chrome.runtime.sendMessage({ type: 'ifd_capture_batch_download', items: picked });
        startSentCooldown(batchBtn, batchLabel, sentLabel);
      } catch (_) {
        batchBtn.disabled = false;
        batchBtn.textContent = batchLabel;
      }
    });
    controls.appendChild(batchBtn);

    panel.appendChild(controls);
    const status = document.createElement('div');
    status.id = SEL_STATUS_ID;
    status.style.cssText = 'font-size:12px;opacity:.9;margin:4px 0 6px;';
    status.textContent = '';
    panel.appendChild(status);
    const list = document.createElement('div');
    list.id = SEL_LIST_ID;
    panel.appendChild(list);
    document.documentElement.appendChild(panel);
    return panel;
  }

  function closeSelectionPanel() {
    const panel = document.getElementById(SEL_PANEL_ID);
    if (panel) panel.style.display = 'none';
    selectionState.pages = [];
    selectionState.items = [];
    selectionState.selectedKeys.clear();
    selectionState.pickIndex = 0;
  }

  function buildSelectionItems() {
    const items = [];
    const idx = selectionState.pickIndex;
    for (let i = 0; i < selectionState.pages.length; i++) {
      const p = selectionState.pages[i] || {};
      const m3u8s = Array.isArray(p.m3u8s) ? p.m3u8s : [];
      if (!m3u8s.length) continue;
      if (idx >= m3u8s.length) continue;
      const use = idx;
      const url = String(m3u8s[use] || '').trim();
      if (!url) continue;
      const key = `${i}:${use}:${url}`;
      const pageTitle = String(p.pageTitle || '');
      items.push({
        key,
        url,
        pageTitle,
        referer: String(p.referer || location.href || ''),
        filename: ensureTsFilename(String(p.filenameHint || pageTitle || `video_${i + 1}`))
      });
    }
    return items;
  }

  function renderSelectionItems() {
    const list = document.getElementById(SEL_LIST_ID);
    if (!list) return;
    selectionState.items = buildSelectionItems();
    const validKeys = new Set(selectionState.items.map((it) => it.key));
    for (const k of Array.from(selectionState.selectedKeys)) {
      if (!validKeys.has(k)) selectionState.selectedKeys.delete(k);
    }
    if (!selectionState.selectedKeys.size) {
      for (const it of selectionState.items) selectionState.selectedKeys.add(it.key);
    }
    list.innerHTML = '';
    if (!selectionState.items.length) {
      const empty = document.createElement('div');
      empty.textContent = t('capture_no_items', 'No media items were found.');
      empty.style.cssText = 'font-size:12px;opacity:.85;padding:6px 0;';
      list.appendChild(empty);
      return;
    }
    for (const it of selectionState.items) {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:6px 0;padding:6px;background:rgba(255,255,255,.06);border-radius:8px;';
      const ck = document.createElement('input');
      ck.type = 'checkbox';
      ck.checked = selectionState.selectedKeys.has(it.key);
      ck.addEventListener('change', () => {
        if (ck.checked) selectionState.selectedKeys.add(it.key);
        else selectionState.selectedKeys.delete(it.key);
      });
      const text = document.createElement('div');
      text.style.cssText = 'font-size:12px;line-height:1.35;word-break:break-all;flex:1;';
      text.textContent = it.pageTitle ? `${it.pageTitle}\n${it.url}` : it.url;
      row.appendChild(ck);
      row.appendChild(text);
      list.appendChild(row);
    }
  }

  function showSelectionPanel(payload) {
    const panel = ensureSelectionPanel();
    if (payload && payload.reset) {
      selectionState.pages = Array.isArray(payload.pages) ? payload.pages : [];
      selectionState.pickIndex = 0;
      selectionState.selectedKeys.clear();
      const pick = document.getElementById(SEL_PICK_ID);
      if (pick) pick.value = '0';
    } else {
      selectionState.pages = Array.isArray(payload && payload.pages) ? payload.pages : selectionState.pages;
    }
    renderSelectionItems();
    panel.style.display = 'block';
  }

  function appendSelectionPage(page) {
    const panel = ensureSelectionPanel();
    panel.style.display = 'block';
    if (page && typeof page === 'object') selectionState.pages.push(page);
    const before = new Set(selectionState.items.map((it) => it.key));
    renderSelectionItems();
    const after = new Set(selectionState.items.map((it) => it.key));
    for (const k of after) {
      if (!before.has(k)) selectionState.selectedKeys.add(k);
    }
    renderSelectionItems();
  }

  function updateSelectionProbeStatus(payload) {
    const panel = ensureSelectionPanel();
    panel.style.display = 'block';
    const el = document.getElementById(SEL_STATUS_ID);
    if (!el) return;
    const status = String(payload && payload.status ? payload.status : '');
    const done = Number(payload && payload.done ? payload.done : 0);
    const total = Number(payload && payload.total ? payload.total : 0);
    if (status === 'start' || status === 'probing') {
      el.textContent = t('selection_probe_progress', 'Probing links... ({done}/{total})')
        .replace('{done}', String(done))
        .replace('{total}', String(total));
      return;
    }
    if (status === 'done') {
      el.textContent = t('selection_probe_done', 'Probe complete');
      return;
    }
    el.textContent = '';
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'ifd_live_m3u8_captured') {
      addCapturedItem(msg.item || null);
      return;
    }
    if (msg.type === 'ifd_show_selection_capture_panel') {
      showSelectionPanel(msg.payload || {});
      return;
    }
    if (msg.type === 'ifd_close_selection_capture_panel') {
      closeSelectionPanel();
      return;
    }
    if (msg.type === 'ifd_selection_capture_append') {
      appendSelectionPage(msg.payload ? msg.payload.page : null);
      return;
    }
    if (msg.type === 'ifd_selection_probe_progress') {
      updateSelectionProbeStatus(msg.payload || {});
      return;
    }
    if (msg.type === 'ifd_get_selected_links') {
      try {
        const sel = window.getSelection();
        const links = new Set();
        if (sel && sel.rangeCount > 0) {
          for (let i = 0; i < sel.rangeCount; i++) {
            const range = sel.getRangeAt(i);
            const frag = range.cloneContents();
            const as1 = frag.querySelectorAll ? frag.querySelectorAll('a[href]') : [];
            for (const a of as1) {
              const href = (a.getAttribute('href') || '').trim();
              if (!href) continue;
              try { links.add(new URL(href, location.href).toString()); } catch (_) {}
            }

            const root = range.commonAncestorContainer && range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
              ? range.commonAncestorContainer
              : range.commonAncestorContainer && range.commonAncestorContainer.parentElement
                ? range.commonAncestorContainer.parentElement
                : document.body;
            const as2 = root && root.querySelectorAll ? root.querySelectorAll('a[href]') : [];
            for (const a of as2) {
              try {
                if (!range.intersectsNode(a)) continue;
              } catch (_) {
                continue;
              }
              const href = (a.getAttribute('href') || '').trim();
              if (!href) continue;
              try { links.add(new URL(href, location.href).toString()); } catch (_) {}
            }
          }
        }
        const out = Array.from(links);
        return Promise.resolve({ links: out });
      } catch (_) {
        return Promise.resolve({ links: [] });
      }
    }
  });
})();
