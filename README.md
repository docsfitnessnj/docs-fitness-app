# Doc's Fitness

Kettlebell fitness app for Doc's Fitness (Ventnor City, NJ). Built with Expo + React Native + TypeScript.

## Preview

1. Install dependencies: `npm install`
2. Start the dev server: `npx expo start`
3. Scan the QR code with the **Expo Go** app on your phone (iOS/Android), or press `i` / `a` in the terminal for a simulator, or `w` for web.

On launch you'll hit the Welcome screen first (email capture is local/visual only — no backend yet). Starting a trial or picking a plan on the Pricing screen drops you into the main app.

Use the **TRIAL / MEMBER / FREE** toggle in the top-right corner of the tab screens to preview all three access states. Trial and Member get full access; Free (an expired trial) gets 2 of 5 weekly workouts in Doc's WODs and a locked upsell everywhere else.

## Project structure

- `App.tsx` — font loading, onboarding hand-off, navigation container, bottom tab bar
- `src/theme.ts` — brand colors, fonts, tagline
- `src/context/MembershipContext.tsx` — Trial/Member/Free state
- `src/components/MembershipToggle.tsx` — corner toggle (3-state)
- `src/components/MembershipGate.tsx` — "Join the Boathouse" locked-screen wrapper for gated tabs
- `src/components/ScreenContainer.tsx` — shared screen background/padding
- `src/screens/` — Welcome, Pricing, Doc's WODs, Doc's COWS (challenge + leaderboard), The Deck, Community
