import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalHeader } from '../components/ModalHeader';
import { MovementVideoPlayer } from '../components/movement/MovementVideoPlayer';
import { useMembership } from '../context/MembershipContext';
import { getCurrentWeek } from '../data/content';
import { deckCardLabel } from '../data/deckCards';
import { Movement, getMovementById, searchMovements } from '../data/movements';
import { openDeckCard } from '../lib/deckCardModal';
import { findReferencesForMovement } from '../lib/movementMatcher';
import { navigateToTab } from '../lib/navigationRef';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  // Set when opened by tapping a movement name elsewhere in the app —
  // jumps straight to that movement's detail view instead of the list.
  initialMovementId?: string;
  // Names where that direct-to-detail open came from ("WORKOUT", "DECK
  // CARD", "CHALLENGE") — shown on the BACK button and used to send the
  // user back there instead of into the vault's own list.
  initialReturnLabel?: string;
};

type Section = { title: string; data: Movement[] };

// Most movements have a short, glanceable cue list, but a handful run long
// (a combo move with several distinct steps). Past this many, cues collapse
// behind a "SHOW MORE" toggle so the detail view doesn't open into a wall
// of bullets.
const VISIBLE_CUES_LIMIT = 5;

function buildSections(movements: Movement[]): Section[] {
  const groups = new Map<string, Movement[]>();
  for (const movement of [...movements].sort((a, b) => a.name.localeCompare(b.name))) {
    const letter = movement.name.charAt(0).toUpperCase();
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(movement);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, data]) => ({ title, data }));
}

