// The settings-pane contract (client-architecture-lockdown.md §8) — the section/modal registry move
// applied to settings: ONE co-located definition per pane, assembled at the door (main.tsx). Homed here
// (not features/settings) because it binds SETTINGS_CATEGORY_IDS (state-owned, §5 rule 5) to the render
// shape — the `section-registry.ts`/`modal-registry.ts` precedent. `SettingsViewerView` is the state-owned
// PROJECTION a Def's `when` consumes (§5 rule 6) — state cannot import `#data`'s `Viewer`
// (`client-state-below-data` has zero type-only exemption), so the settings HOST computes this narrow
// shape from its own `useViewer()`/session read and supplies it at nav/search/pane-filter time.

import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { ContributorRegistry } from "#lib";
import type { SettingsCategoryId, SettingsSectionAnchor } from "./shell-store";
import { SETTINGS_SECTION_ANCHORS } from "./shell-store";

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

/** The DOM id of a subcategory's anchor node — derived from the registry keys, never a scattered string
 *  literal. Shared by every pane surface (owner features + the settings host's scroll-spy). */
export function settingsAnchorId(categoryId: SettingsCategoryId, subId: string): string {
  return `settings-anchor-${categoryId}-${subId}`;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// The settings-SECTION contribution seam (client-architecture-lockdown.md §6c / pain-point §7) — the
// granularity BELOW panes. A pane owns a CATEGORY; a domain that only needs ONE anchored section inside an
// existing pane (memory's master switch, world-info's scan knobs) CONTRIBUTES it here instead of growing
// the settings god-feature. Structural mirror of the character-detail `editor-sections` seam
// (`CharacterDetailContribution` + `resolveDetailSections`, registry-contracts.ts): an OPEN
// `ContributorRegistry` (no fixed vocabulary — purely additive, so no existing pane's in-body sections
// must migrate, §A's total-registry migration clause never triggers), assembled EMPTY-typed at the door
// (G8), threaded into the host pane's surface by PROP (the `detailContributors` posture), consumed at a
// named pane anchor. Zero contributions ⇒ the pane renders byte-identical to today.
//
// Homed HERE (not lib/registry-contracts.ts, where `CharacterDetailContribution` lives) because a
// contribution reuses `SettingsSubcategory` — a state-owned nav shape — so the def binds state vocabulary
// and homes in state (§5 rule 6; `client-lib-floor` forbids lib importing state). `ContributorRegistry`
// rides DOWN from `#lib` (the sanctioned direction, the slash-command-registry-context precedent).
// ════════════════════════════════════════════════════════════════════════════════════════════════════

// The anchor vocabulary (`SETTINGS_SECTION_ANCHORS` / `SettingsSectionAnchor`) is SHELL VOCABULARY and homes
// in `shell-store.ts` beside `SETTINGS_CATEGORY_IDS` (§5 rule 5 / M6.1; re-declaring it here trips
// `no-parallel-section-map`). It is imported above; `chat-behavior` hosts per-chat generation sections
// (memory master switch, world-info), `admin` hosts the AppSettings admin-tier sections (memory tuning,
// summarizer, rate limits). Each anchor is a checked SUBSET of `SettingsCategoryId` — the pane it targets.

/** A contributed settings section (§6c) — a discriminated union BY ANCHOR (the `ChatSurfaceContribution`
 *  shape), so a second anchor carrying a different projection narrows cleanly with zero casts. One arm
 *  today. `nav` reuses the existing `SettingsSubcategory` so a contributed section is a first-class
 *  nav/search citizen with zero new vocabulary (derive, don't re-declare) — the host pane merges it into
 *  its own `subcategories`. `body` renders the section keyed to `settingsAnchorId(anchor, nav.id)` so the
 *  host's scroll-spy and fuzzy-search jump work unchanged. */
export interface SettingsSectionContribution {
  /** The registry key + React key (a duplicate throws at door construction). */
  readonly id: string;
  /** The host pane this section renders into (the discriminant). */
  readonly anchor: SettingsSectionAnchor;
  /** The pane left-nav + search-index entry for this section. */
  readonly nav: SettingsSubcategory;
  /** The contributed `<Section>` node. Anchored via `settingsAnchorId(anchor, nav.id)` by the section. */
  readonly body: () => ReactNode;
}

/** A resolved contributed section — the node plus its nav, in declared registry order. */
export interface ResolvedSettingsSection {
  readonly id: string;
  readonly nav: SettingsSubcategory;
  readonly node: ReactNode;
}

/** Group every contribution by its own `anchor` into a total `Record<anchor, contributions[]>`, in
 *  declared registry order. A KEYED write (`groups[c.anchor].push`) — never an `anchor === "…"` comparison
 *  (with a single-member tuple that is provably always-true; the single-arm-dispatch-record-not-switch
 *  precedent). A future anchor is one tuple entry + one union arm; the seed stays total by construction. */
function groupByAnchor(registry: ContributorRegistry<SettingsSectionContribution>): Record<SettingsSectionAnchor, readonly SettingsSectionContribution[]> {
  const groups = Object.fromEntries(SETTINGS_SECTION_ANCHORS.map((a) => [a, [] as SettingsSectionContribution[]])) as Record<
    SettingsSectionAnchor,
    SettingsSectionContribution[]
  >;
  for (const c of registry.list()) {
    groups[c.anchor].push(c);
  }
  return groups;
}

/** The contributed sections for one anchor, in declared registry order — the host pane appends these
 *  below its own sections and merges their `nav`s into its subcategory list. Zero contributions ⇒ an
 *  empty array (the caller renders no wrapper — byte-identical to today, the `editor-sections` posture). */
export function resolveSettingsSections(
  registry: ContributorRegistry<SettingsSectionContribution>,
  anchor: SettingsSectionAnchor,
): readonly ResolvedSettingsSection[] {
  return groupByAnchor(registry)[anchor].map((c) => ({ id: c.id, nav: c.nav, node: c.body() }));
}

/** The `nav` entries a host pane merges into its own subcategory list, for one anchor — same grouping,
 *  in declared registry order. Consumed by the pane def (nav-time) while `resolveSettingsSections` is
 *  consumed by the surface (render-time), off the SAME keyed group so neither compares an anchor. */
export function settingsSectionNavs(registry: ContributorRegistry<SettingsSectionContribution>, anchor: SettingsSectionAnchor): readonly SettingsSubcategory[] {
  return groupByAnchor(registry)[anchor].map((c) => c.nav);
}
