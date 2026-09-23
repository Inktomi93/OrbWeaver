// The theme row's ACCESSIBLE-NAME vocabulary — one home for a string the component renders and its specs
// address (#2261). The specs used to re-spell `Theme actions: Mocha` as a literal, so a copy change broke a
// CT that never imported the source of truth; they now call this builder and the coupling is compile-time
// (constitution §2 — push enforcement up the ladder).

/**
 * The accessible name of a theme card's ⋯ trigger.
 *
 * `Theme actions: <name>`, NOT the house `Actions for <name>` (`#lib`'s `rowActionsName`) — ruled at #2252
 * and stated in `theme-row-menu.tsx`'s header: the bare `Actions for Mocha` collides with Playwright's
 * default substring matching against the theme card's own `role=radio, name="Mocha"`, so a locator for
 * "Mocha" silently resolved to the kebab and opened a modal backdrop that ate every later click.
 */
export function themeActionsName(themeName: string): string {
  return `Theme actions: ${themeName}`;
}
