import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';

type Props = {
  children: React.ReactNode;
  // Shown above the retry button — keep it specific to the screen this
  // wraps ("Doc's Group Chat ran into a problem") rather than generic, so
  // a member who sees it has some idea what just happened.
  label: string;
};

type State = { hasError: boolean };

// A real-device crash traced to an unexpected throw inside DOC'S GROUP
// CHAT's Realtime setup turned into a fully blank white screen, app dead,
// with no way back short of closing the browser — because nothing in this
// app had ever caught a render/effect-phase error before. React unmounts
// the WHOLE tree below the nearest error boundary (or everything, if there
// isn't one) the moment anything throws during render, a lifecycle method,
// or a class/functional component's commit-phase work — which plain
// try/catch in event handlers can't intercept, since this isn't an event
// handler throwing. This is the backstop: whatever actually goes wrong
// inside the wrapped screen, the rest of the app survives and the member
// gets a calm "try again" instead of a dead tab. It does NOT replace
// fixing the actual bug (see the channel-topic-uniqueness fix in
// useGroupChat.ts for the one that caused this) — it's what keeps the
// next unanticipated one from being able to do the same thing.
export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('[ScreenErrorBoundary] caught an error, failing to a retry state:', error);
  }

  retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container} testID="screen-error-boundary">
          <Ionicons name="warning-outline" size={32} color={colors.textMuted} />
          <Text style={styles.title}>{this.props.label} ran into a problem</Text>
          <Text style={styles.body}>Nothing else is affected. Try again.</Text>
          <Pressable style={styles.button} onPress={this.retry} testID="screen-error-boundary-retry">
            <Text style={styles.buttonText}>TRY AGAIN</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.3,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
  body: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: colors.green,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 10,
  },
  buttonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
