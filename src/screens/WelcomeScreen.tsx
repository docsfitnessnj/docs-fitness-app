import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, WELCOME_SUBTEXT } from '../theme';

type Props = {
  onContinue: (email: string) => void;
  onBrowseAsGuest: () => void;
};

export default function WelcomeScreen({ onContinue, onBrowseAsGuest }: Props) {
  const [email, setEmail] = useState('');

  const canSubmit = email.trim().length > 3 && email.includes('@');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <View style={styles.brandMark}>
          <Ionicons name="fitness" size={30} color={colors.white} />
        </View>
        <Text style={styles.title}>DOC'S FITNESS</Text>

        <View style={styles.form}>
          <Text style={styles.label}>EMAIL ADDRESS</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Text style={styles.subtext}>{WELCOME_SUBTEXT}</Text>

          <Pressable
            style={[styles.continueButton, !canSubmit && styles.continueButtonDisabled]}
            disabled={!canSubmit}
            onPress={() => onContinue(email.trim())}
            testID="welcome-continue"
          >
            <Text style={styles.continueButtonText}>CONTINUE</Text>
          </Pressable>
        </View>

        <Pressable onPress={onBrowseAsGuest} hitSlop={8} style={styles.guestLink} testID="browse-as-guest">
          <Text style={styles.guestLinkText}>Browse as guest</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 46,
    lineHeight: 48,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 32,
  },
  form: {
    width: '100%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 20,
  },
  label: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
  },
  subtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
    marginBottom: 18,
  },
  continueButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 1,
  },
  guestLink: {
    alignItems: 'center',
    marginTop: 24,
  },
  guestLinkText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
