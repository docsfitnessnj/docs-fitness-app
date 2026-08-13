import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { MembershipGate } from '../components/MembershipGate';
import { colors, fonts } from '../theme';

const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

const DECK = SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}`));

function PlayingCard({ label }: { label: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <View style={styles.lockBadge}>
        <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
      </View>
    </View>
  );
}

function DeckOfWods() {
  return (
    <View>
      <Text style={styles.subtitle}>52 WODs. Each card is a workout. Earn cards to unlock them.</Text>
      <View style={styles.grid}>
        {DECK.map((label) => (
          <PlayingCard key={label} label={label} />
        ))}
      </View>
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
    backgroundColor: colors.locked,
    borderRadius: 8,
    marginBottom: CARD_MARGIN * 2,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.55,
  },
  cardLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  lockBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
  },
});
