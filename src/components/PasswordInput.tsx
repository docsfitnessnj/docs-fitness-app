import React, { useRef, useState } from 'react';
import { Platform, Pressable, StyleProp, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoComplete?: 'new-password' | 'current-password' | 'off';
  nativeID?: string;
  testID?: string;
  ariaLabel: string;
  style: StyleProp<TextStyle>;
  wrapperStyle?: StyleProp<ViewStyle>;
  onSubmitEditing?: () => void;
  // Signup-only: keeps the field readOnly until the member's first tap, then
  // frees it and refocuses so the keyboard opens as normal. On iOS Safari a
  // readOnly input can't raise the on-screen keyboard, so WebKit never gets
  // to the "is this a signup form?" check that arms the Suggest Strong
  // Password / Save Password overlay for that focus. By the time it's
  // unlocked, the field is just an ordinary focused password input. Doesn't
  // change masking, the eye toggle, or the submitted value — only when the
  // browser first sees the field as interactive. Sign in and reset-password
  // never pass this, so their normal credential-manager behavior is
  // untouched.
  suppressStrongPasswordPrompt?: boolean;
};

// A password field with a show/hide eye toggle — every password field in
// the app (sign up, sign in, reset) uses this instead of a plain
// secureTextEntry input, so members can check what they typed before
// submitting.
export function PasswordInput({
  value,
  onChangeText,
  placeholder,
  autoComplete = 'current-password',
  nativeID,
  testID,
  ariaLabel,
  style,
  wrapperStyle,
  onSubmitEditing,
  suppressStrongPasswordPrompt = false,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [locked, setLocked] = useState(suppressStrongPasswordPrompt && Platform.OS === 'web');
  const inputRef = useRef<TextInput>(null);

  const handleFocus = () => {
    if (!locked) return;
    setLocked(false);
    // Removing readOnly on the same tick doesn't reliably re-raise the
    // keyboard on iOS Safari — it needs an explicit re-focus once the node
    // is actually editable.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <View style={[{ position: 'relative', justifyContent: 'center' }, wrapperStyle]}>
      <TextInput
        ref={inputRef}
        style={[style, { paddingRight: 44 }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={!visible}
        autoComplete={autoComplete}
        // Same "don't overclaim what this field is" move as the composer
        // round's text fields (autoComplete="off" + importantForAutofill
        // "no") — here scoped to whichever caller explicitly asks for it by
        // passing autoComplete="off", since the sign-in and reset-password
        // screens still want their normal credential-manager treatment.
        // Still a real, masked password field either way — this only
        // affects how eagerly the OS offers to manage it.
        importantForAutofill={autoComplete === 'off' ? 'no' : 'auto'}
        readOnly={locked}
        onFocus={handleFocus}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        nativeID={nativeID}
        aria-label={ariaLabel}
        testID={testID}
        onSubmitEditing={onSubmitEditing}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        style={{ position: 'absolute', right: 12 }}
        testID={testID ? `${testID}-toggle-visibility` : undefined}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
