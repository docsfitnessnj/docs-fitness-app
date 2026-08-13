import React from 'react';
import { createPortal } from 'react-dom';
import { StyleSheet, View } from 'react-native';
import { useModalRootNode } from './ModalRootContext';

type Props = {
  visible: boolean;
  transparent?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
  onRequestClose?: () => void;
  children: React.ReactNode;
};

// React Native's <Modal> portals to the document root on web, which breaks
// out of the ~480px phone-frame we constrain the web layout to (see
// App.tsx). Portalling into the frame-local modal root instead (see
// ModalRootContext) keeps every "modal" clipped to the frame, including
// ones opened from deep inside a scrollable screen.
export function AppModal({ visible, children }: Props) {
  const modalRootNode = useModalRootNode();
  if (!visible || !modalRootNode) return null;
  return createPortal(<View style={styles.layer}>{children}</View>, modalRootNode);
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
});
