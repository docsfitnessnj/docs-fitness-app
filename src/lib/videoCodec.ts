// Reads an MP4/MOV container's own box structure to answer one question:
// is this video's track encoded as H.264 (plays everywhere) or HEVC/H.265
// (iPhone native, undecodable on most desktop hardware)? No upload, no
// transcoding, no network cost beyond a couple of small ranged reads --
// this only ever looks at box HEADERS (type + size) to walk the structure,
// and reads the one small box (stsd) that actually names the codec.
//
// Works against either a local File (useMediaPicker.ts, at selection time)
// or a remote URL via HTTP Range requests (MediaViewer.tsx, at view time —
// this is what lets a video SENT by someone else, or opened well after
// upload, still get an honest answer with no server-side metadata to
// store and no database change at all).
export type VideoCodec = 'h264' | 'hevc' | 'unknown';

const HEAD_CHUNK_BYTES = 512 * 1024;
const TAIL_CHUNK_BYTES = 3 * 1024 * 1024;
const RANGE_FETCH_TIMEOUT_MS = 4000;

type Chunk = { buffer: ArrayBuffer; absoluteStart: number };

type ChunkFetcher = {
  head: (length: number) => Promise<Chunk | null>;
  tail: (length: number) => Promise<Chunk | null>;
};

function fetcherForFile(file: Blob): ChunkFetcher {
  return {
    head: async (length) => {
      const end = Math.min(file.size, length);
      if (end <= 0) return null;
      return { buffer: await file.slice(0, end).arrayBuffer(), absoluteStart: 0 };
    },
    tail: async (length) => {
      const start = Math.max(0, file.size - length);
      if (start >= file.size) return null;
      return { buffer: await file.slice(start, file.size).arrayBuffer(), absoluteStart: start };
    },
  };
}

function fetcherForUrl(url: string): ChunkFetcher {
  const rangeFetch = async (rangeHeader: string): Promise<Chunk | null> => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), RANGE_FETCH_TIMEOUT_MS) : null;
    try {
      const res = await fetch(url, { headers: { Range: rangeHeader }, signal: controller?.signal });
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength === 0) return null;
      let absoluteStart = 0;
      const contentRange = res.headers.get('content-range'); // "bytes 0-524287/41943040"
      const match = contentRange ? /bytes (\d+)-(\d+)\/(\d+|\*)/.exec(contentRange) : null;
      if (match) absoluteStart = parseInt(match[1], 10);
      return { buffer, absoluteStart };
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  return {
    head: (length) => rangeFetch(`bytes=0-${length - 1}`),
    tail: (length) => rangeFetch(`bytes=-${length}`),
  };
}

type Box = { type: string; start: number; end: number; bodyStart: number };

// Reads one box's header at an absolute file offset, against a DataView
// whose own byte 0 is at `viewAbsoluteStart`. Only ever reads the 8 (or
// 16, for a 64-bit size) header bytes -- never the box's body -- so this
// is cheap to call repeatedly while walking a chunk's siblings.
function readBoxHeader(view: DataView, viewAbsoluteStart: number, absoluteOffset: number): Box | null {
  const bufOffset = absoluteOffset - viewAbsoluteStart;
  if (bufOffset < 0 || bufOffset + 8 > view.byteLength) return null;
  let size = view.getUint32(bufOffset);
  const type = String.fromCharCode(
    view.getUint8(bufOffset + 4),
    view.getUint8(bufOffset + 5),
    view.getUint8(bufOffset + 6),
    view.getUint8(bufOffset + 7)
  );
  let headerSize = 8;
  if (size === 1) {
    if (bufOffset + 16 > view.byteLength) return null;
    const hi = view.getUint32(bufOffset + 8);
    const lo = view.getUint32(bufOffset + 12);
    size = hi * 2 ** 32 + lo;
    headerSize = 16;
  } else if (size === 0) {
    size = viewAbsoluteStart + view.byteLength - absoluteOffset;
  }
  if (size < 8) return null;
  return { type, start: absoluteOffset, end: absoluteOffset + size, bodyStart: absoluteOffset + headerSize };
}

function* iterateSiblings(view: DataView, viewAbsoluteStart: number, rangeStart: number, rangeEnd: number) {
  let offset = rangeStart;
  while (offset + 8 <= rangeEnd) {
    const box = readBoxHeader(view, viewAbsoluteStart, offset);
    if (!box || box.end <= offset) break;
    yield box;
    offset = box.end;
  }
}

function findFirst(view: DataView, viewAbsoluteStart: number, rangeStart: number, rangeEnd: number, type: string): Box | null {
  for (const box of iterateSiblings(view, viewAbsoluteStart, rangeStart, rangeEnd)) {
    if (box.type === type) return box;
  }
  return null;
}

function findAll(view: DataView, viewAbsoluteStart: number, rangeStart: number, rangeEnd: number, type: string): Box[] {
  const out: Box[] = [];
  for (const box of iterateSiblings(view, viewAbsoluteStart, rangeStart, rangeEnd)) {
    if (box.type === type) out.push(box);
  }
  return out;
}

