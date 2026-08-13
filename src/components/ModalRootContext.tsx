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
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
      />
    </ModalRootContext.Provider>
  );
}

export function useModalRootNode() {
  return useContext(ModalRootContext);
}
