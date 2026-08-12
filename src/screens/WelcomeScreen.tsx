import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, TAGLINE } from '../theme';

type Props = {
  onStartTrial: () => void;
  onSkipTrial: () => void;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// First screen anyone sees. Email capture is visual/local only — there's no
// email backend yet, so we just validate the shape and let them continue.
export default function WelcomeScreen({ onStartTrial, onSkipTrial }: Props) {
  const [email, setEmail] = useState('');
  const canContinue = isValidEmail(email);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.heroBlock}>
            <Text style={styles.title}>WELCOME TO{'\n'}DOC&apos;S FITNESS</Text>
            <Text style={styles.tagline}>{TAGLINE}</Text>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Pressable
              style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
              disabled={!canContinue}
              onPress={onStartTrial}
            >
              <Text style={styles.primaryButtonText}>START MY 2-WEEK FREE TRIAL</Text>
            </Pressable>
          </View>

          <Pressable onPress={onSkipTrial} hitSlop={8} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip the trial — become a member now</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  heroBlock: {
    marginBottom: 48,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 48,
    lineHeight: 50,
    letterSpacing: 1,
    textAlign: 'center',
  },
  tagline: {
    color: colors.highlight,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginTop: 14,
  },
  form: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: colors.backgroundLight,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: colors.highlight,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    color: colors.background,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 1,
  },
  skipButton: {
    alignSelf: 'center',
  },
  skipText: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
