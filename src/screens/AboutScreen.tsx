import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { DocsBadge } from '../components/brand/DocsBadge';
import { ModalHeader } from '../components/ModalHeader';
import { openLocationMaps, shareInvite } from '../lib/links';
import { colors, fonts, TAGLINE } from '../theme';

const CREW_PHOTO = require('../../assets/brand/crew-photo.jpg');
// The photo's real pixel dimensions (1179x740) — locking the frame to this
// ratio means "cover" can never crop anyone out; the frame IS the shape.
const CREW_PHOTO_RATIO = 1179 / 740;

type WhatsInsideRow = {
  key: string;
  title: string;
  text: string;
  icon: React.ReactNode;
};

const ICON_SIZE = 22;
const ICON_COLOR = colors.white;

const WHATS_INSIDE: WhatsInsideRow[] = [
  {
    key: 'wods',
    title: "DOC'S WODS",
    text: "Five workouts a week, programmed by Doc. Log your results, track everything.",
    icon: <Ionicons name="flame-outline" size={ICON_SIZE} color={ICON_COLOR} />,
  },
  {
    key: 'cows',
    title: 'THE CHALLENGE OF THE WEEK',
    text: 'A weekly challenge with a live leaderboard. Post your time and see where you stand.',
    icon: <Ionicons name="trophy-outline" size={ICON_SIZE} color={ICON_COLOR} />,
  },
  {
    key: 'deck',
    title: 'THE DECK OF WODS',
    text: '54 workouts built as a deck of cards. Shuffle it and let it deal you your day.',
    icon: <MaterialCommunityIcons name="cards-playing-spade-outline" size={ICON_SIZE} color={ICON_COLOR} />,
  },
  {
    key: 'community',
    title: 'THE COMMUNITY',
    text: 'Supportive and friendly. Share your work if you want to, or just read along and get pushed by people doing the same thing.',
    icon: <Ionicons name="people-outline" size={ICON_SIZE} color={ICON_COLOR} />,
  },
  {
    key: 'classes',
    title: 'CLASS SIGN UP',
    text: 'Book in person group training right from the app.',
    icon: <Ionicons name="calendar-outline" size={ICON_SIZE} color={ICON_COLOR} />,
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
  return (
    <View style={styles.container}>
      {variant === 'inApp' && onBack && (
        <ModalHeader title="ABOUT DOC'S FITNESS" onBack={onBack} backTestID="close-about" />
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <DocsBadge variant="white" size={104} />
          <Text style={styles.heroTitle}>WELCOME TO{'\n'}DOC'S FITNESS</Text>
          <Text style={styles.heroTagline}>{TAGLINE.toUpperCase()}</Text>
        </View>

        <Image
          source={CREW_PHOTO}
          style={{ width: '100%', aspectRatio: CREW_PHOTO_RATIO }}
          resizeMode="cover"
          testID="about-crew-photo"
        />

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>TRAIN WITH THE DOC'S CREW, ANYWHERE</Text>
          <Text style={styles.sectionBody}>
            Five kettlebell workouts a week, a weekly challenge with a live leaderboard, and a community that shows
            up. Do it from your garage, a hotel room, or at the boathouse with us in Ventnor City.
          </Text>

          <Pressable style={styles.locationCard} onPress={openLocationMaps} testID="about-location-card">
            <Ionicons name="location-outline" size={20} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationName}>Doc's Fitness</Text>
              <Text style={styles.locationText}>Ventnor City, NJ. Group training six days a week.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>WHAT'S INSIDE</Text>
          {WHATS_INSIDE.map((row) => (
            <View key={row.key} style={styles.insideRow}>
              <View style={styles.insideIconTile}>{row.icon}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.insideTitle}>{row.title}</Text>
                <Text style={styles.insideText}>{row.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.docBand}>
          <Text style={styles.docBandHeading}>WHO'S DOC</Text>
          <Text style={styles.docBandText}>
            AJ Holland. The original Doc was his grandfather, and the name stuck. A former professional athlete with
            over 20 years of kettlebell experience and part of the StrongFirst family, he built Doc's Fitness on one
            promise: look and feel better than you did 10 years ago with just 2 hours a week of kettlebell workouts.
          </Text>
        </View>

        <View style={styles.doorsSection}>
          <View style={styles.doorCard}>
            <View style={styles.doorBanner}>
              <Text style={styles.doorBannerText}>2 WEEKS FREE</Text>
            </View>
            <View style={styles.doorBody}>
              <Text style={styles.doorTitle}>TRAIN ONLINE</Text>
              <Text style={styles.doorText}>Everything in the app, from anywhere. Your first two weeks are on us.</Text>
              <Pressable style={styles.doorButton} onPress={onStartFree} testID="about-start-free">
                <Text style={styles.doorButtonText}>START FREE</Text>
              </Pressable>
            </View>
          </View>

          <Pressable style={styles.inviteButton} onPress={shareInvite} testID="about-invite-friend">
            <Ionicons name="share-social-outline" size={18} color={colors.green} />
            <Text style={styles.inviteButtonText}>INVITE A FRIEND</Text>
          </Pressable>

          <View style={styles.doorCard}>
            <View style={styles.doorBanner}>
              <Text style={styles.doorBannerText}>FIRST CLASS FREE</Text>
            </View>
            <View style={styles.doorBody}>
              <Text style={styles.doorTitle}>TRAIN IN PERSON</Text>
              <Text style={styles.doorText}>
                Group training at Doc's Fitness in Ventnor City. Come see what it's like.
              </Text>
              <Pressable style={styles.doorButton} onPress={onBookClass} testID="about-book-class">
                <Text style={styles.doorButtonText}>BOOK YOUR CLASS</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {onSignIn && (
          <Pressable style={styles.signInRow} onPress={onSignIn} hitSlop={8} testID="about-sign-in">
            <Text style={styles.signInText}>
              Already a member? <Text style={styles.signInLink}>Sign in.</Text>
            </Text>
          </Pressable>
        )}
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
  heroTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 14,
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
  section: {
    paddingHorizontal: 20,
    marginTop: 26,
  },
  sectionHeading: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 24,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  sectionBody: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 16,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.greenDeep,
    borderRadius: 12,
    padding: 16,
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
  insideIconTile: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insideTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  insideText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 19,
  },
  docBand: {
    backgroundColor: colors.green,
    paddingHorizontal: 24,
    paddingVertical: 32,
    marginTop: 30,
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
  doorsSection: {
    paddingHorizontal: 20,
    marginTop: 30,
    gap: 16,
  },
  doorCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    overflow: 'hidden',
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
  doorText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 19,
    marginBottom: 16,
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
