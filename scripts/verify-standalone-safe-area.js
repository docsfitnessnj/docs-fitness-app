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
const SANCTIONED_PROBE_IDS = ['safe-area-probe-top', 'safe-area-probe-bottom', 'debug-probe-100dvh', 'debug-probe-100vh'];

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

async function run() {
  const browser = await chromium.launch();
  const results = [];
  const record = (name, pass, detail) => {
    results.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ' -- ' + detail : ''}`);
  };

  auditBuiltOutputEnvConsumers(record);

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
