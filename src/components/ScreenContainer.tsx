import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

type Props = {
  scroll?: boolean;
  children: React.ReactNode;
};

// The screen's title lives in the native header (see App.tsx), so this just
// provides the shared background and content padding for every tab.
export function ScreenContainer({ scroll = true, children }: Props) {
  const Body = scroll ? ScrollView : View;

  return (
    <View style={styles.container}>
      <Body style={styles.body} contentContainerStyle={scroll ? styles.scrollContent : styles.body}>
        {children}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
});
