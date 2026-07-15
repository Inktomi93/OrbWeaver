// The Regex settings pane (client-architecture-lockdown.md §8) — co-located SettingsPaneDefinition
// wrapping the existing surface. Registered at the door (main.tsx); settings owns this pane (O3).

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve WandSparkles fine (the settings-nav.ts precedent).
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
  body: () => <RegexSettingsSurface />,
};
