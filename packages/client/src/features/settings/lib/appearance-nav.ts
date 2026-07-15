// Appearance pane subcategory ids — shared by the pane def (appearance-pane.tsx) and the surface's
// `<Section>` anchor stamps; split out to avoid a pane↔surface import cycle.
export const APPEARANCE_SUBCATEGORY_IDS = {
  messageStyle: "message-style",
  avatars: "avatars",
  sizing: "sizing",
  motion: "motion",
  messageDetails: "message-details",
  messageActions: "message-actions",
  background: "background",
  reading: "reading-typography",
  effects: "effects",
} as const;
