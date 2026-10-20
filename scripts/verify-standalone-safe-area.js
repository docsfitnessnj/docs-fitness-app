#!/usr/bin/env node
// Permanent regression guard for the installed, standalone iPhone PWA's
// safe-area handling.
//
// WHY THIS EXISTS: react-native-web's useSafeAreaInsets() always reports 0
// on web -- there is no OS bridge feeding it there, unlike on native. Any
// screen that relied on it for spacing near the physical top/bottom edge
// was silently wrong specifically in standalone mode (no browser chrome),
// while looking fine in ordinary mobile Safari (whose own chrome happens
// to occupy that space). See AGENTS.md's "Web safe-area insets always
// report zero" section for the full writeup and the fix technique
// (SafeAreaTopFill / SafeAreaBottomFill, and -- for screens that already
// carried their own flat "ordinary chrome" paddingTop predating those
// components -- a `calc(<flat value>px + env(safe-area-inset-top))`
// override on that same padding, in public/index.html).
//
// This script simulates the installed standalone app by forcing those
// CSS rules to the values they'd resolve to with a realistic iPhone inset
// (59px top, 34px bottom -- a Face-ID-era iPhone's status bar / home-
// indicator insets) via an injected stylesheet, since a real env() value
// can't be set from outside WebKit. It then asserts, on every key screen:
//   - the topmost rendered content begins at EXACTLY the expected offset
//     (its flat baseline, if it has one, plus the forced inset) within a
//     small tolerance -- not "at least", which can't catch overcounting;
//   - exactly one top-safe-area element/rule applies to that screen (no
//     leftover default-id fill stacked behind a screen that now manages
//     its own padding, and vice versa);
//   - for the signed-in, fixed-viewport tab-bar shell, the rendered #root
//     height equals the viewport height exactly -- no gap of bare page
//     background below the tab bar fill.
// A second, un-forced pass over the same screens proves the fix is a
// no-op in ordinary browser chrome (every fill/override resolves to 0,
// nothing shifts).
//
// RUN THIS ON EVERY ROUND that touches a full-screen layout or adds a new
// one -- see AGENTS.md. It is NOT a substitute for the per-round
// Playwright verification scripts written ad hoc in the scratchpad; it's
// the one permanent check that specifically guards against this class of
// regression, wired in via `npm run verify:standalone-safe-area`.
//
// Prerequisites: a production static export (`npx expo export -p web`)
// served locally, e.g.:
//   npx expo export -p web
//   cp -r dist/* /tmp/docsfitness-root/docs-fitness-app/
//   (cd /tmp/docsfitness-root && python3 -m http.server 8090 &)
// Override the base URL with the BASE_URL env var if serving elsewhere.

const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:8090/docs-fitness-app';
const PROJECT_REF = 'qooezwnskaqvmquydijg';
const USER_ID = '99999999-9999-9999-9999-999999999999';

// A Face-ID-era iPhone's real insets (iPhone 14/15/16 standard size).
const FORCED_TOP = 59;
const FORCED_BOTTOM = 34;

// Every top-safe-area id in the app, and how each resolves once the real
// inset is forced to FORCED_TOP. `kind: 'fill'` ids are a dedicated
// element whose own height is the safe-area value (possibly plus a flat
// baseline folded into the SAME element, for ScreenOverlay's shared id);
// `kind: 'padding'` ids are a screen's own pre-existing root container,
// whose *padding-top* is overridden to additively include the real inset
// instead of a separate fill element existing at all. Either way, each id
// maps to exactly ONE mechanism per screen -- that invariant is what
// "exactly one top inset per rendered screen" (this round's rule) means
// in practice, and what TOP_IDS below lets the suite assert directly.
const TOP_IDS = {
  'safe-area-top-fill': { kind: 'fill', baseline: 0 },
  'screen-overlay-safe-top-60': { kind: 'fill', baseline: 60 },
  'story-viewer-safe-top': { kind: 'padding', baseline: 50 },
  'create-post-safe-top': { kind: 'padding', baseline: 16 },
  'media-viewer-safe-top': { kind: 'padding', baseline: 56 },
  'invite-friend-safe-top': { kind: 'padding', baseline: 48 },
  'story-locked-safe-top': { kind: 'padding', baseline: 60 },
  'post-detail-safe-top': { kind: 'padding', baseline: 60 },
  'log-results-safe-top': { kind: 'padding', baseline: 60 },
  'sign-in-safe-top': { kind: 'padding', baseline: 60 },
  'pricing-safe-top': { kind: 'padding', baseline: 60 },
  'in-person-plans-safe-top': { kind: 'padding', baseline: 60 },
  'how-do-you-train-safe-top': { kind: 'padding', baseline: 60 },
  'forgot-password-safe-top': { kind: 'padding', baseline: 60 },
  'online-start-safe-top': { kind: 'padding', baseline: 60 },
  'set-new-password-safe-top': { kind: 'padding', baseline: 60 },
};

