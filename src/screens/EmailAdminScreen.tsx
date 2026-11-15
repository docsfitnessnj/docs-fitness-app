import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ModalHeader } from '../components/ModalHeader';
import { SaveConfirmation } from '../components/SaveConfirmation';
import { useEmail } from '../context/EmailContext';
import { showAlert } from '../lib/alert';
import { isBackendUnavailableError, supabase } from '../lib/supabaseClient';
import { useSaveConfirmation } from '../lib/useSaveConfirmation';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function Toggle({ on }: { on: boolean }) {
  return (
    <View style={[styles.track, on && styles.trackOn]}>
      <View style={[styles.thumb, on && styles.thumbOn]} />
    </View>
  );
}

type SendState = 'idle' | 'sending' | 'sent' | 'error';

// Doc's own EMAIL control room. EMAIL TEST MODE (email_settings.mode --
// see migration_033.sql) is the master safety switch for every MEMBER-
// FACING email this app sends (today: the Sunday Drop) -- defaults to
// TEST so a fresh migration can never arm anything, and the switch to
// LIVE is gated behind an explicit confirmation naming exactly what's
// about to happen, since a silent flip here is the one mistake this
// screen exists to prevent. SEND TEST EMAIL is a separate, permanent
// feature (not a one-time launch-day step) -- any number of times, in
// either mode, always to Doc's own inbox only, rendered through the
// exact same template the real Sunday send uses.
export function EmailAdminScreen({ visible, onClose }: Props) {
  const email = useEmail();
  const [modePending, setModePending] = useState(false);
  const modeSaveConfirm = useSaveConfirmation();
  const [sendState, setSendState] = useState<SendState>('idle');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentWeekLabel, setSentWeekLabel] = useState<string | null>(null);

  if (!visible) return null;

  const doSetMode = async (next: 'test' | 'live') => {
    setModePending(true);
    modeSaveConfirm.start();
    const result = await email.setMode(next);
    setModePending(false);
    if (result.error) {
      modeSaveConfirm.fail(result.error);
      showAlert("Couldn't Save", result.error);
      return;
    }
    modeSaveConfirm.succeed();
  };

  const toggleMode = () => {
    if (email.mode === 'test') {
      // LIVE really does send to real members on the next release -- this
      // is the one confirmation this whole feature exists to require.
      showAlert(
        'Switch To LIVE?',
        'Real members will receive email starting with the next send. This is not a drill — every signed-in member except the booking-only tiers will get it. Switch to LIVE?',
        [
          { text: 'CANCEL', style: 'cancel' },
          { text: 'SWITCH TO LIVE', style: 'destructive', onPress: () => doSetMode('live') },
        ]
      );
      return;
    }
    // LIVE -> TEST needs no confirmation -- turning the safety switch back
    // on is never the risky direction.
    doSetMode('test');
  };

  const sendTestEmail = async () => {
    setSendState('sending');
    setSendError(null);
    setSentWeekLabel(null);
    const { data, error } = await supabase.functions.invoke('admin-send-test-email', { body: {} });
    if (error) {
      setSendState('error');
      setSendError(isBackendUnavailableError(error) ? "Can't reach the backend right now." : error.message);
      return;
    }
    const payload = data as { sent?: boolean; week?: string; error?: string } | null;
    if (!payload?.sent) {
      setSendState('error');
      setSendError(payload?.error ?? 'Send failed.');
      return;
    }
    setSendState('sent');
    setSentWeekLabel(payload.week ?? null);
  };

  return (
    <View style={styles.container}>
      <ModalHeader title="EMAIL" onBack={onClose} backTestID="close-email-admin" />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Pressable
          style={[styles.masterToggleRow, modePending && styles.disabled]}
          disabled={modePending}
          onPress={toggleMode}
          testID="email-test-mode-toggle"
        >
          <Toggle on={email.mode === 'live'} />
          <View style={{ flex: 1 }}>
            <Text style={styles.masterToggleTitle}>EMAIL TEST MODE</Text>
            <Text style={styles.masterToggleSubtext}>
              TEST reroutes every member email to Doc's own inbox, with a [TEST] subject and a banner showing who it
              would have gone to — no member ever receives anything. LIVE sends for real.
            </Text>
          </View>
          <Text
            style={[styles.masterToggleState, email.mode === 'live' ? styles.masterToggleStateLive : styles.masterToggleStateOff]}
            testID="email-test-mode-label"
          >
            {email.mode === 'live' ? 'LIVE' : 'TEST'}
          </Text>
        </Pressable>
        <View style={styles.saveConfirmWrap}>
          <SaveConfirmation state={modeSaveConfirm.state} errorMessage={modeSaveConfirm.errorMessage} />
        </View>

        <Text style={styles.sectionHeading}>SEND TEST EMAIL</Text>
        <Text style={styles.sectionSubtext}>
          Renders the real Sunday Drop email for the next scheduled week (or the most recently released one) exactly
          as members would see it, and sends it only to your own inbox — in either mode, as many times as you like.
        </Text>

        <Pressable
          style={[styles.sendButton, sendState === 'sending' && styles.disabled]}
          disabled={sendState === 'sending'}
          onPress={sendTestEmail}
          testID="send-test-email-button"
        >
          <Text style={styles.sendButtonText}>{sendState === 'sending' ? 'SENDING…' : 'SEND TEST EMAIL'}</Text>
        </Pressable>

        {sendState === 'sent' ? (
          <Text style={styles.sendResultSuccess} testID="send-test-email-success">
            Sent{sentWeekLabel ? ` — ${sentWeekLabel}` : ''}. Check your inbox.
          </Text>
        ) : null}
        {sendState === 'error' ? (
          <Text style={styles.sendResultError} testID="send-test-email-error">
            {sendError}
          </Text>
        ) : null}
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
  masterToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    gap: 12,
  },
  masterToggleTitle: {
    color: colors.text,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  masterToggleSubtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  masterToggleState: {
    fontFamily: fonts.headline,
    fontSize: 18,
    letterSpacing: 1,
  },
  masterToggleStateLive: {
    color: colors.gold,
  },
  masterToggleStateOff: {
    color: colors.textMuted,
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
  disabled: {
    opacity: 0.6,
  },
  saveConfirmWrap: {
    minHeight: 20,
    marginTop: 10,
    marginBottom: 20,
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
  sendButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  sendButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  sendResultSuccess: {
    color: colors.green,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    marginTop: 12,
  },
  sendResultError: {
    color: colors.playingCardRed,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    marginTop: 12,
  },
});
