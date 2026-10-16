// Shared copy rule for every typing indicator in the app (DOC'S GROUP CHAT,
// the MESSAGE DOC DIRECTLY thread, both directions) — one person's first
// name, two people's first names, or "Several people" for three or more.
// `names` is already "who else is typing right now" (the caller excludes
// the viewer's own name before calling this).
export function typingLabel(names: string[]): string | null {
  const unique = [...new Set(names)];
  if (unique.length === 0) return null;
  if (unique.length === 1) return `${unique[0]} is typing`;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]} are typing`;
  return 'Several people are typing';
}

// "Jamie Rivera" -> "Jamie". Falls back to the whole string (or "Member")
// if there's nothing to split on — same spirit as the rest of the app's
// display-name handling (see MembershipContext's deriveDisplayName).
export function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return 'Member';
  return trimmed.split(/\s+/)[0];
}
