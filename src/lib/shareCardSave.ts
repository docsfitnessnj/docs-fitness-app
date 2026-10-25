import { canShareFilesOfType } from './saveMedia';

// Round 33: SHARE TO STORY / SAVE for the completion share card, reusing
// this app's own battle-tested share plumbing (saveMedia.ts) rather than
// inventing a second mechanism -- the only real difference from a photo
// already on the server is that the bytes here come from a freshly
// rendered canvas Blob, never a network fetch, so there's no prefetch
// step to race against Safari's "recent tap" grace period in the first
// place.
export type ShareCardResult = 'shared' | 'saved' | 'canceled' | 'failed';

function filenameFor(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  return `docs-fitness-${slug || 'workout-complete'}.png`;
}

// Direct anchor download of a locally-generated Blob -- desktop's own
// save path (see saveMedia.ts's downloadMediaDirectly, which this mirrors
// for a Blob instead of a remote Storage URL; a plain `download` anchor
// works for a blob: URL exactly as well as for a real one).
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on a short delay, not immediately -- some browsers haven't
  // finished reading the blob: URL by the time click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Opens the native share sheet with the rendered card image -- Instagram
// Stories is one of the share targets there when the Instagram app is
// installed, which is the real, honest shape of "share to story" from a
// web page (there is no direct "open Instagram Stories with this image"
// API). Falls back to a direct save, with a clear alert rather than a
// silent failure, whenever the share sheet can't carry an image file in
// this environment (desktop, or a browser without Web Share's file
// support).
export async function shareCardImage(blob: Blob, title: string): Promise<ShareCardResult> {
  const filename = filenameFor(title);
  const file = new File([blob], filename, { type: 'image/png' });
  if (canShareFilesOfType('image/png')) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'canceled';
      // Fall through to the save fallback -- a share-sheet error is not
      // the member's fault and should never be a dead end.
    }
  }
  downloadBlob(blob, filename);
  return 'saved';
}

export async function saveCardImage(blob: Blob, title: string): Promise<ShareCardResult> {
  const filename = filenameFor(title);
  // On a phone there is no direct write into Photos from a web page --
  // the system share sheet (with "Save Image" as one of its own options)
  // IS the save, same convention saveMedia.ts's shareMediaFile already
  // established for every other save-to-phone path in this app.
  if (canShareFilesOfType('image/png')) {
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'canceled';
    }
  }
  downloadBlob(blob, filename);
  return 'saved';
}
