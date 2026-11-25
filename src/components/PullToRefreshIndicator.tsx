import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { colors } from '../theme';

// Round 69: THE WAVE FILLS THE BELL.
//
// Purely presentational — this file knows nothing about touch, scroll
// position, or network requests. It renders the real kettlewave bell mark
// (assets/brand/kettlewave-green.png) as a brand-green outline, always
// fully drawn, with a second, mechanically-recolored copy of the SOLID
// asset (assets/brand/kettlewave-filled.png) revealed from the bottom up
// underneath it in direct proportion to `progress` — the same "liquid
// fill" shape a water-level gauge would use, built from a plain
// `overflow: 'hidden'` box whose own height grows (never a CSS
// mask-image/clip-path, which would be a technique nothing else in this
// codebase has ever proven, and never a squash/stretch of the artwork
// itself — the box's aspect ratio is pinned to the real asset's own
// 219:311 proportions, so "low wave" vs. "full bell" only ever changes how
// much of the mark's own bottom is showing, never its shape).
//
// The recolor itself mirrors (never imports — this feature is meant to be
// revertible as a single, self-contained diff) shareCardRender.ts's own
// `getTintedKettlewave()`: load the real white-silhouette PNG into an
// HTMLImageElement, composite a solid green fill over it via
// `globalCompositeOperation = 'source-in'` (paints only where the source's
// own alpha is already nonzero, so the shape survives exactly and only its
// color changes), cache the result once since it's the same tint on every
// pull.

const KETTLEWAVE_OUTLINE = require('../../assets/brand/kettlewave-green.png');
const KETTLEWAVE_FILLED = require('../../assets/brand/kettlewave-filled.png');

// The real asset's own natural proportions (confirmed directly against the
// committed PNG) — never squash or stretch this ratio.
const KETTLEWAVE_RATIO = 219 / 311;

export const INDICATOR_BOX_WIDTH = 34;
export const INDICATOR_BOX_HEIGHT = Math.round(INDICATOR_BOX_WIDTH / KETTLEWAVE_RATIO);

const SLOSH_PERIOD_MS = 1100;
const SLOSH_AMPLITUDE = 0.05;

function resolveUri(source: unknown): string | null {
  // Mirrors shareCardRender.ts's own resolveUri(): on web, Metro's asset
  // registry already hands a require() of a local image back as a plain
  // {uri, width, height} object (or a bare string) — this is the one real
  // shape this web-only file ever sees, so it's checked first, with no
  // call into RN's own resolveAssetSource() at all (the exact call that
  // broke in production for shareCardRender.ts's own identical case,
  // Round 33).
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object' && 'uri' in source) {
    const uri = (source as { uri?: unknown }).uri;
    return typeof uri === 'string' ? uri : null;
  }
  return null;
}

let tintedFillUriPromise: Promise<string> | null = null;

function getTintedFillUri(): Promise<string> {
  if (tintedFillUriPromise) return tintedFillUriPromise;
  tintedFillUriPromise = new Promise<string>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('no document'));
      return;
    }
    const uri = resolveUri(KETTLEWAVE_FILLED);
    if (!uri) {
      reject(new Error('could not resolve kettlewave-filled.png'));
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('no 2d context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = colors.green;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('failed to load kettlewave-filled.png'));
    img.src = uri;
  });
  return tintedFillUriPromise;
}

type Props = {
  // 0..1 — how far through the pull the member currently is (clamped by
  // the gesture hook before being handed to this component). Also the
  // "resting" level the slosh gently breathes around while `refreshing`.
  progress: number;
  // While true, the fill animates a quiet, self-contained sine-wave
  // slosh around its current level — "the wave animates in a gentle
  // slosh loop while the refresh runs." Purely cosmetic: this component
  // owns its own rAF loop for it and needs nothing from the caller beyond
  // this one boolean.
  refreshing: boolean;
};

export function PullToRefreshIndicator({ progress, refreshing }: Props) {
  const [fillUri, setFillUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getTintedFillUri()
      .then((uri) => {
        if (!cancelled) setFillUri(uri);
      })
      .catch(() => {
        // No real recovery here — the outline alone (always rendered,
        // below) still reads as a real, recognizable indicator with no
        // fill level, never a blank box.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [sloshT, setSloshT] = useState(0);
  useEffect(() => {
    if (!refreshing) return;
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      setSloshT(((Date.now() - start) % SLOSH_PERIOD_MS) / SLOSH_PERIOD_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [refreshing]);

  const base = Math.max(0, Math.min(1, progress));
  const wobble = refreshing ? Math.sin(sloshT * Math.PI * 2) * SLOSH_AMPLITUDE : 0;
  const fillFraction = Math.max(0, Math.min(1, base + wobble));
  const fillHeight = fillFraction * INDICATOR_BOX_HEIGHT;

  return (
    <View
      testID="pull-to-refresh-indicator"
      style={{ width: INDICATOR_BOX_WIDTH, height: INDICATOR_BOX_HEIGHT }}
    >
      {fillUri && (
        <View
          testID="pull-to-refresh-wave"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: fillHeight,
            overflow: 'hidden',
          }}
        >
          <Image
            source={{ uri: fillUri }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              width: INDICATOR_BOX_WIDTH,
              height: INDICATOR_BOX_HEIGHT,
            }}
          />
        </View>
      )}
      <Image
        source={KETTLEWAVE_OUTLINE}
        resizeMode="contain"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: INDICATOR_BOX_WIDTH,
          height: INDICATOR_BOX_HEIGHT,
        }}
      />
    </View>
  );
}
