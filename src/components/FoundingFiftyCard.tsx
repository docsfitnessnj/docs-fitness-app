import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FOUNDING_FIFTY_PRICE } from '../context/FoundingFiftyContext';
import { ONLINE_PLANS } from '../data/plans';
import { colors, fonts } from '../theme';

type Props = {
  spotsRemaining: number;
  capacity: number;
  onPress: () => void;
};

// The regular online rate this locks against, struck through on the card —
// read from plans.ts so it can never drift out of sync with the real price.
const REGULAR_MONTHLY_PRICE = ONLINE_PLANS.find((p) => p.key === 'monthly')!.price;

// Launch-weekend-only card — appears first on the online plans list,
// above MONTHLY, whenever the Founding 50 flag is on and spots remain.
export function FoundingFiftyCard({ spotsRemaining, capacity, onPress }: Props) {
  return (
    <View style={styles.card} testID="founding-fifty-card">
      <View style={styles.banner}>
        <Text style={styles.bannerText}>THE FOUNDING 50</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.counter} testID="founding-fifty-counter">
          {spotsRemaining} of {capacity} spots left
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>
            ${FOUNDING_FIFTY_PRICE}
            <Text style={styles.priceCadence}> / month</Text>
          </Text>
          <Text style={styles.struckPrice}>{REGULAR_MONTHLY_PRICE}</Text>
        </View>

        <Text style={styles.description}>
          Locked at ${FOUNDING_FIFTY_PRICE} a month for as long as you're a member. When the 50 are gone, they're gone.
        </Text>

        <Pressable style={styles.selectButton} onPress={onPress} testID="select-founding-fifty">
          <Text style={styles.selectButtonText}>CLAIM YOUR SPOT</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.gold,
    borderRadius: 14,
    overflow: 'hidden',
  },
  banner: {
    backgroundColor: colors.gold,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  bannerText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 2,
  },
  body: {
    padding: 20,
  },
  counter: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  price: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 40,
    letterSpacing: 1,
  },
  priceCadence: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: colors.textMuted,
  },
  struckPrice: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 20,
    textDecorationLine: 'line-through',
  },
  description: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
  selectButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 16,
  },
  selectButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
});
