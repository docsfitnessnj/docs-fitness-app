// Shared search-matching rule: a candidate matches a typed query only if
// the query is a PREFIX of the candidate's own name, or a prefix of one of
// its individual words -- never a mid-word substring. A plain `.includes()`
// (the app's own search used this before) means a single common letter
// ("L") returns almost everything with that letter anywhere in it; this is
// what every picker-style match in the app should use instead.
export function matchesWordStart(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const n = name.toLowerCase();
  if (n.startsWith(q)) return true;
  return n.split(/[^a-z0-9]+/).some((word) => word.length > 0 && word.startsWith(q));
}
