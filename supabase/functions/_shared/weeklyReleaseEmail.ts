// Round 57: `import type`, not a value import — this file only ever needs
// getSupabaseAdmin's own return TYPE (ReturnType<typeof ...> below is a
// type query, which `import type` still supports), never the function
// itself. A plain `import` would still force Deno to resolve and evaluate
// supabaseAdmin.ts (and its own `https://esm.sh/@supabase/supabase-js@2`
// import) at module-load time even though nothing here ever calls it —
// `import type` is erased entirely before runtime, so this file can be
// rendered directly (e.g. by a standalone preview/screenshot script, or
// any sandbox with no live network path to esm.sh) with zero network
// dependency of its own.
import type { getSupabaseAdmin } from './supabaseAdmin.ts';
import {
  APP_URL,
  CTA_IMAGE_URL,
  LABEL_FONT_STACK,
  HEADLINE_FONT_STACK,
  LIGHT,
  escapeHtml,
  renderEmailDocument,
  renderFooterHtml,
  renderOpenAppButtonHtml,
} from './emailLayout.ts';

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export type WeeklyReleaseEmail = {
  subject: string;
  html: string;
  weekLabel: string;
};

function formatMD(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

// Round 58: Gmail's iOS/Android apps apply their own undocumented,
// per-color dark-mode transform to every message — unlike Apple Mail,
// Outlook, Yahoo, and Samsung Mail, Gmail never honors an author's
// `color-scheme`/`prefers-color-scheme` at all, so the Round 57 media query
// (see emailLayout.ts's own renderStyleBlock) is pure progressive
// enhancement for those other clients and never reaches Gmail. Gmail's
// heuristic operates per declared color, not per element, and (as widely
// documented by email-dev references, e.g. Litmus/Email on Acid's own
// Gmail dark-mode write-ups) its most reliable behavior is: a near-white
// background gets darkened, a near-black background gets lightened, and a
// light (near-white) TEXT color gets independently darkened wherever
// Gmail's own page-level flip judges the surrounding context to be light —
// regardless of what happened to that text's own real background. That's
// exactly the reported failure: this template's old header `<td>` was deep
// green (`#054C3D`, ~16% lightness — squarely in Gmail's "too dark, lighten
// it" band) while its headline text was pure white (~100% lightness,
// Gmail's "too light for what I assume is now a light page, darken it"
// band) — two independent flips that, applied together, produced a
// washed-out seafoam band UNDER dark, low-contrast ghost text, matching the
// owner's own real-device report precisely. The one guarantee Gmail's
// transform makes is that it never touches pixel content inside an
// `<img>` — so every pixel that must render in an EXACT brand color (the
// badge mark, the gold eyebrow, the white Bebas headline, all on true
// Augusta green) now ships as one pre-rendered image instead of live HTML
// colors Gmail could flip independently of each other.
//
// The real circular badge mark (DocsBadge's own "black" variant — solid
// white ink on transparent) used to be referenced here directly as a
// 64px HTML `<img>` sitting beside live eyebrow/headline text; that whole
// block is gone (see emailLayout.ts's own HEADER_IMAGE_URL) and
// public/badge-black.png itself is left in place, since other surfaces
// may still reference it.
//
// The approved header image (public/email-header.png, 1200x440 — a 600px
// email slot at 2x) already contains the badge, the gold "DOC'S FITNESS"
// eyebrow, and the white "YOUR WORKOUTS ARE HERE" headline baked onto true
// deep-green, as one flat, Gmail-immune bitmap. Same stable-URL convention
// badge-black.png already established: a plain file under public/, copied
// byte-for-byte to the GitHub Pages site root by `expo export -p web` with
// its own filename intact (never the Metro-hashed require() bundle path,
// which is an implementation detail of the bundler, not a stable URL).
//
// Round 59: real device evidence superseded Round 58's own lightness-band
// reasoning for the OPEN THE APP button — Gmail's dark transform repainted
// the live gold `bgcolor` button as a muddy olive with seafoam text anyway
// (confirmed on a real iPhone), proving the "mid-lightness backgrounds are
// left alone" heuristic isn't reliable enough for a color this
// brand-critical. Same fix as the header: the button ships as one hosted
// image instead of live HTML colors, since Gmail's transform never touches
// pixel content inside an `<img>`. public/email-cta-open-the-app.png
// (480x104, a 2x render for the real 240x52 display slot) is the owner's
// own approved gold-rounded-rect/deep-green-text asset, hosted the same
// stable-URL way email-header.png/badge-black.png already are.
//
// Round 61 Part 3: a real device recording of opening the Sunday Drop in
// Gmail iOS (dark mode) showed the header slot flashing seafoam green for a
// moment BEFORE the real header image painted. Confirmed directly by
// reading this file, not assumed, with TWO distinct live colors found in
// the two slots: (1) both `<img>` tags themselves carried an inline
// `background-color` (the header's own `LIGHT.greenDeep`, the CTA's own
// `LIGHT.gold`) — a real, live HTML color, part of the `<img>` element's
// own box, genuinely painted the instant the element lays out, regardless
// of whether the image itself has loaded yet (this is the box's background,
// not a placeholder drawn only on failure); and (2) the header image's own
// surrounding `<td>` carried that SAME `LIGHT.greenDeep` as its own
// background — invisible as a separate finding at a glance (it reads like
// it's just matching the image behind it), but it's a second, independent
// live color sitting directly behind the image slot, and removing only the
// `<img>`'s own background would still have left this one showing straight
// through a now-transparent image box. The CTA button's own surrounding
// `<td>` has no background color of its own, so only its `<img>` needed
// the fix. On a cold open through a slow proxy/CDN, either box can be
// visible for a real, human-perceptible span before the real image arrives
// — and because both are live HTML color, not pixel content inside the
// image, Gmail's own dark-mode transform (see the Round 58 comment above)
// can and did repaint them unpredictably in exactly the lightness band
// this whole image strategy was built to avoid. Every one of these
// `background-color` declarations is removed outright — the header `<td>`
// now carries the plain `.card-bg`/`${LIGHT.cardBg}` the rest of the body
// already uses (so it inherits the same dark-mode override with no new
// rule needed), and both slots now show only the card's own background
// until their image paints over it, never a second brand color of their
// own. Declared `width`/`height` on both `<img>` tags are untouched, so
// there is still zero layout reflow whenever either image does arrive.
//
// The alt-text fallback (shown only if the image never loads at all) is
// restyled to match: near-black `${LIGHT.text}` text with NO background
// color of its own, the identical inversion-safe pairing the body's
// day/date labels and workout names already use — rather than the old
// white-on-deep-green/deep-green-on-gold pairing, which was exactly as
// vulnerable to Gmail's live-color transform as the box behind it. The
// alt strings themselves, and Round 58's own font-size-zero-inheritance
// fix (the parent cell's `font-size:0` would otherwise collapse an
// unstyled fallback to invisible — both `<img>` tags still declare their
// own explicit `font-size`/`font-weight`/`font-family` for exactly that
// reason), are unchanged.
//
// Round 64: every one of the pieces described above (the font-face block,
// the dark-mode class rules, the header image row, the CTA button, the
// footer's "Doc's Fitness" line, the whole document shell) now lives in
// _shared/emailLayout.ts, reused byte-for-byte by the new welcome email —
// this file's own rendered output is unchanged by that extraction, verified
// directly (see the suite's [email/layout-extraction-no-drift] check).

// The ONE renderer for the Sunday Drop email — imported by both
// send-weekly-release-email (the real automatic send) and
// admin-send-test-email (the on-demand preview), so the two can never
// drift from each other or from what members actually receive. Mirrors
// release_scheduled_weeks_if_due()'s own YOUR WORKOUTS post format (day
// name + date + workout name, the Wednesday DOC'S COW line) without
// reusing its `[[`/`]]`/`|wod:`/`|cow` link-marker syntax — that syntax
// exists solely for the in-app post's own tap-to-navigate mechanism, which
// has no equivalent inside an email; here there is a single OPEN THE APP
// button instead, per the brief.
export async function buildWeeklyReleaseEmail(admin: SupabaseAdmin, weekId: string): Promise<WeeklyReleaseEmail | null> {
  const { data: week } = await admin.from('scheduled_weeks').select('id, week_start_date').eq('id', weekId).maybeSingle();
  if (!week) return null;

  const { data: wods } = await admin.from('scheduled_wods').select('day_of_week, name').eq('week_id', weekId);
  const { data: cow } = await admin.from('scheduled_cows').select('name').eq('week_id', weekId).maybeSingle();

  const byDay: Record<string, string> = {};
  for (const w of wods ?? []) byDay[w.day_of_week] = w.name;

  const dayRows: { label: string; text: string }[] = [];
  if (byDay.mon) dayRows.push({ label: `MONDAY ${formatMD(week.week_start_date)}`, text: byDay.mon });
  if (byDay.tue) dayRows.push({ label: `TUESDAY ${formatMD(addDays(week.week_start_date, 1))}`, text: byDay.tue });
  dayRows.push({
    label: `WEDNESDAY ${formatMD(addDays(week.week_start_date, 2))}`,
    text: cow ? `DOC'S COW · ${cow.name} (THE CHALLENGE OF THE WEEK)` : "DOC'S COW",
  });
  if (byDay.thu) dayRows.push({ label: `THURSDAY ${formatMD(addDays(week.week_start_date, 3))}`, text: byDay.thu });
  if (byDay.fri) dayRows.push({ label: `FRIDAY ${formatMD(addDays(week.week_start_date, 4))}`, text: byDay.fri });

  // Round 60: every workout row becomes a real tap target -- a plain
  // anchor to the exact same APP_URL the OPEN THE APP button already
  // uses, wrapping the WHOLE row's own content (day/date label and
  // workout name together) rather than just the name text, since that's
  // the larger, more reliably-tappable rectangle in a table-based email
  // layout -- `display:block` makes the anchor itself fill the cell's
  // full width and both text lines' combined height, not just the name
  // line. There is no per-day deep link -- the app has no URL mechanism
  // for landing on a specific day at all, and this round was explicit
  // that it must not invent one -- so every row, including the COW
  // Wednesday one, points at the same shared APP_URL.
  //
  // The link must stay visually invisible: `text-decoration:none` plus an
  // explicit inline `color` on the anchor itself (never left to inherit),
  // since several real email clients force their own blue-underlined link
  // styling onto any anchor that doesn't declare its own color. The two
  // child divs' own inline colors (muted gray for the label, near-black
  // for the name) are completely untouched by this change -- an element's
  // own inline color always wins over whatever an ancestor anchor
  // declares, so the exact approved look is preserved by construction,
  // not by coincidence.
  const rowsHtml = dayRows
    .map(
      (r, i) =>
        `<tr><td style="padding:12px 0;${i < dayRows.length - 1 ? `border-bottom:1px solid ${LIGHT.hairline};` : ''}" class="hairline-border">` +
        `<a href="${APP_URL}" style="display:block;text-decoration:none;color:${LIGHT.text};">` +
        `<div class="text-muted" style="color:${LIGHT.textMuted};font-size:12px;letter-spacing:0.5px;font-weight:700;font-family:${LABEL_FONT_STACK};">${escapeHtml(r.label)}</div>` +
        `<div class="text-strong" style="color:${LIGHT.text};font-size:21px;letter-spacing:0.3px;font-family:${HEADLINE_FONT_STACK};margin-top:2px;">${escapeHtml(r.text)}</div>` +
        `</a>` +
        '</td></tr>'
    )
    .join('');

  const bodyHtml = `<div class="text-strong" style="color:${LIGHT.text};font-size:13px;letter-spacing:1.5px;font-weight:700;margin-bottom:4px;font-family:${LABEL_FONT_STACK};">YOUR WORKOUTS</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
<!--
  Round 59: the OPEN THE APP button is now a hosted image, not a live
  bgcolor/HTML button — see CTA_IMAGE_URL's own comment above for why
  (real-device evidence that Gmail's dark transform repaints gold anyway).
-->
${renderOpenAppButtonHtml()}`;

  const html = renderEmailDocument({
    bodyHtml,
    footerHtml: renderFooterHtml({ includeOptOut: true }),
  });

  return { subject: 'YOUR WORKOUTS ARE HERE', html, weekLabel: `Week of ${formatMD(week.week_start_date)}` };
}
