#!/usr/bin/env node
// Permanent regression guard for the installed, standalone iPhone PWA's
// safe-area handling.
//
// WHY THIS EXISTS, ROUND 7: two earlier rounds believed
// react-native-safe-area-context's useSafeAreaInsets()/<SafeAreaView> were
// inert on web. They are not. The library's own web implementation
// appends a hidden probe <div> to document.body sized by
// env(safe-area-inset-*), measures it, and feeds the real pixel values
// through context LIVE. In ordinary desktop/mobile BROWSER testing there
// is no notch, so that measurement is 0 either way -- indistinguishable
// from "does nothing," which is exactly what made this invisible to a
// Playwright suite that only forces this app's OWN CSS rules (the
// library's probe is a completely separate, independently-created
// element those rules never touch). On a real installed standalone
// iPhone it measures the REAL inset and applies it a second time, on top
// of this app's own fills -- the actual cause of a "roughly double" top
// offset and a bottom dead zone that this suite kept passing right
// through.
//
// THE FIX: App.tsx now renders AppSafeAreaProvider (see
// src/components/AppSafeAreaProvider.tsx), which pins
// useSafeAreaInsets()/<SafeAreaView> to zero on web PERMANENTLY, bypassing
// the library's own web measurement entirely -- by construction, not by
// accident of the test environment. The ONE sanctioned reader of
// env(safe-area-inset-*) on web is now the hidden probe pair in
// public/index.html (#safe-area-probe-top / #safe-area-probe-bottom),
// measured into the CSS custom properties --real-safe-top /
// --real-safe-bottom, which every one of this app's own fills/overrides
// consumes -- never env() directly, never insets.top/insets.bottom. See
// AGENTS.md's "Web safe-area insets: one source of truth" section.
//
// This script:
//   1. Greps the production build output (dist/) and asserts
//      "env(safe-area-inset" appears NOWHERE except the two sanctioned
//      probe rules in index.html -- the audit deliverable for this round.
//   2. Asserts no OTHER hidden, position:fixed/zIndex:-1 probe-shaped
//      element exists in the DOM besides this app's own two -- direct
//      proof the library's own live-measuring probe is never created,
//      not just that its output happens to read zero right now.
//   3. Forces --real-safe-top / --real-safe-bottom directly (the single
//      source of truth every legitimate consumer reads), then asserts, on
//      every key screen: the topmost rendered content begins at EXACTLY
//      the expected offset (not "at least"); exactly one top/bottom fill
//      is actually visible; and for the signed-in tab-bar shell, #root's
//      height equals the viewport height exactly.
//   4. A second, un-forced pass over the same screens proves the fix is a
//      no-op in ordinary browser chrome (every fill/override resolves to
//      0, nothing shifts).
//
// RUN THIS ON EVERY ROUND that touches a full-screen layout, adds a new
// one, or touches safe-area handling at all -- see AGENTS.md. It is NOT a
// substitute for the per-round Playwright verification scripts written ad
// hoc in the scratchpad; it's the one permanent check that specifically
// guards against this class of regression, wired in via
// `npm run verify:standalone-safe-area`.
//
// Prerequisites: a production static export (`npx expo export -p web`)
// served locally, e.g.:
//   npx expo export -p web
//   cp -r dist/* /tmp/docsfitness-root/docs-fitness-app/
//   (cd /tmp/docsfitness-root && python3 -m http.server 8090 &)
// Override the base URL with the BASE_URL env var if serving elsewhere,
// and DIST_DIR if the build output isn't at ../dist relative to this file.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:8090/docs-fitness-app';
// Optional: set to a directory to save the sign-in/group-chat screenshots
// this round's instructions explicitly asked for. Omitted by default so
// routine runs of this permanent suite don't write files into the repo.
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || null;
const DIST_DIR = process.env.DIST_DIR || path.join(__dirname, '..', 'dist');
const PROJECT_REF = 'qooezwnskaqvmquydijg';
const USER_ID = '99999999-9999-9999-9999-999999999999';
// A DIFFERENT member's id (never the signed-in USER_ID) -- used by the
// [search-deep-link/member] fixture below as a post author/search result
// whose profile the signed-in member views read-only.
const MEMBER_FIXTURE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// A Face-ID-era iPhone's real insets (iPhone 14/15/16 standard size).
const FORCED_TOP = 59;
const FORCED_BOTTOM = 34;

// The ONE way to simulate the installed standalone app now: force the
// single source of truth every fill/override reads. No per-id overrides
// needed anymore -- that's the point of routing everything through these
// two variables instead of env() directly.
const FORCE_INSET_CSS = `html { --real-safe-top: ${FORCED_TOP}px !important; --real-safe-bottom: ${FORCED_BOTTOM}px !important; }`;

// Every top-safe-area id in the app, and its flat baseline (the
// "ordinary browser chrome" breathing room folded additively with
// --real-safe-top at that id -- see public/index.html). Used to compute
// each screen's expected offset and to skip these ids when scanning for
// "topmost content".
const TOP_BASELINES = {
  'safe-area-top-fill': 0,
  'screen-overlay-safe-top-60': 60,
  'story-viewer-safe-top': 50,
  'create-post-safe-top': 16,
  'media-viewer-safe-top': 56,
  'invite-friend-safe-top': 48,
  'story-locked-safe-top': 60,
  'post-detail-safe-top': 60,
  'log-results-safe-top': 60,
  'sign-in-safe-top': 60,
  'pricing-safe-top': 60,
  'in-person-plans-safe-top': 60,
  'how-do-you-train-safe-top': 60,
  'forgot-password-safe-top': 60,
  'online-start-safe-top': 60,
  'set-new-password-safe-top': 60,
};
const ALL_TOP_IDS = Object.keys(TOP_BASELINES);

const BOTTOM_FILL_IDS = ['tab-bar-safe-area-fill', 'group-chat-composer-safe-area-fill', 'doc-thread-composer-safe-area-fill'];

// Every hidden, position:fixed/zIndex:-1 probe this app itself creates,
// unconditionally, on every page load -- the safe-area probes (Round 7)
// and DebugOverlay.web.tsx's own 100dvh/100vh probes (this round). All
// three share that exact CSS signature with react-native-safe-area-
// context's own (neutralized) web measurement probe, which is the whole
// point of auditNoUnsanctionedProbe() below -- so every one WE add here
// must be allowlisted by id, or it reads as a false "unsanctioned" hit.
const SANCTIONED_PROBE_IDS = [
  'safe-area-probe-top',
  'safe-area-probe-bottom',
  'debug-probe-100dvh',
  'debug-probe-100svh',
  'debug-probe-100lvh',
  'debug-probe-100vh',
];

// A real, decodable PNG built in-memory at any width/height (no fixture
// file to maintain, no binary committed to the repo) -- used by the
// create-post photo-preview checks below. PNG requires a correct CRC32 per
// chunk, not just well-formed bytes, so this is a minimal real encoder
// rather than a hand-assembled byte string that might only happen to work.
function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function buildSolidPng(width, height, [r, g, b]) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB
  const ihdr = pngChunk('IHDR', ihdrData);
  const row = Buffer.alloc(1 + width * 3); // filter byte (none) + width RGB pixels
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const idat = pngChunk('IDAT', zlib.deflateSync(raw));
  const iend = pngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}
// 1.5 (landscape) -- deliberately NOT close to the old bug's own ratio
// (a fixed 160px-tall box at ~350px rendered width, ~2.19), so a test
// against it can actually tell the fixed-crop bug and the real fix apart,
// and well under the 60%-of-screen-height cap at this viewport so the
// rendered box's own ratio should match this exactly (not letterboxed).
const ASPECT_RATIO_FIXTURE_PNG = buildSolidPng(300, 200, [60, 140, 90]);
const ASPECT_RATIO_FIXTURE_RATIO = 300 / 200;

// This round's own regression check needs a REAL, LARGE JPEG -- the real
// device report that motivated it was a genuine iPhone photo (HEIC-
// converted by the picker), not a small synthetic PNG, and the whole
// hypothesis under test is that a large/awkward real photo is exactly what
// can make Image.getSize() silently never resolve. `jpeg-js` (a small,
// well-tested pure-JS encoder/decoder, added as a devDependency purely for
// this fixture -- never shipped in the app bundle) produces a genuinely
// decodable baseline JPEG, the same way buildSolidPng above hand-rolls a
// real PNG rather than a byte string that only looks like one. The
// dimensions are a real iPhone 12MP photo's own resolution (4032x3024, a
// 4:3 ratio deliberately distinct from the PNG fixture's 1.5 above, so a
// test against each can't be satisfied by the same wrong number).
const jpeg = require('jpeg-js');
function buildSolidJpeg(width, height, [r, g, b]) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return jpeg.encode({ data: rgba, width, height }, 80).data;
}
const LARGE_JPEG_FIXTURE = buildSolidJpeg(4032, 3024, [90, 150, 110]);
const LARGE_JPEG_FIXTURE_RATIO = 4032 / 3024;

async function setupMocks(page) {
  await page.route('**/auth/v1/token*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: { id: USER_ID, email: 'member@example.com' } }),
    })
  );
  await page.route('**/auth/v1/user*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: USER_ID, email: 'member@example.com', aud: 'authenticated', role: 'authenticated' }) })
  );
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    if (table === 'profiles') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            display_name: 'Test Member',
            instagram_handle: '',
            favorite_quote: '',
            avatar_url: null,
            how_train: 'boathouse',
            is_admin: false,
            show_tomorrows_workout: true,
            tour_completed_at: new Date(Date.now() - 30 * 86400000).toISOString(),
            group_chat_muted: false,
          },
        ]),
      });
    }
    if (table === 'subscriptions') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            user_id: USER_ID,
            plan: 'monthly',
            status: 'active',
            current_period_end: new Date(Date.now() + 20 * 86400000).toISOString(),
            trial_end: null,
            cancel_at_period_end: false,
            stripe_customer_id: 'cus_test',
          },
        ]),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  await page.routeWebSocket(/realtime/, (ws) => ws.close());
}

async function seedSignedInSession(page) {
  await page.addInitScript(
    ({ projectRef, userId }) => {
      window.localStorage.setItem(
        `sb-${projectRef}-auth-token`,
        JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: userId, email: 'member@example.com', aud: 'authenticated', role: 'authenticated' } })
      );
    },
    { projectRef: PROJECT_REF, userId: USER_ID }
  );
}

// STEP 1's audit deliverable, enforced permanently: walks every file in
// the built output and asserts the literal text "env(safe-area-inset"
// appears nowhere except the two sanctioned probe CSS declarations in
// index.html. (The react-native-safe-area-context web bundle constructs
// its own env() string at runtime via a template literal, so it was never
// found by this kind of static grep in the first place -- that's WHY the
// behavioral check below, not this one alone, is what actually proves the
// library is neutralized. This check guards the static, sanctioned side:
// nobody adds a new raw env() rule anywhere else in the app's own CSS.)
function auditBuiltOutputEnvConsumers(record) {
  if (!fs.existsSync(DIST_DIR)) {
    record(`[audit] production build output exists at ${DIST_DIR}`, false, 'run `npx expo export -p web` first');
    return;
  }
  // Only an actual CSS declaration (not a comment/prose mention of the
  // same text, which this file's own writeup necessarily contains) counts
  // as a "consumer" for the sanctioned-list check below.
  const CSS_DECLARATION = /^(?:height|padding-top|top)\s*:\s*env\(safe-area-inset/;
  const sanctioned = new Set(['height: env(safe-area-inset-top, 0px);', 'height: env(safe-area-inset-bottom, 0px);']);
  const offenders = [];
  const allMentions = [];
  const codeDeclarations = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(html|css|js)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      let idx = 0;
      while ((idx = text.indexOf('env(safe-area-inset', idx)) !== -1) {
        const lineStart = text.lastIndexOf('\n', idx) + 1;
        const lineEnd = text.indexOf('\n', idx);
        const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();
        const rel = path.relative(DIST_DIR, full);
        allMentions.push(`${rel}: ${line}`);
        if (CSS_DECLARATION.test(line)) {
          codeDeclarations.push(`${rel}: ${line}`);
          if (!(rel === 'index.html' && sanctioned.has(line))) {
            offenders.push(`${rel}: ${line}`);
          }
        }
        idx += 1;
      }
    }
  }
  walk(DIST_DIR);

  console.log(`\n[audit] every env(safe-area-inset mention found in the built output (comments and prose included):`);
  allMentions.forEach((c) => console.log(`  - ${c}`));
  console.log(`[audit] of those, actual CSS declarations (what could affect layout):`);
  codeDeclarations.forEach((c) => console.log(`  - ${c}`));

  record(
    'built output: env(safe-area-inset is declared as CSS nowhere except the two sanctioned probe rules in index.html',
    offenders.length === 0,
    offenders.length ? JSON.stringify(offenders) : `${codeDeclarations.length} sanctioned declaration(s) found, 0 unsanctioned`
  );
}

// Round 23: 12-hour clock everywhere a time of day renders, never 24-hour/
// military time. Static half: these exact old-format strings (the 24-hour
// placeholder/hint/aria-label/error copy the Founding 50 admin time fields
// and the Content Library release-time field used to show) must never
// reappear anywhere in the built JS bundle, and their 12-hour replacements
// must actually be present -- a direct regression guard against a future
// round silently reverting to "HH:MM (24-hour)"-style copy. The
// behavioral half (does a specific rendered TIME VALUE actually show as
// 12-hour AM/PM, not just the static placeholder text) needs live app
// state no static grep can see -- that's the separate [12-hour-clock/*]
// block further down this file.
function auditTwelveHourClock(record) {
  if (!fs.existsSync(DIST_DIR)) {
    record('[audit] production build output exists for the 12-hour-clock check', false, 'run `npx expo export -p web` first');
    return;
  }
  let bundleText = '';
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.js$/.test(entry.name)) continue;
      bundleText += fs.readFileSync(full, 'utf8');
    }
  }
  walk(DIST_DIR);

  const FORBIDDEN_24H_STRINGS = [
    'HH:MM (24-hour)',
    '24-hour time, e.g. 06:00 or 18:00.',
    'Release time, 24 hour',
    'YYYY-MM-DD and HH:MM (24h)',
    'YYYY-MM-DD and time as HH:MM (24h)',
  ];
  const foundForbidden = FORBIDDEN_24H_STRINGS.filter((s) => bundleText.includes(s));
  record(
    'built output: no 24-hour/military-time placeholder, hint, or error copy remains anywhere (Founding 50 admin, Content Library release time)',
    foundForbidden.length === 0,
    foundForbidden.length ? JSON.stringify(foundForbidden) : 'none found'
  );

  const REQUIRED_12H_STRINGS = ['H:MM AM/PM', '12-hour time, e.g. 6:00 AM or 6:00 PM.'];
  const missingRequired = REQUIRED_12H_STRINGS.filter((s) => !bundleText.includes(s));
  record(
    'built output: the 12-hour AM/PM placeholder/hint copy that replaced it actually shipped',
    missingRequired.length === 0,
    missingRequired.length ? JSON.stringify(missingRequired) : 'all present'
  );
}

