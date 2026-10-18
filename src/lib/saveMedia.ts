import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { showAlert } from './alert';
import { MediaAttachment } from './media';

// Keyed by URI. Holds the in-flight/resolved fetch for a piece of media
// currently open in MediaViewer, so prefetchMediaForSave (called the
// instant the viewer opens) and saveOrShareMedia (called when Save is
// actually tapped) share one network request instead of two, and so a tap
// that lands after the prefetch has already finished gets the blob back
// with no network wait at all. Bounded (not just left to grow for the
// life of the tab) since videos can be tens of MB each and a long chat
// session might open many of them -- oldest entry evicted once a new one
// would push the cache past this size.
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
  // Never cache a failure -- the next prefetch or save attempt (e.g. the
  // member reopens the viewer, or taps Save again after a transient
  // network error) should retry against the network, not replay the same
  // rejected promise forever.
  pending.catch(() => blobCache.delete(uri));
  return pending;
}

// Starts the download as soon as a photo or video is opened full-screen —
// see the useEffect in MediaViewer.tsx that calls this. The real bug this
// fixes: on iOS Safari, navigator.share() requires a recent, "live" user
// tap to work at all, and that grace period is short (a few seconds) and
// fixed regardless of what the page is doing. A 30-40MB video fetched cold
// -- only starting the download the moment Save is tapped -- routinely
// took longer than that window on a real phone, so by the time the fetch
// finished and navigator.share() was finally called, Safari had already
// forgotten the tap ever happened and silently rejected it as "SAVE
// FAILED." A photo is small enough that this rarely showed up. Starting
// the fetch when the viewer opens instead means the bytes are usually
// already in hand (or much further along) by the time anyone decides to
// tap Save, so the share call that follows a real tap has little to no
// network left to wait on. Web only -- there's nothing to prefetch for the
// native share sheet, which reads the local file URI directly.
export function prefetchMediaForSave(media: MediaAttachment) {
  if (Platform.OS !== 'web') return;
  fetchBlobCached(media.uri).catch(() => {
    // Swallowed here on purpose -- a failed prefetch isn't a failed save.
    // fetchBlobCached already evicted the failed promise above, so the
    // actual save attempt (if one ever happens) retries cleanly and
    // reports its own specific error instead of this silent background one.
  });
}

// Real file extension from the blob's actual Content-Type rather than
// trusting media.type's coarse image/video guess — covers a .mov or .webm
// sent from somewhere other than this app's own camera/picker without the
// download lying about what the file actually is.
function extensionFor(mimeType: string, fallbackKind: 'image' | 'video'): string {
  const subtype = mimeType.split('/')[1]?.split(';')[0]?.trim().toLowerCase();
  if (subtype === 'jpeg') return 'jpg';
  if (subtype === 'quicktime') return 'mov';
  if (subtype) return subtype;
  return fallbackKind === 'video' ? 'mp4' : 'jpg';
}

export async function saveOrShareMedia(media: MediaAttachment, filenameHint: string) {
  if (Platform.OS === 'web') {
    let blob: Blob;
    try {
      blob = await fetchBlobCached(media.uri);
    } catch {
      showAlert('Couldn’t Download', "Couldn't download this file to save it. Check your connection and try again.");
      return;
    }

    const mimeType = blob.type || (media.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const kindWord = media.type === 'video' ? 'video' : 'photo';
    const filename = `${filenameHint}-${kindWord}.${extensionFor(mimeType, media.type)}`;
    const file = new File([blob], filename, { type: mimeType });

    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      try {
        // The actual save: on iPhone/iPad there is no direct write into
        // Photos from a web page, so the system share sheet (Save Video /
        // Save Image) IS the save — this is the only route in.
        await navigator.share({ files: [file] });
      } catch (err) {
        // Dismissing the share sheet rejects with AbortError -- that's the
        // member changing their mind, not a failure, so it gets no dialog.
        if (err instanceof Error && err.name === 'AbortError') return;
        showAlert('Save Failed', "Your device closed the share sheet without saving. Try again.");
      }
      return;
    }

    try {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      showAlert('Save Failed', "Couldn't start the download. Try again.");
    }
    return;
  }

  const mimeType = media.type === 'video' ? 'video/mp4' : 'image/jpeg';
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
