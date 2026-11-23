import { Platform } from 'react-native';

// Reads a locally-picked video's own real duration, in seconds, before any
// upload ever begins -- lets a too-long pick be refused up front (see
// StoriesContext.tsx's own MAX_STORY_VIDEO_DURATION_SECONDS check) with no
// network cost at all: metadata-only, the same off-screen <video> element
// technique videoThumbnail.ts already uses for a frame capture, just
// reading .duration instead of drawing a frame. Web-only, matching this
// app's real deployment target -- resolves null on native or on any
// failure, which the caller treats as "couldn't determine, don't block the
// post over it," never a reason to refuse a pick outright.
export async function getVideoDuration(localUri: string): Promise<number | null> {
  if (Platform.OS !== 'web') return null;
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.src = localUri;
    const duration = await new Promise<number | null>((resolve) => {
      const onLoaded = () => resolve(Number.isFinite(video.duration) ? video.duration : null);
      const onError = () => resolve(null);
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
      video.load();
    });
    return duration;
  } catch {
    return null;
  }
}
