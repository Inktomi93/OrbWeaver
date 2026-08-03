// The "Streaming" settings-SECTION CONTRIBUTION (SET-SEAMS stage 2) — the co-located definition chat exports
// on its front door; the composition root assembles it into the ONE settings-section registry and the
// chat-behavior skimmer pane renders it at its anchor.

import type { SettingsSectionContribution } from "#state";
import { ChatStreamingSection } from "../components/chat-behavior-streaming-section.tsx";
import { CHAT_STREAMING_KEYS, CHAT_STREAMING_SUBCATEGORY } from "./chat-behavior-streaming-model.ts";

const SECTION_ID = "chat-streaming";

export const chatStreamingSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "chat-behavior",
  nav: CHAT_STREAMING_SUBCATEGORY,
  owns: { tier: "user", section: "chat", keys: CHAT_STREAMING_KEYS },
  body: () => <ChatStreamingSection sectionId={SECTION_ID} />,
};
