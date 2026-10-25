import { Image as RNImage } from 'react-native';
import { DeckCardData, isRedSuit } from '../data/deckCards';
import { colors, fonts } from '../theme';
import { HUNDRED_DOWN_TARGET } from '../context/BadgeContext';

// Round 33 polish: THE COMPLETION SHARE CARD's renderer, rebuilt to match
// the owner's seven committed reference renders pixel-for-pixel (see
// design-references/ at the repo root -- never shipped in the app bundle).
// Every constant below (ink-band positions, gaps, font sizes, colors) was
// measured directly off those PNGs (Python/PIL row-band + pixel-color
// scans), then cross-checked against the written "exact spec" prose in the
// round's own brief -- the two agreed almost exactly everywhere except the
// deck card's own aspect ratio (the written spec implied it shared the
// standard card's 4:5 canvas; the real exported deck references are a true
// 5:7 playing-card ratio, confirmed on both samples) and the written
// "flexible stretch zone between the date and the No. line" (empirically,
// both a 1-line-title standard sample and a 2-line-title deck sample
// produce the EXACT SAME date-to-No. gap, 26px -- meaning a plain,
// uniform, top-down additive layout using identical gap constants for both
// variants already reproduces both references exactly, with no special
// flex-grow case needed at all; see AGENTS.md for the full writeup). Where
// the images and the prose disagreed, the images were treated as
// authoritative, per this round's own explicit instruction.
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1357; // standard card: 4:5-ish, matches the 5 standard references exactly
export const DECK_CARD_HEIGHT = 1512; // deck card: a true 5:7 playing-card ratio, matches both deck references exactly

const KETTLEWAVE_SOURCE = require('../../assets/brand/kettlewave-green.png');
// The real committed ink's own color (confirmed directly against the PNG's
// own pixel data: solid #076652 everywhere alpha > 0, and the source PNG's
// own ink fills its canvas edge-to-edge with zero internal padding -- also
// confirmed directly) -- the one case that never needs a recolor pass.
const KETTLEWAVE_NATIVE_HEX = colors.green;

export type StandardColorwayId = 'augusta-green' | 'bright-yellow' | 'black' | 'green-yellow-wave' | 'black-yellow-wave';

export type StandardColorway = {
  id: StandardColorwayId;
  background: string;
  wave: string; // hex the kettlewave mark is mechanically recolored to for this colorway
  border: string;
  eyebrow: string;
  name: string; // workout title color
  date: string;
  no: string; // "WORKOUT No. X" color
  barTrack: string;
  barFill: string;
  road: string; // "N OF 100 · ROAD TO HUNDRED DOWN" color
  brand: string; // "DOC'S FITNESS APP"
  handle: string; // "@docsfitness_nj"
};

