// Regex pane subcategory ids — shared by the pane def (regex-pane.tsx) and the surface's `<Section>`
// anchor stamp; split out to avoid a pane↔surface import cycle.
export const REGEX_SUBCATEGORY_IDS = { scripts: "scripts" } as const;
