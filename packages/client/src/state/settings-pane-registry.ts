// The settings-pane contract (client-architecture-lockdown.md §8) — the section/modal registry move
// applied to settings: ONE co-located definition per pane, assembled at the door (main.tsx). Homed here
// (not features/settings) because it binds SETTINGS_CATEGORY_IDS (state-owned, §5 rule 5) to the render
// shape — the `section-registry.ts`/`modal-registry.ts` precedent. `SettingsViewerView` is the state-owned
// PROJECTION a Def's `when` consumes (§5 rule 6) — state cannot import `#data`'s `Viewer`
// (`client-state-below-data` has zero type-only exemption), so the settings HOST computes this narrow
// shape from its own `useViewer()`/session read and supplies it at nav/search/pane-filter time.

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve LucideIcon fine (the section-registry.ts precedent).
import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { SettingsCategoryId } from "./shell-store";

/** The two nav groups — the settings region's USER + APP micro-caps taxonomy (pane taxonomy homes WITH
 *  the Def, not shell-store — the section-registry `SectionGroup` precedent). */
export const SETTINGS_GROUPS = ["user", "app"] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

/** One searchable/jumpable setting inside a subcategory — the leaf of the settings search index. */
interface SettingsSetting {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
}

/** A subcategory = one anchored section inside a pane; each stamps a stable anchor node the search jumps to. */
export interface SettingsSubcategory {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
  readonly settings?: readonly SettingsSetting[];
}

/** The state-owned viewer PROJECTION `when` consumes — plain derived values only, no `data/` import
 *  (§5 rule 6). Fields grow as gates need them; today's whole need is the admin gate. */
export interface SettingsViewerView {
  readonly isAdmin: boolean;
}

/** A settings category as ONE definition. `body` is a real feature-owned render, or the DECLARED-PLANNED
 *  arm (`{ placeholder: true }`) — a category with no branch can no longer silently placeholder. */
export interface SettingsPaneDefinition {
  readonly id: SettingsCategoryId;
  /** USER (Account · Personas · Appearance · Chat behavior · …) / APP (Connections · Automation ·
   *  System · Admin) — the §4.2 taxonomy. */
  readonly group: SettingsGroup;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Distinct teaching copy for the pane — real panes ignore it; a placeholder pane renders it. */
  readonly description: string;
  /** Declarative viewer gating — replaces `adminOnly`. Consumes the PROJECTION, never `data/`'s
   *  `Viewer` (the §6b "def declares, consumer supplies" inversion). Absent = always visible. */
  readonly when?: (viewer: SettingsViewerView) => boolean;
  /** The pane's anchored sections, in render order. Absent/empty for a placeholder pane. */
  readonly subcategories?: readonly SettingsSubcategory[];
  readonly body: (() => ReactNode) | { readonly placeholder: true };
}
