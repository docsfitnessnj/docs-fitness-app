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

async function setupMocks(page, userId = USER_ID) {
  await page.route('**/auth/v1/token*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, refresh_token: 'r', user: { id: userId, email: 'member@example.com' } }),
    })
  );
  await page.route('**/auth/v1/user*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: userId, email: 'member@example.com', aud: 'authenticated', role: 'authenticated' }) })
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
    // Round 24: DayPanel's class rows are now DB-backed (migration_023) --
    // without this, every check that doesn't care about booking at all
    // (nearly everything above this comment in this file) would silently
    // render ZERO class rows, same as a genuinely stale/un-generated
    // session window would in the real app. That's a real behavior worth
    // knowing about, but it isn't what any of those checks are testing,
    // and the missing content was enough to flip the
    // [viewport-lock/ordinary-scrolling] check (which needs the Community
    // tab to have ITS USUAL amount of content to overflow at all). A
    // realistic default -- generated fresh every call, mirroring
    // migration_023's own real weekly template, zero bookings -- restores
    // the same baseline every pre-existing check already assumed. Any
    // check that actually cares about booking state registers its own
    // registerClassBookingMocks AFTER this (same override-priority
    // convention as every other fixture in this file), which wins.
    if (table === 'ensure_class_sessions') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }
    if (table === 'class_sessions_with_availability') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(defaultClassSessionsFixture()) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  // Round 28: CommunityContext.tsx's addTextPost/addWodResultPost/
  // updateTextPost now upload a locally-picked (blob:) attachment to the
  // real community-media Storage bucket before ever writing media_url --
  // see uploadCommunityMedia there. Any check that posts with a photo now
  // genuinely calls supabase.storage.from('community-media').upload(),
  // which without this mock would hit the real network and fail (no real
  // session/credentials in this harness). @supabase/storage-js's own
  // uploadOrUpdate() reads `data.Key`/`data.Id` off the JSON response body
  // (dist/index.cjs) -- this is the same response shape a real successful
  // upload returns.
  await page.route('**/storage/v1/object/community-media/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ Key: `community-media/${route.request().url().split('/community-media/')[1]}`, Id: 'mock-upload-id' }),
    })
  );
  await page.routeWebSocket(/realtime/, (ws) => ws.close());
}

async function seedSignedInSession(page, userId = USER_ID) {
  await page.addInitScript(
    ({ projectRef, userId }) => {
      window.localStorage.setItem(
        `sb-${projectRef}-auth-token`,
        JSON.stringify({ access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: userId, email: 'member@example.com', aud: 'authenticated', role: 'authenticated' } })
      );
    },
    { projectRef: PROJECT_REF, userId }
  );
}

// ---------------------------------------------------------------------------
// Round 24: real class booking backend (migration_023) mock harness.
//
// The real atomicity guarantee (book_class's row lock, the partial unique
// indexes) was already proven directly against a real local Postgres
// instance, not assumed -- a 12-point functional test script covering
// session generation, every payment method, CLASS_FULL,
// first-class-free (once, and refused on Pilates), the service-role gate,
// and admin capacity cascading. That's documented in this round's PR
// description, not re-proven here.
//
// Round 25: the waitlist (join, position, auto-promotion-on-cancel) was
// removed app-wide by owner decision -- a full class is now a dead end,
// not a flow. The class_waitlist table/functions still exist, dormant, in
// the database; nothing in this mock harness or the suite below
// references them anymore.
//
// What THIS suite verifies is the one thing the direct-Postgres test
// can't: that the CLIENT correctly respects whatever the server decides --
// never double-books past a CLASS_FULL response, renders the
// uncapped-Pilates state correctly, and that two independently
// authenticated members racing for the same last spot can't both land it.
// A single shared, in-memory `state` object (mutated by route handlers
// that run in this Node process, not in the browser) stands in for the
// server; two separate browser contexts pointed at the SAME state object
// is what makes the "two different members, one spot" check below a real
// two-actor test rather than one user tapping twice.
const OTHER_MEMBER_A = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OTHER_MEMBER_B = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SECOND_BOOKER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const DISPLAY_NAMES = {
  [USER_ID]: 'Test Member',
  [OTHER_MEMBER_A]: 'Alex Boathouse',
  [OTHER_MEMBER_B]: 'Bailey Boathouse',
  [SECOND_BOOKER_ID]: 'Casey Boathouse',
  [MEMBER_FIXTURE_ID]: 'Ada Memberson',
};

function pgDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// How many days from today (0 = today) the next occurrence of weekday
// `targetDow` (0=Sun..6=Sat) falls -- deterministic regardless of which
// real day this suite happens to run on. Community's own DateStrip cells
// are indexed the same way (index 0 = today, see getUpcomingDays), so
// this offset doubles as both the fixture's own date and the
// `date-strip-cell-${offset}` to tap to reach it.
function offsetToWeekday(targetDow) {
  return (targetDow - new Date().getDay() + 7) % 7;
}
function dateAtOffsetDays(offsetDays, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// A session fixture a few hours from now, guaranteed inside the real
// 21-day booking window, with its own real class_key/class_name so DayPanel
// (which keys off schedule.ts's rowsForDate -> classKey == 'mwf-530a') or
// the Pilates lookup (isGuestClass) renders it as a live session. `date`
// defaults to today, matching whatever weekday this suite happens to run
// on -- callers that need a SPECIFIC weekday pass one explicitly.
function makeSessionFixture({ id, classKey, className, classType, capacity, isGuestClass = false, priceCents = null, stripePriceId = null, date = new Date(Date.now() + 3 * 3600000) }) {
  return {
    id,
    class_key: classKey,
    session_date: pgDateString(date),
    start_at: date.toISOString(),
    class_name: className,
    class_type: classType,
    location_name: "Dr. John W. Holland Boathouse",
    capacity,
    is_guest_class: isGuestClass,
    price_cents: priceCents,
    stripe_price_id: stripePriceId,
  };
}

function createClassBookingState(sessions) {
  return { sessions, bookings: [], nextId: 1 };
}

// setupMocks' own generic baseline (see the big comment at its
// class_sessions_with_availability branch) -- the real weekly template
// from migration_023.sql (Pilates deliberately excluded; it's a once-a-
// week guest class most pre-existing checks have no reason to expect),
// generated fresh for the real 21-day window every call so it's never
// tied to whatever day this suite happens to run. Always zero bookings --
// a signed-in member with no booking history is the correct default for
// every check that isn't itself about booking state.
const DEFAULT_WEEKLY_TEMPLATE = [
  { classKey: 'mwf-530a', className: 'Dawn Patrol', classType: 'Kettlebell Strength', days: [1, 3, 5], hour: 5, minute: 30 },
  { classKey: 'mwf-930a', className: 'Yawn Patrol', classType: 'Kettlebell Strength', days: [1, 3, 5], hour: 9, minute: 30 },
  { classKey: 'tth-930a', className: 'Yawn Patrol', classType: 'Kettlebell Cardio', days: [2, 4], hour: 9, minute: 30 },
  { classKey: 'sat-815a', className: 'Savage Saturday', classType: 'Hybrid', days: [6], hour: 8, minute: 15 },
];
function defaultClassSessionsFixture() {
  const rows = [];
  for (let offset = 0; offset < 21; offset++) {
    const date = dateAtOffsetDays(offset, 0, 0);
    const dow = date.getDay();
    for (const t of DEFAULT_WEEKLY_TEMPLATE) {
      if (!t.days.includes(dow)) continue;
      const session = makeSessionFixture({
        id: `default-${t.classKey}-${offset}`,
        classKey: t.classKey,
        className: t.className,
        classType: t.classType,
        // Round 25: the real default capacity is 50 (migration_024), not
        // the original 30 -- this is the one place every pre-existing,
        // non-booking-specific check's baseline sessions come from, so
        // this single number IS the "default capacity" this whole suite
        // assumes unless a check explicitly overrides it.
        capacity: 50,
        date: dateAtOffsetDays(offset, t.hour, t.minute),
      });
      rows.push({ ...session, booked_count: 0 });
    }
  }
  return rows;
}

function bookedCountFor(state, sessionId) {
  return state.bookings.filter((b) => b.session_id === sessionId && b.status === 'booked').length;
}
function sessionAvailabilityRow(state, s) {
  return { ...s, booked_count: bookedCountFor(state, s.id) };
}

// Seeds `count` already-booked fixture rows from OTHER members (never
// USER_ID) directly into shared state -- simulating "this class already
// has N real people in it" without those other members ever being a real
// browser context. Used to put a session at (capacity - 1) or already full
// before the signed-in test user's own action is what's under test.
function seedOtherBookings(state, sessionId, count, paymentMethod = 'unlimited') {
  const others = [OTHER_MEMBER_A, OTHER_MEMBER_B];
  for (let i = 0; i < count; i++) {
    state.bookings.push({
      id: `fixture-booking-${state.nextId++}`,
      session_id: sessionId,
      user_id: others[i % others.length],
      status: 'booked',
      payment_method: paymentMethod,
      booked_at: new Date(Date.now() - (count - i) * 1000).toISOString(),
    });
  }
}

// Registers every class-booking RPC/table route against one shared `state`
// object, scoped to one `userId` (the member this particular page/context
// is signed in as -- see OTHER_MEMBER_A/B above for why two contexts can
// share the SAME state while being two different "members"). Registered
// AFTER setupMocks(page, userId), same override-priority convention as the
// search-deep-link/founding-50 fixtures elsewhere in this file -- every
// table setupMocks already has a real default for (profiles, subscriptions)
// still falls through to it untouched.
async function registerClassBookingMocks(page, state, userId) {
  await page.route('**/rest/v1/rpc/ensure_class_sessions*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));

  await page.route('**/rest/v1/rpc/class_sessions_with_availability*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.sessions.map((s) => sessionAvailabilityRow(state, s))) })
  );

  await page.route('**/rest/v1/rpc/book_class*', (route) => {
    const body = route.request().postDataJSON() || {};
    const sessionId = body.p_session_id;
    const paymentMethod = body.p_payment_method;
    const session = state.sessions.find((s) => s.id === sessionId);
    if (!session) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'NOT_FOUND: session does not exist' }) });
    }
    const alreadyActive = state.bookings.some((b) => b.session_id === sessionId && b.user_id === userId && b.status === 'booked');
    if (alreadyActive) {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'ALREADY_BOOKED: you already have a spot in this class' }) });
    }
    if (paymentMethod === 'first_class_free') {
      const everUsed = state.bookings.some((b) => b.user_id === userId && b.payment_method === 'first_class_free');
      if (everUsed) {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'ALREADY_USED: first class free already redeemed' }) });
      }
      if (session.is_guest_class) {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'NOT_ELIGIBLE: first class free does not apply to Downbeach Pilates' }) });
      }
    }
    // The one real server guarantee under test here: whoever's request
    // reaches this capacity check SECOND, with the first already recorded
    // in shared state, is refused -- the same row-lock-serializes-the-race
    // shape as the real book_class, just expressed as ordinary JS
    // single-threaded execution instead of a Postgres row lock.
    const bookedCount = bookedCountFor(state, sessionId);
    if (session.capacity !== null && bookedCount >= session.capacity) {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'CLASS_FULL: this class is full' }) });
    }
    // Mirrors use_class_pack_credit() being called as part of the real
    // book_class's own transaction -- the spend and the booking are one
    // atomic unit server-side, so the mock debits the same shared state the
    // signed-in user's own `class_packs` route reads from.
    if (paymentMethod === 'pack_credit' && state.packCreditsRemaining !== undefined) {
      state.packCreditsRemaining = Math.max(0, state.packCreditsRemaining - 1);
    }
    state.bookings.push({ id: `booking-${state.nextId++}`, session_id: sessionId, user_id: userId, status: 'booked', payment_method: paymentMethod, booked_at: new Date().toISOString() });
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });

  await page.route('**/rest/v1/rpc/cancel_class_booking*', (route) => {
    const body = route.request().postDataJSON() || {};
    const booking = state.bookings.find((b) => b.id === body.p_booking_id);
    if (!booking || booking.user_id !== userId || booking.status !== 'booked') {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'NOT_FOUND: booking not found' }) });
    }
    booking.status = 'cancelled';
    if (booking.payment_method === 'pack_credit') state.packCreditsRemaining = (state.packCreditsRemaining ?? 10) + 1;
    // Round 25: no auto-promotion -- the waitlist is gone app-wide. A
    // cancelled spot simply opens back up for the next person who books it.
    // Mirrors the real function's own RETURNS TABLE(payment_method,
    // needs_stripe_refund, stripe_checkout_session_id) -- this is what
    // ClassBookingContext.cancel() reads to decide whether to call
    // refund-booking at all, so the mock has to shape it the same way,
    // not just report success.
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          payment_method: booking.payment_method,
          needs_stripe_refund: booking.payment_method === 'drop_in_paid' || booking.payment_method === 'pilates_paid',
          stripe_checkout_session_id: booking.stripe_checkout_session_id ?? null,
        },
      ]),
    });
  });

  await page.route('**/rest/v1/rpc/admin_class_roster*', (route) => {
    const body = route.request().postDataJSON() || {};
    const rows = state.bookings
      .filter((b) => b.session_id === body.p_session_id && b.status === 'booked')
      .map((b) => ({
        booking_id: b.id,
        user_id: b.user_id,
        display_name: DISPLAY_NAMES[b.user_id] ?? 'Member',
        payment_method: b.payment_method,
        booked_at: b.booked_at,
        is_first_class: b.payment_method === 'first_class_free',
      }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });

  await page.route('**/rest/v1/rpc/admin_update_template_capacity*', (route) => {
    const body = route.request().postDataJSON() || {};
    state.sessions.filter((s) => s.class_key === body.p_class_key).forEach((s) => (s.capacity = body.p_capacity));
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });

  await page.route('**/rest/v1/rpc/admin_pilates_month_summary*', (route) => {
    const body = route.request().postDataJSON() || {};
    const pilatesBooked = state.bookings.filter((b) => {
      const s = state.sessions.find((sess) => sess.id === b.session_id);
      if (!s || !s.is_guest_class || b.status !== 'booked') return false;
      const [y, m] = s.session_date.split('-').map((n) => parseInt(n, 10));
      return y === body.p_year && m === body.p_month;
    });
    const grossCents = pilatesBooked.reduce((sum, b) => sum + (state.sessions.find((s) => s.id === b.session_id)?.price_cents ?? 0), 0);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ bookings_count: pilatesBooked.length, gross_revenue_cents: grossCents }]) });
  });

  // ClassBookingContext's own direct table reads (not RPCs) -- the
  // signed-in user's own active bookings, plus the two
  // HEAD/count-only existence checks (hasEverBooked / hasBookedDropInBefore).
  // Registered for GET and HEAD alike -- supabase-js sends HEAD for a
  // `.select(..., { count: 'exact', head: true })` call and reads the
  // count back from the `content-range: */<n>` response header, not a body.
  await page.route('**/rest/v1/class_bookings*', (route) => {
    if (route.request().method() === 'HEAD') {
      const everCount = state.bookings.filter((b) => b.user_id === userId).length;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `*/${everCount}` }, body: '' });
    }
    const mine = state.bookings
      .filter((b) => b.user_id === userId && b.status === 'booked')
      .map((b) => ({ id: b.id, session_id: b.session_id, payment_method: b.payment_method }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mine) });
  });

  await page.route('**/rest/v1/in_person_purchases*', (route) => {
    if (route.request().method() === 'HEAD') {
      const url = new URL(route.request().url());
      const count = url.searchParams.get('plan') === 'eq.drop_in' ? (state.dropInPurchasesCount ?? 0) : 0;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': `*/${count}` }, body: '' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  // ClassPackContext's own direct read -- mutated by cancel_class_booking's
  // refund above, and by whatever a given check seeds in
  // `state.packCreditsRemaining` up front. A single not-yet-expired row
  // with that many credits is sufficient to drive useMembership().
  // hasActivePack/tenPackClassesRemaining through the real MembershipContext
  // logic, not a stand-in.
  await page.route('**/rest/v1/class_packs*', (route) => {
    if (state.packCreditsRemaining === undefined) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ credits_remaining: state.packCreditsRemaining, expires_at: new Date(Date.now() + 20 * 86400000).toISOString() }]),
    });
  });
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
  for (const tabLabel of ['YOUR WORKOUTS', "DOC'S COWS", 'THE DECK']) {
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
    //
    // Round 29: "LOOK UP A MOVEMENT" only exists on a real weekday WOD
    // card -- DocsWodsScreen's own Saturday (Steady State) and Sunday
    // (Sunday Setup) branches never render it at all. This block used to
    // rely on DocsWodsScreen's own defaultIndex landing on "today" (true
    // for this fully-unlocked account, isDayWodUnlocked always true), which
    // silently broke every time this suite happened to run on a real
    // Saturday or Sunday -- today's own wall-clock date, not an app
    // regression (confirmed directly: Sunday Setup correctly has no
    // movement to look up, since nothing was logged). Explicitly selecting
    // Monday first makes this check's own precondition date-independent
    // instead of leaving it to chance. DocsWodsScreen's own DateStrip is
    // fed by getCurrentWeek() (content.ts), a FIXED Monday-indexed week of
    // today -- index 0 is always Monday, 1 Tuesday, ... 6 Sunday, regardless
    // of what today's own weekday is (never a rolling "N days from today"
    // strip, unlike the booking calendar elsewhere in this file). An
    // earlier draft of this fix used offsetToWeekday(1) here, which only
    // coincidentally lands on index 0 when the suite happens to run ON a
    // real Monday -- any other day it indexes into the wrong weekday
    // entirely (even a weekend index 5/6 with no lookup-movement button at
    // all), silently reintroducing the exact date-dependent flakiness this
    // fix exists to remove. A plain literal 0 is the only correct index.
    await page
      .getByRole('tab', { name: /YOUR WORKOUTS/i })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(400);
    // DateStrip's own `date-strip-cell-${index}` testID isn't scoped per
    // screen -- Community's own date strip is still mounted (react-
    // navigation keeps a visited tab's screen alive, aria-hidden rather
    // than unmounted), so a plain getByTestId here resolves to TWO
    // elements once both tabs have been visited: a strict-mode violation
    // that silently swallows this click via the existing .catch(() => {}),
    // never actually landing on Monday at all. Mark the one NOT inside an
    // aria-hidden ancestor (the real, currently-active tab's own cell) and
    // click that specific node instead of trusting DOM order.
    await page.evaluate((idx) => {
      const nodes = Array.from(document.querySelectorAll(`[data-testid="date-strip-cell-${idx}"]`));
      const target = nodes.find((el) => !el.closest('[aria-hidden="true"]'));
      if (target) target.setAttribute('data-r29-active-cell', 'true');
    }, 0);
    await page.locator('[data-r29-active-cell="true"]').click({ timeout: 5000 }).catch(() => {});
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
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tour-full-access-stop-4-four-rooms.png') }).catch(() => {});
    record(
      '[tab-bar-integrity/tour-stop-4] three NEXT taps from a fresh start land on "THE FOUR ROOMS" (tab-bar stop)',
      tourCardText.includes('THE FOUR ROOMS'),
      JSON.stringify({ tourCardText })
    );
    // Round 32: the room names listed in this stop's own body copy must
    // name the real, current tab labels -- never a tab name that no
    // longer exists.
    record(
      '[tab-rename/tour-four-rooms] stop 4\'s body names the real current tab labels, not the old "Doc\'s WODs"/"Workout of the Day"/"Challenge of the Week" ones',
      tourCardText.includes('Your Workouts') &&
        tourCardText.includes("Doc's COWS + Live Leaderboard") &&
        !tourCardText.includes("Doc's WODs,") &&
        !tourCardText.includes('Workout of the Day') &&
        !tourCardText.includes('The Challenge of the Week'),
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

  // ---------------------------------------------------------------------
  // Round 28: the real root-cause fix for "photos don't render in the
  // feed" / old posts showing blank gray blocks. Two independent bugs,
  // both fixed: (1) CommunityContext.tsx's addTextPost/addWodResultPost/
  // updateTextPost wrote a locally-picked attachment's `uri` straight into
  // `media_url` with no upload step -- on web that's a page-local blob:
  // URL, valid only inside the browser document that created it (a known,
  // documented gap since Round 18). uploadCommunityMedia there now
  // uploads it to the real community-media Storage bucket
  // (migration_026.sql) first. (2) CommunityScreen.tsx's `PostCard` never
  // rendered ANY media for a `kind: 'wod'` post at all -- a structural gap
  // in the feed's own JSX, independent of URL validity, which is exactly
  // why a workout logged with a photo never showed it even though the
  // SAME bug didn't (as visibly) affect a plain text post with a shorter-
  // lived single-session blob: URL.
  //
  // This proves the fix end to end from BOTH entry points (CreatePostModal,
  // LogResultsModal), through to a REAL loaded <img> with nonzero natural
  // size -- not just a correctly-sized box with a dead src, which a
  // bounding-rect-only check (like [photo-preview/feed] above) can't tell
  // apart from a broken image -- and, the actual proof of durability a
  // same-session blob: URL could never pass, viewed by a SECOND,
  // independently-authenticated account. `insertedPosts` and the storage
  // mocks are shared across every context below, the same two-actor
  // pattern Round 24's booking race checks already established
  // (registerClassBookingMocks/SECOND_BOOKER_ID -- reused here as a plain
  // "a different signed-in account" id, not for anything booking-specific).
  {
    const insertedPosts = [];
    // The upload POST itself (**/storage/v1/object/community-media/**) is
    // already mocked globally in setupMocks() -- every check that posts
    // with media needs that, not just this block. This additionally mocks
    // the GET for the PUBLIC url supabase-js's own getPublicUrl()
    // constructs (`.../object/public/community-media/...`), serving back
    // the real fixture bytes, so the browser's own <img> genuinely decodes
    // them into a real, nonzero naturalWidth/naturalHeight.
    const registerCommunityPostMocks = async (page, userId) => {
      await setupMocks(page, userId);
      await page.route('**/storage/v1/object/public/community-media/**', (route) =>
        route.fulfill({ status: 200, contentType: 'image/png', body: ASPECT_RATIO_FIXTURE_PNG })
      );
      await page.route('**/rest/v1/community_posts*', async (route) => {
        const req = route.request();
        if (req.method() === 'POST') {
          let payload = {};
          try {
            payload = JSON.parse(req.postData() || '{}');
          } catch {}
          insertedPosts.push(payload);
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: `r28-post-${insertedPosts.length}`, ...payload }]) });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            [...insertedPosts].reverse().map((p, i) => ({
              id: `r28-post-${insertedPosts.length - i}`,
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
              author_id: p.author_id ?? userId,
              profiles: { display_name: p.author_id === USER_ID ? 'Test Member' : 'Second Member' },
              community_comments: [],
              community_reactions: [],
            }))
          ),
        });
      });
    };

    const realLoadedImageRects = (page) =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('img'))
          .filter((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)
          .map((img) => ({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }))
      );

    // --- Entry point 1: CreatePostModal (a plain text post with a photo). ---
    {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await registerCommunityPostMocks(page, USER_ID);
      await seedSignedInSession(page, USER_ID);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);

      await page.getByText('LOG IT. POST IT.', { exact: false }).first().click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
      await page.getByTestId('media-add').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }),
        page.getByText('Photo Library', { exact: false }).click({ timeout: 5000 }),
      ]);
      await fileChooser.setFiles({ name: 'r28-fixture.png', mimeType: 'image/png', buffer: ASPECT_RATIO_FIXTURE_PNG });
      await page.waitForTimeout(500);

      await page.locator('#compose-post-title-input').fill('Beta Test 28');
      await page.locator('#compose-post-body-input').fill('Round 28 photo upload round trip.');
      await page.getByTestId('compose-submit').click({ timeout: 5000 }).catch(() => {});
      // useActionCompletion()'s own 900ms POSTED acknowledgment, plus the
      // real (mocked) upload + insert + refetch it now genuinely awaits.
      await page.waitForTimeout(1500);

      const uploadedPost = insertedPosts.find((p) => p.title === 'Beta Test 28');
      record(
        "[post-photo/create-post] the post's media_url is a real Storage public URL, never the page-local blob: URL",
        !!uploadedPost &&
          typeof uploadedPost.media_url === 'string' &&
          uploadedPost.media_url.includes('/storage/v1/object/public/community-media/') &&
          !uploadedPost.media_url.startsWith('blob:'),
        JSON.stringify({ uploadedPost })
      );

      await page.waitForTimeout(600); // the browser's own real <img> fetch + decode of the mocked bytes
      const ownAccountRects = await realLoadedImageRects(page);
      record(
        '[post-photo/create-post] the posting account itself sees a real, loaded <img> with nonzero natural size in the feed',
        ownAccountRects.some((r) => r.naturalWidth === 300 && r.naturalHeight === 200),
        JSON.stringify({ ownAccountRects })
      );
      if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'post-photo-create-post-feed.png') }).catch(() => {});
      await context.close();
    }

    // --- The real proof of durability: a SECOND, independently-
    // authenticated account loads the same feed and sees the SAME photo,
    // genuinely decoded -- a page-local blob: URL could never survive
    // this, which is exactly the real-device bug report ("old posts show
    // blank gray blocks"). ---
    {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await registerCommunityPostMocks(page, SECOND_BOOKER_ID);
      await seedSignedInSession(page, SECOND_BOOKER_ID);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      const secondAccountRects = await realLoadedImageRects(page);
      const secondAccountFeedText = await page.getByText('Beta Test 28', { exact: false }).first().isVisible().catch(() => false);
      record(
        "[post-photo/second-account] a different signed-in account sees the SAME photo, genuinely loaded -- proof it lives in Storage, not on the posting phone",
        secondAccountFeedText && secondAccountRects.some((r) => r.naturalWidth === 300 && r.naturalHeight === 200),
        JSON.stringify({ secondAccountFeedText, secondAccountRects })
      );
      await context.close();
    }

    // --- Entry point 2: LogResultsModal (a WOD-result post with a photo)
    // -- this is also where CommunityScreen.tsx's own feed-rendering gap
    // lived: the wodBlock branch never rendered ANY media at all before
    // this round, regardless of URL validity. ---
    {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await registerCommunityPostMocks(page, USER_ID);
      await seedSignedInSession(page, USER_ID);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);

      const mondayOffset = offsetToWeekday(1);
      await page.getByTestId(`date-strip-cell-${mondayOffset}`).click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
      await page.getByTestId('wod-bar-toggle').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.getByTestId('day-panel-log').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.locator('#log-results-rounds-input').fill('5');
      await page.locator('#log-results-kettlebell-input').fill('16');
      await page.getByTestId('media-add').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
      const [fileChooser2] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }),
        page.getByText('Photo Library', { exact: false }).click({ timeout: 5000 }),
      ]);
      await fileChooser2.setFiles({ name: 'r28-wod-fixture.png', mimeType: 'image/png', buffer: ASPECT_RATIO_FIXTURE_PNG });
      await page.waitForTimeout(500);

      await page.getByTestId('post-to-community').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.getByText('Post', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);

      const wodPost = insertedPosts.find((p) => p.kind === 'wod' && p.media_url);
      record(
        "[post-photo/log-results] a logged WOD result's media_url is a real Storage public URL, never blob:",
        !!wodPost &&
          typeof wodPost.media_url === 'string' &&
          wodPost.media_url.includes('/storage/v1/object/public/community-media/') &&
          !wodPost.media_url.startsWith('blob:'),
        JSON.stringify({ wodPost })
      );

      await page.waitForTimeout(600);
      const wodOwnRects = await realLoadedImageRects(page);
      record(
        '[post-photo/log-results] the WOD-result post itself shows a real, loaded photo in the feed -- CommunityScreen.tsx had no thumbnail at all for this post kind before this round',
        wodOwnRects.some((r) => r.naturalWidth === 300 && r.naturalHeight === 200),
        JSON.stringify({ wodOwnRects })
      );
      if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'post-photo-log-results-feed.png') }).catch(() => {});
      await context.close();
    }

    // --- Second account, again, now for the WOD-result post specifically. ---
    {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await registerCommunityPostMocks(page, SECOND_BOOKER_ID);
      await seedSignedInSession(page, SECOND_BOOKER_ID);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      const secondAccountWodRects = await realLoadedImageRects(page);
      record(
        "[post-photo/second-account] a different signed-in account also sees the WOD-result post's photo, genuinely loaded",
        secondAccountWodRects.some((r) => r.naturalWidth === 300 && r.naturalHeight === 200),
        JSON.stringify({ secondAccountWodRects })
      );
      await context.close();
    }
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
    //
    // Round 32 follow-up: a "Date.now() - 86400000" (24h-ago) releaseAt was
    // found genuinely flaky here, root-caused directly, not assumed -- it's
    // unrelated to any tab-rename change. useCurrentChallenge()'s own
    // asOf is cycle.closeAt (Saturday 12pm ET) whenever the current cycle
    // is CLOSED (Saturday 12pm ET through the following Sunday 6pm ET,
    // challengeSchedule.ts), and that gap between closeAt and "now" can be
    // up to ~30 hours (right before the Sunday 6pm reopen). A seed dated
    // exactly 24h in the past can land AFTER closeAt in that window,
    // making useCurrentChallenge() find no live entry at all -- exactly
    // what happened here, confirmed by reading the real cycle math rather
    // than guessing. 2 days (48h) comfortably clears that 30-hour max gap
    // regardless of what day or time the suite runs.
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
              releaseAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
              status: 'published',
              scheduled: true,
              createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
              updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
            },
          ])
        );
        window.localStorage.setItem('contentLibraryDrafts.v1.seedVersion', '1');
      } catch {}
    });
    await seedSignedInSession(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const tabButton = page.getByRole('tab', { name: /DOC'?S COWS/i }).first();
    await tabButton.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    // Round 32: the small green badge above the challenge title now spells
    // out what COW stands for, rather than the old redundant "THIS WEEK'S
    // CHALLENGE OF THE WEEK".
    const cowBadgeVisible = await page.getByText('COW = CHALLENGE OF THE WEEK', { exact: true }).first().isVisible().catch(() => false);
    record(
      '[tab-rename/cow-badge] the COWS screen badge reads exactly "COW = CHALLENGE OF THE WEEK"',
      cowBadgeVisible,
      JSON.stringify({ cowBadgeVisible })
    );
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'cows-screen-badge.png') }).catch(() => {});
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

  // ---------------------------------------------------------------------
  // Round 24: real class booking backend (migration_023). See the
  // registerClassBookingMocks block above this function for what the
  // mock server actually does and does not prove -- the atomicity
  // guarantee itself was proven directly against real Postgres, not here.
  const MONDAY_OFFSET = offsetToWeekday(1);
  const IN_PERSON_UNLIMITED_SUBSCRIPTION = [
    { user_id: USER_ID, plan: 'in_person_monthly', status: 'active', current_period_end: new Date(Date.now() + 20 * 86400000).toISOString(), trial_end: null, cancel_at_period_end: false, stripe_customer_id: 'cus_test' },
  ];

  // [booking/capacity] + [booking/double-book-last-spot]: one shared
  // scenario, one shared in-memory `bookingState`, two independently-
  // authenticated browser contexts (two real "members," not one user
  // tapping twice) -- this is what makes "two different members racing
  // for the last spot" a genuine two-actor check rather than a
  // single-user double-click. Round 25: the waitlist offer this scenario
  // used to end with is gone -- Member B's refused tap is simply the end
  // of the flow now, same as every other full class.
  {
    const bookingState = createClassBookingState([
      makeSessionFixture({ id: 'sess-cap', classKey: 'mwf-530a', className: 'Dawn Patrol', classType: 'Kettlebell Strength', capacity: 2, date: dateAtOffsetDays(MONDAY_OFFSET, 5, 30) }),
    ]);
    seedOtherBookings(bookingState, 'sess-cap', 1, 'unlimited'); // 1 of 2 spots already taken -- one spot left.

    // --- Member A books the last spot. ---
    {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await setupMocks(page, USER_ID);
      await page.route('**/rest/v1/subscriptions*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(IN_PERSON_UNLIMITED_SUBSCRIPTION) }));
      await registerClassBookingMocks(page, bookingState, USER_ID);
      await seedSignedInSession(page, USER_ID);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await page.getByTestId(`date-strip-cell-${MONDAY_OFFSET}`).click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);

      const pillTextBefore = await page.getByTestId('sign-up-mwf-530a').innerText().catch(() => null);
      record('[booking/capacity] a session with 1 of 2 spots taken still shows SIGN UP, not CLASS FULL', pillTextBefore === 'SIGN UP', JSON.stringify({ pillTextBefore }));

      await page.getByTestId('sign-up-mwf-530a').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.getByText('OK', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);

      const nowBooked = await page.getByTestId('cancel-class-mwf-530a').isVisible().catch(() => false);
      record(
        '[booking/capacity] booking the last spot succeeds and the session is now full in shared state',
        nowBooked && bookedCountFor(bookingState, 'sess-cap') === 2,
        JSON.stringify({ nowBooked, bookedCount: bookedCountFor(bookingState, 'sess-cap') })
      );
      await context.close();
    }

    // --- Member B (a different, independently-authenticated account)
    // reaches the SAME now-full session a moment later -- the one spot
    // is already gone, so this must never create a 3rd booking, and
    // there is no waitlist offer to fall back to -- CLASS FULL is simply
    // where this ends. ---
    {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await setupMocks(page, SECOND_BOOKER_ID);
      await page.route('**/rest/v1/subscriptions*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...IN_PERSON_UNLIMITED_SUBSCRIPTION[0], user_id: SECOND_BOOKER_ID }]) }));
      await registerClassBookingMocks(page, bookingState, SECOND_BOOKER_ID);
      await seedSignedInSession(page, SECOND_BOOKER_ID);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await page.getByTestId(`date-strip-cell-${MONDAY_OFFSET}`).click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);

      const pillTextFull = await page.getByTestId('sign-up-mwf-530a').innerText().catch(() => null);
      const ariaDisabled = await page.getByTestId('sign-up-mwf-530a').getAttribute('aria-disabled').catch(() => null);
      record(
        '[booking/capacity] the same session now reads CLASS FULL for a second member, and the pill is genuinely inert',
        pillTextFull === 'CLASS FULL' && ariaDisabled === 'true',
        JSON.stringify({ pillTextFull, ariaDisabled })
      );

      const bookingsBeforeTap = bookingState.bookings.filter((b) => b.session_id === 'sess-cap' && b.status === 'booked').length;
      await page.getByTestId('sign-up-mwf-530a').click({ timeout: 5000, force: true }).catch(() => {});
      await page.waitForTimeout(400);
      const anyAlertVisible = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
      const bookingsAfterTap = bookingState.bookings.filter((b) => b.session_id === 'sess-cap' && b.status === 'booked').length;
      record(
        '[booking/double-book-last-spot] tapping (even forced) the inert CLASS FULL button never creates a 3rd booking and never opens any dialog -- a dead end, not a flow',
        !anyAlertVisible && bookingsBeforeTap === 2 && bookingsAfterTap === 2,
        JSON.stringify({ anyAlertVisible, bookingsBeforeTap, bookingsAfterTap })
      );
      await context.close();
    }
  }

  // [booking/capacity-default]: "change the default class capacity from
  // 30 to 50 (the room's true maximum) for all Doc's classes, existing
  // and future sessions" (migration_024). Read straight off the real
  // admin CapacityRow prefill, which reads a real session's own
  // `capacity` field (see CapacityRow in AdminRosterScreen.tsx) -- no
  // registerClassBookingMocks override at all, so this is exactly the
  // same generic session data (see defaultClassSessionsFixture) every
  // other, non-booking-specific check in this file already assumes.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await page.route('**/rest/v1/profiles*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { display_name: 'Test Admin', instagram_handle: '', favorite_quote: '', avatar_url: null, how_train: 'boathouse', is_admin: true, show_tomorrows_workout: true, tour_completed_at: new Date(Date.now() - 30 * 86400000).toISOString(), group_chat_muted: false },
        ]),
      })
    );
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId('open-sidebar').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText('CLASS ROSTER', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);

    const capacities = {};
    for (const classKey of ['mwf-530a', 'mwf-930a', 'tth-930a', 'sat-815a']) {
      capacities[classKey] = await page.getByTestId(`class-capacity-input-${classKey}`).inputValue().catch(() => null);
    }
    record(
      "[booking/capacity-default] every real, freshly-generated Doc's class session defaults to capacity 50 (migration_024), not the old 30 -- Downbeach Pilates excluded, it stays uncapped",
      Object.values(capacities).every((v) => v === '50'),
      JSON.stringify(capacities)
    );
    await context.close();
  }

  // [booking/inert-full/*]: the real-device bug this whole round exists
  // for -- "tapping CLASS FULL still launched the first class free
  // question, then the $25 drop in popup, then real Stripe checkout."
  // "CLASS FULL is a dead end, not a flow... for every tier." Three
  // separate tiers, each of which would otherwise reach a DIFFERENT
  // gate (instant book, a pack credit, or the first-class-free
  // question/$25 drop-in) -- proving isFull()'s own guard inside
  // handleSignUp, not just one tier's own gating, is what makes the
  // button inert. aria-disabled is the reliable signal a React Native
  // Web Pressable's `disabled` prop actually produces (confirmed by
  // reading react-native-web's own Pressable source) -- a forced click
  // on top of that is defense-in-depth, not the primary assertion.
  {
    const bookingState = createClassBookingState([
      makeSessionFixture({ id: 'sess-full-member', classKey: 'mwf-530a', className: 'Dawn Patrol', classType: 'Kettlebell Strength', capacity: 1, date: dateAtOffsetDays(MONDAY_OFFSET, 5, 30) }),
    ]);
    seedOtherBookings(bookingState, 'sess-full-member', 1, 'unlimited');

    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await page.route('**/rest/v1/subscriptions*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(IN_PERSON_UNLIMITED_SUBSCRIPTION) }));
    await registerClassBookingMocks(page, bookingState, USER_ID);
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId(`date-strip-cell-${MONDAY_OFFSET}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    const pill = page.getByTestId('sign-up-mwf-530a');
    const pillText = await pill.innerText().catch(() => null);
    const ariaDisabled = await pill.getAttribute('aria-disabled').catch(() => null);
    const bookingsBefore = bookingState.bookings.length;
    await pill.click({ timeout: 5000, force: true }).catch(() => {});
    await page.waitForTimeout(400);
    const anyAlertAfterTap = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    const bookingsAfter = bookingState.bookings.length;
    record(
      '[booking/inert-full/member] a full class renders a genuinely inert CLASS FULL button for an instant-book member -- no alert, no flow, no new booking',
      pillText === 'CLASS FULL' && ariaDisabled === 'true' && !anyAlertAfterTap && bookingsAfter === bookingsBefore,
      JSON.stringify({ pillText, ariaDisabled, anyAlertAfterTap, bookingsBefore, bookingsAfter })
    );
    await context.close();
  }
  {
    const bookingState = createClassBookingState([
      makeSessionFixture({ id: 'sess-full-pack', classKey: 'mwf-530a', className: 'Dawn Patrol', classType: 'Kettlebell Strength', capacity: 1, date: dateAtOffsetDays(MONDAY_OFFSET, 5, 30) }),
    ]);
    seedOtherBookings(bookingState, 'sess-full-pack', 1, 'unlimited');
    bookingState.packCreditsRemaining = 5;

    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await registerClassBookingMocks(page, bookingState, USER_ID);
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId(`date-strip-cell-${MONDAY_OFFSET}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    const pill = page.getByTestId('sign-up-mwf-530a');
    const pillText = await pill.innerText().catch(() => null);
    const ariaDisabled = await pill.getAttribute('aria-disabled').catch(() => null);
    const creditsBefore = bookingState.packCreditsRemaining;
    await pill.click({ timeout: 5000, force: true }).catch(() => {});
    await page.waitForTimeout(400);
    const anyAlertAfterTap = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    record(
      '[booking/inert-full/pack-holder] a full class renders a genuinely inert CLASS FULL button for a 10 Class Pack holder -- no alert, no flow, no credit spent',
      pillText === 'CLASS FULL' && ariaDisabled === 'true' && !anyAlertAfterTap && bookingState.packCreditsRemaining === creditsBefore,
      JSON.stringify({ pillText, ariaDisabled, anyAlertAfterTap, creditsBefore, creditsAfter: bookingState.packCreditsRemaining })
    );
    await context.close();
  }
  {
    const bookingState = createClassBookingState([
      makeSessionFixture({ id: 'sess-full-guest', classKey: 'mwf-530a', className: 'Dawn Patrol', classType: 'Kettlebell Strength', capacity: 1, date: dateAtOffsetDays(MONDAY_OFFSET, 5, 30) }),
    ]);
    seedOtherBookings(bookingState, 'sess-full-guest', 1, 'unlimited');

    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await registerClassBookingMocks(page, bookingState, USER_ID);
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId(`date-strip-cell-${MONDAY_OFFSET}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    const pill = page.getByTestId('sign-up-mwf-530a');
    const pillText = await pill.innerText().catch(() => null);
    const ariaDisabled = await pill.getAttribute('aria-disabled').catch(() => null);
    const bookingsBefore = bookingState.bookings.length;
    await pill.click({ timeout: 5000, force: true }).catch(() => {});
    await page.waitForTimeout(400);
    // The real bug this directly regression-guards: tapping CLASS FULL
    // used to still open the first-class-free question for this exact
    // tier.
    const questionVisible = await page.getByText("Have You Trained at Doc's Fitness Before", { exact: false }).first().isVisible().catch(() => false);
    const anyAlertAfterTap = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    const bookingsAfter = bookingState.bookings.length;
    record(
      '[booking/inert-full/guest] a full class renders a genuinely inert CLASS FULL button for a guest -- never opens the first-class-free question, no flow, no new booking',
      pillText === 'CLASS FULL' && ariaDisabled === 'true' && !questionVisible && !anyAlertAfterTap && bookingsAfter === bookingsBefore,
      JSON.stringify({ pillText, ariaDisabled, questionVisible, anyAlertAfterTap, bookingsBefore, bookingsAfter })
    );
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'class-full-inert.png') }).catch(() => {});
    await context.close();
  }

  // [booking/create-checkout-full]: "create-checkout must verify space
  // BEFORE creating a Stripe Checkout Session for drop in or Pilates and
  // refuse clearly if full, so a stale client can never pay for a full
  // class." The Edge Function runs in Deno, outside this Playwright
  // harness's reach (same category of gap as every other "can't drive
  // the real server runtime from here" case already documented in this
  // file) -- same static-source-grep technique as the Founding 50
  // enabled-switch check above, confirming the function queries the real
  // session capacity and real booked count, and refuses with a 400
  // strictly BEFORE ever calling stripe.checkout.sessions.create.
  {
    const edgeFnSrc = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'create-checkout', 'index.ts'), 'utf8');
    const selectsCapacity = /class_sessions['"]\)[\s\S]{0,40}\.select\(['"]capacity['"]\)/.test(edgeFnSrc);
    const countsBookings = /class_bookings['"]\)[\s\S]{0,200}status['"],\s*'booked'/.test(edgeFnSrc);
    const refusesWhenFull = /bookedCount\s*\?\?\s*0\)\s*>=\s*sessionRow\.capacity\)[\s\S]{0,120}That class is full/.test(edgeFnSrc);
    const checkBeforeCreate =
      edgeFnSrc.indexOf('That class is full.') > 0 && edgeFnSrc.indexOf('That class is full.') < edgeFnSrc.indexOf('stripe.checkout.sessions.create');
    record(
      '[booking/create-checkout-full] create-checkout re-checks real capacity/booked-count and refuses a full class BEFORE ever creating a Stripe Checkout Session',
      selectsCapacity && countsBookings && refusesWhenFull && checkBeforeCreate,
      JSON.stringify({ selectsCapacity, countsBookings, refusesWhenFull, checkBeforeCreate })
    );
  }

  // [popup-escape/*]: "every informational or choice popup must be
  // dismissible without choosing, via an X in the top right AND tapping
  // the dimmed background... starting with the first class free
  // question, currently a trap with no exit for someone browsing" --
  // plus the new button copy that's supposed to sell the free class.
  // Dismissing must never book, charge, or save anything.
  {
    const bookingState = createClassBookingState([
      makeSessionFixture({ id: 'sess-popup', classKey: 'mwf-530a', className: 'Dawn Patrol', classType: 'Kettlebell Strength', capacity: 50, date: dateAtOffsetDays(MONDAY_OFFSET, 5, 30) }),
    ]);
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID); // default tier, no pack -- reaches the first-class-free question.
    await registerClassBookingMocks(page, bookingState, USER_ID);
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId(`date-strip-cell-${MONDAY_OFFSET}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByTestId('sign-up-mwf-530a').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);

    const titleVisible = await page.getByText("Have You Trained at Doc's Fitness Before?", { exact: false }).first().isVisible().catch(() => false);
    const newCopyVisible = await page.getByText('FIRST TIME HERE · FIRST CLASS FREE', { exact: false }).first().isVisible().catch(() => false);
    const beenBeforeVisible = await page.getByText("I'VE BEEN BEFORE", { exact: false }).first().isVisible().catch(() => false);
    const closeButtonVisible = await page.getByTestId('alert-close').isVisible().catch(() => false);
    record(
      "[popup-escape/button-copy] the question title stays word for word, the FIRST TIME HERE button now sells the free class, and the X is present",
      titleVisible && newCopyVisible && beenBeforeVisible && closeButtonVisible,
      JSON.stringify({ titleVisible, newCopyVisible, beenBeforeVisible, closeButtonVisible })
    );
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'first-class-free-question.png') }).catch(() => {});

    await page.getByTestId('alert-close').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const dismissedViaX = !(await page.getByTestId('alert-backdrop').isVisible().catch(() => false));
    const noBookingAfterX = bookingState.bookings.length === 0;
    record(
      '[popup-escape/x] the X dismisses the first-class-free question with no booking, charge, or save of any kind',
      dismissedViaX && noBookingAfterX,
      JSON.stringify({ dismissedViaX, noBookingAfterX })
    );

    await page.getByTestId('sign-up-mwf-530a').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    // A point in the top-left corner of the full-screen backdrop,
    // deliberately outside the centered sheet's own bounds -- proves the
    // DIMMED BACKGROUND itself dismisses, not just the X.
    await page.getByTestId('alert-backdrop').click({ position: { x: 5, y: 5 }, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const dismissedViaBackdrop = !(await page.getByTestId('alert-backdrop').isVisible().catch(() => false));
    const noBookingAfterBackdrop = bookingState.bookings.length === 0;
    record(
      '[popup-escape/backdrop] tapping the dimmed background dismisses the first-class-free question with no booking, charge, or save of any kind',
      dismissedViaBackdrop && noBookingAfterBackdrop,
      JSON.stringify({ dismissedViaBackdrop, noBookingAfterBackdrop })
    );
    await context.close();
  }

  // [booking/checkout-cancel-return]: "Stripe's cancel return lands the
  // member back on the schedule instantly, nothing booked or charged, no
  // leftover loading state." A fresh page load with the exact query
  // string create-checkout's own cancel_url now sends for a class
  // booking (?checkout=cancel&plan=drop_in) is the normal, working
  // path -- see checkoutRedirect.ts's own isBookingPlan branch. The
  // bfcache-restore failure mode itself is covered by the backstop check
  // below, not this one.
  {
    const bookingState = createClassBookingState([
      makeSessionFixture({ id: 'sess-cancel-return', classKey: 'mwf-530a', className: 'Dawn Patrol', classType: 'Kettlebell Strength', capacity: 50, date: dateAtOffsetDays(MONDAY_OFFSET, 5, 30) }),
    ]);
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await registerClassBookingMocks(page, bookingState, USER_ID);
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/?checkout=cancel&plan=drop_in`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const loadingVisible = await page.getByTestId('checkout-redirect-loading').isVisible().catch(() => false);
    const scheduleVisible = await page.getByTestId('date-strip-cell-0').isVisible().catch(() => false);
    const urlStripped = !page.url().includes('checkout=cancel');
    record(
      '[booking/checkout-cancel-return] a cancelled class-booking checkout return lands on the schedule instantly, with no loading screen and nothing booked',
      !loadingVisible && scheduleVisible && urlStripped && bookingState.bookings.length === 0,
      JSON.stringify({ loadingVisible, scheduleVisible, urlStripped, bookingsCount: bookingState.bookings.length })
    );
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'schedule-after-cancelled-checkout.png') }).catch(() => {});
    await context.close();
  }

  // [booking/checkout-loading] + [booking/checkout-loading-backstop]: the
  // other half of the same real-device bug -- "tapping the X on the
  // Stripe checkout page left the app stuck forever on the TAKING YOU TO
  // CHECKOUT loading screen." create-checkout is mocked to simply never
  // respond -- the request just hangs, standing in for "stuck
  // mid-redirect," the real condition this screen's own ~10s backstop
  // exists for. Proves both halves end to end: the loading screen itself
  // appears the instant PAY is tapped, and its own BACK TO THE APP button
  // genuinely clears the gate and returns to the schedule.
  {
    const bookingState = createClassBookingState([
      makeSessionFixture({ id: 'sess-backstop', classKey: 'mwf-530a', className: 'Dawn Patrol', classType: 'Kettlebell Strength', capacity: 50, date: dateAtOffsetDays(MONDAY_OFFSET, 5, 30) }),
    ]);
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await registerClassBookingMocks(page, bookingState, USER_ID);
    await page.route('**/functions/v1/create-checkout*', () => {}); // never resolves.
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId(`date-strip-cell-${MONDAY_OFFSET}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByTestId('sign-up-mwf-530a').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText("I'VE BEEN BEFORE", { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText('PAY $25 AND BOOK', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);

    const loadingVisible = await page.getByTestId('checkout-redirect-loading').isVisible().catch(() => false);
    const messageVisible = await page.getByText('TAKING YOU TO CHECKOUT', { exact: false }).first().isVisible().catch(() => false);
    record(
      '[booking/checkout-loading] tapping PAY shows the branded TAKING YOU TO CHECKOUT loading screen while the redirect is stuck',
      loadingVisible && messageVisible,
      JSON.stringify({ loadingVisible, messageVisible })
    );

    const backstopAppeared = await page
      .getByTestId('checkout-redirect-back-to-app')
      .waitFor({ state: 'visible', timeout: 12000 })
      .then(() => true)
      .catch(() => false);
    record(
      '[booking/checkout-loading-backstop] the BACK TO THE APP button appears after roughly 10 seconds stuck on the loading screen',
      backstopAppeared,
      JSON.stringify({ backstopAppeared })
    );

    await page.getByTestId('checkout-redirect-back-to-app').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    const loadingGoneAfter = !(await page.getByTestId('checkout-redirect-loading').isVisible().catch(() => false));
    const scheduleVisibleAfter = await page.getByTestId(`date-strip-cell-${MONDAY_OFFSET}`).isVisible().catch(() => false);
    record(
      '[booking/checkout-loading-backstop] tapping BACK TO THE APP clears the stuck loading screen and returns to the schedule, with nothing booked',
      loadingGoneAfter && scheduleVisibleAfter && bookingState.bookings.length === 0,
      JSON.stringify({ loadingGoneAfter, scheduleVisibleAfter, bookingsCount: bookingState.bookings.length })
    );
    await context.close();
  }

  // [booking/cancel-refund]: a 10 Class Pack booking spends a credit, and
  // cancelling it refunds that exact credit -- both ends verified through
  // the real UI number ("X OF 10 CLASSES LEFT"), not just the mock's own
  // internal bookkeeping.
  {
    const bookingState = createClassBookingState([
      makeSessionFixture({ id: 'sess-pack', classKey: 'mwf-530a', className: 'Dawn Patrol', classType: 'Kettlebell Strength', capacity: 10, date: dateAtOffsetDays(MONDAY_OFFSET, 5, 30) }),
    ]);
    bookingState.packCreditsRemaining = 5;

    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await registerClassBookingMocks(page, bookingState, USER_ID);
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId(`date-strip-cell-${MONDAY_OFFSET}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    const classesLeftBefore = await page.getByTestId('pack-classes-left').innerText().catch(() => null);
    await page.getByTestId('sign-up-mwf-530a').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText('OK', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    const classesLeftAfterBooking = await page.getByTestId('pack-classes-left').innerText().catch(() => null);
    record(
      '[booking/cancel-refund] booking with a 10 Class Pack spends exactly one credit, reflected live in "X OF 10 CLASSES LEFT"',
      (classesLeftBefore ?? '').includes('5') && (classesLeftAfterBooking ?? '').includes('4') && bookingState.packCreditsRemaining === 4,
      JSON.stringify({ classesLeftBefore, classesLeftAfterBooking, packCreditsRemaining: bookingState.packCreditsRemaining })
    );

    await page.getByTestId('cancel-class-mwf-530a').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText('Cancel Class', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    const classesLeftAfterCancel = await page.getByTestId('pack-classes-left').innerText().catch(() => null);
    const signUpVisibleAgain = await page.getByTestId('sign-up-mwf-530a').isVisible().catch(() => false);
    record(
      '[booking/cancel-refund] cancelling a pack-credit booking refunds the exact credit, reflected live again',
      (classesLeftAfterCancel ?? '').includes('5') && signUpVisibleAgain && bookingState.packCreditsRemaining === 5,
      JSON.stringify({ classesLeftAfterCancel, signUpVisibleAgain, packCreditsRemaining: bookingState.packCreditsRemaining })
    );
    await context.close();
  }

  // [booking/cancel-refund-stripe]: "drop in and Pilates payments auto
  // refunded through Stripe server side" -- cancelling a drop_in_paid
  // booking must call the real refund-booking Edge Function with exactly
  // this booking's own id, the moment cancel_class_booking reports
  // needs_stripe_refund. The booking itself is seeded directly as already
  // drop_in_paid (the same "can't drive the real Stripe Checkout redirect
  // from here" gap every other paid-gate check in this file already
  // stops short of) -- what's under test is the CLIENT'S OWN reaction to
  // cancel_class_booking's return value, not Checkout itself.
  {
    const bookingState = createClassBookingState([
      makeSessionFixture({ id: 'sess-dropin-refund', classKey: 'mwf-530a', className: 'Dawn Patrol', classType: 'Kettlebell Strength', capacity: 10, date: dateAtOffsetDays(MONDAY_OFFSET, 5, 30) }),
    ]);
    bookingState.bookings.push({ id: 'dropin-booking-1', session_id: 'sess-dropin-refund', user_id: USER_ID, status: 'booked', payment_method: 'drop_in_paid', stripe_checkout_session_id: 'cs_test_dropin1', booked_at: new Date().toISOString() });

    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await registerClassBookingMocks(page, bookingState, USER_ID);
    let refundInvokeBody = null;
    await page.route('**/functions/v1/refund-booking*', async (route) => {
      refundInvokeBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId(`date-strip-cell-${MONDAY_OFFSET}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByTestId('cancel-class-mwf-530a').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText('Cancel Class', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    const signUpVisibleAfter = await page.getByTestId('sign-up-mwf-530a').isVisible().catch(() => false);
    record(
      '[booking/cancel-refund-stripe] cancelling a drop-in-paid booking calls refund-booking with exactly this booking\'s own id',
      signUpVisibleAfter && !!refundInvokeBody && refundInvokeBody.bookingId === 'dropin-booking-1',
      JSON.stringify({ signUpVisibleAfter, refundInvokeBody })
    );
    await context.close();
  }

  // [booking/pilates-uncapped]: "DOWNBEACH PILATES ... has NO cap and
  // deliberately shows no spots count or attendance number anywhere
  // member facing" -- seeded with 40 other bookings (deliberately past
  // what any of this app's other classes cap at) to prove there is
  // genuinely no ceiling, not just an untested high one, and that the
  // count itself never leaks into the member-facing card.
  {
    const bookingState = createClassBookingState([
      makeSessionFixture({
        id: 'sess-pilates-uncapped',
        classKey: 'pilates-wed-830a',
        className: 'Downbeach Pilates with Marina',
        classType: 'Group Mat Pilates',
        capacity: null,
        isGuestClass: true,
        priceCents: 2000,
        stripePriceId: 'price_1UTjj9K8jMUFAOQwhnr7flRh',
        date: dateAtOffsetDays(MONDAY_OFFSET, 8, 30),
      }),
    ]);
    seedOtherBookings(bookingState, 'sess-pilates-uncapped', 40, 'pilates_paid');

    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await registerClassBookingMocks(page, bookingState, USER_ID);
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId(`date-strip-cell-${MONDAY_OFFSET}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    const pilatesRowText = await page.getByTestId('pilates-class-row').innerText().catch(() => '');
    const pilatesPillText = await page.getByTestId('sign-up-pilates').innerText().catch(() => null);
    record(
      '[booking/pilates-uncapped] 40 real bookings on an uncapped class never renders a spots count or the attendance number anywhere in the card',
      !/\b\d+\s*\/\s*\d+\b/.test(pilatesRowText) && !pilatesRowText.includes('40') && pilatesPillText === 'BOOK · $20',
      JSON.stringify({ pilatesRowText, pilatesPillText })
    );

    await page.getByTestId('sign-up-pilates').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    const paidGateVisible = await page.getByText('PAY $20 AND BOOK', { exact: false }).first().isVisible().catch(() => false);
    record(
      '[booking/pilates-uncapped] tapping BOOK always reaches the universal $20 paid gate, even for 40 existing bookings, with no capacity check blocking it',
      paidGateVisible,
      JSON.stringify({ paidGateVisible })
    );
    await page.getByText('Not Now', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await context.close();
  }

  // [booking/pilates-deep-link]: `?book=pilates` (pilatesDeepLink.ts) must
  // open the app directly to the real $20 paid booking flow for Downbeach
  // Pilates, with no tap from the member at all -- "their path is email
  // signup, pay $20, booked."
  {
    const bookingState = createClassBookingState([
      makeSessionFixture({
        id: 'sess-pilates-deeplink',
        classKey: 'pilates-wed-830a',
        className: 'Downbeach Pilates with Marina',
        classType: 'Group Mat Pilates',
        capacity: null,
        isGuestClass: true,
        priceCents: 2000,
        stripePriceId: 'price_1UTjj9K8jMUFAOQwhnr7flRh',
        date: dateAtOffsetDays(MONDAY_OFFSET, 8, 30),
      }),
    ]);

    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await registerClassBookingMocks(page, bookingState, USER_ID);
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/?book=pilates`, { waitUntil: 'networkidle' });
    await page
      .getByText('PAY $20 AND BOOK', { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .catch(() => {});

    const paidGateAutoOpened = await page.getByText('PAY $20 AND BOOK', { exact: false }).first().isVisible().catch(() => false);
    const titleText = await page.getByText('Downbeach Pilates is $20', { exact: false }).first().isVisible().catch(() => false);
    const urlStripped = !page.url().includes('book=pilates');
    record(
      '[booking/pilates-deep-link] ?book=pilates opens the real booking flow for that exact class, with no member tap at all',
      paidGateAutoOpened && titleText && urlStripped,
      JSON.stringify({ paidGateAutoOpened, titleText, urlStripped })
    );
    await context.close();
  }

  // [booking/admin-roster]: admin sees the real roster (names + payment
  // method + first-timer tag), can edit a class's capacity live, and
  // sees real Pilates revenue. Round 25: the waitlist section this block
  // used to check is gone -- see AGENTS.md's own Round 25 section for why.
  {
    // Round 29: this used to date the fixture with dateAtOffsetDays(
    // SATURDAY_OFFSET, 8, 15) -- SATURDAY_OFFSET's own "never today"
    // fallback (`offsetToWeekday(6) || 7`) deliberately jumps a full 7
    // days out whenever the suite happens to run ON a real Saturday, to
    // sidestep "today" ambiguity elsewhere in this file. But
    // AdminRosterScreen's own "upcoming" filter is exactly a 7-day
    // (ROSTER_DAYS_AHEAD_MS) lookahead window -- a fixture placed exactly
    // 7 days out at a fixed 8:15 AM clock time lands right on that
    // boundary, and falls outside it the moment "now" (whatever time of
    // day the suite actually runs) is past 8:15 AM on the day it starts.
    // Confirmed directly: Round 28's own failing run happened on a real
    // Saturday, which is exactly this case -- not an app regression, a
    // test fixture dated right at (and sometimes past) a window edge by
    // construction. This block doesn't actually need a real calendar
    // Saturday at all (the "Savage Saturday" class/display names are just
    // realistic flavor text, never validated against the real day of
    // week) -- a flat 3-days-from-now, preserving the real current
    // time-of-day rather than pinning a fixed clock hour, keeps it
    // comfortably inside the 7-day window with a full 4-day margin no
    // matter what day or time this suite runs.
    const rosterSession = makeSessionFixture({ id: 'sess-admin-roster', classKey: 'sat-815a', className: 'Savage Saturday', classType: 'Hybrid', capacity: 50, date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) });
    const pilatesSession = makeSessionFixture({
      id: 'sess-admin-pilates',
      classKey: 'pilates-wed-830a',
      className: 'Downbeach Pilates with Marina',
      classType: 'Group Mat Pilates',
      capacity: null,
      isGuestClass: true,
      priceCents: 2000,
      stripePriceId: 'price_1UTjj9K8jMUFAOQwhnr7flRh',
      // admin_pilates_month_summary (the mock, same as the real RPC) sums
      // by the session's own calendar month, not by whether it shows up
      // in the roster's unrelated 7-day "upcoming" list -- this session
      // is never read through that list, so today's real date (always
      // "this month," by definition, regardless of day-of-month or
      // weekday) is the simplest fixture that can never drift into an
      // adjacent month the way a multi-day-ahead offset could near a
      // month boundary.
      date: new Date(),
    });
    const bookingState = createClassBookingState([rosterSession, pilatesSession]);
    bookingState.bookings.push(
      { id: 'roster-booking-1', session_id: 'sess-admin-roster', user_id: OTHER_MEMBER_A, status: 'booked', payment_method: 'first_class_free', booked_at: new Date().toISOString() },
      { id: 'roster-booking-2', session_id: 'sess-admin-roster', user_id: OTHER_MEMBER_B, status: 'booked', payment_method: 'unlimited', booked_at: new Date().toISOString() },
      { id: 'roster-booking-pilates-1', session_id: 'sess-admin-pilates', user_id: OTHER_MEMBER_A, status: 'booked', payment_method: 'pilates_paid', booked_at: new Date().toISOString() },
      { id: 'roster-booking-pilates-2', session_id: 'sess-admin-pilates', user_id: OTHER_MEMBER_B, status: 'booked', payment_method: 'pilates_paid', booked_at: new Date().toISOString() }
    );
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await page.route('**/rest/v1/profiles*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { display_name: 'Test Admin', instagram_handle: '', favorite_quote: '', avatar_url: null, how_train: 'boathouse', is_admin: true, show_tomorrows_workout: true, tour_completed_at: new Date(Date.now() - 30 * 86400000).toISOString(), group_chat_muted: false },
        ]),
      })
    );
    await registerClassBookingMocks(page, bookingState, USER_ID);
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId('open-sidebar').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText('CLASS ROSTER', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);

    const bookingsCountText = await page.getByTestId('pilates-bookings-count').innerText().catch(() => null);
    const grossRevenueText = await page.getByTestId('pilates-gross-revenue').innerText().catch(() => null);
    record(
      '[booking/admin-roster] PILATES revenue card shows the real bookings count and gross revenue for the month',
      bookingsCountText === '2' && grossRevenueText === '$40.00',
      JSON.stringify({ bookingsCountText, grossRevenueText })
    );

    await page.getByTestId('roster-class-sess-admin-roster').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    const headcountText = await page.getByTestId('roster-headcount-sess-admin-roster').innerText().catch(() => null);
    const aBadgeVisible = await page.getByTestId(`first-class-tag-${DISPLAY_NAMES[OTHER_MEMBER_A]}`).isVisible().catch(() => false);
    const rosterText = await page.getByTestId('roster-class-sess-admin-roster').innerText().catch(() => '');
    record(
      '[booking/admin-roster] the real roster shows both booked names, the FIRST CLASS tag, and payment methods',
      headcountText === '2/50' && aBadgeVisible && rosterText.includes(DISPLAY_NAMES[OTHER_MEMBER_A]) && rosterText.includes(DISPLAY_NAMES[OTHER_MEMBER_B]) && rosterText.includes('MONTHLY UNLIMITED'),
      JSON.stringify({ headcountText, aBadgeVisible, rosterText })
    );

    const capacityInputBefore = await page.locator('#class-capacity-sat-815a').inputValue().catch(() => null);
    await page.locator('#class-capacity-sat-815a').fill('75');
    await page.getByTestId('class-capacity-save-sat-815a').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    const capacityNowOnSession = rosterSession.capacity;
    record(
      '[booking/admin-roster] editing a class capacity saves and cascades to the generated session',
      capacityInputBefore === '50' && capacityNowOnSession === 75,
      JSON.stringify({ capacityInputBefore, capacityNowOnSession })
    );

    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'admin-roster.png') }).catch(() => {});
    await context.close();
  }

  // ---------------------------------------------------------------------
  // Round 27: tour and access. Item 1 ("LOG IT. POST IT. to every tier")
  // needed no app-code change at all -- community_posts' own insert
  // policy ("members can post as themselves," no tier check) and
  // wod_completions' own policy (user_id = auth.uid(), no tier check)
  // already permit every signed-in tier, verified directly against a
  // real local Postgres instance (see this round's own PR description);
  // ComposerBar is already unconditionally rendered and MembershipContext
  // already computes `communityAccess: 'full'` for every tier. What THIS
  // round actually built is the tier-aware tour (see TourContext.tsx's
  // own FULL_ACCESS_STOPS/LIMITED_ACCESS_STOPS) and its structural
  // "skip a stop with no anchor, never ring the wrong element" fix -- this
  // block verifies both end to end, plus the one thing item 1 really
  // needed a NEW check for: a booking-tier/online-free account actually
  // completing a log-and-post round trip, not just having the composer
  // visible.
  //
  // No subscriptions row + no active class pack is what the real
  // MembershipContext tier derivation lands on 'online_free'
  // (fullContentAccess: false) -- exactly the booking-tier/online-free
  // shape every item in this block needs, and the one lever available
  // here to produce it (there's no devTier knob for a non-admin account).
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await page.route('**/rest/v1/subscriptions*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    // A fresh, tour-not-yet-completed, non-admin profile -- the real
    // entry point (CommunityScreen's own mount effect) fires the tour
    // exactly as it would for a genuine first-time member. No dev-reset
    // control exists for a non-admin account, and none is needed: this
    // IS the real first-load path.
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
            is_admin: false,
            show_tomorrows_workout: true,
            tour_completed_at: null,
            group_chat_muted: false,
          },
        ]),
      })
    );
    // One real, already-existing post so the feed has genuine nonzero
    // content for [post/every-tier]'s own round trip below -- a feed with
    // zero posts ever is a real but separate product state (the brand new
    // install before any member has posted anything) this round's own
    // access change didn't create. Stateful: captures the WOD-result
    // INSERT this block makes further down and serves it back on the next
    // GET, so "lands in the feed" is a genuine round trip, not an
    // assumption.
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
      const seeded = {
        title: 'Welcome to the crew',
        body: 'Glad you are here.',
        category: 'General',
        kind: 'text',
        media_url: null,
        media_type: null,
        workout_title: null,
        workout_notes: null,
        workout_results_line: null,
      };
      const rows = [...insertedPosts, seeded].reverse();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          rows.map((p, i) => ({
            id: `post-${rows.length - i}`,
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

    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const composerVisible = await page.getByTestId('composer-bar').isVisible().catch(() => false);
    record(
      '[post/every-tier] a booking-tier / online-free account sees the LOG IT. POST IT. composer',
      composerVisible,
      JSON.stringify({ composerVisible })
    );

    // The tour's own real entry point just fired on mount -- give it the
    // same document.fonts.ready + first-measurement budget the existing
    // admin tour check already waits out.
    await page.waitForTimeout(1800);

    // The spotlight is deliberately the real anchor's own rect expanded by
    // SPOTLIGHT_PADDING (10px on phone, TourOverlay.tsx) on every side, not
    // a 1:1 copy of it -- this suite's own VIEWPORT is always the phone
    // size, so the expansion is always exactly 10px, never the desktop
    // +2px variant.
    const SPOT_PAD = 10;
    const rectsClose = (spotlight, anchor) =>
      !!spotlight &&
      !!anchor &&
      Math.abs(spotlight.x - (anchor.x - SPOT_PAD)) <= 2 &&
      Math.abs(spotlight.y - (anchor.y - SPOT_PAD)) <= 2 &&
      Math.abs(spotlight.width - (anchor.width + SPOT_PAD * 2)) <= 2 &&
      Math.abs(spotlight.height - (anchor.height + SPOT_PAD * 2)) <= 2;
    const readRect = (selector) =>
      page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
      }, selector);
    const readStop = async () => ({
      cardText: await page.getByTestId('tour-card').innerText().catch(() => ''),
      spotlightRect: await readRect('[data-testid="tour-spotlight"]'),
    });

    const stop1 = await readStop();
    const dateStripRect = await readRect('[data-testid="date-strip-scroll-wrap"]');
    record(
      '[tour/limited-variant] stop 1 (1 OF 3) shows the limited YOUR WEEK LIVES HERE copy and rings the date strip',
      stop1.cardText.includes('1 OF 3') &&
        stop1.cardText.includes('YOUR WEEK LIVES HERE') &&
        stop1.cardText.includes("Tap any date to sign up for class at Doc's Fitness.") &&
        rectsClose(stop1.spotlightRect, dateStripRect),
      JSON.stringify({ stop1, dateStripRect })
    );
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tour-limited-stop-1.png') }).catch(() => {});

    await page.getByTestId('tour-next').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    const stop2 = await readStop();
    const wodsTabRect = await readRect('#wods-tab-tour-marker');
    record(
      "[tour/limited-variant] stop 2 (2 OF 3) shows A TASTE OF DOC'S WODS and rings the DOC'S WODS tab specifically, not the whole bar",
      stop2.cardText.includes('2 OF 3') && stop2.cardText.includes("A TASTE OF DOC'S WODS") && rectsClose(stop2.spotlightRect, wodsTabRect),
      JSON.stringify({ stop2, wodsTabRect })
    );
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tour-limited-stop-2.png') }).catch(() => {});

    // Round 28: stop 3 is now the FINAL stop (the old 4th stop, "THE
    // COMMUNITY", was removed by owner decision -- its spirit folded into
    // this stop's own copy instead). Its own NEXT button must read DONE.
    await page.getByTestId('tour-next').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    const stop3 = await readStop();
    const composerRect = await readRect('[data-testid="composer-bar"]');
    const stop3NextLabel = await page.getByTestId('tour-next').innerText().catch(() => '');
    record(
      '[tour/limited-variant] stop 3 (3 OF 3) shows the folded-in LOG IT. POST IT. copy, its own button reads DONE, and rings the real composer',
      stop3.cardText.includes('3 OF 3') &&
        stop3.cardText.includes('LOG IT. POST IT.') &&
        stop3.cardText.includes("Did one of Doc's workouts? Post it. This crew celebrates every win and shows up for each other.") &&
        stop3NextLabel === 'DONE' &&
        rectsClose(stop3.spotlightRect, composerRect),
      JSON.stringify({ stop3, composerRect, stop3NextLabel })
    );
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tour-limited-stop-3.png') }).catch(() => {});

    await page.getByTestId('tour-next').click({ timeout: 5000 }).catch(() => {}); // DONE
    await page.waitForTimeout(600);
    const tourCardGone = !(await page.getByTestId('tour-card').isVisible().catch(() => true));
    record('[tour/limited-variant] tapping DONE on the final stop finishes the tour', tourCardGone, JSON.stringify({ tourCardGone }));

    // [post/every-tier], end to end: Monday is one of online_free's own 2
    // free weekly WODs (FREE_UNLOCKED_WOD_KEYS, content.ts) -- log it and
    // post it, and confirm it's a genuine round trip into the real feed,
    // not just an assumption that the write happened.
    await page.getByTestId(`date-strip-cell-${offsetToWeekday(1)}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByTestId('wod-bar-toggle').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    const logButtonVisible = await page.getByTestId('day-panel-log').isVisible().catch(() => false);
    record(
      "[post/every-tier] a booking-tier / online-free account can open LOG RESULTS for one of its 2 free weekly WODs (not locked, unlike COWs/Deck)",
      logButtonVisible,
      JSON.stringify({ logButtonVisible })
    );
    await page.getByTestId('day-panel-log').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('#log-results-rounds-input').fill('5');
    await page.locator('#log-results-kettlebell-input').fill('16');
    await page.getByTestId('post-to-community').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText('Post', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
    // useActionCompletion()'s own "POSTED" acknowledgment holds the modal
    // open for 900ms before actually calling onClose() -- wait past that,
    // not up to it, same convention as every other check in this file
    // against the identical pattern.
    await page.waitForTimeout(1300);

    const logModalClosed = !(await page.getByTestId('close-log-results').isVisible().catch(() => false));
    const feedHasWodPost = await page.getByText('RESULTS: 16 · 5 ROUNDS', { exact: false }).first().isVisible().catch(() => false);
    record(
      '[post/every-tier] the logged result actually posts, closes the modal, and lands in the real feed',
      logModalClosed && feedHasWodPost && insertedPosts.some((p) => p.kind === 'wod' && p.author_id === USER_ID),
      JSON.stringify({ logModalClosed, feedHasWodPost, insertedPosts })
    );
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'post-every-tier-feed.png') }).catch(() => {});

    await context.close();
  }

  // [tour/missing-anchor-skip]: the structural fix itself, exercised
  // against a genuinely missing anchor. There is no way to organically
  // force a real anchor missing from a signed-in build -- every anchor in
  // both variants is, by design, always present for every tier after this
  // round's access changes -- so window.__tourTestForceMissing
  // (TourContext.tsx) is the one test-only lever for exactly this, the
  // same "force what the real mechanism would produce" technique this
  // suite already uses throughout (FORCE_INSET_CSS, forceVisualViewportShrink).
  // Seeded via addInitScript, before the app bundle (and TourContext's own
  // module-level pickup of it) ever runs, so what follows drives the
  // real, completely unmodified skip-filtering and measurement code.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__tourTestForceMissing = ['wods-tab'];
    });
    await setupMocks(page, USER_ID);
    await page.route('**/rest/v1/subscriptions*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
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
            is_admin: false,
            show_tomorrows_workout: true,
            tour_completed_at: null,
            group_chat_muted: false,
          },
        ]),
      })
    );
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.waitForTimeout(1800);

    // Round 28: the limited variant's own candidate list shrank to 3 keys
    // (date-strip, wods-tab, composer-bar — see TourContext.tsx). Forcing
    // wods-tab missing here now leaves only 2 real stops, not 3.
    const stop1Text = await page.getByTestId('tour-card').innerText().catch(() => '');
    const dotCount1 = await page.locator('[data-testid="tour-dots"] > *').count().catch(() => -1);
    record(
      '[tour/missing-anchor-skip] with wods-tab forced missing, the run starts at 1 OF 2 -- the candidate list already shrank, never a gap left for the missing stop',
      stop1Text.includes('1 OF 2') && stop1Text.includes('YOUR WEEK LIVES HERE') && dotCount1 === 2,
      JSON.stringify({ stop1Text, dotCount1 })
    );

    await page.getByTestId('tour-next').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    const stop2Text = await page.getByTestId('tour-card').innerText().catch(() => '');
    const stop2NextLabel = await page.getByTestId('tour-next').innerText().catch(() => '');
    record(
      "[tour/missing-anchor-skip] NEXT from stop 1 lands directly on the composer stop (2 OF 2, its own button reads DONE) -- the missing wods-tab stop never rendered at all",
      stop2Text.includes('2 OF 2') &&
        stop2Text.includes('LOG IT. POST IT.') &&
        !stop2Text.includes("A TASTE OF DOC'S WODS") &&
        stop2NextLabel === 'DONE',
      JSON.stringify({ stop2Text, stop2NextLabel })
    );
    // Same SPOTLIGHT_PADDING (10px, phone viewport) expansion as the
    // [tour/limited-variant] block's own rectsClose above -- the spotlight
    // is the real anchor's rect expanded by that padding, never a 1:1 copy.
    const spotlightOnComposer = await page.evaluate(() => {
      const spot = document.querySelector('[data-testid="tour-spotlight"]');
      const composer = document.querySelector('[data-testid="composer-bar"]');
      if (!spot || !composer) return null;
      const a = spot.getBoundingClientRect();
      const b = composer.getBoundingClientRect();
      const pad = 10;
      return {
        close:
          Math.abs(a.x - (b.x - pad)) <= 2 &&
          Math.abs(a.y - (b.y - pad)) <= 2 &&
          Math.abs(a.width - (b.width + pad * 2)) <= 2 &&
          Math.abs(a.height - (b.height + pad * 2)) <= 2,
      };
    });
    record(
      '[tour/missing-anchor-skip] the spotlight itself still rings the real composer -- never a stale rect left over from the skipped stop',
      !!spotlightOnComposer && spotlightOnComposer.close,
      JSON.stringify({ spotlightOnComposer })
    );

    await context.close();
  }

  // ---------------------------------------------------------------------
  // Round 29 fixed Movement Vault's own APPEARS IN dead end (a deck
  // reference blind-jumping to THE DECK tab's paywall; a WOD reference
  // landing on an arbitrary day). Round 30 found that fix had shipped a
  // NEW leak: a limited-access account's deck reference opened the real
  // DeckCardDetailModal with full workout content and a working MARK
  // COMPLETE button -- that account has no Deck access at all. Owner
  // decision, final: APPEARS IN is now shown ONLY to accounts with full
  // workout access (paid online, in person unlimited, active trial,
  // admin) -- see `fullContentAccess &&` in MovementVaultScreen.tsx. This
  // block now covers check (c) from Round 30's own brief: AS A FULL
  // ACCESS ACCOUNT, APPEARS IN still renders and both reference types
  // still open correctly -- the exact Round 29 behavior, unchanged for
  // the tier it was always meant for. The limited-access checks that used
  // to live in this block moved to their own `[deck-gate/*]` blocks below
  // (checks (a) and (b)).
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    // Plain setupMocks (no subscriptions/class_packs override) is a full
    // workout access account -- the same default every earlier round's
    // "fully unlocked account" check already relies on.
    await setupMocks(page, USER_ID);
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'movement-vault-appears-in-before.png') }).catch(() => {});

    await page.getByRole('tab', { name: /YOUR WORKOUTS/i }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    // Index 0 is always Monday: DocsWodsScreen's own DateStrip is fed by
    // getCurrentWeek() (content.ts), a FIXED Monday-indexed week of today
    // (0=Mon..6=Sun), never a rolling "N days from today" strip -- see the
    // matching fix+comment on [tab-bar-integrity/movement-vault] above,
    // which had the identical latent bug. Same aria-hidden-aware
    // disambiguation as that block: DateStrip's own `date-strip-cell-N`
    // testID isn't scoped per screen, and Community's own date strip is
    // still mounted (aria-hidden, not unmounted) the moment this tab has
    // been visited.
    await page.evaluate((idx) => {
      const nodes = Array.from(document.querySelectorAll(`[data-testid="date-strip-cell-${idx}"]`));
      const target = nodes.find((el) => !el.closest('[aria-hidden="true"]'));
      if (target) target.setAttribute('data-r29-active-cell', 'true');
    }, 0);
    await page.locator('[data-r29-active-cell="true"]').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    // THE GAUNTLET's own "Kettlebell Swings" -- matches the "Swings"
    // movement, whose own APPEARS IN list carries both deck card AND WOD
    // references (see movementMatcher.ts).
    await page.getByText('Kettlebell Swings', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);

    const appearsInVisible = await page.getByText('APPEARS IN', { exact: false }).isVisible().catch(() => false);
    record(
      '[nav/movement-vault-appears-in] a full access account still sees the APPEARS IN section',
      appearsInVisible,
      JSON.stringify({ appearsInVisible })
    );

    // --- The deck reference: full back-chain, and genuinely real content. ---
    const deckRefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="movement-reference-"]'))
        .filter((el) => !el.closest('[aria-hidden="true"]'))
        .map((el) => el.getAttribute('data-testid'))
    );
    if (deckRefs.length > 0) {
      await page.locator(`[data-testid="${deckRefs[0]}"]`).click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'movement-vault-appears-in-deck-stacked.png') }).catch(() => {});
      const deckCardCloseVisible = await page.getByTestId('deck-card-close').isVisible().catch(() => false);
      record(
        '[nav/movement-vault-appears-in] a deck card reference opens stacked on top (its own close X), never jumping blind to THE DECK tab\'s paywall',
        deckCardCloseVisible,
        JSON.stringify({ deckCardCloseVisible })
      );
      // Round 30: a full access account must still reach the REAL card
      // content through this exact door -- the gate added this round is
      // keyed on `fullContentAccess`, not on the door itself, so this is
      // the one assertion that would catch an over-eager fix that locked
      // the modal for everyone instead of just limited tiers.
      const markCompleteVisible = await page.getByTestId('deck-card-complete-toggle').isVisible().catch(() => false);
      const lockVisible = await page.getByText('JOIN THE BOATHOUSE', { exact: false }).isVisible().catch(() => false);
      record(
        '[nav/movement-vault-appears-in] a full access account sees the REAL deck card content (MARK COMPLETE), never the lock treatment',
        markCompleteVisible && !lockVisible,
        JSON.stringify({ markCompleteVisible, lockVisible })
      );
      await page.getByTestId('deck-card-close').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      const backToWorkoutVisible = await page.getByTestId('movement-detail-back').isVisible().catch(() => false);
      record(
        '[nav/movement-vault-appears-in] closing the stacked deck card reveals the vault detail again, with its own BACK TO WORKOUT intact',
        backToWorkoutVisible,
        JSON.stringify({ backToWorkoutVisible })
      );
      await page.getByTestId('movement-detail-back').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      const originalWorkoutVisible = await page.getByText('THE GAUNTLET', { exact: false }).first().isVisible().catch(() => false);
      record(
        '[nav/movement-vault-appears-in] backing out from there returns to the original workout -- the full retrace chain',
        originalWorkoutVisible,
        JSON.stringify({ originalWorkoutVisible })
      );
      if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'movement-vault-appears-in-after.png') }).catch(() => {});
    } else {
      record('[nav/movement-vault-appears-in] a deck card reference exists in APPEARS IN to test against', false, JSON.stringify({ deckRefs }));
    }

    // --- The WOD reference: lands on the exact referenced day, unlocked. ---
    await page.getByText('Kettlebell Swings', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    const wodRefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="movement-reference-"]'))
        .filter((el) => !el.closest('[aria-hidden="true"]') && /SWING SET/i.test(el.textContent || ''))
        .map((el) => el.getAttribute('data-testid'))
    );
    if (wodRefs.length > 0) {
      await page.locator(`[data-testid="${wodRefs[0]}"]`).click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      // THU is the real referenced day (SWING SET), unlocked for a full
      // access account -- the correct landing shows the real SWING SET
      // card, not a LockedDay CTA. DateStrip has no aria-selected
      // attribute at all -- the one real, stable signal of "which cell is
      // selected" is its own `cellSelected` style actually applying
      // (backgroundColor: colors.green, '#076652'), read via
      // getComputedStyle rather than guessing at a react-native-web-
      // generated class name (which is an implementation detail that
      // shifts across builds, not a contract).
      const thursdaySelected = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('[data-testid^="date-strip-cell-"]')).filter((el) => !el.closest('[aria-hidden="true"]'));
        const active = cells.find((el) => {
          const bg = window.getComputedStyle(el).backgroundColor;
          return bg === 'rgb(7, 102, 82)';
        });
        return active ? active.textContent : null;
      });
      const swingSetVisible = await page.getByText('SWING SET', { exact: false }).first().isVisible().catch(() => false);
      record(
        '[nav/movement-vault-appears-in] a WOD reference lands on the exact referenced day (Thursday, SWING SET), unlocked, not an arbitrary default',
        swingSetVisible && !!thursdaySelected && /THU/.test(thursdaySelected),
        JSON.stringify({ thursdaySelected, swingSetVisible })
      );
      if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'movement-vault-appears-in-wod-landed.png') }).catch(() => {});
    } else {
      record('[nav/movement-vault-appears-in] a WOD reference (SWING SET) exists in APPEARS IN to test against', false, JSON.stringify({ wodRefs }));
    }

    await context.close();
  }

  // ---------------------------------------------------------------------
  // Round 30, check (a): a limited-access account (online free, ten pack,
  // drop in, guest, booking only) gets NO APPEARS IN section at all on
  // movement detail -- no locked rows, no teaser list, the section simply
  // isn't there, regardless of reference type. Reproduced the same real
  // path as the full-access block above (Monday's GAUNTLET -> Kettlebell
  // Swings, a movement whose APPEARS IN list genuinely carries both deck
  // and WOD references), just as online_free instead.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await page.route('**/rest/v1/subscriptions*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
    await page.route('**/rest/v1/class_packs*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    await page.getByRole('tab', { name: /YOUR WORKOUTS/i }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate((idx) => {
      const nodes = Array.from(document.querySelectorAll(`[data-testid="date-strip-cell-${idx}"]`));
      const target = nodes.find((el) => !el.closest('[aria-hidden="true"]'));
      if (target) target.setAttribute('data-r30-active-cell', 'true');
    }, 0);
    await page.locator('[data-r30-active-cell="true"]').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText('Kettlebell Swings', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'deck-gate-limited-no-appears-in.png') }).catch(() => {});

    const movementDetailOpen = await page.getByTestId('movement-detail-back').isVisible().catch(() => false);
    const appearsInVisible = await page.getByText('APPEARS IN', { exact: false }).isVisible().catch(() => false);
    record(
      '[deck-gate/limited-no-appears-in] a limited-access account reaches movement detail, but APPEARS IN is not there at all',
      movementDetailOpen && !appearsInVisible,
      JSON.stringify({ movementDetailOpen, appearsInVisible })
    );

    await context.close();
  }

  // ---------------------------------------------------------------------
  // Round 31, check (c): deck cards do not appear in search results for a
  // limited-access tier AT ALL -- owner decision, replacing Round 30's own
  // "visible teaser, locked on tap" behavior, which a real device
  // contradicted outright (searching a deck card name as a limited account
  // returned no deck result whatsoever, not a tappable locked row).
  //
  // Root cause of why Round 30's own check passed anyway: that check
  // mocked a `deck_completions` row directly over the network to force a
  // result into existence, bypassing the UI entirely -- a shape that can
  // never occur on a real device, since the only way a completion is ever
  // WRITTEN is DeckCardDetailModal's own MARK COMPLETE button, which Round
  // 30's own fix had already gated to fullContentAccess in the same PR.
  // A limited-access account's real `deck_completions` is therefore always
  // empty in practice, so `deckResults` was always going to be empty on a
  // real device regardless of what this check's own mock said -- the mock
  // just asserted a world that couldn't exist, and the check never
  // actually drove a real limited-access deckResults computation at all.
  // `SearchModal.tsx`'s own `deckResults` now checks `fullContentAccess`
  // directly instead of relying on that structural accident as the only
  // enforcement (a member who completes cards on a full-access tier and
  // later downgrades would otherwise keep showing their old completions in
  // search) -- this check's own mocked completion row is deliberately kept
  // AND still blocked, to prove the explicit access check is what's doing
  // the work, not an absence of fixture data.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await page.route('**/rest/v1/subscriptions*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
    await page.route('**/rest/v1/class_packs*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
    await page.route('**/rest/v1/deck_completions*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ card_id: '6-spade', completed_at: new Date().toISOString() }]) })
    );
    // Same badge-grant infinite-upsert gap documented at the [search-deep-
    // link/*] fixture above: a nonzero deck_completions row makes
    // BadgeContext try to grant "day one doug" on every render until
    // badge_grants reflects it -- answer it directly to stop the loop.
    await page.route('**/rest/v1/badge_grants*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ user_id: USER_ID, badge_id: 'day_one_doug', period_key: '', granted_at: new Date().toISOString(), profiles: { display_name: 'Test Member' } }]),
      })
    );
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const nudgeVisible = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    if (nudgeVisible) {
      await page.getByTestId('alert-backdrop').click({ position: { x: 5, y: 5 }, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }

    await page.getByTestId('open-search').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByPlaceholder(/search/i).first().fill('uni').catch(() => {});
    await page.waitForTimeout(500);
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'search-deck-limited.png') }).catch(() => {});

    const resultVisible = await page.locator('#search-screen-container').getByText('Uni Life', { exact: false }).first().isVisible().catch(() => false);
    record(
      '[deck-gate/search-door] a limited-access account gets NO deck card result at all for "uni", even with a completion row mocked',
      !resultVisible,
      JSON.stringify({ resultVisible })
    );

    await context.close();
  }

  // ---------------------------------------------------------------------
  // Round 31, check (c), other half: a full access account's search
  // results are completely unaffected by the new access check -- the same
  // completed card still appears and still opens the real content.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await page.route('**/rest/v1/deck_completions*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ card_id: '6-spade', completed_at: new Date().toISOString() }]) })
    );
    await page.route('**/rest/v1/badge_grants*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ user_id: USER_ID, badge_id: 'day_one_doug', period_key: '', granted_at: new Date().toISOString(), profiles: { display_name: 'Test Member' } }]),
      })
    );
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    await page.getByTestId('open-search').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByPlaceholder(/search/i).first().fill('uni').catch(() => {});
    await page.waitForTimeout(500);
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'search-deck-full-access.png') }).catch(() => {});

    const resultVisible = await page.locator('#search-screen-container').getByText('Uni Life', { exact: false }).first().isVisible().catch(() => false);
    record(
      '[deck-gate/search-door] a full access account still sees the completed deck card result for "uni", unaffected',
      resultVisible,
      JSON.stringify({ resultVisible })
    );
    if (resultVisible) {
      await page.locator('#search-screen-container').getByText('Uni Life', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);
      const markCompleteVisible = await page.getByTestId('deck-card-complete-toggle').isVisible().catch(() => false);
      record(
        '[deck-gate/search-door] tapping it opens the real card content (MARK COMPLETE), not a lock',
        markCompleteVisible,
        JSON.stringify({ markCompleteVisible })
      );
    }

    await context.close();
  }

  // ---------------------------------------------------------------------
  // Round 30, check (d): a real-device bug -- while Movement Vault's
  // detail view was open, tapping any bottom tab lit it gold
  // (react-navigation genuinely switched its own active route) but
  // nothing on screen changed, since Movement Vault (a non-fullBleed
  // ScreenOverlay, deliberately left visible/tappable underneath) kept
  // covering the newly-active tab's content with nothing closing it. Now
  // wired via Tab.Navigator's own `tabPress` screenListener -> App.tsx's
  // `closeAllOverlays()`. A full access account, so Movement Vault's
  // "LOOK UP A MOVEMENT" entry (not APPEARS IN, which this round gated to
  // full access only) is reachable without any extra setup.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    await page.getByRole('tab', { name: /YOUR WORKOUTS/i }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate((idx) => {
      const nodes = Array.from(document.querySelectorAll(`[data-testid="date-strip-cell-${idx}"]`));
      const target = nodes.find((el) => !el.closest('[aria-hidden="true"]'));
      if (target) target.setAttribute('data-r30-tab-dismiss-cell', 'true');
    }, 0);
    await page.locator('[data-r30-tab-dismiss-cell="true"]').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByTestId('lookup-movement').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tab-dismiss-vault-open-before.png') }).catch(() => {});

    const vaultOpenBefore = await page.getByTestId('movement-vault-close').isVisible().catch(() => false);
    record('[tab-dismiss/movement-vault] Movement Vault is genuinely open before the tab tap', vaultOpenBefore, JSON.stringify({ vaultOpenBefore }));

    await page.getByRole('tab', { name: /COMMUNITY/i }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tab-dismiss-after-community.png') }).catch(() => {});

    const vaultOpenAfter = await page.getByTestId('movement-vault-close').isVisible().catch(() => false);
    const communityComposerVisible = await page.getByTestId('composer-bar').isVisible().catch(() => false);
    record(
      '[tab-dismiss/movement-vault] tapping COMMUNITY closes Movement Vault AND reveals the real Community content underneath -- not just a gold-lit tab with no visible change',
      !vaultOpenAfter && communityComposerVisible,
      JSON.stringify({ vaultOpenAfter, communityComposerVisible })
    );

    await context.close();
  }

  // ---------------------------------------------------------------------
  // Round 31, check (a): Movement Vault's video renders -- a real iframe
  // with the correct src, not the placeholder/retry fallback -- for both a
  // limited-access and a full-access account, cold start. A real device
  // report found every movement video rendering as a solid black box; this
  // is the exact color `playerWrap`'s own background paints when nothing
  // inside it ever renders. Reproduced directly (this suite's own earlier,
  // throwaway diagnostic, not kept here) that this is NOT connected to
  // Round 29/30's overlay-dismissal or modal-gating changes -- opening the
  // vault, cold and warm, as both tiers, with the real youtube-nocookie.com
  // request stubbed to succeed, renders the player correctly every time,
  // with exactly one embed request per open and no unexpected reload. The
  // real failure is the YouTube embed itself: a request that genuinely
  // hangs (blocked, offline, slow) fires no iframe `load` event at all --
  // no error, no signal of any kind, cross-origin -- which is why
  // MovementVideoPlayer.tsx now races a timeout against `load` and forces
  // a fresh iframe (new `key`) on expiry, up to a few automatic attempts,
  // before showing an actionable "couldn't load, tap to retry" card
  // instead of a silent black box forever. This sandboxed environment's
  // own outbound network cannot reach youtube-nocookie.com at all
  // (confirmed directly) -- the same category of "can't drive the real
  // mechanism from this harness" gap already documented elsewhere in this
  // file for Stripe/YouTube -- so this check stubs that one request to
  // succeed and asserts the real, unmodified player renders off it, never
  // falling back to the retry card.
  for (const tierLabel of ['limited', 'full-access']) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    if (tierLabel === 'limited') {
      await setupMocks(page, USER_ID);
      await page.route('**/rest/v1/subscriptions*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
      await page.route('**/rest/v1/class_packs*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
    } else {
      await setupMocks(page, USER_ID);
    }
    let embedRequestCount = 0;
    await page.route('https://www.youtube-nocookie.com/embed/**', (route) => {
      embedRequestCount++;
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body style="background:#111"></body></html>' });
    });
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const nudgeVisible = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    if (nudgeVisible) {
      await page.getByTestId('alert-backdrop').click({ position: { x: 5, y: 5 }, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }

    await page.getByRole('tab', { name: /YOUR WORKOUTS/i }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate((idx) => {
      const nodes = Array.from(document.querySelectorAll(`[data-testid="date-strip-cell-${idx}"]`));
      const target = nodes.find((el) => !el.closest('[aria-hidden="true"]'));
      if (target) target.setAttribute('data-r31-video-cell', 'true');
    }, 0);
    await page.locator('[data-r31-video-cell="true"]').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText('Kettlebell Swings', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, `movement-video-${tierLabel}.png`) }).catch(() => {});

    const playerVisible = await page.getByTestId('movement-video-player').isVisible().catch(() => false);
    const retryVisible = await page.getByTestId('movement-video-retry').isVisible().catch(() => false);
    const iframeSrc = await page
      .locator('[data-testid="movement-video-player"] iframe')
      .first()
      .getAttribute('src')
      .catch(() => null);
    record(
      `[movement-video/${tierLabel}] the real video player renders with the correct embed src, never the black-box retry fallback`,
      playerVisible && !retryVisible && !!iframeSrc && iframeSrc.includes('youtube-nocookie.com/embed/'),
      JSON.stringify({ playerVisible, retryVisible, iframeSrc, embedRequestCount })
    );
    const reloadButtonVisible = await page.getByTestId('movement-video-reload').isVisible().catch(() => false);
    record(
      `[movement-video/${tierLabel}] the always-available reload control is present even on a successful load`,
      reloadButtonVisible,
      JSON.stringify({ reloadButtonVisible })
    );

    await context.close();
  }

  // ---------------------------------------------------------------------
  // Round 31, check (b): a real-device report found the UNLOCK EVERYTHING
  // upgrade nudge rendered on top of the signed-out welcome/About page
  // right after signing out of a free-tier account -- that popup must
  // only ever appear for a signed-in account on the free plan, inside the
  // app. `AlertHost`'s own state (alert.ts) and the shared interruption
  // gate (interruptionGate.ts) are both module-level, independent of auth
  // state -- `AuthContext.tsx`'s `signOut()` now dismisses/releases both
  // immediately, and `App.tsx` additionally refuses to render `AlertHost`
  // at all while on the signed-out About step specifically (gated on
  // `!(!signedUp && onboardingStep === 'about')`, not on `signedUp`
  // generally -- real pre-signup screens like PricingScreen use
  // showAlert() for genuine checkout confirmations and must keep
  // working). This check drives the real flow end to end: a fresh
  // online_free session shows the nudge, it's dismissed normally (the
  // realistic path -- a full-screen modal blocks reaching Settings while
  // it's still up), then Settings' real SIGN OUT confirm-and-sign-out
  // flow runs, and the welcome screen that lands afterward shows zero
  // popups of any kind.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await page.route('**/rest/v1/subscriptions*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
    await page.route('**/rest/v1/class_packs*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
    // upgradeNudge.ts skips firing entirely for `how_train === 'boathouse'`
    // until a real booking exists -- setupMocks()'s own generic profile
    // default IS 'boathouse', which would silently skip the nudge here and
    // leave this check with nothing real to clear. 'online' is the real
    // shape a free-tier WOD/Deck member has.
    await page.route('**/rest/v1/profiles*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ display_name: 'Test Member', instagram_handle: '', favorite_quote: '', avatar_url: null, how_train: 'online', is_admin: false, show_tomorrows_workout: true, tour_completed_at: new Date(Date.now() - 30 * 86400000).toISOString(), group_chat_muted: false }]),
      })
    );
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const nudgeVisible = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    record('[signout/alert-cleared] a fresh online_free session shows the upgrade nudge, confirming there is something real to clear', nudgeVisible, JSON.stringify({ nudgeVisible }));
    await page.getByText('Not now', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);

    await page.getByTestId('open-sidebar').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByText('SETTINGS', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByTestId('sign-out').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByText('Sign Out', { exact: true }).last().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'signout-welcome-clean.png') }).catch(() => {});

    const alertVisibleAfter = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    const aboutVisible = await page.getByText("DOC'S FITNESS", { exact: false }).first().isVisible().catch(() => false);
    record(
      '[signout/alert-cleared] the signed-out welcome screen renders with zero popups after sign-out',
      !alertVisibleAfter && aboutVisible,
      JSON.stringify({ alertVisibleAfter, aboutVisible })
    );

    await context.close();
  }

  // Round 32: the two bottom tab label renames. "DOC'S WODS" -> "WORKOUT OF
  // THE DAY" and "WEEKLY CHALLENGE" -> "DOC'S COWS" are label-only changes
  // (TabConfig.navLabel in App.tsx) -- the type treatment (font, size,
  // spacing, single line) is untouched, and WORKOUT OF THE DAY was accepted
  // to truncate on the smallest phones rather than wrap or shrink.
  // Round 32 follow-up: WORKOUT OF THE DAY truncated on real iPhones, so it
  // was replaced with YOUR WORKOUTS -- same label-only change, same type
  // treatment untouched. Checked
  // on both a full-access account (all 4 tabs unlocked) and a
  // limited-access account (COWS/Deck locked, but the label text itself is
  // identical regardless of lock state).
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const nudgeVisible = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    if (nudgeVisible) {
      await page.getByTestId('alert-backdrop').click({ position: { x: 5, y: 5 }, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    const fullTabNames = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="tab"]')).map((el) => (el.textContent || '').trim())
    );
    record(
      "[tab-rename/full-access] the bottom bar reads COMMUNITY, YOUR WORKOUTS, DOC'S COWS, THE DECK (full access)",
      fullTabNames.some((t) => t.includes('COMMUNITY')) &&
        fullTabNames.some((t) => t.includes('YOUR WORKOUTS')) &&
        fullTabNames.some((t) => t.includes("DOC'S COWS")) &&
        fullTabNames.some((t) => t.includes('THE DECK')) &&
        !fullTabNames.some((t) => t.includes("DOC'S WODS")) &&
        !fullTabNames.some((t) => t.includes('WEEKLY CHALLENGE')) &&
        !fullTabNames.some((t) => t.includes('WORKOUT OF THE DAY')),
      JSON.stringify({ fullTabNames })
    );
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tab-bar-full-access.png') }).catch(() => {});
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await page.route('**/rest/v1/subscriptions*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
    await page.route('**/rest/v1/class_packs*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }));
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const nudgeVisible2 = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    if (nudgeVisible2) {
      await page.getByTestId('alert-backdrop').click({ position: { x: 5, y: 5 }, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    const limitedTabNames = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="tab"]')).map((el) => (el.textContent || '').trim())
    );
    record(
      "[tab-rename/limited] the bottom bar reads the same renamed labels for a limited-access (booking-only) account, lock icon aside",
      limitedTabNames.some((t) => t.includes('COMMUNITY')) &&
        limitedTabNames.some((t) => t.includes('YOUR WORKOUTS')) &&
        limitedTabNames.some((t) => t.includes("DOC'S COWS")) &&
        limitedTabNames.some((t) => t.includes('THE DECK')) &&
        !limitedTabNames.some((t) => t.includes("DOC'S WODS")) &&
        !limitedTabNames.some((t) => t.includes('WEEKLY CHALLENGE')) &&
        !limitedTabNames.some((t) => t.includes('WORKOUT OF THE DAY')),
      JSON.stringify({ limitedTabNames })
    );
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tab-bar-limited.png') }).catch(() => {});
    await context.close();
  }

  // Round 33: THE COMPLETION SHARE CARD. Reads CompletionShareCardOverlay's
  // own hidden, zero-footprint `completion-share-card-debug` text node
  // (a real DOM element, JSON-stringified) for content assertions a canvas
  // has no DOM text for -- same spirit as DebugOverlay.web.tsx's own
  // "expose a real fact as plain text for exactly what a screenshot can't
  // verify," scoped to just this feature. Pixel sampling on the real
  // canvas backs up the two assertions that matter most (background color,
  // suit ink color) so a bug in the draw function itself, not just in this
  // debug mirror, would still be caught.
  const readShareCardDebug = async (page) => {
    const text = await page.getByTestId('completion-share-card-debug').innerText({ timeout: 5000 }).catch(() => null);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };
  const sampleCanvasPixel = async (page, x, y) => {
    return page.evaluate(
      ({ x, y }) => {
        const canvas = document.querySelector('#completion-share-card-canvas-host canvas');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const data = ctx.getImageData(x, y, 1, 1).data;
        return [data[0], data[1], data[2]];
      },
      { x, y }
    );
  };
  const closeToRgb = (sample, [r, g, b], tolerance = 12) =>
    !!sample && Math.abs(sample[0] - r) <= tolerance && Math.abs(sample[1] - g) <= tolerance && Math.abs(sample[2] - b) <= tolerance;
  // drawShareCard() is async -- it awaits the kettlewave asset's own
  // decode before drawing the mark/counter/progress block, so a fixed
  // waitForTimeout after tapping MARK COMPLETE can land before that
  // promise resolves (caught directly: a first screenshot pass captured
  // every card mid-draw, loading spinner still up, kettlewave/counter/
  // progress bar all missing). CompletionShareCardOverlay's own `ready`
  // state flips true only once drawShareCard() resolves, mirrored here
  // via the loading overlay's testID -- wait for it to detach before any
  // screenshot or pixel sample that needs the finished card.
  const waitForShareCardReady = async (page) => {
    await page.getByTestId('completion-share-card-loading').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
  };
  // Mirrors STANDARD_COLORWAYS' own order in shareCardRender.ts exactly --
  // a plain Node script can't import that TS module directly, so this is
  // the one place that order has to be kept in sync by hand.
  const STANDARD_COLORWAY_IDS = ['augusta-green', 'bright-yellow', 'black', 'green-yellow-wave', 'black-yellow-wave'];

  // [share-card/wod]: real MARK COMPLETE on a Doc's WOD via DayPanel (the
  // Community tab's own default landing), a fresh full-access account with
  // zero prior completions -- end to end, not a forced mock, so the
  // counter assertion (workoutNumber === 1) is a genuine proof the card
  // reads the same totalWorkoutsLogged the HUNDRED DOWN badge itself
  // counts from, not a second, possibly-drifted number.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    // A fresh completion crossing totalWorkoutsLogged from 0 to 1 makes
    // BadgeContext's own effect try to grant "day one doug" -- answered
    // directly here so its own `grants` dependency doesn't keep changing
    // reference and re-fire forever (the same documented gap this file's
    // own search-deep-link fixture already works around).
    await page.route('**/rest/v1/badge_grants*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ user_id: USER_ID, badge_id: 'day_one_doug', period_key: '', granted_at: new Date().toISOString(), profiles: { display_name: 'Test Member' } }]),
      })
    );
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const nudgeVisible = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    if (nudgeVisible) {
      await page.getByTestId('alert-backdrop').click({ position: { x: 5, y: 5 }, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }

    await page.getByTestId(`date-strip-cell-${offsetToWeekday(1)}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByTestId('wod-bar-toggle').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    const wodTitle = await page.getByTestId('day-panel-wod-title').innerText({ timeout: 5000 }).catch(() => null);
    await page.getByTestId('day-panel-complete').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);

    const cardVisible = await page.getByTestId('completion-share-card').isVisible().catch(() => false);
    record('[share-card/wod] the card appears immediately after marking a Doc\'s WOD complete', cardVisible, JSON.stringify({ cardVisible }));
    await waitForShareCardReady(page);

    const debugInfo = await readShareCardDebug(page);
    record(
      '[share-card/wod] standard variant, real workout title, and the lifetime counter reads exactly 1 (a fresh account\'s first-ever completion)',
      !!debugInfo && debugInfo.variant === 'standard' && debugInfo.title === wodTitle && debugInfo.workoutNumber === 1,
      JSON.stringify({ debugInfo, wodTitle })
    );

    const buttonsPresent =
      (await page.getByTestId('share-to-story').isVisible().catch(() => false)) &&
      (await page.getByTestId('save-card').isVisible().catch(() => false)) &&
      (await page.getByTestId('completion-share-card-close').isVisible().catch(() => false));
    record('[share-card/wod] SHARE TO STORY, SAVE, and the close X are all present', buttonsPresent, JSON.stringify({ buttonsPresent }));

    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'share-card-modal.png') }).catch(() => {});

    // [share-card/close]: the standing popup rule -- X closes with zero
    // side effects on the completion itself, and never reappears on its
    // own for this same completion.
    await page.getByTestId('completion-share-card-close').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    const cardGoneAfterClose = !(await page.getByTestId('completion-share-card').isVisible().catch(() => true));
    const stillCompletedText = await page.getByTestId('day-panel-complete').innerText().catch(() => '');
    record(
      '[share-card/close] the X closes the card, the WOD stays marked complete, and the card does not reappear on its own',
      cardGoneAfterClose && stillCompletedText.includes('COMPLETED'),
      JSON.stringify({ cardGoneAfterClose, stillCompletedText })
    );

    await context.close();
  }

  // [share-card/logged]: SAVE RESULTS in LogResultsModal -- its own
  // distinct trigger per the approved spec, independent of the plain
  // MARK COMPLETE path above.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await page.route('**/rest/v1/badge_grants*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ user_id: USER_ID, badge_id: 'day_one_doug', period_key: '', granted_at: new Date().toISOString(), profiles: { display_name: 'Test Member' } }]),
      })
    );
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const nudgeVisible = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    if (nudgeVisible) {
      await page.getByTestId('alert-backdrop').click({ position: { x: 5, y: 5 }, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.getByTestId(`date-strip-cell-${offsetToWeekday(1)}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByTestId('wod-bar-toggle').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByTestId('day-panel-log').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByTestId('save-results').click({ timeout: 5000 }).catch(() => {});
    // useActionCompletion's own SAVED acknowledgment holds for ~900ms
    // before onSettled (close the modal, then open the share card) runs.
    await page.waitForTimeout(1500);

    const logModalClosed = !(await page.getByTestId('close-log-results').isVisible().catch(() => false));
    const cardVisible = await page.getByTestId('completion-share-card').isVisible().catch(() => false);
    const debugInfo = await readShareCardDebug(page);
    record(
      '[share-card/logged] saving logged results closes the modal and opens the share card',
      logModalClosed && cardVisible && !!debugInfo && debugInfo.variant === 'standard',
      JSON.stringify({ logModalClosed, cardVisible, debugInfo })
    );

    await context.close();
  }

  // [share-card/deck]: a real MARK COMPLETE on a Doc's Deck of WODs card,
  // for both a black-suit and a red-suit card -- the suit-ink-color
  // assertion is backed by a real pixel sample on the card's own border
  // stroke, not just the debug mirror, so a bug in drawDeckCard's own ink
  // logic (not just a copy-paste of it) would still fail this.
  for (const fixture of [
    { id: 'A-spade', expectedInk: [0, 0, 0], label: 'black suit' },
    { id: 'A-heart', expectedInk: [200, 16, 46], label: 'red suit' },
  ]) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await page.route('**/rest/v1/badge_grants*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ user_id: USER_ID, badge_id: 'day_one_doug', period_key: '', granted_at: new Date().toISOString(), profiles: { display_name: 'Test Member' } }]),
      })
    );
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const nudgeVisible = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    if (nudgeVisible) {
      await page.getByTestId('alert-backdrop').click({ position: { x: 5, y: 5 }, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.getByRole('tab', { name: /THE DECK/i }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByText('BROWSE DECK', { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByTestId(`browse-card-${fixture.id}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByTestId('deck-card-complete-toggle').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);

    const cardVisible = await page.getByTestId('completion-share-card').isVisible().catch(() => false);
    const debugInfo = await readShareCardDebug(page);
    // Samples the left border stroke at mid-height. shareCardRender.ts's
    // drawDeckCard strokes a rect at x=28 (borderInset) with lineWidth=4 --
    // canvas centers a stroke ON its path, so the painted stroke spans
    // x=26 to x=30; x=28 (the path's own center) is the most solidly
    // painted pixel, while the original x=30 attempt landed right on the
    // stroke's own outer edge and sampled background instead (the real
    // bug this comment update fixes -- confirmed directly, not guessed,
    // by the first run's own [255,255,255] white result). y=675 is
    // CARD_HEIGHT/2, well clear of the corner indices.
    await waitForShareCardReady(page);
    const inkSample = await sampleCanvasPixel(page, 28, 675);
    const expectedInkHex = fixture.expectedInk[0] === 0 ? '#000000' : '#c8102e';
    record(
      `[share-card/deck-${fixture.label.replace(' ', '-')}] completing a ${fixture.label} Deck card opens the white playing-card variant with the correct suit ink`,
      cardVisible &&
        !!debugInfo &&
        debugInfo.variant === 'deck' &&
        debugInfo.deckCardNumber === 1 &&
        debugInfo.suitInk.toLowerCase() === expectedInkHex &&
        closeToRgb(inkSample, fixture.expectedInk),
      JSON.stringify({ cardVisible, debugInfo, inkSample, fixture })
    );
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, `share-card-deck-${fixture.label.replace(' ', '-')}.png`) }).catch(() => {});

    await context.close();
  }

  // [share-card/colorways]: all five standard colorways, forced
  // deterministically via window.__shareCardForceColorwayIndex (the same
  // "force what the real mechanism would produce" technique this suite
  // already uses throughout) rather than retrying Math.random(). Driven
  // through five real MARK COMPLETE actions on five distinct weekdays
  // (Mon-Fri) rather than the COW score path -- a first attempt at this
  // block used repeated COW submissions instead, and failed outright
  // (cardVisible:false for all five): root-caused directly, not guessed
  // at -- DocsCowsScreen only renders EntryForm when the REAL weekly
  // challenge cycle is currently open (getChallengeCycle(), real wall
  // clock), so a check that happens to run during the real
  // Saturday-noon-to-Sunday-6pm closed window can never reach EntryForm
  // at all regardless of what this suite seeds into Content Library. Five
  // distinct real weekdays sidesteps that real-time dependency entirely,
  // the same lesson this file's own Round 29 writeup already drew for a
  // different check.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await page.addInitScript(() => {
      window.__shareCardForceColorwayIndex = 0;
    });
    // A fresh completion crossing totalWorkoutsLogged from 0 to 1 makes
    // BadgeContext's own effect try to grant "day one doug" -- answered
    // directly, same gap documented on the [share-card/wod] block above.
    await page.route('**/rest/v1/badge_grants*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ user_id: USER_ID, badge_id: 'day_one_doug', period_key: '', granted_at: new Date().toISOString(), profiles: { display_name: 'Test Member' } }]),
      })
    );
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const nudgeVisible = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    if (nudgeVisible) {
      await page.getByTestId('alert-backdrop').click({ position: { x: 5, y: 5 }, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }

    const expectedBackgrounds = [
      [7, 102, 82], // Augusta Green
      [229, 184, 11], // Bright Yellow
      [0, 0, 0], // Black
      [7, 102, 82], // Green with the yellow wave
      [0, 0, 0], // Black with the yellow wave
    ];
    const weekdayTargets = [1, 2, 3, 4, 5]; // Mon-Fri, each a distinct real WOD day

    for (let i = 0; i < 5; i++) {
      await page.evaluate((idx) => {
        window.__shareCardForceColorwayIndex = idx;
      }, i);
      await page.getByTestId(`date-strip-cell-${offsetToWeekday(weekdayTargets[i])}`).click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
      await page.getByTestId('wod-bar-toggle').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.getByTestId('day-panel-complete').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(600);

      const cardVisible = await page.getByTestId('completion-share-card').isVisible().catch(() => false);
      const debugInfo = await readShareCardDebug(page);
      await waitForShareCardReady(page);
      const bgSample = await sampleCanvasPixel(page, 60, 60);
      record(
        `[share-card/colorway-${i}] colorway ${STANDARD_COLORWAY_IDS[i]} renders the real background color on the canvas`,
        cardVisible && !!debugInfo && debugInfo.colorwayId === STANDARD_COLORWAY_IDS[i] && closeToRgb(bgSample, expectedBackgrounds[i]),
        JSON.stringify({ cardVisible, debugInfo, bgSample })
      );
      if (SCREENSHOT_DIR)
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `share-card-colorway-${STANDARD_COLORWAY_IDS[i]}.png`) }).catch(() => {});

      await page.getByTestId('completion-share-card-close').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      // Each weekday is a fresh day -- close the WOD bar back down so the
      // next iteration's own wod-bar-toggle tap has a clean, consistent
      // starting state to expand from.
      await page.getByTestId('wod-bar-toggle').click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
    }

    await context.close();
  }

  // [share-card/post-100]: the progress bar retires once the target is
  // cleared -- a real wod_completions fixture seeded at 99 rows, then one
  // more real MARK COMPLETE crosses the threshold to exactly 100.
  {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    const ninetyNineRows = Array.from({ length: 99 }, (_, i) => ({
      day_key: `share-card-fixture-${i}`,
      workout_title: `Fixture Workout ${i}`,
      date_label: 'A day',
      workout_timestamp: Date.now() - (99 - i) * 86400000,
      rounds: '5',
      time_taken: '—',
      kettlebell_kg: '16',
      notes: '',
      media_url: null,
      media_type: null,
      completed_at: new Date(Date.now() - (99 - i) * 86400000).toISOString(),
    }));
    await page.route('**/rest/v1/wod_completions*', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ninetyNineRows) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    // Crossing from 99 to 100 would otherwise trip BOTH the day_one_doug
    // and hundred_down upsert-loop gap (see the earlier blocks' own
    // comment) -- both answered directly here from the start.
    await page.route('**/rest/v1/badge_grants*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { user_id: USER_ID, badge_id: 'day_one_doug', period_key: '', granted_at: new Date().toISOString(), profiles: { display_name: 'Test Member' } },
          { user_id: USER_ID, badge_id: 'hundred_down', period_key: '', granted_at: new Date().toISOString(), profiles: { display_name: 'Test Member' } },
        ]),
      })
    );
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const nudgeVisible = await page.getByTestId('alert-backdrop').isVisible().catch(() => false);
    if (nudgeVisible) {
      await page.getByTestId('alert-backdrop').click({ position: { x: 5, y: 5 }, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.getByTestId(`date-strip-cell-${offsetToWeekday(1)}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByTestId('wod-bar-toggle').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByTestId('day-panel-complete').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);

    // "HUNDRED DOWN" itself is canvas pixels, not DOM text -- `cleared`
    // is CompletionShareCardOverlay's own debug mirror of exactly the
    // same workoutNumber >= HUNDRED_DOWN_TARGET check drawProgressBlock
    // uses to decide between the bar and the pill.
    const debugInfo = await readShareCardDebug(page);
    record(
      '[share-card/post-100] crossing 100 shows the raw counter + a HUNDRED DOWN mark, not the progress bar',
      !!debugInfo && debugInfo.workoutNumber === 100 && debugInfo.cleared === true,
      JSON.stringify({ debugInfo })
    );
    await waitForShareCardReady(page);
    if (SCREENSHOT_DIR) await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'share-card-post-100.png') }).catch(() => {});

    await context.close();
  }

  // --- Screenshot: the schedule with the gold Pilates card. The inert
  // CLASS FULL state, the first-class-free question's new copy/X, and
  // the post-cancelled-checkout schedule are already captured by the
  // [booking/inert-full/guest], [popup-escape/button-copy], and
  // [booking/checkout-cancel-return] blocks above. ---
  if (SCREENSHOT_DIR) {
    const bookingState = createClassBookingState([
      makeSessionFixture({
        id: 'sess-shot-pilates',
        classKey: 'pilates-wed-830a',
        className: 'Downbeach Pilates with Marina',
        classType: 'Group Mat Pilates',
        capacity: null,
        isGuestClass: true,
        priceCents: 2000,
        stripePriceId: 'price_1UTjj9K8jMUFAOQwhnr7flRh',
        date: dateAtOffsetDays(MONDAY_OFFSET, 8, 30),
      }),
    ]);

    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await setupMocks(page, USER_ID);
    await registerClassBookingMocks(page, bookingState, USER_ID);
    await seedSignedInSession(page, USER_ID);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    await page.getByTestId(`date-strip-cell-${MONDAY_OFFSET}`).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'schedule-pilates-gold-card.png') }).catch(() => {});
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
