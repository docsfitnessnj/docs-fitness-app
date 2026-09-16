import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { PasswordInput } from '../components/PasswordInput';
import { colors, fonts } from '../theme';

type Props = {
  // Returns an error message on failure, or null on success.
  onSave: (newPassword: string) => Promise<string | null>;
};

// Reached only when Supabase reports a password-recovery session (the
// member just clicked the reset link in their email) — see AuthContext's
// passwordRecovery flag and App.tsx's top-level gate. No BACK button on
// purpose: there's nowhere else to go from a recovery link except through.
export default function SetNewPasswordScreen({ onSave }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = password.length >= 6 && password === confirm && !submitting;

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    const result = await onSave(password);
    setSubmitting(false);
    if (result) setError(result);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>SET NEW PASSWORD</Text>
        <Text style={styles.subtext}>Choose a new password for your account.</Text>

        <View style={styles.form}>
          <Text nativeID="new-password-label" style={styles.label}>NEW PASSWORD</Text>
          <PasswordInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            autoComplete="new-password"
            nativeID="new-password-input"
            ariaLabel="New password"
            testID="new-password"
          />

          <Text nativeID="confirm-password-label" style={styles.label}>CONFIRM PASSWORD</Text>
          <PasswordInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Type it again"
            autoComplete="new-password"
            nativeID="confirm-password-input"
            ariaLabel="Confirm new password"
            testID="confirm-password"
          />
          {confirm.length > 0 && password !== confirm && (
            <Text style={styles.errorText}>Passwords don't match.</Text>
          )}

          {error && (
            <Text style={styles.errorText} testID="new-password-error">
              {error}
            </Text>
          )}

          <Pressable
            style={[styles.saveButton, !canSubmit && styles.saveButtonDisabled]}
            disabled={!canSubmit}
            onPress={handleSave}
            testID="new-password-save"
          >
            <Text style={styles.saveButtonText}>{submitting ? 'SAVING...' : 'SAVE NEW PASSWORD'}</Text>
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
  saveButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 1,
  },
});
