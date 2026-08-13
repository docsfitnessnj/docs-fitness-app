import React, { useCallback, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
import { CommunityProvider } from './src/context/CommunityContext';
import { WorkoutLogProvider } from './src/context/WorkoutLogContext';
import { CloseFriendsProvider } from './src/context/CloseFriendsContext';
import { AppTopBar } from './src/components/AppTopBar';
import { SearchModal } from './src/components/SearchModal';
import { TrialExpiryModal } from './src/components/TrialExpiryModal';
import { AlertHost } from './src/components/AlertHost';
import { ModalRootProvider } from './src/components/ModalRootContext';
import { SidebarDrawer } from './src/components/SidebarDrawer';
import { colors, fonts, tabAccents } from './src/theme';

import WelcomeScreen from './src/screens/WelcomeScreen';
import PricingScreen from './src/screens/PricingScreen';
import DocsWodsScreen from './src/screens/DocsWodsScreen';
import DocsCowsScreen from './src/screens/DocsCowsScreen';
import DeckScreen from './src/screens/DeckScreen';
import CommunityScreen from './src/screens/CommunityScreen';
import { MessagesScreen } from './src/screens/MessagesScreen';
import { MyWorkoutsScreen } from './src/screens/MyWorkoutsScreen';
import { CloseFriendsScreen } from './src/screens/CloseFriendsScreen';

const PHONE_FRAME_MAX_WIDTH = 480;

SplashScreen.preventAutoHideAsync();

const Tab = createBottomTabNavigator();

type IconRenderer = (props: { color: string; size: number }) => React.ReactNode;

type TabConfig = {
  name: string;
  title: string;
  color: string;
  renderIcon: IconRenderer;
  component: React.ComponentType;
  alwaysUnlocked?: boolean;
};

const TABS: TabConfig[] = [
  {
    name: 'Community',
    title: 'COMMUNITY',
    color: tabAccents.community,
    renderIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
    component: CommunityScreen,
  },
  {
    name: 'DocsWods',
    title: "DOC'S WODS",
    color: tabAccents.wods,
    renderIcon: ({ color, size }) => <Ionicons name="flame" size={size} color={color} />,
    component: DocsWodsScreen,
    alwaysUnlocked: true,
  },
  {
    name: 'DocsCows',
    title: "DOC'S COWS",
    color: tabAccents.cows,
    renderIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} />,
    component: DocsCowsScreen,
  },
  {
    name: 'Deck',
    title: 'DECK OF WODS',
    color: tabAccents.deck,
    renderIcon: ({ color, size }) => (
      <MaterialCommunityIcons name="cards-playing-spade-outline" size={size} color={color} />
    ),
    component: DeckScreen,
  },
];

function TabIcon({
  renderIcon,
  color,
  focused,
  locked,
}: {
  renderIcon: IconRenderer;
  color: string;
  focused: boolean;
  locked: boolean;
}) {
  return (
    <View style={styles.iconWrap}>
      {renderIcon({ color, size: focused ? 26 : 22 })}
      {focused && <View style={[styles.activeDot, { backgroundColor: color }]} />}
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
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      {TABS.map(({ name, title, color, renderIcon, component, alwaysUnlocked }) => {
        const locked = !hasFullAccess && !alwaysUnlocked;
        return (
          <Tab.Screen
            key={name}
            name={name}
            component={component}
            options={{
              title,
              tabBarIcon: ({ focused }) => (
                <TabIcon renderIcon={renderIcon} color={color} focused={focused} locked={locked} />
              ),
            }}
          />
        );
      })}
    </Tab.Navigator>
  );
}

function OnboardingFlow() {
  const { startTrial, becomeMember } = useMembership();
  const [view, setView] = useState<'welcome' | 'pricing'>('welcome');

  if (view === 'pricing') {
    return (
      <PricingScreen
        onBack={() => setView('welcome')}
        onSelectPlan={() => becomeMember()}
      />
    );
  }

  return (
    <WelcomeScreen
      onStartTrial={(email) => startTrial(email)}
      onSkipTrial={() => setView('pricing')}
    />
  );
}

function MainApp() {
  const { displayName } = useMembership();
  const [searchOpen, setSearchOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [myWorkoutsOpen, setMyWorkoutsOpen] = useState(false);
  const [closeFriendsOpen, setCloseFriendsOpen] = useState(false);

  return (
    <NavigationContainer>
      <View style={styles.mainAppRoot}>
        <AppTopBar
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenMessages={() => setMessagesOpen(true)}
        />
        <RootNavigator />
      </View>
      <SearchModal visible={searchOpen} onClose={() => setSearchOpen(false)} />
      <MessagesScreen visible={messagesOpen} onClose={() => setMessagesOpen(false)} />
      <SidebarDrawer
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        displayName={displayName}
        onOpenMyWorkouts={() => setMyWorkoutsOpen(true)}
        onOpenCloseFriends={() => setCloseFriendsOpen(true)}
      />
      <MyWorkoutsScreen visible={myWorkoutsOpen} onClose={() => setMyWorkoutsOpen(false)} />
      <CloseFriendsScreen visible={closeFriendsOpen} onClose={() => setCloseFriendsOpen(false)} />
      <TrialExpiryModal />
    </NavigationContainer>
  );
}

function AppShell() {
  const { signedUp } = useMembership();

  if (!signedUp) {
    return <OnboardingFlow />;
  }

  return <MainApp />;
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
        <CommunityProvider>
          <WorkoutLogProvider>
            <CloseFriendsProvider>
              <View style={styles.webSurround}>
                <View style={styles.appRoot} onLayout={onLayoutRootView}>
                  <ModalRootProvider>
                    <AppShell />
                    <AlertHost />
                    <StatusBar style="light" />
                  </ModalRootProvider>
                </View>
              </View>
            </CloseFriendsProvider>
          </WorkoutLogProvider>
        </CommunityProvider>
      </MembershipProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  // On web, the dark teal fills the full browser width; the app itself is
  // clamped to a phone-sized column in the middle so it never stretches wide.
  webSurround: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  appRoot: {
    flex: 1,
    width: '100%',
    ...(Platform.OS === 'web'
      ? {
          maxWidth: PHONE_FRAME_MAX_WIDTH,
          position: 'relative',
          overflow: 'hidden',
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.locked,
        }
      : null),
  },
  mainAppRoot: {
    flex: 1,
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
  iconWrap: {
    alignItems: 'center',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
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
