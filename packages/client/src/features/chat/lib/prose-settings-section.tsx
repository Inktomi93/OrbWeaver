// The Prose settings-SECTION CONTRIBUTION (PROSE-1 S2 / client-architecture-lockdown.md §6c) — the
// co-located definition chat exports on its front door; the composition root assembles it into the ONE
// settings-section registry and the chat-behavior skimmer pane renders it at its anchor.
//
// The `owns` claim is the whole editable slot cohort. These keys carry DOTS because a `UserSettings.prose`
// key IS a slot id (`chat.arbiter.system`) — they are still TOP-LEVEL keys of the namespace, not nested
// paths, and the partition's nesting arm only fires on a genuine parent/child pair (`a.b` claimed beside
// `a.b.c`). No slot id is a dotted prefix of another; keep it that way, or split the claims.

import { USER_PROSE_SLOT_IDS } from "@orb/contracts/prose";
import type { SettingsSectionContribution } from "#state";
import { ProseSettingsSection } from "../components/prose-settings-section.tsx";
import { PROSE_SETTINGS_SUBCATEGORY } from "./prose-settings-model.ts";

const SECTION_ID = "chat-prose";

export const proseSettingsSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "chat-behavior",
  nav: PROSE_SETTINGS_SUBCATEGORY,
  owns: { tier: "user", section: "prose", keys: USER_PROSE_SLOT_IDS },
  body: () => <ProseSettingsSection sectionId={SECTION_ID} />,
};
