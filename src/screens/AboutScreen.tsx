import React, { useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { DocsBadge } from '../components/brand/DocsBadge';
import { ModalHeader } from '../components/ModalHeader';
import { openLocationMaps, shareInvite } from '../lib/links';
import { colors, fonts, TAGLINE, DESKTOP_BREAKPOINT, LARGE_DESKTOP_BREAKPOINT } from '../theme';

const CREW_PHOTO = require('../../assets/brand/crew-photo.jpg');
// The photo's real pixel dimensions (1179x740). react-native-web's Image
// doesn't reliably honor a CSS `aspectRatio` style here — it falls back to
// the source asset's raw pixel height regardless of the rendered width,
// which either crops (resizeMode="cover") or letterboxes with blank space
// (resizeMode="contain") depending on how far off that guess is. Measuring
// the container's actual width via onLayout and computing an explicit
// pixel height from it sidesteps that entirely: full width, height fully
// determined by the image's own proportions, no crop, no zoom.
const CREW_PHOTO_RATIO = 1179 / 740;

const DESKTOP_CONTENT_WIDTH = 1100;

type WhatsInsideRow = {
  key: string;
  title: string;
  text: string;
  icon: (size: number) => React.ReactNode;
};

const WHATS_INSIDE: WhatsInsideRow[] = [
  {
    key: 'wods',
    title: "DOC'S WODS",
    text: "Five workouts a week, programmed by Doc. Log your results, track everything.",
    icon: (size) => <Ionicons name="flame-outline" size={size} color={colors.white} />,
  },
  {
    key: 'cows',
    title: 'THE CHALLENGE OF THE WEEK',
    text: 'A weekly challenge with a live leaderboard. Post your time and see where you stand.',
    icon: (size) => <Ionicons name="trophy-outline" size={size} color={colors.white} />,
  },
  {
    key: 'deck',
    title: 'THE DECK OF WODS',
    text: '54 workouts built as a deck of cards. Shuffle it and let it deal you your day.',
    icon: (size) => <MaterialCommunityIcons name="cards-playing-spade-outline" size={size} color={colors.white} />,
  },
  {
    key: 'community',
    title: 'THE COMMUNITY',
    text: 'Supportive and friendly. Share your work if you want to, or just read along and get pushed by people doing the same thing.',
    icon: (size) => <Ionicons name="people-outline" size={size} color={colors.white} />,
  },
  {
    key: 'classes',
    title: 'CLASS SIGN UP',
    text: 'Book in person group training right from the app.',
    icon: (size) => <Ionicons name="calendar-outline" size={size} color={colors.white} />,
  },
];

type Props = {
  // 'onboarding' = pre-signup entry point, full CTAs, no back header.
  // 'inApp' = reached via the hamburger's INVITE A FRIEND row — has a back
  // header, and the two doors route to Memberships instead of the
  // onboarding flow since this member already has a plan.
  variant: 'onboarding' | 'inApp';
  onBack?: () => void;
  onStartFree: () => void;
  onBookClass: () => void;
  onSignIn?: () => void;
};

export function AboutScreen({ variant, onBack, onStartFree, onBookClass, onSignIn }: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const isLargeDesktop = isDesktop && width >= LARGE_DESKTOP_BREAKPOINT;
  const [photoWidth, setPhotoWidth] = useState(0);

  return (
    <View style={styles.container}>
      {variant === 'inApp' && onBack && (
        <ModalHeader title="ABOUT DOC'S FITNESS" onBack={onBack} backTestID="close-about" />
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
          <DocsBadge variant="white" size={isLargeDesktop ? 220 : isDesktop ? 190 : 104} />
          <Text
            style={[
              styles.heroTitle,
              isDesktop && styles.heroTitleDesktop,
              isLargeDesktop && styles.heroTitleLargeDesktop,
            ]}
          >
            WELCOME TO{'\n'}DOC'S FITNESS
          </Text>
          <Text
            style={[
              styles.heroTagline,
              isDesktop && styles.heroTaglineDesktop,
              isLargeDesktop && styles.heroTaglineLargeDesktop,
            ]}
          >
            {TAGLINE.toUpperCase()}
          </Text>
        </View>

        <View onLayout={(e) => setPhotoWidth(e.nativeEvent.layout.width)}>
          {photoWidth > 0 && (
            <Image
              source={CREW_PHOTO}
              style={{ width: photoWidth, height: photoWidth / CREW_PHOTO_RATIO }}
              resizeMode="contain"
              testID="about-crew-photo"
            />
          )}
        </View>

        <View style={[styles.contentContainer, isDesktop && styles.contentContainerDesktop]}>
          <View style={[styles.section, isDesktop && styles.sectionDesktop]}>
            <Text style={[styles.sectionHeading, isDesktop && styles.sectionHeadingDesktop]}>
              TRAIN WITH THE DOC'S CREW, ANYWHERE
            </Text>
            <Text style={[styles.sectionBody, isDesktop && styles.sectionBodyDesktop]}>
              Five kettlebell workouts a week, a weekly challenge with a live leaderboard, and a community that shows
              up. Do it from your garage, a hotel room, or at the boathouse with us in Ventnor City.
            </Text>
          </View>

          <View style={[styles.doorsSection, isDesktop && styles.doorsSectionDesktop]}>
            <View style={isDesktop && styles.doorsRowDesktop}>
              <View style={[styles.doorCard, isDesktop && styles.doorCardDesktop]}>
                <View style={styles.doorBanner}>
                  <Text style={styles.doorBannerText}>2 WEEKS FREE</Text>
                </View>
                <View style={styles.doorBody}>
                  <Text style={[styles.doorTitle, isDesktop && styles.doorTitleDesktop]}>TRAIN ONLINE</Text>
                  <Text style={[styles.doorText, isDesktop && styles.doorTextDesktop]}>
                    Everything in the app, from anywhere. Your first two weeks are on us.
                  </Text>
                  <Pressable style={styles.doorButton} onPress={onStartFree} testID="about-start-free">
                    <Text style={styles.doorButtonText}>START FREE</Text>
                  </Pressable>
                </View>
              </View>

              <View style={[styles.doorCard, isDesktop && styles.doorCardDesktop]}>
                <View style={styles.doorBanner}>
                  <Text style={styles.doorBannerText}>FIRST CLASS FREE</Text>
                </View>
                <View style={styles.doorBody}>
                  <Text style={[styles.doorTitle, isDesktop && styles.doorTitleDesktop]}>TRAIN IN PERSON</Text>
                  <Text style={[styles.doorText, isDesktop && styles.doorTextDesktop]}>
                    Group training at Doc's Fitness in Ventnor City. Come see what it's like.
                  </Text>
                  <Pressable style={styles.doorButton} onPress={onBookClass} testID="about-book-class">
                    <Text style={styles.doorButtonText}>BOOK YOUR CLASS</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.section, isDesktop && styles.sectionDesktop]}>
            <Text style={[styles.sectionHeading, isDesktop && styles.sectionHeadingDesktop]}>WHAT'S INSIDE</Text>
            <View style={isDesktop && styles.insideGridDesktop}>
              {WHATS_INSIDE.map((row) => (
                <View key={row.key} style={isDesktop ? styles.insideCardDesktop : styles.insideRow}>
                  <View style={[styles.insideIconTile, isDesktop && styles.insideIconTileDesktop]}>
                    {row.icon(isDesktop ? 26 : 22)}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.insideTitle, isDesktop && styles.insideTitleDesktop]}>{row.title}</Text>
                    <Text style={[styles.insideText, isDesktop && styles.insideTextDesktop]}>{row.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.docBand}>
          <View style={[styles.docBandInner, isDesktop && styles.docBandInnerDesktop]}>
            <Text style={styles.docBandHeading}>WHO'S DOC</Text>
            <Text style={[styles.docBandText, isDesktop && styles.docBandTextDesktop]}>
              AJ Holland. The original Doc was his grandfather, and the name stuck. A former professional athlete
              with over 20 years of kettlebell experience and part of the StrongFirst family, he built Doc's Fitness
              on one promise: look and feel better than you did 10 years ago with just 2 hours a week of kettlebell
              workouts.
            </Text>
          </View>
        </View>

        <View style={[styles.contentContainer, isDesktop && styles.contentContainerDesktop]}>
          <Pressable
            style={[styles.locationCard, isDesktop && styles.locationCardDesktop]}
            onPress={openLocationMaps}
            testID="about-location-card"
          >
            <Ionicons name="location-outline" size={20} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationName}>Doc's Fitness</Text>
              <Text style={styles.locationText}>Ventnor City, NJ. Group training six days a week.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
          </Pressable>

          <Pressable
            style={[styles.inviteButton, isDesktop && styles.inviteButtonDesktop]}
            onPress={shareInvite}
            testID="about-invite-friend"
          >
            <Ionicons name="share-social-outline" size={18} color={colors.green} />
            <Text style={styles.inviteButtonText}>INVITE A FRIEND</Text>
          </Pressable>

          {onSignIn && (
            <Pressable style={styles.signInRow} onPress={onSignIn} hitSlop={8} testID="about-sign-in">
              <Text style={styles.signInText}>
                Already a member? <Text style={styles.signInLink}>Sign in.</Text>
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  hero: {
    backgroundColor: colors.white,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  heroDesktop: {
    paddingTop: 72,
    paddingBottom: 80,
  },
  heroTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 14,
  },
  heroTitleDesktop: {
    fontSize: 66,
    lineHeight: 68,
    marginTop: 28,
  },
  heroTitleLargeDesktop: {
    fontSize: 88,
    lineHeight: 90,
    marginTop: 32,
  },
  heroTagline: {
    color: colors.text,
    fontFamily: fonts.labelSemiBold,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 12,
  },
  heroTaglineDesktop: {
    fontSize: 21,
    lineHeight: 30,
    marginTop: 20,
    maxWidth: 700,
  },
  heroTaglineLargeDesktop: {
    fontSize: 24,
    lineHeight: 34,
    marginTop: 24,
  },
  // Passthrough on mobile — sections keep their own paddingHorizontal.
  // On desktop this becomes the centered ~1100px reading column, and the
  // sections inside drop their own horizontal padding in favor of this one.
  contentContainer: {},
  contentContainerDesktop: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: DESKTOP_CONTENT_WIDTH,
    paddingHorizontal: 40,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 26,
  },
  sectionDesktop: {
    paddingHorizontal: 0,
    marginTop: 56,
  },
  sectionHeading: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  sectionHeadingDesktop: {
    fontSize: 34,
    marginBottom: 16,
  },
  sectionBody: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 16,
  },
  sectionBodyDesktop: {
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 760,
    marginBottom: 24,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.greenDeep,
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    marginHorizontal: 20,
  },
  locationCardDesktop: {
    marginTop: 32,
    marginHorizontal: 0,
  },
  locationName: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  locationText: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 2,
  },
  insideRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 18,
  },
  // 3-across grid on desktop, wrapping to a 2nd row for the 5th card. Each
  // card grows evenly to fill its row instead of hugging a fixed width.
  insideGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 28,
  },
  insideCardDesktop: {
    flexGrow: 1,
    flexBasis: 280,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  insideIconTile: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insideIconTileDesktop: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
  insideTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  insideTitleDesktop: {
    fontSize: 17,
    marginBottom: 5,
  },
  insideText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 19,
  },
  insideTextDesktop: {
    fontSize: 15,
    lineHeight: 21,
  },
  docBand: {
    backgroundColor: colors.green,
    paddingVertical: 32,
    marginTop: 30,
  },
  docBandInner: {
    paddingHorizontal: 24,
  },
  docBandInnerDesktop: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: DESKTOP_CONTENT_WIDTH,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  docBandHeading: {
    color: colors.goldBright,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 2,
    marginBottom: 10,
  },
  docBandText: {
    color: colors.white,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  docBandTextDesktop: {
    fontSize: 18,
    lineHeight: 27,
    maxWidth: 760,
    textAlign: 'center',
  },
  doorsSection: {
    paddingHorizontal: 20,
    marginTop: 30,
    gap: 16,
  },
  doorsSectionDesktop: {
    paddingHorizontal: 0,
    marginTop: 56,
    gap: 24,
  },
  doorsRowDesktop: {
    flexDirection: 'row',
    gap: 24,
  },
  doorCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    overflow: 'hidden',
  },
  doorCardDesktop: {
    flex: 1,
  },
  doorBanner: {
    backgroundColor: colors.gold,
    paddingVertical: 8,
    alignItems: 'center',
  },
  doorBannerText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1.5,
  },
  doorBody: {
    padding: 20,
  },
  doorTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  doorTitleDesktop: {
    fontSize: 30,
    marginBottom: 10,
  },
  doorText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 19,
    marginBottom: 16,
  },
  doorTextDesktop: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 20,
  },
  doorButton: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doorButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.green,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 16,
  },
  // Centered beneath the location card instead of sandwiched between the doors.
  inviteButtonDesktop: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
    marginTop: 20,
  },
  inviteButtonText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  signInRow: {
    alignItems: 'center',
    marginTop: 24,
  },
  signInText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  signInLink: {
    color: colors.green,
    fontFamily: fonts.bodySemiBold,
    textDecorationLine: 'underline',
  },
});
