// plugins-nav — the Plugins pane's subcategory ids, the ONE home for both ends of the anchor wiring (the
// `connections-nav.ts` / `backup-nav.ts` precedent): the pane def spells its nav from these, the surface
// stamps `settingsAnchorId("plugins", …)` from the same constants, so scroll-spy and fuzzy-search jump can
// never point at an anchor nobody rendered.

export const PLUGINS_SUBCATEGORY_IDS = {
  installed: "installed",
  install: "install",
} as const;
