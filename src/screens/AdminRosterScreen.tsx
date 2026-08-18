import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import { useClassSignUp } from '../context/ClassSignUpContext';
import { formatDateKey, formatFullDate, getUpcomingDays } from '../data/content';
import { rowsForDate } from '../data/schedule';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const ROSTER_DAYS_AHEAD = 7;

export function AdminRosterScreen({ visible, onClose }: Props) {
  const { allSignUps, bookingEvents } = useClassSignUp();

  if (!visible) return null;

  const days = getUpcomingDays(ROSTER_DAYS_AHEAD);
  const classInstances = days.flatMap((day) => {
    const dateKey = formatDateKey(day.date);
    return rowsForDate(day.date).map((row) => ({
      dateKey,
      dateLabel: formatFullDate(day.date),
      row,
      bookers: allSignUps.filter((s) => s.dateKey === dateKey && s.classId === row.id),
    }));
  });

  return (
    <View style={styles.container}>
      <ModalHeader title="CLASS ROSTER" onBack={onClose} backTestID="close-admin-roster" />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionHeading}>UPCOMING CLASSES</Text>
        {classInstances.map(({ dateKey, dateLabel, row, bookers }) => (
          <View key={`${dateKey}-${row.id}`} style={styles.classCard} testID={`roster-class-${dateKey}-${row.id}`}>
            <View style={styles.classHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.classDate}>{dateLabel.toUpperCase()}</Text>
                <Text style={styles.className}>
                  {row.time} · {row.className}
                </Text>
                <Text style={styles.classType}>{row.classType}</Text>
              </View>
              <View style={styles.headcountBadge}>
                <Ionicons name="people" size={13} color={colors.white} />
                <Text style={styles.headcountText}>{bookers.length}</Text>
              </View>
            </View>

            {bookers.length === 0 ? (
              <Text style={styles.noBookers}>No one booked yet.</Text>
            ) : (
              bookers.map((booker) => (
                <View key={`${booker.dateKey}-${booker.classId}-${booker.memberName}`} style={styles.bookerRow}>
                  <Text style={styles.bookerName}>{booker.memberName}</Text>
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>{booker.planType.toUpperCase()}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        ))}

        <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>RECENT ACTIVITY</Text>
        {bookingEvents.length === 0 ? (
          <Text style={styles.noBookers}>No booking activity yet.</Text>
        ) : (
          bookingEvents.slice(0, 30).map((event) => (
            <View key={event.id} style={styles.eventRow} testID={`roster-event-${event.id}`}>
              <Ionicons
                name={event.type === 'booked' ? 'checkmark-circle' : 'close-circle'}
                size={16}
                color={event.type === 'booked' ? colors.green : colors.scoreboardRed}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.eventText}>
                  {event.memberName} ({event.planType}) {event.type} {event.className} — {event.dayLabel} {event.time}
                </Text>
                <Text style={styles.eventMeta}>
                  {event.memberEmailSent ? 'Member confirmation sent' : 'Member confirmation pending'} ·{' '}
                  {event.docEmailSent ? 'Doc notified' : 'Doc notification pending'}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
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
    marginBottom: 8,
  },
  classDate: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  className: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    marginTop: 2,
  },
  classType: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 1,
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
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  eventText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  eventMeta: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 11,
    marginTop: 2,
  },
});
