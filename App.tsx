import React, { useCallback, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts as useBebasNeueFonts,
  BebasNeue_400Regular,
} from '@expo-google-fonts/bebas-neue';
import {
  useFonts as useBarlowFonts,
  BarlowCondensed_500Medium,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from '@expo-google-fonts/barlow-condensed';
import {
  useFonts as usePublicSansFonts,
  PublicSans_400Regular,
  PublicSans_500Medium,
  PublicSans_600SemiBold,
  PublicSans_700Bold,
} from '@expo-google-fonts/public-sans';

import { MembershipProvider, useMembership } from './src/context/MembershipContext';
import { CommunityProvider } from './src/context/CommunityContext';
import { WorkoutLogProvider } from './src/context/WorkoutLogContext';
import { CloseFriendsProvider } from './src/context/CloseFriendsContext';
import { ProfileProvider } from './src/context/ProfileContext';
import { StoriesProvider } from './src/context/StoriesContext';
import { DeckProgressProvider } from './src/context/DeckProgressContext';
import { ChallengeProvider } from './src/context/ChallengeContext';
import { BadgeProvider } from './src/context/BadgeContext';
import { ClassSignUpProvider } from './src/context/ClassSignUpContext';
import { TourProvider, useTour } from './src/context/TourContext';
import { AppTopBar } from './src/components/AppTopBar';
import { SearchModal } from './src/components/SearchModal';
import { TrialExpiryModal } from './src/components/TrialExpiryModal';
import { AlertHost } from './src/components/AlertHost';
import { ModalRootProvider } from './src/components/ModalRootContext';
import { ScreenOverlay } from './src/components/ScreenOverlay';
import { SidebarDrawer } from './src/components/SidebarDrawer';
import { IdentitySidebar } from './src/components/IdentitySidebar';
import { TourOverlay } from './src/components/TourOverlay';
import { PurchaseCelebrationOverlay } from './src/components/PurchaseCelebrationOverlay';
import { useScheduleModalState } from './src/lib/scheduleModal';
import { useMembershipsModalState } from './src/lib/membershipsModal';
import { useWeeklyUpgradeNudge } from './src/lib/upgradeNudge';
import { useTabBarHeight } from './src/lib/tabBarHeight';
import { injectWebFocusStyles } from './src/lib/webFocusReset';
import { navigationRef } from './src/lib/navigationRef';
import { colors, fonts, DESKTOP_BREAKPOINT, LARGE_DESKTOP_BREAKPOINT } from './src/theme';

import WelcomeScreen from './src/screens/WelcomeScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import SignInScreen from './src/screens/SignInScreen';
import HowDoYouTrainScreen from './src/screens/HowDoYouTrainScreen';
import OnlineStartScreen from './src/screens/OnlineStartScreen';
import PricingScreen from './src/screens/PricingScreen';
import InPersonPlansScreen from './src/screens/InPersonPlansScreen';
import DocsWodsScreen from './src/screens/DocsWodsScreen';
import DocsCowsScreen from './src/screens/DocsCowsScreen';
import DeckScreen from './src/screens/DeckScreen';
import CommunityScreen from './src/screens/CommunityScreen';
import { FullScheduleScreen } from './src/screens/FullScheduleScreen';
import { MessagesScreen } from './src/screens/MessagesScreen';
import { MyWorkoutsScreen } from './src/screens/MyWorkoutsScreen';
import { MembershipsScreen } from './src/screens/MembershipsScreen';
import { AdminRosterScreen } from './src/screens/AdminRosterScreen';
import { CloseFriendsScreen } from './src/screens/CloseFriendsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TrophyCaseScreen } from './src/screens/TrophyCaseScreen';
import { MemberManagerScreen } from './src/screens/MemberManagerScreen';

const PHONE_FRAME_MAX_WIDTH = 480;
const MAIN_COLUMN_DESKTOP_WIDTH = 840;
const MAIN_COLUMN_DESKTOP_WIDTH_LARGE = 900;
const SIDEBAR_WIDTH = 340;
const SIDEBAR_WIDTH_LARGE = 360;
const LAYOUT_GAP = 32;

SplashScreen.preventAutoHideAsync();
injectWebFocusStyles();

const Tab = createBottomTabNavigator();

type IconRenderer = (props: { color: string; size: number }) => React.ReactNode;

type TabConfig = {
  name: string;
  title: string;
  navLabel: string;
  renderIcon: IconRenderer;
  component: React.ComponentType;
  // Community handles its own full / read-only / closed states inline, so its
  // tab icon never shows a lock — everything else is locked per its own flag.
  isLocked: (m: ReturnType<typeof useMembership>) => boolean;
};

const TABS: TabConfig[] = [
  {
    name: 'Community',
    title: 'COMMUNITY',
    navLabel: 'COMMUNITY',
    renderIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
    component: CommunityScreen,
    isLocked: () => false,
  },
  {
    name: 'DocsWods',
    title: "DOC'S WODS",
    navLabel: "DOC'S WODS",
    renderIcon: ({ color, size }) => <Ionicons name="flame-outline" size={size} color={color} />,
    component: DocsWodsScreen,
    isLocked: (m) => m.wodAccessLevel === 'none',
  },
  {
    name: 'DocsCows',
    title: "DOC'S COWS + LIVE LEADERBOARD",
    navLabel: 'WEEKLY CHALLENGE',
    renderIcon: ({ color, size }) => <Ionicons name="trophy-outline" size={size} color={color} />,
    component: DocsCowsScreen,
    isLocked: (m) => !m.cowsAccess,
  },
  {
    name: 'Deck',
    title: 'THE DECK',
    navLabel: 'THE DECK',
    renderIcon: ({ color, size }) => (
      <MaterialCommunityIcons name="cards-playing-spade-outline" size={size} color={color} />
    ),
    component: DeckScreen,
    isLocked: (m) => !m.deckAccess,
  },
];

const TAB_SUBTITLES: Record<string, string> = TABS.reduce(
  (acc, tab) => ({ ...acc, [tab.name]: tab.title }),
  {} as Record<string, string>
);

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
      {renderIcon({ color, size: 22 })}
      {focused && <View style={styles.activeDot} />}
      {locked && (
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={9} color={colors.white} />
        </View>
      )}
    </View>
  );
}

