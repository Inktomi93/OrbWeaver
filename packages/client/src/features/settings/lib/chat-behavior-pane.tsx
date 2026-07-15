// The Chat behavior settings pane (client-architecture-lockdown.md §8) — DECLARED-PLANNED (unbuilt, O1's arm).

import { MessagesSquare } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";

export const chatBehaviorPane: SettingsPaneDefinition = {
  id: "chat-behavior",
  group: "user",
  label: "Chat behavior",
  icon: MessagesSquare,
  description: "How chats send, continue, and handle greetings.",
  body: { placeholder: true },
};
