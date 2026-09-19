import React, { useState } from 'react';
import { Pressable, StyleProp, TextInput, TextStyle, View, ViewStyle } from 'react-native';
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
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={[{ position: 'relative', justifyContent: 'center' }, wrapperStyle]}>
      <TextInput
        style={[style, { paddingRight: 44 }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={!visible}
        autoComplete={autoComplete}
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
