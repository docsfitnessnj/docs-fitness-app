import React, { createContext, useContext, useState } from 'react';
import { StyleSheet, View } from 'react-native';

// On web, AppModal portals into this node instead of using RN's <Modal>
// (which portals to the document root and would break out of the ~480px
// phone-frame — see App.tsx). Mounting it here, at the top of the app tree
// and outside any ScrollView, means the portal target always spans the full
// frame regardless of how deep in a scrollable screen the modal is opened
// from — nesting it inside a ScrollView would size it to the scrollable
// content instead of the visible frame.
const ModalRootContext = createContext<any>(null);

export function ModalRootProvider({ children }: { children: React.ReactNode }) {
  const [node, setNode] = useState<any>(null);

  return (
    <ModalRootContext.Provider value={node}>
      {children}
      <View
        ref={(el) => {
          if (el && el !== node) setNode(el);
        }}
        style={styles.root}
        pointerEvents="box-none"
      />
    </ModalRootContext.Provider>
  );
}

export function useModalRootNode() {
  return useContext(ModalRootContext);
}

const styles = StyleSheet.create({
  // Needs an explicit zIndex above every non-portaled overlay (ScreenOverlay
  // renders its screens at zIndex: 500) — without one this marker sits at
  // the implicit zIndex: auto (treated as 0 for stacking purposes), so a
  // ScreenOverlay screen mounted after it — a hamburger drawer screen like
  // Memberships, for instance — paints on top of every AppModal portaled
  // here, confirmation dialogs included, regardless of DOM/mount order.
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
});
