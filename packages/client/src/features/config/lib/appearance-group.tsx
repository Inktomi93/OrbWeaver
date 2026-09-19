// The Appearance settings pane (client-architecture-lockdown.md §8) — a PURE SKIMMER since SET-SEAMS stage
// 1: `body: { kind: "sections" }`, no own surface and no own `subcategories`. Every knob it used to render
// is now a self-owned settings-SECTION CONTRIBUTION in the feature that READS it (§6) — message style ·
// avatars · message details & actions → chat; sizing & motion · reading typography · effects · background →
// app-shell; library → character — so the config host renders the `appearance`-anchored contributions and
// DERIVES the pane's nav from them.
//
// The def is host-owned (`features/config` since #2447 folded `features/settings` in) because the host owns
// the SHELL, not the knobs. There is nothing left here to grow: adding an appearance section is one line at
// the door plus a section in its owner.

import { SunMoon } from "@orb/ui/icons";
import type { ConfigGroupDefinition } from "#state";
import { LooksFoldCaption } from "../components/looks-fold-caption.tsx";

/** The appearance pane — a `sections` skimmer. Section ORDER is the door array's order (main.tsx).
 *  `advancedFold` is #297's explicit custom arm (#866 S4): the fine-tuning knob sections (sizing & motion ·
 *  reading typography · effects) ride ONE collapsed "Customize this look" disclosure under the Looks
 *  picker — your changes, on top of the look you applied. */
export const appearanceGroup: ConfigGroupDefinition = {
  id: "appearance",
  shelf: "user",
  label: "Appearance",
  icon: SunMoon,
  description: "Your look — the applied theme — plus message style and the fine-tuning knobs on top of it.",
  advancedFold: { label: "Customize this look", caption: () => <LooksFoldCaption /> },
  body: { kind: "sections" },
};
