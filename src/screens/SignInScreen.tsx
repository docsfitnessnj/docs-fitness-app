import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PasswordInput } from '../components/PasswordInput';
import { colors, fonts } from '../theme';

type Props = {
  onBack: () => void;
  onForgotPassword: () => void;
  // Pre-fills the email field — set when arriving here from the Welcome
  // screen's "an account already exists" Sign in link, so the member
  // doesn't have to retype it.
  initialEmail?: string;
  // Returns an error message on failure, or null on success.
  onSignIn: (email: string, password: string) => Promise<string | null>;
};

export default function SignInScreen({ onBack, onForgotPassword, initialEmail, onSignIn }: Props) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && email.includes('@') && password.trim().length > 0 && !submitting;

  const handleSignIn = async () => {
    setSubmitting(true);
    setError(null);
    const result = await onSignIn(email.trim(), password);
    setSubmitting(false);
    if (result) setError(result);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backButton} testID="sign-in-back">
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text style={styles.backText}>BACK</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title}>SIGN IN</Text>
        <Text style={styles.subtext}>Welcome back to Doc's Fitness.</Text>

        <View style={styles.form}>
          <Text nativeID="sign-in-email-label" style={styles.label}>EMAIL ADDRESS</Text>
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
            nativeID="sign-in-email-input"
            aria-label="Email address"
            testID="sign-in-email"
          />

          <Text nativeID="sign-in-password-label" style={styles.label}>PASSWORD</Text>
          <PasswordInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            autoComplete="current-password"
            nativeID="sign-in-password-input"
            ariaLabel="Password"
            testID="sign-in-password"
          />

          {error && (
            <Text style={styles.errorText} testID="sign-in-error">
              {error}
            </Text>
          )}

          <Pressable
            style={[styles.signInButton, !canSubmit && styles.signInButtonDisabled]}
            disabled={!canSubmit}
            onPress={handleSignIn}
            testID="sign-in-submit"
          >
            <Text style={styles.signInButtonText}>{submitting ? 'PLEASE WAIT...' : 'SIGN IN'}</Text>
          </Pressable>

          <Pressable onPress={onForgotPassword} hitSlop={8} style={styles.forgotPasswordLink} testID="sign-in-forgot-password">
            <Text style={styles.forgotPasswordText}>Forgot password?</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
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
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 40,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
  },
  form: {
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
  signInButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  signInButtonDisabled: {
    opacity: 0.5,
  },
  signInButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 1,
  },
  errorText: {
    color: colors.scoreboardRed,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  forgotPasswordLink: {
    alignItems: 'center',
    marginTop: 18,
  },
  forgotPasswordText: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
