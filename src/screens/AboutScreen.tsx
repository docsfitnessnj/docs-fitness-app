import React, { useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DocsBadge } from '../components/brand/DocsBadge';
import { ExternalLinkPressable } from '../components/ExternalLinkPressable';
import { InviteFriendModal } from '../components/InviteFriendModal';
import { ModalHeader } from '../components/ModalHeader';
import { SafeAreaTopFill } from '../components/SafeAreaTopFill';
import { WebScrollScreen } from '../components/WebScrollScreen';
import { AboutBackdrop } from '../components/about/AboutBackdrop';
import { AboutVideoBand } from '../components/about/AboutVideoBand';
import { TestimonialCarousel, Testimonial } from '../components/about/TestimonialCarousel';
import { FaqAccordion, FaqItem } from '../components/about/FaqAccordion';
import { GlowPulseWrap } from '../components/about/GlowPulseWrap';
import { FOUNDING_FIFTY_PRICE } from '../context/FoundingFiftyContext';
import { FOUNDING_FIFTY_BANNER, FOUNDING_VALUE_LINE, ONLINE_PLANS, foundingDeadlineLabel, foundingSpotsLeftLabel } from '../data/plans';
import { LOCATION_MAPS_URL } from '../lib/links';
import { useFoundingFiftyPublicStatus } from '../lib/useFoundingFiftyPublicStatus';
import { colors, fonts, TAGLINE, LOCATION, DESKTOP_BREAKPOINT, LARGE_DESKTOP_BREAKPOINT } from '../theme';

const STANDARD_ONLINE_PRICE = ONLINE_PLANS.find((p) => p.key === 'monthly')!.price;

const WHOS_DOC_PHOTO = require('../../assets/brand/whos-doc.jpg');
// Real pixel size of the committed photo (confirmed directly before
// relying on it) -- uncropped means an explicit box computed from this
// real ratio, never a guessed one and never resizeMode="cover".
const WHOS_DOC_PHOTO_RATIO = 1206 / 2040;
const WHOS_DOC_PHOTO_WIDTH = 220;
const WHOS_DOC_PHOTO_WIDTH_DESKTOP = 260;

const DESKTOP_CONTENT_WIDTH = 1100;
const CAROUSEL_WIDTH_DESKTOP = 640;

const TESTIMONIALS: Testimonial[] = [
  { name: 'ADAM', quote: "Doc's Fitness has me in the best shape of my life." },
  {
    name: 'STACEY',
    quote:
      "I came into Doc's looking for a good workout and what I found was a community of support, growth, and wellness.",
  },
  { name: 'JENNIFER', quote: "The vibe is unique, it's a family, and it's a badass one!" },
  { name: 'BETH', quote: 'Simply put, it is well worth the drive every time.' },
  { name: 'MIKE', quote: 'A perfect balance of competition and support.' },
  {
    name: 'ELLEN',
    quote: "If you're looking to get stronger and have fun through the process, Doc's Fitness is the way to go!",
  },
];

// The one answer whose own text needs a real tappable Google Maps link
// embedded inside it -- rendered as a function so the address segment can
// be a genuine ExternalLinkPressable (the house's own popup-blocker-safe
// real <a> technique) rather than a Text-onPress run, which would silently
// reintroduce the exact Safari popup-blocking bug ExternalLinkPressable
// exists to avoid.
function GymAnswer() {
  return (
    <>
      <ExternalLinkPressable href={LOCATION_MAPS_URL} testID="about-faq-gym-address">
        <Text style={faqStyles.addressLink}>
          Upstairs at the {LOCATION.name} in {LOCATION.city}.
        </Text>
      </ExternalLinkPressable>
      <Text style={faqStyles.answer}>Tap the address for directions.</Text>
    </>
  );
}

