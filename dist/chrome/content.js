// Content script (isolated world). Receives video URLs captured by
// injected.js, adds a download button to each tweet's action bar, and asks
// the background script to download the file on click.
(() => {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const MSG_SOURCE = 'x-video-dl';
  const BTN_CLASS = 'xvd-btn';

  // tweet id -> { id, screenName, videos: [mp4url, ...] }
  const mediaMap = new Map();

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== MSG_SOURCE || d.type !== 'media') return;
    for (const item of d.items) mediaMap.set(item.id, item);
  });

  // --- styles ---
  const style = document.createElement('style');
  style.textContent = `
    .${BTN_CLASS} {
      display: flex; align-items: center; justify-content: center;
      width: 34.75px; height: 34.75px; border-radius: 9999px;
      cursor: pointer; color: rgb(113, 118, 123);
      transition: background-color .2s, color .2s;
    }
    .${BTN_CLASS}:hover {
      background-color: rgba(29, 155, 240, .1);
      color: rgb(29, 155, 240);
    }
    .${BTN_CLASS}.xvd-ok  { color: rgb(0, 186, 124); }
    .${BTN_CLASS}.xvd-err { color: rgb(244, 33, 46); }
    .${BTN_CLASS} svg { width: 18.75px; height: 18.75px; fill: currentColor; }
  `;
  document.documentElement.appendChild(style);

  const ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 15.59l-5.3-5.3 1.42-1.42L11 11.76V2.5h2v9.26l2.88-2.89 1.42 1.42L12 15.59zM4 17.5h16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2z"/>' +
    '</svg>';

  function getTweetInfo(article) {
    // Normal timeline tweets: permalink is the <a> wrapping the <time>.
    for (const a of article.querySelectorAll('a[href*="/status/"]')) {
      if (a.querySelector('time')) {
        const m = (a.getAttribute('href') || '').match(/^\/([^/]+)\/status\/(\d+)/);
        if (m) return { screenName: m[1], id: m[2] };
      }
    }
    // The focused tweet on a /status/ page has no timestamp link.
    const m = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (m) return { screenName: m[1], id: m[2] };
    return null;
  }

  function hasVideo(article) {
    return !!article.querySelector(
      'video, [data-testid="videoPlayer"], [data-testid="videoComponent"]'
    );
  }

  function sanitize(name) {
    return name.replace(/[\\/:*?"<>|]/g, '_');
  }

  function flash(btn, ok) {
    const cls = ok ? 'xvd-ok' : 'xvd-err';
    btn.classList.add(cls);
    setTimeout(() => btn.classList.remove(cls), 1500);
  }

  async function onClick(article, btn) {
    const info = getTweetInfo(article);
    if (!info) return flash(btn, false);

    let item = mediaMap.get(info.id);
    if (!item || !item.videos || !item.videos.length) {
      // Not captured from the timeline API — ask the background script to
      // resolve it via the public syndication endpoint.
      try {
        item = await api.runtime.sendMessage({ type: 'resolve', id: info.id });
      } catch (e) {
        item = null;
      }
      if (item && item.videos && item.videos.length) mediaMap.set(info.id, item);
    }
    if (!item || !item.videos || !item.videos.length) return flash(btn, false);

    const name = item.screenName || info.screenName || 'x';
    item.videos.forEach((url, i) => {
      const suffix = item.videos.length > 1 ? `_${i + 1}` : '';
      api.runtime.sendMessage({
        type: 'download',
        url,
        filename: sanitize(`${name}_${info.id}${suffix}.mp4`),
      });
    });
    flash(btn, true);
  }

  function addButton(article) {
    if (article.querySelector('.' + BTN_CLASS)) return;
    if (!hasVideo(article)) return;
    const group = article.querySelector('div[role="group"]');
    if (!group) return;

    const btn = document.createElement('div');
    btn.className = BTN_CLASS;
    btn.title = '動画をダウンロード';
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', '動画をダウンロード');
    btn.innerHTML = ICON;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(article, btn);
    });
    group.appendChild(btn);
  }

  function scan() {
    for (const a of document.querySelectorAll('article[data-testid="tweet"]')) {
      addButton(a);
    }
  }

  let scheduled = false;
  const obs = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      scan();
    }, 300);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
