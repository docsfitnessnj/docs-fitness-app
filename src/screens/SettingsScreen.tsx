import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ModalHeader } from '../components/ModalHeader';
import { useMembership } from '../context/MembershipContext';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function SettingsScreen({ visible, onClose }: Props) {
  const { newsletterOptIn, setNewsletterOptIn } = useMembership();

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <ModalHeader title="SETTINGS & NOTIFICATIONS" onBack={onClose} backTestID="close-settings" />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionHeading}>EMAIL</Text>
        <Pressable
          style={styles.row}
          onPress={() => setNewsletterOptIn(!newsletterOptIn)}
          testID="newsletter-toggle"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>The Weekly Kettlebell</Text>
            <Text style={styles.rowSubtext}>Doc's weekly newsletter, straight to your inbox.</Text>
          </View>
          <View style={[styles.track, newsletterOptIn && styles.trackOn]}>
            <View style={[styles.thumb, newsletterOptIn && styles.thumbOn]} />
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  body: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionHeading: {
    color: colors.green,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 1,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    padding: 16,
  },
  rowLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  rowSubtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.hairline,
    padding: 3,
    justifyContent: 'center',
    marginLeft: 12,
  },
  trackOn: {
    backgroundColor: colors.green,
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  thumbOn: {
    alignSelf: 'flex-end',
  },
});
