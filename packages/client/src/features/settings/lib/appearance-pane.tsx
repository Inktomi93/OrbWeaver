// The Appearance settings pane (client-architecture-lockdown.md §8) — a PURE SKIMMER since SET-SEAMS stage
// 1: `body: { kind: "sections" }`, no own surface and no own `subcategories`. Every knob it used to render
// is now a self-owned settings-SECTION CONTRIBUTION in the feature that READS it (§6) — message style ·
// avatars · message details & actions → chat; sizing & motion · reading typography · effects · background →
// app-shell; library → character — so the settings host renders the `appearance`-anchored contributions and
// DERIVES the pane's nav from them.
//
// The def stays settings-owned because the settings feature owns the SHELL, not the knobs. There is nothing
// left here to grow: adding an appearance section is one line at the door plus a section in its owner.

import { SunMoon } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";

/** The appearance pane — a `sections` skimmer. Section ORDER is the door array's order (main.tsx). */
export const appearancePane: SettingsPaneDefinition = {
  id: "appearance",
  group: "user",
  label: "Appearance",
  icon: SunMoon,
  description: "Theme, message style, and display density.",
  body: { kind: "sections" },
};
