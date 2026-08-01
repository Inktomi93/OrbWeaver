// The Chat behavior settings pane (PD-146) — co-located SettingsPaneDefinition wrapping the real surface.
// Registered at the door (main.tsx); settings owns this pane. Two groups mirror neo's Preferences behavior
// column: message handling (send/continue/auto-swipe/stopping strings) + streaming (smooth reveal).
//
// A HOST of the settings-SECTION contribution seam (client-architecture-lockdown.md §6c / pain-point §7):
// the `chat-behavior`-anchored contributions (memory ①, world-info ②, databank ④, imagery) render inside
// its surface off the ONE door-assembled section registry, and the settings shell merges their navs into
// this pane's subcategory list. Zero contributions ⇒ byte-identical to the pre-seam pane (the
// `editor-sections` posture). The def homes settings-owned; the sections home in their OWNING features.

import { MessagesSquare } from "@orb/ui/icons";
import type { SettingsPaneDefinition, SettingsSubcategory } from "#state";
import { ChatBehaviorSettingsSurface } from "../surfaces/chat-behavior-settings-surface";
import { CHAT_BEHAVIOR_SUBCATEGORY_IDS } from "./chat-behavior-nav";

// The pane's OWN subcategories — the contributed section navs are appended after these (declared order).
const OWN_SUBCATEGORIES: readonly SettingsSubcategory[] = [
  {
    id: CHAT_BEHAVIOR_SUBCATEGORY_IDS.messageHandling,
    label: "Chat & message handling",
    keywords: ["send", "continue", "keyboard"],
    settings: [
      {
        id: "enter-sends",
        label: "Enter to send",
        keywords: ["enter", "keyboard", "newline", "shortcut"],
      },
      {
        id: "continue-on-send",
        label: "Send continues the reply",
        keywords: ["continue", "extend", "empty"],
      },
      {
        id: "auto-continue",
        label: "Auto-continue",
        keywords: ["continue", "length", "cap", "follow-up"],
      },
      {
        id: "auto-swipe",
        label: "Auto-swipe short replies",
        keywords: ["swipe", "regenerate", "retry", "blacklist"],
      },
      {
        id: "custom-stopping-strings",
        label: "Custom stopping strings",
        keywords: ["stop", "stopping", "sequence", "generation"],
      },
    ],
  },
  {
    id: CHAT_BEHAVIOR_SUBCATEGORY_IDS.streaming,
    label: "Streaming",
    keywords: ["stream", "reveal", "typing"],
    settings: [
      {
        id: "smooth-stream",
        label: "Smooth streaming",
        keywords: ["smooth", "reveal", "pace", "fade", "typing"],
      },
      {
        id: "smooth-stream-cps",
        label: "Reveal speed",
        keywords: ["speed", "cps", "rate", "characters"],
      },
    ],
  },
];

/** The chat-behavior pane — a settings-section host. `subcategories` lists only what the pane itself
 *  renders; the shell appends the `chat-behavior`-anchored contributions' navs. */
export const chatBehaviorPane: SettingsPaneDefinition = {
  id: "chat-behavior",
  group: "user",
  label: "Chat behavior",
  icon: MessagesSquare,
  description: "How chats send, continue, and stream.",
  subcategories: OWN_SUBCATEGORIES,
  body: { kind: "surface", render: () => <ChatBehaviorSettingsSurface /> },
};
