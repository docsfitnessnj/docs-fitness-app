# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Web safe-area insets always report zero

`react-native-safe-area-context`'s `useSafeAreaInsets()` hook (and `insets.top`/`insets.bottom` anywhere derived from it) always reports `{top: 0, right: 0, bottom: 0, left: 0}` on web — there is no OS bridge feeding it there, unlike on native where it's correct. Any screen that uses it for spacing near the physical top or bottom edge is silently wrong specifically in an installed, standalone iPhone PWA (regular browser Safari's own chrome happens to occupy that space, which is what's made this easy to miss).

Any screen whose content touches the physical top or bottom edge of the device (a back button, a header, a badge, a tab bar, a composer — anything not already safely behind the main app top bar or the tab bar, which handle this correctly) must get its real spacing from CSS `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`, not from `insets.top`/`insets.bottom`. The established technique (see `SafeAreaTopFill.tsx` / `SafeAreaBottomFill.tsx` and the matching rules in `public/index.html`): a web-only filler `View` with a `nativeID`, sized entirely by a CSS rule keyed to that id — `height: env(safe-area-inset-top, 0px)` or `env(safe-area-inset-bottom, 0px)` — never by a numeric RN style. This resolves to `0px` (no change at all) in ordinary browser chrome and the real inset in standalone mode.

Any new full-screen layout or modal that reaches the physical top or bottom edge must use this technique, and must pass the standalone-simulation Playwright check (the one that forces the safe-area CSS variables to realistic iPhone values and asserts nothing clips) before being considered done.
