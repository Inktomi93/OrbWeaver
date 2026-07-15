// Admin pane subcategory ids — shared by the pane def (admin-pane.tsx) and the surface's `<Section>`
// anchor stamps; split out to avoid a pane↔surface import cycle.
export const ADMIN_SUBCATEGORY_IDS = {
  users: "users",
  engines: "engines",
} as const;