// Round 11's own audit: the viewport lock. Static, like the env() audit
// above -- the viewport meta and the gesturestart/change/end handlers are
// both plain, uncompiled text straight out of public/index.html's own
// <head>, present verbatim in the built output (expo export keeps this
// file close to as-authored; it isn't run through the JS bundler), so a
// grep is a direct, reliable check rather than a behavioral proxy.
function auditViewportLock(record) {
  if (!fs.existsSync(DIST_DIR)) {
    record('[audit] production build output exists for the viewport-lock check', false, 'run `npx expo export -p web` first');
    return;
  }
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    record('[audit] dist/index.html exists', false, `not found at ${indexPath}`);
    return;
  }
  const html = fs.readFileSync(indexPath, 'utf8');
  const viewportMatch = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/);
  const viewportContent = viewportMatch ? viewportMatch[1] : null;
  record(
    'built output: viewport meta contains maximum-scale=1',
    !!viewportContent && /maximum-scale=1\b/.test(viewportContent),
    JSON.stringify({ viewportContent })
  );
  record(
    'built output: viewport meta contains user-scalable=no',
    !!viewportContent && /user-scalable=no\b/.test(viewportContent),
    JSON.stringify({ viewportContent })
  );
  record(
    'built output: gesturestart/gesturechange/gestureend handlers are present (pinch-zoom belt-and-suspenders)',
    ['gesturestart', 'gesturechange', 'gestureend'].every((name) => html.includes(`'${name}'`)),
    JSON.stringify({
      hasStart: html.includes("'gesturestart'"),
      hasChange: html.includes("'gesturechange'"),
      hasEnd: html.includes("'gestureend'"),
    })
  );
  record('built output: touch-action is restricted on the app shell (no native pinch-zoom claim)', /touch-action:\s*pan-x pan-y/.test(html), JSON.stringify({ found: /touch-action:\s*pan-x pan-y/.test(html) }));
  // Round 13: interactive-widget=resizes-content (added in Round 12) was
  // deliberately removed -- on an iOS version that honors it, the OS's
  // own viewport resize and the JS --keyboard-inset rise would both fire
  // for the same keyboard open/close and fight each other. One mechanism
  // only (--keyboard-inset); this asserts the declarative one never
  // creeps back into the actual meta content -- checked against
  // viewportContent specifically (not the whole file), since this very
  // file's own prose comments legitimately mention the string
  // "interactive-widget" when explaining why it was removed.
  record(
    'built output: viewport meta does NOT declare interactive-widget (single keyboard mechanism only)',
    !!viewportContent && !viewportContent.includes('interactive-widget'),
    JSON.stringify({ viewportContent })
  );

  // Round 13's static half of the standalone-100lvh check (the behavioral
  // half is checkStandaloneShellHeight below). Chromium's CDP
  // Emulation.setEmulatedMedia does not honor "display-mode" as an
  // overridable feature in this environment (confirmed: the same features
  // array DOES work for prefers-color-scheme, so this is specific to
  // display-mode, not a broken mechanism) -- so there is no reliable way
  // to make the real @media (display-mode: standalone) block actually
  // match from this suite. This extracts that block's own source text by
  // brace-matching and asserts, statically: it exists; it sizes html,
  // body, #root, and the welcome/about roots; every height/min-height
  // declaration inside it ends the fallback chain at 100lvh; and --
  // directly answering this round's own "verify no other rule still pins
  // anything to 100dvh in standalone" -- the string 100dvh never appears
  // inside it at all.
  // The literal rule text (including its own opening brace) is searched
  // for specifically, not just the bare phrase "@media (display-mode:
  // standalone)" -- this file's own prose comments legitimately mention
  // that phrase too (explaining the rule, same as the interactive-widget
  // case above), and indexOf would otherwise match inside a comment and
  // brace-match into a completely unrelated CSS rule.
  var mediaStart = html.indexOf('@media (display-mode: standalone) {');
  var mediaBlock = null;
  if (mediaStart !== -1) {
    var braceStart = html.indexOf('{', mediaStart);
    if (braceStart !== -1) {
      var depth = 0;
      for (var i = braceStart; i < html.length; i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') {
          depth--;
          if (depth === 0) {
            mediaBlock = html.slice(braceStart + 1, i);
            break;
          }
        }
      }
    }
  }
  record('built output: an @media (display-mode: standalone) block exists', mediaBlock !== null, JSON.stringify({ found: mediaBlock !== null }));
  if (mediaBlock !== null) {
    var requiredSelectors = ['html', 'body', '#root', '#welcome-screen-root', '#about-screen-root'];
    var missingSelectors = requiredSelectors.filter((sel) => !mediaBlock.includes(sel));
    record('[standalone-lvh] the @media block sizes html/body/#root/welcome/about', missingSelectors.length === 0, JSON.stringify({ missingSelectors }));
    record('[standalone-lvh] the @media block ends its fallback chain at 100lvh', mediaBlock.includes('100lvh'), JSON.stringify({ hasLvh: mediaBlock.includes('100lvh') }));
    record(
      '[standalone-lvh] nothing inside the @media block still pins height to 100dvh',
      !mediaBlock.includes('100dvh'),
      JSON.stringify({ foundDvh: mediaBlock.includes('100dvh') })
    );
  }
}

// Walks every visible <input>/<textarea> on the current page and asserts
// each one's COMPUTED font-size (not just its authored style -- catches
// anything inherited, overridden, or otherwise resolved differently than
// the source implies) is at least 16px, the threshold below which iOS
// Safari auto-zooms the whole page on focus regardless of the viewport
// lock. expectAtLeast guards against a false "0 offenders" pass on a
// screen that silently failed to render any inputs at all (e.g. a broken
// selector/navigation step), the same false-negative shape as
// countVisibleTopSafeAreaElements's own "found but not actually there"
// trap elsewhere in this file.
async function auditInputFontSizes(page, label, record, expectAtLeast = 1) {
  const fields = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, textarea'))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((el) => ({
        id: el.id || el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.tagName,
        fontSize: parseFloat(getComputedStyle(el).fontSize),
      }));
  });
  const offenders = fields.filter((f) => !(f.fontSize >= 16));
  record(
    `[input-zoom/${label}] every visible text input has a computed font-size >= 16px (no silent iOS zoom trigger)`,
    fields.length >= expectAtLeast && offenders.length === 0,
    JSON.stringify({ fieldCount: fields.length, offenders })
  );
}

// Rounds 15 and 16 (full history in AGENTS.md) each stubbed
// visualViewport.height/.offsetTop directly -- not a CSS variable, the two
// live Web API properties the production mechanism actually reads -- to
// drive per-composer checks. Round 17 keeps this exact technique (it's
// still the right one) but drives a shell-level mechanism instead; see
// forceStandaloneDisplayMode() and runKeyboardShellRegimeCheck() below.
async function forceVisualViewport(page, { height, offsetTop }) {
  return page.evaluate(
    (forced) => {
      const vv = window.visualViewport;
      if (!vv) return false;
      if (typeof forced.height === 'number') {
        Object.defineProperty(vv, 'height', {
          get: function () {
            return forced.height;
          },
          configurable: true,
        });
      }
      if (typeof forced.offsetTop === 'number') {
        Object.defineProperty(vv, 'offsetTop', {
          get: function () {
            return forced.offsetTop;
          },
          configurable: true,
        });
      }
      vv.dispatchEvent(new Event('resize'));
      return true;
    },
    { height, offsetTop }
  );
}

async function resetVisualViewport(page) {
  return page.evaluate(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    delete vv.height;
    delete vv.offsetTop;
    vv.dispatchEvent(new Event('resize'));
  });
}

// window.innerHeight is stubbed the same way, for the same reason: three
// real-device snapshots showed it taking genuinely different values
// (874, 471, 725) for what looked like the same "keyboard open" moment on
// the same device, which is the whole reason Round 17's production
// mechanism never reads it at all. Stubbing it here anyway lets these
// checks prove that directly, rather than just asserting it by omission.
//
// Unlike visualViewport.height (an accessor on VisualViewport.prototype,
// so `delete`-ing an own override falls cleanly back to the real one),
// window.innerHeight turned out to be an OWN property of `window` itself
// in this Chromium -- confirmed directly: deleting an Object.defineProperty
// override of it leaves window.innerHeight as `undefined` permanently,
// not restored to the real value, because there's no prototype getter
// left to fall back to. The real value is captured once, into
// window.__realInnerHeight, before the first override, and resetInnerHeight
// restores exactly that -- not a `delete`, which would silently corrupt
// window.innerHeight (and anything that reads it, like --keyboard-inset's
// own fullHeight term) for the rest of the page's life.
async function forceInnerHeight(page, value) {
  return page.evaluate((v) => {
    if (typeof window.__realInnerHeight !== 'number') {
      window.__realInnerHeight = window.innerHeight;
    }
    Object.defineProperty(window, 'innerHeight', {
      get: function () {
        return v;
      },
      configurable: true,
    });
  }, value);
}

async function resetInnerHeight(page) {
  return page.evaluate(() => {
    if (typeof window.__realInnerHeight === 'number') {
      var real = window.__realInnerHeight;
      Object.defineProperty(window, 'innerHeight', {
        get: function () {
          return real;
        },
        configurable: true,
      });
    } else {
      delete window.innerHeight;
    }
  });
}

// Round 17's testing technique for a production mechanism gated on
// window.matchMedia('(display-mode: standalone)').matches: Round 13 found
// Chromium's CDP Emulation.setEmulatedMedia doesn't honor display-mode in
// this environment, and worked around it by forcing the resulting CSS
// directly -- which only covers CSS-only mechanisms. This round's shell
// resize is driven by JS that calls matchMedia() itself, so the more
// direct fix is to override window.matchMedia in the page's own JS
// context (via addInitScript, so it's in place before the app's inline
// script ever runs) and answer "yes" for exactly the display-mode query,
// passing every other query through to the real implementation unchanged.
// This does NOT make the browser's own CSS engine start matching a real
// @media (display-mode: standalone) block (that's a separate evaluation
// path this override can't reach, which is exactly why index.html's own
// shell-override rule is deliberately NOT nested inside that media query
// -- see its own comment) -- but syncKeyboardShellMode() and
// syncOffsetAndInsets() only ever ask JS's matchMedia(), so this exercises
// their real, unmodified gating logic end to end, which the CSS-forcing
// technique never could.
async function forceStandaloneDisplayMode(page) {
  await page.addInitScript(() => {
    const realMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (typeof query === 'string' && query.indexOf('display-mode') !== -1 && query.indexOf('standalone') !== -1) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: function () {},
          removeListener: function () {},
          addEventListener: function () {},
          removeEventListener: function () {},
          dispatchEvent: function () {
            return false;
          },
        };
      }
      return realMatchMedia(query);
    };
  });
}

async function readKeyboardShellState(page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const root = document.getElementById('root');
    const rect = root ? root.getBoundingClientRect() : null;
    return {
      attr: html.getAttribute('data-keyboard-shell'),
      shellHeightVar: getComputedStyle(html).getPropertyValue('--shell-keyboard-height').trim(),
      translateVar: getComputedStyle(html).getPropertyValue('--app-offset-top').trim(),
      rootRect: rect ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) } : null,
    };
  });
}

// The exact three real-device snapshots that motivated Round 17, captured
// on the same iPhone, same day: innerHeight disagreed with itself across
// identical-looking "keyboard open" moments, while visualViewport.height
// read 471 in every one -- which is exactly why the production mechanism
// only ever reads visualViewport.height/.offsetTop, never innerHeight.
const KEYBOARD_SHELL_REGIMES = [
  { name: 'Regime A', innerHeight: 471, vvHeight: 471, offsetTop: 341 },
  { name: 'Regime B', innerHeight: 874, vvHeight: 471, offsetTop: 0 },
  { name: 'Regime C', innerHeight: 725, vvHeight: 471, offsetTop: 149 },
];

// Round 17's own regression guard: drives one regime through the real,
// unmodified production listener (forceStandaloneDisplayMode() must already
// be active on this page) and asserts every hard requirement the escalation
// asked for -- the shell resizes to exactly visualViewport.height ignoring
// innerHeight entirely, the composer area sits fully inside the visual
// viewport, it survives a forced React re-render (typing), and closing the
// keyboard resets pixel-exact -- twice, to catch cumulative drift across a
// second open/close cycle. composerRiseId is purely a measurement anchor
// (the nativeID the composer row still carries from Rounds 15/16 -- no CSS
// rule or JS reads it anymore, see AGENTS.md) -- this function never
// touches it, only reads its rendered rect.
async function runKeyboardShellRegimeCheck(page, regime, record, { composerRiseId, inputSelector }) {
  const atRest = await readKeyboardShellState(page);
  record(
    `[keyboard-shell/${regime.name}] at rest before the regime is applied: no data-keyboard-shell attribute`,
    atRest.attr === null,
    JSON.stringify(atRest)
  );

  await forceInnerHeight(page, regime.innerHeight);
  await forceVisualViewport(page, { height: regime.vvHeight, offsetTop: regime.offsetTop });
  await page.waitForTimeout(200);

  const open = await readKeyboardShellState(page);
  const expectedBottom = regime.offsetTop + regime.vvHeight;
  record(
    `[keyboard-shell/${regime.name}] shell mode flips to "open" and #root resizes to exactly visualViewport.height (${regime.vvHeight}), ignoring innerHeight (${regime.innerHeight}) entirely`,
    open.attr === 'open' && open.shellHeightVar === regime.vvHeight + 'px' && !!open.rootRect && Math.abs(open.rootRect.height - regime.vvHeight) <= 1,
    JSON.stringify({ open, regime })
  );
  record(
    `[keyboard-shell/${regime.name}] #root's rendered box sits exactly on the visual viewport (top ${regime.offsetTop}, bottom ${expectedBottom})`,
    !!open.rootRect && Math.abs(open.rootRect.top - regime.offsetTop) <= 1 && Math.abs(open.rootRect.bottom - expectedBottom) <= 1,
    JSON.stringify({ open, regime })
  );

  const composerRect = await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
  }, composerRiseId);
  record(
    `[keyboard-shell/${regime.name}] the focused composer area sits fully inside the visual viewport`,
    !!composerRect && composerRect.bottom <= expectedBottom + 2 && composerRect.top >= regime.offsetTop - 2,
    JSON.stringify({ composerRect, regime, expectedBottom })
  );
  // Hard requirement 4: scrolling content behind the keyboard stays
  // reachable, not cut off. #root's own height shrinking is a CSS change,
  // not an overflow:hidden clip -- every flex sibling above the composer
  // (the message history) reflows to the smaller box through ordinary
  // flexbox, same as it already does the rest of the time. This asserts
  // that reflow actually left positive room for that content between
  // #root's own (shrunk) top and the composer's own top, rather than the
  // composer somehow consuming the entire shrunk shell.
  record(
    `[keyboard-shell/${regime.name}] positive room remains above the composer for scrollable content (nothing crushed to zero height)`,
    !!composerRect && !!open.rootRect && composerRect.top - open.rootRect.top > 20,
    JSON.stringify({ composerRect, rootRect: open.rootRect })
  );

  if (inputSelector) {
    await page
      .locator(inputSelector)
      .click({ timeout: 5000 })
      .catch(() => {});
    await page
      .locator(inputSelector)
      .type('Testing across keyboard regimes!', { delay: 15 })
      .catch(() => {});
    await page.waitForTimeout(300);
    const afterTyping = await readKeyboardShellState(page);
    record(
      `[keyboard-shell/${regime.name}] shell stays correctly sized after typing forces a React re-render (the exact failure mode Round 16's per-composer delivery hit)`,
      afterTyping.attr === 'open' && afterTyping.shellHeightVar === regime.vvHeight + 'px' && !!afterTyping.rootRect && Math.abs(afterTyping.rootRect.bottom - expectedBottom) <= 1,
      JSON.stringify({ afterTyping, regime })
    );
  }

  await resetInnerHeight(page);
  await resetVisualViewport(page);
  await page.waitForTimeout(200);
  const closed = await readKeyboardShellState(page);
  record(
    `[keyboard-shell/${regime.name}] closing the keyboard resets pixel-exact: no attribute, #root back to its original at-rest box`,
    closed.attr === null && !!closed.rootRect && !!atRest.rootRect && Math.abs(closed.rootRect.top - atRest.rootRect.top) <= 1 && Math.abs(closed.rootRect.height - atRest.rootRect.height) <= 1,
    JSON.stringify({ closed, atRest })
  );

  // A second open/close cycle, checked against the VERY FIRST at-rest
  // reading (not just the immediately prior "closed" one) -- a drift that
  // only shows up after two cycles would pass a single-cycle check.
  await forceInnerHeight(page, regime.innerHeight);
  await forceVisualViewport(page, { height: regime.vvHeight, offsetTop: regime.offsetTop });
  await page.waitForTimeout(200);
  await resetInnerHeight(page);
  await resetVisualViewport(page);
  await page.waitForTimeout(200);
  const closedAgain = await readKeyboardShellState(page);
  record(
    `[keyboard-shell/${regime.name}] a second open/close cycle leaves no cumulative drift -- #root still matches the very first at-rest reading exactly`,
    closedAgain.attr === null && !!closedAgain.rootRect && !!atRest.rootRect && Math.abs(closedAgain.rootRect.top - atRest.rootRect.top) <= 1 && Math.abs(closedAgain.rootRect.height - atRest.rootRect.height) <= 1,
    JSON.stringify({ closedAgain, atRest })
  );
}

