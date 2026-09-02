import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ModalHeader } from '../components/ModalHeader';
import { MembershipTier, planLabel, useMembership } from '../context/MembershipContext';
import { showAlert } from '../lib/alert';
import { loadJSON, saveJSON } from '../lib/storage';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onOpenMemberships: () => void;
};

type NotificationPrefs = {
  newWod: boolean;
  newChallenge: boolean;
  commentsOnMyPosts: boolean;
  classReminders: boolean;
  trialEnding: boolean;
};

const NOTIFICATIONS_STORAGE_KEY = 'docsfitness.notificationPrefs.v1';
const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  newWod: true,
  newChallenge: true,
  commentsOnMyPosts: true,
  classReminders: true,
  trialEnding: true,
};

const NOTIFICATION_ROWS: { key: keyof NotificationPrefs; label: string; subtext: string }[] = [
  { key: 'newWod', label: 'New WOD Posted', subtext: "Doc's Workout of the Day is up." },
  { key: 'newChallenge', label: 'New Challenge of the Week', subtext: 'A new COW just dropped.' },
  { key: 'commentsOnMyPosts', label: 'Comments On My Posts', subtext: "When someone replies to you." },
  { key: 'classReminders', label: 'Class Reminders', subtext: "Before a class you're signed up for." },
  { key: 'trialEnding', label: 'Trial Ending', subtext: 'A heads up before your trial runs out.' },
];

// Tiers with an actual paid or trial plan to manage. Expired-free accounts
// see a simple "view plans" prompt instead of the full block.
const MANAGEABLE_TIERS: MembershipTier[] = [
  'trial',
  'online_paid',
  'founding_50',
  'in_person_unlimited',
  'ten_pack',
  'drop_in',
];

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function Toggle({ on }: { on: boolean }) {
  return (
    <View style={[styles.track, on && styles.trackOn]}>
      <View style={[styles.thumb, on && styles.thumbOn]} />
    </View>
  );
}

