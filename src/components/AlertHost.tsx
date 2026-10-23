import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { useAlertState } from '../lib/alert';
import { colors, fonts } from '../theme';

// Mounted once near the app root. Renders whatever showAlert() was last
// called with — every informational or choice popup in this app that goes
// through showAlert() (25+ call sites, from the first-class-free question
// to every confirm/cancel dialog) gets its escape hatch from this one
// place. Round 25: a real-device report found the first-class-free
// question specifically was a trap with no way out short of picking an
// answer — someone just browsing the schedule, or who tapped SIGN UP by
// mistake, had no way back. Two dismiss paths, both calling the exact same
// `close()` as the other: the X (top-right, always present) and tapping
// the dimmed backdrop outside the sheet. Neither ever calls a button's own
// onPress — dismissing never books, charges, or saves anything, same
// guarantee a confirm dialog's own explicit Cancel/Keep button already
// gives, just reachable two more ways.
export function AlertHost() {
  const [state, setState] = useAlertState();
  if (!state) return null;

  const close = () => setState(null);

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={close}>
      {/* The backdrop itself is the dismiss target; the inner Pressable
          around the sheet claims the touch first so tapping the sheet's
          own body (not a button) doesn't also dismiss it. */}
      <Pressable style={styles.backdrop} onPress={close} testID="alert-backdrop">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Pressable style={styles.closeButton} onPress={close} hitSlop={8} testID="alert-close">
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
          <Text style={styles.title}>{state.title}</Text>
          {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
          <View style={styles.buttonRow}>
            {state.buttons.map((button, index) => (
              <Pressable
                key={index}
                style={[styles.button, button.style === 'cancel' && styles.buttonCancel]}
                onPress={() => {
                  close();
                  button.onPress?.();
                }}
              >
                <Text style={[styles.buttonText, button.style === 'cancel' && styles.buttonTextCancel]}>
                  {button.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(18,33,28,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 22,
    paddingTop: 44,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 1,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 22,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  message: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
  },
  button: {
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonCancel: {
    backgroundColor: colors.background,
  },
  buttonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  buttonTextCancel: {
    color: colors.text,
  },
});