// React Navigation's own animated tab label measures its height once and can
// get stuck mid-animation at a few px tall (a known bottom-tabs quirk,
// worse with custom fonts) — clipping the label text. Rendering the label
// ourselves as a plain Text via `tabBarLabel` sidesteps that measurement
// entirely and always renders at full height.
function TabLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text style={[styles.tabBarLabel, { color }]} numberOfLines={1}>
      {label}
    </Text>
  );
}

type RootNavigatorProps = {
  // The hamburger drawer is the one intentional exception to the persistent
  // tab bar rule — it's its own space, not a second navigation, so the tab
  // bar hides while it's open and reappears once the drawer closes.
  tabBarHidden: boolean;
};

function RootNavigator({ tabBarHidden }: RootNavigatorProps) {
  const membership = useMembership();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();

  const tabBarStyle = useMemo(
    () => [
      styles.tabBar,
      { height: tabBarHeight, paddingBottom: Math.max(insets.bottom, 6), paddingTop: 6 },
      tabBarHidden && styles.tabBarHidden,
    ],
    [tabBarHeight, insets.bottom, tabBarHidden]
  );

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      {TABS.map(({ name, navLabel, renderIcon, component, isLocked }) => {
        const locked = isLocked(membership);
        return (
          <Tab.Screen
            key={name}
            name={name}
            component={component}
            options={{
              title: navLabel,
              tabBarIcon: ({ focused, color }) => (
                <TabIcon renderIcon={renderIcon} color={color} focused={focused} locked={locked} />
              ),
              tabBarLabel: ({ color }) => <TabLabel label={navLabel} color={color} />,
            }}
          />
        );
      })}
    </Tab.Navigator>
  );
}

type OnboardingStep = 'about' | 'email' | 'signIn' | 'howDoYouTrain' | 'onlineStart' | 'pricing' | 'inPersonPlans';

// The choice a door on the About page already made for the user, carried
// through the email screen so it can skip "How do you train?" entirely.
type EntryIntent = 'onlineTrial' | 'bookClass' | null;

