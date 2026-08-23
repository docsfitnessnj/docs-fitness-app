import { createNavigationContainerRef } from '@react-navigation/native';

// The identity sidebar renders outside MainApp's NavigationContainer (it's
// a sibling column, not part of the tab tree), so it can't call
// useNavigation() directly — this ref lets it jump tabs anyway.
export const navigationRef = createNavigationContainerRef<any>();

export function navigateToTab(name: string) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name as never);
  }
}