const FAQS: FaqItem[] = [
  {
    key: 'what-is-the-app',
    question: "WHAT IS THE DOC'S FITNESS APP?",
    answer:
      "Your one stop shop for all kettlebell training at Doc's Fitness. Whether you train online or in person, this is where it all lives: your weekly workouts, the Challenge of the Week with a live leaderboard, the community board, the full Deck of WODs, and class booking for upstairs of the boathouse in Ventnor City, NJ.",
  },
  {
    key: 'how-long',
    question: 'HOW LONG ARE THE WORKOUTS?',
    answer: '30 minutes or less. 4 workouts a week plus an optional weekly challenge. About 2 hours a week total.',
  },
  {
    key: 'equipment',
    question: 'WHAT EQUIPMENT DO I NEED?',
    answer: 'One kettlebell is all you really need. More bells and a pull up bar help, but one bell gets it done.',
  },
  {
    key: 'experience',
    question: 'DO I NEED KETTLEBELL EXPERIENCE?',
    answer: 'No. Tap any movement in any workout and a breakdown video from Doc opens.',
  },
  {
    key: 'online-vs-in-person',
    question: "WHAT'S THE DIFFERENCE BETWEEN TRAINING ONLINE AND IN PERSON?",
    answer:
      'Online gets you the workouts, the challenge, and the community anywhere in the world. In person gets you coached classes at the gym in Ventnor City, booked right in the app. Same crew either way.',
  },
  {
    key: 'free-trial',
    question: 'IS THERE A FREE TRIAL?',
    answer:
      "Online comes with a 2 week free trial. You won't be charged until it ends and you can cancel anytime. Training in person? Your first class is free.",
  },
  {
    key: 'whats-cow',
    question: "WHAT'S DOC'S COW?",
    answer:
      "Doc's Challenge of the Week. One extra challenging workout each week, built to push your limits and train your VO2 max. Post your score to the live leaderboard.",
  },
  {
    key: 'when-drop',
    question: 'WHEN DO NEW WORKOUTS DROP?',
    answer: 'Every Sunday at 6pm Eastern. The whole week at once.',
  },
  {
    key: 'cancel',
    question: 'CAN I CANCEL ANYTIME?',
    answer: 'Yes. Right in the app. No phone calls, no hoops.',
  },
  {
    key: 'where-gym',
    question: 'WHERE IS THE GYM?',
    answer: () => <GymAnswer />,
  },
];

const DOOR1_BULLETS = [
  '4 workouts a week, 30 minutes or less, one kettlebell',
  'Plus The Challenge of the Week with a live leaderboard',
  'Every movement opens a breakdown video from Doc',
];

const DOOR2_BULLETS = [
  'Book any class right in the app',
  'Coached kettlebell classes 6 days a week',
  'Full access to everything in this app with Monthly Unlimited',
];

