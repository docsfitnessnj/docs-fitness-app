import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { JoinBoathouseLock } from './JoinBoathouseLock';
import { DeckVideoWatchLine } from './DeckVideoWatchLine';
import { LogResultsModal } from './LogResultsModal';
import { TappableMovementText } from './movement/TappableMovementText';
import { DeckCardData, deckCardLabel, isRedSuit } from '../data/deckCards';
import { openMovementVault } from '../lib/movementVaultModal';
import { colors, fonts } from '../theme';

type Props = {
  card: DeckCardData | null;
  onClose: () => void;
  isComplete: boolean;
  onToggleComplete: () => void;
  // Round 30: every door that can open this modal (Movement Vault's own
  // APPEARS IN -- gated to not even reach here anymore, see
  // MovementVaultScreen.tsx -- and Search's DECK CARDS result, which still
  // can) funnels through this ONE global instance (see its single render
  // site in App.tsx). Gating here, once, is what makes every door safe by
  // construction instead of needing the same check repeated at each call
  // site, including any future one. True for a limited tier (online free,
  // ten pack, drop in, guest, booking only), which has no Deck access —
  // defaults false so DeckScreen's own local, in-tab usage (reached only
  // from inside MembershipGate, which already means fullContentAccess is
  // true there) never has to pass it.
  locked?: boolean;
};

export function DeckCardDetailModal({ card, onClose, isComplete, onToggleComplete, locked = false }: Props) {
  // Round 44 — a real Log Results form for deck cards, for the first time
  // (this used to be MARK-COMPLETE-only, no results logging at all; see
  // AGENTS.md's Round 44 writeup). Reuses the exact same LogResultsModal
  // the WOD path already has, bound to deck_completions via its own
  // `logSource="deck"` prop.
  const [logOpen, setLogOpen] = useState(false);

  if (!card) return null;

  const jokerColor = card.joker === 'red' ? colors.scoreboardRed : colors.green;
  const suitColor = card.joker ? jokerColor : isRedSuit(card.suit) ? colors.scoreboardRed : colors.green;
  const label = deckCardLabel(card);

  if (locked) {
    return (
      <AppModal visible transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton} testID="deck-card-close">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
            <View style={styles.lockedBody}>
              <JoinBoathouseLock subtext="This card is part of The Deck of WODs — for members." onUnlock={onClose} />
            </View>
          </Pressable>
        </Pressable>
      </AppModal>
    );
  }

  return (
    <AppModal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, card.joker && { borderColor: jokerColor, borderWidth: 2 }]} onPress={() => {}}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton} testID="deck-card-close">
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>

          <Text style={[styles.corner, styles.cornerTopLeft, { color: suitColor }]}>{label}</Text>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{card.title}</Text>
            {card.format ? <Text style={styles.format}>{card.format}</Text> : null}
            <DeckVideoWatchLine videoUrl={card.videoUrl} />

            <View style={styles.divider} />

            {card.movements.map((move, index) => (
              <View key={index} style={styles.moveRow}>
                <View style={[styles.bullet, { backgroundColor: suitColor }]} />
                <TappableMovementText
                  style={styles.moveText}
                  text={move}
                  // This card renders in a true Modal (portaled above every
                  // ScreenOverlay — see ModalRootContext), so the vault
                  // would open uninteractive underneath it unless this
                  // modal closes first.
                  onOpenMovement={(movementId) => {
                    onClose();
                    openMovementVault(movementId, 'DECK CARD');
                  }}
                />
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

            <Pressable style={styles.logResultsButton} onPress={() => setLogOpen(true)} testID="deck-card-log-results">
              <Ionicons name="create-outline" size={16} color={colors.textMuted} />
              <Text style={styles.logResultsButtonText}>LOG RESULTS</Text>
            </Pressable>

            <Text style={[styles.corner, styles.cornerBottomRight, { color: suitColor }]}>{label}</Text>
          </ScrollView>
        </Pressable>
      </Pressable>

      <LogResultsModal
        visible={logOpen}
        onClose={() => setLogOpen(false)}
        logSource="deck"
        dayKey={card.id}
        workoutTitle={card.title}
        dateLabel=""
        date={new Date()}
        movements={card.movements}
      />
    </AppModal>
  );
}

const styles = StyleSheet.create({
  lockedBody: {
    minHeight: 280,
  },
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
  // Round 44 — a quiet, secondary button under MARK COMPLETE, since
  // logging structured results is an optional extra on top of the binary
  // complete/incomplete flag, never a replacement for it.
  logResultsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 6,
  },
  logResultsButtonText: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
  },
});
