// The config-SECTION contribution seam (client-architecture-lockdown.md §6c / pain-point §7 — D120's
// settings-section seam, re-anchored on `ConfigGroupId` by the config revamp, #866 S1) — the granularity
// BELOW groups. A group owns a shelf slot; a domain that only needs ONE anchored section inside an existing
// group (memory's master switch, world-info's scan knobs) CONTRIBUTES it here instead of growing the config
// host. Structural mirror of the character-detail `editor-sections` seam (`CharacterDetailContribution` +
// `resolveDetailSections`, contribution-contracts.ts): an OPEN `ContributorRegistry` (no fixed vocabulary —
// purely additive), assembled at the door as ONE registry (G8) and delivered by a `createRegistryContext`
// mint (`config-section-registry-context.ts`) — the host reads it for LIST rows/search, the host group's
// surface reads it for render. Zero contributions ⇒ the group renders byte-identical to today.
//
// Homed HERE (not lib/contribution-contracts.ts) because a contribution reuses `ConfigSubcategory` — a
// state-owned nav shape — so the def binds state vocabulary and homes in state (§5 rule 6;
// `client-lib-floor` forbids lib importing state). `ContributorRegistry` rides DOWN from `#lib`.
//
// SET-SEAMS §5.1: the anchor is a `ConfigGroupId` — EVERY group is a host. `groupByAnchor` keys over
// `CONFIG_GROUP_IDS`, which stays total by construction. The key partition that proves N sections may
// share ONE settings namespace lives beside this file in `config-section-partition.ts`.

import type { AppSettings, UserSettingsSection } from "@orb/contracts/settings";
import type { ReactNode } from "react";
import type { ContributorRegistry } from "#lib";
import type { ConfigGroupId } from "./config-group-ids.ts";
import { CONFIG_GROUP_IDS } from "./config-group-ids.ts";
import type { ConfigSubcategory, SettingsViewerView } from "./config-group-registry.ts";

/** An APP-tier write claim: a top-level `AppSettings` key, or a DOTTED PATH into one of its nested objects
 *  (`engineLaunch.genPresencePenalty`). The dotted arm exists because the app tier has no namespaces — the
 *  whole config is ONE object shared by every admin section — so two sections can legitimately own
 *  different LEAVES of one nested key (SET-SEAMS stage 4's resolution of the stage-3 `engineLaunch` hold).
 *  `deepMergeAppSettings` recurses per key exactly like the user tier's `deepMergePlain`, so leaf-disjoint
 *  sparse patches commute the same way.
 *
 *  A leaf claimant owns ONLY that leaf: it may never write or CLEAR the parent key (`{engineLaunch: null}`
 *  would wipe the co-owner's leaves), which is why the partition REDs a parent/child claim pair. */
export type AppSettingsClaimPath = keyof AppSettings | `${keyof AppSettings}.${string}`;

/** What a section claims to WRITE (SET-SEAMS §2.3, the S2 partition pin). Absent = the section persists
 *  nothing through the settings tiers (a CRUD surface like tags/personas) and is exempt from the
 *  partition. A USER-tier nested namespace claims at the TOP-level key (`retrieval`, not `retrieval.k`) —
 *  the server's `deepMergePlain` recurses, so top-level disjointness already guarantees commutativity, and
 *  a deeper claim would encode form internals in the contribution. The APP tier additionally allows a leaf
 *  path (see {@link AppSettingsClaimPath}). */
export type SettingsKeyClaim =
  | { readonly tier: "user"; readonly section: UserSettingsSection; readonly keys: readonly string[] }
  | { readonly tier: "app"; readonly keys: readonly AppSettingsClaimPath[] };

/** A contributed config section (§6c). `nav` reuses the existing `ConfigSubcategory` so a contributed
 *  section is a first-class LIST/search citizen with zero new vocabulary (derive, don't re-declare) — the
 *  host merges it into the group's subcategory list. `body` renders the section keyed to
 *  `configAnchorId(anchor, nav.id)` so the host's scroll-spy and search jump work unchanged. */
export interface ConfigSectionContribution {
  /** The registry key + React key (a duplicate throws at door construction). */
  readonly id: string;
  /** The host group this section renders into. */
  readonly anchor: ConfigGroupId;
  /** The group's LIST row + search-index entry for this section. */
  readonly nav: ConfigSubcategory;
  /** Viewer gating with group parity (SET-SEAMS §5): ONE predicate, three consumers — LIST, search, and
   *  render all run it, so a section hidden from a viewer is never a search hit that scrolls to nothing.
   *  Absent = always visible. */
  readonly when?: (viewer: SettingsViewerView) => boolean;
  /** The write claim (§2.3) — the keys this section, and only this section, patches. */
  readonly owns?: SettingsKeyClaim;
  /** Renders inside the host group's `advancedFold` disclosure (#297's explicit custom arm — collapsed by
   *  default; config-revamp-design.md §7.3). LIST/search citizenship is unchanged — a landing on a folded
   *  section opens the fold. Absent = a plain section. */
  readonly advanced?: boolean;
  /** The contributed `<Section>` node. Anchored via `configAnchorId(anchor, nav.id)` by the section. */
  readonly body: () => ReactNode;
}

/** A resolved contributed section — the node plus its nav, in declared registry order. `advanced` rides
 *  through so the host can split the fold without a second registry read. */
export interface ResolvedConfigSection {
  readonly id: string;
  readonly nav: ConfigSubcategory;
  readonly node: ReactNode;
  readonly advanced: boolean;
}

/** Group every VISIBLE contribution by its own `anchor` into a total `Record<anchor, contributions[]>`, in
 *  declared registry order — one `when` evaluation feeding all three consumers. A KEYED write
 *  (`groups[c.anchor].push`), never an `anchor === "…"` comparison (the
 *  single-arm-dispatch-record-not-switch precedent); the seed is total over `CONFIG_GROUP_IDS`. */
function groupByAnchor(
  registry: ContributorRegistry<ConfigSectionContribution>,
  viewer: SettingsViewerView,
): Record<ConfigGroupId, readonly ConfigSectionContribution[]> {
  const groups = Object.fromEntries(CONFIG_GROUP_IDS.map((a) => [a, [] as ConfigSectionContribution[]])) as Record<ConfigGroupId, ConfigSectionContribution[]>;
  for (const c of registry.list()) {
    if (c.when?.(viewer) ?? true) {
      groups[c.anchor].push(c);
    }
  }
  return groups;
}

/** The visible contributed sections for one anchor, in declared registry order — the host group renders
 *  these below its own sections. Zero contributions ⇒ an empty array (the caller renders no wrapper —
 *  byte-identical to today, the `editor-sections` posture). */
export function resolveConfigSections(
  registry: ContributorRegistry<ConfigSectionContribution>,
  anchor: ConfigGroupId,
  viewer: SettingsViewerView,
): readonly ResolvedConfigSection[] {
  return groupByAnchor(registry, viewer)[anchor].map((c) => ({ id: c.id, nav: c.nav, node: c.body(), advanced: c.advanced ?? false }));
}

/** The `nav` entries the host merges into a group's subcategory list, for one anchor — same grouping, same
 *  `when`, in declared registry order. Consumed by the LIST + search while `resolveConfigSections` is
 *  consumed by the surface (render), off the SAME keyed group so neither compares an anchor. */
export function configSectionNavs(
  registry: ContributorRegistry<ConfigSectionContribution>,
  anchor: ConfigGroupId,
  viewer: SettingsViewerView,
): readonly ConfigSubcategory[] {
  return groupByAnchor(registry, viewer)[anchor].map((c) => c.nav);
}
