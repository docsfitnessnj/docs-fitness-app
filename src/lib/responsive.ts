import { Platform, useWindowDimensions } from 'react-native';
import { DESKTOP_BREAKPOINT } from '../theme';

// True once the window is wide enough to show the main-column + identity-
// sidebar desktop layout (web only — native is always the phone layout).
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
}
