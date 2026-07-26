// The Chat behavior settings pane (PD-146) — co-located SettingsPaneDefinition wrapping the real surface.
// Registered at the door (main.tsx); settings owns this pane. Two groups mirror neo's Preferences behavior
// column: message handling (send/continue/auto-swipe/stopping strings) + streaming (smooth reveal).
//
// This pane is the ONE host of the settings-SECTION contribution seam today (client-architecture-lockdown.md
// §6c / pain-point §7): it is a FACTORY taking the `chat-behavior`-anchored `SettingsSectionContribution`
// registry (assembled at the door), which it threads into its surface by PROP and whose contributed navs it
// MERGES into its own subcategories so a contributed section (memory ①, world-info ②) is a first-class
// nav/search citizen. Zero contributions ⇒ byte-identical to the pre-seam pane (the `editor-sections`
// posture). The def homes settings-owned; the contributed sections home in their OWNING features.

import { MessagesSquare } from "@orb/ui/icons";
import type { ContributorRegistry } from "#lib";
import type { SettingsPaneDefinition, SettingsSectionContribution, SettingsSubcategory } from "#state";
import { settingsSectionNavs } from "#state";
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

/** The chat-behavior pane is the ONE host of the settings-section seam today. `sectionContributors` is the
 *  door-assembled `chat-behavior`-anchored registry; the pane merges each contribution's `nav` into its
 *  subcategory list (so the section is nav/search-reachable) and threads the whole registry into its surface
 *  by prop. Zero contributions ⇒ identical to the pre-seam pane. */
export function makeChatBehaviorPane(sectionContributors: ContributorRegistry<SettingsSectionContribution>): SettingsPaneDefinition {
  const contributedNavs = settingsSectionNavs(sectionContributors, "chat-behavior");
  return {
    id: "chat-behavior",
    group: "user",
    label: "Chat behavior",
    icon: MessagesSquare,
    description: "How chats send, continue, and stream.",
    subcategories: [...OWN_SUBCATEGORIES, ...contributedNavs],
    body: () => <ChatBehaviorSettingsSurface sectionContributors={sectionContributors} />,
  };
}