// Round 14's own regression guard: the keyboard-inset-based "last keyboard
// snapshot" (see public/index.html's captureLastKeyboardSnapshot(), fired
// from visualViewport's own 'resize' listener whenever its height shrinks
// by more than 100px -- the same signal --keyboard-inset itself already
// reacts to). There is no way to summon a REAL on-screen keyboard in
// headless Chromium, so this uses the same "force what the real mechanism
// would produce" technique as FORCE_INSET_CSS and the Round 13
// standalone-lvh check above -- but for a read-only Web API property
// rather than a CSS custom property. VisualViewport's own `height`
// accessor is an ordinary, configurable WebIDL attribute (not
// [LegacyUnforgeable]), so shadowing it with an own, configurable property
// is a legitimate way to force its value, not a workaround for a
// locked-down one. Dispatching a real 'resize' event on visualViewport
// itself afterward means the exact same production listener that would
// run for a real keyboard open runs here, completely unmodified, reading
// the forced value through the exact same vv.height property access it
// always uses -- this is not a second, parallel test-only code path.
async function forceVisualViewportShrink(page, deltaPx) {
  return page.evaluate((delta) => {
    var vv = window.visualViewport;
    if (!vv) return null;
    var original = vv.height;
    var forced = Math.max(0, original - delta);
    Object.defineProperty(vv, 'height', {
      get: function () {
        return forced;
      },
      configurable: true,
    });
    vv.dispatchEvent(new Event('resize'));
    return { original: original, forced: forced };
  }, deltaPx);
}

// Round 13 investigated forcing real display-mode: standalone via
// Chromium's CDP Emulation.setEmulatedMedia ({ features: [{ name:
// 'display-mode', value: 'standalone' }] }) the way this file already
// forces color scheme etc. -- confirmed NOT honored in this environment
// (a direct sanity check: the identical call DOES flip
// prefers-color-scheme, so this is specific to display-mode). See the
// "[standalone-lvh]" checks below, which force the resulting CSS
// declarations directly instead, and auditViewportLock's static check of
// the real @media block's own source text.

// STEP 2's behavioral proof, which a static grep alone can't provide: the
// react-native-safe-area-context library builds its own env() string at
// runtime via a template literal (confirmed by reading the bundle), so a
// textual grep could never see it -- what actually matters is whether the
// library's own hidden, position:fixed, zIndex:-1 measurement probe ever
// gets created. If AppSafeAreaProvider is ever removed or bypassed, this
// is what would catch it regardless of the grep above.
async function auditNoUnsanctionedProbe(page) {
  return page.evaluate((sanctionedIds) => {
    const suspects = [];
    document.querySelectorAll('body > div').forEach((el) => {
      if (sanctionedIds.includes(el.id)) return;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && cs.zIndex === '-1') {
        suspects.push({ id: el.id || '(no id)', style: el.getAttribute('style') });
      }
    });
    return suspects;
  }, SANCTIONED_PROBE_IDS);
}

// Finds the topmost ACTUALLY-VISIBLE, non-empty leaf-ish element on the
// page -- "topmost rendered content" for the clipping/offset assertion.
// Walks down from y=0 using elementFromPoint, which (unlike a plain
// querySelectorAll scan over getBoundingClientRect) respects real
// paint/stacking order: an element fully covered by a later, higher
// z-index sibling (e.g. AppTopBar's menu icon, still mounted but hidden
// behind a full-screen ScreenOverlay) is correctly skipped, instead of
// being misreported as "topmost" just because its own box happens to sit
// at a smaller y. Probes two x positions (left-aligned back buttons vs.
// centered headers) and keeps the smaller of the two.
async function topmostContentTop(page, allTopIds) {
  return page.evaluate((skipIdList) => {
    const skipIds = new Set(skipIdList.concat(['tab-bar-safe-area-fill', 'group-chat-composer-safe-area-fill', 'doc-thread-composer-safe-area-fill']));
    function hasOwnContent(el) {
      const isLeafText = el.textContent && el.textContent.trim().length > 0 && el.children.length === 0;
      const cs = window.getComputedStyle(el);
      return isLeafText || el.tagName === 'IMG' || el.tagName === 'SVG' || (cs.borderTopWidth && cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none');
    }
    function scanAt(x) {
      for (let y = 0; y < Math.min(window.innerHeight, 400); y += 2) {
        const el = document.elementFromPoint(x, y);
        if (!el || skipIds.has(el.id)) continue;
        let node = el;
        while (node && node !== document.body) {
          if (!skipIds.has(node.id) && hasOwnContent(node)) {
            const rect = node.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) return rect.top;
          }
          node = node.parentElement;
        }
      }
      return null;
    }
    const left = scanAt(40);
    const center = scanAt(Math.floor(window.innerWidth / 2));
    const candidates = [left, center].filter((v) => v !== null);
    return candidates.length ? Math.min(...candidates) : null;
  }, allTopIds);
}

// Counts how many elements matching any known top-safe-area id are
// ACTUALLY painted (not covered by a later, higher-stacking sibling --
// e.g. the always-mounted AppTopBar's own fill sitting behind a full-
// screen ScreenOverlay is a legitimate, simultaneously-mounted second
// element, but it's never the one contributing to what's on screen, so
// it must not count as a "duplicate" here).
//
// This is a PAINT-stacking check, not an interactivity check -- but since
// Round 9 every fill carries pointer-events:none (see AGENTS.md), the
// browser's own hit-testing (elementFromPoint) now unconditionally skips
// these elements, which would make every count read 0 regardless of
// actual stacking. So each candidate element's pointer-events is flipped
// to 'auto' for the duration of this synchronous evaluate() call only
// (restored before it returns, so nothing the rest of the suite or a real
// user sees ever observes the change) -- purely a measurement technique
// for this test, not a reversal of the production fix.
async function countVisibleTopSafeAreaElements(page, allTopIds) {
  return page.evaluate((ids) => {
    // react-native-web compiles pointerEvents="none" to a stylesheet rule
    // with !important (`.r-xxxxx { pointer-events: none !important; }`),
    // so a plain el.style.pointerEvents assignment (no !important) can't
    // override it -- only an inline style that ALSO carries !important
    // can beat a stylesheet !important rule, regardless of selector
    // specificity. setProperty(..., 'important') is that.
    const touched = [];
    for (const id of ids) {
      for (const el of document.querySelectorAll(`#${CSS.escape(id)}`)) {
        touched.push({ el, prev: el.style.getPropertyValue('pointer-events'), prevPriority: el.style.getPropertyPriority('pointer-events') });
        el.style.setProperty('pointer-events', 'auto', 'important');
      }
    }
    let count = 0;
    for (const id of ids) {
      for (const el of document.querySelectorAll(`#${CSS.escape(id)}`)) {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const x = rect.left + Math.min(rect.width / 2, 5);
        const y = rect.top + Math.min(rect.height / 2, 5);
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) count += 1;
      }
    }
    touched.forEach(({ el, prev, prevPriority }) => {
      if (prev) el.style.setProperty('pointer-events', prev, prevPriority);
      else el.style.removeProperty('pointer-events');
    });
    return count;
  }, allTopIds);
}

async function bottomFillReachesEdge(page, fillId) {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { height: rect.height, bottom: rect.bottom, windowHeight: window.innerHeight };
  }, fillId);
}

// Round 9's own regression guard: a buried-control check. A fill or
// overlay is paint, not a control (see pointerEvents="none" on
// SafeAreaTopFill/SafeAreaBottomFill) -- but this proves it at the one
// point that actually matters: what does the browser's own hit-testing
// return at the control's visual center, with real insets forced. Finds
// the control via its CSS selector, reads its geometry, and asserts the
// element elementFromPoint actually returns there is the control itself
// or one of its own descendants (an icon/label inside a Pressable) --
// never a sibling fill/overlay that happens to paint on top of it. This
// is what would have caught the real-device bug this round fixes (the
// story viewer's X silently swallowed by a tap zone) before a real device
// had to find it, and now guards every future screen's controls the same
// way.
async function hitTestsControl(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { found: true, visible: false };
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    const ok = !!hit && (hit === el || el.contains(hit));
    return {
      found: true,
      visible: true,
      ok,
      hit: hit ? hit.tagName + (hit.id ? `#${hit.id}` : '') + (hit.getAttribute && hit.getAttribute('data-testid') ? `[data-testid=${hit.getAttribute('data-testid')}]` : '') : null,
    };
  }, selector);
}

// Same check as hitTestsControl, but for the Nth match of a selector that
// matches several controls at once (the tab bar's four tabs all share
// role="tab", so they aren't individually addressable by a unique CSS
// selector the way a testID-bearing control is).
async function hitTestsNth(page, selector, index) {
  return page.evaluate(
    ({ sel, idx }) => {
      const el = document.querySelectorAll(sel)[idx];
      if (!el) return { found: false };
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { found: true, visible: false };
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      const ok = !!hit && (hit === el || el.contains(hit));
      return { found: true, visible: true, ok, hit: hit ? hit.tagName + (hit.id ? `#${hit.id}` : '') : null };
    },
    { sel: selector, idx: index }
  );
}

// Round 10's own regression guard: the tab bar's bottom density. Finds
// the first tab's own label text node (the deepest element actually
// containing "COMMUNITY", not an ancestor box inflated by react-
// navigation's own flex-stretch slack -- see tabBarHeight.ts) and returns
// the gap between its rendered bottom edge and the physical viewport
// bottom. This is the number a person actually looks at ("how much empty
// space is below the label"), independent of how that space happens to
// be built out of the tab bar's own padding vs. the safe-area fill.
async function tabLabelBaselineGap(page) {
  return page.evaluate(() => {
    const firstTab = document.querySelector('[role="tab"]');
    if (!firstTab) return null;
    const walker = document.createTreeWalker(firstTab, NodeFilter.SHOW_ELEMENT);
    let node;
    let labelEl = null;
    while ((node = walker.nextNode())) {
      if (node.textContent && node.textContent.trim().length > 0 && node.children.length === 0) labelEl = node;
    }
    if (!labelEl) return null;
    const rect = labelEl.getBoundingClientRect();
    // scrollHeight vs. rendered height: if the row ever gets compressed
    // below what the label actually needs, the label is the first thing
    // to visibly clip -- this catches that directly, independent of the
    // baseline-gap number possibly still looking "right" by coincidence.
    const clipped = labelEl.scrollHeight > Math.ceil(rect.height) + 1;
    return { gap: window.innerHeight - rect.bottom, clipped };
  });
}

