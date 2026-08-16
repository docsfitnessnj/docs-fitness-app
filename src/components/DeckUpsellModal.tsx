import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { openDeckStore } from '../lib/links';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export function DeckUpsellModal({ visible, onDismiss }: Props) {
  return (
    <AppModal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <Ionicons name="albums" size={30} color={colors.gold} />
          </View>
          <Text style={styles.headline}>WANT THE{'\n'}REAL THING?</Text>
          <Text style={styles.subtext}>The physical Deck of WODs — 54 cards, $52.</Text>

          <Pressable
            style={styles.getButton}
            onPress={() => {
              openDeckStore();
              onDismiss();
            }}
            testID="deck-upsell-get"
          >
            <Text style={styles.getButtonText}>GET THE DECK</Text>
          </Pressable>

          <Pressable onPress={onDismiss} hitSlop={8} style={styles.dismissLink} testID="deck-upsell-dismiss">
            <Text style={styles.dismissLinkText}>NO THANKS</Text>
          </Pressable>
        </View>
      </View>
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
    alignItems: 'center',
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
    marginBottom: 22,
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
