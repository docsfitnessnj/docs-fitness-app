import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DocsBadge } from '../components/brand/DocsBadge';
import { DocsHorizontalLockup } from '../components/brand/DocsHorizontalLockup';
import { colors, fonts, TAGLINE, DESKTOP_BREAKPOINT, LARGE_DESKTOP_BREAKPOINT } from '../theme';

type Props = {
  onContinue: (email: string, newsletterOptIn: boolean) => void;
  onBrowseAsGuest: () => void;
  // Present whenever this screen is reached from the About page rather than
  // being the app's own entry point.
  onBack?: () => void;
};

export default function WelcomeScreen({ onContinue, onBrowseAsGuest, onBack }: Props) {
  const [email, setEmail] = useState('');
  const [newsletterOptIn, setNewsletterOptIn] = useState(true);
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const isLargeDesktop = isDesktop && width >= LARGE_DESKTOP_BREAKPOINT;

  const canSubmit = email.trim().length > 3 && email.includes('@');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {onBack && (
        <Pressable onPress={onBack} hitSlop={8} style={styles.backButton} testID="welcome-back">
          <Ionicons name="chevron-back" size={20} color={colors.text} />
          <Text style={styles.backText}>BACK</Text>
        </Pressable>
      )}
      <View style={[styles.content, isDesktop && styles.contentDesktop]}>
        <View style={[styles.brandMark, isDesktop && styles.brandMarkDesktop]}>
          <DocsBadge variant="white" size={isLargeDesktop ? 220 : isDesktop ? 190 : 140} />
        </View>
        <Text style={[styles.title, isDesktop && styles.titleDesktop, isLargeDesktop && styles.titleLargeDesktop]}>
          DOC'S FITNESS
        </Text>
        <Text
          style={[
            styles.tagline,
            isDesktop && styles.taglineDesktop,
            isLargeDesktop && styles.taglineLargeDesktop,
          ]}
        >
          {TAGLINE.toUpperCase()}
        </Text>

        <View style={styles.form}>
          <Text nativeID="welcome-email-label" style={styles.label}>EMAIL ADDRESS</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            nativeID="welcome-email-input"
            aria-label="Email address"
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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    top: 60,
    left: 24,
    zIndex: 1,
  },
  backText: {
    color: colors.text,
    fontFamily: fonts.labelSemiBold,
    fontSize: 14,
    letterSpacing: 1,
    marginLeft: 2,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  // Generous vertical padding so the hero reads as a real hero section on
  // desktop instead of a header strip sitting atop the form.
  contentDesktop: {
    paddingVertical: 72,
  },
  brandMark: {
    marginBottom: 8,
  },
  brandMarkDesktop: {
    marginBottom: 20,
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
  titleDesktop: {
    fontSize: 66,
    lineHeight: 68,
    marginBottom: 16,
  },
  titleLargeDesktop: {
    fontSize: 88,
    lineHeight: 90,
    marginBottom: 20,
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
  // Bolder, present treatment for this screen only — a clean stacked
  // statement under the wordmark, not competing with its Bebas headline
  // size. Other tagline placements (hamburger footer, etc.) keep the
  // quieter fonts.body treatment.
  tagline: {
    color: colors.text,
    fontFamily: fonts.labelSemiBold,
    fontSize: 17,
    lineHeight: 25,
    letterSpacing: 1.35,
    textAlign: 'center',
    marginBottom: 28,
  },
  taglineDesktop: {
    fontSize: 21,
    lineHeight: 30,
    maxWidth: 700,
    marginBottom: 40,
  },
  taglineLargeDesktop: {
    fontSize: 24,
    lineHeight: 34,
    marginBottom: 48,
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
