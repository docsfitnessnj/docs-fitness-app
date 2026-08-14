import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { MembershipGate } from '../components/MembershipGate';
import { DeckCardDetailModal } from '../components/DeckCardDetailModal';
import { CardBack } from '../components/CardBack';
import { useDeckProgress } from '../context/DeckProgressContext';
import { DECK_CARDS, DeckCardData, deckCardLabel, isRedSuit } from '../data/deckCards';
import { colors, fonts } from '../theme';

type Mode = 'shuffle' | 'browse';

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <View style={styles.modeRow}>
      <Pressable
        style={[styles.modeButton, mode === 'shuffle' && styles.modeButtonActive]}
        onPress={() => onChange('shuffle')}
      >
        <Text style={[styles.modeButtonText, mode === 'shuffle' && styles.modeButtonTextActive]}>SHUFFLE MODE</Text>
      </Pressable>
      <Pressable
        style={[styles.modeButton, mode === 'browse' && styles.modeButtonActive]}
        onPress={() => onChange('browse')}
      >
        <Text style={[styles.modeButtonText, mode === 'browse' && styles.modeButtonTextActive]}>BROWSE DECK</Text>
      </Pressable>
    </View>
  );
}

function ProgressLine({ completed, total }: { completed: number; total: number }) {
  return (
    <Text style={styles.progressLine}>
      {completed} OF {total} COMPLETED
    </Text>
  );
}

function ShuffleArea({ onDeal }: { onDeal: (card: DeckCardData) => void }) {
  const { pickRandomUncompleted, completedCount, totalCount } = useDeckProgress();
  const [shuffling, setShuffling] = useState(false);
  const wiggle = useRef(new Animated.Value(0)).current;

  const deckExhausted = completedCount >= totalCount;

  const handleShuffle = () => {
    if (shuffling || deckExhausted) return;
    setShuffling(true);
    Animated.sequence([
      Animated.timing(wiggle, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: -1, duration: 90, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: -1, duration: 90, useNativeDriver: true }),
      Animated.timing(wiggle, { toValue: 0, duration: 90, useNativeDriver: true }),
    ]).start(() => {
      setShuffling(false);
      const id = pickRandomUncompleted();
      if (!id) return;
      const card = DECK_CARDS.find((c) => c.id === id);
      if (card) onDeal(card);
    });
  };

  if (deckExhausted) {
    return (
      <View style={styles.completeBanner}>
        <Ionicons name="trophy" size={40} color={colors.gold} />
        <Text style={styles.completeBannerTitle}>DECK COMPLETE!</Text>
        <Text style={styles.completeBannerText}>You've beaten all {totalCount} workouts. Legendary.</Text>
      </View>
    );
  }

  return (
    <View style={styles.shuffleArea}>
      <Animated.View
        style={{
          transform: [
            {
              rotate: wiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] }),
            },
          ],
        }}
      >
        <CardBack size="large" />
      </Animated.View>

      <Pressable
        style={[styles.shuffleButton, shuffling && styles.shuffleButtonDisabled]}
        onPress={handleShuffle}
        disabled={shuffling}
        testID="shuffle-deck-button"
      >
        <Text style={styles.shuffleButtonText}>{shuffling ? 'SHUFFLING…' : 'SHUFFLE THE DECK'}</Text>
      </Pressable>
    </View>
  );
}

function BrowseCard({
  card,
  completed,
  onOpen,
}: {
  card: DeckCardData;
  completed: boolean;
  onOpen: (card: DeckCardData) => void;
}) {
  const flip = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (completed) {
      onOpen(card);
      return;
    }
    Animated.sequence([
      Animated.timing(flip, { toValue: 0, duration: 130, useNativeDriver: true }),
      Animated.timing(flip, { toValue: 1, duration: 130, useNativeDriver: true }),
    ]).start();
    onOpen(card);
  };

  const jokerColor = card.joker === 'red' ? colors.scoreboardRed : colors.green;
  const suitColor = card.joker ? jokerColor : isRedSuit(card.suit) ? colors.scoreboardRed : colors.green;
  const label = deckCardLabel(card);

  return (
    <Animated.View style={[styles.gridCell, { transform: [{ scaleX: flip }] }]}>
      <Pressable style={styles.gridCellPressable} onPress={handlePress} testID={`browse-card-${card.id}`}>
        {completed ? (
          <View style={[styles.faceCard, card.joker && { borderColor: jokerColor, borderWidth: 1.5 }]}>
            <Text style={[styles.faceLabel, { color: suitColor }, card.joker && styles.jokerLabel]}>{label}</Text>
            <View style={styles.stampWrap}>
              <Text style={styles.stampText}>COMPLETED</Text>
            </View>
          </View>
        ) : (
          <CardBack size="small" />
        )}
      </Pressable>
    </Animated.View>
  );
}

function BrowseGrid({ onOpen }: { onOpen: (card: DeckCardData) => void }) {
  const { isComplete } = useDeckProgress();
  return (
    <View style={styles.grid}>
      {DECK_CARDS.map((card) => (
        <BrowseCard key={card.id} card={card} completed={isComplete(card.id)} onOpen={onOpen} />
      ))}
    </View>
  );
}

function DeckOfWods() {
  const { isComplete, toggleComplete, completedCount, totalCount } = useDeckProgress();
  const [mode, setMode] = useState<Mode>('shuffle');
  const [selectedCard, setSelectedCard] = useState<DeckCardData | null>(null);

  return (
    <View>
      <ModeToggle mode={mode} onChange={setMode} />
      <ProgressLine completed={completedCount} total={totalCount} />

      {mode === 'shuffle' ? <ShuffleArea onDeal={setSelectedCard} /> : <BrowseGrid onOpen={setSelectedCard} />}

      <DeckCardDetailModal
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        isComplete={selectedCard ? isComplete(selectedCard.id) : false}
        onToggleComplete={() => selectedCard && toggleComplete(selectedCard.id)}
      />
    </View>
  );
}

export default function DeckScreen() {
  return (
    <ScreenContainer>
      <MembershipGate>
        <DeckOfWods />
      </MembershipGate>
    </ScreenContainer>
  );
}

const CARD_MARGIN = 6;
const CARD_WIDTH = `${100 / 4 - 4}%`;

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  modeButtonText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  modeButtonTextActive: {
    color: colors.white,
  },
  progressLine: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 20,
  },
  shuffleArea: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  shuffleButton: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingHorizontal: 36,
    paddingVertical: 16,
    marginTop: 28,
  },
  shuffleButtonDisabled: {
    opacity: 0.7,
  },
  shuffleButtonText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 16,
    letterSpacing: 1,
  },
  completeBanner: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  completeBannerTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 28,
    letterSpacing: 1,
    marginTop: 10,
  },
  completeBannerText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridCell: {
    width: CARD_WIDTH,
    aspectRatio: 0.7,
    marginBottom: CARD_MARGIN * 2,
  },
  gridCellPressable: {
    flex: 1,
  },
  faceCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  faceLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  jokerLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  stampWrap: {
    position: 'absolute',
    top: '42%',
    left: -14,
    right: -14,
    backgroundColor: colors.gold,
    paddingVertical: 3,
    transform: [{ rotate: '-18deg' }],
  },
  stampText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 10,
    letterSpacing: 1,
    textAlign: 'center',
  },
});
