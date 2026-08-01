// The Chat behavior settings pane (client-architecture-lockdown.md §8) — a PURE SKIMMER since SET-SEAMS
// stage 2: `body: { kind: "sections" }`, no own surface and no own `subcategories`. Both knob groups it used
// to render inside ONE welded autosave form are self-owned settings-SECTION CONTRIBUTIONS in features/chat
// now (§6, reader-owns): message handling (send/continue/auto-swipe/stopping strings) and streaming (scroll
// mode + smooth reveal) — the composer and the streaming ghost are what read them. The pane's other sections
// (memory ①, world-info ②, databank ④, imagery) were already contributions, so the settings host renders the
// `chat-behavior`-anchored contributions and DERIVES the pane's nav from them.
//
// The def stays settings-owned because the settings feature owns the SHELL, not the knobs.

import { MessagesSquare } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";

/** The chat-behavior pane — a `sections` skimmer. Section ORDER is the door array's order (main.tsx). */
export const chatBehaviorPane: SettingsPaneDefinition = {
  id: "chat-behavior",
  group: "user",
  label: "Chat behavior",
  icon: MessagesSquare,
  description: "How chats send, continue, and stream.",
  body: { kind: "sections" },
};
