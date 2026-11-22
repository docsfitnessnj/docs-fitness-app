import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { ExternalLinkPressable } from './ExternalLinkPressable';
import { useMembership } from '../context/MembershipContext';
import {
  DECK_FREE_TIER_NOTE,
  DECK_MEMBER_CHECKOUT_NOTE,
  DECK_MEMBER_NOTE,
  DECK_MEMBER_PRICE,
  DECK_REGULAR_PRICE,
  deckStoreUrl,
} from '../data/deckPricing';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export function DeckUpsellModal({ visible, onDismiss }: Props) {
  const { fullContentAccess } = useMembership();
  return (
    <AppModal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Pressable onPress={onDismiss} hitSlop={8} style={styles.closeButton} testID="deck-upsell-close">
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
          <View style={styles.iconWrap}>
            <Ionicons name="albums" size={30} color={colors.gold} />
          </View>
          <Text style={styles.headline}>WANT THE{'\n'}REAL THING?</Text>
          <Text style={styles.subtext}>The physical Deck of WODs — 54 cards.</Text>

          {/* Round 65 Part 4: a standing member price, not a sale. */}
          <View style={styles.priceRow} testID="deck-price-row">
            <Text style={styles.price} testID="deck-price-value">
              {fullContentAccess ? DECK_MEMBER_PRICE : DECK_REGULAR_PRICE}
            </Text>
            {fullContentAccess && (
              <Text style={styles.struckPrice} testID="deck-struck-price">
                {DECK_REGULAR_PRICE}
              </Text>
            )}
          </View>
          <View style={styles.priceNoteGroup}>
            <Text style={styles.priceNote} testID="deck-price-note">
              {fullContentAccess ? DECK_MEMBER_NOTE : DECK_FREE_TIER_NOTE}
            </Text>
            {fullContentAccess && (
              <Text style={[styles.priceNote, styles.priceNoteSecondLine]} testID="deck-price-checkout-note">
                {DECK_MEMBER_CHECKOUT_NOTE}
              </Text>
            )}
          </View>

          <ExternalLinkPressable
            href={deckStoreUrl(fullContentAccess)}
            style={styles.getButton}
            onPress={onDismiss}
            testID="deck-upsell-get"
          >
            <Text style={styles.getButtonText}>GET THE DECK</Text>
          </ExternalLinkPressable>

          <Pressable onPress={onDismiss} hitSlop={8} style={styles.dismissLink} testID="deck-upsell-dismiss">
            <Text style={styles.dismissLinkText}>NOT YET</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(18,33,28,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 24,
    paddingTop: 44,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 1,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headline: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: 1,
    textAlign: 'center',
  },
  subtext: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 10,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 14,
  },
  price: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 26,
    letterSpacing: 0.5,
  },
  struckPrice: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 17,
    textDecorationLine: 'line-through',
  },
  priceNoteGroup: {
    marginTop: 4,
    marginBottom: 22,
    alignItems: 'center',
  },
  priceNote: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    textAlign: 'center',
  },
  priceNoteSecondLine: {
    marginTop: 2,
  },
  getButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  getButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  dismissLink: {
    marginTop: 16,
  },
  dismissLinkText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
