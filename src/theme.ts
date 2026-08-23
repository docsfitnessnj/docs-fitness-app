// "Masters app" design system — restrained, editorial, professional.
export const colors = {
  // Base
  background: '#FBFBF9',
  card: '#FFFFFF',
  white: '#FFFFFF',

  // Primary — Masters green
  green: '#076652',
  greenDeep: '#054C3D',
  greenLight: '#0B7F66',

  // Accent — Masters yellow
  gold: '#E5B80B',
  goldBright: '#FFD520',

  // Scoreboard red — leaderboard time badges only
  scoreboardRed: '#9E1B32',

  // Playing-card red — suit glyphs only (the Deck's diamond/heart)
  playingCardRed: '#C8102E',

  // Text
  text: '#12211C',
  textMuted: '#5F6B66',

  // Hairlines
  hairline: '#E8E6E0',
};

export const fonts = {
  // Bebas Neue — wordmark, titles, hero headlines. Loud moments only.
  headline: 'BebasNeue_400Regular',

  // Public Sans — body copy, descriptions, button companion text.
  body: 'PublicSans_400Regular',
  bodyMedium: 'PublicSans_500Medium',
  bodySemiBold: 'PublicSans_600SemiBold',
  bodyBold: 'PublicSans_700Bold',

  // Barlow Condensed — small labels, eyebrows, timestamps, stats, nav labels.
  label: 'BarlowCondensed_500Medium',
  labelSemiBold: 'BarlowCondensed_600SemiBold',
  labelBold: 'BarlowCondensed_700Bold',
};

// The one tagline, used everywhere: welcome screen, hamburger footer,
// identity sidebar. Keep this the single source of truth — don't let a
// second variant creep back in.
export const TAGLINE =
  'Look and feel better than you did 10 years ago with just 2 hours a week of kettlebell training.';

export const LOCATION = {
  name: "Dr. John W. Holland Boathouse",
  city: 'Ventnor City, NJ',
};

// Window width (web only) at which the layout switches from a single
// phone-sized column to the wider main-column + identity-sidebar pair.
export const DESKTOP_BREAKPOINT = 900;
// A second, larger threshold — big monitors get a further size bump rather
// than just more empty margin around the same phone-tuned column.
export const LARGE_DESKTOP_BREAKPOINT = 1600;