function fourccToCodec(fourcc: string): VideoCodec {
  const lower = fourcc.toLowerCase();
  if (lower === 'avc1' || lower === 'avc3') return 'h264';
  if (lower === 'hvc1' || lower === 'hev1' || lower === 'dvh1' || lower === 'dvhe') return 'hevc';
  return 'unknown';
}

// Walks moov -> trak(s) -> mdia -> hdlr (handler_type === 'vide') -> minf
// -> stbl -> stsd, and reads the first sample entry's own box type --
// that type IS the codec FourCC (avc1 = H.264, hvc1/hev1 = HEVC). Tries
// every trak, not just the first, since track order inside moov isn't
// guaranteed to put video first.
function codecFromMoov(view: DataView, viewAbsoluteStart: number, moov: Box): VideoCodec {
  for (const trak of findAll(view, viewAbsoluteStart, moov.bodyStart, moov.end, 'trak')) {
    const mdia = findFirst(view, viewAbsoluteStart, trak.bodyStart, trak.end, 'mdia');
    if (!mdia) continue;
    const hdlr = findFirst(view, viewAbsoluteStart, mdia.bodyStart, mdia.end, 'hdlr');
    if (!hdlr) continue;
    // hdlr body: version+flags(4) + pre_defined(4) + handler_type(4) + ...
    const handlerOffset = hdlr.bodyStart - viewAbsoluteStart + 8;
    if (handlerOffset + 4 > view.byteLength) continue;
    const handlerType = String.fromCharCode(
      view.getUint8(handlerOffset),
      view.getUint8(handlerOffset + 1),
      view.getUint8(handlerOffset + 2),
      view.getUint8(handlerOffset + 3)
    );
    if (handlerType !== 'vide') continue;

    const minf = findFirst(view, viewAbsoluteStart, mdia.bodyStart, mdia.end, 'minf');
    if (!minf) continue;
    const stbl = findFirst(view, viewAbsoluteStart, minf.bodyStart, minf.end, 'stbl');
    if (!stbl) continue;
    const stsd = findFirst(view, viewAbsoluteStart, stbl.bodyStart, stbl.end, 'stsd');
    if (!stsd) continue;

    // stsd body: version+flags(4) + entry_count(4), then the first sample
    // entry box -- we only need its type, never its own body.
    const firstEntryStart = stsd.bodyStart + 8;
    const entry = readBoxHeader(view, viewAbsoluteStart, firstEntryStart);
    if (!entry) continue;
    return fourccToCodec(entry.type);
  }
  return 'unknown';
}

async function detectFromFetcher(fetcher: ChunkFetcher): Promise<VideoCodec> {
  const head = await fetcher.head(HEAD_CHUNK_BYTES);
  if (head) {
    const view = new DataView(head.buffer);
    const rangeEnd = head.absoluteStart + view.byteLength;
    const moov = findFirst(view, head.absoluteStart, head.absoluteStart, rangeEnd, 'moov');
    if (moov && moov.end <= rangeEnd) {
      return codecFromMoov(view, head.absoluteStart, moov);
    }
  }
  // Not found (or not fully present) near the front -- very common for a
  // video straight off an iPhone, which isn't "faststart" optimized, so
  // `moov` sits after the (much larger) `mdat` at the end of the file
  // instead. One more small read covers that layout too.
  const tail = await fetcher.tail(TAIL_CHUNK_BYTES);
  if (tail) {
    const view = new DataView(tail.buffer);
    const rangeEnd = tail.absoluteStart + view.byteLength;
    const moov = findFirst(view, tail.absoluteStart, tail.absoluteStart, rangeEnd, 'moov');
    if (moov) {
      return codecFromMoov(view, tail.absoluteStart, moov);
    }
  }
  return 'unknown';
}

export async function detectVideoCodecFromFile(file: Blob): Promise<VideoCodec> {
  try {
    return await detectFromFetcher(fetcherForFile(file));
  } catch {
    return 'unknown';
  }
}

export async function detectVideoCodecFromUrl(url: string): Promise<VideoCodec> {
  try {
    return await detectFromFetcher(fetcherForUrl(url));
  } catch {
    return 'unknown';
  }
}

// Whether THIS browser can decode HEVC at all, independent of any specific
// file — canPlayType is a capability query, answered synchronously with no
// network. True on iPhone/iPad Safari (hardware HEVC decode), false on
// most desktop Chrome/Firefox installs, which is exactly the split
// observed on real devices. Defaults to true (don't show a fallback) if
// this can't be determined, since a false negative here only costs an
// unnecessary playback attempt, while a false positive would wrongly
// block a device that could actually play the file.
export function browserCanDecodeHevc(): boolean {
  if (typeof document === 'undefined') return true;
  try {
    const video = document.createElement('video');
    if (typeof video.canPlayType !== 'function') return true;
    return (
      video.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') !== '' ||
      video.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') !== ''
    );
  } catch {
    return true;
  }
}
