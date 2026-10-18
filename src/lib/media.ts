// A locally-picked photo or video attachment. `uri` is a device-local URI
// for now (image-picker output / object URL on web) — swapping in real
// media hosting later only means changing what populates `uri`, not this
// shape or anywhere it's threaded through (Post, WorkoutLog).
export type MediaAttachment = {
  uri: string;
  type: 'image' | 'video';
  // Group chat video messages carry a client-captured poster frame
  // (videoThumbnail.ts) — when present, the full-screen viewer shows it
  // behind the video element so an undecodable-video fallback has
  // something other than plain black to sit over. Unset for photos, and
  // for a video from a source (Community, Message Doc Directly) that
  // doesn't capture one.
  posterUri?: string;
  // Detected at selection time for a video (web only — see
  // useMediaPicker.ts's pickWebMedia and videoCodec.ts). Purely
  // informational: a send is never blocked by this, since an iPhone plays
  // its own HEVC video natively regardless of what's picked. Kept on the
  // attachment mainly so the send path and any future diagnostics can see
  // what was actually picked without re-inspecting the file.
  videoCodec?: 'h264' | 'hevc' | 'unknown';
};

// A GIF attachment — GIPHY-powered (see lib/giphy.ts), remote-only, and
// never uploaded anywhere (GIPHY's terms prohibit rehosting their media).
// Kept as its own narrow type rather than widening MediaAttachment.type
// app-wide: most MediaAttachment consumers (Community posts, Message Doc
// Directly, Workout Log) don't support GIFs and shouldn't have to account
// for a type they can never actually receive.
export type GifAttachment = { uri: string; type: 'gif' };

// What DOC'S GROUP CHAT's send path and the full-screen MediaViewer can
// show — a locally-picked photo/video, or a GIPHY GIF.
export type ViewableMedia = MediaAttachment | GifAttachment;
