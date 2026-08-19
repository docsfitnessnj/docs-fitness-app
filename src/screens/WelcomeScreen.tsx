import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DocsBadge } from '../components/brand/DocsBadge';
import { DocsHorizontalLockup } from '../components/brand/DocsHorizontalLockup';
import { colors, fonts, WELCOME_SUBTEXT } from '../theme';

type Props = {
  onContinue: (email: string, newsletterOptIn: boolean) => void;
  onBrowseAsGuest: () => void;
};

export default function WelcomeScreen({ onContinue, onBrowseAsGuest }: Props) {
  const [email, setEmail] = useState('');
  const [newsletterOptIn, setNewsletterOptIn] = useState(true);

  const canSubmit = email.trim().length > 3 && email.includes('@');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <View style={styles.brandMark}>
          <DocsBadge variant="white" size={140} />
        </View>
        <Text style={styles.title}>DOC'S FITNESS</Text>
        <Text style={styles.subtext}>{WELCOME_SUBTEXT}</Text>

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
            style={styles.checkboxRow}
            onPress={() => setNewsletterOptIn((v) => !v)}
            hitSlop={4}
            testID="newsletter-optin-checkbox"
          >
            <View style={[styles.checkbox, newsletterOptIn && styles.checkboxChecked]}>
              {newsletterOptIn && <Ionicons name="checkmark" size={13} color={colors.white} />}
            </View>
            <Text style={styles.checkboxLabel}>Send me The Weekly Kettlebell, Doc's weekly newsletter.</Text>
          </Pressable>

          <Pressable
            style={[styles.continueButton, !canSubmit && styles.continueButtonDisabled]}
            disabled={!canSubmit}
            onPress={() => onContinue(email.trim(), newsletterOptIn)}
            testID="welcome-continue"
          >
            <Text style={styles.continueButtonText}>CONTINUE</Text>
          </Pressable>
        </View>

        <Pressable onPress={onBrowseAsGuest} hitSlop={8} style={styles.guestLink} testID="browse-as-guest">
          <Text style={styles.guestLinkText}>Browse as guest</Text>
        </Pressable>

        <View style={styles.footer}>
          <DocsHorizontalLockup width={130} />
        </View>
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
    marginBottom: 8,
  },
  footer: {
    marginTop: 40,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 46,
    lineHeight: 48,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 10,
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
    marginBottom: 18,
  },
  subtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 28,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 18,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  checkboxLabel: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
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