export function SettingsScreen({ visible, onClose, onOpenMemberships }: Props) {
  const membership = useMembership();
  const { newsletterOptIn, setNewsletterOptIn } = membership;
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadJSON(NOTIFICATIONS_STORAGE_KEY, DEFAULT_NOTIFICATION_PREFS));
  const [cancelStage, setCancelStage] = useState<'none' | 'confirmed'>('none');

  useEffect(() => {
    saveJSON(NOTIFICATIONS_STORAGE_KEY, prefs);
  }, [prefs]);

  const togglePref = (key: keyof NotificationPrefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!visible) return null;

  const effectiveDate =
    membership.tier === 'trial' ? membership.trialEndsAt : membership.planRenewsAt;

  const handleCancelRequest = () => {
    const dateLine = effectiveDate ? `You'll keep access until ${formatDate(effectiveDate)}.` : '';
    showAlert('Are You Sure You Want To Cancel?', dateLine, [
      { text: 'KEEP MY MEMBERSHIP', style: 'cancel' },
      {
        text: 'CONFIRM CANCELLATION',
        style: 'destructive',
        onPress: () => {
          membership.requestCancellation();
          setCancelStage('confirmed');
        },
      },
    ]);
  };

  if (cancelStage === 'confirmed') {
    return (
      <View style={styles.container}>
        <ModalHeader title="SETTINGS & NOTIFICATIONS" onBack={onClose} backTestID="close-settings" />
        <View style={styles.cancelConfirmWrap}>
          <Text style={styles.cancelConfirmTitle}>MEMBERSHIP CANCELLATION SCHEDULED</Text>
          <Text style={styles.cancelConfirmBody}>
            {effectiveDate
              ? `You'll keep full access until ${formatDate(effectiveDate)}. After that, your membership won't renew.`
              : "Your membership won't renew after the current period."}
          </Text>
          <Text style={styles.cancelConfirmBody}>
            A confirmation email and a note to Doc are on their way (wired in during the backend round).
          </Text>
          <Pressable
            style={styles.keepButton}
            onPress={() => {
              membership.keepMembership();
              setCancelStage('none');
            }}
            testID="undo-cancellation"
          >
            <Text style={styles.keepButtonText}>ACTUALLY, KEEP MY MEMBERSHIP</Text>
          </Pressable>
          <Pressable style={styles.doneButton} onPress={onClose} testID="cancel-confirm-done">
            <Text style={styles.doneButtonText}>DONE</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ModalHeader title="SETTINGS & NOTIFICATIONS" onBack={onClose} backTestID="close-settings" />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionHeading}>MEMBERSHIP</Text>
        {MANAGEABLE_TIERS.includes(membership.tier) ? (
          <View style={styles.membershipCard}>
            <Text style={styles.planLabel}>CURRENT PLAN</Text>
            <Text style={styles.planValue}>{planLabel(membership.tier)}</Text>

            {membership.tier === 'trial' && membership.trialEndsAt && (
              <Text style={styles.planMeta}>Trial ends {formatDate(membership.trialEndsAt)}</Text>
            )}
            {membership.planRenewsAt && (
              <Text style={styles.planMeta}>
                {membership.cancellationRequested ? 'Access ends' : 'Renews'} {formatDate(membership.planRenewsAt)}
              </Text>
            )}
            {membership.tier === 'ten_pack' && (
              <Text style={styles.planMeta}>{membership.tenPackClassesRemaining ?? 0} classes remaining</Text>
            )}
            {membership.cancellationRequested && (
              <Text style={styles.cancelFlag}>CANCELLATION SCHEDULED</Text>
            )}

            <View style={styles.membershipButtonRow}>
              <Pressable style={styles.changePlanButton} onPress={onOpenMemberships} testID="settings-change-plan">
                <Text style={styles.changePlanButtonText}>CHANGE PLAN</Text>
              </Pressable>
              {!membership.cancellationRequested && membership.tier !== 'drop_in' && (
                <Pressable style={styles.cancelButton} onPress={handleCancelRequest} testID="settings-cancel-membership">
                  <Text style={styles.cancelButtonText}>CANCEL MEMBERSHIP</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.membershipCard}>
            <Text style={styles.planValue}>No Active Plan</Text>
            <Text style={styles.planMeta}>Join to unlock full access to the app.</Text>
            <Pressable style={styles.changePlanButton} onPress={onOpenMemberships} testID="settings-view-plans">
              <Text style={styles.changePlanButtonText}>VIEW PLANS</Text>
            </Pressable>
          </View>
        )}

        <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>NOTIFICATIONS</Text>
        <View style={styles.rowGroup}>
          {NOTIFICATION_ROWS.map((row, i) => (
            <Pressable
              key={row.key}
              style={[styles.row, i === NOTIFICATION_ROWS.length - 1 && styles.rowLast]}
              onPress={() => togglePref(row.key)}
              testID={`notif-toggle-${row.key}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowSubtext}>{row.subtext}</Text>
              </View>
              <Toggle on={prefs[row.key]} />
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>NEWSLETTER</Text>
        <View style={styles.rowGroup}>
          <Pressable
            style={[styles.row, styles.rowLast]}
            onPress={() => setNewsletterOptIn(!newsletterOptIn)}
            testID="newsletter-toggle"
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>The Weekly Kettlebell</Text>
              <Text style={styles.rowSubtext}>Doc's weekly newsletter, straight to your inbox.</Text>
            </View>
            <Toggle on={newsletterOptIn} />
          </Pressable>
        </View>

        <Text style={[styles.sectionHeading, styles.sectionHeadingSpaced]}>ACCOUNT</Text>
        <View style={styles.rowGroup}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowSubtext}>{membership.email ?? 'Not signed in with an email'}</Text>
            </View>
          </View>
          <Pressable style={[styles.row, styles.rowLast]} onPress={membership.signOut} testID="sign-out">
            <Text style={styles.signOutText}>SIGN OUT</Text>
          </Pressable>
        </View>
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
    marginTop: 28,
  },
  membershipCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 18,
  },
  planLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 4,
  },
  planValue: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 0.5,
  },
  planMeta: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    marginTop: 4,
  },
  cancelFlag: {
    color: colors.scoreboardRed,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 8,
  },
  membershipButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  changePlanButton: {
    flexGrow: 1,
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  changePlanButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 1,
  },
  cancelButton: {
    flexGrow: 1,
    borderWidth: 1.5,
    borderColor: colors.scoreboardRed,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.scoreboardRed,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 1,
  },
  rowGroup: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  rowSubtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  signOutText: {
    color: colors.scoreboardRed,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
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
  cancelConfirmWrap: {
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  cancelConfirmTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 16,
  },
  cancelConfirmBody: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 14,
  },
  keepButton: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: colors.green,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  keepButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  doneButton: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    color: colors.textMuted,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
