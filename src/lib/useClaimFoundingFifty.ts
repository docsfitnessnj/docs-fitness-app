import { useBadges } from '../context/BadgeContext';
import { useMembership } from '../context/MembershipContext';
import { useFoundingFifty } from '../context/FoundingFiftyContext';
import { useDisplayName } from '../context/ProfileContext';

// Claiming a Founding 50 spot touches three contexts at once — the spot
// itself (a real database row), the membership tier (locked-in rate, full
// access), and the permanent badge — so this is the one place that
// orchestrates all three instead of leaving call sites to remember the
// right order. Async now that the spot itself is a real, shared database
// write rather than instant local state — it can genuinely fail (sold out,
// already claimed, network).
export function useClaimFoundingFifty() {
  const { becomeFoundingFifty } = useMembership();
  const founding50 = useFoundingFifty();
  const badges = useBadges();
  const displayName = useDisplayName();

  return async (): Promise<boolean> => {
    const claimed = await founding50.claim();
    if (!claimed) return false;
    becomeFoundingFifty();
    badges.grantFoundingFifty(displayName);
    return true;
  };
}
