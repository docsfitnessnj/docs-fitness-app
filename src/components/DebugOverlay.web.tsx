import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, useWindowDimensions, Dimensions } from 'react-native';
import { createPortal } from 'react-dom';
import { AppPressable } from './AppPressable';
import { colors, fonts } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Rect = { top: number; bottom: number; height: number } | null;

// Written by public/index.html's captureLastKeyboardSnapshot() into
// window.__lastKeyboardSnapshot the instant a real keyboard open is
// detected (visualViewport.height shrinking by more than 100px) -- see its
// own comment for why this lives as a plain window global rather than
// component state: it must survive this screen's own open/close and any
// in-session navigation that happens between the real keyboard event and
// whenever someone next opens this overlay to read it.
//
// Round 17 replaced the per-composer measurement this type used to carry
// (composerId/composerRect/visualBottom/appliedTranslateY/etc. -- see git
// history or AGENTS.md's "Round 15"/"Round 16" writeups) with the
// shell-level mechanism's own state: three real-device snapshots on the
// same iPhone showed the keyboard-open numbers landing in genuinely
// different shapes, and the fix stopped asking "where is the composer"
// entirely in favor of resizing #root itself to the visual viewport, which
// every bottom-anchored element (composers included) then reflows to
// through ordinary flexbox -- so there is no composer-specific anything
// left to capture here.
type KeyboardSnapshot = {
  timestamp: string;
  innerHeight: number;
  vvHeight: number;
  vvOffsetTop: number;
  // Kept purely as a point of comparison -- the Round 12 formula's own
  // answer, which no longer drives anything shell- or composer-related
  // (still used by CreatePostModal's defensive scroll padding only).
  keyboardInset: string;
  lvhPx: number | null;
  shellMode: 'at-rest' | 'keyboard';
  shellHeightVar: string;
  translateVar: string;
  rootRect: Rect;
} | null;

// Written continuously (not just on a big-shrink event) by
// syncKeyboardShellMode() into window.__keyboardShellState -- the LIVE
// counterpart to the historical KeyboardSnapshot above, so the KEYBOARD
// TEST input's once-a-second refresh shows the mechanism actually working
// while the keyboard is open, not just a reconstruction after the fact.
// Deliberately has no rootRect of its own: syncKeyboardShellMode() runs on
// a 250ms interval forever and on every focusin/focusout app-wide, and
// computing #root's rect there would mean forcing a layout reflow that
// often for a reader (this overlay) that's usually not even open -- #root's
// rect below reuses the Snapshot's own top-level `rootRect` instead, which
// take() already computes once a second, only while the overlay is open.
type KeyboardShellState = {
  mode: 'at-rest' | 'keyboard';
  shellHeightVar: string;
  translateVar: string;
} | null;

// Round 35's own LIVE EDITOR panel -- written continuously by
// updateLiveEditorState() (public/index.html) whenever a multiline
// editor (a TEXTAREA with a scrollable ancestor) is focused, null
// otherwise. The real-device bug this round fixes (losing the tapped
// caret, and a scroll-position fight once the keyboard is open) needed
// real numbers off a real device to confirm, not another screenshot
// reconstructed after the fact -- this is the live counterpart to that,
// readable the instant it's happening rather than only after.
type LastCorrectionLog = {
  at: string;
  trigger: string;
  corrected: boolean;
  delta: number;
} | null;

type LiveEditorState = {
  shellMode: 'at-rest' | 'keyboard';
  vvHeight: number | null;
  vvOffsetTop: number | null;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  caretTop: number | null;
  isUserScrolling: boolean;
  lastCorrection: LastCorrectionLog;
} | null;

type Snapshot = {
  innerHeight: number;
  innerWidth: number;
  vvHeight: number | null;
  vvOffsetTop: number | null;
  vvScale: number | null;
  dvhPx: number | null;
  svhPx: number | null;
  lvhPx: number | null;
  vhPx: number | null;
  realSafeTop: string;
  realSafeBottom: string;
  keyboardInset: string;
  rootRect: Rect;
  htmlRect: Rect;
  bodyRect: Rect;
  tabBarRect: Rect;
  tabBarFillRect: Rect;
  htmlScrollHeight: number;
  bodyScrollHeight: number;
  scrollY: number;
  navigatorStandalone: boolean | null;
  displayModeStandalone: boolean;
  rnDimensionsHeight: number;
  lastKeyboardSnapshot: KeyboardSnapshot;
  keyboardShellState: KeyboardShellState;
  liveEditorState: LiveEditorState;
};

