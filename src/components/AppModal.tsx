import React from 'react';
import { Modal } from 'react-native';

type Props = {
  visible: boolean;
  transparent?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
  onRequestClose?: () => void;
  children: React.ReactNode;
};

// Native platforms use the real Modal — see AppModal.web.tsx for why web
// needs a different approach.
export function AppModal({ visible, transparent, animationType = 'slide', onRequestClose, children }: Props) {
  return (
    <Modal visible={visible} transparent={transparent} animationType={animationType} onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}
