// biome-ignore-all lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react
// re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve LucideIcon fine (the
// rail-slots.ts precedent).

// settings-nav-model — the settings registry's SHAPE vocabulary (the group/category-id tuples + the
// row interfaces + the anchor-id derivation), split out of settings-nav.ts per the UI-Arch §2.1
// component-size gate (the DATA registry alone fills that file; the shape lives here so the registry
// file stays under the cap without the two ever cycling — model imports nothing from nav). The
// category-id + group unions stay DERIVED INLINE from the tuples (`(typeof …)[number]`) — never
// exported `type` aliases (the rail-slots.ts pattern: export the tuple + interface, derive inline).

import type { LucideIcon } from "@orb/ui/icons";

/** The two nav GROUPS (UI-Arch §4.2 — the settings region's USER + APP micro-caps labels). The union is
 *  derived inline where needed (`(typeof SETTINGS_GROUPS)[number]`), never an exported alias. */
export const SETTINGS_GROUPS = ["user", "app"] as const;

/** Every settings category, in render order (grouped in the registry). Adding one = a tuple member +
 *  a `SETTINGS_CATEGORIES` map entry; the `Record<…, SettingsCategory>` then forces the copy (a missing
 *  category is a tsc error). */
export const SETTINGS_CATEGORY_IDS = [
  "account",
  "personas",
  "appearance",
  "tags",
  "workloads",
  "backup",
  "chat-behavior",
  "connections",
  "automation",
  "system",
  "admin",
] as const;

/** One searchable/jumpable setting inside a subcategory (Discord/VS-Code grammar — the leaf of the
 *  SETTINGS_INDEX). `keywords` widen fuzzy search past the label (synonyms the user might type). */
export interface SettingsSetting {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
}

/** A subcategory = one anchored SECTION inside a pane (the Appearance pane's `<Section>`s). The nav
 *  renders these as indented rows under the active category; each stamps a stable anchor node
 *  (`settingsAnchorId(categoryId, id)`) the search jumps to. */
export interface SettingsSubcategory {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
  readonly settings?: readonly SettingsSetting[];
}

export interface SettingsCategory {
  /** Which nav group this category renders under (drives the USER/APP micro-caps grouping). */
  readonly group: (typeof SETTINGS_GROUPS)[number];
  readonly label: string;
  /** The nav-row glyph (a lucide icon from the icons barrel). */
  readonly icon: LucideIcon;
  /** Distinct teaching copy for the pane — real panes ignore it; deferred panes render it (J11/J10). */
  readonly description: string;
  /** `true` when a real surface exists for this pane; false ⇒ teaching placeholder. */
  readonly built: boolean;
  /** Restricts the category's nav row + search entries + pane to owner ∪ admin viewers (UX honesty —
   *  the server's `adminProcedure` is the enforcement floor regardless; Spine-Identity §5.1). */
  readonly adminOnly?: boolean;
  /** The pane's anchored sections, in render order. Empty for teaching placeholders (nothing to jump
   *  to). The nav renders these as indented subcategory rows; the surface stamps each `<Section>` with
   *  `settingsAnchorId(categoryId, sub.id)`. */
  readonly subcategories?: readonly SettingsSubcategory[];
}

/** The human label for each group's micro-caps nav heading. */
export const SETTINGS_GROUP_LABELS: Record<(typeof SETTINGS_GROUPS)[number], string> = {
  user: "User",
  app: "App",
};

/** The DOM id of a subcategory's anchor node — derived from the registry keys, never a scattered
 *  string literal. The surface stamps this on the `<Section>`; the nav/search `scrollIntoView`s it. */
export function settingsAnchorId(
  categoryId: (typeof SETTINGS_CATEGORY_IDS)[number],
  subId: string,
): string {
  return `settings-anchor-${categoryId}-${subId}`;
}
