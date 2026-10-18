import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { showAlert } from './alert';
import { ViewableMedia } from './media';

// Keyed by URI. Holds the in-flight/resolved fetch for a piece of media
// currently open in MediaViewer, so a prefetch (started the instant the
// viewer opens) and the eventual share (once the member actually taps
// Save) share one network request instead of two. Bounded — not just left
// to grow for the life of the tab — since videos can be tens of MB each
// and a long chat session might open many of them; oldest entry evicted
// once a new one would push the cache past this size.
const MAX_CACHED_BLOBS = 4;
const blobCache = new Map<string, Promise<Blob>>();

function fetchBlobCached(uri: string): Promise<Blob> {
  const existing = blobCache.get(uri);
  if (existing) return existing;

  if (blobCache.size >= MAX_CACHED_BLOBS) {
    const oldestKey = blobCache.keys().next().value;
    if (oldestKey !== undefined) blobCache.delete(oldestKey);
  }

  const pending = fetch(uri).then((res) => {
    if (!res.ok) throw new Error(`Server returned ${res.status} while downloading the file.`);
    return res.blob();
  });
  blobCache.set(uri, pending);
  // Never cache a failure -- a retry (reopening the viewer, or tapping
  // Save again) should hit the network again, not replay the same
  // rejected promise forever.
  pending.catch(() => blobCache.delete(uri));
  return pending;
}

export function guessMimeType(media: ViewableMedia): string {
  if (media.type === 'video') return 'video/mp4';
  if (media.type === 'gif') return 'image/gif';
  return 'image/jpeg';
}

// Whether this browser can share a FILE of roughly this kind through the
// Web Share API — answered with a zero-byte placeholder of the right MIME
// type, never real bytes, so it's instant and needs no network request.
// This is true on iPhone/iPad Safari, which is the only place a web page
// has any route into Photos at all. It's also technically true on some
// desktop Chrome builds, which turned out to be exactly the earlier bug:
// desktop doesn't need or want the OS-level share sheet for what's meant
// to be a plain file download, and routing it through navigator.share()
// there is what made the old "download" button fail unpredictably for
// every video on desktop (no app on a MacBook reliably accepts a 20-40MB
// video share, and the browser's own file-sharing size/type validation
// isn't consistent either) — see downloadMediaDirectly below, which
// desktop now always uses instead regardless of what this returns.
export function canShareFilesOfType(mimeType: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([], 'probe', { type: mimeType })] });
  } catch {
    return false;
  }
}

// Starts downloading the open media the instant MediaViewer renders it —
// well before anyone taps Save. The real bug this exists to prevent:
// navigator.share() only works within a short, fixed grace period after a
// genuine user tap, independent of what the page does meanwhile. Only
// starting the fetch once Save was tapped meant a 20-40MB video routinely
// outlasted that window, so by the time the fetch finished and
// navigator.share() was finally called, Safari had already forgotten the
// tap and silently rejected it. Returns the same cached promise
// shareMediaFile below will also read, so there's exactly one network
// request total, and resolves with real bytes already in hand well before
// anyone decides to tap Save (see useSaveButton in MediaViewer.tsx, which
// only ever lets a tap call shareMediaFile once this has resolved).
export function prefetchMediaForSave(media: ViewableMedia): Promise<Blob> {
  return fetchBlobCached(media.uri);
}

// Real file extension from the blob's actual Content-Type rather than
// trusting media.type's coarse image/video guess — covers a .mov or .webm
// sent from somewhere other than this app's own camera/picker without the
// download lying about what the file actually is.
function extensionFor(mimeType: string, fallbackKind: 'image' | 'video' | 'gif'): string {
  const subtype = mimeType.split('/')[1]?.split(';')[0]?.trim().toLowerCase();
  if (subtype === 'jpeg') return 'jpg';
  if (subtype === 'quicktime') return 'mov';
  if (subtype) return subtype;
  return fallbackKind === 'video' ? 'mp4' : fallbackKind === 'gif' ? 'gif' : 'jpg';
}

function buildFilename(media: ViewableMedia, filenameHint: string, mimeType: string): string {
  const kindWord = media.type === 'video' ? 'video' : media.type === 'gif' ? 'gif' : 'photo';
  return `${filenameHint}-${kindWord}.${extensionFor(mimeType, media.type)}`;
}

// PART 2 — desktop save, with no fetch and no blob at all. Supabase
// Storage's public object endpoint serves a file inline by default;
// appending `?download=<filename>` makes it answer with
// `Content-Disposition: attachment` instead, which is what actually makes
// a browser download a file rather than just navigate to it. A plain
// anchor pointing straight at that URL, clicked once, downloads the file
// directly: nothing in this page ever reads the response body, so
// cross-origin CORS headers never enter into it at all (they only ever
// gate `fetch`/XHR reading a response back into JS, never a plain
// top-level download navigation like this one). This replaces the old
// fetch-then-blob-then-share path on desktop, which — because desktop
// Chrome DOES support navigator.share with files — opened the OS-level
// share sheet instead of downloading anything, and failed outright for
// every video there regardless of age, with no reliable alternative ever
// surfacing.
export function downloadMediaDirectly(media: ViewableMedia, filenameHint: string) {
  const mimeType = guessMimeType(media);
  const filename = buildFilename(media, filenameHint, mimeType);
  const separator = media.uri.includes('?') ? '&' : '?';
  const url = `${media.uri}${separator}download=${encodeURIComponent(filename)}`;
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export type ShareResult = 'shared' | 'canceled' | 'failed';

// PART 3 — phone save. Must only ever be called with the real bytes
// already resolved (MediaViewer's own save-button state machine only lets
// a tap reach this once prefetchMediaForSave has settled) so this stays as
// close as possible to a synchronous continuation of that tap — no fetch,
// no await before navigator.share() itself — which is what keeps the
// whole thing inside Safari's "this came from a real, recent tap" grace
// period no matter how large the file is.
export async function shareMediaFile(blob: Blob, media: ViewableMedia, filenameHint: string): Promise<ShareResult> {
  const mimeType = blob.type || guessMimeType(media);
  const filename = buildFilename(media, filenameHint, mimeType);
  const file = new File([blob], filename, { type: mimeType });
  try {
    // The actual save: on iPhone/iPad there is no direct write into
    // Photos from a web page, so the system share sheet (Save Video /
    // Save Image) IS the save — this is the only route in.
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (err) {
    // Dismissing the share sheet rejects with AbortError -- that's the
    // member changing their mind, not a failure, so it's reported
    // distinctly and never shown as one.
    if (err instanceof Error && err.name === 'AbortError') return 'canceled';
    return 'failed';
  }
}

// Native (non-web) save/share — unchanged from before.
export async function saveOrShareMediaNative(media: ViewableMedia) {
  const mimeType = guessMimeType(media);
  try {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      showAlert('Sharing Unavailable', "This device can't open the share sheet.");
      return;
    }
    await Sharing.shareAsync(media.uri, { mimeType, dialogTitle: 'Save or Share' });
  } catch {
    showAlert('Save Failed', "Couldn't save this file. Try again.");
  }
}

export function isWeb(): boolean {
  return Platform.OS === 'web';
}
