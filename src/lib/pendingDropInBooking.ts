import { loadJSON, saveJSON } from './storage';

const STORAGE_KEY = 'docsfitness.pendingDropInBooking.v1';

// A Drop In purchase is a full-page redirect to Stripe and back — the
// booking details (which class, which day) have to survive that round trip
// somewhere other than React state. Saved right before the redirect
// (showDropInGate in useClassBooking.ts), read back and cleared the moment
// the webhook confirms the payment (useCheckoutRedirect) — the booking
// itself is only ever finalized then, never optimistically before that.
export type PendingDropInBooking = {
  dateKey: string;
  classId: string;
  className: string;
  classType: string;
  time: string;
  dayLabel: string;
};

export function savePendingDropInBooking(booking: PendingDropInBooking): void {
  saveJSON(STORAGE_KEY, booking);
}

export function loadPendingDropInBooking(): PendingDropInBooking | null {
  return loadJSON<PendingDropInBooking | null>(STORAGE_KEY, null);
}

export function clearPendingDropInBooking(): void {
  saveJSON(STORAGE_KEY, null);
}
