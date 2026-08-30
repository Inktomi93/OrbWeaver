// The avatar stack's GEOMETRY — the per-size overlap offset the stack paints with, and the settled inline
// size a stack of N slots occupies. It lives beside the component rather than inside it because a caller
// needs the second half: a stack whose roster arrives on a LATER read than the row that hosts it (a chats
// row's seats, home's hearth cast) must RESERVE its settled width up front, or the text column beside it is
// re-laid the moment the faces land (#147 — measured 76px on a one-seat hero, 148px on a three-seat one,
// 18px per extra seat on a list row; a `[cls] unexpected` on every cold section load).
//
// It is stated ONCE, here, because the numbers are the primitive's own: the overlap table below and the
// `--spacing-avatar-*` display tokens are what `AvatarStack` actually renders with, and a feature composing
// the same calc from raw px would be re-spelling primitive geometry it cannot see change (and would be
// spelling raw px in a feature, which the token law forbids outright).

import type { AvatarProps } from "#primitives/avatar";

type AvatarSize = NonNullable<AvatarProps["size"]>;

// Per-item overlap offset by size — rides as an inline style rather than a class (geometry, not a styling
// axis). `fill` is ZERO on purpose, not a placeholder: a cell-sized avatar has no px width of its own to
// overlap BY — the layout track decided it — so a fixed offset would be an arbitrary bite out of an unknown
// box. Stacking cell-sized portraits is a grid, not a stack; that arm degrades to a plain row.
export const AVATAR_STACK_OVERLAP_PX: Record<AvatarSize, number> = { sm: 12, md: 14, lg: 18, hero: 28, fill: 0, fillPortrait: 0 };

/** The display token each avatar size resolves its box from — the same `size-avatar-*` utilities the
 *  `Avatar` variants carry, as the custom properties they compile to. */
const AVATAR_SIZE_VAR: Record<AvatarSize, string | null> = {
  sm: "var(--spacing-avatar-sm)",
  md: "var(--spacing-avatar-md)",
  lg: "var(--spacing-avatar-lg)",
  hero: "var(--spacing-avatar-hero)",
  // "the cell is the size" — a `fill` avatar has no intrinsic width to reserve, so there is nothing to state.
  // Its portrait twin is the same fact at a different aspect: the track decides the width either way.
  fill: null,
  fillPortrait: null,
};

/**
 * The settled inline size an `AvatarStack` of `slots` items paints at `size` — one full avatar plus one
 * overlap-reduced step per extra slot, as a CSS length expression.
 *
 * Stamp it as `min-inline-size` on the box that holds the stack (or its pending fallback) whenever the
 * ROSTER resolves later than the row: the box is then born at its final width and the faces land INTO it
 * instead of pushing everything beside them sideways. `undefined` ⇒ nothing to reserve (no slots, or the
 * `fill` size, whose width is the layout track's to decide).
 */
export function avatarStackInlineSize(slots: number, size: AvatarSize): string | undefined {
  const sizeVar = AVATAR_SIZE_VAR[size];
  if (sizeVar === null || slots < 1) {
    return;
  }
  if (slots === 1) {
    return sizeVar;
  }
  return `calc(${sizeVar} + ${slots - 1} * (${sizeVar} - ${AVATAR_STACK_OVERLAP_PX[size]}px))`;
}
