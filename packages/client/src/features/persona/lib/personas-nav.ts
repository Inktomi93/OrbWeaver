// Personas pane subcategory ids — shared by the pane def (personas-pane.tsx) and the surface's
// `<Section>` anchor stamp; split out to avoid a pane↔surface import cycle.
//
// The id stays `personas` (it is a persisted nav anchor); only the LABEL changed — the pane and its one
// subcategory both read "Personas", so the settings nav stacked two identical `button "Personas"` 40px
// apart, one the group header and one the selected item (side-eye 2026-08-03 P2). A subcategory names what
// is IN it, and what is in it is notification prefs.
export const PERSONA_SUBCATEGORY_IDS = { personas: "personas" } as const;

/** The subcategory's visible name — one home, read by the pane def AND the surface's `<Section>` heading, so
 *  the nav row and the heading it scrolls to can never say two different things. */
export const PERSONA_SUBCATEGORY_LABEL = "Notifications";
