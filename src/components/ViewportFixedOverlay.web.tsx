import React from 'react';
import { createPortal } from 'react-dom';
import { StyleSheet, View } from 'react-native';

type Props = {
  visible: boolean;
  onRequestClose?: () => void;
  children: React.ReactNode;
};

// Round 53: a genuinely viewport-fixed overlay, portaled directly to
// document.body -- for exactly one real bug, not a general-purpose
// replacement for AppModal. AppModal.web.tsx's own portal (ModalRootContext,
// position: absolute) anchors to mainColumn's box -- which, confirmed by
// direct measurement (not assumed), collapses to exactly one viewport tall
// and sits pinned at document y=0 in the About page's own natural-
// document-scroll mode (useWebDocumentScroll.ts, Round 49's "onboarding"
// branch): a member scrolled 2500px down who opens a modal through that
// path gets it rendered entirely off screen, above their own viewport,
// discoverable only by scrolling all the way back to the top. Switching
// just that layer to `position: fixed` in place would NOT fix this --
// #root (the literal mount div in index.html, the ancestor of every React
// component) carries its own permanent `transform: translateY(var(
// --app-offset-top, 0px))` rule (Round 5), and a `transform` other than
// `none` establishes a containing block for a `position: fixed` descendant
// regardless of its own translate value, even 0px -- the exact documented
// trap DebugOverlay.web.tsx's own outlines already route around by
// portaling straight to document.body instead of rendering in place. This
// component reuses that identical, already-proven technique. `document.body`
// and `html` carry no transform of their own, so a position:fixed child
// portaled directly onto body has nothing between it and the TRUE browser
// viewport -- it covers whatever the member is actually looking at, at any
// scroll position, with zero scrolling performed by anyone.
//
// Deliberately NOT a change to AppModal/ModalRootContext themselves --
// every other consumer (DeckCardDetailModal, PostDetailModal, and the
// hamburger drawer's own signed-in InviteFriendModal usage) keeps using
// that shared mechanism completely unchanged; this is an opt-in alternate
// path for the one caller that actually needs it.
export function ViewportFixedOverlay({ visible, children }: Props) {
  if (!visible) return null;
  return createPortal(<View style={styles.layer}>{children}</View>, document.body);
}

const styles = StyleSheet.create({
  layer: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
});
