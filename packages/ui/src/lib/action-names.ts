// The ITEM-ACTION accessible-name grammars that are spelled in BOTH packages — `Remove <subject>`,
// `Select <subject>` and `Copy <subject>`. They live here, not beside `rowActionsName` in
// `@orb/client/lib`, because the cake runs `kit ← ui ← client` (constitution §2): `combobox`'s chip
// remove, `table`'s row checkbox and `copy-button` are `@orb/ui` primitives, and a primitive
// importing a client module is an upward import — illegal, and unresolvable at the package boundary.
// So the grammar homes at the LOWEST package that spells it, and `@orb/client/lib` re-exports them
// the way it already re-exports `cn`. ONE function, one spelling.
//
// The defect they close is the one #2261 closed for `Actions for <subject>`: a copy change had to be
// chased through ~25 test locators that never imported the thing they assert, so a spec could keep
// asserting a name the product no longer builds (#2245 asserted a guessed one). With the builder, the
// component and its tests call the same function and a drifted spelling is a COMPILE error.
//
// `subject` is whatever the affordance names — a chip's own text, a file name, a tag, a row's
// disambiguated subject (`rowActionSubject`). This module holds the GRAMMAR, never the subject policy.

/**
 * The accessible name of a control that REMOVES its subject from the thing that holds it — `Remove <subject>`.
 *
 * NOT the name for a removal that must say WHERE from: the Members row menu deliberately reads
 * `Remove <name> from chat` and the rpg vocabulary editor `Remove <attr> from the vocabulary`, because
 * those rows carry a second removal whose scope differs. Those are their own sentences, not this grammar
 * with a suffix — a builder that took a trailing clause would invite the two to be confused again.
 */
export function removeActionName(subject: string): string {
  return `Remove ${subject}`;
}

/** The accessible name of a control that copies its subject to the clipboard — `Copy <subject>`. */
export function copyActionName(subject: string): string {
  return `Copy ${subject}`;
}

/**
 * The accessible name of a control that SELECTS its subject (a row/card bulk checkbox) — `Select <subject>`.
 *
 * NOT the bulk-MODE toggle: the library panes' `Select multiple` / `Select scripts` name a mode, not a
 * subject, and stay static strings at their own call sites.
 */
export function selectActionName(subject: string): string {
  return `Select ${subject}`;
}
