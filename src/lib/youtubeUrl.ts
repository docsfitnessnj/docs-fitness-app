// A Doc's WOD/COW `videoUrl` is typed as a raw pasted link (youtu.be/<id>,
// youtube.com/watch?v=<id>, or youtube.com/embed/<id>) -- unlike THE
// MOVEMENT VAULT's own data (movements.ts), which already stores a bare
// `youtubeId`. This is the one shared parser that turns the raw link into
// that same id, so any Doc's-WOD/COW video can be handed to
// MovementVideoPlayer (movement/MovementVideoPlayer.tsx) -- the app's one
// real in-app YouTube playback treatment (nocookie embed, load-timeout
// retry, always-visible reload) -- instead of only ever opening in a new
// tab. Returns null for anything unrecognized, which every caller treats
// as "no playable video" rather than guessing.
export function extractYoutubeId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id || null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const vParam = parsed.searchParams.get('v');
      if (vParam) return vParam;
      const parts = parsed.pathname.split('/').filter(Boolean);
      // /embed/<id> or /shorts/<id>
      if ((parts[0] === 'embed' || parts[0] === 'shorts') && parts[1]) return parts[1];
      return null;
    }
    return null;
  } catch {
    return null;
  }
}
