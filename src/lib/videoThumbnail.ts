import { Platform } from 'react-native';

// Captures a single frame from a local video file as a JPEG Blob, for use
// as a poster thumbnail — the message list renders this instead of the
// video itself (see FIX 3: "stop loading full video files in the message
// list"). Web-only for now: this app's real deployment target is the
// static web export (GitHub Pages), which this plays through an off-screen
// <video> + <canvas> capture, the standard way to grab a video frame in a
// browser with no server-side processing. A native build would need a
// different API (e.g. expo-video-thumbnails, not currently a dependency);
// on native this resolves to null and the message simply sends without a
// thumbnail (the existing green placeholder), same as before this fix —
// never a failure that blocks sending.
export async function captureVideoThumbnail(localUri: string): Promise<Blob | null> {
  if (Platform.OS !== 'web') return null;
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = localUri;
    video.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      const onError = () => reject(new Error('video failed to load for thumbnail capture'));
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      video.addEventListener('error', onError, { once: true });
      video.load();
    });

    // A fraction of a second in rather than frame 0 — frame 0 of a lot of
    // phone-recorded video is black or still mid-focus-hunt.
    const seekTo = Math.min(0.1, (video.duration || 1) / 2);
    await new Promise<void>((resolve, reject) => {
      const onError = () => reject(new Error('video failed to seek for thumbnail capture'));
      video.addEventListener('seeked', () => resolve(), { once: true });
      video.addEventListener('error', onError, { once: true });
      video.currentTime = seekTo;
    });

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 320;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
    });
  } catch {
    // Thumbnail capture is a nice-to-have, never a reason to block sending
    // the video itself.
    return null;
  }
}
