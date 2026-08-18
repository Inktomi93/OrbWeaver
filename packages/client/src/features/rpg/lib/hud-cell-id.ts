// The rpg HUD cell's DOM id — ONE home, because the id names BOTH ends of an accessibility relationship
// whose ends live in two files: the rail's cell (`components/rpg-hud-rail.tsx`) carries it as `id`, and the
// viewport panel (`components/rpg-hud.tsx`) points at it with `aria-labelledby`.
//
// WHY THE RELATIONSHIP IS HAND-WIRED AT ALL (#112, 2026-08-16): Base UI associates a panel with its tab only
// within ONE list, and the HUD deals TWO rails off one `Tabs` root with the viewport between them (§7.1) —
// which breaks that lookup and left the active panel with no accessible name at all. Naming both ends from
// this one derivation is the fix, and it is pinned by the a11y CT. It lives in `lib/` rather than beside
// either consumer so neither file owns the other's half (and so a component module stays component-only).

/** The DOM id of the HUD rail cell for `tabId`. */
export function cellDomId(tabId: string): string {
  return `rpg-hud-cell-${tabId}`;
}
