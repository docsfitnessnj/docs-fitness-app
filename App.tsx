import React, { useCallback } from 'react';
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

import HomeScreen from './src/screens/HomeScreen';
import ChallengesScreen from './src/screens/ChallengesScreen';
import DeckScreen from './src/screens/DeckScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';
import CommunityScreen from './src/screens/CommunityScreen';

SplashScreen.preventAutoHideAsync();

const Tab = createBottomTabNavigator();

type TabConfig = {
  name: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  component: React.ComponentType;
  alwaysUnlocked?: boolean;
};

const TABS: TabConfig[] = [
  { name: 'Home', title: 'HOME', icon: 'home', component: HomeScreen },
  { name: 'Challenges', title: 'CHALLENGES', icon: 'trophy', component: ChallengesScreen, alwaysUnlocked: true },
  { name: 'Deck', title: 'DECK OF WODS', icon: 'albums', component: DeckScreen },
  { name: 'Leaderboard', title: 'LEADERBOARD', icon: 'podium', component: LeaderboardScreen },
  { name: 'Community', title: 'COMMUNITY', icon: 'people', component: CommunityScreen },
];

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
  const { isMember } = useMembership();

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
      {TABS.map(({ name, title, icon, component, alwaysUnlocked }) => {
        const locked = !isMember && !alwaysUnlocked;
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
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
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
