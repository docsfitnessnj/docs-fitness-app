import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ModalHeader } from '../components/ModalHeader';
import { FOUNDING_FIFTY_PRICE, useFoundingFifty } from '../context/FoundingFiftyContext';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function formatJoinDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

function Toggle({ on }: { on: boolean }) {
  return (
    <View style={[styles.track, on && styles.trackOn]}>
      <View style={[styles.thumb, on && styles.thumbOn]} />
    </View>
  );
}

// Doc's launch-weekend control: flip the tier on/off, watch the spot count
// live, and see exactly who's in it. With the flag off, this screen is the
// only place in the whole app that knows the tier exists.
export function FoundingFiftyAdminScreen({ visible, onClose }: Props) {
  const founding50 = useFoundingFifty();

  if (!visible) return null;

  const members = [...founding50.members].sort((a, b) => b.joinedAt - a.joinedAt);

  return (
    <View style={styles.container}>
      <ModalHeader title="THE FOUNDING 50" onBack={onClose} backTestID="close-founding-fifty-admin" />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Pressable
          style={styles.toggleRow}
          onPress={() => founding50.setEnabled(!founding50.enabled)}
          testID="founding-fifty-flag-toggle"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>TIER ENABLED</Text>
            <Text style={styles.toggleSubtext}>
              {founding50.enabled
                ? 'Live — the card shows on the online plans screen.'
                : 'Off — invisible everywhere in the app.'}
            </Text>
          </View>
          <Toggle on={founding50.enabled} />
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
            <View key={m.name} style={styles.memberRow} testID={`founding-fifty-member-${m.name}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.name}</Text>
                <Text style={styles.memberMeta}>
                  JOINED {formatJoinDate(m.joinedAt)}
                  {m.email ? ` · ${m.email}` : ''}
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  toggleLabel: {
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  toggleSubtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 3,
  },
  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.hairline,
    padding: 3,
    justifyContent: 'center',
    marginLeft: 12,
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
  sectionHeading: {
    color: colors.green,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 1,
    marginBottom: 12,
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
