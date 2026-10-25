import { Image as RNImage } from 'react-native';
import { DeckCardData, isRedSuit, deckCardLabel } from '../data/deckCards';
import { colors, fonts } from '../theme';
import { HUNDRED_DOWN_TARGET } from '../context/BadgeContext';

// Round 33: THE COMPLETION SHARE CARD's own renderer. One canvas, drawn
// once at full export resolution (1080x1350 -- a clean 4:5 ratio, already
// well past Instagram story's "at least 1080 wide" bar) and then simply
// displayed smaller via CSS on screen. Because the on-screen preview and
// the exported PNG are the exact same canvas pixels, "the on screen
// preview and the exported image must look identical" is true by
// construction, not by separately keeping two render paths in sync.
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350; // 4:5

const KETTLEWAVE_SOURCE = require('../../assets/brand/kettlewave-green.png');
// The real committed ink's own color (confirmed directly against the PNG's
// own pixel data: solid #076652 everywhere alpha > 0) -- the one case that
// never needs a recolor pass, since colorway B (Bright Yellow bg) wants
// exactly this native green wave.
const KETTLEWAVE_NATIVE_HEX = colors.green;

export type StandardColorwayId = 'augusta-green' | 'bright-yellow' | 'black' | 'green-yellow-wave' | 'black-yellow-wave';

export type StandardColorway = {
  id: StandardColorwayId;
  background: string;
  wave: string; // hex the kettlewave mark is mechanically recolored to for this colorway
  border: string;
  text: string;
  textMuted: string; // a dimmer version of `text` for the eyebrow/footer
};

const BLACK = '#000000';

// THE FIVE COLORWAYS, word for word per the approved spec. Order here is
// also draw/display order wherever all five are shown together (e.g. this
// round's own screenshot sweep) -- randomized per completion is a separate
// pickRandomColorway() below, not this array's own order.
export const STANDARD_COLORWAYS: StandardColorway[] = [
  { id: 'augusta-green', background: colors.green, wave: colors.white, border: colors.gold, text: colors.white, textMuted: 'rgba(255,255,255,0.72)' },
  { id: 'bright-yellow', background: colors.gold, wave: KETTLEWAVE_NATIVE_HEX, border: colors.greenDeep, text: colors.greenDeep, textMuted: 'rgba(5,76,61,0.72)' },
  { id: 'black', background: BLACK, wave: colors.white, border: colors.gold, text: colors.white, textMuted: 'rgba(255,255,255,0.72)' },
  { id: 'green-yellow-wave', background: colors.green, wave: colors.goldBright, border: colors.goldBright, text: colors.white, textMuted: 'rgba(255,255,255,0.72)' },
  { id: 'black-yellow-wave', background: BLACK, wave: colors.goldBright, border: colors.goldBright, text: colors.white, textMuted: 'rgba(255,255,255,0.72)' },
];

// Test-only override: `window.__shareCardForceColorwayIndex` -- the same
// "force what the real mechanism would produce" technique
// scripts/verify-standalone-safe-area.js already uses throughout
// (window.__tourTestForceMissing, forceVisualViewportShrink) -- lets the
// suite drive each of the five real colorways deterministically instead of
// retrying Math.random() until the right one comes up. Real app code never
// reads or writes this.
export function pickRandomColorway(): StandardColorway {
  if (typeof window !== 'undefined') {
    const forced = (window as unknown as { __shareCardForceColorwayIndex?: number }).__shareCardForceColorwayIndex;
    if (typeof forced === 'number' && STANDARD_COLORWAYS[forced]) return STANDARD_COLORWAYS[forced];
  }
  return STANDARD_COLORWAYS[Math.floor(Math.random() * STANDARD_COLORWAYS.length)];
}

// "Fri · Dec 5 · '26" -- weekday abbr, month abbr + day, two-digit year
// with a leading apostrophe. Deliberately its own formatter (every other
// date format in this app is either longer or has no year at all) so a
// future change to those doesn't silently reformat the share card too.
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatShareCardDate(date: Date): string {
  const weekday = WEEKDAY_ABBR[date.getDay()];
  const month = MONTH_ABBR[date.getMonth()];
  const day = date.getDate();
  const year = String(date.getFullYear()).slice(-2);
  return `${weekday} · ${month} ${day} · '${year}`;
}

