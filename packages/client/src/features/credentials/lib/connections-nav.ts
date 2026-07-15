// Connections pane subcategory ids — shared by the pane def (connections-pane.tsx) and the surface's
// `<Section>` anchor stamps; split out to avoid a pane↔surface import cycle.
export const CONNECTIONS_SUBCATEGORY_IDS = {
  roles: "model-roles",
  keys: "saved-keys",
} as const;
