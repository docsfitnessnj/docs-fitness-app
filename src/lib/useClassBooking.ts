import { useClassSignUp } from '../context/ClassSignUpContext';
import { planLabel, useMembership } from '../context/MembershipContext';
import { useDisplayName } from '../context/ProfileContext';
import { ClassRow } from '../data/schedule';
import { showAlert } from './alert';

// Tiers that book a class instantly, no payment gate — Doc's own account
// and the unlimited in-person plan.
const INSTANT_BOOK_TIERS = ['admin', 'in_person_unlimited'];
// Tiers that see the "want unlimited classes?" upsell line inside the $30
// drop-in paywall — online-only members who don't already have an
// in-person plan.
const ONLINE_ONLY_TIERS = ['trial', 'online_paid', 'online_free'];
const DROP_IN_PRICE = 30;

// The single class sign-up flow, shared by DayPanel (the Community date
// strip) and the desktop identity sidebar's NEXT CLASS module, so both
// entry points apply the exact same tier gating (instant book, 10 Class
// Pack, first-class-free, $30 drop-in) instead of drifting apart.
export function useClassBooking() {
  const { isSignedUp, signUp, cancelSignUp } = useClassSignUp();
  const membership = useMembership();
  const displayName = useDisplayName();

  const bookClass = (row: ClassRow, dateKey: string, weekdayName: string, opts?: { firstClass?: boolean }) => {
    signUp({
      dateKey,
      classId: row.id,
      className: row.className,
      classType: row.classType,
      time: row.time,
      dayLabel: weekdayName,
      memberName: displayName,
      planType: planLabel(membership.tier),
      firstClass: !!opts?.firstClass,
    });
  };

  const showDropInGate = (row: ClassRow, dateKey: string, weekdayName: string) => {
    const upsell = ONLINE_ONLY_TIERS.includes(membership.tier)
      ? '\n\nWant unlimited classes? See Monthly Unlimited in Memberships.'
      : '';
    showAlert(`Class Drop In Is $${DROP_IN_PRICE}`, `${row.className} · ${weekdayName} · ${row.time}${upsell}`, [
      { text: 'Not Now', style: 'cancel' },
      {
        text: `Pay $${DROP_IN_PRICE} and Book`,
        onPress: () => {
          bookClass(row, dateKey, weekdayName);
          showAlert("YOU'RE IN", `Payment simulated — ${row.className} · ${weekdayName} · ${row.time}`);
        },
      },
    ]);
  };

  const handleSignUp = (row: ClassRow, dateKey: string, weekdayName: string) => {
    if (INSTANT_BOOK_TIERS.includes(membership.tier)) {
      bookClass(row, dateKey, weekdayName);
      showAlert("YOU'RE IN", `${row.className} · ${weekdayName} · ${row.time}`);
      return;
    }

    if (membership.tier === 'ten_pack') {
      const remaining = membership.tenPackClassesRemaining ?? 0;
      if (remaining <= 0) {
        showAlert('No Classes Left', 'Your 10 Class Pack is used up. Grab a new pack or switch plans in Memberships.');
        return;
      }
      bookClass(row, dateKey, weekdayName);
      membership.useTenPackClass();
      showAlert("YOU'RE IN", `${row.className} · ${weekdayName} · ${row.time}\n${remaining - 1} classes left`);
      return;
    }

    // Everyone left over here is about to hit the $30 drop-in gate — ask,
    // casually, whether they've trained at Doc's before so first-timers can
    // book free instead. Only offered once per account.
    if (!membership.firstClassUsed) {
      showAlert("Have You Trained at Doc's Fitness Before?", undefined, [
        {
          text: 'FIRST TIME HERE',
          onPress: () => {
            membership.useFirstClass();
            bookClass(row, dateKey, weekdayName, { firstClass: true });
            showAlert('Your First Class Is On Us', `You're in — ${row.className} · ${weekdayName} · ${row.time}.`);
          },
        },
        {
          text: "I'VE BEEN BEFORE",
          onPress: () => showDropInGate(row, dateKey, weekdayName),
        },
      ]);
      return;
    }

    showDropInGate(row, dateKey, weekdayName);
  };

  const handleCancel = (row: ClassRow, dateKey: string, weekdayName: string) => {
    showAlert('Cancel This Class?', `${row.className} · ${weekdayName} · ${row.time}`, [
      { text: 'Keep My Spot', style: 'cancel' },
      {
        text: 'Cancel Class',
        style: 'destructive',
        onPress: () => {
          cancelSignUp(dateKey, row.id);
          if (membership.tier === 'ten_pack') membership.refundTenPackClass();
        },
      },
    ]);
  };

  return { isSignedUp, handleSignUp, handleCancel };
}
