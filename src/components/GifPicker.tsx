import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppPressable } from './AppPressable';
import { GiphyGif, fetchTrendingGifs, searchGifs } from '../lib/giphy';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { useFocusRing } from '../lib/useFocusRing';
import { colors, fonts } from '../theme';

type Props = {
  onSelect: (gif: GiphyGif) => void;
  onClose: () => void;
};

const SEARCH_DEBOUNCE_MS = 500;

// Shared GIF search panel — mounted directly above the input row in both
// DOC'S GROUP CHAT's composer and the Community comment composer (see each
// caller for exactly where). GIPHY trending loads the instant this opens;
// typing a query debounces (useDebouncedValue) before it ever becomes a
// network request, and a settled EMPTY query falls back to trending rather
// than firing a request at all. This key is a rate-limited beta key (~100
// requests/hour, see giphy.ts), so both of those exist specifically to
// keep this frugal, not just for snappiness.
export function GifPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const focusRing = useFocusRing();
  // Guards against an in-flight request from a STALE query resolving after
  // a newer one already started (e.g. a slow trending fetch outlasting the
  // first debounced search) and clobbering the grid with outdated results.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(false);
    const request = debouncedQuery ? searchGifs(debouncedQuery) : fetchTrendingGifs();
    request
      .then((results) => {
        if (requestIdRef.current !== requestId) return;
        setGifs(results);
        setLoading(false);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setError(true);
        setLoading(false);
      });
  }, [debouncedQuery]);

  return (
    <View style={styles.panel} testID="gif-picker">
      <View style={styles.header}>
        <View style={[styles.searchPill, { borderColor: focusRing.borderColor }]}>
          <Ionicons name="search-outline" size={15} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search GIPHY"
            placeholderTextColor={colors.textMuted}
            onFocus={focusRing.onFocus}
            onBlur={focusRing.onBlur}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            aria-label="Search GIPHY"
            testID="gif-picker-search"
          />
        </View>
        <AppPressable onPress={onClose} hitSlop={8} style={styles.closeButton} testID="gif-picker-close">
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </AppPressable>
      </View>

      <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid} testID="gif-picker-grid">
        {loading ? (
          <View style={styles.statusBox}>
            <ActivityIndicator color={colors.green} testID="gif-picker-loading" />
          </View>
        ) : error ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>Couldn't load GIFs. Try again.</Text>
          </View>
        ) : gifs.length === 0 ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>No GIFs found.</Text>
          </View>
        ) : (
          gifs.map((gif) => (
            <AppPressable
              key={gif.id}
              onPress={() => onSelect(gif)}
              style={styles.tile}
              testID={`gif-picker-result-${gif.id}`}
            >
              <Image source={{ uri: gif.gridUrl }} style={styles.tileImage} resizeMode="cover" />
            </AppPressable>
          ))
        )}
      </ScrollView>

      {/* GIPHY attribution mark — required by their API terms, kept small
          and quiet rather than a loud badge. */}
      <View style={styles.attributionRow}>
        <Text style={styles.attributionText}>Powered by GIPHY</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    backgroundColor: colors.card,
    marginBottom: 10,
    padding: 10,
    maxHeight: 340,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    // 16px, not the originally-smaller size this matched the search icon
    // to -- iOS Safari auto-zooms the whole page on focusing any input
    // under 16px, which no amount of viewport-meta locking can override.
    // See AGENTS.md's "iOS input zoom" writeup.
    fontSize: 16,
    padding: 0,
  },
  closeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridScroll: {
    maxHeight: 240,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingBottom: 4,
  },
  statusBox: {
    width: '100%',
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  tile: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  attributionRow: {
    alignItems: 'center',
    marginTop: 6,
  },
  attributionText: {
    color: colors.textMuted,
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