// THE FIVE COLORWAYS, exact hexes measured off the five committed
// reference PNGs (design-references/reference-card-{a..e}-*.png) and
// cross-confirmed against the brief's own color table. Order here is also
// draw/display order wherever all five are shown together (this round's
// own screenshot sweep) -- randomized per completion is pickRandomColorway()
// below, not this array's own order.
export const STANDARD_COLORWAYS: StandardColorway[] = [
  {
    id: 'augusta-green',
    background: colors.green, // #076652
    wave: colors.white,
    border: colors.gold, // #E5B80B
    eyebrow: colors.gold,
    name: colors.white,
    date: '#BFD6CF',
    no: colors.goldBright, // #FFD520
    barTrack: colors.greenDeep, // #054C3D
    barFill: colors.gold,
    road: '#BFD6CF',
    brand: colors.white,
    handle: '#BFD6CF',
  },
  {
    id: 'bright-yellow',
    background: colors.goldBright, // #FFD520
    wave: KETTLEWAVE_NATIVE_HEX, // #076652
    border: colors.greenDeep, // #054C3D
    eyebrow: colors.green,
    name: colors.text, // #12211C
    date: '#6B5E00',
    no: colors.greenDeep,
    barTrack: '#E3BC0E',
    barFill: colors.greenDeep,
    road: '#6B5E00',
    brand: colors.text,
    handle: '#6B5E00',
  },
  {
    id: 'black',
    background: '#0B0B0B',
    wave: colors.white,
    border: colors.gold,
    eyebrow: colors.gold,
    name: colors.white,
    date: '#9a9a93',
    no: colors.goldBright,
    barTrack: '#2a2a28',
    barFill: colors.gold,
    road: '#9a9a93',
    brand: colors.white,
    handle: '#9a9a93',
  },
  {
    // Same as augusta-green but border + wave + eyebrow go bright gold.
    id: 'green-yellow-wave',
    background: colors.green,
    wave: colors.goldBright,
    border: colors.goldBright,
    eyebrow: colors.goldBright,
    name: colors.white,
    date: '#BFD6CF',
    no: colors.goldBright,
    barTrack: colors.greenDeep,
    barFill: colors.gold,
    road: '#BFD6CF',
    brand: colors.white,
    handle: '#BFD6CF',
  },
  {
    // Same as black but border + wave + bar fill go bright gold (one more
    // override than green-yellow-wave gets -- per spec, verbatim).
    id: 'black-yellow-wave',
    background: '#0B0B0B',
    wave: colors.goldBright,
    border: colors.goldBright,
    eyebrow: colors.gold,
    name: colors.white,
    date: '#9a9a93',
    no: colors.goldBright,
    barTrack: '#2a2a28',
    barFill: colors.goldBright,
    road: '#9a9a93',
    brand: colors.white,
    handle: '#9a9a93',
  },
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
// is the fix for a real production bug caught directly (not guessed) in the
// round that first built this feature: calling RNImage.resolveAssetSource()
// unconditionally threw `o.default.resolveAssetSource is not a function` in
// the real production bundle (tree-shaken away in this chunk), silently
// stalling the card's own async draw forever behind an uncaught promise
// rejection.
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

// ---------------------------------------------------------------------
// Ink-top-anchored text drawing. Every Y position used by this file is
// measured from the reference PNGs as the TOP of a glyph's visible ink
// (cap-height, since every font used here -- Bebas Neue, Barlow Condensed
// -- is set in all-caps with no descenders in practice). Canvas has no
// native "position by ink top" mode, so this helper measures the real,
// currently-set font's own actualBoundingBoxAscent (the live distance from
// baseline to the top of THIS string's own ink, for whatever font actually
// loaded) and computes the baseline from it -- immune to font-metric
// differences between fonts/fallbacks, unlike a hardcoded baseline offset.
// ---------------------------------------------------------------------
function measureAscent(ctx: CanvasRenderingContext2D, text: string): number {
  const m = ctx.measureText(text || 'M');
  // Some engines report 0 for an empty/space-only string's bounding box;
  // fall back to the font's own nominal ascent so a blank line still
  // advances the cursor sensibly instead of collapsing to zero height.
  return m.actualBoundingBoxAscent || m.fontBoundingBoxAscent || 0;
}

// Draws `text` centered horizontally at `centerX`, with its own ink-top at
// `inkTopY`, returns the Y of the ink's own bottom edge (for chaining the
// next element's own margin off of).
function drawCenteredInkTop(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  inkTopY: number,
  font: string,
  color: string,
  letterSpacing = 0
): number {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  const ascent = measureAscent(ctx, text);
  const baselineY = inkTopY + ascent;
  if (letterSpacing === 0) {
    ctx.textAlign = 'center';
    ctx.fillText(text, centerX, baselineY);
    ctx.textAlign = 'left';
  } else {
    // Canvas text has no native letter-spacing -- measured and drawn
    // character by character, centered as a whole block, so condensed-caps
    // eyebrows/footers read with the same deliberate tracking the rest of
    // the app's Barlow Condensed labels use.
    let totalWidth = 0;
    for (const ch of text) totalWidth += ctx.measureText(ch).width + letterSpacing;
    totalWidth -= letterSpacing;
    let x = centerX - totalWidth / 2;
    ctx.textAlign = 'left';
    for (const ch of text) {
      ctx.fillText(ch, x, baselineY);
      x += ctx.measureText(ch).width + letterSpacing;
    }
  }
  return baselineY;
}

// Shrinks the font size until `text` fits within `maxWidth` -- a defensive
// fallback only, for a single "word" too wide to wrap (see wrapTitle()
// below); never engaged by any real workout/deck-card title in this app's
// own content today (checked directly).
function fitFontSize(ctx: CanvasRenderingContext2D, text: string, family: string, startSize: number, minSize: number, maxWidth: number): number {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

// Greedy word-wrap to AT MOST 2 lines, matching the real reference images
// (both committed deck samples, "PRACTICE MAKES PROGRESS" and "SAMPLE
// HEARTS CARD", wrap their own titles onto exactly two lines rather than
// shrinking to fit one -- confirmed directly by measuring the reference
// PNGs' own ink bands). If the first word alone is already too wide (an
// edge case with no real content example today), it's placed on its own
// line rather than split mid-word; fitFontSize() is the final line of
// defense against an unreasonably long single token.
function wrapTitle(ctx: CanvasRenderingContext2D, text: string, family: string, fontSize: number, maxWidth: number): string[] {
  ctx.font = `${fontSize}px ${family}`;
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(' ');
  let line1 = '';
  let i = 0;
  for (; i < words.length; i++) {
    const candidate = line1 ? `${line1} ${words[i]}` : words[i];
    if (line1 && ctx.measureText(candidate).width > maxWidth) break;
    line1 = candidate;
  }
  const line2 = words.slice(i).join(' ');
  if (!line2) return [line1];
  return [line1, line2];
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

// ---------------------------------------------------------------------
// Shared layout constants -- every one of these was measured directly off
// the committed reference PNGs (design-references/) via row-band pixel
// scans, cross-checked against the round's own written "multiply by 3.6"
// spec (which matched almost everywhere; see this file's own top comment
// for the two places the images won out). They are IDENTICAL between the
// standard and deck card -- confirmed directly: every single gap measured
// off the deck references (a 2-line-title case) matches its standard-card
// counterpart (a 1-line-title case) within 1px, which is what makes a
// single, uniform, top-down additive layout correct for both variants with
// no special-cased "flex" branch anywhere in this file.
// ---------------------------------------------------------------------
const BORDER_WIDTH = 7;
const CONTENT_INSET = 93; // card edge to content edge, padding(86) + border(7)
const CONTENT_WIDTH = CARD_WIDTH - CONTENT_INSET * 2; // 894 -- matches the measured progress-bar width exactly

const EYEBROW_INK_TOP = 121;
const GAP_EYEBROW_WAVE = 71;
const WAVE_HEIGHT = 332;
const GAP_WAVE_TITLE = 67;
const TITLE_FONT_SIZE = 158;
const TITLE_LINE_ADVANCE = 148; // ink-top of line 2 minus ink-top of line 1, measured directly off a wrapped deck reference
const GAP_TITLE_DATE = 60; // from the LAST title line's own ink bottom
const GAP_DATE_NO = 26; // "the No. line" -- WORKOUT No. X on the standard card, CARD X OF 52 on the deck card
const GAP_NO_BAR = 67;
const BAR_HEIGHT = 18;
const GAP_BAR_ROAD = 35;
const GAP_ROAD_BRAND = 68;
const GAP_BRAND_HANDLE = 34;

const EYEBROW_FONT = 40;
const EYEBROW_LETTER_SPACING = 8; // 0.2em of 40px
const DATE_FONT = 40;
const DATE_LETTER_SPACING = 6.4; // 0.16em of 40px
const NO_FONT = 108;
const ROAD_FONT = 36;
const ROAD_LETTER_SPACING = 5; // 0.14em of 36px
const BRAND_FONT = 54;
const BRAND_LETTER_SPACING = 7.6; // 0.14em of 54px
const HANDLE_FONT = 36;
const HANDLE_LETTER_SPACING = 6.5; // 0.18em of 36px

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawProgressBar(ctx: CanvasRenderingContext2D, topY: number, fraction: number, track: string, fill: string): number {
  const left = (CARD_WIDTH - CONTENT_WIDTH) / 2;
  const pct = Math.max(0, Math.min(1, fraction));
  ctx.fillStyle = track;
  roundRect(ctx, left, topY, CONTENT_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2);
  ctx.fill();
  ctx.fillStyle = fill;
  roundRect(ctx, left, topY, Math.max(BAR_HEIGHT, CONTENT_WIDTH * pct), BAR_HEIGHT, BAR_HEIGHT / 2);
  ctx.fill();
  return topY + BAR_HEIGHT;
}

// The "No." line: "WORKOUT No. X" on a standard card, "CARD X OF 52" on a
// deck card -- both pass their own already-formatted text in. Past 100,
// restyled to the same type scale as this line itself (per spec: "the
// counter shows the raw number... restyled to the same type scale as the
// WORKOUT No. line") plus a small outlined HUNDRED DOWN mark beside/below
// it, instead of the progress bar.
function drawNoAndProgress(
  ctx: CanvasRenderingContext2D,
  noText: string,
  workoutNumber: number,
  topY: number,
  centerX: number,
  noColor: string,
  accent: string,
  track: string,
  fill: string,
  roadColor: string,
  roadPrefix: string
): number {
  const y = drawCenteredInkTop(ctx, noText, centerX, topY, `${NO_FONT}px ${fonts.headline}`, noColor);
  const cleared = workoutNumber >= HUNDRED_DOWN_TARGET;
  if (!cleared) {
    const barY = y + GAP_NO_BAR;
    const barBottom = drawProgressBar(ctx, barY, workoutNumber / HUNDRED_DOWN_TARGET, track, fill);
    const roadText = `${roadPrefix}${workoutNumber} OF ${HUNDRED_DOWN_TARGET} · ROAD TO HUNDRED DOWN`;
    return drawCenteredInkTop(ctx, roadText, centerX, barBottom + GAP_BAR_ROAD, `${ROAD_FONT}px ${fonts.labelSemiBold}`, roadColor, ROAD_LETTER_SPACING);
  }
  // Cleared: a small outlined HUNDRED DOWN pill sits where the bar would
  // have been, same vertical rhythm (GAP_NO_BAR then GAP_BAR_ROAD-ish
  // spacing before whatever follows).
  const pillTop = y + GAP_NO_BAR;
  const pillH = 48;
  const pillW = 260;
  const pillX = centerX - pillW / 2;
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  roundRect(ctx, pillX, pillTop, pillW, pillH, pillH / 2);
  ctx.stroke();
  ctx.restore();
  drawCenteredInkTop(ctx, 'HUNDRED DOWN', centerX, pillTop + 15, `${ROAD_FONT}px ${fonts.labelBold}`, accent, ROAD_LETTER_SPACING);
  return pillTop + pillH;
}

function drawFooter(ctx: CanvasRenderingContext2D, topY: number, centerX: number, brandColor: string, handleColor: string) {
  const brandBottom = drawCenteredInkTop(ctx, FOOTER_LINE_1, centerX, topY, `${BRAND_FONT}px ${fonts.headline}`, brandColor, BRAND_LETTER_SPACING);
  drawCenteredInkTop(ctx, FOOTER_LINE_2, centerX, brandBottom + GAP_BRAND_HANDLE, `${HANDLE_FONT}px ${fonts.labelSemiBold}`, handleColor, HANDLE_LETTER_SPACING);
}

// Round 33 corners: the exported canvas is a plain, full-bleed rectangle
// filled edge-to-edge with the card's own background color -- no clip, no
// separate backdrop fill. The corners beyond the border stroke below
// simply continue in that same background color, for every variant.

// Round 33 "final touch" (owner decision, final): the border is now a
// plain SQUARE frame, not a rounded-rect path -- same stroke width, same
// inset, same colors, only the corner geometry changed. With the
// background already filling the canvas edge to edge (see above), a
// square frame leaves no corner region outside the border at all, which
// is the point: the saved/shared image reads as a clean framed card with
// nothing stray in the corners, and there's no rounded-vs-square seam to
// keep in sync between the canvas and anything else.
function strokeBorder(ctx: CanvasRenderingContext2D, color: string, height: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = BORDER_WIDTH;
  ctx.strokeRect(BORDER_WIDTH / 2, BORDER_WIDTH / 2, CARD_WIDTH - BORDER_WIDTH, height - BORDER_WIDTH);
}

async function drawStandardCard(ctx: CanvasRenderingContext2D, payload: StandardCardPayload) {
  const { colorway, title, date, workoutNumber } = payload;
  const centerX = CARD_WIDTH / 2;

  ctx.fillStyle = colorway.background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  strokeBorder(ctx, colorway.border, CARD_HEIGHT);

  let y = EYEBROW_INK_TOP;
  y = drawCenteredInkTop(ctx, 'WORKOUT COMPLETE', centerX, y, `${EYEBROW_FONT}px ${fonts.labelSemiBold}`, colorway.eyebrow, EYEBROW_LETTER_SPACING);

  const waveTop = y + GAP_EYEBROW_WAVE;
  const wave = await getTintedKettlewave(colorway.wave);
  const waveWidth = WAVE_HEIGHT * (wave.width / wave.height);
  ctx.drawImage(wave, centerX - waveWidth / 2, waveTop, waveWidth, WAVE_HEIGHT);
  y = waveTop + WAVE_HEIGHT;

  const titleTop = y + GAP_WAVE_TITLE;
  const titleMaxWidth = CONTENT_WIDTH - 40;
  const titleLines = wrapTitle(ctx, title.toUpperCase(), fonts.headline, TITLE_FONT_SIZE, titleMaxWidth);
  let titleFont = TITLE_FONT_SIZE;
  if (titleLines.length === 1) {
    titleFont = fitFontSize(ctx, titleLines[0], fonts.headline, TITLE_FONT_SIZE, 72, titleMaxWidth);
  } else {
    for (const line of titleLines) titleFont = Math.min(titleFont, fitFontSize(ctx, line, fonts.headline, titleFont, 72, titleMaxWidth));
  }
  let titleY = titleTop;
  titleLines.forEach((line, i) => {
    const bottom = drawCenteredInkTop(ctx, line, centerX, titleY, `${titleFont}px ${fonts.headline}`, colorway.name);
    if (i < titleLines.length - 1) titleY = titleTop + TITLE_LINE_ADVANCE;
    else y = bottom;
  });

  const dateTop = y + GAP_TITLE_DATE;
  y = drawCenteredInkTop(ctx, formatShareCardDate(date), centerX, dateTop, `${DATE_FONT}px ${fonts.labelSemiBold}`, colorway.date, DATE_LETTER_SPACING);

  const noTop = y + GAP_DATE_NO;
  y = drawNoAndProgress(
    ctx,
    `WORKOUT No. ${workoutNumber}`.toUpperCase(),
    workoutNumber,
    noTop,
    centerX,
    colorway.no,
    colorway.border,
    colorway.barTrack,
    colorway.barFill,
    colorway.road,
    ''
  );

  drawFooter(ctx, y + GAP_ROAD_BRAND, centerX, colorway.brand, colorway.handle);
}

// Shared by the renderer and the overlay's own hidden test-readable debug
// text (see CompletionShareCardOverlay.tsx) -- one source of truth for
// "which ink color does this card use," so the suit-color assertion the
// suite makes is checking the exact value the canvas was actually drawn
// with, never a second, possibly-drifted copy of the same logic.
export function deckInkColor(card: DeckCardData): string {
  if (card.joker) return card.joker === 'red' ? colors.playingCardRed : colors.text;
  return isRedSuit(card.suit) ? colors.playingCardRed : colors.text;
}

const CORNER_INSET_LEFT = 58;
const CORNER_INSET_TOP = 50;
const CORNER_RANK_FONT = 144;
const CORNER_SUIT_FONT = 101;
const CORNER_GAP = 101;

function drawCornerIndex(ctx: CanvasRenderingContext2D, rank: string, suit: string, ink: string, cardWidth: number, cardHeight: number) {
  const draw = () => {
    ctx.textAlign = 'left';
    ctx.fillStyle = ink;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${CORNER_RANK_FONT}px ${fonts.headline}`;
    const rankAscent = measureAscent(ctx, rank);
    ctx.fillText(rank, 0, rankAscent);
    if (suit) {
      ctx.font = `${CORNER_SUIT_FONT}px ${fonts.headline}`;
      const suitAscent = measureAscent(ctx, suit);
      ctx.fillText(suit, 0, rankAscent + CORNER_GAP + suitAscent);
    }
  };
  ctx.save();
  ctx.translate(CORNER_INSET_LEFT, CORNER_INSET_TOP);
  draw();
  ctx.restore();

  ctx.save();
  ctx.translate(cardWidth - CORNER_INSET_LEFT, cardHeight - CORNER_INSET_TOP);
  ctx.rotate(Math.PI);
  draw();
  ctx.restore();
}

async function drawDeckCard(ctx: CanvasRenderingContext2D, payload: DeckCardPayload) {
  const { card, date, workoutNumber, deckCardNumber } = payload;
  const centerX = CARD_WIDTH / 2;
  const ink = deckInkColor(card);
  const rank = card.joker ? 'JOKER' : card.rank;
  const suit = card.joker ? '' : card.suit ?? '';

  ctx.fillStyle = colors.white;
  ctx.fillRect(0, 0, CARD_WIDTH, DECK_CARD_HEIGHT);

  strokeBorder(ctx, ink, DECK_CARD_HEIGHT);

  drawCornerIndex(ctx, rank, suit, ink, CARD_WIDTH, DECK_CARD_HEIGHT);

  let y = EYEBROW_INK_TOP;
  y = drawCenteredInkTop(ctx, "DOC'S DECK OF WODS", centerX, y, `${EYEBROW_FONT}px ${fonts.labelSemiBold}`, colors.green, EYEBROW_LETTER_SPACING);

  const waveTop = y + GAP_EYEBROW_WAVE;
  // The green kettlewave center -- deliberately the real native color,
  // never suit-recolored, per the approved spec.
  const wave = await getTintedKettlewave(KETTLEWAVE_NATIVE_HEX);
  const waveWidth = WAVE_HEIGHT * (wave.width / wave.height);
  ctx.drawImage(wave, centerX - waveWidth / 2, waveTop, waveWidth, WAVE_HEIGHT);
  y = waveTop + WAVE_HEIGHT;

  const titleTop = y + GAP_WAVE_TITLE;
  const titleMaxWidth = CONTENT_WIDTH - 160; // extra clearance so the title never collides with the corner indices
  const titleLines = wrapTitle(ctx, card.title.toUpperCase(), fonts.headline, TITLE_FONT_SIZE, titleMaxWidth);
  let titleFont = TITLE_FONT_SIZE;
  if (titleLines.length === 1) {
    titleFont = fitFontSize(ctx, titleLines[0], fonts.headline, TITLE_FONT_SIZE, 72, titleMaxWidth);
  } else {
    for (const line of titleLines) titleFont = Math.min(titleFont, fitFontSize(ctx, line, fonts.headline, titleFont, 72, titleMaxWidth));
  }
  let titleY = titleTop;
  titleLines.forEach((line, i) => {
    const bottom = drawCenteredInkTop(ctx, line, centerX, titleY, `${titleFont}px ${fonts.headline}`, colors.text);
    if (i < titleLines.length - 1) titleY = titleTop + TITLE_LINE_ADVANCE;
    else y = bottom;
  });

  const dateTop = y + GAP_TITLE_DATE;
  y = drawCenteredInkTop(ctx, formatShareCardDate(date), centerX, dateTop, `${DATE_FONT}px ${fonts.labelSemiBold}`, colors.textMuted, DATE_LETTER_SPACING);

  const noTop = y + GAP_DATE_NO;
  y = drawNoAndProgress(
    ctx,
    `CARD ${deckCardNumber} OF 52`,
    workoutNumber,
    noTop,
    centerX,
    colors.green,
    colors.green,
    'rgba(7,102,82,0.16)',
    colors.green,
    colors.textMuted,
    'WORKOUT '
  );

  drawFooter(ctx, y + GAP_ROAD_BRAND, centerX, colors.text, colors.textMuted);
}

export async function drawShareCard(canvas: HTMLCanvasElement, payload: ShareCardPayload): Promise<void> {
  const height = payload.variant === 'deck' ? DECK_CARD_HEIGHT : CARD_HEIGHT;
  canvas.width = CARD_WIDTH;
  canvas.height = height;
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
