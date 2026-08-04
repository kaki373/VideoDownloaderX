// Runs in the page's MAIN world (declared via "world": "MAIN" in the manifest).
// Hooks fetch/XHR so that X's own GraphQL API responses can be inspected,
// extracts mp4 video variants and photo URLs per tweet, and forwards them to
// the content script via window.postMessage. Photos are passed through as
// listed by the API; the content script normalises them to the full-size
// variant before downloading.
(() => {
  const API_RE = /\/i\/api\/|api\.(?:twitter|x)\.com\//;
  const MSG_SOURCE = 'x-video-dl';

  function bestMp4(variants) {
    let best = null;
    for (const v of variants) {
      if (v && v.content_type === 'video/mp4' && v.url) {
        if (!best || (v.bitrate || 0) > (best.bitrate || 0)) best = v;
      }
    }
    return best ? best.url : null;
  }

  function pickVideos(media) {
    const videos = [];
    for (const m of media) {
      if (
        (m.type === 'video' || m.type === 'animated_gif') &&
        m.video_info && Array.isArray(m.video_info.variants)
      ) {
        const url = bestMp4(m.video_info.variants);
        if (url) videos.push(url);
      }
    }
    return videos;
  }

  function pickPhotos(media) {
    const photos = [];
    for (const m of media) {
      if (m.type === 'photo' && m.media_url_https) photos.push(m.media_url_https);
    }
    return photos;
  }

  function walk(node, items, depth) {
    if (!node || typeof node !== 'object' || depth > 50) return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v, items, depth + 1);
      return;
    }

    // A tweet appears either as a GraphQL result ({ rest_id, core, legacy })
    // or as a REST-style object ({ id_str, extended_entities, user }).
    const legacy = node.legacy && typeof node.legacy === 'object' ? node.legacy : node;
    const ee = legacy.extended_entities;
    const id = node.rest_id || legacy.id_str || node.id_str;

    if (id && ee && Array.isArray(ee.media)) {
      const videos = pickVideos(ee.media);
      const photos = pickPhotos(ee.media);
      if (videos.length || photos.length) {
        let screenName = null;
        try {
          const u = node.core && node.core.user_results && node.core.user_results.result;
          screenName =
            (u && u.legacy && u.legacy.screen_name) ||
            (u && u.core && u.core.screen_name) ||
            (legacy.user && legacy.user.screen_name) ||
            null;
        } catch (e) { /* ignore */ }
        items.push({ id: String(id), screenName, videos, photos });
      }
    }

    for (const k in node) {
      const v = node[k];
      if (v && typeof v === 'object') walk(v, items, depth + 1);
    }
  }

  function collect(json) {
    try {
      const items = [];
      walk(json, items, 0);
      if (items.length) {
        window.postMessage({ source: MSG_SOURCE, type: 'media', items }, '*');
      }
    } catch (e) { /* never break the page */ }
  }

  // --- fetch hook ---
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (API_RE.test(url)) {
        p.then((res) => {
          res.clone().json().then(collect).catch(() => {});
        }).catch(() => {});
      }
    } catch (e) { /* ignore */ }
    return p;
  };

  // --- XHR hook ---
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__xvdUrl = typeof url === 'string' ? url : String(url);
    return origOpen.call(this, method, url, ...rest);
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__xvdUrl && API_RE.test(this.__xvdUrl)) {
      this.addEventListener('load', () => {
        try {
          collect(JSON.parse(this.responseText));
        } catch (e) { /* not JSON */ }
      });
    }
    return origSend.apply(this, args);
  };
})();
