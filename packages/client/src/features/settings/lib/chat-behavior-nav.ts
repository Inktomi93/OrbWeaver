// Chat-behavior pane subcategory ids — shared by the pane def (chat-behavior-pane.tsx) and the surface's
// `<Section>` anchor stamps; split out to avoid a pane↔surface import cycle.
export const CHAT_BEHAVIOR_SUBCATEGORY_IDS = {
  messageHandling: "message-handling",
  streaming: "streaming",
} as const;
