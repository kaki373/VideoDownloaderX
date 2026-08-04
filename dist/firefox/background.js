// Background (Chrome: MV3 service worker / Firefox: background script).
// Handles download requests (video and image) and resolves tweets that were
// not captured from the timeline API, via X's public syndication endpoint.
const api = typeof browser !== 'undefined' ? browser : chrome;

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'download') {
    startDownload(msg.url, msg.filename, msg.fallbackUrl || null);
    return;
  }

  if (msg.type === 'resolve') {
    resolveTweet(msg.id)
      .then(sendResponse)
      .catch(() => sendResponse(null));
    return true; // keep the message channel open for the async response
  }
});

// downloadId -> { url, filename } to retry with once the first attempt fails.
// Used for images: "name=orig" is not served for every upload, in which case
// we fall back to the largest scaled variant.
const retries = new Map();

function startDownload(url, filename, fallbackUrl) {
  let p;
  try {
    p = api.downloads.download({ url, filename, saveAs: false });
  } catch (e) {
    p = null;
  }
  if (!p || typeof p.then !== 'function') return;
  p.then((id) => {
    if (fallbackUrl && id != null) retries.set(id, { url: fallbackUrl, filename });
  }).catch(() => {
    if (fallbackUrl) startDownload(fallbackUrl, filename, null);
  });
}

api.downloads.onChanged.addListener((delta) => {
  if (!delta || !delta.state) return;
  const retry = retries.get(delta.id);
  if (!retry) return;
  retries.delete(delta.id);
  if (delta.state.current === 'interrupted') {
    startDownload(retry.url, retry.filename, null);
  }
});

function bestMp4(variants) {
  let best = null;
  for (const v of variants) {
    if (v && v.content_type === 'video/mp4' && v.url) {
      if (!best || (v.bitrate || 0) > (best.bitrate || 0)) best = v;
    }
  }
  return best ? best.url : null;
}

// cdn.syndication.twimg.com requires a token derived from the tweet id.
function syndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, '');
}

async function resolveTweet(id) {
  const url =
    'https://cdn.syndication.twimg.com/tweet-result?id=' +
    encodeURIComponent(id) +
    '&token=' +
    syndicationToken(id);
  const res = await fetch(url);
  if (!res.ok) throw new Error('syndication HTTP ' + res.status);
  const data = await res.json();

  const videos = [];
  const photos = [];
  for (const m of data.mediaDetails || []) {
    if (
      (m.type === 'video' || m.type === 'animated_gif') &&
      m.video_info && Array.isArray(m.video_info.variants)
    ) {
      const u = bestMp4(m.video_info.variants);
      if (u) videos.push(u);
    } else if (m.type === 'photo' && m.media_url_https) {
      photos.push(m.media_url_https);
    }
  }
  return {
    id: String(id),
    screenName: (data.user && data.user.screen_name) || null,
    videos,
    photos,
  };
}