// Fewest possible clicks: About -> Continue -> (skip if a door was tapped,
// else How do you train) -> (pick a path) -> in. TRAIN ONLINE lands on a
// single trial-start screen (with a skip-to-pricing link); TRAIN AT THE
// BOATHOUSE goes straight to plan selection. Guests skip this whole flow
// from the email screen.
function OnboardingFlow() {
  const { startTrial, becomeMember, selectInPersonPlan, becomeGuest, signIn, setNewsletterOptIn } = useMembership();
  const [step, setStep] = useState<OnboardingStep>('about');
  const [email, setEmail] = useState('');
  const [intent, setIntent] = useState<EntryIntent>(null);

  switch (step) {
    case 'email':
      return (
        <WelcomeScreen
          onBack={() => setStep('about')}
          onContinue={(enteredEmail, newsletterOptIn) => {
            setEmail(enteredEmail);
            setNewsletterOptIn(newsletterOptIn);
            if (intent === 'onlineTrial') {
              startTrial(enteredEmail);
            } else if (intent === 'bookClass') {
              becomeGuest(enteredEmail);
            } else {
              setStep('howDoYouTrain');
            }
          }}
          onBrowseAsGuest={() => becomeGuest()}
        />
      );
    case 'signIn':
      return (
        <SignInScreen
          onBack={() => setStep('about')}
          onSignIn={(enteredEmail) => signIn(enteredEmail)}
        />
      );
    case 'howDoYouTrain':
      return (
        <HowDoYouTrainScreen
          onBack={() => setStep('email')}
          onTrainOnline={() => setStep('onlineStart')}
          onTrainAtBoathouse={() => setStep('inPersonPlans')}
        />
      );
    case 'onlineStart':
      return (
        <OnlineStartScreen
          onBack={() => setStep('howDoYouTrain')}
          onStartTrial={() => startTrial(email)}
          onSkipToPricing={() => setStep('pricing')}
        />
      );
    case 'pricing':
      return <PricingScreen onBack={() => setStep('onlineStart')} onSelectPlan={() => becomeMember()} />;
    case 'inPersonPlans':
      return (
        <InPersonPlansScreen onBack={() => setStep('howDoYouTrain')} onSelectPlan={(plan) => selectInPersonPlan(plan)} />
      );
    default:
      return (
        <AboutScreen
          variant="onboarding"
          onStartFree={() => {
            setIntent('onlineTrial');
            setStep('email');
          }}
          onBookClass={() => {
            setIntent('bookClass');
            setStep('email');
          }}
          onSignIn={() => setStep('signIn')}
        />
      );
  }
}

// Invisible marker sized/positioned to match the real tab bar, purely so the
// tour can measure "the tab bar" by ref — react-navigation's bottom-tabs
// doesn't expose a ref to its own rendered bar.
function TabBarTourMarker() {
  const { registerTarget } = useTour();
  const tabBarHeight = useTabBarHeight();
  return (
    <View
      ref={registerTarget('tab-bar')}
      pointerEvents="none"
      style={[styles.tabBarTourMarker, { height: tabBarHeight }]}
    />
  );
}

type MainAppProps = {
  messagesOpen: boolean;
  onOpenMessages: () => void;
  onCloseMessages: () => void;
};

