// ITEM-ACTION grammars: one function per `<verb> <subject>` sentence, the control's accessible name or its visible
// text, whichever package renders it. They live in `@orb/ui` because the cake runs `kit ← ui ← client` (constitution
// §2): a primitive (`combobox`'s chip remove, `table`'s row checkbox, `copy-button`) cannot import a client module,
// and a client feature imports this one through `@orb/ui/lib`. A new grammar homes here even when only the client
// spells it, so the next primitive that needs it finds it; `rowActionsName` predates that and stays in
// `@orb/client/lib`. ONE function, one spelling.
//
// A component and its tests build the name with the same function, so a reworded grammar moves every
// locator with the component, and a spec cannot keep asserting a name the product no longer builds.
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

/** The accessible name of a control that mounts a hidden subject on request — `Reveal <subject>`. */
export function revealActionName(subject: string): string {
  return `Reveal ${subject}`;
}

/** The accessible name of a control that unmounts a revealed subject again — `Hide <subject>`. */
export function hideActionName(subject: string): string {
  return `Hide ${subject}`;
}

/** The accessible name of a control that copies its subject to the clipboard — `Copy <subject>`. */
export function copyActionName(subject: string): string {
  return `Copy ${subject}`;
}

/** The accessible name of a control that opens its subject's editor, or of that editor's region — `Edit <subject>`. */
export function editActionName(subject: string): string {
  return `Edit ${subject}`;
}

/** The accessible name of a row's overflow menu trigger — `More actions for <subject>`. */
export function moreActionsName(subject: string): string {
  return `More actions for ${subject}`;
}

/** The accessible name of a row's disclosure of its recent runs — `Recent activity for <subject>`. */
export function recentActivityName(subject: string): string {
  return `Recent activity for ${subject}`;
}

/** The text of a control that picks a named default instead of an explicit choice — `Use the <subject>`. */
export function defaultChoiceName(subject: string): string {
  return `Use the ${subject}`;
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
