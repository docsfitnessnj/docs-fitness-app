import React, { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme';

type Props = {
  scroll?: boolean;
  children: React.ReactNode;
};

// The screen's title lives in the native header (see App.tsx), so this just
// provides the shared background and content padding for every tab.
//
// Every tab screen shares this container, so resetting scroll to the top
// here — on mount AND every time the tab regains focus (useFocusEffect,
// not useEffect: react-navigation's bottom tabs keep every screen mounted
// and just hide the inactive ones, so a plain mount-only effect would only
// fire once, ever) — covers all of them in one place rather than adding
// the same reset to each screen individually. This is what actually
// guarantees "always opens at the top," independent of whatever caused a
// stale offset to show up in the first place (see history.scrollRestoration
// in public/index.html for the other half of that fix).
export function ScreenContainer({ scroll = true, children }: Props) {
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      if (scroll) scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [scroll])
  );

  if (!scroll) {
    return (
      <View style={styles.container}>
        <View style={styles.body}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={styles.scrollContent}>
        {children}
      </ScrollView>
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