type Props = {
  // 'onboarding' = pre-signup entry point, full CTAs, no back header.
  // 'inApp' = reached via the hamburger's INVITE A FRIEND row — has a back
  // header, and the two doors route to Memberships instead of the
  // onboarding flow since this member already has a plan. (No live call
  // site currently passes this variant — INVITE A FRIEND now opens
  // InviteFriendModal directly — but the type and the render branch stay,
  // since nothing asked for them to be removed.)
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
  const [contentWidth, setContentWidth] = useState(0);
  const [bandWidth, setBandWidth] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);
  const founding50 = useFoundingFiftyPublicStatus();

  // 'onboarding' relies on WebScrollScreen's natural-document-scroll trick
  // (see that component and useWebDocumentScroll for why) — it only works
  // because App.tsx un-clips the whole html/body/#root/mainColumn chain
  // while signedUp is false. 'inApp' renders after sign-in, inside the
  // normal fixed-viewport tab-bar shell (mainColumn stays overflow:
  // hidden), so a plain View there has nothing to scroll it — content just
  // gets clipped at the bottom. A real ScrollView is what every other
  // in-app screen uses for exactly this reason.
  const Scroller = variant === 'inApp' ? ScrollView : WebScrollScreen;

  const whosDocPhotoWidth = isDesktop ? WHOS_DOC_PHOTO_WIDTH_DESKTOP : WHOS_DOC_PHOTO_WIDTH;
  const carouselWidth = isDesktop ? Math.min(CAROUSEL_WIDTH_DESKTOP, contentWidth || CAROUSEL_WIDTH_DESKTOP) : contentWidth;

  return (
    <View
      style={[styles.container, variant === 'inApp' && styles.containerInApp]}
      nativeID="about-screen-root"
    >
      {/* A fixed, viewport-covering sheen + two kettlewave marks -- not a
          plain background color on this (or any ancestor) box. The real
          document here runs far taller than one viewport, and every
          ancestor up through html/body is deliberately flex/auto-sized for
          the unclipped pre-signup scroll trick (see useWebDocumentScroll.ts)
          -- confirmed directly that this leaves every one of those boxes'
          own real rendered height pinned to exactly one viewport
          regardless, with the real content simply overflowing past it
          (never clipped, just unpainted-behind). A `position: fixed` layer
          sidesteps that entirely: it always covers whatever's currently
          visible, at every scroll position, with nothing needing to
          literally BE 3000+ px tall. See AboutBackdrop.tsx for why this is
          now ONE clipped wrapper rather than separate fixed layers. */}
      <AboutBackdrop />
      {/* The whole page sits on deep green now — the top safe-area fill
          matches it in both variants, instead of the old white/background
          split (which existed only because the hero used to be white). */}
      <SafeAreaTopFill backgroundColor={colors.greenDeep} />
      {variant === 'inApp' && onBack && (
        <ModalHeader title="ABOUT DOC'S FITNESS" onBack={onBack} backTestID="close-about" />
      )}

      <Scroller style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, isDesktop && styles.heroDesktop]}>
          <DocsBadge variant="black" size={isLargeDesktop ? 220 : isDesktop ? 190 : 104} />
          <Text
            style={[styles.heroTitle, isDesktop && styles.heroTitleDesktop, isLargeDesktop && styles.heroTitleLargeDesktop]}
          >
            WELCOME TO{'\n'}DOC'S FITNESS
          </Text>
          <Text style={[styles.heroTagline, isDesktop && styles.heroTaglineDesktop, isLargeDesktop && styles.heroTaglineLargeDesktop]}>
            {TAGLINE}
          </Text>
          <Text style={[styles.heroGoldLine, isDesktop && styles.heroGoldLineDesktop]}>This is fitness made easy.</Text>
        </View>

        <View
          style={isDesktop && styles.videoBandWrapDesktop}
          onLayout={(e) => setBandWidth(e.nativeEvent.layout.width)}
        >
          <AboutVideoBand width={bandWidth} rounded={isDesktop} />
        </View>

        <View style={[styles.contentContainer, isDesktop && styles.contentContainerDesktop]}>
          <View style={isDesktop && styles.doorsRowDesktop}>
            <View style={[styles.doorCard, isDesktop && styles.doorCardDesktop]}>
              <Text style={[styles.doorTitle, isDesktop && styles.doorTitleDesktop]}>TRAIN ONLINE ANYWHERE</Text>
              <Text style={styles.doorSubtitle}>THE ONLINE HOME OF THE DOC'S CREW</Text>
              <View style={styles.doorPill}>
                <Text style={styles.doorPillText}>{founding50.isLive ? 'FOUNDING 50 RATE' : '2 WEEKS FREE'}</Text>
              </View>

              {founding50.isLive ? (
                <>
                  <View style={styles.doorPriceRow}>
                    <Text style={styles.doorFoundingPrice}>
                      ${FOUNDING_FIFTY_PRICE}
                      <Text style={styles.doorFoundingCadence}> / month</Text>
                    </Text>
                    <Text style={styles.doorStruckPrice}>{STANDARD_ONLINE_PRICE}</Text>
                  </View>
                  <Text style={styles.doorSpotsLeftLine} testID="about-founding-spots-left">
                    {foundingSpotsLeftLabel(founding50.spotsRemaining)}
                  </Text>
                  {foundingDeadlineLabel(founding50.endsAt) && (
                    <Text style={styles.doorDeadlineLine} testID="about-founding-deadline">
                      {foundingDeadlineLabel(founding50.endsAt)}
                    </Text>
                  )}
                  <Text style={styles.doorFoundingRateSentence}>{FOUNDING_FIFTY_BANNER.subtitle}</Text>
                  <Text style={styles.doorFoundingValueLine}>{FOUNDING_VALUE_LINE}</Text>
                </>
              ) : (
                <View style={styles.bulletList}>
                  {DOOR1_BULLETS.map((b) => (
                    <View key={b} style={styles.bulletRow}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>{b}</Text>
                    </View>
                  ))}
                </View>
              )}

              <GlowPulseWrap borderRadius={10}>
                <Pressable style={styles.doorButton} onPress={onStartFree} testID="about-start-free">
                  <Text style={styles.doorButtonText}>
                    {founding50.isLive ? 'CLAIM YOUR SPOT' : 'START FREE ONLINE'}
                  </Text>
                </Pressable>
              </GlowPulseWrap>
            </View>

            <View style={[styles.doorCard, isDesktop && styles.doorCardDesktop]}>
              <Text style={[styles.doorTitle, isDesktop && styles.doorTitleDesktop]}>TRAIN IN PERSON AT DOC'S FITNESS</Text>
              <Text style={styles.doorSubtitle}>UPSTAIRS OF THE BOATHOUSE · VENTNOR CITY, NJ</Text>
              <View style={styles.doorPill}>
                <Text style={styles.doorPillText}>FIRST CLASS FREE</Text>
              </View>
              <View style={styles.bulletList}>
                {DOOR2_BULLETS.map((b) => (
                  <View key={b} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
              <Pressable style={styles.doorButtonOutline} onPress={onBookClass} testID="about-book-class">
                <Text style={styles.doorButtonOutlineText}>BOOK YOUR CLASS IN PERSON</Text>
              </Pressable>
            </View>
          </View>

          {onSignIn && (
            <Pressable style={styles.signInRow} onPress={onSignIn} hitSlop={8} testID="about-sign-in-upper">
              <Text style={styles.signInText}>
                Already a member? <Text style={styles.signInLink}>Sign in.</Text>
              </Text>
            </Pressable>
          )}

          <Text style={styles.crewHeading}>FROM THE CREW</Text>
          {/* Round 50, Job 2: measuring onLayout directly on
              contentContainer (the padded parent) reports that parent's
              OWN outer box -- the full available width, before its
              paddingHorizontal is subtracted -- not the narrower padded
              area a child actually has room for. Confirmed directly to be
              the real cause of the real device's horizontal drag: the
              carousel's own slide was being sized to that too-wide
              measurement, so its first slide's own right edge landed
              exactly padding-amount past the real viewport edge, which
              (unlike the two kettlewave marks, independently confirmed
              innocent) genuinely did enlarge the document's own
              scrollWidth, since a ScrollView's off-flow children are real
              siblings in the page's own layout, not clipped by a fixed/
              overflow:hidden ancestor the way the backdrop's marks are.
              A plain `width:'100%'` wrapper, as a normal child already
              inside the padded container, reports the correct narrower
              width instead. */}
          <View style={{ width: '100%' }} onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}>
            <TestimonialCarousel testimonials={TESTIMONIALS} width={carouselWidth} />
          </View>

          <Text style={styles.faqHeading}>FREQUENTLY ASKED QUESTIONS</Text>
          <FaqAccordion items={FAQS} defaultOpenKey="what-is-the-app" />

          <View style={[styles.whosDocRow, isDesktop && styles.whosDocRowDesktop]}>
            <Image
              source={WHOS_DOC_PHOTO}
              resizeMode="contain"
              style={{ width: whosDocPhotoWidth, height: whosDocPhotoWidth / WHOS_DOC_PHOTO_RATIO }}
              testID="about-whos-doc-photo"
            />
            <View style={styles.whosDocTextWrap}>
              <Text style={styles.docBandHeading}>WHO'S DOC</Text>
              <Text style={styles.docBandText}>
                AJ Holland. The original Doc was his grandfather, and the name stuck. A former professional athlete
                with over 20 years of kettlebell experience and part of the StrongFirst family, he built Doc's Fitness
                on one promise: look and feel better than you did 10 years ago with just 2 hours a week of kettlebell
                workouts.
              </Text>
            </View>
          </View>

          <ExternalLinkPressable href={LOCATION_MAPS_URL} style={styles.locationCard} testID="about-location-card">
            <Ionicons name="location-outline" size={20} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationName}>Doc's Fitness</Text>
              <Text style={styles.locationText}>Ventnor City, NJ. Group training six days a week.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </ExternalLinkPressable>

          <Pressable style={styles.inviteButton} onPress={() => setInviteOpen(true)} testID="about-invite-friend">
            <Ionicons name="share-social-outline" size={18} color={colors.white} />
            <Text style={styles.inviteButtonText}>INVITE A FRIEND</Text>
          </Pressable>

          <Text style={styles.footerLine}>DOC'S FITNESS · {LOCATION.city.toUpperCase()}</Text>
        </View>
      </Scroller>

      <InviteFriendModal visible={inviteOpen} onClose={() => setInviteOpen(false)} />
    </View>
  );
}

