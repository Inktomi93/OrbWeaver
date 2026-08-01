// The Regex settings pane (client-architecture-lockdown.md §8) — co-located SettingsPaneDefinition
// wrapping the feature's surface. Registered at the door (main.tsx); features/regex owns this pane (D114 /
// SET-SEAMS stage 5, SUPERSEDING O3's "settings keeps the regex pane"). `surface` mode: a script LIBRARY,
// not a knob stack.

import { WandSparkles } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { RegexSettingsSurface } from "../surfaces/regex-settings-surface";
import { REGEX_SUBCATEGORY_IDS } from "./regex-nav";

export const regexPane: SettingsPaneDefinition = {
  id: "regex",
  group: "user",
  label: "Regex",
  icon: WandSparkles,
  description: "Owner-global find/replace scripts applied to every chat you host.",
  subcategories: [
    {
      id: REGEX_SUBCATEGORY_IDS.scripts,
      label: "Scripts",
      keywords: ["regex", "find", "replace", "substitute", "transform", "script"],
    },
  ],
  body: { kind: "surface", render: () => <RegexSettingsSurface /> },
};
