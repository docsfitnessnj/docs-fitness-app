import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../theme';

type Props = {
  onBack: () => void;
  onTrainOnline: () => void;
  onTrainAtBoathouse: () => void;
};

export default function HowDoYouTrainScreen({ onBack, onTrainOnline, onTrainAtBoathouse }: Props) {
  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={8} style={styles.backButton} testID="how-do-you-train-back">
        <Ionicons name="chevron-back" size={20} color={colors.text} />
        <Text style={styles.backText}>BACK</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title}>HOW DO YOU TRAIN?</Text>

        <Pressable style={styles.bigButton} onPress={onTrainOnline} testID="train-online">
          <Ionicons name="videocam-outline" size={28} color={colors.white} />
          <Text style={styles.bigButtonTitle}>TRAIN ONLINE</Text>
          <Text style={styles.bigButtonSubtext}>Follow Doc's WODs and COWS from anywhere</Text>
        </Pressable>

        <Pressable style={[styles.bigButton, styles.bigButtonGold]} onPress={onTrainAtBoathouse} testID="train-boathouse">
          <Ionicons name="boat-outline" size={28} color={colors.greenDeep} />
          <Text style={[styles.bigButtonTitle, styles.bigButtonTitleGold]}>TRAIN AT THE BOATHOUSE</Text>
          <Text style={[styles.bigButtonSubtext, styles.bigButtonSubtextGold]}>In person, Ventnor City</Text>
        </Pressable>

        <Text style={styles.quietLine}>Boathouse unlimited members get the full app included.</Text>
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
    marginBottom: 28,
  },
  bigButton: {
    backgroundColor: colors.green,
    borderRadius: 16,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  bigButtonGold: {
    backgroundColor: colors.goldBright,
  },
  bigButtonTitle: {
    color: colors.white,
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 1,
    marginTop: 10,
  },
  bigButtonTitleGold: {
    color: colors.greenDeep,
  },
  bigButtonSubtext: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  bigButtonSubtextGold: {
    color: colors.greenDeep,
    opacity: 0.8,
  },
  quietLine: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
});
