import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { MembershipGate } from '../components/MembershipGate';
import { DeckCardDetailModal } from '../components/DeckCardDetailModal';
import { DECK_CARDS, DeckCardData, deckCardLabel, isRedSuit } from '../data/deckCards';
import { colors, fonts } from '../theme';

function PlayingCard({ card, onPress }: { card: DeckCardData; onPress: () => void }) {
  const jokerColor = card.joker === 'red' ? '#D9534F' : colors.text;
  const suitColor = card.joker ? jokerColor : isRedSuit(card.suit) ? '#D9534F' : colors.text;
  const label = deckCardLabel(card);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, card.joker && { borderColor: jokerColor, borderWidth: 1.5 }]}
    >
      <Text style={[styles.cardLabel, { color: suitColor }, card.joker && styles.jokerLabel]}>{label}</Text>
    </Pressable>
  );
}

function DeckOfWods() {
  const [selectedCard, setSelectedCard] = useState<DeckCardData | null>(null);

  return (
    <View>
      <Text style={styles.subtitle}>54 WODs. Every card is a real workout. Tap one to see it.</Text>
      <View style={styles.grid}>
        {DECK_CARDS.map((card) => (
          <PlayingCard key={card.id} card={card} onPress={() => setSelectedCard(card)} />
        ))}
      </View>
      <DeckCardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
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
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: CARD_WIDTH,
    aspectRatio: 0.7,
    backgroundColor: colors.backgroundLight,
    borderRadius: 8,
    marginBottom: CARD_MARGIN * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  jokerLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
