// The context bracket's cell DOM id — ONE home, because the id names BOTH ends of an accessibility
// relationship whose ends live in two files: the rail's cell (`components/context-rail.tsx`) carries it as
// `id`, and the viewport panel (`components/context-bracket.tsx`) points at it with `aria-labelledby`.
//
// WHY THE RELATIONSHIP IS HAND-WIRED AT ALL (#112, 2026-08-16): Base UI associates a panel with its tab only
// within ONE list, and the bracket deals TWO rails off one `Tabs` root with the viewport between them —
// which breaks that lookup and left the active panel with no accessible name at all. Naming both ends from
// this one derivation is the fix, and it is pinned by the a11y CT. Universal since the context bracket
// (#860): every tabs pane's rail is a toolbar of buttons naming a `region`, not a tablist naming a tabpanel.

/** The DOM id of the bracket rail cell for `tabId`. */
export function cellDomId(tabId: string): string {
  return `context-cell-${tabId}`;
}
