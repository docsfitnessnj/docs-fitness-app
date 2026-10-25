import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppPressable } from './AppPressable';
import { HUNDRED_DOWN_TARGET, useBadges } from '../context/BadgeContext';
import { useDeckProgress } from '../context/DeckProgressContext';
import { DECK_CARDS } from '../data/deckCards';
import { useCompletionShareCardState } from '../lib/completionShareCard';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  DECK_CARD_HEIGHT,
  ShareCardPayload,
  canvasToBlob,
  deckInkColor,
  drawShareCard,
  pickRandomColorway,
} from '../lib/shareCardRender';
import { saveCardImage, shareCardImage } from '../lib/shareCardSave';
import { showAlert } from '../lib/alert';
import { useActionCompletion } from '../lib/useActionCompletion';
import { colors, fonts } from '../theme';

const PREVIEW_MAX_WIDTH = 340;

// Round 33: THE COMPLETION SHARE CARD. A full-screen takeover, rendered
// once, globally, in App.tsx -- fed by completionShareCard.ts's module
// ref so any of the four completion call sites can open it without prop-
// drilling, same convention as DeckCardDetailModal/PostDetailModal.
// Standing popup rule: an X in the top right, nobody is ever trapped.
// Closing it changes nothing about the completion itself, which already
// happened before this ever opened.
export function CompletionShareCardOverlay() {
  const [source, setSource] = useCompletionShareCardState();
  const { totalWorkoutsLogged } = useBadges();
  const { isComplete: isDeckCardComplete } = useDeckProgress();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  // A fresh colorway every time a NEW standard-card source opens --
  // `source` is a new object literal on every openCompletionShareCard()
  // call, so this recomputes exactly once per completion and stays put
  // across any re-render of that same open instance (e.g. the badge
  // count arriving a tick later never reshuffles the color underneath
  // the member).
  const colorway = useMemo(() => pickRandomColorway(), [source]);

  const deckCardNumber = useMemo(() => {
    if (!source || source.kind !== 'deck') return 0;
    return DECK_CARDS.filter((c) => !c.joker && isDeckCardComplete(c.id)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, isDeckCardComplete]);

  const payload: ShareCardPayload | null = useMemo(() => {
    if (!source) return null;
    if (source.kind === 'deck') {
      return { variant: 'deck', card: source.card, date: source.date, workoutNumber: totalWorkoutsLogged, deckCardNumber };
    }
    return { variant: 'standard', colorway, title: source.title, date: source.date, workoutNumber: totalWorkoutsLogged };
  }, [source, colorway, totalWorkoutsLogged, deckCardNumber]);

  // Mounts a real DOM <canvas> into the host element behind this app's own
  // `nativeID` convention -- react-native-web has no Canvas primitive of
  // its own, and this is the same "drop to the real DOM, by nativeID, when
  // RN has no primitive for it" technique the rest of this app already
  // uses throughout (index.html's own safe-area probes, every id-keyed CSS
  // override), not a one-off workaround.
  useEffect(() => {
    const host = document.getElementById('completion-share-card-canvas-host');
    if (!host) return;
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    host.appendChild(canvas);
    canvasRef.current = canvas;
    return () => {
      host.removeChild(canvas);
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source !== null]);

  useEffect(() => {
    if (!payload || !canvasRef.current) return;
    setReady(false);
    let cancelled = false;
    // A rejected draw (the real bug this comment documents: an asset
    // resolution call that threw in production, see shareCardRender.ts's
    // own resolveUri) must never leave `ready` false forever with no DOM
    // signal at all -- `ready` only gates the loading spinner's own
    // visibility, never whether SHARE/SAVE work, so surfacing whatever
    // partially drew (background, title, date are already painted before
    // any image await) beats a spinner stuck up permanently.
    drawShareCard(canvasRef.current, payload)
      .catch(() => {})
      .then(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const { status: shareStatus, run: runShare } = useActionCompletion();
  const { status: saveStatus, run: runSave } = useActionCompletion();

  const handleClose = () => setSource(null);

  const handleShare = () => {
    runShare(async () => {
      const canvas = canvasRef.current;
      if (!canvas) return false;
      const blob = await canvasToBlob(canvas);
      if (!blob) {
        showAlert('Share Failed', "Couldn't prepare the image. Try again.");
        return false;
      }
      const result = await shareCardImage(blob, payload?.variant === 'deck' ? payload.card.title : payload?.title ?? 'workout');
      if (result === 'canceled') return false;
      if (result === 'saved') {
        showAlert('Saved Instead', "Your browser couldn't open the share sheet, so the card was saved to your device instead.");
      }
      return true;
    });
  };

  const handleSave = () => {
    runSave(async () => {
      const canvas = canvasRef.current;
      if (!canvas) return false;
      const blob = await canvasToBlob(canvas);
      if (!blob) {
        showAlert('Save Failed', "Couldn't prepare the image. Try again.");
        return false;
      }
      const result = await saveCardImage(blob, payload?.variant === 'deck' ? payload.card.title : payload?.title ?? 'workout');
      if (result === 'canceled') return false;
      return true;
    });
  };

  if (!source || !payload) return null;

  // Zero-footprint, test-readable mirror of what the canvas actually drew
  // -- a canvas has no DOM text a Playwright locator can read, so the
  // suite's own content assertions (title, lifetime counter, which
  // colorway, a deck card's suit ink color) read this instead of trying
  // to OCR pixels. Same spirit as DebugOverlay.web.tsx's own "expose a
  // real-device-only fact as plain text," scoped to just this feature.
  // Members never see it: zero size, zero opacity, no pointer events.
  // `cleared` mirrors drawProgressBlock's own threshold check
  // (workoutNumber >= HUNDRED_DOWN_TARGET) -- the HUNDRED DOWN mark itself
  // is canvas pixels, not DOM text, so this is how the suite's own
  // [share-card/post-100] check confirms the bar actually retired.
  const cleared = payload.workoutNumber >= HUNDRED_DOWN_TARGET;
  const debugInfo =
    payload.variant === 'deck'
      ? { variant: 'deck', title: payload.card.title, workoutNumber: payload.workoutNumber, deckCardNumber: payload.deckCardNumber, suitInk: deckInkColor(payload.card), cleared }
      : { variant: 'standard', title: payload.title, workoutNumber: payload.workoutNumber, colorwayId: payload.colorway.id, cleared };

  // The deck card is a true 5:7 playing-card ratio, taller than the
  // standard card's own ~4:5 -- the preview box has to size itself per
  // variant or a deck card would render squashed/stretched on screen.
  const previewHeight = (PREVIEW_MAX_WIDTH * (payload.variant === 'deck' ? DECK_CARD_HEIGHT : CARD_HEIGHT)) / CARD_WIDTH;

  return (
    <View style={styles.root} testID="completion-share-card">
      <Text style={styles.hiddenDebugText} testID="completion-share-card-debug">
        {JSON.stringify(debugInfo)}
      </Text>
      <AppPressable style={styles.closeButton} onPress={handleClose} testID="completion-share-card-close" hitSlop={10}>
        <Ionicons name="close" size={26} color={colors.white} />
      </AppPressable>

      <View style={[styles.cardWrap, { height: previewHeight }]} testID="completion-share-card-wrap">
        <View nativeID="completion-share-card-canvas-host" style={styles.canvasHost} testID="completion-share-card-canvas" />
        {!ready && (
          <View style={styles.loadingOverlay} testID="completion-share-card-loading">
            <ActivityIndicator color={colors.white} />
          </View>
        )}
      </View>

      <View style={styles.buttonRow}>
        <AppPressable style={styles.shareButton} pressedStyle={styles.shareButtonPressed} onPress={handleShare} testID="share-to-story">
          {shareStatus === 'completed' ? (
            <View style={styles.completedRow}>
              <Ionicons name="checkmark" size={14} color={colors.greenDeep} />
              <Text style={styles.shareButtonText}>SHARED</Text>
            </View>
          ) : (
            <Text style={styles.shareButtonText}>SHARE TO STORY</Text>
          )}
        </AppPressable>
        <AppPressable style={styles.saveButton} pressedStyle={styles.saveButtonPressed} onPress={handleSave} testID="save-card">
          {saveStatus === 'completed' ? (
            <View style={styles.completedRow}>
              <Ionicons name="checkmark" size={14} color={colors.white} />
              <Text style={styles.saveButtonText}>SAVED</Text>
            </View>
          ) : (
            <Text style={styles.saveButtonText}>SAVE</Text>
          )}
        </AppPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9000,
    backgroundColor: colors.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  hiddenDebugText: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
  closeButton: {
    position: 'absolute',
    top: 54,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  cardWrap: {
    // Round 33 corners: the exported canvas bitmap is now a plain
    // full-bleed rectangle (see shareCardRender.ts) -- it no longer bakes
    // its own rounded-corner clip into the bitmap. The on-screen preview
    // rounds it here instead, purely as CSS, so the modal's own green
    // backdrop (styles.root) shows through the corners rather than black.
    // This is cosmetic-only: the real exported/shared/saved PNG is already
    // correct on its own (no black notches) regardless of this wrapper.
    width: PREVIEW_MAX_WIDTH,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.greenDeep,
  },
  canvasHost: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
    width: PREVIEW_MAX_WIDTH,
  },
  shareButton: {
    flex: 1,
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  shareButtonPressed: {
    backgroundColor: colors.goldDeep,
  },
  shareButtonText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  saveButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.white,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  saveButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
});
