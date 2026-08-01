# Doc's Fitness

Kettlebell fitness app for Doc's Fitness (Ventnor City, NJ). Built with Expo + React Native + TypeScript.

## Preview

1. Install dependencies: `npm install`
2. Start the dev server: `npx expo start`
3. Scan the QR code with the **Expo Go** app on your phone (iOS/Android), or press `i` / `a` in the terminal for a simulator, or `w` for web.

Use the **FREE / MEMBER** toggle in the top-right corner of every screen to preview both membership tiers. On the Free tier, every tab except Challenges shows a locked placeholder with an Unlock button; the Member tier unlocks full content.

## Project structure

- `App.tsx` — font loading, navigation container, bottom tab bar
- `src/theme.ts` — brand colors, fonts, tagline
- `src/context/MembershipContext.tsx` — Free/Member state
- `src/components/MembershipToggle.tsx` — corner toggle
- `src/components/MembershipGate.tsx` — locked-screen wrapper for gated tabs
- `src/components/ScreenContainer.tsx` — shared screen background/padding
- `src/screens/` — Home, Challenges, Deck, Leaderboard, Community
