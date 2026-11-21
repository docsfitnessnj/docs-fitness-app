// Round 64: the shared brand shell behind every member-facing email this
// app sends — extracted out of weeklyReleaseEmail.ts (the Sunday Drop,
// which owned every one of these pieces alone through Round 61) so the
// new welcome email (welcomeEmail.ts) can reuse the exact same proven
// building blocks instead of a second, driftable copy of each one: the
// hosted header image, the 600px card, the inversion-safe near-black-on-
// card-background body colors, the gold OPEN THE APP image button, the
// @font-face block, and the dark-mode progressive-enhancement media
// query. weeklyReleaseEmail.ts's own rendered output is verified
// byte-for-byte unchanged after this extraction — see that file's own top
// comment and the suite's [email/layout-extraction-no-drift] check.
//
// Every comment explaining WHY a given piece looks the way it does (the
// Gmail dark-mode investigation, the alt-text font-size-zero fix, the
// reasoning behind the OPEN THE APP button's own color choice) stayed
// with weeklyReleaseEmail.ts, since that's where the real-device evidence
// was gathered — this file is just the resulting shape, not a second copy
// of that history.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// The "OPEN THE APP" / header-image target — keep in sync with
// src/lib/links.ts's own APP_SHARE_URL, which this Deno function can't
// import directly (a different runtime/bundler boundary, same reason
// public/index.html's own og:url is a hand-kept literal rather than an
// import). No trailing slash, matching that constant exactly.
export const APP_URL = 'https://docsfitnessnj.github.io/docs-fitness-app';

// public/email-header.png (1200x440, a 600px email slot at 2x) — the
// badge, the gold "DOC'S FITNESS" eyebrow, and the white headline baked
// onto true deep-green, as one flat, Gmail-immune bitmap. Same stable-URL
// convention as every other public/ asset: a plain file, copied
// byte-for-byte to the GitHub Pages site root by `expo export -p web`
// with its own filename intact (never the Metro-hashed require() bundle
// path). Reused as-is for the welcome email too, per the brief — there is
// no second header image, this round or any future one, unless a new
// approved asset says otherwise.
export const HEADER_IMAGE_URL = `${APP_URL}/email-header.png`;

// public/email-cta-open-the-app.png (480x104, a 2x render for the real
// 240x52 display slot) — the owner's own approved gold-rounded-rect/
// deep-green-text asset, hosted the same stable-URL way as every other
// image above.
export const CTA_IMAGE_URL = `${APP_URL}/email-cta-open-the-app.png`;

// Google Fonts' own static gstatic URLs (the "latin" subset only — every
// character any of these emails ever renders is plain ASCII) for the
// app's real display/label fonts (BebasNeue_400Regular,
// BarlowCondensed_600SemiBold/700Bold in src/theme.ts). @font-face in a
// <style> block is read by Apple Mail (macOS/iOS); Gmail strips
// @font-face outright and always falls back to the stack's next entry,
// which is why every font-family below still carries a deliberately
// chosen non-webfont fallback (Impact for the condensed-display headline
// weight, Arial Narrow for the condensed label weight) so Gmail's own
// plain-Arial rendering still reads bold, letterspaced, all-caps, and
// "branded enough."
export const FONT_FACES = `
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

export const HEADLINE_FONT_STACK = "'Bebas Neue', Impact, 'Arial Narrow', sans-serif";
export const LABEL_FONT_STACK = "'Barlow Condensed', 'Arial Narrow', Helvetica, Arial, sans-serif";
export const BODY_FONT_STACK = 'Helvetica, Arial, sans-serif';

// Light-mode colors straight off src/theme.ts's own `colors` object.
export const LIGHT = {
  pageBg: '#FBFBF9', // colors.background
  cardBg: '#FFFFFF', // colors.card / colors.white
  green: '#076652',
  greenDeep: '#054C3D',
  gold: '#E5B80B',
  text: '#12211C', // colors.text
  textMuted: '#5F6B66', // colors.textMuted
  hairline: '#E8E6E0', // colors.hairline
};

// Dark-mode overrides — see weeklyReleaseEmail.ts's own top comment for
// the full Gmail-vs-Apple-Mail investigation behind these exact values.
export const DARK = {
  pageBg: '#12211C',
  cardBg: '#17211D',
  text: '#FBFBF9',
  textMuted: '#9BA6A1',
  hairline: '#2E3A35',
};

// The shared <style> block: font-face declarations, the light-mode class
// rules, and the prefers-color-scheme: dark override — identical for
// every email built on this shell.
export function renderStyleBlock(): string {
  return `
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
`;
}

// The gold OPEN THE APP image button — a hosted bitmap (not live HTML
// color), since Gmail's own dark-mode transform never touches pixel
// content inside an <img> (see weeklyReleaseEmail.ts's own CTA_IMAGE_URL
// comment for the real-device evidence this is built on). Declared
// width/height plus inversion-safe alt-fallback styling, the Round 61
// fix: no live background-color on either the image or its slot.
export function renderOpenAppButtonHtml(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto 8px auto;">
<tr><td align="center">
<a href="${APP_URL}" style="display:inline-block;">
<img src="${CTA_IMAGE_URL}" width="240" height="52" alt="OPEN THE APP" style="display:block;border:0;outline:none;border-radius:8px;color:${LIGHT.text};font-size:16px;font-weight:700;letter-spacing:1px;font-family:${LABEL_FONT_STACK};" />
</a>
</td></tr>
</table>`;
}

