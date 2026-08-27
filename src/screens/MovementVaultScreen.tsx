import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ModalHeader } from '../components/ModalHeader';
import { MovementVideoPlayer } from '../components/movement/MovementVideoPlayer';
import { deckCardLabel } from '../data/deckCards';
import { Movement, getMovementById, searchMovements } from '../data/movements';
import { findReferencesForMovement } from '../lib/movementMatcher';
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
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(initialMovementId);
  // True while the detail view on screen is still the one the vault was
  // opened directly into (a tapped movement name), rather than one the user
  // reached by browsing the list themselves. Only in that state should BACK
  // return to wherever the vault was opened from instead of the list.
  const [directEntry, setDirectEntry] = useState(!!initialMovementId);

  // Every fresh open (including re-opening straight into a different
  // movement's detail view) should start from a clean slate.
  useEffect(() => {
    if (visible) {
      setSelectedId(initialMovementId);
      setDirectEntry(!!initialMovementId);
      setQuery('');
    }
  }, [visible, initialMovementId]);

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

          <Text style={styles.cuesHeading}>COACHING CUES</Text>
          {selected.cues.map((cue, index) => (
            <View key={index} style={styles.cueRow}>
              <View style={styles.cueBullet} />
              <Text style={styles.cueText}>{cue}</Text>
            </View>
          ))}

          {references.length > 0 && (
            <>
              <Text style={styles.referencesHeading}>APPEARS IN</Text>
              {references.map((ref, index) => (
                <Pressable
                  key={index}
                  style={styles.referenceRow}
                  onPress={() => {
                    onClose();
                    navigation.navigate(ref.type === 'deck' ? 'Deck' : 'DocsWods');
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
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
    fontSize: 15,
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
