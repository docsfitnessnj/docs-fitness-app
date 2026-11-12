import React from 'react';
import { Modal } from 'react-native';

type Props = {
  visible: boolean;
  onRequestClose?: () => void;
  children: React.ReactNode;
};

// Native has no document-scroll-vs-viewport ambiguity (see .web.tsx's own
// comment for why web needs this) -- a real Modal already covers the
// current screen correctly, the same fallback AppModal.tsx itself uses.
export function ViewportFixedOverlay({ visible, onRequestClose, children }: Props) {
  if (!visible) return null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}
