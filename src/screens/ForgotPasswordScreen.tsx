import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';

type Props = {
  onBack: () => void;
  // Returns an error message on failure, or null on success.
  onSendReset: (email: string) => Promise<string | null>;
};

export default function ForgotPasswordScreen({ onBack, onSendReset }: Props) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const canSubmit = email.trim().length > 3 && email.includes('@') && !submitting;

  const handleSend = async () => {
    setSubmitting(true);
    setError(null);
    const result = await onSendReset(email.trim());
    setSubmitting(false);
    if (result) setError(result);
    else setSent(true);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backButton} testID="forgot-password-back">
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text style={styles.backText}>BACK</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title}>RESET PASSWORD</Text>

        {sent ? (
          <Text style={styles.sentText} testID="forgot-password-sent">
            Check {email.trim()} for a link to reset your password.
          </Text>
        ) : (
          <>
            <Text style={styles.subtext}>Enter your email and we'll send you a reset link.</Text>

            <View style={styles.form}>
              <Text nativeID="forgot-password-email-label" style={styles.label}>
                EMAIL ADDRESS
              </Text>
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
                nativeID="forgot-password-email-input"
                aria-label="Email address"
                testID="forgot-password-email"
              />

              {error && (
                <Text style={styles.errorText} testID="forgot-password-error">
                  {error}
                </Text>
              )}

              <Pressable
                style={[styles.sendButton, !canSubmit && styles.sendButtonDisabled]}
                disabled={!canSubmit}
                onPress={handleSend}
                testID="forgot-password-send"
              >
                <Text style={styles.sendButtonText}>{submitting ? 'SENDING...' : 'SEND RESET LINK'}</Text>
              </Pressable>
            </View>
          </>
        )}
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
    fontSize: 36,
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
  sentText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
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
  errorText: {
    color: colors.scoreboardRed,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  sendButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 1,
  },
});
