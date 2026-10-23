import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppPressable } from '../components/AppPressable';
import { ModalHeader } from '../components/ModalHeader';
import { SaveConfirmation } from '../components/SaveConfirmation';
import { useClassBookingData } from '../context/ClassBookingContext';
import { useSaveConfirmation } from '../lib/useSaveConfirmation';
import { supabase } from '../lib/supabaseClient';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

// The templates Doc can bump a default cap on — Pilates is deliberately
// excluded, it has no cap at all ("DOWNBEACH PILATES WITH MARINA... has NO
// cap and deliberately shows no spots count or attendance number anywhere
// member facing").
const CAPACITY_TEMPLATES: { classKey: string; label: string }[] = [
  { classKey: 'mwf-530a', label: 'DAWN PATROL · MON/WED/FRI 5:30 AM' },
  { classKey: 'mwf-930a', label: 'YAWN PATROL · MON/WED/FRI 9:30 AM' },
  { classKey: 'tth-930a', label: 'YAWN PATROL · TUE/THU 9:30 AM' },
  { classKey: 'sat-815a', label: 'SAVAGE SATURDAY · SAT 8:15 AM' },
];

const ROSTER_DAYS_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;

type RosterRow = {
  booking_id: string;
  user_id: string;
  display_name: string;
  payment_method: string;
  booked_at: string;
  is_first_class: boolean;
};

function paymentMethodLabel(method: string): string {
  switch (method) {
    case 'unlimited':
      return 'MONTHLY UNLIMITED';
    case 'pack_credit':
      return '10 CLASS PACK';
    case 'drop_in_paid':
      return 'DROP IN';
    case 'pilates_paid':
      return 'PILATES';
    case 'first_class_free':
      return 'FIRST CLASS';
    default:
      return method.toUpperCase();
  }
}