export function MovementVaultScreen({ visible, onClose, initialMovementId, initialReturnLabel }: Props) {
  // Round 30, owner decision, final: APPEARS IN is shown only to accounts
  // with full workout access (paid online, in person unlimited, active
  // trial, admin) -- every limited tier (online free, ten pack, drop in,
  // guest, booking only) gets no APPEARS IN section at all on movement
  // detail, no locked rows, no teaser list, regardless of reference type.
  // A limited-access account's deck card reference used to open the real
  // DeckCardDetailModal with full workout content and a working MARK
  // COMPLETE button -- a paywall leak, since that account has no Deck
  // access at all. Hiding the section here is the first of two closures:
  // the deck card door itself is also gated directly, in App.tsx (see its
  // own comment there) -- hiding the section here is belt, that gate is
  // suspenders, since a future caller of findReferencesForMovement
  // shouldn't have to remember this rule to stay safe.
  const { fullContentAccess } = useMembership();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(initialMovementId);
  // True while the detail view on screen is still the one the vault was
  // opened directly into (a tapped movement name), rather than one the user
  // reached by browsing the list themselves. Only in that state should BACK
  // return to wherever the vault was opened from instead of the list.
  const [directEntry, setDirectEntry] = useState(!!initialMovementId);
  const [cuesExpanded, setCuesExpanded] = useState(false);

  // Every fresh open (including re-opening straight into a different
  // movement's detail view) should start from a clean slate.
  useEffect(() => {
    if (visible) {
      setSelectedId(initialMovementId);
      setDirectEntry(!!initialMovementId);
      setQuery('');
    }
  }, [visible, initialMovementId]);

  // A newly opened detail view always starts with any long cue list
  // collapsed, whether it was reached by browsing or opened directly.
  useEffect(() => {
    setCuesExpanded(false);
  }, [selectedId]);

  if (!visible) return null;

  const selected = selectedId ? getMovementById(selectedId) : undefined;

  if (selected) {
    const references = findReferencesForMovement(selected);
    const handleDetailBack = () => {
      if (directEntry) {
        // Never insert the vault's list into the stack for a direct open —
        // back retraces to wherever the user actually came from.
        onClose();
      } else {
        setSelectedId(undefined);
      }
    };
    return (
      <View style={styles.container}>
        <ModalHeader
          title={selected.name}
          onBack={handleDetailBack}
          backTestID="movement-detail-back"
          backLabel={directEntry && initialReturnLabel ? `BACK TO ${initialReturnLabel}` : undefined}
        />

        <ScrollView contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
          <MovementVideoPlayer video={selected.video} />

          {selected.cues.length > 0 && (
            <>
              <Text style={styles.cuesHeading}>COACHING CUES</Text>
              {(cuesExpanded ? selected.cues : selected.cues.slice(0, VISIBLE_CUES_LIMIT)).map((cue, index) => (
                <View key={index} style={styles.cueRow}>
                  <View style={styles.cueBullet} />
                  <Text style={styles.cueText}>{cue}</Text>
                </View>
              ))}
              {selected.cues.length > VISIBLE_CUES_LIMIT && (
                <Pressable
                  style={styles.showMoreCues}
                  onPress={() => setCuesExpanded((prev) => !prev)}
                  testID="movement-cues-toggle"
                >
                  <Text style={styles.showMoreCuesText}>
                    {cuesExpanded ? 'READ LESS' : 'READ MORE'}
                  </Text>
                  <Ionicons
                    name={cuesExpanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={colors.green}
                  />
                </Pressable>
              )}
            </>
          )}

          {fullContentAccess && references.length > 0 && (
            <>
              <Text style={styles.referencesHeading}>APPEARS IN</Text>
              {references.map((ref, index) => (
                <Pressable
                  key={index}
                  style={styles.referenceRow}
                  onPress={() => {
                    if (ref.type === 'deck') {
                      // Opens as its own true Modal stacked ON TOP of this
                      // vault (same mechanism Search's own DECK CARDS result
                      // already uses) -- the vault stays mounted, unclosed,
                      // underneath it. Closing the card (its own X or a
                      // backdrop tap, both already wired) reveals this
                      // detail view again exactly as it was; its own BACK
                      // button then retraces to the original workout. This
                      // was the real dead end: the old `onClose()` +
                      // `navigation.navigate('Deck')` discarded the vault's
                      // own stack and dropped a limited-access member onto
                      // the Deck tab's full-screen "JOIN THE BOATHOUSE"
                      // paywall with no way back to what they were doing.
                      openDeckCard(ref.card.id);
                      return;
                    }
                    // A WOD reference has no overlay of its own to stack on
                    // (same structural gap Search's own WORKOUTS result
                    // already has, and already resolves the same way --
                    // see SearchModal.tsx's handleSelect) -- reaching it
                    // means closing the vault to reveal the real tab
                    // underneath. jumpToDate (missing before this fix) is
                    // what makes it land on the exact referenced day, not
                    // whichever day the WODs tab happened to have selected.
                    const day = getCurrentWeek().find((d) => d.wod?.key === ref.wod.key);
                    onClose();
                    if (day) navigateToTab('DocsWods', { jumpToDate: day.date.getTime() });
                  }}
                  testID={`movement-reference-${index}`}
                >
                  <Ionicons
                    name={ref.type === 'deck' ? 'albums-outline' : 'flame-outline'}
                    size={16}
                    color={colors.green}
                  />
                  <Text style={styles.referenceText} numberOfLines={1}>
                    {ref.type === 'deck' ? `${deckCardLabel(ref.card)} — ${ref.card.title}` : ref.wod.title}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  const sections = buildSections(searchMovements(query));

  return (
    <View style={styles.container}>
      <ModalHeader title="THE MOVEMENT VAULT" onBack={onClose} backTestID="movement-vault-close" />

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.green} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search movements"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          nativeID="vault-search-input-field"
          aria-label="Search movements"
          testID="vault-search-input"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.listContent}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            style={styles.movementRow}
            onPress={() => {
              // Reached via the list itself, not a direct link — BACK from
              // this detail view belongs on the list, not wherever the
              // vault first opened from.
              setDirectEntry(false);
              setSelectedId(item.id);
            }}
            testID={`vault-movement-${item.id}`}
          >
            <Text style={styles.movementRowText}>{item.name}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No movements match "{query}".</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // No paddingTop here -- ScreenOverlay's own fill (topBasePadding={60})
  // provides it as a single additive source with the real top inset. See
  // AGENTS.md's "Web safe-area insets always report zero" writeup.
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionHeaderText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1.5,
  },
  movementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  movementRowText: {
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 32,
  },
  detailBody: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  cuesHeading: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
    marginTop: 22,
    marginBottom: 10,
  },
  cueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cueBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green,
    marginTop: 7,
    marginRight: 10,
  },
  cueText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
  },
  showMoreCues: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 2,
  },
  showMoreCuesText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  referencesHeading: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 20,
    letterSpacing: 0.5,
    marginTop: 22,
    marginBottom: 10,
  },
  referenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  referenceText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
  },
});
