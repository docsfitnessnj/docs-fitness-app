// Shared text-matching engine behind THE MOVEMENT VAULT's "tap a movement
// name anywhere" behavior. Deck card and WOD movement text is free-form
// ("Min 1: R - 7 Bent Rows + 7 Dead Snatches + 7 Offset Squats"), not a
// clean list of movement names, so turning names into tappable spans means
// scanning that text for known movement names/aliases rather than just
// wrapping a whole field.
import { DayWod, WEEKDAY_WODS, parseMoveRow } from '../data/content';
import { DeckCardData, DECK_CARDS } from '../data/deckCards';
import { Movement, MOVEMENTS } from '../data/movements';

type AliasEntry = { alias: string; movement: Movement };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The real video titles are exact movement names with no hand-curated
// aliases, but deck/WOD text mixes singular and plural forms of the same
// move ("Swing" vs "Swings", "Bent Row" vs "Bent Rows"). Since a match is
// always the whole phrase, adding/stripping a trailing s|es only ever
// touches the last word, so this is safe for multi-word names too.
function pluralVariants(name: string): string[] {
  const variants = new Set<string>([name]);
  if (name.endsWith('es')) variants.add(name.slice(0, -2));
  if (name.endsWith('s')) variants.add(name.slice(0, -1));
  if (!name.endsWith('s')) {
    variants.add(`${name}s`);
    variants.add(`${name}es`);
  }
  return Array.from(variants);
}

// Longest alias first, so e.g. "Kettlebell Swings" matches whole rather
// than the shorter "Swings" alias eating part of it and leaving "Kettlebell"
// as stray plain text.
const ALIAS_ENTRIES: AliasEntry[] = MOVEMENTS.flatMap((movement) =>
  pluralVariants(movement.name).map((alias) => ({ alias, movement }))
).sort((a, b) => b.alias.length - a.alias.length);

// Several real videos share an identical name (Doc re-shot some movements).
// The first one wins any ambiguous match, so linking is deterministic
// instead of depending on array/insertion order.
const ALIAS_LOOKUP = new Map<string, Movement>();
for (const entry of ALIAS_ENTRIES) {
  const key = entry.alias.toLowerCase();
  if (!ALIAS_LOOKUP.has(key)) ALIAS_LOOKUP.set(key, entry.movement);
}

const MATCHER = new RegExp(`\\b(${ALIAS_ENTRIES.map((entry) => escapeRegExp(entry.alias)).join('|')})\\b`, 'gi');

export type TextSegment = { text: string; movement?: Movement };

// Splits raw movement/workout text into plain and movement-name segments.
// Odd-indexed pieces from the capturing-group split are always a matched
// alias; even-indexed pieces are the plain text around them.
export function splitMovementSegments(text: string): TextSegment[] {
  return text
    .split(MATCHER)
    .filter((part) => part.length > 0)
    .map((part) => {
      const movement = ALIAS_LOOKUP.get(part.toLowerCase());
      return movement ? { text: part, movement } : { text: part };
    });
}

export function findMovementInText(text: string): Movement | undefined {
  return splitMovementSegments(text).find((segment) => segment.movement)?.movement;
}

export type MovementReference = { type: 'deck'; card: DeckCardData } | { type: 'wod'; wod: DayWod };

// Which deck cards and WODs mention this movement — powers the detail
// view's "appears in" list.
export function findReferencesForMovement(movement: Movement): MovementReference[] {
  const refs: MovementReference[] = [];

  for (const card of DECK_CARDS) {
    const appears = card.movements.some((line) => findMovementInText(line)?.id === movement.id);
    if (appears) refs.push({ type: 'deck', card });
  }

  for (const wod of WEEKDAY_WODS) {
    const appears = wod.moves.some((line) => findMovementInText(parseMoveRow(line).name)?.id === movement.id);
    if (appears) refs.push({ type: 'wod', wod });
  }

  return refs;
}