function rectOf(el: Element | null): Rect {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
}

function take(rnWindowHeight: number): Snapshot {
  const vv = window.visualViewport;
  const dvhProbe = document.getElementById('debug-probe-100dvh');
  const svhProbe = document.getElementById('debug-probe-100svh');
  const lvhProbe = document.getElementById('debug-probe-100lvh');
  const vhProbe = document.getElementById('debug-probe-100vh');
  return {
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    vvHeight: vv ? Math.round(vv.height) : null,
    vvOffsetTop: vv ? Math.round(vv.offsetTop) : null,
    vvScale: vv ? vv.scale : null,
    dvhPx: dvhProbe ? Math.round(parseFloat(getComputedStyle(dvhProbe).height)) : null,
    svhPx: svhProbe ? Math.round(parseFloat(getComputedStyle(svhProbe).height)) : null,
    lvhPx: lvhProbe ? Math.round(parseFloat(getComputedStyle(lvhProbe).height)) : null,
    vhPx: vhProbe ? Math.round(parseFloat(getComputedStyle(vhProbe).height)) : null,
    realSafeTop: getComputedStyle(document.documentElement).getPropertyValue('--real-safe-top').trim() || '(unset)',
    realSafeBottom: getComputedStyle(document.documentElement).getPropertyValue('--real-safe-bottom').trim() || '(unset)',
    keyboardInset: getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset').trim() || '(unset)',
    rootRect: rectOf(document.getElementById('root')),
    htmlRect: rectOf(document.documentElement),
    bodyRect: rectOf(document.body),
    tabBarRect: rectOf(document.querySelector('[role="tablist"]')),
    tabBarFillRect: rectOf(document.getElementById('tab-bar-safe-area-fill')),
    htmlScrollHeight: document.documentElement.scrollHeight,
    bodyScrollHeight: document.body.scrollHeight,
    scrollY: Math.round(window.scrollY),
    navigatorStandalone: typeof (navigator as any).standalone === 'boolean' ? (navigator as any).standalone : null,
    displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
    rnDimensionsHeight: rnWindowHeight,
    lastKeyboardSnapshot: (window as any).__lastKeyboardSnapshot || null,
    keyboardShellState: (window as any).__keyboardShellState || null,
    liveEditorState: (window as any).__liveEditorState || null,
  };
}

function fmtRect(label: string, r: Rect) {
  return `${label}: ${r ? `top=${r.top} bottom=${r.bottom} height=${r.height}` : '(not found)'}`;
}

