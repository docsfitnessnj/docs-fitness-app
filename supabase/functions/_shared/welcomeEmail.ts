import {
  BODY_FONT_STACK,
  HEADLINE_FONT_STACK,
  LABEL_FONT_STACK,
  LIGHT,
  renderEmailDocument,
  renderFooterHtml,
  renderOpenAppButtonHtml,
} from './emailLayout.ts';

export type WelcomeEmailVersion = 'online' | 'in_person';

export type WelcomeEmail = {
  subject: string;
  html: string;
};

// Round 64: the ONE place that decides which welcome version a brand-new
// member gets — book_class (the About page's BOOK YOUR CLASS IN PERSON
// door, see AuthContext.tsx's own signupMeta) is the only signup_path
// value that routes to the in-person version; every other value,
// including online_trial and undecided (left on the About page / How Do
// You Train screen), gets the online version. Exported so both
// notify-new-signup (the real send) and the suite's own static source
// checks can read the exact same decision this function makes, never a
// second, hand-duplicated copy of this one-line rule.
export function pickWelcomeVersion(signupPath: string | null | undefined): WelcomeEmailVersion {
  return signupPath === 'book_class' ? 'in_person' : 'online';
}

const SUBJECT = "WELCOME TO DOC'S FITNESS";

// Step 1 is byte-identical between both versions — the "put the app on
// your home screen" instruction doesn't depend on which door a member
// came through, so it's written once here and shared by both bodies
// rather than typed out twice.
const STEP_1_LEAD = '1. PUT THE APP ON YOUR HOME SCREEN.';
const STEP_1_REST =
  "Open the app in Safari, tap the Share button, then Add to Home Screen. (On Android: Chrome menu, then Add to Home screen.) Now it's one tap away, every day.";

// Shared closing line, also byte-identical between both versions.
const CLOSING_LINE = 'Questions? Just reply to this email. A real person reads it.';

const ONLINE = {
  intro:
    "Welcome to the crew. Your training lives in the app now: the workouts, the Challenge of the Week, the leaderboard, and the community board cheering it all on.",
  step2Lead: "2. CHECK TODAY'S WORKOUT.",
  step2Rest: "It's waiting on the Community screen.",
  step3Lead: '3. DO IT, THEN POST IT.',
  step3Rest: 'Your first logged workout earns your first badge. Everybody has a Day One.',
};

const IN_PERSON = {
  intro:
    "Welcome to Doc's Fitness. The app is your front door to the gym now: book your classes, see the schedule, and hang with the crew on the community board.",
  step2Lead: '2. BOOK YOUR CLASS.',
  step2Rest: 'The schedule is right on the Community screen. Tap a day, tap SIGN UP.',
  step3Lead: '3. SHOW UP.',
  step3Rest: "The crew is upstairs at the boathouse. We'll see you there.",
};

function renderStepRow(opts: { lead: string; rest: string; borderBottom: boolean }): string {
  const border = opts.borderBottom ? `border-bottom:1px solid ${LIGHT.hairline};` : '';
  return `<tr><td style="padding:10px 0;${border}" class="hairline-border">
<div class="text-strong" style="color:${LIGHT.text};font-size:15px;line-height:22px;font-family:${BODY_FONT_STACK};"><strong>${opts.lead}</strong> ${opts.rest}</div>
</td></tr>`;
}

function renderBody(copy: { intro: string; step2Lead: string; step2Rest: string; step3Lead: string; step3Rest: string }): string {
  const stepsHtml =
    renderStepRow({ lead: STEP_1_LEAD, rest: STEP_1_REST, borderBottom: true }) +
    renderStepRow({ lead: copy.step2Lead, rest: copy.step2Rest, borderBottom: true }) +
    renderStepRow({ lead: copy.step3Lead, rest: copy.step3Rest, borderBottom: false });

  return `<div class="text-strong" style="color:${LIGHT.text};font-size:30px;letter-spacing:0.5px;margin-bottom:12px;font-family:${HEADLINE_FONT_STACK};">YOU'RE IN.</div>
<div class="text-strong" style="color:${LIGHT.text};font-size:15px;line-height:22px;margin-bottom:18px;font-family:${BODY_FONT_STACK};">${copy.intro}</div>
<div class="text-strong" style="color:${LIGHT.text};font-size:15px;line-height:22px;margin-bottom:10px;font-family:${BODY_FONT_STACK};">Here's how to start:</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stepsHtml}</table>
${renderOpenAppButtonHtml()}
<div class="text-muted" style="color:${LIGHT.textMuted};font-size:13px;line-height:19px;margin-top:20px;text-align:center;font-family:${BODY_FONT_STACK};">${CLOSING_LINE}</div>`;
}

// The ONE renderer for both welcome-email versions — reused byte-for-byte
// by notify-new-signup (the real send, routed through dispatchToMembers)
// and admin-send-test-welcome-emails (the on-demand proof, which sends
// both versions straight to the owner's own inbox, never through the
// dispatch wrapper). Same shared layout (emailLayout.ts) the Sunday Drop
// uses — the header image, the 600px card, the gold OPEN THE APP image
// button, the @font-face block, and the dark-mode progressive-enhancement
// media query — reused as-is, no second copy, no new asset.
export function buildWelcomeEmail(version: WelcomeEmailVersion): WelcomeEmail {
  const copy = version === 'in_person' ? IN_PERSON : ONLINE;
  const html = renderEmailDocument({
    bodyHtml: renderBody(copy),
    footerHtml: renderFooterHtml({ includeOptOut: false }),
  });
  return { subject: SUBJECT, html };
}
