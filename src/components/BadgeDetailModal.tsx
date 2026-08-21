import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal } from './AppModal';
import { BadgeIcon } from './icons/BadgeIcon';
import { BadgeId, BADGE_MAP } from '../data/badges';
import { openDeckStore } from '../lib/links';
import { colors, fonts } from '../theme';

type Props = {
  badgeId: BadgeId | null;
  earned: boolean;
  onClose: () => void;
  // Only wired up when this modal can actually route to Message Doc (i.e.
  // from the Trophy Case) — omit it (e.g. from the Profile grid) and the
  // Joker's verify button just isn't shown.
  onVerifyJoker?: () => void;
};

// Tap-to-inspect for any badge, earned or not — the whole reason the unearned
// ones render as gray silhouettes instead of disappearing: this modal is
// what tells you how to go earn one.
export function BadgeDetailModal({ badgeId, earned, onClose, onVerifyJoker }: Props) {
  if (!badgeId) return null;
  const def = BADGE_MAP[badgeId];

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton} testID="badge-detail-close">
            <Text style={styles.closeText}>✕</Text>
          </Pressable>

          <BadgeIcon id={badgeId} earned={earned} size={72} />
          <Text style={styles.name}>{def.name}</Text>
          <Text style={styles.kindLabel}>{def.kind === 'permanent' ? 'PERMANENT BADGE' : 'WEEKLY BADGE'}</Text>
          <Text style={styles.description}>{def.description}</Text>

          {badgeId === 'joker' && (
            <View style={styles.jokerBlock}>
              <Text style={styles.jokerPrompt}>Own the physical Deck of WODs? Send Doc a photo to verify.</Text>
              {onVerifyJoker && (
                <Pressable style={styles.verifyButton} onPress={onVerifyJoker} testID="verify-ownership-button">
                  <Text style={styles.verifyButtonText}>VERIFY OWNERSHIP</Text>
                </Pressable>
              )}
              <Pressable style={styles.getDeckButton} onPress={openDeckStore} testID="get-the-deck-button">
                <Text style={styles.getDeckButtonText}>GET THE DECK</Text>
              </Pressable>
            </View>
          )}
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
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 16,
  },
  closeText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  name: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 26,
    letterSpacing: 0.5,
    marginTop: 14,
    textAlign: 'center',
  },
  kindLabel: {
    color: colors.gold,
    fontFamily: fonts.labelBold,
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 4,
  },
  description: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 12,
  },
  jokerBlock: {
    width: '100%',
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    alignItems: 'center',
  },
  jokerPrompt: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 14,
  },
  verifyButton: {
    width: '100%',
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  verifyButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  getDeckButton: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  getDeckButtonText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