function snapshotToText(s: Snapshot, rnHookHeight: number): string {
  return [
    `window.innerHeight / innerWidth: ${s.innerHeight} / ${s.innerWidth}`,
    `visualViewport.height / offsetTop / scale: ${s.vvHeight ?? '(none)'} / ${s.vvOffsetTop ?? '(none)'} / ${s.vvScale ?? '(none)'}`,
    `100dvh / 100svh / 100lvh / 100vh resolve to: ${s.dvhPx ?? '?'} / ${s.svhPx ?? '?'} / ${s.lvhPx ?? '?'} / ${s.vhPx ?? '?'}px`,
    `--real-safe-top / --real-safe-bottom: ${s.realSafeTop} / ${s.realSafeBottom}`,
    `--keyboard-inset: ${s.keyboardInset}`,
    fmtRect('#root', s.rootRect),
    fmtRect('html', s.htmlRect),
    fmtRect('body', s.bodyRect),
    fmtRect('tab bar (role=tablist)', s.tabBarRect),
    fmtRect('tab bar safe-area fill', s.tabBarFillRect),
    `html.scrollHeight / body.scrollHeight: ${s.htmlScrollHeight} / ${s.bodyScrollHeight}`,
    `window.scrollY: ${s.scrollY}`,
    `navigator.standalone: ${s.navigatorStandalone === null ? '(not iOS Safari)' : s.navigatorStandalone}`,
    `matchMedia(display-mode: standalone): ${s.displayModeStandalone}`,
    `Dimensions.get('window').height: ${s.rnDimensionsHeight}`,
    `useWindowDimensions().height: ${rnHookHeight}`,
    '--- KEYBOARD SHELL STATE (live) ---',
    s.keyboardShellState
      ? [
          `mode: ${s.keyboardShellState.mode}`,
          `--shell-keyboard-height: ${s.keyboardShellState.shellHeightVar}`,
          `--app-offset-top (shell translate): ${s.keyboardShellState.translateVar}`,
          fmtRect('#root', s.rootRect),
        ].join('\n')
      : '(not measured yet)',
    '--- LIVE EDITOR (while a multiline field is focused) ---',
    s.liveEditorState
      ? [
          `shell mode: ${s.liveEditorState.shellMode}`,
          `visualViewport.height / offsetTop: ${s.liveEditorState.vvHeight ?? '(none)'} / ${s.liveEditorState.vvOffsetTop ?? '(none)'}`,
          `editor scrollTop / scrollHeight / clientHeight: ${s.liveEditorState.scrollTop} / ${s.liveEditorState.scrollHeight} / ${s.liveEditorState.clientHeight}`,
          `computed caret top (viewport coords): ${s.liveEditorState.caretTop ?? '(unknown)'}`,
          `touch currently driving the scroll: ${s.liveEditorState.isUserScrolling}`,
          `last correction: ${
            s.liveEditorState.lastCorrection
              ? `${s.liveEditorState.lastCorrection.trigger} at ${s.liveEditorState.lastCorrection.at} (corrected=${s.liveEditorState.lastCorrection.corrected}, delta=${s.liveEditorState.lastCorrection.delta}px)`
              : '(none yet)'
          }`,
        ].join('\n')
      : '(no multiline editor focused)',
    '--- LAST KEYBOARD SNAPSHOT ---',
    s.lastKeyboardSnapshot
      ? [
          `captured at: ${s.lastKeyboardSnapshot.timestamp}`,
          `innerHeight: ${s.lastKeyboardSnapshot.innerHeight}`,
          `visualViewport.height / offsetTop: ${s.lastKeyboardSnapshot.vvHeight} / ${s.lastKeyboardSnapshot.vvOffsetTop}`,
          `--keyboard-inset at capture (legacy formula, comparison only): ${s.lastKeyboardSnapshot.keyboardInset}`,
          `100lvh probe at capture: ${s.lastKeyboardSnapshot.lvhPx ?? '?'}px`,
          `shell mode at capture: ${s.lastKeyboardSnapshot.shellMode}`,
          `--shell-keyboard-height at capture: ${s.lastKeyboardSnapshot.shellHeightVar}`,
          `shell translate at capture: ${s.lastKeyboardSnapshot.translateVar}`,
          fmtRect('#root at capture', s.lastKeyboardSnapshot.rootRect),
        ].join('\n')
      : '(none recorded yet -- focus an input that brings up the keyboard in the installed app)',
  ].join('\n');
}

function OutlineBox({ rect, color, label }: { rect: Rect; color: string; label: string }) {
  if (!rect) return null;
  return (
    <View
      style={[
        styles.outlineBox,
        { top: rect.top, height: Math.max(rect.height, 1), borderColor: color },
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.outlineLabel, { color, backgroundColor: colors.card }]}>{label}</Text>
    </View>
  );
}