async function run() {
  const browser = await chromium.launch();
  const results = [];
  const record = (name, pass, detail) => {
    results.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ' -- ' + detail : ''}`);
  };

  auditBuiltOutputEnvConsumers(record);
  auditTwelveHourClock(record);
  auditViewportLock(record);

  const VIEWPORT = { width: 390, height: 844 };

  async function checkScreen(
    label,
    navigate,
    {
      expectBottomFill = false,
      fillId = 'tab-bar-safe-area-fill',
      // The tab bar's own fill is colors.card (white) -- but a composer
      // fill (group chat, Boathouse schedule thread) intentionally
      // matches colors.background instead, by design, not a bug. Each
      // screen's own expected color is passed here rather than assumed.
      bottomFillColor = 'rgb(255, 255, 255)',
      signedIn = true,
      topId,
      checkRootHeightExact = signedIn,
      skipOffsetCheck = false,
    } = {}
  ) {
    const baseline = TOP_BASELINES[topId];

    // Baseline: no forced inset. Every fill/override must resolve to just
    // its flat baseline (0 for a pure fill) and nothing may shift.
    {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await setupMocks(page);
      if (signedIn) await seedSignedInSession(page);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await navigate(page);
      await page.waitForTimeout(400);

      const ownValue = await page.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const padding = parseFloat(window.getComputedStyle(el).paddingTop);
        return !Number.isNaN(padding) && padding > 0 ? padding : rect.height;
      }, topId);
      if (ownValue !== null) {
        record(`[baseline/${label}] #${topId} resolves to its flat baseline (${baseline}px) in ordinary browser chrome`, Math.abs(ownValue - baseline) <= 1, JSON.stringify({ ownValue, baseline }));
      }
      if (expectBottomFill) {
        const bf = await bottomFillReachesEdge(page, fillId);
        if (bf) record(`[baseline/${label}] bottom fill is 0px in ordinary browser chrome`, bf.height === 0, JSON.stringify(bf));
      }
      await context.close();
    }

    // Forced inset: simulates the installed standalone app by setting
    // --real-safe-top / --real-safe-bottom directly -- the single source
    // of truth every legitimate consumer reads.
    {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await setupMocks(page);
      if (signedIn) await seedSignedInSession(page);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await navigate(page);
      await page.waitForTimeout(400);
      await page.addStyleTag({ content: FORCE_INSET_CSS });
      await page.waitForTimeout(200);

      const probeSuspects = await auditNoUnsanctionedProbe(page);
      record(`[forced-inset/${label}] no unsanctioned hidden probe element exists (react-native-safe-area-context's own web measurement was never created)`, probeSuspects.length === 0, JSON.stringify(probeSuspects));

      // A screen whose main content is vertically CENTERED rather than
      // anchored right below the fill (the pre-signup hero screens) has
      // no single well-defined "topmost content" pixel to check here --
      // its correctness is already covered by the baseline-resolves-
      // correctly and exactly-one-mechanism assertions below. For every
      // other (top-anchored) screen, a tolerance of 15px absorbs ordinary
      // internal design padding (a bar's own paddingVertical, a drawer
      // row's own spacing, DOC'S GROUP CHAT's fixed 14px header breathing
      // room) that was never part of the inset in the first place, while
      // still catching real stacking -- which adds a second ~50-60px
      // inset, far outside this window.
      if (!skipOffsetCheck) {
        const expectedTop = baseline + FORCED_TOP;
        const top = await topmostContentTop(page, ALL_TOP_IDS);
        record(
          `[forced-inset/${label}] topmost rendered content begins at the expected ${expectedTop}px offset (baseline ${baseline} + forced inset ${FORCED_TOP}), not a multiple of it`,
          top !== null && Math.abs(top - expectedTop) <= 15,
          JSON.stringify({ top, expectedTop })
        );
      }

      const elementCount = await countVisibleTopSafeAreaElements(page, ALL_TOP_IDS);
      record(`[forced-inset/${label}] exactly one top-safe-area mechanism is actually visible for this screen (no stacked duplicate)`, elementCount === 1, JSON.stringify({ elementCount }));

      if (expectBottomFill) {
        const bf = await bottomFillReachesEdge(page, fillId);
        record(
          `[forced-inset/${label}] bottom fill paints to the physical bottom edge`,
          !!bf && bf.height === FORCED_BOTTOM && Math.abs(bf.bottom - bf.windowHeight) <= 1,
          JSON.stringify(bf)
        );

        const bottomFillCount = await page.evaluate((ids) => ids.reduce((sum, id) => sum + document.querySelectorAll(`#${CSS.escape(id)}`).length, 0), BOTTOM_FILL_IDS);
        record(`[forced-inset/${label}] exactly one bottom fill element present in the rendered DOM`, bottomFillCount === 1, JSON.stringify({ bottomFillCount }));

        const rootHeight = await page.evaluate(() => {
          const root = document.getElementById('root');
          return { rootHeight: root ? root.getBoundingClientRect().height : null, windowHeight: window.innerHeight };
        });
        const pass = checkRootHeightExact
          ? rootHeight.rootHeight !== null && Math.abs(rootHeight.rootHeight - rootHeight.windowHeight) <= 1
          : rootHeight.rootHeight !== null && rootHeight.rootHeight >= rootHeight.windowHeight - 1;
        record(
          `[forced-inset/${label}] rendered #root height ${checkRootHeightExact ? 'equals' : 'is at least'} the viewport height -- no gap of page background below the tab bar fill`,
          pass,
          JSON.stringify(rootHeight)
        );

        // The bottommost ROW of the page (the physical edge) must be
        // painted by the tab bar's own fill (colors.card, white) -- never
        // by html/body's own background-color backstop (colors.background,
        // #FBFBF9), which would mean #root fell short of the real
        // viewport and the bare page is showing through underneath. This
        // is the "gray strip" this round's bug report described directly:
        // not just "is there a gap" (the height check above) but "what
        // color is painted at the very edge."
        //
        // Same pointer-events caveat as countVisibleTopSafeAreaElements
        // (react-native-web's pointerEvents="none" compiles to a
        // stylesheet rule with !important, so only an inline override
        // that ALSO carries !important can beat it): flipped to 'auto'
        // for this synchronous call only and restored before returning --
        // a measurement technique, not a reversal of the fix.
        const bottomEdgeColor = await page.evaluate((ids) => {
          const touched = [];
          for (const id of ids) {
            const el = document.getElementById(id);
            if (el) {
              touched.push({ el, prev: el.style.getPropertyValue('pointer-events'), prevPriority: el.style.getPropertyPriority('pointer-events') });
              el.style.setProperty('pointer-events', 'auto', 'important');
            }
          }
          const el = document.elementFromPoint(Math.floor(window.innerWidth / 2), window.innerHeight - 1);
          const color = el ? getComputedStyle(el).backgroundColor : null;
          touched.forEach(({ el, prev, prevPriority }) => {
            if (prev) el.style.setProperty('pointer-events', prev, prevPriority);
            else el.style.removeProperty('pointer-events');
          });
          return color;
        }, BOTTOM_FILL_IDS);
        record(
          `[forced-inset/${label}] bottommost painted pixel is the fill's own expected color (${bottomFillColor})`,
          bottomEdgeColor === bottomFillColor,
          JSON.stringify({ bottomEdgeColor, expected: bottomFillColor })
        );
      }

      await context.close();
    }
  }

  // --- About (the real "WELCOME TO DOC'S FITNESS" landing screen) ---
  // skipOffsetCheck: its hero is vertically centered, not top-anchored.
  await checkScreen('About (welcome landing)', async () => {}, { signedIn: false, topId: 'safe-area-top-fill', skipOffsetCheck: true });

  // --- WelcomeScreen.tsx (confusingly, the sign-up FORM screen) ---
  // skipOffsetCheck: same centered-hero layout as About.
  await checkScreen(
    'WelcomeScreen (sign up form)',
    async (page) => {
      await page.getByTestId('about-start-free').click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600);
    },
    { signedIn: false, topId: 'safe-area-top-fill', skipOffsetCheck: true }
  );

  // --- sign in ---
  await checkScreen(
    'sign in',
    async (page) => {
      await page.getByTestId('about-sign-in-upper').click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600);
    },
    { signedIn: false, topId: 'sign-in-safe-top' }
  );

  // --- Community tab (default signed-in landing) + main app top bar ---
  // This is the screen that was ACTUALLY double-counting via AppTopBar's
  // <SafeAreaView edges={['top']}> and was never caught before, because
  // the prior suite's forced CSS never reached the library's own
  // independently-created probe. It's covered here now exactly like every
  // other screen -- no special-casing needed once there's one source of
  // truth.
  await checkScreen('Community tab', async () => {}, { expectBottomFill: true, topId: 'safe-area-top-fill' });

  // --- the other three tabs ---
  for (const tabLabel of ["DOC'S WODS", 'WEEKLY CHALLENGE', 'THE DECK']) {
    await checkScreen(
      `${tabLabel} tab`,
      async (page) => {
        const tabButton = page.getByRole('tab', { name: new RegExp(tabLabel.replace(/'/g, "'?"), 'i') }).first();
        await tabButton.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(400);
      },
      { expectBottomFill: true, topId: 'safe-area-top-fill' }
    );
  }

  // --- Memberships (a ScreenOverlay-wrapped full-screen modal, topBasePadding=60) ---
  await checkScreen(
    'Memberships',
    async (page) => {
      await page.getByTestId('open-sidebar').click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.getByText('MEMBERSHIPS', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
    },
    { topId: 'screen-overlay-safe-top-60' }
  );

  // --- the hamburger drawer itself (also ScreenOverlay-wrapped) ---
  await checkScreen(
    'Hamburger drawer',
    async (page) => {
      await page.getByTestId('open-sidebar').click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
    },
    { topId: 'screen-overlay-safe-top-60' }
  );

  // --- DOC'S GROUP CHAT: the other screen that was ACTUALLY double-
  // counting (its own `insets.top + HEADER_TOP_BREATHING_ROOM` on top of
  // ScreenOverlay's plain fill), and was never covered by this suite at
  // all before this round. topId is the plain shared fill (baseline 0) --
  // DocsGroupChatScreen's own +14px breathing room is a small, fixed,
  // unrelated value that the 15px offset tolerance already accounts for.
  await checkScreen(
    "DOC'S GROUP CHAT",
    async (page) => {
      await page.getByTestId('open-group-chat').click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600);
    },
    {
      topId: 'safe-area-top-fill',
      expectBottomFill: true,
      fillId: 'group-chat-composer-safe-area-fill',
      // Deliberately colors.background here, not colors.card -- the
      // composer's own fill is designed to blend into the page, unlike
      // the tab bar's white. Not a bug; see the comment on `bottomFillColor`.
      bottomFillColor: 'rgb(251, 251, 249)',
      checkRootHeightExact: true,
    }
  );

  // --- Round 9's own regression guard: buried controls. Forces the real
  // insets, then hit-tests three real controls' visual centers and
  // asserts the element the browser's own hit-testing actually returns is
  // the control (or a descendant of it) -- never a fill/overlay that
  // happens to paint on top. See hitTestsControl()/hitTestsNth() above.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.addStyleTag({ content: FORCE_INSET_CSS });
    await page.waitForTimeout(200);

    // The tab bar's four tabs.
    const tabCount = await page.evaluate(() => document.querySelectorAll('[role="tab"]').length);
    record('[buried-control] tab bar has exactly 4 tabs to check', tabCount === 4, JSON.stringify({ tabCount }));
    for (let i = 0; i < tabCount; i += 1) {
      const result = await hitTestsNth(page, '[role="tab"]', i);
      record(`[buried-control] tab bar tab #${i + 1} receives its own tap, not a fill/overlay`, result.found && result.visible && result.ok, JSON.stringify(result));
    }

    // The story viewer's X.
    await page.getByTestId('story-ring-doc').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    const storyClose = await hitTestsControl(page, '[data-testid="story-close"]');
    record('[buried-control] story viewer close (X) receives its own tap, not the fill/tap-zones behind it', storyClose.found && storyClose.visible && storyClose.ok, JSON.stringify(storyClose));
    const storyBack = await page.evaluate(() => !!document.querySelector('[data-testid="story-back"]'));
    record('[buried-control] story viewer has no back button', !storyBack, JSON.stringify({ storyBack }));

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId('open-group-chat').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.addStyleTag({ content: FORCE_INSET_CSS });
    await page.waitForTimeout(200);

    const sendButton = await hitTestsControl(page, '[data-testid="group-chat-send"]');
    record('[buried-control] group chat send button receives its own tap, not the composer fill behind it', sendButton.found && sendButton.visible && sendButton.ok, JSON.stringify(sendButton));

    await context.close();
  }

  // --- Round 10's own regression guard: the tab bar's bottom density.
  // Native iOS apps (Skool, Instagram) sit their tab labels ~10-15px
  // above the home indicator zone; this app previously left 70-80px of
  // dead white space there (a 10px flex-stretch slack baked into
  // TAB_BAR_CONTENT_HEIGHT -- see tabBarHeight.ts). Checks the gap
  // between the first tab's own label and the physical viewport bottom
  // in both baseline (ordinary browser chrome) and forced-inset
  // (standalone-simulation) conditions, and that the label is never
  // clipped by a too-short row.
  {
    const TAB_LABEL_TOLERANCE = 5;
    const BASELINE_TAB_LABEL_GAP = 12;
    const FORCED_TAB_LABEL_GAP = FORCED_BOTTOM + 12;

    for (const forced of [false, true]) {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await setupMocks(page);
      await seedSignedInSession(page);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      if (forced) {
        await page.addStyleTag({ content: FORCE_INSET_CSS });
        await page.waitForTimeout(200);
      }

      const result = await tabLabelBaselineGap(page);
      const label = forced ? 'forced-inset' : 'baseline';
      const expected = forced ? FORCED_TAB_LABEL_GAP : BASELINE_TAB_LABEL_GAP;
      record(
        `[tab-bar-density/${label}] tab label sits within ${TAB_LABEL_TOLERANCE}px of the expected ${expected}px gap above the physical bottom edge`,
        result !== null && Math.abs(result.gap - expected) <= TAB_LABEL_TOLERANCE,
        JSON.stringify({ ...result, expected })
      );
      record(`[tab-bar-density/${label}] tab label is not clipped by a too-short row`, result !== null && !result.clipped, JSON.stringify(result));

      await context.close();
    }
  }

  // --- Round 11's own regression guard: the viewport lock. Confirms the
  // font-size audit on the screens the round explicitly targeted (sign
  // in, the composers, group chat), and that normal scrolling and the
  // story viewer's own tap zones -- the things pinch-prevention and the
  // touch-action restriction must NOT break -- still work. (Pinch itself
  // can't be simulated by Playwright; see the viewport-meta/gesture-
  // handler static audit above instead, and AGENTS.md.)
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    // Sign in.
    await page.getByTestId('about-sign-in-upper').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    await auditInputFontSizes(page, 'sign in', record, 2);
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'sign-in.png') }).catch(() => {});

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    // Create-post composer (Community tab).
    await page.getByText('LOG IT. POST IT.', { exact: false }).first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    await auditInputFontSizes(page, 'create post composer', record, 2);
    await page.getByTestId('compose-close').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);

    // Search.
    await page.getByTestId('open-search').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    await auditInputFontSizes(page, 'search', record, 1);
    await page.getByText('CANCEL', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);

    // Group chat composer.
    await page.getByTestId('open-group-chat').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    await auditInputFontSizes(page, 'group chat', record, 1);
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'group-chat-composer.png') }).catch(() => {});

    await context.close();
  }

  // Ordinary scrolling still works after the touch-action restriction --
  // targets the Community tab's own scroll container specifically (the
  // signed-in app's <body> is overflow:hidden by design; every screen's
  // own internal ScrollView is what actually scrolls, so a document-level
  // scrollTop check would silently read 0 either way and prove nothing).
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    // The Community feed's own content can still be a beat behind
    // 'networkidle' + a fixed wait (its own images/rows settling into
    // enough height to actually overflow its container) -- retried a few
    // times with a short pause rather than a single fixed-timing probe,
    // so this doesn't flake on exactly how long that settling takes.
    let before = null;
    for (let attempt = 0; attempt < 5 && before === null; attempt++) {
      if (attempt > 0) await page.waitForTimeout(400);
      before = await page.evaluate(() => {
        function findScrollable(el) {
          while (el && el !== document.body) {
            const cs = getComputedStyle(el);
            if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) return el;
            el = el.parentElement;
          }
          return null;
        }
        const el = findScrollable(document.elementFromPoint(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2)));
        if (el) el.setAttribute('data-scroll-probe', '1');
        return el ? el.scrollTop : null;
      });
    }
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
      const el = document.querySelector('[data-scroll-probe="1"]');
      return el ? el.scrollTop : null;
    });
    record(
      '[viewport-lock] ordinary scrolling still moves the Community tab\'s own scroll container after the touch-action restriction',
      before !== null && after !== null && after > before,
      JSON.stringify({ before, after })
    );

    await context.close();
  }

  // Story viewer's tap zones -- the gesture that most directly overlaps
  // with "things touch-action could plausibly break" (a full-bleed,
  // touch-driven left/right region, plus the viewer's own swipe-down-to-
  // close PanResponder). Reuses the same hitTestsControl technique as the
  // buried-control section above, forced insets included.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.addStyleTag({ content: FORCE_INSET_CSS });
    await page.waitForTimeout(200);

    await page.getByTestId('story-ring-doc').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    const left = await hitTestsControl(page, '[data-testid="story-tap-left"]');
    record('[viewport-lock] story viewer left tap zone still receives its own tap', left.found && left.visible && left.ok, JSON.stringify(left));
    const right = await hitTestsControl(page, '[data-testid="story-tap-right"]');
    record('[viewport-lock] story viewer right tap zone still receives its own tap', right.found && right.visible && right.ok, JSON.stringify(right));

    await context.close();
  }

  // --- Round 17's own regression guard: the shell-level keyboard fix,
  // driven through all three real-device regimes against group chat (the
  // primary reported-broken screen), plus Regime A against Message Doc
  // for cross-composer coverage. forceStandaloneDisplayMode() must run
  // before page.goto() (it's an addInitScript) so the production
  // mechanism's own matchMedia gate genuinely engages. PostDetailModal's
  // own comment composer uses the identical shell mechanism (nothing
  // composer-specific is left to differ) but needs a real post to open,
  // which the mocked empty community_posts table doesn't provide --
  // covered by code review rather than an automated check here.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await forceStandaloneDisplayMode(page);
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    await page.getByTestId('open-group-chat').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    for (const regime of KEYBOARD_SHELL_REGIMES) {
      await runKeyboardShellRegimeCheck(page, regime, record, {
        composerRiseId: 'group-chat-composer-keyboard-rise',
        inputSelector: '[data-testid="group-chat-input"]',
      });
    }

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await forceStandaloneDisplayMode(page);
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    await page.getByTestId('open-sidebar').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByTestId('sidebar-message').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    await runKeyboardShellRegimeCheck(page, KEYBOARD_SHELL_REGIMES[0], record, {
      composerRiseId: 'doc-thread-composer-keyboard-rise',
      inputSelector: '#message-draft-input',
    });

    await context.close();
  }

  // --- The explicit search-screen reset-leak check the escalation asked
  // for by name: "after dismissing the keyboard on the search screen the
  // bottom tab bar is left chopped at the screen edge." Search's own input
  // carries no keyboard-rise id at all -- it's plain in-flow content, not
  // a bottom-anchored composer -- which is exactly the point: nothing here
  // is supposed to be lifted, only the shell needs to correctly resize and
  // then un-resize, and the tab bar (an ordinary flex sibling of whatever
  // #root contains) needs to land back at the true physical bottom edge
  // afterward, not left short by a leftover shell height or translate.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await forceStandaloneDisplayMode(page);
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    // The real bug report is from an installed standalone device, which
    // always has a nonzero home-indicator inset -- force it the same way
    // every other screen in this suite simulates standalone, so the tab
    // bar's own safe-area fill has real work to do (at a true baseline
    // inset of 0, the fill is a 0px no-op and could never usefully prove
    // "reaches the edge" either way).
    await page.addStyleTag({ content: FORCE_INSET_CSS });
    await page.waitForTimeout(200);

    const atRest = await readKeyboardShellState(page);

    await page.getByTestId('open-search').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);

    await forceInnerHeight(page, 471);
    await forceVisualViewport(page, { height: 471, offsetTop: 341 });
    await page.waitForTimeout(200);

    const open = await readKeyboardShellState(page);
    record(
      '[keyboard-shell/search-screen] opening the keyboard on the search screen (no composer id involved at all) still shrinks the shell correctly',
      open.attr === 'open' && open.shellHeightVar === '471px',
      JSON.stringify(open)
    );

    await resetInnerHeight(page);
    await resetVisualViewport(page);
    await page.waitForTimeout(200);
    await page
      .getByText('CANCEL', { exact: false })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(400);

    const afterClose = await readKeyboardShellState(page);
    record(
      '[keyboard-shell/search-screen] closing the keyboard and the search overlay returns the shell to its exact at-rest box -- the confirmed "chopped tab bar" reset leak',
      afterClose.attr === null &&
        !!afterClose.rootRect &&
        !!atRest.rootRect &&
        Math.abs(afterClose.rootRect.top - atRest.rootRect.top) <= 1 &&
        Math.abs(afterClose.rootRect.height - atRest.rootRect.height) <= 1,
      JSON.stringify({ afterClose, atRest })
    );

    // The actual reported symptom: the tab bar's own safe-area fill (what
    // extends its background through the home-indicator area to the true
    // physical bottom edge -- see AGENTS.md's "Extends a fixed-height
    // bottom bar" rule) must still reach exactly `--real-safe-bottom` past
    // the tab bar's own box, same convention bottomFillReachesEdge()
    // already checks for every other screen in this file.
    const fill = await bottomFillReachesEdge(page, 'tab-bar-safe-area-fill');
    record(
      '[keyboard-shell/search-screen] the tab bar\'s own safe-area fill still reaches the true physical bottom edge afterward, not chopped off',
      !!fill && fill.height === FORCED_BOTTOM && Math.abs(fill.bottom - fill.windowHeight) <= 1,
      JSON.stringify(fill)
    );

    await context.close();
  }

  // --- Round 18 found the search overlay broken two ways -- the real tab
  // bar partially cropped at rest, and underlying-screen content bleeding
  // through near the bottom of the overlay once the keyboard opened -- and
  // fixed it by making search `fullBleed` + hiding the real tab bar
  // UNCONDITIONALLY whenever search was open. Round 19 corrected that
  // overcorrection: a real device confirmed the four tabs must stay
  // visible and tappable underneath search whenever the keyboard is
  // CLOSED, the same as any other non-fullBleed secondary screen -- only
  // hiding while the keyboard is open, which is also the one case where
  // the Round 18 bleed-through fix actually needs to apply. `fullBleed` is
  // now tied to `keyboardVisible` (see App.tsx), not unconditional.
  // useKeyboardVisible() is purely a visualViewport.height-shrink signal
  // on web (see useKeyboardVisible.ts) -- nothing in headless Chromium
  // shrinks it on its own, so "at rest" here needs no explicit blur step;
  // it's simply never true until a regime below forces it.
  // SearchModal.tsx's own `nativeID="search-screen-container"` is the
  // measurement anchor -- the one element that must always reach the exact
  // bottom edge of whatever height #root currently is while the overlay
  // IS fullBleed.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await forceStandaloneDisplayMode(page);
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    // A real nonzero home-indicator inset -- the exact condition the
    // cropped-tab-bar bug on Movement Vault (and tour stop 4) needed to
    // reproduce at all, see #screen-overlay-tab-bar-gap below -- forced the
    // same way every other screen in this suite simulates standalone.
    await page.addStyleTag({ content: FORCE_INSET_CSS });
    await page.waitForTimeout(200);

    await page.getByTestId('open-search').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);

    const tabsAtRest = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="tab"]')).map((el) => {
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height };
      })
    );
    record(
      '[search-screen/at-rest] the real tab bar is fully visible underneath search while the keyboard is closed, not hidden or cropped',
      tabsAtRest.length > 0 && tabsAtRest.every((t) => t.width > 0 && t.height > 0),
      JSON.stringify(tabsAtRest)
    );
    const tabHitsAtRest = await Promise.all([0, 1, 2, 3].map((i) => hitTestsNth(page, '[role="tab"]', i)));
    record(
      '[search-screen/at-rest] every tab still receives its own tap underneath search, not the overlay',
      tabHitsAtRest.every((r) => r.found && r.visible && r.ok),
      JSON.stringify(tabHitsAtRest)
    );
    const fillAtRest = await bottomFillReachesEdge(page, 'tab-bar-safe-area-fill');
    record(
      '[search-screen/at-rest] the tab bar\'s own safe-area fill reaches the true physical bottom edge underneath search',
      !!fillAtRest && fillAtRest.height === FORCED_BOTTOM && Math.abs(fillAtRest.bottom - fillAtRest.windowHeight) <= 1,
      JSON.stringify(fillAtRest)
    );

    for (const regime of KEYBOARD_SHELL_REGIMES) {
      await forceInnerHeight(page, regime.innerHeight);
      await forceVisualViewport(page, { height: regime.vvHeight, offsetTop: regime.offsetTop });
      await page.waitForTimeout(200);

      // Keyboard open (keyboardVisible true): fullBleed kicks in, same
      // coverage requirements Round 18 established.
      const expectedBottom = regime.offsetTop + regime.vvHeight;
      const container = await page.evaluate(() => {
        const el = document.getElementById('search-screen-container');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: r.left, right: r.right };
      });
      record(
        `[search-screen/${regime.name}] the search overlay still covers the full shrunk shell down to the visual viewport's own bottom (${expectedBottom})`,
        !!container && Math.abs(container.bottom - expectedBottom) <= 1,
        JSON.stringify({ container, regime })
      );

      // The real-device symptom was slivers of the underlying screen
      // (a reaction row, a deck card, a schedule card) showing between the
      // empty search state and the keyboard. Sample the point just above
      // the overlay's own bottom edge and assert it's the overlay's own
      // container (or a descendant of it), never whatever screen sits
      // behind it.
      const bleed = await page.evaluate(() => {
        const el = document.getElementById('search-screen-container');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = (r.left + r.right) / 2;
        const y = r.bottom - 2;
        const hit = document.elementFromPoint(x, y);
        return { ok: !!hit && (hit === el || el.contains(hit)), tag: hit ? hit.tagName + (hit.id ? `#${hit.id}` : '') : null };
      });
      record(
        `[search-screen/${regime.name}] nothing from the screen behind search bleeds through near the bottom of the overlay`,
        !!bleed && bleed.ok,
        JSON.stringify(bleed)
      );

      await resetInnerHeight(page);
      await resetVisualViewport(page);
      await page.waitForTimeout(200);

      // Keyboard closed again (same regime cycle): the four tabs must come
      // back automatically, underneath search, with no need to close
      // search itself -- the exact behavior this round's correction adds.
      const tabsAfterRegime = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="tab"]')).map((el) => {
          const r = el.getBoundingClientRect();
          return { width: r.width, height: r.height };
        })
      );
      record(
        `[search-screen/${regime.name}] closing the keyboard restores the tab bar underneath search automatically, without closing search`,
        tabsAfterRegime.length > 0 && tabsAfterRegime.every((t) => t.width > 0 && t.height > 0),
        JSON.stringify(tabsAfterRegime)
      );
    }

    // Scrollable results under a forced keyboard regime: a query broad
    // enough to produce more rows than the shrunk shell can show at once.
    await page.locator('#app-search-input').fill('s');
    await page.waitForTimeout(300);
    await forceInnerHeight(page, KEYBOARD_SHELL_REGIMES[0].innerHeight);
    await forceVisualViewport(page, { height: KEYBOARD_SHELL_REGIMES[0].vvHeight, offsetTop: KEYBOARD_SHELL_REGIMES[0].offsetTop });
    await page.waitForTimeout(300);
    const scrollInfo = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="search-results-scroll"]');
      if (!el) return null;
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, canScroll: el.scrollHeight > el.clientHeight };
    });
    let scrollMoved = false;
    if (scrollInfo?.canScroll) {
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="search-results-scroll"]');
        if (el) el.scrollTop = 40;
      });
      await page.waitForTimeout(100);
      scrollMoved = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="search-results-scroll"]');
        return !!el && el.scrollTop > 0;
      });
    }
    record(
      '[search-screen/scroll] results overflow and actually scroll under a forced keyboard regime',
      !!scrollInfo && scrollInfo.canScroll && scrollMoved,
      JSON.stringify({ scrollInfo, scrollMoved })
    );
    await resetInnerHeight(page);
    await resetVisualViewport(page);
    await page.waitForTimeout(200);

    // After a full open/close cycle: closing search (CANCEL) restores the
    // real tab bar to fully visible, not left cropped by any reset leak.
    await page
      .getByText('CANCEL', { exact: false })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(400);
    const tabsAfterClose = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="tab"]')).map((el) => {
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height };
      })
    );
    record(
      '[search-screen/after-close] the real tab bar is fully visible again after a full open/close cycle, not left cropped',
      tabsAfterClose.length > 0 && tabsAfterClose.every((t) => t.width > 0 && t.height > 0),
      JSON.stringify(tabsAfterClose)
    );

    await context.close();
  }

  // --- THIS ROUND's own regression guard: real-device report found a
  // search result tap landing in the wrong place (a deck card named Fury
  // opened The Deck tab in Shuffle Mode instead of that card). Every
  // result type must now open its EXACT destination, an uncompleted deck
  // card must never appear in the index at all (face-down by design), and
  // back must retrace to the same search results with the query intact.
  // Fixture rows for `community_posts` / `deck_completions` are registered
  // AFTER setupMocks(), so they take priority for just those two tables --
  // every other table still falls through to setupMocks' own empty-array
  // default.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await page.route('**/rest/v1/community_posts*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'post-1',
            title: 'My First WOD',
            body: 'Crushed it today',
            category: 'General',
            kind: 'text',
            media_url: null,
            media_type: null,
            workout_title: null,
            workout_notes: null,
            workout_results_line: null,
            pinned: false,
            created_at: new Date().toISOString(),
            author_id: MEMBER_FIXTURE_ID,
            profiles: { display_name: 'Ada Memberson' },
            community_comments: [],
            community_reactions: [],
          },
        ]),
      })
    );
    // Card 'A-spade' ("Jen Loves Counting") is completed; '2-spade'
    // ("Range Finder") is deliberately left out of this fixture, so it
    // stays uncompleted and must never surface in search at all.
    await page.route('**/rest/v1/deck_completions*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ card_id: 'A-spade', completed_at: new Date().toISOString() }]),
      })
    );
    // A nonzero deck_completions row makes BadgeContext's own effect see
    // totalWorkoutsLogged >= 1 and try to grant "day one doug" -- without
    // this, the generic badge_grants mock (always []) never reflects that
    // upsert, so the effect's own `grants` dependency keeps changing
    // reference and re-fires forever. Returning the grant directly here
    // satisfies the effect's own condition immediately, same as a real
    // backend would after the first successful upsert.
    await page.route('**/rest/v1/badge_grants*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ user_id: USER_ID, badge_id: 'day_one_doug', period_key: '', granted_at: new Date().toISOString(), profiles: { display_name: 'Test Member' } }]),
      })
    );
    // ProfileScreen's own member-lookup query (`.eq('id', memberId)`) needs
    // a row distinct from the generic signed-in "Test Member" default --
    // Ada Memberson's own profile, with real Instagram/quote fields, so the
    // [search-deep-link/member] check below can assert the REAL member
    // profile view rendered (not just that some modal opened). Any other
    // `profiles` request (the signed-in member's own fetch, badge/group
    // chat participant lookups) falls through to setupMocks' own generic
    // Test Member row.
    await page.route('**/rest/v1/profiles*', (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('id') === `eq.${MEMBER_FIXTURE_ID}`) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            display_name: 'Ada Memberson',
            avatar_url: null,
            instagram_handle: 'ada.lifts',
            favorite_quote: 'Discipline equals freedom.',
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            display_name: 'Test Member',
            instagram_handle: '',
            favorite_quote: '',
            avatar_url: null,
            how_train: 'boathouse',
            is_admin: false,
            show_tomorrows_workout: true,
            tour_completed_at: new Date(Date.now() - 30 * 86400000).toISOString(),
            group_chat_muted: false,
          },
        ]),
      });
    });
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    await page.getByTestId('open-search').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);

    // WORKOUTS: opens that exact day's workout (the one tab-navigation
    // case -- see SearchModal.tsx's handleSelect), not just whichever day
    // the WODs tab would otherwise default to.
    await page.locator('#app-search-input').fill('gauntlet');
    await page.waitForTimeout(300);
    await page
      .getByText('THE GAUNTLET', { exact: false })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(600);
    const wodLanded = await page
      .getByText('THE GAUNTLET', { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    record(
      '[search-deep-link/workout] tapping a WORKOUTS result lands on that exact workout\'s detail',
      wodLanded,
      JSON.stringify({ wodLanded })
    );

    // Back (the WODs tab has no overlay of its own to close -- reopening
    // search is "back" here): the lifted `query` state in App.tsx is what
    // makes this still show the same results, even though closing search
    // to switch tabs unmounted SearchModal entirely.
    await page.getByTestId('open-search').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    const queryAfterWod = await page.locator('#app-search-input').inputValue().catch(() => null);
    record(
      '[search-deep-link/back] reopening search after a WORKOUTS result preserves the previous query',
      queryAfterWod === 'gauntlet',
      JSON.stringify({ queryAfterWod })
    );

    // DECK CARDS: opens that exact card's detail modal, stacked on top of
    // search (which stays mounted underneath, unclosed) -- not just The
    // Deck tab in whatever mode it defaults to.
    await page.locator('#app-search-input').fill('jen');
    await page.waitForTimeout(300);
    await page
      .getByText('Jen Loves Counting', { exact: false })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    const deckCardOpen = await page
      .getByTestId('deck-card-close')
      .isVisible()
      .catch(() => false);
    record(
      '[search-deep-link/deck-card] tapping a completed DECK CARDS result opens that exact card\'s detail modal',
      deckCardOpen,
      JSON.stringify({ deckCardOpen })
    );
    await page.getByTestId('deck-card-close').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const searchVisibleAfterDeck = await page.locator('#app-search-input').isVisible().catch(() => false);
    const queryAfterDeck = await page.locator('#app-search-input').inputValue().catch(() => null);
    record(
      '[search-deep-link/back] closing a DECK CARDS result reveals search again underneath, query intact (the overlay was never closed)',
      searchVisibleAfterDeck && queryAfterDeck === 'jen',
      JSON.stringify({ searchVisibleAfterDeck, queryAfterDeck })
    );

    // Deck-card exclusion: an uncompleted card ('2-spade', not in the
    // deck_completions fixture above) must never appear in the index at
    // all, even though its title textually matches the query -- uncompleted
    // cards are face-down by design everywhere else in the app, and a
    // search result naming one would leak its identity and spoil the
    // shuffle.
    await page.locator('#app-search-input').fill('range finder');
    // Polls instead of a single fixed sleep -- settles the instant the
    // results recompute for the new query instead of guessing a delay long
    // enough for however loaded this run's machine happens to be.
    await page
      .waitForFunction(() => {
        const el = document.getElementById('search-screen-container');
        return !!el && el.textContent && el.textContent.includes('No results for');
      }, { timeout: 3000 })
      .catch(() => {});
    // The "No results for ..." hint ECHOES the typed query back verbatim --
    // it legitimately, innocently contains the substring "range finder"
    // itself, which a case-insensitive text search for the card's own
    // title "Range Finder" would also match. Asserting the hint renders at
    // all is the real proof of exclusion (SearchModal only shows it when
    // results.length === 0); checking the literal card title's ABSENCE
    // would produce a false "found it" against the hint's own echoed text.
    const noResultsShown = await page
      .locator('#search-screen-container')
      .getByText('No results for', { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    record(
      '[search-deep-link/deck-exclusion] an uncompleted deck card never appears in search results',
      noResultsShown,
      JSON.stringify({ noResultsShown })
    );

    // COMMUNITY: opens that exact post's detail, stacked on top of search.
    // Scoped to the search container itself -- the real Community feed
    // behind search also legitimately renders "My First WOD" (it's a real
    // post, always in the feed regardless of the search query), and an
    // unscoped text match can resolve to that one instead, which search's
    // own fullBleed overlay then correctly refuses the click on.
    await page.locator('#app-search-input').fill('crushed');
    await page.waitForTimeout(300);
    await page
      .locator('#search-screen-container')
      .getByText('My First WOD', { exact: false })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    const postDetailOpen = await page
      .getByTestId('close-post-detail')
      .isVisible()
      .catch(() => false);
    record(
      '[search-deep-link/post] tapping a COMMUNITY result opens that exact post\'s detail',
      postDetailOpen,
      JSON.stringify({ postDetailOpen })
    );
    await page.getByTestId('close-post-detail').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const queryAfterPost = await page.locator('#app-search-input').inputValue().catch(() => null);
    record(
      '[search-deep-link/back] closing a COMMUNITY result reveals search again underneath, query intact',
      queryAfterPost === 'crushed',
      JSON.stringify({ queryAfterPost })
    );

    // MEMBERS: a result row inside the MEMBERS section specifically (not
    // the COMMUNITY row of the same author's post, which the same query
    // also legitimately matches) opens a read-only view of their profile.
    await page.locator('#app-search-input').fill('memberson');
    await page.waitForTimeout(300);
    const memberClicked = await page.evaluate(() => {
      const labelEl = Array.from(document.querySelectorAll('*')).find((el) => el.children.length === 0 && el.textContent.trim() === 'MEMBERS');
      if (!labelEl) return false;
      let section = labelEl.parentElement;
      while (section && !section.textContent.includes('Ada Memberson')) section = section.parentElement;
      if (!section) return false;
      const rowText = Array.from(section.querySelectorAll('*')).filter((el) => el.textContent.trim() === 'Ada Memberson');
      const target = rowText.sort((a, b) => a.children.length - b.children.length)[0];
      if (!target) return false;
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    });
    await page.waitForTimeout(500);
    // This round replaces the Round 18 placeholder (avatar + name only)
    // with the real, shared ProfileScreen in its read-only "viewing member
    // X" mode -- assert the full set of fields the user's own instructions
    // named (photo, name, Instagram handle, favorite quote, Trophy Case),
    // not just that some modal opened.
    const memberProfileDetail = await page.evaluate(() => ({
      closeVisible: !!document.querySelector('[data-testid="close-profile"]'),
      name: document.querySelector('[data-testid="member-profile-name"]')?.textContent ?? null,
      instagram: document.querySelector('[data-testid="member-profile-instagram"]')?.textContent ?? null,
      quote: document.querySelector('[data-testid="member-profile-quote"]')?.textContent ?? null,
      trophyCaseVisible: Array.from(document.querySelectorAll('*')).some((el) => el.textContent.trim() === 'TROPHY CASE'),
      badgeCellCount: document.querySelectorAll('[data-testid^="profile-badge-"]').length,
    }));
    record(
      '[search-deep-link/member] tapping a MEMBERS result opens the real ProfileScreen, read-only, for that member',
      memberClicked &&
        memberProfileDetail.closeVisible &&
        memberProfileDetail.name === 'Ada Memberson' &&
        memberProfileDetail.instagram === '@ada.lifts' &&
        memberProfileDetail.quote === '"Discipline equals freedom."' &&
        memberProfileDetail.trophyCaseVisible &&
        memberProfileDetail.badgeCellCount > 0,
      JSON.stringify({ memberClicked, ...memberProfileDetail })
    );
    await page.getByTestId('close-profile').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const queryAfterMember = await page.locator('#app-search-input').inputValue().catch(() => null);
    record(
      '[search-deep-link/back] closing a MEMBERS result reveals search again underneath, query intact',
      queryAfterMember === 'memberson',
      JSON.stringify({ queryAfterMember })
    );

    // MOVEMENTS: opens that exact movement in the vault, labeled "BACK TO
    // SEARCH" (the existing returnLabel mechanism movementVaultModal.ts
    // already provides), stacked on top of search.
    await page.locator('#app-search-input').fill('windmill');
    await page.waitForTimeout(300);
    await page
      .getByText('1/2 Kneeling Windmill', { exact: false })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    const movementBackLabel = await page.getByText('BACK TO SEARCH', { exact: false }).first().isVisible().catch(() => false);
    record(
      '[search-deep-link/movement] tapping a MOVEMENTS result opens that exact movement, labeled "BACK TO SEARCH"',
      movementBackLabel,
      JSON.stringify({ movementBackLabel })
    );
    await page.getByTestId('movement-detail-back').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const queryAfterMovement = await page.locator('#app-search-input').inputValue().catch(() => null);
    record(
      '[search-deep-link/back] closing a MOVEMENTS result reveals search again underneath, query intact',
      queryAfterMovement === 'windmill',
      JSON.stringify({ queryAfterMovement })
    );

    await context.close();
  }

  // --- THIS ROUND's own regression guard: real-device report found typing
  // a single common letter ("L") returning results with that letter
  // anywhere in the name -- a plain substring match. The matching rule is
  // now a prefix match on the result's own name or one of its individual
  // words (see wordStartMatch.ts), reused for every result type. "aunt" is
  // a genuine mid-word substring of "GAUNTLET" (no word boundary before it
  // -- the WOD title is one word) that must now return nothing; "gaunt" is
  // a real prefix of the same word and must still match, proving this
  // isn't just an empty matcher.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    await page.getByTestId('open-search').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);

    await page.locator('#app-search-input').fill('aunt');
    await page.waitForTimeout(400);
    const midWordShown = await page
      .locator('#search-screen-container')
      .getByText('THE GAUNTLET', { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    record(
      '[search-word-start] a mid-word substring ("aunt" inside GAUNTLET) returns no match',
      !midWordShown,
      JSON.stringify({ midWordShown })
    );

    await page.locator('#app-search-input').fill('gaunt');
    await page.waitForTimeout(400);
    const prefixShown = await page
      .locator('#search-screen-container')
      .getByText('THE GAUNTLET', { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    record(
      '[search-word-start] a real word-start prefix ("gaunt") still matches -- the matcher isn\'t just empty',
      prefixShown,
      JSON.stringify({ prefixShown })
    );

    await context.close();
  }

  // --- THIS ROUND's own regression guard: a real device found the tab bar
  // partially cropped (icons cut off, labels visible) on Movement Vault
  // and on spotlight tour stop 4 ("THE FOUR ROOMS") -- the same shape of
  // bug Round 18 fixed for search, but these two never went through
  // search's own fullBleed path at all. Root cause shared by both:
  // tabBarHeight (the flat TAB_BAR_CONTENT_HEIGHT JS constant) is the tab
  // bar's own box height, but not the #tab-bar-safe-area-fill sibling
  // stacked below it that extends the bar's background through the real
  // home-indicator inset in standalone mode -- anything that reserves
  // space for, or spotlights, "the tab bar" using only the flat constant
  // undersizes it by exactly that fill height. Fixed once, for the whole
  // overlay family, via two id-keyed CSS overrides in index.html
  // (#screen-overlay-tab-bar-gap, #tab-bar-tour-marker) rather than a
  // per-screen patch -- this block proves both actual consumers.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    // Movement Vault entry (sidebar's own "THE MOVEMENT VAULT" row) and the
    // tour's dev-reset control both need is_admin -- the tour reset row is
    // admin-only, and this keeps both checks in one signed-in session.
    await page.route('**/rest/v1/profiles*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            display_name: 'Test Member',
            instagram_handle: '',
            favorite_quote: '',
            avatar_url: null,
            how_train: 'boathouse',
            is_admin: true,
            show_tomorrows_workout: true,
            tour_completed_at: new Date(Date.now() - 30 * 86400000).toISOString(),
            group_chat_muted: false,
          },
        ]),
      })
    );
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.addStyleTag({ content: FORCE_INSET_CSS });
    await page.waitForTimeout(200);

    // Movement Vault: opened via DOC'S WODS own "LOOK UP A MOVEMENT" button,
    // not the hamburger drawer -- the drawer's own row opens it with
    // sidebarOpen still true (fullBleed={sidebarOpen} -- see App.tsx),
    // which is a different, already-fullBleed path. This entry point is
    // the plain, non-fullBleed case the real-device report was about.
    await page
      .getByRole('tab', { name: /DOC'?S WODS/i })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(400);
    await page.getByTestId('lookup-movement').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    const overlayGap = await page.evaluate(() => {
      const el = document.getElementById('screen-overlay-tab-bar-gap');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { bottom: Math.round(r.bottom), windowHeight: window.innerHeight };
    });
    record(
      '[tab-bar-integrity/movement-vault] the overlay stops exactly above the tab bar\'s own real footprint (bar + fill), not short of it',
      !!overlayGap && Math.abs(overlayGap.windowHeight - overlayGap.bottom - (64 + FORCED_BOTTOM)) <= 1,
      JSON.stringify(overlayGap)
    );
    const vaultTabHits = await Promise.all([0, 1, 2, 3].map((i) => hitTestsNth(page, '[role="tab"]', i)));
    record(
      '[tab-bar-integrity/movement-vault] every tab icon+label is fully visible and receives its own tap underneath Movement Vault',
      vaultTabHits.every((r) => r.found && r.visible && r.ok),
      JSON.stringify(vaultTabHits)
    );
    const vaultFill = await bottomFillReachesEdge(page, 'tab-bar-safe-area-fill');
    record(
      '[tab-bar-integrity/movement-vault] the tab bar\'s own fill reaches the true physical bottom edge underneath Movement Vault',
      !!vaultFill && vaultFill.height === FORCED_BOTTOM && Math.abs(vaultFill.bottom - vaultFill.windowHeight) <= 1,
      JSON.stringify(vaultFill)
    );

    // Tour stop 4 ("tab-bar"): dev-reset starts the tour fresh regardless
    // of the once-ever completed flag, then NEXT x3 reaches stepIndex 3.
    // Movement Vault here is its own LIST view (opened via "LOOK UP A
    // MOVEMENT"), so its own close control is movement-vault-close, not
    // the per-movement detail's back button. Stops 1-3 (story-ring,
    // date-strip, composer-bar) only register on the Community tab, so
    // this switches back there first -- otherwise those stops never
    // measure a target, never render a NEXT button, and the 3 taps below
    // would have nothing to click.
    await page.getByTestId('movement-vault-close').click({ timeout: 5000 }).catch(() => {});
    await page
      .getByRole('tab', { name: /Community/i })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(400);
    await page.getByTestId('open-sidebar').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByTestId('dev-reset-tour').click({ timeout: 5000 }).catch(() => {});
    // The tour's own measurement loop waits on document.fonts.ready (capped
    // at 1500ms) before its first measurement attempt -- give the first
    // stop's NEXT button real room to actually appear.
    await page.waitForTimeout(1800);
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('tour-next').click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
    const tourCardText = await page.getByTestId('tour-card').innerText().catch(() => '');
    record(
      '[tab-bar-integrity/tour-stop-4] three NEXT taps from a fresh start land on "THE FOUR ROOMS" (tab-bar stop)',
      tourCardText.includes('THE FOUR ROOMS'),
      JSON.stringify({ tourCardText })
    );
    // Visibility only, not tappability -- the tour's own full-screen root
    // is pointerEvents:'auto' by design while active (it's a guided modal:
    // NEXT/BACK/SKIP on the card, not "tap the real element"), so it
    // intercepts taps everywhere, spotlight included. "All four tabs
    // completely visible" is what the spec actually asks for -- the
    // spotlight rect (TabBarTourMarker) correctly matching the tab bar's
    // own real footprint is what makes them visually uncropped underneath
    // the backdrop's cutout.
    const tourTabRects = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="tab"]')).map((el) => {
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height };
      })
    );
    record(
      '[tab-bar-integrity/tour-stop-4] every tab icon+label is fully visible (nonzero rendered size, not cropped)',
      tourTabRects.length > 0 && tourTabRects.every((r) => r.width > 0 && r.height > 0),
      JSON.stringify(tourTabRects)
    );
    const cardAboveTabBar = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="tour-card"]');
      const tab = document.querySelector('[role="tab"]');
      if (!card || !tab) return null;
      const cardRect = card.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      return { cardBottom: Math.round(cardRect.bottom), tabTop: Math.round(tabRect.top) };
    });
    record(
      '[tab-bar-integrity/tour-stop-4] the tip card sits fully above the tab bar, no overlap',
      !!cardAboveTabBar && cardAboveTabBar.cardBottom <= cardAboveTabBar.tabTop,
      JSON.stringify(cardAboveTabBar)
    );

    await context.close();
  }

  // --- THIS ROUND's own regression guard: real-device report found a
  // large blank white area where a selected photo's preview belongs in the
  // create-post composer (post titled "Beta Test 1"). Root cause:
  // MediaAttachmentPicker.tsx's `previewWrap` had no width of its own
  // inside CreatePostModal's row-flex toolbar, so its child Image's
  // `width: '100%'` resolved against an undefined flex-item width -- see
  // MediaAttachmentPicker.tsx's own comment on `previewWrap` for the full
  // mechanism. End to end with a real fixture image: select, preview
  // visible and correctly sized, post, renders in the feed afterward.
  // `community_posts` is mocked statefully here (capturing the INSERT
  // payload and serving it back on the next GET) specifically so the
  // "renders in feed" half is a real round trip, not just an assumption.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);

    const insertedPosts = [];
    await page.route('**/rest/v1/community_posts*', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        let payload = {};
        try {
          payload = JSON.parse(req.postData() || '{}');
        } catch {}
        insertedPosts.push(payload);
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: `post-${insertedPosts.length}`, ...payload }]) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          [...insertedPosts].reverse().map((p, i) => ({
            id: `post-${insertedPosts.length - i}`,
            title: p.title ?? '',
            body: p.body ?? '',
            category: p.category ?? 'General',
            kind: p.kind ?? 'text',
            media_url: p.media_url ?? null,
            media_type: p.media_type ?? null,
            workout_title: p.workout_title ?? null,
            workout_notes: p.workout_notes ?? null,
            workout_results_line: p.workout_results_line ?? null,
            pinned: false,
            created_at: new Date().toISOString(),
            author_id: p.author_id ?? USER_ID,
            profiles: { display_name: 'Test Member' },
            community_comments: [],
            community_reactions: [],
          }))
        ),
      });
    });

    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    await page.getByText('LOG IT. POST IT.', { exact: false }).first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);

    // Helper shared by both fixtures below: a real device showed the OLD
    // Image.getSize()-based preview can simply never paint anything --
    // this reads the preview box's own rect at a fixed, short delay (well
    // under the user's "within a second" bar) BEFORE waiting for any photo
    // decode to finish, so a regression back to "nothing paints until some
    // async measurement resolves" fails this check regardless of how long
    // the rest of the test waits afterward.
    async function readPreviewRect() {
      return page.evaluate(() => {
        const el = document.querySelector('[data-testid="media-preview"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { width: Math.round(r.width), height: Math.round(r.height) };
      });
    }

    await page.getByTestId('media-add').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      page.getByText('Photo Library', { exact: false }).click({ timeout: 5000 }),
    ]);
    // Mirrors the real device path exactly: useMediaPicker.ts's own web
    // branch calls URL.createObjectURL() on the real File object Playwright
    // constructs here from this buffer -- a genuine blob: URL, not an
    // abstraction over one.
    await fileChooser.setFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: ASPECT_RATIO_FIXTURE_PNG });

    // Within a second, well before Image.getSize()/decode could ever
    // resolve: the box must already be painted at the synchronous
    // DEFAULT_PREVIEW_RATIO box -- never a zero/blank sliver.
    await page.waitForTimeout(150);
    const quickRectPng = await readPreviewRect();
    record(
      '[photo-preview/composer] the PNG fixture paints a nonzero preview box within a second, before any load event could resolve',
      !!quickRectPng && quickRectPng.width > 100 && quickRectPng.height > 100,
      JSON.stringify({ quickRectPng })
    );

    // Image.getSize()/decode resolving the real dimensions is itself
    // async, on top of the file picker's own round trip -- give it real
    // room before checking the REFINED ratio.
    await page.waitForTimeout(700);
    const previewRect = await readPreviewRect();
    const previewVisible = await page
      .getByTestId('media-preview')
      .isVisible()
      .catch(() => false);
    record(
      '[photo-preview/composer] selecting a photo shows a real, correctly-sized preview (not collapsed to a blank sliver)',
      previewVisible && !!previewRect && previewRect.width > 100 && previewRect.height > 100,
      JSON.stringify({ previewVisible, previewRect })
    );
    // The real regression check: a 300x200 (1.5) fixture must render at
    // its own natural ratio, not the old fixed-160-tall `cover` crop
    // (which would land near containerWidth/160 -- ~2.19 at this
    // viewport's padding, clearly distinct from 1.5).
    const previewRatio = previewRect ? previewRect.width / previewRect.height : null;
    record(
      '[photo-preview/composer] the preview renders at the photo\'s own natural aspect ratio (1.5), not a fixed-height crop',
      previewRatio !== null && Math.abs(previewRatio - ASPECT_RATIO_FIXTURE_RATIO) < 0.08,
      JSON.stringify({ previewRect, previewRatio, expected: ASPECT_RATIO_FIXTURE_RATIO })
    );

    // --- The large, real-device-shaped fixture: a genuine 4032x3024
    // (iPhone 12MP, 4:3) baseline JPEG -- the real device report's own
    // hypothesis was that a large/HEIC-converted real photo is exactly
    // what can make Image.getSize() silently never resolve. REPLACE swaps
    // the attached media without closing the composer.
    await page.getByTestId('media-replace').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const [fileChooser2] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      page.getByText('Photo Library', { exact: false }).click({ timeout: 5000 }),
    ]);
    await fileChooser2.setFiles({ name: 'large-fixture.jpg', mimeType: 'image/jpeg', buffer: LARGE_JPEG_FIXTURE });

    await page.waitForTimeout(150);
    const quickRectJpeg = await readPreviewRect();
    record(
      '[photo-preview/composer] the large JPEG fixture ALSO paints a nonzero preview box within a second, before any load event could resolve',
      !!quickRectJpeg && quickRectJpeg.width > 100 && quickRectJpeg.height > 100,
      JSON.stringify({ quickRectJpeg })
    );

    // A 4032x3024 real photo takes longer to decode than the tiny PNG --
    // give it real room before checking the refined ratio.
    await page.waitForTimeout(1500);
    const jpegRect = await readPreviewRect();
    const jpegRatio = jpegRect ? jpegRect.width / jpegRect.height : null;
    record(
      '[photo-preview/composer] the large JPEG fixture refines to its own real aspect ratio (4:3) once its load event fires',
      jpegRatio !== null && Math.abs(jpegRatio - LARGE_JPEG_FIXTURE_RATIO) < 0.08,
      JSON.stringify({ jpegRect, jpegRatio, expected: LARGE_JPEG_FIXTURE_RATIO })
    );

    await page.locator('#compose-post-title-input').fill('Beta Test 1');
    await page.locator('#compose-post-body-input').fill('Testing the photo preview fix end to end.');
    await page.getByTestId('compose-submit').click({ timeout: 5000 }).catch(() => {});
    // useActionCompletion()'s own "POSTED" acknowledgment holds the modal
    // open for 900ms before it actually calls onClose() -- see
    // useActionCompletion.ts's durationMs default. Wait past that, not up
    // to it, or this reads the still-closing modal as never having closed.
    await page.waitForTimeout(1300);

    const composeStillOpen = await page
      .getByTestId('compose-close')
      .isVisible()
      .catch(() => false);
    const feedHasPost = await page
      .getByText('Beta Test 1', { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    const feedImageRect = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img')).filter((img) => {
        const r = img.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (imgs.length === 0) return null;
      const r = imgs[imgs.length - 1].getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    });
    record(
      '[photo-preview/feed] after posting, the composer closes and the post with its photo renders in the feed',
      !composeStillOpen && feedHasPost && !!feedImageRect && feedImageRect.width > 0 && feedImageRect.height > 0,
      JSON.stringify({ composeStillOpen, feedHasPost, feedImageRect, insertedPosts })
    );

    await context.close();
  }

  // --- Round 13's own regression guard: the standalone-only 100lvh fix,
  // behavioral half (the static half -- that the real @media
  // (display-mode: standalone) block exists, sizes the right selectors,
  // and never still pins anything to 100dvh -- is in auditViewportLock
  // above). Chromium's CDP Emulation.setEmulatedMedia does not honor
  // "display-mode" as an overridable feature in this environment --
  // confirmed directly: the identical features-array call DOES work for
  // prefers-color-scheme, so this is specific to display-mode, not a
  // broken mechanism, and not something this suite can work around.
  // Rather than skip the behavioral check entirely, this forces the EXACT
  // same declarations the real @media block contains directly via
  // addStyleTag with !important -- the same "force the thing the real
  // mechanism would produce" technique FORCE_INSET_CSS already uses
  // throughout this file for the safe-area variables -- and asserts
  // #root's rendered height matches the resolved 100lvh probe value
  // EXACTLY (not the shorter 100dvh value the bug shipped with), and that
  // the bottommost physical pixel is the tab bar fill's own white, never
  // the page's own background color sneaking through beneath it -- the
  // literal 14px strip this round's real-device measurement found. This
  // does not exercise display-mode DETECTION (the static check above
  // does, as far as source inspection can) -- it exercises whether the
  // declared CSS, once matched, actually produces the correct layout.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.addStyleTag({ content: FORCE_INSET_CSS });
    await page.addStyleTag({ content: `html, body, #root { height: 100lvh !important; }` });
    await page.waitForTimeout(200);

    const measured = await page.evaluate(() => {
      const lvhProbe = document.getElementById('debug-probe-100lvh');
      const dvhProbe = document.getElementById('debug-probe-100dvh');
      const root = document.getElementById('root');
      const rootRect = root ? root.getBoundingClientRect() : null;
      return {
        lvhPx: lvhProbe ? Math.round(parseFloat(getComputedStyle(lvhProbe).height)) : null,
        dvhPx: dvhProbe ? Math.round(parseFloat(getComputedStyle(dvhProbe).height)) : null,
        rootHeight: rootRect ? Math.round(rootRect.height) : null,
        windowHeight: window.innerHeight,
      };
    });
    record(
      '[standalone-lvh] #root height equals the resolved 100lvh probe value exactly when sized by the standalone rule (not the shorter 100dvh value)',
      measured.lvhPx !== null && measured.rootHeight !== null && Math.abs(measured.rootHeight - measured.lvhPx) <= 1,
      JSON.stringify(measured)
    );

    // Same pointer-events caveat as the other bottom-edge-color checks in
    // this file: pointerEvents="none" fills are skipped by elementFromPoint
    // unless temporarily (and reversibly) flipped to auto with matching
    // !important priority.
    const bottomEdgeColor = await page.evaluate((ids) => {
      const touched = [];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) {
          touched.push({ el, prev: el.style.getPropertyValue('pointer-events'), prevPriority: el.style.getPropertyPriority('pointer-events') });
          el.style.setProperty('pointer-events', 'auto', 'important');
        }
      }
      const el = document.elementFromPoint(Math.floor(window.innerWidth / 2), window.innerHeight - 1);
      const color = el ? getComputedStyle(el).backgroundColor : null;
      touched.forEach(({ el, prev, prevPriority }) => {
        if (prev) el.style.setProperty('pointer-events', prev, prevPriority);
        else el.style.removeProperty('pointer-events');
      });
      return color;
    }, BOTTOM_FILL_IDS);
    record(
      "[standalone-lvh] bottommost physical pixel is the tab bar fill's own white -- no page-background strip beneath it",
      bottomEdgeColor === 'rgb(255, 255, 255)',
      JSON.stringify({ bottomEdgeColor })
    );

    await context.close();
  }

  // --- Round 12's own regression guard: the hidden debug overlay. Five
  // taps on the wordmark within 2s opens it; asserts every field this
  // round added (visualViewport.scale, 100svh/100lvh, --keyboard-inset,
  // window.scrollY) is actually present in its reported text, and that
  // the page is visually identical before the gesture and after closing
  // it again -- it must stay a true no-op for every member who never
  // finds it.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const before = await page.screenshot();
    const wordmark = page.getByTestId('app-wordmark');
    for (let i = 0; i < 5; i++) {
      await wordmark.click({ timeout: 5000 });
    }
    await page.waitForTimeout(500);

    const contentCount = await page.getByTestId('debug-overlay-content').count();
    record('[debug-overlay] opens after 5 taps on the wordmark within 2s', contentCount === 1, JSON.stringify({ contentCount }));

    const text = contentCount === 1 ? await page.getByTestId('debug-overlay-content').innerText() : '';
    const mustContain = ['visualViewport.height', 'scale', '100svh', '100lvh', '100dvh', '100vh', '--keyboard-inset', 'window.scrollY', '--real-safe-top', 'tab bar', 'LAST KEYBOARD SNAPSHOT'];
    const missing = mustContain.filter((s) => !text.includes(s));
    record('[debug-overlay] reports every field this round added', missing.length === 0, JSON.stringify({ missing, textLength: text.length }));

    // Round 14: the new KEYBOARD TEST input. Its label sits outside
    // debug-overlay-content (a sibling of the scroll block, always
    // visible rather than scrolled away), so it's checked against the
    // panel as a whole rather than folded into the mustContain list above.
    const keyboardTestLabelCount = await page.getByText('KEYBOARD TEST').count();
    record('[debug-overlay] panel shows the new KEYBOARD TEST row', keyboardTestLabelCount > 0, JSON.stringify({ keyboardTestLabelCount }));

    await page.getByTestId('debug-overlay-keyboard-test-input').click({ timeout: 5000 }).catch(() => {});
    const focusedTestId = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.getAttribute('data-testid') : null;
    });
    record(
      '[debug-overlay] tapping the KEYBOARD TEST input actually focuses it (summons the real iOS keyboard on a device)',
      focusedTestId === 'debug-overlay-keyboard-test-input',
      JSON.stringify({ focusedTestId })
    );

    await page.getByTestId('debug-overlay-close').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const afterCloseCount = await page.getByTestId('debug-overlay-content').count();
    record('[debug-overlay] closes and leaves no trace', afterCloseCount === 0, JSON.stringify({ afterCloseCount }));

    const after = await page.screenshot();
    record('[debug-overlay] page is byte-identical before the gesture and after closing (zero visual change for members)', Buffer.compare(before, after) === 0, JSON.stringify({ beforeBytes: before.length, afterBytes: after.length }));

    await context.close();
  }

  // --- Round 14's own regression guard: the "last keyboard snapshot"
  // mechanism end to end. This is the real flow the round's own
  // instructions described -- open the group chat, bring up the keyboard,
  // dismiss it, navigate elsewhere, THEN open the debug overlay and read
  // what was captured -- proving window.__lastKeyboardSnapshot is a true
  // standing record, not something that only works while the composer
  // that triggered it is still mounted. Round 17 updated the field
  // assertions below to the shell-level state the snapshot now carries
  // (shellMode/shellHeightVar/rootRect, not a composer id/rect/transform),
  // and added forceStandaloneDisplayMode() so the production shell
  // mechanism this snapshot now reports on actually engages.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await forceStandaloneDisplayMode(page);
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    await page.getByTestId('open-group-chat').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);

    const beforeShrink = await page.evaluate(() => window.__lastKeyboardSnapshot || null);
    record('[keyboard-snapshot] no snapshot recorded before any large visualViewport shrink', beforeShrink === null, JSON.stringify({ beforeShrink }));

    const forced = await forceVisualViewportShrink(page, 300);
    await page.waitForTimeout(300);

    const snapshot = await page.evaluate(() => window.__lastKeyboardSnapshot || null);
    record(
      '[keyboard-snapshot] a visualViewport resize shrinking by more than 100px records a snapshot with the real, matching numbers',
      !!snapshot && typeof snapshot.timestamp === 'string' && forced !== null && snapshot.vvHeight === forced.forced,
      JSON.stringify({ snapshot, forced })
    );
    record(
      '[keyboard-snapshot] the snapshot captures the shell flipping to "open" with the matching height, since standalone is forced and the shrink is well past the threshold',
      !!snapshot && snapshot.shellMode === 'keyboard' && snapshot.shellHeightVar === forced.forced + 'px' && !!snapshot.rootRect,
      JSON.stringify(snapshot)
    );

    // Dismiss the keyboard (the real mechanism's own inverse: visualViewport
    // grows back) and navigate away from group chat entirely before
    // opening the overlay, so the read below genuinely exercises
    // persistence across navigation, not just "still on the same screen."
    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (vv) {
        delete vv.height;
        vv.dispatchEvent(new Event('resize'));
      }
    });
    await page.waitForTimeout(200);
    await page.getByTestId('close-group-chat').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);

    const wordmark = page.getByTestId('app-wordmark');
    for (let i = 0; i < 5; i++) {
      await wordmark.click({ timeout: 5000 });
    }
    await page.waitForTimeout(500);

    const panelText = await page.getByTestId('debug-overlay-content').innerText().catch(() => '');
    record(
      '[keyboard-snapshot] the debug overlay, opened after navigating away, still shows the earlier snapshot (survives in-session navigation)',
      panelText.includes('LAST KEYBOARD SNAPSHOT') && panelText.includes('shell mode at capture: keyboard'),
      JSON.stringify({ panelTextLength: panelText.length })
    );

    await page.getByTestId('debug-overlay-close').click({ timeout: 5000 }).catch(() => {});
    await context.close();
  }

  // --- Round 8's own regression guard: #root must equal the viewport
  // height EXACTLY, checked immediately on load and again after a 5s
  // delay. The prior JS-measured --app-height mechanism's settle burst
  // only ran for up to 4s and then gave up -- a late resettle landing
  // just after that window is exactly the kind of bug a load-only check
  // would miss. Now that sizing is plain `100dvh` (no JS, nothing to
  // settle), both reads should be identical and exact; this check exists
  // to catch a regression back to JS-measured sizing, not because dvh
  // itself is expected to drift. Checked at both the forced inset and the
  // zero-inset baseline, since the shell's own sizing has nothing to do
  // with the safe-area variables.
  for (const forced of [false, true]) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    if (forced) await page.addStyleTag({ content: FORCE_INSET_CSS });

    const label = forced ? 'forced-inset' : 'baseline';
    const measure = () =>
      page.evaluate(() => {
        const root = document.getElementById('root');
        return { rootHeight: root ? root.getBoundingClientRect().height : null, windowHeight: window.innerHeight };
      });

    const immediate = await measure();
    record(
      `[${label}/Community tab, settle guard] #root height equals the viewport height exactly, checked immediately`,
      immediate.rootHeight !== null && Math.abs(immediate.rootHeight - immediate.windowHeight) <= 1,
      JSON.stringify(immediate)
    );

    await page.waitForTimeout(5000);
    const afterDelay = await measure();
    record(
      `[${label}/Community tab, settle guard] #root height equals the viewport height exactly, checked again after a 5s delay`,
      afterDelay.rootHeight !== null && Math.abs(afterDelay.rootHeight - afterDelay.windowHeight) <= 1,
      JSON.stringify(afterDelay)
    );

    await context.close();
  }

  // --- migration_022: THE FOUNDING 50 LAUNCH gets an explicit ON/OFF
  // switch (founding_fifty_settings.enabled), independent of the saved
  // start/end dates. OFF must disable the entire founding experience
  // everywhere no matter what the dates say; ON behaves exactly as the
  // dates/spots-remaining logic always has. Every scenario below uses the
  // SAME currently-open date window (starts_at in the past, ends_at far in
  // the future, well under 50 claimed) -- `enabled` is the only variable
  // that changes between the OFF and ON checks, so a pass can't be
  // accidentally explained by the dates alone.
  const FOUNDING_WINDOW_LIVE_DATES = {
    starts_at: new Date(Date.now() - 86400000).toISOString(),
    ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
  };

  // Admin: the switch itself -- starts OFF (the migration's own default),
  // flipping it writes through immediately with the same SAVED
  // confirmation pattern the rest of admin uses, shows LIVE (gold) / OFF
  // (gray) unmistakably, and never touches the saved dates either
  // direction.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await page.route('**/rest/v1/profiles*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            display_name: 'Test Admin',
            instagram_handle: '',
            favorite_quote: '',
            avatar_url: null,
            how_train: 'boathouse',
            is_admin: true,
            show_tomorrows_workout: true,
            tour_completed_at: new Date(Date.now() - 30 * 86400000).toISOString(),
            group_chat_muted: false,
          },
        ]),
      })
    );
    // Stateful -- captures the PATCH payload and serves it back, so
    // toggling the switch (and re-reading the dates) exercises a real
    // round trip, not just an assumption that the write happened.
    let foundingSettingsRow = { ...FOUNDING_WINDOW_LIVE_DATES, enabled: false };
    await page.route('**/rest/v1/founding_fifty_settings*', async (route) => {
      const req = route.request();
      if (req.method() === 'PATCH') {
        let payload = {};
        try {
          payload = JSON.parse(req.postData() || '{}');
        } catch {}
        foundingSettingsRow = { ...foundingSettingsRow, ...payload };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([foundingSettingsRow]) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([foundingSettingsRow]) });
    });
    await page.route('**/rest/v1/founding_fifty_members*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId('open-sidebar').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText('THE FOUNDING 50', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    const initialLabel = await page.getByTestId('founding-fifty-enabled-label').innerText().catch(() => '');
    record(
      '[founding-50/admin] the switch starts OFF, matching the migration\'s own default',
      initialLabel.trim() === 'OFF',
      JSON.stringify({ initialLabel })
    );

    const readDates = () =>
      Promise.all([
        page.locator('#founding-fifty-start-date').inputValue().catch(() => null),
        page.locator('#founding-fifty-end-date').inputValue().catch(() => null),
      ]);
    const datesBefore = await readDates();

    await page.getByTestId('founding-fifty-enabled-toggle').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const onLabel = await page.getByTestId('founding-fifty-enabled-label').innerText().catch(() => '');
    // #E5B80B (colors.gold) -- the label's own color, not just its text,
    // since the brief explicitly asked for this to be unmistakable.
    const onLabelColor = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="founding-fifty-enabled-label"]');
      return el ? getComputedStyle(el).color : null;
    });
    const savedVisibleOn = await page.getByTestId('save-confirmation-saved').isVisible().catch(() => false);
    record(
      '[founding-50/admin] toggling ON flips the label to LIVE in gold and shows SAVED',
      onLabel.trim() === 'LIVE' && onLabelColor === 'rgb(229, 184, 11)' && savedVisibleOn,
      JSON.stringify({ onLabel, onLabelColor, savedVisibleOn })
    );
    const datesAfterOn = await readDates();
    record(
      '[founding-50/admin] turning the switch ON never touches the saved dates',
      JSON.stringify(datesBefore) === JSON.stringify(datesAfterOn),
      JSON.stringify({ datesBefore, datesAfterOn })
    );

    // Let the SAVED confirmation finish its own auto-revert (useSaveConfirmation's
    // SAVED_DISPLAY_MS) before the second toggle, so this assertion reads a
    // fresh confirmation, not a stale one still showing from the first toggle.
    await page.waitForTimeout(2700);
    await page.getByTestId('founding-fifty-enabled-toggle').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const offLabel = await page.getByTestId('founding-fifty-enabled-label').innerText().catch(() => '');
    const offLabelColor = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="founding-fifty-enabled-label"]');
      return el ? getComputedStyle(el).color : null;
    });
    const savedVisibleOff = await page.getByTestId('save-confirmation-saved').isVisible().catch(() => false);
    record(
      '[founding-50/admin] toggling back OFF flips the label back to OFF in gray and shows SAVED again',
      // #5F6B66 (colors.textMuted).
      offLabel.trim() === 'OFF' && offLabelColor === 'rgb(95, 107, 102)' && savedVisibleOff,
      JSON.stringify({ offLabel, offLabelColor, savedVisibleOff })
    );
    const datesAfterOff = await readDates();
    record(
      '[founding-50/admin] a full OFF-then-ON-then-OFF round trip still preserves the dates untouched',
      JSON.stringify(datesBefore) === JSON.stringify(datesAfterOff),
      JSON.stringify({ datesBefore, datesAfterOff })
    );

    await context.close();
  }

  // The real consumers: with the SAME live date window, enabled=false must
  // hide the founding experience everywhere, and enabled=true must show it
  // -- looped so both directions run against identical dates/spots.
  for (const enabledFlag of [false, true]) {
    const stateLabel = enabledFlag ? 'ON' : 'OFF';

    // About page, logged OUT -- the one screen a signed-out visitor sees,
    // reads the anon-safe founding_fifty_public_status() RPC.
    {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await setupMocks(page);
      await page.route('**/rest/v1/rpc/founding_fifty_public_status*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...FOUNDING_WINDOW_LIVE_DATES, claimed_count: 3, enabled: enabledFlag }),
        })
      );
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);

      const bannerText = await page
        .getByText(/FOUNDING 50 RATE|2 WEEKS FREE/, { exact: false })
        .first()
        .innerText()
        .catch(() => '');
      const ctaText = await page.getByTestId('about-start-free').innerText().catch(() => '');
      const spotsLeftVisible = await page.getByTestId('about-founding-spots-left').isVisible().catch(() => false);
      const deadlineVisible = await page.getByTestId('about-founding-deadline').isVisible().catch(() => false);

      record(
        `[founding-50/about-${stateLabel}] the logged-out About page takeover reflects the switch, not just the live date window`,
        enabledFlag
          ? bannerText.includes('FOUNDING 50 RATE') && ctaText.includes('CLAIM YOUR SPOT') && spotsLeftVisible && deadlineVisible
          : bannerText.includes('2 WEEKS FREE') && ctaText.includes('START FREE') && !spotsLeftVisible && !deadlineVisible,
        JSON.stringify({ bannerText, ctaText, spotsLeftVisible, deadlineVisible })
      );

      await context.close();
    }

    // Memberships, signed IN -- reads the signed-in FoundingFiftyContext.
    {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await setupMocks(page);
      await page.route('**/rest/v1/founding_fifty_settings*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ ...FOUNDING_WINDOW_LIVE_DATES, enabled: enabledFlag }]),
        })
      );
      await page.route('**/rest/v1/founding_fifty_members*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            enabledFlag
              ? [
                  { id: 'a', joined_at: new Date().toISOString(), profiles: { display_name: 'Member A' } },
                  { id: 'b', joined_at: new Date().toISOString(), profiles: { display_name: 'Member B' } },
                  { id: 'c', joined_at: new Date().toISOString(), profiles: { display_name: 'Member C' } },
                ]
              : []
          ),
        })
      );
      await seedSignedInSession(page);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await page.getByTestId('open-sidebar').click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.getByText('MEMBERSHIPS', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);

      const foundingSpotsVisible = await page.getByTestId('founding-fifty-spots-left').isVisible().catch(() => false);
      const foundingDeadlineVisible = await page.getByTestId('founding-fifty-deadline').isVisible().catch(() => false);
      const foundingPriceVisible = await page
        .getByText('$37', { exact: false })
        .first()
        .isVisible()
        .catch(() => false);

      record(
        `[founding-50/memberships-${stateLabel}] the Memberships banner/strikethrough reflects the switch, not just the live date window`,
        enabledFlag
          ? foundingSpotsVisible && foundingDeadlineVisible && foundingPriceVisible
          : !foundingSpotsVisible && !foundingDeadlineVisible && !foundingPriceVisible,
        JSON.stringify({ foundingSpotsVisible, foundingDeadlineVisible, foundingPriceVisible })
      );

      await context.close();
    }
  }

  // The deadline line's exact format -- "OFFER ENDS <WEEKDAY>, <MON> <DAY>,
  // <H:MM AM/PM> ET" -- must be computed live from the real saved end
  // datetime, never hardcoded, and must update automatically if the admin
  // changes the window. Two fixed, deliberately different end
  // dates/times/weekdays/months (expected strings computed independently
  // here via Node's own Intl, not by reusing foundingDeadlineLabel's own
  // code under test) prove the computation is real, not a lucky coincidence
  // with whichever single date a round happened to test against.
  const DEADLINE_FORMAT_CASES = [
    { label: 'fri-evening', endsAtIso: '2026-12-25T23:30:00.000Z', expected: 'OFFER ENDS FRIDAY, DEC 25, 6:30 PM ET' },
    { label: 'mon-morning', endsAtIso: '2027-03-08T14:05:00.000Z', expected: 'OFFER ENDS MONDAY, MAR 8, 9:05 AM ET' },
  ];
  for (const { label, endsAtIso, expected } of DEADLINE_FORMAT_CASES) {
    // Relative to NOW, not to endsAtIso -- a window is only open while
    // starts_at <= now <= ends_at, so starts_at has to be in the real past.
    const startsAtIso = new Date(Date.now() - 7 * 86400000).toISOString();

    // About page, logged OUT.
    {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await setupMocks(page);
      await page.route('**/rest/v1/rpc/founding_fifty_public_status*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ starts_at: startsAtIso, ends_at: endsAtIso, claimed_count: 3, enabled: true }),
        })
      );
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      const deadlineText = await page.getByTestId('about-founding-deadline').innerText().catch(() => null);
      record(
        `[founding-50/deadline-format/about-${label}] the About page deadline line reads the exact computed weekday/month/day/time`,
        deadlineText === expected,
        JSON.stringify({ deadlineText, expected })
      );
      await context.close();
    }

    // Memberships, signed IN.
    {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await setupMocks(page);
      await page.route('**/rest/v1/founding_fifty_settings*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ starts_at: startsAtIso, ends_at: endsAtIso, enabled: true }]),
        })
      );
      await page.route('**/rest/v1/founding_fifty_members*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: 'a', joined_at: new Date().toISOString(), profiles: { display_name: 'Member A' } }]),
        })
      );
      await seedSignedInSession(page);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await page.getByTestId('open-sidebar').click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.getByText('MEMBERSHIPS', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
      const deadlineText = await page.getByTestId('founding-fifty-deadline').innerText().catch(() => null);
      record(
        `[founding-50/deadline-format/memberships-${label}] the Memberships deadline line reads the exact computed weekday/month/day/time`,
        deadlineText === expected,
        JSON.stringify({ deadlineText, expected })
      );
      await context.close();
    }
  }

  // Server-side enforcement: a stale/forged client can never get the $37
  // founding rate while the switch is off, regardless of what the saved
  // dates say. The Edge Function runs in Deno, outside this Playwright
  // harness's reach (same category of gap as every other "can't exercise
  // the real server runtime from here" case already documented in this
  // file) -- this is a static source check, the same technique used
  // elsewhere in this suite when the real mechanism can't be driven
  // directly, confirming the function actually fetches and gates on
  // `enabled` before ever setting priceId to the founding price.
  {
    const edgeFnSrc = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'create-checkout', 'index.ts'), 'utf8');
    const selectsEnabled = /founding_fifty_settings['"]\)\s*\n?\s*\.select\(['"]starts_at, ends_at, enabled['"]\)/.test(edgeFnSrc);
    const gatesOnEnabled = /const\s+enabled\s*=\s*!!settingsRes\.data\?\.enabled;[\s\S]{0,120}eligibleForFounding\s*=\s*enabled\s*&&\s*windowLive/.test(
      edgeFnSrc
    );
    record(
      '[founding-50/edge-function] create-checkout re-fetches and gates on the enabled switch before ever granting the $37 founding price',
      selectsEnabled && gatesOnEnabled,
      JSON.stringify({ selectsEnabled, gatesOnEnabled })
    );
  }

  // --- Round 23: 12-hour clock everywhere. The static grep in
  // auditTwelveHourClock() (above) catches banned/required COPY strings in
  // the built bundle; this behavioral block proves actual RENDERED time
  // VALUES on three key live screens come out as 12-hour AM/PM, not just
  // that the right placeholder text shipped.
  // The minutes group is optional -- formatEtTime() (challengeSchedule.ts)
  // deliberately omits ":00" on an exact-hour time ("SATURDAY 12 PM ET",
  // not "12:00 PM ET"), which is still correctly 12-hour, not a 24-hour
  // regression.
  const twelveHourPattern = /\b(1[0-2]|[1-9])(:[0-5]\d)?\s?(AM|PM)\b/;
  const twentyFourHourPattern = /\b([01]\d|2[0-3]):[0-5]\d\b(?!\s?(AM|PM))/;

  // Group chat: a freshly sent message's own timestamp label must render
  // 12-hour AM/PM, never a bare 24-hour "HH:MM".
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    // sendMessage() (useGroupChat.ts) does a real `.insert(...).select(MESSAGE_SELECT).single()`
    // -- the default `[]` fallback every other unmocked table gets back from
    // setupMocks() makes `.single()` throw (no row), which rolls the optimistic
    // bubble straight back out before this check ever gets to read it. A real
    // single-object row (matching MESSAGE_SELECT's own shape) is required for
    // the message to actually land and stay rendered.
    await page.route('**/rest/v1/group_chat_messages*', async (route) => {
      if (route.request().method() !== 'POST') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      let payload = {};
      try {
        payload = JSON.parse(route.request().postData() || '{}');
      } catch {}
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'msg-12h-check',
          sender_id: USER_ID,
          body: payload.body ?? '',
          media_url: payload.media_url ?? null,
          media_type: payload.media_type ?? null,
          thumbnail_url: payload.thumbnail_url ?? null,
          created_at: new Date().toISOString(),
          deleted: false,
          profiles: { display_name: 'Test Member', avatar_url: null },
          group_chat_cheers: [],
        }),
      });
    });
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId('open-group-chat').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.getByTestId('group-chat-input').fill('12-hour clock check');
    await page.getByTestId('group-chat-send').click({ timeout: 5000 }).catch(() => {});
    // The timestamp Text is swapped for a pending-clock icon while the
    // optimistic bubble is still in flight (see DocsGroupChatScreen.tsx) --
    // wait for the real row (the mocked insert resolves quickly, but not
    // synchronously) before reading it, instead of a fixed guess.
    await page
      .locator('[data-testid^="group-chat-message-pending-"]')
      .waitFor({ state: 'detached', timeout: 5000 })
      .catch(() => {});
    // The row's own testID (`group-chat-message-${id}`) is only an exact
    // match on the real server-assigned id -- the mocked insert above
    // always returns `msg-12h-check`. A prefix selector would also match
    // this message's OWN nested `-body-`/`-pending-`/`-menu-` testIDs
    // (same `group-chat-message-` prefix), and `.last()` on those resolves
    // to whichever nested element happens to render last in the DOM (the
    // body text), not the outer row that actually carries the timestamp
    // sibling -- an exact id match is the only way to reliably land on the
    // row itself.
    const messageRowText = await page
      .getByTestId('group-chat-message-msg-12h-check')
      .innerText({ timeout: 3000 })
      .catch(() => '');
    record(
      '[12-hour-clock/group-chat] a freshly sent message\'s own timestamp renders 12-hour AM/PM, not 24-hour',
      twelveHourPattern.test(messageRowText) && !twentyFourHourPattern.test(messageRowText),
      JSON.stringify({ messageRowText })
    );
    await context.close();
  }

  // Weekly Challenge: whichever timing line is showing (open or closed)
  // must render 12-hour AM/PM.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    // useCurrentChallenge() (ChallengeContext.tsx) only renders the
    // ChallengeHero (and thus either timing testid) once it finds a
    // published 'cow' entry in Content Library's own local storage --
    // the real seed ships every entry as a DRAFT, so a fresh/empty
    // profile (every other screen in this suite) never has a "current"
    // challenge at all and shows the no-challenge notice instead. Seed one
    // directly, bypassing the admin publish flow, the same way a real
    // member's device would have one after Doc publishes.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem(
          'contentLibraryDrafts.v1',
          JSON.stringify([
            {
              id: 'test-12h-cow',
              name: 'Test Challenge',
              originalTitle: 'Test Challenge',
              type: 'cow',
              format: '10min AMRAP',
              formatDescription: '',
              movements: ['Kettlebell Swings'],
              videoUrl: '',
              notes: '',
              scoringType: 'rounds',
              releaseAt: Date.now() - 86400000,
              status: 'published',
              scheduled: true,
              createdAt: Date.now() - 86400000,
              updatedAt: Date.now() - 86400000,
            },
          ])
        );
        window.localStorage.setItem('contentLibraryDrafts.v1.seedVersion', '1');
      } catch {}
    });
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const tabButton = page.getByRole('tab', { name: /WEEKLY CHALLENGE/i }).first();
    await tabButton.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    const openTiming = await page.getByTestId('challenge-open-timing').innerText({ timeout: 3000 }).catch(() => null);
    const closedTiming = await page.getByTestId('challenge-closed-timing').innerText({ timeout: 3000 }).catch(() => null);
    const timingText = openTiming ?? closedTiming ?? '';
    record(
      '[12-hour-clock/weekly-challenge] the challenge close/reveal timing line renders 12-hour AM/PM, not 24-hour',
      !!timingText && twelveHourPattern.test(timingText) && !twentyFourHourPattern.test(timingText),
      JSON.stringify({ openTiming, closedTiming })
    );
    await context.close();
  }

  // FoundingFiftyAdminScreen: a known seeded ET window must prefill the
  // START/END TIME fields in exact 12-hour "H:MM AM/PM" form.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await page.route('**/rest/v1/profiles*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            display_name: 'Test Admin',
            instagram_handle: '',
            favorite_quote: '',
            avatar_url: null,
            how_train: 'boathouse',
            is_admin: true,
            show_tomorrows_workout: true,
            tour_completed_at: new Date(Date.now() - 30 * 86400000).toISOString(),
            group_chat_muted: false,
          },
        ]),
      })
    );
    // 2027-01-15T14:30:00.000Z / 2027-01-20T04:59:00.000Z -- January, no
    // DST ambiguity -- are confirmed (via a standalone Intl check) to read
    // as exactly "9:30 AM" / "11:59 PM" Eastern, the two boundary-adjacent
    // values (a non-12/non-zero-minute AM time, and a PM time crossing
    // the 12-hour rollover) this function's own hour12/hour%12 math most
    // needs to get right.
    await page.route('**/rest/v1/founding_fifty_settings*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { starts_at: '2027-01-15T14:30:00.000Z', ends_at: '2027-01-20T04:59:00.000Z', enabled: true },
        ]),
      })
    );
    await page.route('**/rest/v1/founding_fifty_members*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId('open-sidebar').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText('THE FOUNDING 50', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    const startTimeValue = await page.locator('#founding-fifty-start-time').inputValue().catch(() => null);
    const endTimeValue = await page.locator('#founding-fifty-end-time').inputValue().catch(() => null);
    record(
      '[12-hour-clock/founding-50-admin] the seeded ET window prefills START/END TIME as exact 12-hour "H:MM AM/PM"',
      startTimeValue === '9:30 AM' && endTimeValue === '11:59 PM',
      JSON.stringify({ startTimeValue, endTimeValue })
    );
    await context.close();
  }

  await browser.close();
  console.log('\n=== SUMMARY ===');
  const failed = results.filter((r) => !r.pass);
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('FAILED:', failed.map((f) => f.name).join(', '));
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
