import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';

type Props = {
  onBack: () => void;
  onSignIn: (email: string) => void;
};

// No real backend yet — this just captures an email and treats them as a
// returning online member, same as every other tier transition in this app.
export default function SignInScreen({ onBack, onSignIn }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit = email.trim().length > 3 && email.includes('@') && password.trim().length > 0;

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
            testID="sign-in-email"
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            testID="sign-in-password"
          />

          <Pressable
            style={[styles.signInButton, !canSubmit && styles.signInButtonDisabled]}
            disabled={!canSubmit}
            onPress={() => onSignIn(email.trim())}
            testID="sign-in-submit"
          >
            <Text style={styles.signInButtonText}>SIGN IN</Text>
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
});
