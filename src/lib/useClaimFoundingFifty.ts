import { useBadges } from '../context/BadgeContext';
import { useMembership } from '../context/MembershipContext';
import { useFoundingFifty } from '../context/FoundingFiftyContext';
import { useDisplayName } from '../context/ProfileContext';

// Claiming a Founding 50 spot touches three contexts at once — the spot
// itself (capacity), the membership tier (locked-in rate, full access), and
// the permanent badge — so this is the one place that orchestrates all
// three instead of leaving call sites to remember the right order.
export function useClaimFoundingFifty() {
  const { becomeFoundingFifty, email } = useMembership();
  const founding50 = useFoundingFifty();
  const badges = useBadges();
  const displayName = useDisplayName();

  return (): boolean => {
    const claimed = founding50.claim(displayName, email);
    if (!claimed) return false;
    becomeFoundingFifty();
    badges.grantFoundingFifty(displayName);
    return true;
  };
}
