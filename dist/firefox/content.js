// Content script (isolated world). Receives media URLs captured by
// injected.js and adds three kinds of download button:
//   1. the tweet's action bar  -> every video and image in that tweet
//   2. each image, on hover    -> that one image, at full size
//   3. a floating button       -> shown while media is maximized (the media
//                                 viewer overlay or native fullscreen), where
//                                 the action bar is not reachable
// Clicking asks the background script to perform the download.
(() => {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const MSG_SOURCE = 'x-video-dl';
  const BTN_CLASS = 'xvd-btn';
  const IMG_BTN_CLASS = 'xvd-img-btn';
  const FLOAT_CLASS = 'xvd-float';

  // tweet id -> { id, screenName, videos: [mp4url, ...], photos: [imgurl, ...] }
  const mediaMap = new Map();

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== MSG_SOURCE || d.type !== 'media') return;
    for (const item of d.items) remember(item);
  });

  // The same tweet can arrive from several endpoints, each carrying only part
  // of the picture (a timeline payload may omit what a detail payload has).
  function remember(item) {
    if (!item || !item.id) return;
    const id = String(item.id);
    const prev = mediaMap.get(id);
    mediaMap.set(id, {
      id,
      screenName: item.screenName || (prev && prev.screenName) || null,
      videos: pickList(item.videos, prev && prev.videos),
      photos: pickList(item.photos, prev && prev.photos),
    });
  }

  function pickList(next, prev) {
    if (next && next.length) return next;
    return (prev && prev.length) ? prev : [];
  }

  function hasMedia(item) {
    return !!item && ((item.videos && item.videos.length) || (item.photos && item.photos.length));
  }

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

    .${IMG_BTN_CLASS} {
      position: absolute; top: 8px; right: 8px; z-index: 2;
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 9999px;
      cursor: pointer; color: #fff;
      background-color: rgba(0, 0, 0, .6);
      opacity: 0; transition: opacity .15s, background-color .2s;
    }
    .xvd-img-host:hover .${IMG_BTN_CLASS},
    .${IMG_BTN_CLASS}:focus { opacity: 1; }
    .${IMG_BTN_CLASS}:hover { background-color: rgba(29, 155, 240, .9); }
    .${IMG_BTN_CLASS}.xvd-ok  { background-color: rgba(0, 186, 124, .9); opacity: 1; }
    .${IMG_BTN_CLASS}.xvd-err { background-color: rgba(244, 33, 46, .9); opacity: 1; }
    .${IMG_BTN_CLASS} svg { width: 18px; height: 18px; fill: currentColor; }
    @media (hover: none) { .xvd-img-host .${IMG_BTN_CLASS} { opacity: 1; } }

    .${FLOAT_CLASS} {
      position: fixed; top: 64px; right: 16px; z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; border-radius: 9999px;
      cursor: pointer; color: #fff;
      background-color: rgba(0, 0, 0, .6);
      transition: background-color .2s;
    }
    .${FLOAT_CLASS}:hover { background-color: rgba(29, 155, 240, .9); }
    .${FLOAT_CLASS}.xvd-ok  { background-color: rgba(0, 186, 124, .9); }
    .${FLOAT_CLASS}.xvd-err { background-color: rgba(244, 33, 46, .9); }
    .${FLOAT_CLASS} svg { width: 22px; height: 22px; fill: currentColor; }
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
    return pathInfo();
  }

  function pathInfo() {
    const m = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    return m ? { screenName: m[1], id: m[2] } : null;
  }

  function hasVideo(article) {
    return !!article.querySelector(
      'video, [data-testid="videoPlayer"], [data-testid="videoComponent"]'
    );
  }

  // Tweet photos live under pbs.twimg.com/media/; video posters and avatars
  // use other paths, so they never match. Quoted tweets sit inside a
  // role="link" card and belong to a different tweet id.
  function photoImages(root, includeQuoted) {
    const out = [];
    for (const img of root.querySelectorAll('img[src*="pbs.twimg.com/media/"]')) {
      if (!includeQuoted && img.closest('div[role="link"]')) continue;
      out.push(img);
    }
    return out;
  }

  // pbs.twimg.com serves scaled variants; "name=orig" is the original upload.
  // "4096x4096" is the largest scaled one and acts as the fallback for the
  // few uploads that do not serve an original.
  function imageVariants(raw) {
    if (!raw) return null;
    let u;
    try {
      u = new URL(raw, location.href);
    } catch (e) {
      return null;
    }
    const key = u.pathname.match(/^\/media\/([^/.:]+)/);
    if (!key) return null;
    const pathExt = u.pathname.match(/^\/media\/[^/.:]+\.(\w+)/);
    let fmt = (u.searchParams.get('format') || (pathExt && pathExt[1]) || 'jpg').toLowerCase();
    if (fmt === 'jpeg') fmt = 'jpg';
    const base = 'https://pbs.twimg.com/media/' + key[1] + '?format=' + fmt + '&name=';
    return { url: base + 'orig', fallbackUrl: base + '4096x4096', ext: fmt };
  }

  function toVariants(urls) {
    const out = [];
    for (const raw of urls || []) {
      const v = imageVariants(raw);
      if (v && !out.some((o) => o.url === v.url)) out.push(v);
    }
    return out;
  }

  function sanitize(name) {
    return name.replace(/[\\/:*?"<>|]/g, '_');
  }

  function flash(btn, ok) {
    const cls = ok ? 'xvd-ok' : 'xvd-err';
    btn.classList.add(cls);
    setTimeout(() => btn.classList.remove(cls), 1500);
  }

  function requestDownload(url, filename, fallbackUrl) {
    api.runtime.sendMessage({ type: 'download', url, filename, fallbackUrl: fallbackUrl || null });
  }

  function makeButton(cls, label, onActivate) {
    const btn = document.createElement('div');
    btn.className = cls;
    btn.title = label;
    btn.tabIndex = 0;
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', label);
    btn.innerHTML = ICON;
    // X binds its own handlers on the surrounding link/card, so every event
    // that could trigger navigation has to stop here.
    const swallow = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    for (const type of ['mousedown', 'pointerdown', 'auxclick']) {
      btn.addEventListener(type, swallow);
    }
    // preventDefault on touchstart would cancel the emulated click, so on
    // touch devices only the propagation is stopped.
    btn.addEventListener('touchstart', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => {
      swallow(e);
      onActivate(btn);
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      swallow(e);
      onActivate(btn);
    });
    return btn;
  }

  // Resolves every video and image of a tweet, falling back to the public
  // syndication endpoint and then to whatever is already in the DOM.
  async function resolveMedia(info, domRoot) {
    let item = mediaMap.get(info.id);
    if (!hasMedia(item)) {
      try {
        item = await api.runtime.sendMessage({ type: 'resolve', id: info.id });
      } catch (e) {
        item = null;
      }
      if (hasMedia(item)) remember(item);
    }
    const videos = (item && item.videos) || [];
    let photos = toVariants(item && item.photos);
    if (!photos.length && domRoot) {
      photos = toVariants(photoImages(domRoot, false).map((img) => img.currentSrc || img.src));
    }
    return {
      screenName: (item && item.screenName) || info.screenName || 'x',
      videos,
      photos,
    };
  }

  // --- 1. action bar button: everything in the tweet ---

  async function onActionClick(article, btn) {
    const info = getTweetInfo(article);
    if (!info) return flash(btn, false);

    const media = await resolveMedia(info, article);
    if (!media.videos.length && !media.photos.length) return flash(btn, false);

    const base = sanitize(media.screenName) + '_' + info.id;
    media.videos.forEach((url, i) => {
      const suffix = media.videos.length > 1 ? `_${i + 1}` : '';
      requestDownload(url, sanitize(`${base}${suffix}.mp4`));
    });
    media.photos.forEach((v, i) => {
      requestDownload(v.url, sanitize(`${base}_${i + 1}.${v.ext}`), v.fallbackUrl);
    });
    flash(btn, true);
  }

  function addActionButton(article) {
    if (article.querySelector('.' + BTN_CLASS)) return;
    if (!hasVideo(article) && !photoImages(article, false).length) return;
    const group = article.querySelector('div[role="group"]');
    if (!group) return;
    group.appendChild(
      makeButton(BTN_CLASS, '動画・画像をダウンロード', (btn) => onActionClick(article, btn))
    );
  }

  // --- 2. per-image hover button ---

  // The photo permalink (/user/status/id/photo/N) carries the owning tweet and
  // the position, which stays correct for images inside a quoted tweet too.
  function imageTarget(img, article) {
    const a = img.closest('a[href*="/photo/"]');
    if (a) {
      const m = (a.getAttribute('href') || '').match(/^\/([^/]+)\/status\/(\d+)\/photo\/(\d+)/);
      if (m) return { screenName: m[1], id: m[2], index: Math.max(0, Number(m[3]) - 1) };
    }
    const info = article ? getTweetInfo(article) : pathInfo();
    if (!info) return null;
    const list = article ? photoImages(article, false) : [];
    const idx = list.indexOf(img);
    return { screenName: info.screenName, id: info.id, index: idx > 0 ? idx : 0 };
  }

  function onImageClick(img, article, btn) {
    const target = imageTarget(img, article);
    const v = imageVariants(img.currentSrc || img.src);
    if (!target || !v) return flash(btn, false);

    const known = mediaMap.get(target.id);
    const name = (known && known.screenName) || target.screenName || 'x';
    requestDownload(
      v.url,
      sanitize(`${sanitize(name)}_${target.id}_${target.index + 1}.${v.ext}`),
      v.fallbackUrl
    );
    flash(btn, true);
  }

  function addImageButtons(article) {
    for (const img of photoImages(article, true)) {
      const host = img.closest('[data-testid="tweetPhoto"]') || img.parentElement;
      if (!host || host.dataset.xvdImg === '1') continue;
      host.dataset.xvdImg = '1';
      // The overlay is absolutely positioned, so the host needs a position.
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.classList.add('xvd-img-host');
      host.appendChild(
        makeButton(IMG_BTN_CLASS, 'この画像を最大サイズでダウンロード', (btn) =>
          onImageClick(img, article, btn)
        )
      );
    }
  }

  // --- 3. floating button while media is maximized ---

  let floatBtn = null;

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  // Either native fullscreen, or X's media viewer overlay (which puts
  // /photo/N or /video/N on the URL). Neither shows the tweet's action bar.
  function maximizedContext() {
    const viewer = location.pathname.match(/^\/([^/]+)\/status\/(\d+)\/(photo|video)\/(\d+)/);
    const fs = fullscreenElement();

    if (fs) {
      const article = fs.closest ? fs.closest('article[data-testid="tweet"]') : null;
      const info = (article && getTweetInfo(article)) || pathInfo();
      if (!info) return null;
      return {
        host: fs,
        article,
        info,
        kind: viewer ? viewer[3] : 'video',
        index: viewer ? Math.max(0, Number(viewer[4]) - 1) : null,
      };
    }

    if (viewer) {
      const modal = document.querySelector('div[aria-modal="true"]');
      if (!modal) return null;
      return {
        host: modal,
        article: null,
        info: { screenName: viewer[1], id: viewer[2] },
        kind: viewer[3],
        index: Math.max(0, Number(viewer[4]) - 1),
      };
    }
    return null;
  }

  // Fallback for a viewer opened without any API payload: the neighbouring
  // carousel slides are off-screen, so the largest rendered image is the one
  // actually being looked at.
  function visibleViewerImage() {
    const modal = document.querySelector('div[aria-modal="true"]');
    if (!modal) return null;
    let best = null;
    let bestArea = 0;
    for (const img of photoImages(modal, true)) {
      const r = img.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) {
        bestArea = area;
        best = img;
      }
    }
    return best ? best.currentSrc || best.src : null;
  }

  async function onFloatClick(btn) {
    const ctx = maximizedContext();
    if (!ctx) return flash(btn, false);

    const media = await resolveMedia(ctx.info, ctx.article);
    const base = sanitize(media.screenName) + '_' + ctx.info.id;

    if (ctx.kind === 'photo') {
      const v = media.photos[ctx.index] || imageVariants(visibleViewerImage());
      if (!v) return flash(btn, false);
      requestDownload(v.url, sanitize(`${base}_${ctx.index + 1}.${v.ext}`), v.fallbackUrl);
      return flash(btn, true);
    }

    if (!media.videos.length) return flash(btn, false);
    if (ctx.index != null && media.videos.length > 1 && media.videos[ctx.index]) {
      requestDownload(media.videos[ctx.index], sanitize(`${base}_${ctx.index + 1}.mp4`));
    } else {
      media.videos.forEach((url, i) => {
        const suffix = media.videos.length > 1 ? `_${i + 1}` : '';
        requestDownload(url, sanitize(`${base}${suffix}.mp4`));
      });
    }
    flash(btn, true);
  }

  function syncFloatingButton() {
    const ctx = maximizedContext();
    // A <video> cannot hold children; in that (rare) case there is nothing to
    // attach the overlay to while fullscreen.
    const host = ctx && ctx.host.tagName !== 'VIDEO' ? ctx.host : null;
    if (!host) {
      if (floatBtn) floatBtn.remove();
      floatBtn = null;
      return;
    }
    if (floatBtn && floatBtn.isConnected && floatBtn.parentNode === host) return;
    if (floatBtn) floatBtn.remove();
    floatBtn = makeButton(FLOAT_CLASS, 'ダウンロード', onFloatClick);
    host.appendChild(floatBtn);
  }

  // --- scanning ---

  function scan() {
    for (const a of document.querySelectorAll('article[data-testid="tweet"]')) {
      addActionButton(a);
      addImageButtons(a);
    }
    syncFloatingButton();
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      scan();
    }, 300);
  }

  const obs = new MutationObserver(schedule);
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // Entering or leaving fullscreen may not mutate the DOM at all.
  document.addEventListener('fullscreenchange', syncFloatingButton);
  document.addEventListener('webkitfullscreenchange', syncFloatingButton);
})();
