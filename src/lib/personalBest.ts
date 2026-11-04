// Round 44: PB detection. Compares a freshly logged score against a
// member's own prior history for THE SAME workout (same WOD title, same
// deck card id, or same COW challenge title -- identity is entirely the
// caller's job; this module only ever compares scores, never decides what
// "the same workout" means).
//
// A PB is earned independently on either of two axes, per the Round 44.5
// owner decision (final): weight is no longer part of PB detection at all
// -- the free text KETTLEBELL SIZE field plays no part in this comparison.
//  - a faster time than every parseable prior time
//  - more rounds(+reps) than every parseable prior rounds(+reps) value
//
// Deliberately silent and safe on incomplete data (an older freetext-only
// entry with no parseable score, or a workout with no prior history at
// all): every parse failure here is absorbed into "this axis doesn't
// apply," never a thrown error -- a save must never be blocked or slowed
// by PB comparison, per the brief's own explicit requirement. Wrapped in
// one outer try/catch as a last-resort backstop on top of that.
export type ScoreSnapshot = {
  time: string;
  rounds: string;
  reps?: string;
};

function parseTimeSeconds(time: string): number | null {
  const trimmed = (time ?? '').trim();
  if (!trimmed) return null;
  const colonMatch = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) return Number(colonMatch[1]) * 60 + Number(colonMatch[2]);
  const asNumber = Number(trimmed);
  return Number.isNaN(asNumber) ? null : asNumber;
}

function parseRoundsReps(rounds: string, reps: string | undefined): number | null {
  const trimmedRounds = (rounds ?? '').trim();
  if (!trimmedRounds) return null;
  const roundsNum = Number(trimmedRounds);
  if (Number.isNaN(roundsNum)) return null;
  const repsNum = Number((reps ?? '').trim());
  return roundsNum * 1000 + (Number.isNaN(repsNum) ? 0 : repsNum);
}

export type PbCheckResult = { isPb: boolean; reason?: 'time' | 'rounds' };

export function checkPersonalBest(newScore: ScoreSnapshot, history: ScoreSnapshot[]): PbCheckResult {
  try {
    const newTime = parseTimeSeconds(newScore.time);
    const newRounds = parseRoundsReps(newScore.rounds, newScore.reps);

    const priorTimes = history
      .map((h) => parseTimeSeconds(h.time))
      .filter((v): v is number => v !== null);
    if (newTime !== null && priorTimes.length > 0 && newTime < Math.min(...priorTimes)) {
      return { isPb: true, reason: 'time' };
    }

    const priorRounds = history
      .map((h) => parseRoundsReps(h.rounds, h.reps))
      .filter((v): v is number => v !== null);
    if (newRounds !== null && priorRounds.length > 0 && newRounds > Math.max(...priorRounds)) {
      return { isPb: true, reason: 'rounds' };
    }

    return { isPb: false };
  } catch {
    return { isPb: false };
  }
}
