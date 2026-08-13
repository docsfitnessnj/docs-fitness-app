import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal } from './AppModal';
import { useAlertState } from '../lib/alert';
import { colors, fonts } from '../theme';

// Mounted once near the app root. Renders whatever showAlert() was last called with.
export function AlertHost() {
  const [state, setState] = useAlertState();
  if (!state) return null;

  const close = () => setState(null);

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
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
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.backgroundLight,
    borderRadius: 16,
    padding: 22,
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
    lineHeight: 20,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  button: {
    backgroundColor: colors.highlight,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonCancel: {
    backgroundColor: colors.locked,
  },
  buttonText: {
    color: colors.background,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  buttonTextCancel: {
    color: colors.text,
  },
});
