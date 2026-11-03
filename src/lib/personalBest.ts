// Round 44: PB detection. Compares a freshly logged score against a
// member's own prior history for THE SAME workout (same WOD title, same
// deck card id, or same COW challenge title -- identity is entirely the
// caller's job; this module only ever compares scores, never decides what
// "the same workout" means).
//
// A PB is earned independently on any one of three axes, matching the
// brief's own wording exactly:
//  - a faster time than every parseable prior time
//  - more rounds(+reps) than every parseable prior rounds(+reps) value
//  - a heavier bell, logged at a score at least as good as whatever prior
//    entry it's being compared against (so a heavier bell alone, at a far
//    worse score, never counts)
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
  kettlebell: string;
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

// First parseable number in free text -- "24kg" -> 24, "2x24" -> 24,
// "16/20" -> 16. A representative weight, not a total; consistent with
// every other kettlebell field in this app being free text, not a number.
function parseWeight(kettlebell: string): number | null {
  const match = (kettlebell ?? '').match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export type PbCheckResult = { isPb: boolean; reason?: 'time' | 'rounds' | 'weight' };

export function checkPersonalBest(newScore: ScoreSnapshot, history: ScoreSnapshot[]): PbCheckResult {
  try {
    const newTime = parseTimeSeconds(newScore.time);
    const newRounds = parseRoundsReps(newScore.rounds, newScore.reps);
    const newWeight = parseWeight(newScore.kettlebell);

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

    if (newWeight !== null) {
      // Only weigh this new entry against prior entries whose own score
      // this new entry matched or beat -- "heavier bell AT THE SAME OR
      // BETTER SCORE," never heavier alone.
      const qualifyingPriorWeights = history
        .filter((h) => {
          const priorTime = parseTimeSeconds(h.time);
          const priorRoundsVal = parseRoundsReps(h.rounds, h.reps);
          if (newTime !== null && priorTime !== null) return newTime <= priorTime;
          if (newRounds !== null && priorRoundsVal !== null) return newRounds >= priorRoundsVal;
          // Neither score axis is comparable between the two entries --
          // weight still counts on its own.
          return true;
        })
        .map((h) => parseWeight(h.kettlebell))
        .filter((v): v is number => v !== null);
      if (qualifyingPriorWeights.length > 0 && newWeight > Math.max(...qualifyingPriorWeights)) {
        return { isPb: true, reason: 'weight' };
      }
    }

    return { isPb: false };
  } catch {
    return { isPb: false };
  }
}