const faqStyles = StyleSheet.create({
  addressLink: {
    color: colors.green,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 21,
    textDecorationLine: 'underline',
  },
  answer: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
});

const styles = StyleSheet.create({
  // No background color here, deliberately -- AboutBackdrop.tsx's own
  // fixed, viewport-covering layer is what paints the page's real green
  // (and now the Round 50 sheen + marks), not this or any ancestor box.
  // Confirmed directly: this screen's real document runs far taller than
  // one viewport (3410px in Round 49's own testing), but #root/html/body/
  // #about-screen-root all measured their own rendered box at exactly one
  // viewport's height regardless -- every ancestor up through html/body is
  // deliberately auto/flex-sized for the unclipped pre-signup scroll trick
  // (see useWebDocumentScroll.ts), and WebScrollScreen's own web View adds
  // `flexGrow: 1, flexBasis: 0` on top of that for the same reason --
  // between the two, nothing in this chain ever has a definite height to
  // resolve "auto" against, so a plain background color here would stop
  // at exactly one viewport's height while the real content overflows
  // past it, unpainted-behind. A `position: fixed` layer sidesteps the
  // whole ambiguity: it always covers whatever's currently visible, with
  // nothing needing to literally BE 3000+ px tall. No `flex` here either
  // -- see containerInApp below for why.
  container: {
    width: '100%',
  },
  containerInApp: {
    flex: 1,
    // Clears ModalHeader's own back/title row, which has no background of
    // its own -- matches colors.greenDeep underneath it, so there's no
    // color seam.
    paddingTop: 60,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 28,
  },
  heroDesktop: {
    paddingTop: 72,
    paddingBottom: 56,
  },
  heroTitle: {
    color: colors.white,
    fontFamily: fonts.headline,
    fontSize: 42,
    lineHeight: 44,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 18,
  },
  heroTitleDesktop: {
    fontSize: 72,
    lineHeight: 74,
    marginTop: 30,
  },
  heroTitleLargeDesktop: {
    fontSize: 92,
    lineHeight: 94,
    marginTop: 34,
  },
  heroTagline: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 14,
    maxWidth: 420,
  },
  heroTaglineDesktop: {
    fontSize: 19,
    lineHeight: 28,
    marginTop: 22,
    maxWidth: 640,
  },
  heroTaglineLargeDesktop: {
    fontSize: 22,
    lineHeight: 32,
  },
  heroGoldLine: {
    color: colors.goldBright,
    fontFamily: fonts.bodySemiBold,
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
  },
  heroGoldLineDesktop: {
    fontSize: 19,
    lineHeight: 28,
    marginTop: 14,
  },
  videoBandWrapDesktop: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: DESKTOP_CONTENT_WIDTH,
    paddingHorizontal: 40,
  },
  contentContainer: {
    paddingHorizontal: 20,
  },
  contentContainerDesktop: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: DESKTOP_CONTENT_WIDTH,
    paddingHorizontal: 40,
  },
  doorsRowDesktop: {
    flexDirection: 'row',
    gap: 24,
  },
  doorCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
  },
  doorCardDesktop: {
    flex: 1,
    marginTop: 40,
  },
  doorTitle: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 26,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  doorTitleDesktop: {
    fontSize: 32,
  },
  doorSubtitle: {
    color: colors.textMuted,
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  doorPill: {
    alignSelf: 'center',
    backgroundColor: colors.goldBright,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
  },
  doorPillText: {
    color: colors.greenDeep,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  bulletList: {
    marginBottom: 18,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gold,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
  },
  doorPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 12,
  },
  doorFoundingPrice: {
    color: colors.text,
    fontFamily: fonts.headline,
    fontSize: 32,
    letterSpacing: 1,
  },
  doorFoundingCadence: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textMuted,
  },
  doorStruckPrice: {
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    textDecorationLine: 'line-through',
  },
  doorSpotsLeftLine: {
    color: colors.gold,
    fontFamily: fonts.labelBold,
    fontSize: 15,
    letterSpacing: 1,
  },
  doorDeadlineLine: {
    color: colors.gold,
    fontFamily: fonts.labelBold,
    fontSize: 12,
    letterSpacing: 0.8,
    marginTop: 3,
    marginBottom: 12,
  },
  doorFoundingRateSentence: {
    color: colors.text,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  doorFoundingValueLine: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  doorButton: {
    backgroundColor: colors.greenDeep,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  doorButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  doorButtonOutline: {
    borderWidth: 1.5,
    borderColor: colors.green,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  doorButtonOutlineText: {
    color: colors.green,
    fontFamily: fonts.labelBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  signInRow: {
    alignItems: 'center',
    marginTop: 24,
  },
  signInText: {
    color: colors.white,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  signInLink: {
    color: colors.goldBright,
    fontFamily: fonts.bodyBold,
    textDecorationLine: 'underline',
  },
  crewHeading: {
    color: colors.white,
    fontFamily: fonts.headline,
    fontSize: 26,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  faqHeading: {
    color: colors.white,
    fontFamily: fonts.headline,
    fontSize: 26,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 44,
    marginBottom: 18,
  },
  whosDocRow: {
    alignItems: 'center',
    marginTop: 36,
  },
  whosDocRowDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 32,
    justifyContent: 'center',
  },
  whosDocTextWrap: {
    marginTop: 16,
    maxWidth: 520,
  },
  docBandHeading: {
    color: colors.goldBright,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 2,
    marginBottom: 10,
    textAlign: 'center',
  },
  docBandText: {
    color: colors.white,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginTop: 28,
  },
  locationName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  locationText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 2,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 16,
  },
  inviteButtonText: {
    color: colors.white,
    fontFamily: fonts.labelBold,
    fontSize: 13,
    letterSpacing: 1,
  },
  footerLine: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: fonts.labelSemiBold,
    fontSize: 12,
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 36,
  },
});
