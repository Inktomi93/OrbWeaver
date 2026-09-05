// HOW MANY SKELETON ROWS FILL A KNOWN BOX (side-eye R-1, 2026-08-03).
//
// The home tiles reserve the height they SETTLED at on the last boot and paint `SkeletonRows` inside it.
// With a hard-coded 3 rows that reservation was honest about the box and dishonest about the content: the
// recents tile reserved 349px and painted 160px of bars, leaving 189px of blank under three lonely lines
// for the duration of the read — the exact 189px the reservation had just stopped SHIFTING, converted into
// dead space that reads as a half-broken tile rather than a loading one. And the temp-chat tile reserved
// 110.89px against that same 160px skeleton with `overflow: clip`, slicing its third bar to a 2.9px
// hairline stub, which is worse than no third bar.
//
// THE PITCH IS NOT A CONSTANT, which is the reason this is arithmetic and not a literal:
// `--spacing-control-lg` is POINTER-CONDITIONAL (2.5rem on fine pointers, 3.5rem on coarse/unknown —
// theme.css), so a hard-coded 48 would be right on a desktop and wrong on a tablet. The tokens are resolved
// from the live document the way every other runtime token read in this repo does it (`use-chart-theme.ts`,
// `use-sandbox-theme.ts`): computed value first, the generated static `TOKENS` literal as the fallback when
// there is no document to ask.
//
// It lives beside `skeleton-rows.tsx` rather than inside it only because a module that exports a component
// may export nothing else but LITERAL constants (`useComponentExportOnlyModules` with
// `allowConstantExport: true` — `export const X = 4` passes beside a component; a derived
// `export const X = LIMIT + 1` is RED, and this module is all derived arithmetic). The arithmetic is the INVERSE of that file's
// own layout — `padding="block"` top+bottom, N rows of `h-control-lg`, N−1 `gap="row"` gaps — so the two
// change together or the skeleton stops fitting its box.

import { snappedLengthPx, TOKENS } from "@orb/ui/tokens";

// DOM access rides `globalThis` with self-contained structural types — the node typecheck lane follows the
// barrel into this file and has no `dom` lib (the `use-chart-theme.ts` pattern, same reason, same shape).
interface RootElement {
  readonly nodeName?: unknown;
}
interface ComputedStyle {
  readonly fontSize: string;
  readonly getPropertyValue: (property: string) => string;
}
interface SkeletonGlobals {
  readonly document?: { readonly documentElement?: RootElement };
  readonly getComputedStyle?: (element: RootElement) => ComputedStyle;
}
// Cast via `unknown`: with the `dom` lib present, ambient globalThis shapes don't structurally overlap
// these minimal locals, so a direct assertion is rejected (TS2352).
const skeletonGlobals = globalThis as unknown as SkeletonGlobals;

const DEFAULT_ROOT_FONT_PX = 16;

/** One spacing token in px, computed-first.
 *
 *  THE VALUE IS BELTED (#1640). A custom property resolves to its authored TOKEN STREAM, not to a length —
 *  so since the spacing family took the `snapped` output role, both the live read and the static fallback
 *  spell `round(up, 3.5rem, 1px)` and a bare `parseFloat` yields NaN. That failed OPEN here: every
 *  resolution returned null and every tile silently fell back to the fixed 3 rows this file exists to
 *  replace. `snappedLengthPx` is the generator's own inverse of that serialization, so the belt is decoded
 *  exactly once, in the package that writes it. */
function spacingPx(token: "spacing.control-lg" | "spacing.row" | "spacing.block"): number | null {
  const root = skeletonGlobals.document?.documentElement;
  if (root === undefined || skeletonGlobals.getComputedStyle === undefined) {
    return snappedLengthPx(TOKENS[token].value, DEFAULT_ROOT_FONT_PX);
  }
  const computed = skeletonGlobals.getComputedStyle(root);
  const rootFontSizePx = Number.parseFloat(computed.fontSize) || DEFAULT_ROOT_FONT_PX;
  const live = computed.getPropertyValue(TOKENS[token].cssVar);
  return snappedLengthPx(live === "" ? TOKENS[token].value : live, rootFontSizePx);
}

/**
 * How many `SkeletonRows shape="line"` rows fill a box of `boxHeight` px. ROUNDED, so the residual is at
 * most half a row in either direction: a hair of blank at the bottom, or a last bar clipped to ~60% of its
 * height — neither of which reads as broken, where 189px of blank and a 2.9px stub both did. Returns
 * `fallback` when the tokens cannot be resolved (no document): a guessed pitch would be a worse lie than
 * the fixed count it replaces.
 */
export function skeletonRowCountFor(boxHeight: number, fallback: number): number {
  const rowHeight = spacingPx("spacing.control-lg");
  const gap = spacingPx("spacing.row");
  const pad = spacingPx("spacing.block");
  if (rowHeight === null || gap === null || pad === null || rowHeight + gap <= 0) {
    return fallback;
  }
  return Math.max(1, Math.round((boxHeight - 2 * pad + gap) / (rowHeight + gap)));
}