export function DebugOverlay({ visible, onClose }: Props) {
  const rnHookHeight = useWindowDimensions().height;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [copied, setCopied] = useState(false);
  // useWindowDimensions() is only read inside the component body (for the
  // live-updating value in the text list); the snapshot used for layout/
  // outline math and the once-a-second refresh uses the static
  // Dimensions.get('window') call, matching what the report literally
  // asks for as two distinct numbers to compare against each other.
  const rnStaticHeightRef = useRef(Dimensions.get('window').height);

  useEffect(() => {
    if (!visible) return;
    rnStaticHeightRef.current = Dimensions.get('window').height;
    setSnapshot(take(rnStaticHeightRef.current));
    const id = setInterval(() => {
      rnStaticHeightRef.current = Dimensions.get('window').height;
      setSnapshot(take(rnStaticHeightRef.current));
    }, 1000);
    return () => clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  const handleCopy = async () => {
    if (!snapshot) return;
    const text = snapshotToText(snapshot, rnHookHeight);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied or unavailable (e.g. non-HTTPS) --
      // nothing else to fall back to here that isn't itself flaky, and
      // this is a debug-only tool, not member-facing functionality.
    }
  };

  const body = (
    <View style={styles.root} pointerEvents="box-none">
      <OutlineBox rect={snapshot?.rootRect ?? null} color="red" label="#root" />
      <OutlineBox rect={snapshot?.tabBarRect ?? null} color="blue" label="tab bar" />
      <OutlineBox rect={snapshot?.tabBarFillRect ?? null} color="blue" label="tab bar fill" />

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>DEBUG OVERLAY</Text>
          <AppPressable onPress={onClose} hitSlop={8} style={styles.closeButton} testID="debug-overlay-close">
            <Text style={styles.closeButtonText}>CLOSE</Text>
          </AppPressable>
        </View>
        <View style={styles.keyboardTestRow}>
          <Text style={styles.keyboardTestLabel}>KEYBOARD TEST</Text>
          <TextInput
            testID="debug-overlay-keyboard-test-input"
            style={styles.keyboardTestInput}
            placeholder="Tap here to bring up the keyboard"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.scroll} testID="debug-overlay-content">
          {snapshot ? (
            <Text style={styles.monoText} selectable>
              {snapshotToText(snapshot, rnHookHeight)}
            </Text>
          ) : (
            <Text style={styles.monoText}>measuring...</Text>
          )}
        </View>
        <AppPressable onPress={handleCopy} style={styles.copyButton} testID="debug-overlay-copy">
          <Text style={styles.copyButtonText}>{copied ? 'COPIED' : 'COPY ALL'}</Text>
        </AppPressable>
      </View>
    </View>
  );

  return createPortal(body, document.body);
}

const styles = StyleSheet.create({
  root: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
  },
  outlineBox: {
    position: 'fixed' as any,
    left: 0,
    right: 0,
    borderWidth: 2,
    boxSizing: 'border-box' as any,
  },
  outlineLabel: {
    position: 'absolute',
    top: 0,
    left: 4,
    fontSize: 10,
    fontFamily: fonts.labelSemiBold,
    paddingHorizontal: 3,
  },
  panel: {
    position: 'fixed' as any,
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: '70vh' as any,
    backgroundColor: 'rgba(10,15,13,0.95)',
    borderRadius: 12,
    padding: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  panelTitle: {
    color: colors.white,
    fontFamily: fonts.headline,
    fontSize: 16,
    letterSpacing: 1,
  },
  closeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  closeButtonText: {
    color: colors.white,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
  },
  keyboardTestRow: {
    marginBottom: 8,
  },
  keyboardTestLabel: {
    color: colors.white,
    fontFamily: fonts.labelSemiBold,
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 4,
  },
  keyboardTestInput: {
    // iOS Safari auto-zooms the whole page when a focused input's font
    // size resolves under 16px (see AGENTS.md's "iOS input zoom" section)
    // -- this field exists specifically to summon the real keyboard, so it
    // must obey the same rule as every member-facing TextInput.
    fontSize: 16,
    color: colors.white,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  scroll: {
    // Trimmed from 55vh to make room for the new KEYBOARD TEST row above,
    // which sits outside this scroll container (always visible, not
    // scrolled away) so it's never more than one tap away while reading
    // the live numbers below it.
    maxHeight: '45vh' as any,
    overflow: 'scroll' as any,
  },
  monoText: {
    color: '#9FE8A3',
    fontFamily: 'monospace' as any,
    fontSize: 11,
    lineHeight: 16,
  },
  copyButton: {
    marginTop: 10,
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  copyButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
});
