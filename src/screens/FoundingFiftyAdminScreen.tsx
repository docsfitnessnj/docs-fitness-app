import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ModalHeader } from '../components/ModalHeader';
import { FOUNDING_FIFTY_PRICE, useFoundingFifty } from '../context/FoundingFiftyContext';
import { getEasternParts } from '../lib/challengeSchedule';
import { showAlert } from '../lib/alert';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function formatJoinDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Renders a stored UTC instant back as the Eastern-time date/time strings
// the admin fields show — null shows both fields empty.
function etDateStrOf(ms: number | null): string {
  if (ms === null) return '';
  const p = getEasternParts(new Date(ms));
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}
function etTimeStrOf(ms: number | null): string {
  if (ms === null) return '';
  const p = getEasternParts(new Date(ms));
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

// Parses the admin's typed "YYYY-MM-DD" + "HH:MM" back into the wall-clock
// parts setWindow needs — null (rather than throwing) for anything that
// doesn't parse, so the caller can show one plain error instead of a crash.
function parseEtParts(
  dateStr: string,
  timeStr: string
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const dateMatch = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;
  const [, y, mo, d] = dateMatch;
  const [, h, mi] = timeMatch;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

function Toggle({ on }: { on: boolean }) {
  return (
    <View style={[styles.track, on && styles.trackOn]}>
      <View style={[styles.thumb, on && styles.thumbOn]} />
    </View>
  );
}

// Doc's launch-window control: set exactly when THE FOUNDING 50 opens and
// closes (Eastern Time), watch the real spot count live, and see exactly
// who's in it. The offer is only ever live between those two instants, and
// stops early the moment all 50 spots are claimed — whichever comes first.
export function FoundingFiftyAdminScreen({ visible, onClose }: Props) {
  const founding50 = useFoundingFifty();
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset the draft fields to the saved window every time the screen opens.
  useEffect(() => {
    if (visible) {
      setStartDate(etDateStrOf(founding50.startsAt));
      setStartTime(etTimeStrOf(founding50.startsAt));
      setEndDate(etDateStrOf(founding50.endsAt));
      setEndTime(etTimeStrOf(founding50.endsAt));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, founding50.startsAt, founding50.endsAt]);

  if (!visible) return null;

  const members = [...founding50.members].sort((a, b) => b.joinedAt - a.joinedAt);

  const statusLabel = founding50.soldOut
    ? 'SOLD OUT — all 50 spots claimed'
    : founding50.isLive
      ? 'LIVE NOW'
      : founding50.startsAt === null || founding50.endsAt === null
        ? 'NOT SET — no launch window scheduled'
        : Date.now() < founding50.startsAt
          ? 'SCHEDULED — hasn’t started yet'
          : 'ENDED';

  const saveWindow = async () => {
    // Both fields empty on either side clears the window entirely.
    const clearing = !startDate.trim() && !startTime.trim() && !endDate.trim() && !endTime.trim();
    if (clearing) {
      setSaving(true);
      const result = await founding50.setWindow(null, null);
      setSaving(false);
      if (result.error) showAlert("Couldn't Save", result.error);
      return;
    }

    const start = parseEtParts(startDate, startTime);
    const end = parseEtParts(endDate, endTime);
    if (!start || !end) {
      showAlert('Check The Dates', 'Enter both a start and an end as YYYY-MM-DD and HH:MM (24-hour), Eastern Time — or leave all four fields blank to turn the window off.');
      return;
    }

    setSaving(true);
    const result = await founding50.setWindow(start, end);
    setSaving(false);
    if (result.error) showAlert("Couldn't Save", result.error);
  };

  return (
    <View style={styles.container}>
      <ModalHeader title="FOUNDING 50 LAUNCH" onBack={onClose} backTestID="close-founding-fifty-admin" />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.statusRow} testID="founding-fifty-status">
          <Toggle on={founding50.isLive} />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>

        <Text style={styles.sectionHeading}>LAUNCH WINDOW (EASTERN TIME)</Text>
        <Text style={styles.sectionSubtext}>
          THE FOUNDING 50 is only offered between these two instants — it also ends early the moment all 50 spots are
          claimed, whichever comes first.
        </Text>

        <Text style={styles.label}>START DATE</Text>
        <TextInput
          style={styles.input}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          nativeID="founding-fifty-start-date"
          aria-label="Launch window start date, Eastern Time"
        />
        <Text style={styles.label}>START TIME</Text>
        <TextInput
          style={styles.input}
          value={startTime}
          onChangeText={setStartTime}
          placeholder="HH:MM (24-hour)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          nativeID="founding-fifty-start-time"
          aria-label="Launch window start time, Eastern Time"
        />
        <Text style={styles.label}>END DATE</Text>
        <TextInput
          style={styles.input}
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          nativeID="founding-fifty-end-date"
          aria-label="Launch window end date, Eastern Time"
        />
        <Text style={styles.label}>END TIME</Text>
        <TextInput
          style={styles.input}
          value={endTime}
          onChangeText={setEndTime}
          placeholder="HH:MM (24-hour)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          nativeID="founding-fifty-end-time"
          aria-label="Launch window end time, Eastern Time"
        />

        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          disabled={saving}
          onPress={saveWindow}
          testID="save-founding-fifty-window"
        >
          <Text style={styles.saveButtonText}>{saving ? 'SAVING…' : 'SAVE LAUNCH WINDOW'}</Text>
        </Pressable>

        <View style={styles.statRow}>
          <View style={styles.statCard} testID="founding-fifty-claimed-count">
            <Text style={styles.statValue}>{founding50.claimedCount}</Text>
            <Text style={styles.statLabel}>CLAIMED</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{founding50.spotsRemaining}</Text>
            <Text style={styles.statLabel}>SPOTS LEFT</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>${FOUNDING_FIFTY_PRICE}</Text>
            <Text style={styles.statLabel}>LOCKED RATE</Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>MEMBERS ({members.length})</Text>
        {members.length === 0 ? (
          <Text style={styles.emptyText}>No one has claimed a spot yet.</Text>
        ) : (
          members.map((m) => (
            <View key={`${m.name}-${m.joinedAt}`} style={styles.memberRow} testID={`founding-fifty-member-${m.name}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.name}</Text>
                <Text style={styles.memberMeta}>JOINED {formatJoinDate(m.joinedAt)}</Text>
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  statusText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.hairline,
    padding: 3,
    justifyContent: 'center',
  },
  trackOn: {
    backgroundColor: colors.green,
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  thumbOn: {
    alignSelf: 'flex-end',
  },
  sectionHeading: {
    color: colors.green,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 1,
    marginBottom: 8,
  },
  sectionSubtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    marginBottom: 14,
  },
  saveButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 26,
    letterSpacing: 0.5,
  },
  statLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 2,
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  memberName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  memberMeta: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 2,
  },
});
