import React from 'react';

type Props = {
  visible: boolean;
  onClose: () => void;
};

// Web-only diagnostic tool (tap the "DOC'S FITNESS" wordmark 5x within 2s
// to open it -- see AppTopBar.tsx) -- see DebugOverlay.web.tsx for the
// real implementation. Metro picks that file for web builds and this one
// (a no-op) for native, same split as AppModal.tsx/AppModal.web.tsx.
export function DebugOverlay(_props: Props) {
  return null;
}
