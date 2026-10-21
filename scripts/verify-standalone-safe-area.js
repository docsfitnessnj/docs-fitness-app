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
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:8090/docs-fitness-app';
// Optional: set to a directory to save the sign-in/group-chat screenshots
// this round's instructions explicitly asked for. Omitted by default so
// routine runs of this permanent suite don't write files into the repo.
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || null;
const DIST_DIR = process.env.DIST_DIR || path.join(__dirname, '..', 'dist');
const PROJECT_REF = 'qooezwnskaqvmquydijg';
const USER_ID = '99999999-9999-9999-9999-999999999999';

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

// Round 12's own regression guard: the keyboard-inset fix. Forces
// --keyboard-inset directly (the same single-source-of-truth technique as
// FORCE_INSET_CSS for the safe-area variables) on a bottom-anchored
// composer's own nativeID and asserts its rendered top moves up by
// EXACTLY that amount, then that it returns to its original position when
// the var goes back to 0 -- "closes" the keyboard without actually
// needing one, which Playwright can't simulate.
async function checkKeyboardRise(page, nativeID, label, record) {
  const FORCED_KEYBOARD_INSET = 300;
  const rectTop = () =>
    page.evaluate((id) => {
      const el = document.getElementById(id);
      return el ? el.getBoundingClientRect().top : null;
    }, nativeID);

  const before = await rectTop();
  await page.addStyleTag({ content: `html { --keyboard-inset: ${FORCED_KEYBOARD_INSET}px !important; }` });
  await page.waitForTimeout(150);
  const risen = await rectTop();
  record(
    `[keyboard-inset/${label}] composer rises by exactly the forced --keyboard-inset amount`,
    before !== null && risen !== null && Math.abs(before - risen - FORCED_KEYBOARD_INSET) <= 1,
    JSON.stringify({ before, risen, FORCED_KEYBOARD_INSET })
  );

  await page.addStyleTag({ content: `html { --keyboard-inset: 0px !important; }` });
  await page.waitForTimeout(150);
  const closed = await rectTop();
  record(
    `[keyboard-inset/${label}] composer returns to its original position once --keyboard-inset is 0 (same as the keyboard closing)`,
    before !== null && closed !== null && Math.abs(before - closed) <= 1,
    JSON.stringify({ before, closed })
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

    const before = await page.evaluate(() => {
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

  // --- Round 12's own regression guard: the keyboard-inset fix. Group
  // chat and Message Doc are both reachable with the existing mocks (no
  // seeded post data needed); PostDetailModal's own comment composer uses
  // the identical #post-detail-composer-keyboard-rise/--keyboard-inset
  // mechanism (see index.html) but needs a real post to open, which the
  // mocked empty community_posts table doesn't provide -- covered by code
  // review rather than an automated check here, not by a different,
  // untested technique.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    await page.getByTestId('open-group-chat').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    await checkKeyboardRise(page, 'group-chat-composer-keyboard-rise', 'group chat', record);

    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page);
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    await page.getByTestId('open-sidebar').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByTestId('sidebar-message').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    await checkKeyboardRise(page, 'doc-thread-composer-keyboard-rise', 'Message Doc', record);

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
  // that triggered it is still mounted.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
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
      '[keyboard-snapshot] the snapshot identifies the mounted keyboard-rise composer (group chat) with its rect and transform',
      !!snapshot && snapshot.composerId === 'group-chat-composer-keyboard-rise' && !!snapshot.composerRect && typeof snapshot.composerTransform === 'string',
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
      panelText.includes('LAST KEYBOARD SNAPSHOT') && panelText.includes('group-chat-composer-keyboard-rise'),
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
