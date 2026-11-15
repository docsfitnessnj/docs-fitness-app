import { getSupabaseAdmin } from './supabaseAdmin.ts';

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
      (r) =>
        '<tr><td style="padding:12px 0;border-bottom:1px solid #E8E6E0;">' +
        `<div style="color:#5F6B66;font-size:11px;letter-spacing:0.5px;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(r.label)}</div>` +
        `<div style="color:#12211C;font-size:16px;font-weight:bold;font-family:Helvetica,Arial,sans-serif;margin-top:2px;">${escapeHtml(r.text)}</div>` +
        '</td></tr>'
    )
    .join('');

  // Email-client-safe: inline styles throughout, a plain table layout (no
  // flex/grid), system font fallbacks only (no webfont dependency), no
  // emojis.
  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:#FBFBF9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FBFBF9;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background-color:#FFFFFF;border-radius:12px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;" cellpadding="0" cellspacing="0">
<tr><td style="background-color:#054C3D;padding:32px 24px;text-align:center;">
<div style="color:#FFD520;font-size:13px;letter-spacing:2px;font-weight:bold;margin-bottom:8px;font-family:Helvetica,Arial,sans-serif;">DOC'S FITNESS</div>
<div style="color:#FFFFFF;font-size:24px;font-weight:bold;letter-spacing:0.5px;font-family:Helvetica,Arial,sans-serif;">THE NEW WEEK IS LIVE</div>
</td></tr>
<tr><td style="padding:24px 24px 8px 24px;">
<div style="color:#5F6B66;font-size:12px;letter-spacing:1px;font-weight:bold;margin-bottom:4px;font-family:Helvetica,Arial,sans-serif;">YOUR WORKOUTS</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
<div style="text-align:center;margin-top:28px;margin-bottom:8px;">
<a href="https://docsfitnessnj.github.io/docs-fitness-app/" style="display:inline-block;background-color:#E5B80B;color:#12211C;font-weight:bold;font-size:14px;letter-spacing:1px;text-decoration:none;padding:14px 36px;border-radius:8px;font-family:Helvetica,Arial,sans-serif;">OPEN THE APP</a>
</div>
</td></tr>
<tr><td style="background-color:#054C3D;padding:18px 24px;text-align:center;">
<div style="color:#FFFFFF;font-size:11px;font-family:Helvetica,Arial,sans-serif;">Doc's Fitness</div>
<div style="color:#FFFFFF;opacity:0.75;font-size:11px;margin-top:6px;font-family:Helvetica,Arial,sans-serif;">Don't want this email? Turn it off anytime in the app, under Settings &amp; Notifications.</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject: 'THE NEW WEEK IS LIVE', html, weekLabel: `Week of ${formatMD(week.week_start_date)}` };
}
