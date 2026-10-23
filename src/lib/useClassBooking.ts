import { ClassSession, useClassBookingData } from '../context/ClassBookingContext';
import { useClassPack } from '../context/ClassPackContext';
import { planLabel, useMembership } from '../context/MembershipContext';
import { showAlert } from './alert';
import { startInPersonCheckout } from './stripeCheckout';

// Tiers that book a class instantly, no payment gate — Doc's own account
// and the unlimited in-person plan. Never applies to a guest class (see
// handleSignUp below) — Downbeach Pilates has no instant-book path at all,
// "EVERYONE pays $20 to book it, including Monthly Unlimited members."
const INSTANT_BOOK_TIERS = ['admin', 'in_person_unlimited'];
// Tiers that see the "want unlimited classes?" upsell line inside the $25
// drop-in paywall — online-only members who don't already have an
// in-person plan.
const ONLINE_ONLY_TIERS = ['trial', 'online_paid', 'online_free'];
const DROP_IN_PRICE = 25;

// The single class sign-up flow, shared by DayPanel (the Community date
// strip) and the desktop identity sidebar's NEXT CLASS module, so both
// entry points apply the exact same tier gating (instant book, 10 Class
// Pack, first-class-free, $25 drop-in, or — for Pilates specifically — a
// universal $20 paid gate with none of the other four) instead of drifting
// apart. Real, server-backed booking as of migration_023: every decision
// here still only picks WHICH payment_method to hand to book_class(), the
// server re-validates every one of them (see book_class's own eligibility
// checks) and enforces capacity atomically — nothing here is trusted on
// its own.
export function useClassBooking() {
  const booking = useClassBookingData();
  const membership = useMembership();
  const classPack = useClassPack();

  const hasUsedFirstClass = booking.sessions.some(
    (s) => booking.getMyBooking(s.id)?.paymentMethod === 'first_class_free'
  );

  const isSignedUp = (classKey: string, dateKey: string): boolean => {
    const session = booking.getSession(classKey, dateKey);
    return !!session && !!booking.getMyBooking(session.id);
  };

  const getWaitlistEntry = (classKey: string, dateKey: string) => {
    const session = booking.getSession(classKey, dateKey);
    return session ? booking.getMyWaitlistEntry(session.id) : undefined;
  };

  const isFull = (session: ClassSession): boolean =>
    session.capacity !== null && session.bookedCount >= session.capacity;

  const offerWaitlist = (session: ClassSession, label: string, paymentMethod: 'unlimited' | 'pack_credit') => {
    showAlert('Class Full', `${label} is full right now.`, [
      { text: 'Not Now', style: 'cancel' },
      {
        text: 'JOIN WAITLIST',
        onPress: async () => {
          const result = await booking.joinWaitlist(session.id, paymentMethod);
          if (result.ok) {
            showAlert("You're On The Waitlist", "We'll book you in automatically the moment a spot opens up.");
          } else {
            showAlert("Couldn't Join Waitlist", result.message);
          }
        },
      },
    ]);
  };

  const startPaidBooking = async (session: ClassSession, label: string, plan: 'drop_in' | 'pilates_guest') => {
    const price = plan === 'pilates_guest' ? (session.priceCents ?? 2000) / 100 : DROP_IN_PRICE;
    const upsell =
      plan === 'drop_in' && ONLINE_ONLY_TIERS.includes(membership.tier)
        ? '\n\nWant unlimited classes? See Monthly Unlimited in Memberships.'
        : '';
    const title = plan === 'pilates_guest' ? `Downbeach Pilates is $${price}` : `Class drop in is $${price}`;
    showAlert(title, `${label}${upsell}`, [
      { text: 'Not Now', style: 'cancel' },
      {
        text: `PAY $${price} AND BOOK`,
        onPress: async () => {
          const { error } = await startInPersonCheckout(plan, { classSessionId: session.id });
          if (error) {
            showAlert("Couldn't Start Checkout", error);
          }
          // No local booking write here — the webhook creates the real
          // booking (payment_method 'drop_in_paid'/'pilates_paid') the
          // instant Stripe confirms payment, never the browser's own
          // return trip. See useCheckoutRedirect, which just refetches
          // booking state once that confirmation lands.
        },
      },
    ]);
  };

  const handleSignUp = (session: ClassSession, label: string) => {
    // Downbeach Pilates: universal paid gate, no other path at all.
    if (session.isGuestClass) {
      if (isFull(session)) {
        showAlert('Class Full', `${label} is full right now.`);
        return;
      }
      startPaidBooking(session, label, 'pilates_guest');
      return;
    }

    if (INSTANT_BOOK_TIERS.includes(membership.tier)) {
      booking.book(session.id, 'unlimited').then((result) => {
        if (result.ok) {
          showAlert("YOU'RE IN", label);
        } else if (result.code === 'CLASS_FULL') {
          offerWaitlist(session, label, 'unlimited');
        } else {
          showAlert("Couldn't Book That Class", result.message);
        }
      });
      return;
    }

    // A class pack is an ADDITION on top of whatever plan (or no plan) the
    // account already has — this must key off hasActivePack, never
    // `tier === 'ten_pack'`, or an online member who also bought a pack
    // would fall straight through to the $25 drop-in gate below and be
    // charged again for a class their pack already covers.
    if (membership.hasActivePack) {
      const remaining = membership.tenPackClassesRemaining ?? 0;
      if (remaining <= 0) {
        showAlert('No Classes Left', 'Your 10 Class Pack is used up. Grab a new pack or switch plans in Memberships.');
        return;
      }
      booking.book(session.id, 'pack_credit').then((result) => {
        if (result.ok) {
          // book_class spends the credit server-side (use_class_pack_credit)
          // — ClassPackContext has no way to learn that on its own, so this
          // is what keeps "X OF 10 CLASSES LEFT" from reading stale.
          classPack.refetch();
          showAlert("YOU'RE IN", `${label}\n${remaining - 1} classes left`);
        } else if (result.code === 'CLASS_FULL') {
          offerWaitlist(session, label, 'pack_credit');
        } else {
          showAlert("Couldn't Book That Class", result.message);
        }
      });
      return;
    }

    // Everyone left over here is about to hit the $25 drop-in gate — ask,
    // casually, whether they've trained at Doc's before so first-timers can
    // book free instead. Only offered once per account — hasUsedFirstClass
    // is now derived from the real class_bookings table (any booking ever
    // made with payment_method 'first_class_free'), not a local device flag.
    if (!hasUsedFirstClass) {
      showAlert("Have You Trained at Doc's Fitness Before?", undefined, [
        {
          text: 'FIRST TIME HERE',
          onPress: async () => {
            const result = await booking.book(session.id, 'first_class_free');
            if (result.ok) {
              showAlert('Your First Class Is On Us', `You're in — ${label}.`);
            } else if (result.code === 'CLASS_FULL') {
              showAlert('Class Full', `${label} is full right now — try a different class, your free first class is still waiting.`);
            } else {
              showAlert("Couldn't Book That Class", result.message);
            }
          },
        },
        {
          text: "I'VE BEEN BEFORE",
          onPress: () => startPaidBooking(session, label, 'drop_in'),
        },
      ]);
      return;
    }

    startPaidBooking(session, label, 'drop_in');
  };

  const handleCancel = (session: ClassSession, label: string) => {
    const myBooking = booking.getMyBooking(session.id);
    if (!myBooking) return;
    showAlert('Cancel This Class?', label, [
      { text: 'Keep My Spot', style: 'cancel' },
      {
        text: 'Cancel Class',
        style: 'destructive',
        onPress: async () => {
          const wasPackCredit = myBooking.paymentMethod === 'pack_credit';
          const result = await booking.cancel(myBooking.id);
          if (!result.ok) {
            showAlert("Couldn't Cancel", result.message);
          } else if (wasPackCredit) {
            // cancel_class_booking refunds the credit server-side — same
            // staleness concern as the pack_credit booking path above.
            classPack.refetch();
          }
        },
      },
    ]);
  };

  return {
    isSignedUp,
    getWaitlistEntry,
    isFull,
    handleSignUp,
    handleCancel,
    planLabelFor: () => planLabel(membership.tier),
  };
}
