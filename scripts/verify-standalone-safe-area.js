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
// (SafeAreaTopFill / SafeAreaBottomFill, CSS env() rules in
// public/index.html).
//
// This script simulates the installed standalone app by forcing those
// CSS rules to realistic iPhone values (59px top, 34px bottom -- a
// Face-ID-era iPhone's status bar / home-indicator insets) via an
// injected stylesheet, since a real env() value can't be set from outside
// WebKit. It then asserts, on every key screen, that nothing clips: the
// topmost rendered content starts at or below the forced top inset, and
// any bottom-anchored bar/composer's fill paints all the way to the
// physical bottom edge. A second, un-forced pass over the same screens
// proves the fix is a no-op in ordinary browser chrome (every fill
// resolves to 0px, nothing shifts).
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
const FORCE_INSET_CSS = `
  #safe-area-top-fill { height: ${FORCED_TOP}px !important; }
  #welcome-back-safe-top { top: ${60 + FORCED_TOP}px !important; }
  #tab-bar-safe-area-fill,
  #group-chat-composer-safe-area-fill,
  #doc-thread-composer-safe-area-fill {
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

// Finds the topmost (smallest .top) visible, non-empty leaf-ish element on
// the page -- "topmost rendered content" for the clipping assertion. Skips
// the fill elements themselves (they're expected to be flush with the top)
// and anything with zero size.
async function topmostContentTop(page) {
  return page.evaluate(() => {
    const skipIds = new Set(['safe-area-top-fill', 'tab-bar-safe-area-fill', 'group-chat-composer-safe-area-fill', 'doc-thread-composer-safe-area-fill']);
    const skipTags = new Set(['HTML', 'BODY', 'DIV']);
    let best = Infinity;
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      if (skipIds.has(el.id)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Full-viewport (or near enough) wrapper/backdrop elements -- #root,
      // mainColumn, a modal's own full-bleed layer -- are never what we
      // mean by "content"; skip anything that covers (almost) the whole
      // screen so its own background color can't masquerade as the
      // topmost real thing on screen.
      if (rect.width >= window.innerWidth * 0.98 && rect.height >= window.innerHeight * 0.9) continue;
      // Only count elements with actual rendered, own content (real text,
      // an image, a visible border) -- a bare <div> with just a
      // background-color is still almost always a layout wrapper, not
      // something a user would call "content" on screen, and including it
      // reintroduces the same false-positive #root masked.
      const isLeafText = el.textContent && el.textContent.trim().length > 0 && el.children.length === 0;
      const cs = window.getComputedStyle(el);
      const hasOwnContent = isLeafText || el.tagName === 'IMG' || el.tagName === 'SVG' || (cs.borderTopWidth && cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none');
      if (!hasOwnContent) continue;
      if (rect.top < best) best = rect.top;
    }
    return best === Infinity ? null : best;
  });
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

  async function checkScreen(label, navigate, { expectBottomFill = false, fillId = 'tab-bar-safe-area-fill', signedIn = true } = {}) {
    // Baseline: no forced inset. Every fill must be 0 and nothing may shift.
    {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await setupMocks(page);
      if (signedIn) await seedSignedInSession(page);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await navigate(page);
      await page.waitForTimeout(400);

      const topFillHeight = await page.evaluate(() => {
        const el = document.getElementById('safe-area-top-fill');
        return el ? el.getBoundingClientRect().height : null;
      });
      if (topFillHeight !== null) {
        record(`[baseline/${label}] top fill is 0px in ordinary browser chrome`, topFillHeight === 0, JSON.stringify({ topFillHeight }));
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

      const top = await topmostContentTop(page);
      record(`[forced-inset/${label}] topmost rendered content begins at or below the forced ${FORCED_TOP}px top inset`, top !== null && top >= FORCED_TOP - 1, JSON.stringify({ top }));

      if (expectBottomFill) {
        const bf = await bottomFillReachesEdge(page, fillId);
        record(
          `[forced-inset/${label}] bottom fill paints to the physical bottom edge`,
          !!bf && bf.height === FORCED_BOTTOM && Math.abs(bf.bottom - bf.windowHeight) <= 1,
          JSON.stringify(bf)
        );
      }

      await context.close();
    }
  }

  // --- welcome / sign up (same screen) ---
  await checkScreen(
    'welcome (sign up)',
    async (page) => {
      await page.getByTestId('about-start-free').click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600);
    },
    { signedIn: false }
  );

  // --- sign in ---
  await checkScreen(
    'sign in',
    async (page) => {
      await page.getByTestId('about-sign-in-upper').click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600);
    },
    { signedIn: false }
  );

  // --- Community tab (default signed-in landing) + main app top bar ---
  await checkScreen('Community tab', async () => {}, { expectBottomFill: true });

  // --- the other three tabs ---
  for (const tabLabel of ["DOC'S WODS", 'WEEKLY CHALLENGE', 'THE DECK']) {
    await checkScreen(`${tabLabel} tab`, async (page) => {
      const tabButton = page.getByRole('tab', { name: new RegExp(tabLabel.replace(/'/g, "'?"), 'i') }).first();
      await tabButton.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }, { expectBottomFill: true });
  }

  // --- Memberships (a ScreenOverlay-wrapped full-screen modal) ---
  await checkScreen('Memberships', async (page) => {
    await page.getByTestId('open-sidebar').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText('MEMBERSHIPS', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
  });

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
