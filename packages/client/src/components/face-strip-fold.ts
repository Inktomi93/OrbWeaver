// The FaceStrip FOLD math: how many measured faces fit ONE row, and how many fold behind the overflow
// tile. Split out of `face-strip.tsx` because it is the part with rules — the component only measures the
// DOM and renders what this decides, so the rules are unit-provable without a browser.
//
// Widths are MEASURED, never derived from a count: a captioned face takes its name's natural width (up to
// `max-w-avatar-hero`), so "how many fit" is a per-item question and a hardcoded N is always wrong at some
// pane width. The strip therefore never scrolls — the pane's own width decides the cast.
//
// TWO PINNED RULES:
//  · **The tile never hides exactly one face.** "+1 more" is a button occupying precisely the slot of the
//    single face it is hiding — the affordance costs what it conceals. When one face is left over it takes
//    the tile's slot instead (`squeezed`), rendering in the tile's own narrow box with its caption clipped;
//    the full name stays the button's accessible name, so nothing is lost but pixels.
//  · **A count is honest or absent.** `hidden` is exactly the number of items the caller passed that are
//    not rendered — the tile prints it, so it can never be a guess.
//
// The one case the first rule cannot save: a SINGLE face too wide for the pane it lives in (`visible: 0,
// hidden: 1`). There is no slot to squeeze into, so the picker is the only door left.

export interface FaceFoldInput {
  /** Measured width of every candidate face, in render order. */
  readonly widths: readonly number[];
  /** Measured width of the overflow tile — the reserve the fold spends when it folds. */
  readonly triggerWidth: number;
  /** The row's resolved column gap. */
  readonly gap: number;
  /** The row's available inline size. */
  readonly available: number;
}

export interface FaceFold {
  /** How many leading faces render. */
  readonly visible: number;
  /** How many items fold into the picker — `0` means NO tile renders at all. */
  readonly hidden: number;
  /** The last visible face renders in the tile's narrow slot (the leftover-of-one rule). */
  readonly squeezed: boolean;
}

/** Does a run of `n` leading faces (plus the tile, when `triggerWidth` is given) fit `available`? */
function fits(input: FaceFoldInput, n: number, withTile: boolean): boolean {
  const slots = n + (withTile ? 1 : 0);
  if (slots === 0) {
    return true;
  }
  let total = (slots - 1) * input.gap + (withTile ? input.triggerWidth : 0);
  for (let index = 0; index < n; index += 1) {
    total += input.widths[index] ?? 0;
  }
  return total <= input.available;
}

/** The largest run of leading faces that fits (widths are positive, so the predicate is monotonic). */
function maxFitting(input: FaceFoldInput, withTile: boolean): number {
  let count = 0;
  while (count < input.widths.length && fits(input, count + 1, withTile)) {
    count += 1;
  }
  return count;
}

/** Decide the one-row fold for a measured strip. */
export function foldFaces(input: FaceFoldInput): FaceFold {
  const total = input.widths.length;
  if (maxFitting(input, false) === total) {
    return { visible: total, hidden: 0, squeezed: false };
  }
  const withTile = maxFitting(input, true);
  const leftover = total - withTile;
  // leftover === 1 implies the leftover face does NOT fit unaided (otherwise the no-tile run above would
  // have reached `total`), so the squeeze — not a wider slot — is what saves it.
  if (leftover === 1 && withTile > 0) {
    return { visible: total, hidden: 0, squeezed: true };
  }
  return { visible: withTile, hidden: leftover, squeezed: false };
}
