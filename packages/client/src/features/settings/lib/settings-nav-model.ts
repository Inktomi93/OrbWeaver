// biome-ignore-all lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react
// re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve LucideIcon fine (the
// rail-slots.ts precedent).

// settings-nav-model — the settings registry's shape vocabulary: group/category-id tuples, row
// interfaces, and anchor-id derivation, split out of settings-nav.ts.

import type { LucideIcon } from "@orb/ui/icons";

/** The two nav groups — the settings region's USER + APP micro-caps labels. */
export const SETTINGS_GROUPS = ["user", "app"] as const;

/** Every settings category, in render order. Adding one is a tuple member + a SETTINGS_CATEGORIES entry. */
export const SETTINGS_CATEGORY_IDS = [
  "account",
  "personas",
  "appearance",
  "tags",
  "workloads",
  "backup",
  "chat-behavior",
  "regex",
  "connections",
  "automation",
  "system",
  "admin",
] as const;

/** One searchable/jumpable setting inside a subcategory — the leaf of the settings index. */
interface SettingsSetting {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
}

/** A subcategory = one anchored section inside a pane; each stamps a stable anchor node the search jumps to. */
interface SettingsSubcategory {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
  readonly settings?: readonly SettingsSetting[];
}

export interface SettingsCategory {
  readonly group: (typeof SETTINGS_GROUPS)[number];
  readonly label: string;
  readonly icon: LucideIcon;
  /** Distinct teaching copy for the pane — real panes ignore it; deferred panes render it. */
  readonly description: string;
  /** `true` when a real surface exists for this pane; false ⇒ teaching placeholder. */
  readonly built: boolean;
  /** Restricts the category's nav row + search entries + pane to owner ∪ admin viewers. */
  readonly adminOnly?: boolean;
  /** The pane's anchored sections, in render order. Empty for teaching placeholders. */
  readonly subcategories?: readonly SettingsSubcategory[];
}

/** The human label for each group's micro-caps nav heading. */
export const SETTINGS_GROUP_LABELS: Record<(typeof SETTINGS_GROUPS)[number], string> = {
  user: "User",
  app: "App",
};

/** The DOM id of a subcategory's anchor node — derived from the registry keys, never a scattered string literal. */
export function settingsAnchorId(
  categoryId: (typeof SETTINGS_CATEGORY_IDS)[number],
  subId: string,
): string {
  return `settings-anchor-${categoryId}-${subId}`;
}
