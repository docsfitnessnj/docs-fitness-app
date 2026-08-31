import { useEffect } from 'react';
import { loadJSON, saveJSON } from './storage';
import { showAlert } from './alert';
import { openMemberships } from './membershipsModal';

const STORAGE_KEY = 'docsfitness.lastUpgradeNudgeAt.v1';
const MIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// One gentle popup a week, max, for free-tier accounts — never on every open,
// never blocking anything else in the app.
export function useWeeklyUpgradeNudge(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const lastShownAt = loadJSON<number | null>(STORAGE_KEY, null);
    if (lastShownAt !== null && Date.now() - lastShownAt < MIN_INTERVAL_MS) return;

    saveJSON(STORAGE_KEY, Date.now());
    showAlert(
      'Unlock Everything',
      "You're on the free plan — 2 of 5 weekly WODs, no COWS, no Deck. Upgrade any time for full access.",
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'See Plans', onPress: () => openMemberships('unlock') },
      ]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
