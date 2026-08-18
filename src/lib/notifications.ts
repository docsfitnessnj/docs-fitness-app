// Booking/cancellation notifications — structured now, wired to a real email
// provider during the backend round. For now this just logs what WOULD be
// sent; ClassSignUpContext records the same event so the admin roster can
// show it and the flow is testable end to end.
export type BookingNotificationEvent = {
  type: 'booked' | 'cancelled';
  memberName: string;
  planType: string;
  className: string;
  classType: string;
  dayLabel: string;
  time: string;
  locationName: string;
};

export function sendBookingNotifications(event: BookingNotificationEvent): { memberEmailSent: boolean; docEmailSent: boolean } {
  const verb = event.type === 'booked' ? 'Booking confirmation' : 'Cancellation notice';
  // TODO(backend round): replace these console logs with real email sends —
  // one to the member, one to Doc — using the same event payload.
  console.log(
    `[email-stub] ${verb} -> member: ${event.memberName} — ${event.className} (${event.dayLabel} ${event.time}) @ ${event.locationName}`
  );
  console.log(`[email-stub] ${verb} -> doc: ${event.memberName} (${event.planType}) ${event.type} ${event.className}`);
  return { memberEmailSent: true, docEmailSent: true };
}
