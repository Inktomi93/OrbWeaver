// The "Chat & message handling" settings-SECTION CONTRIBUTION (SET-SEAMS stage 2) — the co-located
// definition chat exports on its front door; the composition root assembles it into the ONE settings-section
// registry and the chat-behavior skimmer pane renders it at its anchor.

import type { SettingsSectionContribution } from "#state";
import { ChatMessageHandlingSection } from "../components/chat-behavior-message-handling-section.tsx";
import { CHAT_MESSAGE_HANDLING_KEYS, CHAT_MESSAGE_HANDLING_SUBCATEGORY } from "./chat-behavior-message-handling-model.ts";

// The contribution id has ONE home — this const. It is both the registry key and the id the body REPORTS
// its save status under (SET-SEAMS §3), so the body takes it as a prop rather than re-spelling the literal.
const SECTION_ID = "chat-message-handling";

export const chatMessageHandlingSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "chat-behavior",
  nav: CHAT_MESSAGE_HANDLING_SUBCATEGORY,
  owns: { tier: "user", section: "chat", keys: CHAT_MESSAGE_HANDLING_KEYS },
  body: () => <ChatMessageHandlingSection sectionId={SECTION_ID} />,
};
