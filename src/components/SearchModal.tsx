import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useCommunity } from '../context/CommunityContext';
import { WEEKDAY_WODS } from '../data/content';
import { DECK_CARDS, deckCardLabel } from '../data/deckCards';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Result = {
  id: string;
  section: 'WORKOUTS' | 'DECK CARDS' | 'COMMUNITY';
  title: string;
  subtitle?: string;
  tab: string;
};

export function SearchModal({ visible, onClose }: Props) {
  const [query, setQuery] = useState('');
  const { posts } = useCommunity();
  const navigation = useNavigation<any>();

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const wodResults: Result[] = WEEKDAY_WODS.filter(
      (w) => w.title.toLowerCase().includes(q) || w.moves.some((m) => m.toLowerCase().includes(q))
    ).map((w) => ({ id: `wod-${w.key}`, section: 'WORKOUTS', title: w.title, subtitle: w.moves[0], tab: 'DocsWods' }));

    const deckResults: Result[] = DECK_CARDS.filter(
      (c) => deckCardLabel(c).toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
    )
      .slice(0, 8)
      .map((c) => ({ id: `deck-${c.id}`, section: 'DECK CARDS', title: `${deckCardLabel(c)} — ${c.title}`, subtitle: c.format, tab: 'Deck' }));

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
        tab: 'Community',
      }));

    return [...wodResults, ...deckResults, ...communityResults];
  }, [query, posts]);

  const sections: Result['section'][] = ['WORKOUTS', 'DECK CARDS', 'COMMUNITY'];

  const handleSelect = (result: Result) => {
    setQuery('');
    onClose();
    navigation.navigate(result.tab);
  };

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.green} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search the app"
          placeholderTextColor={colors.textMuted}
          autoFocus
          nativeID="app-search-input"
          aria-label="Search the app"
        />
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </Pressable>
      </View>

      {query.trim().length === 0 ? (
        <Text style={styles.hint}>Start typing to search the whole app.</Text>
      ) : results.length === 0 ? (
        <Text style={styles.hint}>No results for "{query}".</Text>
      ) : (
        sections.map((section) => {
          const sectionResults = results.filter((r) => r.section === section);
          if (sectionResults.length === 0) return null;
          return (
            <View key={section} style={styles.section}>
              <Text style={styles.sectionLabel}>{section}</Text>
              {sectionResults.map((r) => (
                <Pressable key={r.id} style={styles.resultRow} onPress={() => handleSelect(r)}>
                  <Text style={styles.resultTitle}>{r.title}</Text>
                  {r.subtitle && <Text style={styles.resultSubtitle}>{r.subtitle}</Text>}
                </Pressable>
              ))}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
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
    fontSize: 15,
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
