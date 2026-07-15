// The Tags settings pane (client-architecture-lockdown.md §8) — co-located SettingsPaneDefinition
// wrapping the existing surface. Registered at the door (main.tsx); settings owns this pane (O3).

import { Hash } from "@orb/ui/icons";
import type { SettingsPaneDefinition } from "#state";
import { TagsSettingsSurface } from "../surfaces/tags-settings-surface";
import { TAGS_SUBCATEGORY_IDS } from "./tags-nav";

export const tagsPane: SettingsPaneDefinition = {
  id: "tags",
  group: "user",
  label: "Tags",
  icon: Hash,
  description: "Rename, recolor, reorder, merge, and delete the labels across your library.",
  subcategories: [
    {
      id: TAGS_SUBCATEGORY_IDS.tags,
      label: "Tags",
      keywords: ["label", "folder", "color", "merge", "rename", "prune"],
    },
  ],
  body: () => <TagsSettingsSurface />,
};
