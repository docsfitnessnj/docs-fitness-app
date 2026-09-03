import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { showAlert } from './alert';
import { MediaAttachment } from './media';

// Saves/shares a photo or video to the user's device via the native share
// sheet. Native: expo-sharing works directly off the local file URI the
// image picker or audio recorder already produced. Web: expo-sharing's own
// web shim just calls navigator.share({ url }) — useless for an in-page
// blob: URL, which nothing outside this tab can resolve — so this fetches
// the blob and shares it as a real File via the Web Share API's `files`
// option instead, falling back to a normal browser download when the
// browser can't share files (or Web Share isn't available at all).
export async function saveOrShareMedia(media: MediaAttachment, filenameHint: string) {
  const ext = media.type === 'video' ? 'mp4' : 'jpg';
  const filename = `${filenameHint}.${ext}`;
  const mimeType = media.type === 'video' ? 'video/mp4' : 'image/jpeg';

  if (Platform.OS === 'web') {
    try {
      const response = await fetch(media.uri);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: blob.type || mimeType });
      if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      showAlert('Save Failed', "Couldn't save this file. Try again.");
    }
    return;
  }

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
