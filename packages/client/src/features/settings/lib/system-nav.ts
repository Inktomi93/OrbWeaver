// System pane subcategory ids — shared by the pane def (system-pane.tsx) and the surface's `<Section>`
// anchor stamps; split out to avoid a pane↔surface import cycle.
export const SYSTEM_SUBCATEGORY_IDS = {
  mediaTrust: "media-trust",
  compute: "compute",
  sharedAccess: "shared-access",
  multiUser: "multi-user",
  operations: "operations",
} as const;