const BOTTOM_FILL_IDS = ['tab-bar-safe-area-fill', 'group-chat-composer-safe-area-fill', 'doc-thread-composer-safe-area-fill'];

const FORCE_INSET_CSS = `
  ${Object.entries(TOP_IDS)
    .map(([id, { kind, baseline }]) => {
      const forced = baseline + FORCED_TOP;
      const prop = kind === 'fill' ? 'height' : 'padding-top';
      return `#${id} { ${prop}: ${forced}px !important; }`;
    })
    .join('\n  ')}
  #welcome-back-safe-top { top: ${60 + FORCED_TOP}px !important; }
  ${BOTTOM_FILL_IDS.map((id) => `#${id}`).join(',\n  ')} {
    height: ${FORCED_BOTTOM}px !important;
  }
`;

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
        // Walk up from the hit element (elementFromPoint often returns a
        // deep leaf, e.g. a <span> inside a <Text>) looking for the first
        // ancestor (inclusive) that itself has real content, so a leaf
        // whose OWN box starts a little below y (inline text baseline,
        // icon padding) doesn't get missed.
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
async function countVisibleTopSafeAreaElements(page, allTopIds) {
  return page.evaluate((ids) => {
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

async function run() {
  const browser = await chromium.launch();
  const results = [];
  const record = (name, pass, detail) => {
    results.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ' -- ' + detail : ''}`);
  };

  const VIEWPORT = { width: 390, height: 844 };
  const allTopIds = Object.keys(TOP_IDS);

  // label: screen name
  // navigate: async (page) => void, from the About landing screen
  // topId: which TOP_IDS key this screen's own top offset is governed by
  // expectBottomFill / fillId: as before
  // signedIn: seed a session before navigating
  // checkRootHeightExact: assert #root's height === window.innerHeight
  //   exactly (the signed-in, fixed-viewport tab-bar shell) instead of
  //   just >= (the pre-signup natural-document-scroll screens, which are
  //   allowed to grow taller than one viewport).
  async function checkScreen(
    label,
    navigate,
    { expectBottomFill = false, fillId = 'tab-bar-safe-area-fill', signedIn = true, topId, checkRootHeightExact = signedIn, skipOffsetCheck = false } = {}
  ) {
    const baseline = TOP_IDS[topId].baseline;

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

      const ownValue = await page.evaluate(
        ({ id, kind }) => {
          const el = document.getElementById(id);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return kind === 'fill' ? rect.height : parseFloat(window.getComputedStyle(el).paddingTop);
        },
        { id: topId, kind: TOP_IDS[topId].kind }
      );
      if (ownValue !== null) {
        record(`[baseline/${label}] #${topId} resolves to its flat baseline (${baseline}px) in ordinary browser chrome`, Math.abs(ownValue - baseline) <= 1, JSON.stringify({ ownValue, baseline }));
      }
      if (expectBottomFill) {
        const bf = await bottomFillReachesEdge(page, fillId);
        if (bf) record(`[baseline/${label}] bottom fill is 0px in ordinary browser chrome`, bf.height === 0, JSON.stringify(bf));
      }
      await context.close();
    }

    // Forced inset: simulates the installed standalone app.
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

      // A screen whose main content is vertically CENTERED rather than
      // anchored right below the fill (the pre-signup hero screens) has
      // no single well-defined "topmost content" pixel to check here --
      // its correctness is already covered by the baseline-resolves-
      // correctly and exactly-one-mechanism assertions below. For every
      // other (top-anchored) screen, a tolerance of 15px absorbs ordinary
      // internal design padding (a bar's own paddingVertical, a drawer
      // row's own spacing) that was never part of the inset in the first
      // place, while still catching real stacking -- which adds a second
      // ~50-60px inset, far outside this window.
      if (!skipOffsetCheck) {
        const expectedTop = baseline + FORCED_TOP;
        const top = await topmostContentTop(page, allTopIds);
        record(
          `[forced-inset/${label}] topmost rendered content begins at the expected ${expectedTop}px offset (baseline ${baseline} + forced inset ${FORCED_TOP}), not a multiple of it`,
          top !== null && Math.abs(top - expectedTop) <= 15,
          JSON.stringify({ top, expectedTop })
        );
      }

      const elementCount = await countVisibleTopSafeAreaElements(page, allTopIds);
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
