(function (global) {
  function storageArea(area) {
    if (typeof browser !== 'undefined' && browser.storage && browser.storage[area]) {
      return browser.storage[area];
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) {
      return chrome.storage[area];
    }
    return null;
  }

  function lastErrorMessage() {
    const err =
      (typeof browser !== 'undefined' && browser.runtime && browser.runtime.lastError) ||
      (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError);
    return err ? err.message : null;
  }

  function storageGet(area, keys) {
    const store = storageArea(area);
    if (!store) {
      return Promise.resolve({});
    }
    return new Promise((resolve, reject) => {
      try {
        const maybe = store.get(keys);
        if (maybe && typeof maybe.then === 'function') {
          maybe.then((result) => resolve(result || {})).catch(reject);
          return;
        }
      } catch (_) {}
      try {
        store.get(keys, (result) => {
          const msg = lastErrorMessage();
          if (msg) {
            reject(new Error(msg));
          } else {
            resolve(result || {});
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageSet(area, items) {
    const store = storageArea(area);
    if (!store) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      try {
        const maybe = store.set(items);
        if (maybe && typeof maybe.then === 'function') {
          maybe.then(() => resolve()).catch(reject);
          return;
        }
      } catch (_) {}
      try {
        store.set(items, () => {
          const msg = lastErrorMessage();
          if (msg) {
            reject(new Error(msg));
          } else {
            resolve();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageRemove(area, keys) {
    const store = storageArea(area);
    if (!store) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      try {
        const maybe = store.remove(keys);
        if (maybe && typeof maybe.then === 'function') {
          maybe.then(() => resolve()).catch(reject);
          return;
        }
      } catch (_) {}
      try {
        store.remove(keys, () => {
          const msg = lastErrorMessage();
          if (msg) {
            reject(new Error(msg));
          } else {
            resolve();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function cookiesApi() {
    if (typeof browser !== 'undefined' && browser.cookies) return browser.cookies;
    if (typeof chrome !== 'undefined' && chrome.cookies) return chrome.cookies;
    return null;
  }

  function cookiesGetAll(details) {
    const api = cookiesApi();
    if (!api) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      try {
        const maybe = api.getAll(details);
        if (maybe && typeof maybe.then === 'function') {
          maybe.then((r) => resolve(r || [])).catch(reject);
          return;
        }
      } catch (_) {}
      try {
        api.getAll(details, (cookies) => {
          const msg = lastErrorMessage();
          if (msg) reject(new Error(msg));
          else resolve(cookies || []);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function isFirefoxExtensionRuntime() {
    return (
      typeof browser !== 'undefined' &&
      browser.runtime &&
      typeof browser.runtime.getBrowserInfo === 'function'
    );
  }

  function webRequestExtraInfoSpec(kind) {
    if (isFirefoxExtensionRuntime()) {
      return kind === 'response' ? ['responseHeaders'] : ['requestHeaders'];
    }
    return kind === 'response'
      ? ['responseHeaders', 'extraHeaders']
      : ['requestHeaders', 'extraHeaders'];
  }

  async function tabCookieStoreId(tabId) {
    if (tabId === undefined || tabId === null || tabId < 0) return undefined;
    try {
      const tabsApi = typeof browser !== 'undefined' && browser.tabs ? browser.tabs : chrome.tabs;
      const tab = await tabsApi.get(tabId);
      return tab && tab.cookieStoreId ? tab.cookieStoreId : undefined;
    } catch (_) {
      return undefined;
    }
  }

  async function buildCookieHeader(resourceUrl, refererUrl, tabId) {
    const storeId = await tabCookieStoreId(tabId);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 80));
      const seen = new Map();
      const candidates = [];
      const ref = typeof refererUrl === 'string' ? refererUrl.trim() : '';
      const res = typeof resourceUrl === 'string' ? resourceUrl.trim() : '';
      if (ref && ref.includes('://')) candidates.push(ref);
      if (res && res.includes('://') && res !== ref) candidates.push(res);
      for (const url of candidates) {
        const details = { url };
        if (storeId) details.storeId = storeId;
        try {
          const cookies = await cookiesGetAll(details);
          for (const c of cookies) {
            if (c && c.name && !seen.has(c.name)) seen.set(c.name, c.value || '');
          }
        } catch (e) {
          console.warn('[IFD] cookies.getAll failed:', url, e);
        }
      }
      if (seen.size) {
        return Array.from(seen.entries()).map(([n, v]) => `${n}=${v}`).join('; ');
      }
    }
    return '';
  }

  function decodeCommonFileNameEncodings(name) {
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

  function createContextMenuItem(def, logTag) {
    const tag = logTag || 'IFD';
    const id = def && def.id ? def.id : '(unknown)';
    return new Promise((resolve) => {
      try {
        const created = chrome.contextMenus.create(def, () => {
          const msg = lastErrorMessage();
          if (msg) {
            console.error(`[${tag}] contextMenus.create("${id}") failed:`, msg);
          }
          resolve();
        });
        if (created && typeof created.then === 'function') {
          created
            .then(() => resolve())
            .catch((e) => {
              console.error(`[${tag}] contextMenus.create("${id}") failed:`, e);
              resolve();
            });
        }
      } catch (e) {
        console.error(`[${tag}] contextMenus.create("${id}") failed:`, e);
        resolve();
      }
    });
  }

  let menuRebuildChain = Promise.resolve();

  function rebuildContextMenus(installItems, logTag) {
    const tag = logTag || 'IFD';
    menuRebuildChain = menuRebuildChain.then(
      () =>
        new Promise((resolve) => {
          const afterRemoveAll = () => {
            Promise.resolve()
              .then(() => installItems())
              .then(() => {
                console.info(`[${tag}] Context menus registered.`);
              })
              .catch((e) => {
                console.error(`[${tag}] Failed to create context menus:`, e);
              })
              .finally(() => resolve());
          };
          try {
            const cleared = chrome.contextMenus.removeAll();
            if (cleared && typeof cleared.then === 'function') {
              cleared.then(afterRemoveAll).catch((e) => {
                console.error(`[${tag}] contextMenus.removeAll failed:`, e);
                resolve();
              });
              return;
            }
          } catch (_) {}
          try {
            chrome.contextMenus.removeAll(() => {
              const msg = lastErrorMessage();
              if (msg) {
                console.error(`[${tag}] contextMenus.removeAll failed:`, msg);
              }
              afterRemoveAll();
            });
          } catch (e) {
            console.error(`[${tag}] createMenus failed:`, e);
            resolve();
          }
        })
    );
    menuRebuildChain.catch(() => {});
  }

  global.ifdStorageGet = storageGet;
  global.ifdStorageSet = storageSet;
  global.ifdStorageRemove = storageRemove;
  global.ifdIsFirefox = isFirefoxExtensionRuntime;
  global.ifdWebRequestExtraInfoSpec = webRequestExtraInfoSpec;
  global.ifdRebuildContextMenus = rebuildContextMenus;
  global.ifdCreateContextMenuItem = createContextMenuItem;
  global.ifdDecodeCommonFileNameEncodings = decodeCommonFileNameEncodings;
  global.ifdBuildCookieHeader = buildCookieHeader;
  global.ifdTabCookieStoreId = tabCookieStoreId;
})(typeof globalThis !== 'undefined' ? globalThis : window);