// The footer card row — just the "Doc's Fitness" signature line for a
// one-time transactional email (the welcome email) with no recurring
// setting to point at; the Sunday Drop's own opt-out sentence ("Don't
// want this email? ...") is included only when includeOptOut is true,
// since it names a REAL Settings toggle (weekly_email_opt_in) that only
// applies to that recurring email — reusing it verbatim on the welcome
// email would point at a setting that doesn't control it.
export function renderFooterHtml(opts: { includeOptOut: boolean }): string {
  const optOutLine = opts.includeOptOut
    ? `\n<div class="text-muted" style="color:${LIGHT.textMuted};font-size:11px;margin-top:6px;font-family:${BODY_FONT_STACK};">Don't want this email? Turn it off anytime in the app, under Settings &amp; Notifications.</div>`
    : '';
  return `<tr><td class="card-bg" style="background-color:${LIGHT.cardBg};padding:18px 24px;text-align:center;">
<div class="text-strong" style="color:${LIGHT.text};font-size:11px;font-family:${BODY_FONT_STACK};">Doc's Fitness</div>${optOutLine}
</td></tr>`;
}

// The whole document shell: head/style, the outer page table, the 600px
// card, the header image row, a caller-supplied body row, and a
// caller-supplied footer row (built via renderFooterHtml above). Every
// email this app sends shares this one function — the only thing that
// ever differs between emails is bodyHtml and footerHtml. The header
// image's own alt text is a hardcoded literal, not a caller parameter,
// because every email this app sends (the Sunday Drop, the welcome email)
// reuses the exact same approved header image with the exact same
// baked-in headline per the brief's own instruction ("reusing the already
// proven building blocks: the existing hosted header image") — there has
// never been a reason for this to vary per template, the same way the
// OPEN THE APP button's own alt text below never varies either.
export function renderEmailDocument(opts: { bodyHtml: string; footerHtml: string }): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>${renderStyleBlock()}</style>
</head>
<body style="margin:0;padding:0;background-color:${LIGHT.pageBg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-bg" style="background-color:${LIGHT.pageBg};padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="100%" class="card-bg" style="max-width:600px;background-color:${LIGHT.cardBg};border-radius:12px;overflow:hidden;font-family:${BODY_FONT_STACK};" cellpadding="0" cellspacing="0">
<tr><td class="card-bg" style="background-color:${LIGHT.cardBg};padding:0;line-height:0;font-size:0;">
<img src="${HEADER_IMAGE_URL}" width="600" height="220" alt="DOC'S FITNESS. YOUR WORKOUTS ARE HERE." style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;color:${LIGHT.text};font-size:18px;font-weight:700;font-family:${LABEL_FONT_STACK};" />
</td></tr>
<tr><td style="padding:24px 24px 8px 24px;">
${opts.bodyHtml}
</td></tr>
${opts.footerHtml}
</table>
</td></tr>
</table>
</body>
</html>`;
}
