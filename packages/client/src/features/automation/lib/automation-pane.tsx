// The Automation settings pane (client-architecture-lockdown.md §8) — the OWNER-GLOBAL rules surface.
//
// It was `{ placeholder: true }`, the DECLARED-PLANNED arm, and its own header said what it was waiting for:
// "this one becomes the OWNER-GLOBAL rules surface when C5's global lane lands". C5 landed, so it is that
// surface — list + picker + the owner rate ceiling (interaction-direction-spec §7 C5). A pane belongs to the
// feature whose surface it is, which is why this definition lives in `features/automation` and not in
// `features/settings`.
//
// TWO SUBCATEGORIES, both real anchors the body stamps (`components/owner-rules-surface.tsx` owns the ids,
// so the nav can never address an anchor no section renders). The `surface` body arm ALSO hosts any §6c
// contributed section aimed at this pane — the surface renders them itself, at the position it owns.

import { Zap } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { OWNER_BUDGET_ANCHOR, OWNER_RULES_ANCHOR, OwnerAutomationSurface } from "../components/owner-rules-surface.tsx";

export const automationPane: SettingsPaneDefinition = {
  id: "automation",
  group: "app",
  label: "Automation",
  icon: Zap,
  // The pane's own teaching line. A `surface` pane does not RENDER this (only the placeholder arm does), so
  // it exists for search and for the nav — it says what the pane is FOR in the host's own words, and it no
  // longer has to point at a neighbouring feature as a "meanwhile".
  description: "Rules that watch your whole library and act on their own — no chat has to be open. Per-chat rules live in that chat's own settings.",
  subcategories: [
    { id: OWNER_RULES_ANCHOR, label: "Library-wide rules", keywords: ["automation", "rule", "trigger", "global"] },
    { id: OWNER_BUDGET_ANCHOR, label: "Rate limit", keywords: ["budget", "limit", "runs per hour", "spend"] },
  ],
  body: { kind: "surface", render: () => <OwnerAutomationSurface /> },
};