function ClassRosterCard({ sessionId, label, dateLabel, capacity, bookedCount }: {
  sessionId: string;
  label: string;
  dateLabel: string;
  capacity: number | null;
  bookedCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [roster, setRoster] = useState<RosterRow[] | null>(null);

  useEffect(() => {
    if (!expanded || roster !== null) return;
    supabase
      .rpc('admin_class_roster', { p_session_id: sessionId })
      .then(({ data }) => setRoster((data as RosterRow[] | null) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  return (
    <AppPressable style={styles.classCard} onPress={() => setExpanded((v) => !v)} testID={`roster-class-${sessionId}`}>
      <View style={styles.classHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.classDate}>{dateLabel.toUpperCase()}</Text>
          <Text style={styles.className}>{label}</Text>
        </View>
        <View style={styles.headcountBadge}>
          <Ionicons name="people" size={13} color={colors.white} />
          <Text style={styles.headcountText} testID={`roster-headcount-${sessionId}`}>
            {capacity !== null ? `${bookedCount}/${capacity}` : bookedCount}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} style={{ marginLeft: 8 }} />
      </View>

      {expanded && (
        <View style={styles.expandedBody}>
          {roster === null ? (
            <Text style={styles.noBookers}>Loading...</Text>
          ) : roster.length === 0 ? (
            <Text style={styles.noBookers}>No one booked yet.</Text>
          ) : (
            roster.map((r) => (
              <View key={r.booking_id} style={styles.bookerRow}>
                <Text style={styles.bookerName}>{r.display_name}</Text>
                <View style={styles.bookerBadges}>
                  {r.is_first_class && (
                    <View style={styles.firstClassBadge} testID={`first-class-tag-${r.display_name}`}>
                      <Text style={styles.firstClassBadgeText}>FIRST CLASS</Text>
                    </View>
                  )}
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>{paymentMethodLabel(r.payment_method)}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      )}
    </AppPressable>
  );
}

function CapacityRow({ classKey, label }: { classKey: string; label: string }) {
  const { sessions, refetch } = useClassBookingData();
  const confirm = useSaveConfirmation();
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    if (value !== null) return;
    const session = sessions.find((s) => s.classKey === classKey);
    if (session) setValue(String(session.capacity ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  const save = async () => {
    const raw = (value ?? '').trim();
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      confirm.fail('Enter a whole number greater than 0.');
      return;
    }
    confirm.start();
    const { error } = await supabase.rpc('admin_update_template_capacity', { p_class_key: classKey, p_capacity: parsed });
    if (error) {
      confirm.fail(error.message);
    } else {
      // admin_update_template_capacity cascades to every not-yet-happened
      // session of this class_key server-side, but nothing about calling
      // it refetches ClassBookingContext's own session state on its own —
      // without this, the roster headcount badges just below keep showing
      // the OLD capacity until something else happens to refetch.
      await refetch();
      confirm.succeed();
    }
  };

  return (
    <View style={styles.capacityRow}>
      <Text style={styles.capacityLabel}>{label}</Text>
      <View style={styles.capacityControls}>
        <TextInput
          value={value ?? ''}
          onChangeText={(v) => setValue(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          style={styles.capacityInput}
          nativeID={`class-capacity-${classKey}`}
          aria-label={`Default capacity for ${label}`}
          testID={`class-capacity-input-${classKey}`}
        />
        <AppPressable style={styles.capacitySaveButton} onPress={save} testID={`class-capacity-save-${classKey}`}>
          <Text style={styles.capacitySaveButtonText}>SAVE</Text>
        </AppPressable>
      </View>
      <View style={styles.saveConfirmWrap}>
        <SaveConfirmation state={confirm.state} errorMessage={confirm.errorMessage} />
      </View>
    </View>
  );
}

function CapacityEditor() {
  return (
    <View>
      {CAPACITY_TEMPLATES.map((t) => (
        <CapacityRow key={t.classKey} classKey={t.classKey} label={t.label} />
      ))}
    </View>
  );
}

function PilatesRevenueCard() {
  const [summary, setSummary] = useState<{ bookings_count: number; gross_revenue_cents: number } | null>(null);
  const now = new Date();

  useEffect(() => {
    supabase
      .rpc('admin_pilates_month_summary', { p_year: now.getFullYear(), p_month: now.getMonth() + 1 })
      .then(({ data }) => {
        const row = (data as { bookings_count: number; gross_revenue_cents: number }[] | null)?.[0];
        setSummary(row ?? { bookings_count: 0, gross_revenue_cents: 0 });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();

  return (
    <View style={styles.statRow}>
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>BOOKINGS THIS MONTH</Text>
        <Text style={styles.statValue} testID="pilates-bookings-count">
          {summary ? summary.bookings_count : '—'}
        </Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>GROSS REVENUE</Text>
        <Text style={styles.statValue} testID="pilates-gross-revenue">
          {summary ? `$${(summary.gross_revenue_cents / 100).toFixed(2)}` : '—'}
        </Text>
      </View>
      <Text style={styles.monthLabel}>{monthLabel}</Text>
    </View>
  );
}

export function AdminRosterScreen({ visible, onClose }: Props) {
  const { sessions, loading } = useClassBookingData();

  if (!visible) return null;

  const now = Date.now();
  const upcoming = sessions
    .filter((s) => s.startAt >= now - 60 * 60 * 1000 && s.startAt <= now + ROSTER_DAYS_AHEAD_MS)
    .sort((a, b) => a.startAt - b.startAt);

  return (
    <View style={styles.container}>
      <ModalHeader title="CLASS ROSTER" onBack={onClose} backTestID="close-admin-roster" />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionHeading}>DOWNBEACH PILATES</Text>
        <PilatesRevenueCard />

        <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>CLASS CAPACITY</Text>
        <CapacityEditor />

        <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>UPCOMING CLASSES</Text>
        {loading ? (
          <Text style={styles.noBookers}>Loading...</Text>
        ) : upcoming.length === 0 ? (
          <Text style={styles.noBookers}>No classes scheduled in the next 7 days.</Text>
        ) : (
          upcoming.map((session) => (
            <ClassRosterCard
              key={session.id}
              sessionId={session.id}
              label={`${new Date(session.startAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} · ${session.className} · ${session.classType}`}
              dateLabel={new Date(session.startAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              capacity={session.capacity}
              bookedCount={session.bookedCount}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // No paddingTop here -- ScreenOverlay's own fill (topBasePadding={60})
  // provides it as a single additive source with the real top inset. See
  // AGENTS.md's "Web safe-area insets always report zero" writeup.
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionHeading: {
    color: colors.green,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 1,
    marginBottom: 12,
  },
  sectionHeadingSpaced: {
    marginTop: 24,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  statCard: {
    flex: 1,
    minWidth: 120,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    padding: 14,
  },
  statLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  statValue: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 22,
  },
  monthLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  capacityRow: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  capacityLabel: {
    color: colors.text,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  capacityControls: {
    flexDirection: 'row',
    gap: 10,
  },
  capacityInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
  },
  capacitySaveButton: {
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  capacitySaveButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  saveConfirmWrap: {
    minHeight: 20,
    marginTop: 6,
  },
  classCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  classHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  classDate: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  className: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  headcountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.green,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headcountText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
  },
  expandedBody: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.background,
  },
  noBookers: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  bookerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.background,
  },
  bookerName: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
  bookerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  firstClassBadge: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  firstClassBadgeText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  planBadge: {
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  planBadgeText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
