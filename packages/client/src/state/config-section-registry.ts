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
  | {
      readonly tier: "user";
      readonly section: UserSettingsSection;
      readonly keys: readonly string[];
      /** Owned keys that hold a library the user builds (the seeded background plates), not a setting with a
       *  default: the section patches them, and `@modified` never counts them. Each must also be in `keys`. */
      readonly libraryKeys?: readonly string[];
    }
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
   *  default). LIST/search citizenship is unchanged — a landing on a folded
   *  section opens the fold. Absent = a plain section. */
  readonly advanced?: boolean;
  /** The contributed `<Section>` node. Anchored via `configAnchorId(anchor, nav.id)` by the section. */
  readonly body: () => ReactNode;
}

/** A resolved contributed section — the node plus its nav. Which PARTITION it landed in is the partition's
 *  own fact (`ConfigSectionPartition`), never a flag on the item: one home for the fold membership. */
export interface ResolvedConfigSection {
  readonly id: string;
  readonly nav: ConfigSubcategory;
  readonly node: ReactNode;
}

/** ONE anchor's visible sections, split by FOLD MEMBERSHIP and in canonical order: the plain sections in
 *  declared registry order, then the `advanced: true` ones in declared registry order.
 *
 *  THIS IS THE ORDER CONTRACT, and it has exactly one home (#978 F4). It used to be TWO facts: the LIST
 *  and the search flattened the raw declaration order while CONTENT re-sorted it by pulling the advanced
 *  sections into the group's disclosure — so the map advertised "Avatars · Sizing & motion · Message
 *  details" over a pane that renders "Avatars · Message details" and hides Sizing & motion 2200px down
 *  behind a fold the map never mentioned (side-eye 2026-09-02 F4, byte-identical to the 08-30 drive). A
 *  map that lies about the order of the thing it maps is worse than no map.
 *
 *  Canonical order is TOTAL, not fold-conditional: a group carrying advanced sections without declaring a
 *  fold still paints them last, in both panes, because the two panes read the same partition. (That
 *  supersedes the old "advanced sections without a fold render in plain order" clause on
 *  `ConfigGroupBase.advancedFold` — the declaration is still the wall, but the WALL is this partition,
 *  not each consumer's own sort.) */
export interface ConfigSectionPartition<TSection> {
  readonly primary: readonly TSection[];
  readonly advanced: readonly TSection[];
}

/** The accumulator half of {@link ConfigSectionPartition} — the same two slots, writable, because the
 *  seed is built by keyed push. Module-local: nothing outside this file may hand out a mutable partition. */
interface MutablePartition {
  primary: ConfigSectionContribution[];
  advanced: ConfigSectionContribution[];
}

/** Partition every VISIBLE contribution by its own `anchor` into a total `Record<anchor, partition>`, each
 *  side in declared registry order — one `when` evaluation feeding every consumer. A KEYED write
 *  (`groups[c.anchor]`), never an `anchor === "…"` comparison (the
 *  single-arm-dispatch-record-not-switch precedent); the seed is total over `CONFIG_GROUP_IDS`. */
function groupByAnchor(
  registry: ContributorRegistry<ConfigSectionContribution>,
  viewer: SettingsViewerView,
): Record<ConfigGroupId, ConfigSectionPartition<ConfigSectionContribution>> {
  const groups = Object.fromEntries(CONFIG_GROUP_IDS.map((a): readonly [ConfigGroupId, MutablePartition] => [a, { primary: [], advanced: [] }])) as Record<
    ConfigGroupId,
    MutablePartition
  >;
  for (const c of registry.list()) {
    if (c.when?.(viewer) ?? true) {
      const bucket = groups[c.anchor];
      ((c.advanced ?? false) ? bucket.advanced : bucket.primary).push(c);
    }
  }
  return groups;
}

/** Project one anchor's partition through `map`, preserving the split. The ONE place a partition is
 *  turned into something a consumer renders, so a projection can never re-sort what it projects. */
function projectSections<TSection>(
  registry: ContributorRegistry<ConfigSectionContribution>,
  anchor: ConfigGroupId,
  viewer: SettingsViewerView,
  map: (contribution: ConfigSectionContribution) => TSection,
): ConfigSectionPartition<TSection> {
  const partition = groupByAnchor(registry, viewer)[anchor];
  return { primary: partition.primary.map(map), advanced: partition.advanced.map(map) };
}

function resolveOne(c: ConfigSectionContribution): ResolvedConfigSection {
  return { id: c.id, nav: c.nav, node: c.body() };
}

/** The NODE projection (the render half): one anchor's visible sections as mounted nodes, partitioned. The
 *  host group renders `primary` in flow and `advanced` inside its declared fold. Zero contributions ⇒ two
 *  empty arrays (the caller renders no wrapper — the `editor-sections` posture). */
export function resolveConfigSections(
  registry: ContributorRegistry<ConfigSectionContribution>,
  anchor: ConfigGroupId,
  viewer: SettingsViewerView,
): ConfigSectionPartition<ResolvedConfigSection> {
  return projectSections(registry, anchor, viewer, resolveOne);
}

/** The NAV projection (the map half): the `nav` entries the host merges into a group's subcategory list,
 *  partitioned the same way and off the same `when`. Consumed by the LIST (which paints the fold cohort as
 *  a named nested group) and, flattened, by search and the group-only landing. */
export function configSectionNavParts(
  registry: ContributorRegistry<ConfigSectionContribution>,
  anchor: ConfigGroupId,
  viewer: SettingsViewerView,
): ConfigSectionPartition<ConfigSubcategory> {
  return projectSections(registry, anchor, viewer, (c) => c.nav);
}

/** The nav projection FLATTENED into canonical order — for the consumers that need a sequence rather than
 *  the split: the search index (one row per section, in the order the reader will meet them) and the
 *  group-only landing (`[0]` is the first section the pane paints). */
export function configSectionNavs(
  registry: ContributorRegistry<ConfigSectionContribution>,
  anchor: ConfigGroupId,
  viewer: SettingsViewerView,
): readonly ConfigSubcategory[] {
  const { primary, advanced } = configSectionNavParts(registry, anchor, viewer);
  return [...primary, ...advanced];
}
