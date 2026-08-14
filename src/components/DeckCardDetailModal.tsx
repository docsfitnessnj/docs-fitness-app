import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { DeckCardData, deckCardLabel, isRedSuit } from '../data/deckCards';
import { colors, fonts } from '../theme';

type Props = {
  card: DeckCardData | null;
  onClose: () => void;
  isComplete: boolean;
  onToggleComplete: () => void;
};

export function DeckCardDetailModal({ card, onClose, isComplete, onToggleComplete }: Props) {
  if (!card) return null;

  const jokerColor = card.joker === 'red' ? colors.scoreboardRed : colors.green;
  const suitColor = card.joker ? jokerColor : isRedSuit(card.suit) ? colors.scoreboardRed : colors.green;
  const label = deckCardLabel(card);

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, card.joker && { borderColor: jokerColor, borderWidth: 2 }]}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton} testID="deck-card-close">
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>

          <Text style={[styles.corner, styles.cornerTopLeft, { color: suitColor }]}>{label}</Text>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{card.title}</Text>
            {card.format ? <Text style={styles.format}>{card.format}</Text> : null}

            <View style={styles.divider} />

            {card.movements.map((move, index) => (
              <View key={index} style={styles.moveRow}>
                <View style={[styles.bullet, { backgroundColor: suitColor }]} />
                <Text style={styles.moveText}>{move}</Text>
              </View>
            ))}

            {card.note ? <Text style={styles.note}>"{card.note}"</Text> : null}

            <Pressable
              style={[styles.completeButton, isComplete && styles.completeButtonDone]}
              onPress={onToggleComplete}
              testID="deck-card-complete-toggle"
            >
              <Ionicons
                name={isComplete ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={18}
                color={isComplete ? colors.white : colors.green}
              />
              <Text style={[styles.completeButtonText, isComplete && styles.completeButtonTextDone]}>
                {isComplete ? 'COMPLETED' : 'MARK COMPLETE'}
              </Text>
            </Pressable>

            <View style={styles.videoPlaceholder}>
              <View style={styles.playCircle}>
                <Ionicons name="play" size={20} color={colors.white} />
              </View>
              <Text style={styles.videoLabel}>WATCH DEMO</Text>
            </View>

            <Text style={[styles.corner, styles.cornerBottomRight, { color: suitColor }]}>{label}</Text>
          </ScrollView>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(18,33,28,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 1,
  },
  corner: {
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
  },
  cornerTopLeft: {
    marginBottom: 4,
  },
  cornerBottomRight: {
    alignSelf: 'flex-end',
    transform: [{ rotate: '180deg' }],
    marginTop: 20,
  },
  body: {
    paddingBottom: 8,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 34,
    letterSpacing: 0.5,
    marginTop: 8,
  },
  format: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginVertical: 16,
  },
  moveRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  bullet: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: 7,
    marginRight: 10,
  },
  moveText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  note: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 8,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.green,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 8,
  },
  completeButtonDone: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  completeButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  completeButtonTextDone: {
    color: colors.white,
  },
  videoPlaceholder: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingVertical: 20,
    alignItems: 'center',
    marginTop: 16,
  },
  playCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  videoLabel: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
  },
});
