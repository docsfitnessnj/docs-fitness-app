import React, { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { AppPressable } from './AppPressable';
import { Ionicons } from '@expo/vector-icons';
import { useCommunity } from '../context/CommunityContext';
import { useDeckProgress } from '../context/DeckProgressContext';
import { getCurrentWeek, WEEKDAY_WODS } from '../data/content';
import { DECK_CARDS, deckCardLabel } from '../data/deckCards';
import { MOVEMENTS } from '../data/movements';
import { openDeckCard } from '../lib/deckCardModal';
import { openMemberProfile } from '../lib/memberProfileModal';
import { openMovementVault } from '../lib/movementVaultModal';
import { navigateToTab } from '../lib/navigationRef';
import { openPostDetail } from '../lib/postDetailModal';
import { useFocusRing } from '../lib/useFocusRing';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  // Lifted to App.tsx (alongside `visible`) rather than local state here --
  // this component fully unmounts whenever a WORKOUTS result closes search
  // to switch tabs (see handleSelect below), and local state wouldn't
  // survive that. Lifting it is what makes "back retraces your path"
  // actually hold for every result type, not just the ones that keep this
  // overlay mounted underneath their destination.
  query: string;
  onQueryChange: (query: string) => void;
};

type Result =
  | { id: string; section: 'WORKOUTS'; title: string; subtitle?: string; wodKey: string }
  | { id: string; section: 'DECK CARDS'; title: string; subtitle?: string; cardId: string }
  | { id: string; section: 'COMMUNITY'; title: string; subtitle?: string; postId: string }
  | { id: string; section: 'MEMBERS'; title: string; memberId: string }
  | { id: string; section: 'MOVEMENTS'; title: string; movementId: string };

const SECTION_ORDER: Result['section'][] = ['WORKOUTS', 'DECK CARDS', 'COMMUNITY', 'MEMBERS', 'MOVEMENTS'];

export function SearchModal({ visible, onClose, query, onQueryChange }: Props) {
  const focusRing = useFocusRing();
  const { posts } = useCommunity();
  const { isComplete } = useDeckProgress();

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const wodResults: Result[] = WEEKDAY_WODS.filter(
      (w) => w.title.toLowerCase().includes(q) || w.moves.some((m) => m.toLowerCase().includes(q))
    ).map((w) => ({ id: `wod-${w.key}`, section: 'WORKOUTS', title: w.title, subtitle: w.moves[0], wodKey: w.key }));

    // Uncompleted cards are face-down by design everywhere in the app (the
    // shuffle/mystery mechanic) -- a search result naming one would leak
    // its identity and spoil the shuffle, so they're excluded from the
    // index entirely, not just softened in how they're shown.
    const deckResults: Result[] = DECK_CARDS.filter(
      (c) => isComplete(c.id) && (deckCardLabel(c).toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
    )
      .slice(0, 8)
      .map((c) => ({ id: `deck-${c.id}`, section: 'DECK CARDS', title: `${deckCardLabel(c)} — ${c.title}`, subtitle: c.format, cardId: c.id }));

    const communityResults: Result[] = posts
      .filter(
        (p) =>
          p.author.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.text.toLowerCase().includes(q) ||
          p.meta?.workoutTitle.toLowerCase().includes(q)
      )
      .map((p) => ({
        id: `post-${p.id}`,
        section: 'COMMUNITY',
        title: p.author,
        subtitle: p.kind === 'wod' ? p.meta?.workoutTitle : p.title,
        postId: p.id,
      }));

    // Members aren't a separate directory -- every post already carries its
    // real author's id (Post.authorId, joined against `profiles` the member
    // feed already relies on), so the distinct set of post authors matching
    // the query IS the member index, with no extra lookup/table needed.
    const seenMemberIds = new Set<string>();
    const memberResults: Result[] = [];
    for (const p of posts) {
      if (seenMemberIds.has(p.authorId) || !p.author.toLowerCase().includes(q)) continue;
      seenMemberIds.add(p.authorId);
      memberResults.push({ id: `member-${p.authorId}`, section: 'MEMBERS', title: p.author, memberId: p.authorId });
    }

    const movementResults: Result[] = MOVEMENTS.filter((m) => m.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((m) => ({ id: `movement-${m.id}`, section: 'MOVEMENTS', title: m.name, movementId: m.id }));

    return [...wodResults, ...deckResults, ...communityResults, ...memberResults, ...movementResults];
  }, [query, posts, isComplete]);

  // Every result opens its exact destination, never just the tab it lives
  // in. Deck card / post / member / movement destinations are their own
  // overlay or true Modal, rendered as App.tsx-level singletons (see
  // deckCardModal.ts / postDetailModal.ts / memberProfileModal.ts /
  // movementVaultModal.ts) -- opening one leaves THIS overlay mounted,
  // unclosed, directly underneath it (both share ScreenOverlay's zIndex;
  // AppModal's own portal renders above that regardless), so closing the
  // destination lands back on these exact results with the query intact,
  // no extra state needed. A WORKOUTS result is the one exception: the
  // WODs tab has no overlay of its own to stack on top of, so reaching it
  // means closing this overlay to reveal the real tab underneath -- the
  // lifted `query` prop (see Props above) is what still makes reopening
  // search land back on the same results afterward.
  const handleSelect = (result: Result) => {
    if (result.section === 'WORKOUTS') {
      const day = getCurrentWeek().find((d) => d.wod?.key === result.wodKey);
      onClose();
      if (day) navigateToTab('DocsWods', { jumpToDate: day.date.getTime() });
      return;
    }
    if (result.section === 'DECK CARDS') {
      openDeckCard(result.cardId);
    } else if (result.section === 'COMMUNITY') {
      openPostDetail(result.postId);
    } else if (result.section === 'MEMBERS') {
      openMemberProfile(result.memberId);
    } else {
      openMovementVault(result.movementId, 'SEARCH');
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.container} nativeID="search-screen-container">
      <View style={[styles.searchRow, { borderColor: focusRing.borderColor }]}>
        <Ionicons name="search" size={18} color={colors.green} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onQueryChange}
          onFocus={focusRing.onFocus}
          onBlur={focusRing.onBlur}
          placeholder="Search the app"
          placeholderTextColor={colors.textMuted}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          nativeID="app-search-input"
          aria-label="Search the app"
        />
        <AppPressable onPress={onClose} hitSlop={8}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </AppPressable>
      </View>

      {query.trim().length === 0 ? (
        <Text style={styles.hint}>Start typing to search the whole app.</Text>
      ) : results.length === 0 ? (
        <Text style={styles.hint}>No results for "{query}".</Text>
      ) : (
        SECTION_ORDER.map((section) => {
          const sectionResults = results.filter((r) => r.section === section);
          if (sectionResults.length === 0) return null;
          return (
            <View key={section} style={styles.section}>
              <Text style={styles.sectionLabel}>{section}</Text>
              {sectionResults.map((r) => (
                <AppPressable key={r.id} style={styles.resultRow} onPress={() => handleSelect(r)}>
                  <Text style={styles.resultTitle}>{r.title}</Text>
                  {'subtitle' in r && r.subtitle && <Text style={styles.resultSubtitle}>{r.subtitle}</Text>}
                </AppPressable>
              ))}
            </View>
          );
        })
      )}
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
    paddingHorizontal: 20,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    marginLeft: 8,
    marginRight: 8,
  },
  cancelText: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  hint: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 40,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    color: colors.green,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  resultRow: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  resultTitle: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  resultSubtitle: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 2,
  },
});
