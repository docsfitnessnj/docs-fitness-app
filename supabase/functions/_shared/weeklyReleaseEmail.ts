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

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export type WeeklyReleaseEmail = {
  subject: string;
  html: string;
  weekLabel: string;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatMD(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

// Round 57: the "OPEN THE APP" target — keep in sync with
// src/lib/links.ts's own APP_SHARE_URL, which this Deno function can't
// import directly (a different runtime/bundler boundary, same reason
// public/index.html's own og:url is a hand-kept literal rather than an
// import). No trailing slash, matching that constant exactly.
const APP_URL = 'https://docsfitnessnj.github.io/docs-fitness-app';

// Round 57: the real circular badge mark (DocsBadge's own "black" variant —
// confirmed directly, by sampling its pixels, to be solid WHITE ink on a
// transparent background, named "black" for the dark surface it's meant to
// sit on, not for its own ink color) — a plain, stable copy at
// public/badge-black.png, served by GitHub Pages at this exact URL. A
// hosted https URL, never a data URI (Gmail strips those) and never an
// attachment. Deliberately NOT the Metro-hashed bundle path
// (dist/assets/assets/brand/badge-black.<hash>.png) that `require()` would
// produce inside the app itself — that hash is an implementation detail of
// Metro's own bundler and isn't guaranteed stable across a dependency or
// config change, whereas `public/*` is copied byte-for-byte to the site
// root by `expo export -p web` with its own filename intact, exactly the
// same convention public/index.html's own og:image/twitter:image tags
// already use for share-image-v3.jpg/share-image-square-v3.jpg. Resized
// from the original 1384x1384 source down to 256x256 (strips EXIF/color
// profile too) — plenty of resolution for a ~64px display size at 2-4x
// retina, without shipping a 342KB image in every send.
const BADGE_LOGO_URL = `${APP_URL}/badge-black.png`;

// Google Fonts' own static gstatic URLs (the "latin" subset only — every
// character this email ever renders is plain ASCII) for the app's real
// display/label fonts (BebasNeue_400Regular, BarlowCondensed_600SemiBold/
// 700Bold in src/theme.ts). @font-face in a <style> block is read by Apple
// Mail (macOS/iOS), which is what makes the email genuinely render in the
// real fonts there — Gmail strips @font-face outright and always falls
// back to the stack's next entry, which is why every font-family below
// still carries a deliberately chosen non-webfont fallback (Impact for the
// condensed-display headline weight, Arial Narrow for the condensed label
// weight) so Gmail's own plain-Arial rendering still reads as bold,
// letterspaced, all-caps and "branded enough," not accidentally plain.
const FONT_FACES = `
  @font-face {
    font-family: 'Bebas Neue';
    font-style: normal;
    font-weight: 400;
    src: url(https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXoo9WlhyyTh89Y.woff2) format('woff2');
  }
  @font-face {
    font-family: 'Barlow Condensed';
    font-style: normal;
    font-weight: 600;
    src: url(https://fonts.gstatic.com/s/barlowcondensed/v13/HTxwL3I-JCGChYJ8VI-L6OO_au7B4873z3bWuYMBYro.woff2) format('woff2');
  }
  @font-face {
    font-family: 'Barlow Condensed';
    font-style: normal;
    font-weight: 700;
    src: url(https://fonts.gstatic.com/s/barlowcondensed/v13/HTxwL3I-JCGChYJ8VI-L6OO_au7B46r2z3bWuYMBYro.woff2) format('woff2');
  }
`;

const HEADLINE_FONT_STACK = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif";
const LABEL_FONT_STACK = "'Barlow Condensed', 'Arial Narrow', Helvetica, Arial, sans-serif";
const BODY_FONT_STACK = 'Helvetica, Arial, sans-serif';

// Light-mode colors straight off src/theme.ts's own `colors` object — the
// one source of truth for the app's real palette, kept as literals here
// since this Deno function has no access to that TS module either.
const LIGHT = {
  pageBg: '#FBFBF9', // colors.background
  cardBg: '#FFFFFF', // colors.card / colors.white
  green: '#076652',
  greenDeep: '#054C3D',
  gold: '#E5B80B',
  text: '#12211C', // colors.text
  textMuted: '#5F6B66', // colors.textMuted
  hairline: '#E8E6E0', // colors.hairline
};

// Dark-mode overrides. Only the elements that would otherwise read wrong
// against a client's own forced-dark page background change at all — the
// header/footer bands are already a deep, saturated green and the gold
// button already has enough contrast that neither needs a dark-mode
// variant of its own. "Legible and on brand, not pixel perfect" per the
// brief: Gmail's and Apple Mail's own dark-mode engines differ in exactly
// how much of this an author can actually control, so these values are a
// deliberate, tasteful fallback the `prefers-color-scheme: dark` media
// query below applies where a client honors it, not a guarantee every
// dark-mode client renders identically.
const DARK = {
  pageBg: '#12211C', // same near-black as colors.text, reused as a dark surface
  cardBg: '#17211D', // slightly lighter than pageBg, for a visible card edge
  text: '#FBFBF9',
  textMuted: '#9BA6A1',
  hairline: '#2E3A35',
};

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

  const rowsHtml = dayRows
    .map(
      (r, i) =>
        `<tr><td style="padding:12px 0;${i < dayRows.length - 1 ? `border-bottom:1px solid ${LIGHT.hairline};` : ''}" class="hairline-border">` +
        `<div class="text-muted" style="color:${LIGHT.textMuted};font-size:12px;letter-spacing:0.5px;font-weight:700;font-family:${LABEL_FONT_STACK};">${escapeHtml(r.label)}</div>` +
        `<div class="text-strong" style="color:${LIGHT.text};font-size:21px;letter-spacing:0.3px;font-family:${HEADLINE_FONT_STACK};margin-top:2px;">${escapeHtml(r.text)}</div>` +
        '</td></tr>'
    )
    .join('');

  // Email-client-safe: inline styles throughout (the real, always-applied
  // default), a plain table layout (no flex/grid), with a handful of class
  // names ALSO applied so the dark-mode media query below — which can only
  // ever target a class/id selector in a <style> block, never override a
  // plain inline style directly in every client — has something to hook
  // into. color-scheme/supported-color-schemes tell a client that reads
  // them this email has deliberately authored both appearances, rather
  // than leaving it to guess via its own automatic color-inversion
  // heuristics. No emojis anywhere.
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
${FONT_FACES}
body, .email-bg { background-color: ${LIGHT.pageBg} !important; }
.card-bg { background-color: ${LIGHT.cardBg} !important; }
.text-strong { color: ${LIGHT.text} !important; }
.text-muted { color: ${LIGHT.textMuted} !important; }
.hairline-border { border-color: ${LIGHT.hairline} !important; }
@media (prefers-color-scheme: dark) {
  body, .email-bg { background-color: ${DARK.pageBg} !important; }
  .card-bg { background-color: ${DARK.cardBg} !important; }
  .text-strong { color: ${DARK.text} !important; }
  .text-muted { color: ${DARK.textMuted} !important; }
  .hairline-border { border-color: ${DARK.hairline} !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${LIGHT.pageBg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-bg" style="background-color:${LIGHT.pageBg};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="100%" class="card-bg" style="max-width:480px;background-color:${LIGHT.cardBg};border-radius:12px;overflow:hidden;font-family:${BODY_FONT_STACK};" cellpadding="0" cellspacing="0">
<tr><td style="background-color:${LIGHT.greenDeep};padding:32px 24px;text-align:center;">
<img src="${BADGE_LOGO_URL}" width="64" height="64" alt="Doc's Fitness" style="display:block;margin:0 auto 14px auto;border:0;outline:none;" />
<div style="color:${LIGHT.gold};font-size:13px;letter-spacing:2px;font-weight:700;margin-bottom:8px;font-family:${LABEL_FONT_STACK};">DOC'S FITNESS</div>
<div style="color:#FFFFFF;font-size:34px;letter-spacing:0.5px;font-family:${HEADLINE_FONT_STACK};">THE NEW WEEK IS LIVE</div>
</td></tr>
<tr><td style="padding:24px 24px 8px 24px;">
<div style="color:${LIGHT.green};font-size:13px;letter-spacing:1.5px;font-weight:700;margin-bottom:4px;font-family:${LABEL_FONT_STACK};">YOUR WORKOUTS</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto 8px auto;">
<tr><td align="center" bgcolor="${LIGHT.gold}" style="background-color:${LIGHT.gold};border-radius:8px;">
<a href="${APP_URL}" style="display:inline-block;color:${LIGHT.greenDeep};font-weight:700;font-size:14px;letter-spacing:1px;text-decoration:none;padding:14px 36px;font-family:${LABEL_FONT_STACK};">OPEN THE APP</a>
</td></tr>
</table>
</td></tr>
<tr><td style="background-color:${LIGHT.greenDeep};padding:18px 24px;text-align:center;">
<div style="color:#FFFFFF;font-size:11px;font-family:${BODY_FONT_STACK};">Doc's Fitness</div>
<div style="color:#FFFFFF;opacity:0.75;font-size:11px;margin-top:6px;font-family:${BODY_FONT_STACK};">Don't want this email? Turn it off anytime in the app, under Settings &amp; Notifications.</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject: 'THE NEW WEEK IS LIVE', html, weekLabel: `Week of ${formatMD(week.week_start_date)}` };
}
