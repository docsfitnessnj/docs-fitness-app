import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, TAGLINE } from '../theme';

type Props = {
  onStartTrial: (email: string) => void;
  onSkipTrial: () => void;
};

export default function WelcomeScreen({ onStartTrial, onSkipTrial }: Props) {
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
        <Text style={styles.tagline}>{TAGLINE.toUpperCase()}</Text>

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

          <Pressable
            style={[styles.trialButton, !canSubmit && styles.trialButtonDisabled]}
            disabled={!canSubmit}
            onPress={() => onStartTrial(email.trim())}
          >
            <Text style={styles.trialButtonText}>START MY 2-WEEK FREE TRIAL</Text>
          </Pressable>
        </View>

        <Pressable onPress={onSkipTrial} hitSlop={8} style={styles.skipLink}>
          <Text style={styles.skipLinkText}>Skip the trial — become a member now</Text>
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
  },
  tagline: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 14,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 40,
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
    marginBottom: 16,
  },
  trialButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  trialButtonDisabled: {
    opacity: 0.5,
  },
  trialButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 1,
  },
  skipLink: {
    alignItems: 'center',
    marginTop: 24,
  },
  skipLinkText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