// Resolves a `require(...)`'d image to a real URI. This feature is web-only
// (a real DOM <canvas>, document.getElementById -- no native rendering path
// exists for it), and on web the Metro web bundler's asset registry already
// hands `require(...)` back as a plain {uri, width, height} object directly
// -- confirmed by reading the built bundle's own asset-registry entry for
// this exact file. Read `.uri` straight off that shape first; only fall
// back to RNImage.resolveAssetSource() for the numeric-asset-id shape native
// platforms use, which this web-only file should never actually see. This
// is the real fix for a bug caught directly, not guessed at: a first
// version called RNImage.resolveAssetSource() unconditionally, which threw
// `o.default.resolveAssetSource is not a function` in the real production
// bundle (traced to how this file's particular bundle chunk tree-shook the
// `react-native` Image import's own static method away) -- the kettlewave
// mark, counter, and progress bar never painted because the async draw's
// own promise rejected with nothing to catch it, leaving the loading
// spinner up forever. Reading `.uri` directly for the shape web actually
// produces sidesteps that broken call on the one path real members use.
function resolveUri(source: unknown): string {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object' && 'uri' in source) {
    return (source as { uri: string }).uri;
  }
  const resolved = RNImage.resolveAssetSource(source as number);
  return resolved.uri;
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load image: ${uri}`));
    img.src = uri;
  });
}

// Mechanically recolors the real committed kettlewave ink -- never
// redrawn -- by compositing a solid fill with `source-in`, which only
// paints where the source image's own alpha is already nonzero. The
// source PNG's shape (and only its shape) survives; the color is
// whatever this call asks for. Cached per hex so five colorways opening
// in a row (e.g. this round's own screenshot sweep) only ever decode and
// tint the source image once per distinct color.
const tintCache = new Map<string, Promise<HTMLCanvasElement>>();
function getTintedKettlewave(hex: string): Promise<HTMLCanvasElement> {
  const cached = tintCache.get(hex);
  if (cached) return cached;
  const promise = (async () => {
    const img = await loadImage(resolveUri(KETTLEWAVE_SOURCE));
    const off = document.createElement('canvas');
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const ctx = off.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    if (hex.toLowerCase() !== KETTLEWAVE_NATIVE_HEX.toLowerCase()) {
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, off.width, off.height);
    }
    return off;
  })();
  tintCache.set(hex, promise);
  return promise;
}

// Shrinks the font size until `text` fits within `maxWidth`, so an
// unusually long workout name (THE GAUNTLET vs. a longer Deck card title)
// never overflows the card instead of silently clipping.
function fitFontSize(ctx: CanvasRenderingContext2D, text: string, family: string, startSize: number, minSize: number, maxWidth: number): number {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  font: string,
  color: string,
  letterSpacing = 0
) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (letterSpacing === 0) {
    ctx.textAlign = 'center';
    ctx.fillText(text, centerX, y);
    ctx.textAlign = 'left';
    return;
  }
  // Canvas text has no native letter-spacing -- measured and drawn
  // character by character, centered as a whole block, so condensed-caps
  // eyebrows/footers read with the same deliberate tracking the rest of
  // the app's Barlow Condensed labels use.
  let totalWidth = 0;
  for (const ch of text) totalWidth += ctx.measureText(ch).width + letterSpacing;
  totalWidth -= letterSpacing;
  let x = centerX - totalWidth / 2;
  for (const ch of text) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + letterSpacing;
  }
}

export type LifetimeProgress = {
  // The member's lifetime completed-workout count AFTER this completion --
  // the same number HUNDRED_DOWN_TARGET/the badge compares against, so the
  // card and the Trophy Case can never disagree.
  workoutNumber: number;
};

export type StandardCardPayload = {
  variant: 'standard';
  colorway: StandardColorway;
  title: string;
  date: Date;
} & LifetimeProgress;

export type DeckCardPayload = {
  variant: 'deck';
  card: DeckCardData;
  date: Date;
  // The member's completed-deck-card count (non-Joker cards only -- see
  // AGENTS.md: "Out of 52, not 54, the Jokers are a hidden bonus").
  deckCardNumber: number;
} & LifetimeProgress;

export type ShareCardPayload = StandardCardPayload | DeckCardPayload;

const FOOTER_LINE_1 = "DOC'S FITNESS APP";
const FOOTER_LINE_2 = '@docsfitness_nj';

function drawFooter(ctx: CanvasRenderingContext2D, color: string, mutedColor: string) {
  const centerX = CARD_WIDTH / 2;
  drawCenteredText(ctx, FOOTER_LINE_1, centerX, CARD_HEIGHT - 86, `700 26px ${fonts.labelBold}`, color, 2);
  drawCenteredText(ctx, FOOTER_LINE_2, centerX, CARD_HEIGHT - 52, `22px ${fonts.body}`, mutedColor, 0.5);
}

// The progress bar + "N of 100 · Road to Hundred Down" line, or -- once
// the target is cleared -- the raw counter plus a small HUNDRED DOWN
// mark instead, per the approved spec ("After workout 100 the bar
// retires").
function drawProgressBlock(
  ctx: CanvasRenderingContext2D,
  workoutNumber: number,
  centerX: number,
  y: number,
  accent: string,
  text: string,
  muted: string,
  trackColor: string
) {
  const cleared = workoutNumber >= HUNDRED_DOWN_TARGET;
  if (!cleared) {
    const barWidth = 560;
    const barHeight = 10;
    const left = centerX - barWidth / 2;
    const pct = Math.max(0, Math.min(1, workoutNumber / HUNDRED_DOWN_TARGET));
    ctx.fillStyle = trackColor;
    roundRect(ctx, left, y, barWidth, barHeight, barHeight / 2);
    ctx.fill();
    ctx.fillStyle = accent;
    roundRect(ctx, left, y, Math.max(barHeight, barWidth * pct), barHeight, barHeight / 2);
    ctx.fill();
    drawCenteredText(
      ctx,
      `${workoutNumber} OF ${HUNDRED_DOWN_TARGET} · ROAD TO HUNDRED DOWN`,
      centerX,
      y + 42,
      `600 24px ${fonts.labelSemiBold}`,
      muted,
      1
    );
  } else {
    drawCenteredText(ctx, `WORKOUT No. ${workoutNumber}`.toUpperCase(), centerX, y + 10, `700 26px ${fonts.labelBold}`, text, 1);
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    const pillW = 230;
    const pillH = 40;
    const pillX = centerX - pillW / 2;
    const pillY = y + 30;
    roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.stroke();
    drawCenteredText(ctx, 'HUNDRED DOWN', centerX, pillY + 27, `700 20px ${fonts.labelBold}`, accent, 2);
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function drawStandardCard(ctx: CanvasRenderingContext2D, payload: StandardCardPayload) {
  const { colorway, title, date, workoutNumber } = payload;
  const centerX = CARD_WIDTH / 2;

  ctx.fillStyle = colorway.background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const borderInset = 28;
  ctx.strokeStyle = colorway.border;
  ctx.lineWidth = 6;
  ctx.strokeRect(borderInset, borderInset, CARD_WIDTH - borderInset * 2, CARD_HEIGHT - borderInset * 2);

  drawCenteredText(ctx, 'WORKOUT COMPLETE', centerX, 150, `700 28px ${fonts.labelBold}`, colorway.textMuted, 3);

  const titleSize = fitFontSize(ctx, title.toUpperCase(), fonts.headline, 92, 48, CARD_WIDTH - 140);
  drawCenteredText(ctx, title.toUpperCase(), centerX, 150 + 110, `${titleSize}px ${fonts.headline}`, colorway.text);

  drawCenteredText(ctx, formatShareCardDate(date), centerX, 150 + 170, `500 30px ${fonts.label}`, colorway.textMuted, 1);

  const wave = await getTintedKettlewave(colorway.wave);
  const waveHeight = 360;
  const waveWidth = waveHeight * (wave.width / wave.height);
  ctx.drawImage(wave, centerX - waveWidth / 2, 470, waveWidth, waveHeight);

  const standardTrack = colorway.id === 'bright-yellow' ? 'rgba(5,76,61,0.16)' : 'rgba(255,255,255,0.22)';
  drawProgressBlock(ctx, workoutNumber, centerX, 1000, colorway.border, colorway.text, colorway.textMuted, standardTrack);

  drawFooter(ctx, colorway.text, colorway.textMuted);
}

// Shared by the renderer and the overlay's own hidden test-readable debug
// text (see CompletionShareCardOverlay.tsx) -- one source of truth for
// "which ink color does this card use," so the suit-color assertion the
// suite makes is checking the exact value the canvas was actually drawn
// with, never a second, possibly-drifted copy of the same logic.
export function deckInkColor(card: DeckCardData): string {
  if (card.joker) return card.joker === 'red' ? colors.playingCardRed : BLACK;
  return isRedSuit(card.suit) ? colors.playingCardRed : BLACK;
}

async function drawDeckCard(ctx: CanvasRenderingContext2D, payload: DeckCardPayload) {
  const { card, date, workoutNumber, deckCardNumber } = payload;
  const centerX = CARD_WIDTH / 2;
  const ink = deckInkColor(card);
  const label = deckCardLabel(card);

  ctx.fillStyle = colors.white;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const borderInset = 28;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 4;
  ctx.strokeRect(borderInset, borderInset, CARD_WIDTH - borderInset * 2, CARD_HEIGHT - borderInset * 2);

  // Big corner indices, like a real playing card -- top-left as drawn,
  // bottom-right as the same block rotated 180 degrees.
  const drawIndex = () => {
    ctx.textAlign = 'left';
    ctx.fillStyle = ink;
    ctx.font = `64px ${fonts.headline}`;
    ctx.fillText(label, 0, 0);
  };
  ctx.save();
  ctx.translate(64, 110);
  drawIndex();
  ctx.restore();

  ctx.save();
  ctx.translate(CARD_WIDTH - 64, CARD_HEIGHT - 110);
  ctx.rotate(Math.PI);
  drawIndex();
  ctx.restore();

  drawCenteredText(ctx, "DOC'S DECK OF WODS", centerX, 150, `700 26px ${fonts.labelBold}`, ink, 3);

  const titleSize = fitFontSize(ctx, card.title.toUpperCase(), fonts.headline, 84, 44, CARD_WIDTH - 260);
  drawCenteredText(ctx, card.title.toUpperCase(), centerX, 150 + 110, `${titleSize}px ${fonts.headline}`, colors.text);

  drawCenteredText(ctx, formatShareCardDate(date), centerX, 150 + 170, `500 30px ${fonts.label}`, colors.textMuted, 1);

  // The green kettlewave center -- deliberately the real native color,
  // never suit-recolored, per the approved spec.
  const wave = await getTintedKettlewave(KETTLEWAVE_NATIVE_HEX);
  const waveHeight = 340;
  const waveWidth = waveHeight * (wave.width / wave.height);
  ctx.drawImage(wave, centerX - waveWidth / 2, 470, waveWidth, waveHeight);

  drawCenteredText(ctx, `CARD ${deckCardNumber} OF 52`, centerX, 900, `700 30px ${fonts.labelBold}`, ink, 2);

  drawProgressBlock(ctx, workoutNumber, centerX, 960, colors.green, colors.text, colors.textMuted, 'rgba(7,102,82,0.14)');

  drawFooter(ctx, colors.text, colors.textMuted);
}

export async function drawShareCard(canvas: HTMLCanvasElement, payload: ShareCardPayload): Promise<void> {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Fonts not ready isn't fatal -- the canvas falls back to the
      // platform default and still renders something, never a blank card.
    }
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (payload.variant === 'deck') {
    await drawDeckCard(ctx, payload);
  } else {
    await drawStandardCard(ctx, payload);
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