function MainApp({ messagesOpen, onOpenMessages, onCloseMessages }: MainAppProps) {
  const { tier } = useMembership();
  useWeeklyUpgradeNudge(tier === 'online_free');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [membershipsOpen, setMembershipsOpen] = useMembershipsModalState();
  const [myWorkoutsOpen, setMyWorkoutsOpen] = useState(false);
  const [closeFriendsOpen, setCloseFriendsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [adminRosterOpen, setAdminRosterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trophyCaseOpen, setTrophyCaseOpen] = useState(false);
  const [memberManagerOpen, setMemberManagerOpen] = useState(false);
  const [messagesDraft, setMessagesDraft] = useState<string | undefined>(undefined);
  const [scheduleOpen, setScheduleOpen] = useScheduleModalState();
  const [activeTab, setActiveTab] = useState('Community');

  const openMessagesForJokerVerification = () => {
    setTrophyCaseOpen(false);
    setMessagesDraft("Here's proof I own the physical Deck of WODs — photo attached.");
    onOpenMessages();
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      onStateChange={(state) => {
        const route = state?.routes[state.index ?? 0];
        if (route) setActiveTab(route.name);
      }}
    >
      <View style={styles.mainAppRoot}>
        <AppTopBar
          subtitle={TAB_SUBTITLES[activeTab]}
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />
        <RootNavigator tabBarHidden={sidebarOpen} />
        <TabBarTourMarker />
      </View>
      <ScreenOverlay visible={searchOpen}>
        <SearchModal visible={searchOpen} onClose={() => setSearchOpen(false)} />
      </ScreenOverlay>
      <ScreenOverlay visible={sidebarOpen} fullBleed>
        <SidebarDrawer
          visible={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onOpenProfile={() => setProfileOpen(true)}
          onOpenMemberships={() => setMembershipsOpen(true)}
          onOpenMyWorkouts={() => setMyWorkoutsOpen(true)}
          onOpenCloseFriends={() => setCloseFriendsOpen(true)}
          onOpenMessages={onOpenMessages}
          onOpenAdminRoster={() => setAdminRosterOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenTrophyCase={() => setTrophyCaseOpen(true)}
          onOpenMemberManager={() => setMemberManagerOpen(true)}
          onOpenAbout={() => setAboutOpen(true)}
        />
      </ScreenOverlay>
      {/* Rows nested under the drawer: fullBleed only while the drawer itself
          is still open (opened from the hamburger), so backing out reveals
          the menu list, not the tab bar underneath. Their other entry points
          (e.g. desktop Messages, the schedule strip link) leave sidebarOpen
          false and keep the original non-fullBleed behavior. */}
      <ScreenOverlay visible={messagesOpen} fullBleed={sidebarOpen}>
        <MessagesScreen
          visible={messagesOpen}
          onClose={() => {
            setMessagesDraft(undefined);
            onCloseMessages();
          }}
          initialDraft={messagesDraft}
        />
      </ScreenOverlay>
      <ScreenOverlay visible={profileOpen} fullBleed={sidebarOpen}>
        <ProfileScreen visible={profileOpen} onClose={() => setProfileOpen(false)} />
      </ScreenOverlay>
      <ScreenOverlay visible={membershipsOpen} fullBleed={sidebarOpen}>
        <MembershipsScreen visible={membershipsOpen} onClose={() => setMembershipsOpen(false)} />
      </ScreenOverlay>
      <ScreenOverlay visible={myWorkoutsOpen} fullBleed={sidebarOpen}>
        <MyWorkoutsScreen visible={myWorkoutsOpen} onClose={() => setMyWorkoutsOpen(false)} />
      </ScreenOverlay>
      <ScreenOverlay visible={closeFriendsOpen} fullBleed={sidebarOpen}>
        <CloseFriendsScreen visible={closeFriendsOpen} onClose={() => setCloseFriendsOpen(false)} />
      </ScreenOverlay>
      <ScreenOverlay visible={aboutOpen} fullBleed={sidebarOpen}>
        <AboutScreen
          variant="inApp"
          onBack={() => setAboutOpen(false)}
          onStartFree={() => {
            setAboutOpen(false);
            setMembershipsOpen(true);
          }}
          onBookClass={() => {
            setAboutOpen(false);
            setMembershipsOpen(true);
          }}
        />
      </ScreenOverlay>
      <ScreenOverlay visible={adminRosterOpen} fullBleed={sidebarOpen}>
        <AdminRosterScreen visible={adminRosterOpen} onClose={() => setAdminRosterOpen(false)} />
      </ScreenOverlay>
      <ScreenOverlay visible={settingsOpen} fullBleed={sidebarOpen}>
        <SettingsScreen
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onOpenMemberships={() => {
            setSettingsOpen(false);
            setMembershipsOpen(true);
          }}
        />
      </ScreenOverlay>
      <ScreenOverlay visible={trophyCaseOpen} fullBleed={sidebarOpen}>
        <TrophyCaseScreen
          visible={trophyCaseOpen}
          onClose={() => setTrophyCaseOpen(false)}
          onVerifyJoker={openMessagesForJokerVerification}
        />
      </ScreenOverlay>
      <ScreenOverlay visible={memberManagerOpen} fullBleed={sidebarOpen}>
        <MemberManagerScreen visible={memberManagerOpen} onClose={() => setMemberManagerOpen(false)} />
      </ScreenOverlay>
      <ScreenOverlay visible={scheduleOpen} fullBleed={sidebarOpen}>
        <FullScheduleScreen visible={scheduleOpen} onClose={() => setScheduleOpen(false)} />
      </ScreenOverlay>
      <TrialExpiryModal />
      <TourOverlay />
      <PurchaseCelebrationOverlay />
    </NavigationContainer>
  );
}

type ResponsiveShellProps = {
  onLayoutRootView: () => void;
};

function ResponsiveShell({ onLayoutRootView }: ResponsiveShellProps) {
  const { signedUp } = useMembership();
  const { width } = useWindowDimensions();
  const [messagesOpen, setMessagesOpen] = useState(false);

  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const isLargeDesktop = isDesktop && width >= LARGE_DESKTOP_BREAKPOINT;
  const showSidebar = isDesktop && signedUp;
  const mainColumnMaxWidth =
    signedUp && isDesktop
      ? isLargeDesktop
        ? MAIN_COLUMN_DESKTOP_WIDTH_LARGE
        : MAIN_COLUMN_DESKTOP_WIDTH
      : PHONE_FRAME_MAX_WIDTH;
  const sidebarWidth = isLargeDesktop ? SIDEBAR_WIDTH_LARGE : SIDEBAR_WIDTH;

  return (
    <View style={[styles.layoutRow, showSidebar && { gap: LAYOUT_GAP }]}>
      <View
        style={[styles.mainColumn, Platform.OS === 'web' && { maxWidth: mainColumnMaxWidth }]}
        onLayout={onLayoutRootView}
      >
        <ModalRootProvider>
          {signedUp ? (
            <MainApp
              messagesOpen={messagesOpen}
              onOpenMessages={() => setMessagesOpen(true)}
              onCloseMessages={() => setMessagesOpen(false)}
            />
          ) : (
            <OnboardingFlow />
          )}
          <AlertHost />
          <StatusBar style="dark" />
        </ModalRootProvider>
      </View>

      {showSidebar && (
        <View style={[styles.sidebarColumn, { width: sidebarWidth }]}>
          <IdentitySidebar onOpenMessages={() => setMessagesOpen(true)} />
        </View>
      )}
    </View>
  );
}

export default function App() {
  const [bebasLoaded] = useBebasNeueFonts({ BebasNeue_400Regular });
  const [barlowLoaded] = useBarlowFonts({
    BarlowCondensed_500Medium,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });
  const [publicSansLoaded] = usePublicSansFonts({
    PublicSans_400Regular,
    PublicSans_500Medium,
    PublicSans_600SemiBold,
    PublicSans_700Bold,
  });

  const fontsLoaded = bebasLoaded && barlowLoaded && publicSansLoaded;

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
              <ProfileProvider>
                <StoriesProvider>
                  <DeckProgressProvider>
                    <ChallengeProvider>
                      <BadgeProvider>
                        <ClassSignUpProvider>
                          <TourProvider>
                            <View style={styles.webSurround}>
                              <ResponsiveShell onLayoutRootView={onLayoutRootView} />
                            </View>
                          </TourProvider>
                        </ClassSignUpProvider>
                      </BadgeProvider>
                    </ChallengeProvider>
                  </DeckProgressProvider>
                </StoriesProvider>
              </ProfileProvider>
            </CloseFriendsProvider>
          </WorkoutLogProvider>
        </CommunityProvider>
      </MembershipProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  // On web, the off-white base fills the full browser width. On phone-width
  // web (and native) the app is a single centered phone-sized column; on wide
  // desktop windows it becomes a Skool-style main column + identity sidebar.
  webSurround: {
    flex: 1,
    backgroundColor: colors.background,
  },
  layoutRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  mainColumn: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          position: 'relative',
          overflow: 'hidden',
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.hairline,
        }
      : null),
  },
  sidebarColumn: {
    paddingTop: 60,
    paddingRight: 8,
  },
  mainAppRoot: {
    flex: 1,
  },
  tabBarTourMarker: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.hairline,
  },
  tabBarHidden: {
    display: 'none',
  },
  tabBarLabel: {
    fontFamily: fonts.labelSemiBold,
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
    backgroundColor: colors.green,
  },
  lockBadge: {
    position: 'absolute',
    bottom: -3,
    right: -6,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
