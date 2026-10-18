import { Platform } from 'react-native';

// Comfortably more detail than any screen this app renders a photo on
// needs (full-screen viewer included) — a full-resolution iPhone photo is
// routinely 3-5MB+ (often 12+ megapixels), which is both slower to send
// and slower for every other member's chat to load back down later, for
// detail nobody can actually see past this size.
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

// Downscales a picked photo client-side before it ever leaves the device.
// Videos are left exactly as uploaded — re-encoding a 20-40MB video on a
// phone's CPU isn't a speed win, it's a new, much slower problem, and the
// codec/accept fix (useMediaPicker.ts) is what actually matters for video.
// Best-effort throughout: any failure (an old browser missing
// createImageBitmap, a canvas that refuses to yield a 2D context, ...)
// falls back to the original blob rather than ever blocking a real send
// over a client-side resize that didn't work out.
export async function downscaleImageForUpload(blob: Blob): Promise<Blob> {
  if (Platform.OS !== 'web') return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longestEdge > MAX_EDGE ? MAX_EDGE / longestEdge : 1;
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return blob;
    }
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close?.();

    const resizedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', JPEG_QUALITY);
    });
    if (!resizedBlob) return blob;
    // Recompression can occasionally land larger than a well-optimized
    // original (a small photo that was already a tight JPEG) -- never
    // send more bytes than the original was.
    return resizedBlob.size < blob.size ? resizedBlob : blob;
  } catch {
    return blob;
  }
}
