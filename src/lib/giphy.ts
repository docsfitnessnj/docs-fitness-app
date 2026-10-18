// Client-side GIPHY integration for GIF search/trending — the GifPicker
// component (shared by DOC'S GROUP CHAT and the Community comment composer)
// is the only consumer. Per GIPHY's terms, media is never re-hosted: every
// GIF's own CDN URL (straight from the API response) is what gets stored
// and rendered, nothing is downloaded and re-uploaded to Supabase storage.
// rating=pg keeps every request — trending and search alike — family
// friendly.
//
// This is a rate-limited "beta" key (~100 requests/hour) — two things keep
// real usage well under that: the trending response is fetched once per
// browser tab and reused for every later picker open (fetchTrendingGifs'
// own cache below is the single biggest lever on the hourly budget, since
// it's the one request EVERY open makes before any search), and the
// picker's own search input debounces so a member typing a whole word
// costs one or two requests, never one per keystroke (see
// useDebouncedValue.ts, used by GifPicker.tsx).
const GIPHY_API_KEY = '3qvJdtMOrPd9goNu5U4DE4qZbGGoBUu3';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';
const RESULT_LIMIT = 24;

export type GiphyGif = {
  id: string;
  title: string;
  // Small, fast-loading rendition for the picker's own grid — GIPHY's
  // "fixed width downsized" rendition.
  gridUrl: string;
  gridWidth: number;
  gridHeight: number;
  // Full-quality rendition actually sent in the message/comment — GIPHY's
  // "downsized medium" rendition, falling back to the original.
  sendUrl: string;
  sendWidth: number;
  sendHeight: number;
};

type GiphyImageRendition = { url: string; width: string; height: string };
type GiphyApiGif = {
  id: string;
  title: string;
  images: {
    fixed_width_downsampled?: GiphyImageRendition;
    fixed_width?: GiphyImageRendition;
    downsized_medium?: GiphyImageRendition;
    original?: GiphyImageRendition;
  };
};

function toGiphyGif(raw: GiphyApiGif): GiphyGif | null {
  const grid = raw.images?.fixed_width_downsampled ?? raw.images?.fixed_width;
  const send = raw.images?.downsized_medium ?? raw.images?.original ?? grid;
  if (!grid?.url || !send?.url) return null;
  return {
    id: raw.id,
    title: raw.title || 'GIF',
    gridUrl: grid.url,
    gridWidth: parseInt(grid.width, 10) || 200,
    gridHeight: parseInt(grid.height, 10) || 200,
    sendUrl: send.url,
    sendWidth: parseInt(send.width, 10) || 400,
    sendHeight: parseInt(send.height, 10) || 400,
  };
}

async function fetchGifs(endpoint: 'trending' | 'search', params: Record<string, string>): Promise<GiphyGif[]> {
  const url = new URL(`${GIPHY_BASE}/${endpoint}`);
  url.searchParams.set('api_key', GIPHY_API_KEY);
  url.searchParams.set('rating', 'pg');
  url.searchParams.set('limit', String(RESULT_LIMIT));
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`GIPHY returned ${res.status}`);
  const json = (await res.json()) as { data?: GiphyApiGif[] };
  return (json.data ?? []).map(toGiphyGif).filter((gif): gif is GiphyGif => gif !== null);
}

// Cached for the life of the tab — every picker open after the very first
// one reuses this instead of spending another call on an identical
// request (trending barely changes minute to minute). A failed fetch
// clears the cache so the next open can retry instead of being stuck
// replaying the same rejected promise forever.
let trendingCache: Promise<GiphyGif[]> | null = null;

export function fetchTrendingGifs(): Promise<GiphyGif[]> {
  if (!trendingCache) {
    trendingCache = fetchGifs('trending', {}).catch((err) => {
      trendingCache = null;
      throw err;
    });
  }
  return trendingCache;
}

export function searchGifs(query: string): Promise<GiphyGif[]> {
  return fetchGifs('search', { q: query });
}
