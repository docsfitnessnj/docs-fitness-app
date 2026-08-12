import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts as useBebasNeueFonts,
  BebasNeue_400Regular,
} from '@expo-google-fonts/bebas-neue';
import {
  useFonts as useBarlowFonts,
  BarlowCondensed_400Regular,
  BarlowCondensed_500Medium,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from '@expo-google-fonts/barlow-condensed';

import { MembershipProvider, useMembership } from './src/context/MembershipContext';
import { MembershipToggle } from './src/components/MembershipToggle';
import { colors, fonts } from './src/theme';

import WelcomeScreen from './src/screens/WelcomeScreen';
import PricingScreen from './src/screens/PricingScreen';
import DocsWodsScreen from './src/screens/DocsWodsScreen';
import DocsCowsScreen from './src/screens/DocsCowsScreen';
import DeckScreen from './src/screens/DeckScreen';
import CommunityScreen from './src/screens/CommunityScreen';

SplashScreen.preventAutoHideAsync();

const Tab = createBottomTabNavigator();

type TabConfig = {
  name: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  component: React.ComponentType;
};

// Doc's WODs is partially available to the Free tier (2 of 5 days), so it never
// shows the tab-level lock badge — the other three tabs are all-or-nothing.
const TABS: TabConfig[] = [
  { name: 'Wods', title: "DOC'S WODS", icon: 'flame', component: DocsWodsScreen },
  { name: 'Cows', title: "DOC'S COWS", icon: 'trophy', component: DocsCowsScreen },
  { name: 'Deck', title: 'THE DECK', icon: 'albums', component: DeckScreen },
  { name: 'Community', title: 'COMMUNITY', icon: 'people', component: CommunityScreen },
];

const FULL_ACCESS_ONLY_TABS = new Set(['Cows', 'Deck', 'Community']);

function TabIcon({
  icon,
  color,
  size,
  locked,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  size: number;
  locked: boolean;
}) {
  return (
    <View>
      <Ionicons name={icon} size={size} color={color} />
      {locked && (
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={9} color={colors.background} />
        </View>
      )}
    </View>
  );
}

function RootNavigator() {
  const { hasFullAccess } = useMembership();

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerRight: () => <MembershipToggle />,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.highlight,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      {TABS.map(({ name, title, icon, component }) => {
        const locked = !hasFullAccess && FULL_ACCESS_ONLY_TABS.has(name);
        return (
          <Tab.Screen
            key={name}
            name={name}
            component={component}
            options={{
              title,
              tabBarIcon: ({ color, size }) => (
                <TabIcon icon={icon} color={color} size={size} locked={locked} />
              ),
            }}
          />
        );
      })}
    </Tab.Navigator>
  );
}

type OnboardingStep = 'welcome' | 'pricing';

// Local-only onboarding: no navigator needed since it's a simple two-step flow
// that hands off into the tab app once a trial or membership is chosen.
function AppShell() {
  const { setTier } = useMembership();
  const [onboarded, setOnboarded] = useState(false);
  const [step, setStep] = useState<OnboardingStep>('welcome');

  if (!onboarded) {
    if (step === 'pricing') {
      return (
        <PricingScreen
          onBack={() => setStep('welcome')}
          onSelectPlan={() => {
            setTier('member');
            setOnboarded(true);
          }}
        />
      );
    }

    return (
      <WelcomeScreen
        onStartTrial={() => {
          setTier('trial');
          setOnboarded(true);
        }}
        onSkipTrial={() => setStep('pricing')}
      />
    );
  }

  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  const [bebasLoaded] = useBebasNeueFonts({ BebasNeue_400Regular });
  const [barlowLoaded] = useBarlowFonts({
    BarlowCondensed_400Regular,
    BarlowCondensed_500Medium,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });

  const fontsLoaded = bebasLoaded && barlowLoaded;

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <MembershipProvider>
        <View style={styles.appRoot} onLayout={onLayoutRootView}>
          <AppShell />
          <StatusBar style="light" />
        </View>
      </MembershipProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
  header: {
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 1,
    color: colors.text,
  },
  tabBar: {
    backgroundColor: colors.backgroundLight,
    borderTopColor: colors.locked,
  },
  tabBarLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  lockBadge: {
    position: 'absolute',
    bottom: -3,
    right: -6,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
