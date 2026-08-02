// The settings-pane contract (client-architecture-lockdown.md §8) — the section/modal registry move
// applied to settings: ONE co-located definition per pane, assembled at the door (main.tsx). Homed here
// (not features/settings) because it binds SETTINGS_CATEGORY_IDS (state-owned, §5 rule 5) to the render
// shape — the `section-registry.ts`/`modal-registry.ts` precedent. `SettingsViewerView` is the state-owned
// PROJECTION a Def's `when` consumes (§5 rule 6) — state cannot import `#data`'s `Viewer`
// (`client-state-below-data` has zero type-only exemption), so the settings HOST computes this narrow
// shape from its own `useViewer()`/session read and supplies it at nav/search/pane-filter time.

import type { AppSettings, UserSettings, UserSettingsSection } from "@orb/contracts/settings";
import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { ContributorRegistry } from "#lib";
import type { SettingsCategoryId } from "./shell-store";
import { SETTINGS_CATEGORY_IDS } from "./shell-store";

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
  /** The section's real name — what its `<Section>` HEADING renders, and what search matches first. */
  readonly label: string;
  /**
   * A shorter name for the NAV ROW only, when `label` does not fit the 220px (`--width-sidebar-sm`) nav
   * column. The heading keeps the full `label` — a sidebar's width is never a reason to rename a section
   * (side-eye 2026-08-01). Search matches BOTH strings, so the abbreviation can never hide a section from
   * the reader who typed its full name. Absent = the nav row renders `label`, and it MUST fit (the
   * settings-shell CT sweeps every category and REDs on any clipped row).
   */
  readonly navLabel?: string;
  readonly keywords?: readonly string[];
  readonly settings?: readonly SettingsSetting[];
}

/** The state-owned viewer PROJECTION `when` consumes — plain derived values only, no `data/` import
 *  (§5 rule 6). Fields grow as gates need them; today's whole need is the admin gate. */
export interface SettingsViewerView {
  readonly isAdmin: boolean;
}

/** What a pane RENDERS (SET-SEAMS §5.3) — an honest three-arm union instead of "a function or a flag":
 *  - `sections` — a pure SKIMMER: the pane has no body of its own and no own `subcategories`; the host
 *    renders the sections contributed at its anchor, and nav DERIVES from them.
 *  - `surface` — a feature-owned render (a knob stack still welded into one form, or a genuinely non-knob
 *    CRUD/table pane like tags/personas/connections). It still HOSTS the sections contributed at its
 *    anchor — the surface renders them itself, at the position it owns (`useSettingsSections`).
 *  - `{ placeholder: true }` — the DECLARED-PLANNED arm; a category with no branch can no longer silently
 *    placeholder. */
export type SettingsPaneBody = { readonly kind: "sections" } | { readonly kind: "surface"; readonly render: () => ReactNode } | { readonly placeholder: true };

/** A settings category as ONE definition. `body` is the §5.3 union: a skimmer, a feature-owned surface,
 *  or the DECLARED-PLANNED placeholder arm. */
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
  /** The pane's OWN anchored sections, in render order — the contributed sections' navs are merged in by
   *  the host at nav/search time. Absent/empty for a placeholder pane and for a `sections` skimmer. */
  readonly subcategories?: readonly SettingsSubcategory[];
  readonly body: SettingsPaneBody;
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
// (`CharacterDetailContribution` + `resolveDetailSections`, contribution-contracts.ts): an OPEN
// `ContributorRegistry` (no fixed vocabulary — purely additive, so no existing pane's in-body sections
// must migrate, §A's total-registry migration clause never triggers), assembled at the door as ONE
// registry (G8) and delivered by a `createRegistryContext` mint — the host reads it for nav/search, the
// host pane's surface reads it for render. Zero contributions ⇒ the pane renders byte-identical to today.
//
// Homed HERE (not lib/contribution-contracts.ts, where `CharacterDetailContribution` lives) because a
// contribution reuses `SettingsSubcategory` — a state-owned nav shape — so the def binds state vocabulary
// and homes in state (§5 rule 6; `client-lib-floor` forbids lib importing state). `ContributorRegistry`
// rides DOWN from `#lib` (the sanctioned direction, the slash-command-registry-context precedent).
// ════════════════════════════════════════════════════════════════════════════════════════════════════

// SET-SEAMS §5.1: the anchor is a `SettingsCategoryId` — EVERY pane is a host now, so the four-member
// `SETTINGS_SECTION_ANCHORS` subset tuple retired (a subset tuple only existed because three panes were
// not yet hosts, and it made "can a section land here?" a second, drifting fact). `groupByAnchor` keys
// over `SETTINGS_CATEGORY_IDS`, which stays total by construction.

/** An APP-tier write claim: a top-level `AppSettings` key, or a DOTTED PATH into one of its nested objects
 *  (`engineLaunch.genPresencePenalty`). The dotted arm exists because the app tier has no namespaces — the
 *  whole config is ONE object shared by every admin section — so two sections can legitimately own
 *  different LEAVES of one nested key (SET-SEAMS stage 4's resolution of the stage-3 `engineLaunch` hold).
 *  `deepMergeAppSettings` recurses per key exactly like the user tier's `deepMergePlain`, so leaf-disjoint
 *  sparse patches commute the same way.
 *
 *  A leaf claimant owns ONLY that leaf: it may never write or CLEAR the parent key (`{engineLaunch: null}`
 *  would wipe the co-owner's leaves), which is why the partition below REDs a parent/child claim pair. */
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

/** A contributed settings section (§6c). `nav` reuses the existing `SettingsSubcategory` so a contributed
 *  section is a first-class nav/search citizen with zero new vocabulary (derive, don't re-declare) — the
 *  host merges it into the pane's subcategory list. `body` renders the section keyed to
 *  `settingsAnchorId(anchor, nav.id)` so the host's scroll-spy and fuzzy-search jump work unchanged. */
export interface SettingsSectionContribution {
  /** The registry key + React key (a duplicate throws at door construction). */
  readonly id: string;
  /** The host pane this section renders into. */
  readonly anchor: SettingsCategoryId;
  /** The pane left-nav + search-index entry for this section. */
  readonly nav: SettingsSubcategory;
  /** Viewer gating with pane parity (SET-SEAMS §5): ONE predicate, three consumers — nav, search, and
   *  render all run it, so a section hidden from a viewer is never a search hit that scrolls to nothing.
   *  Absent = always visible. */
  readonly when?: (viewer: SettingsViewerView) => boolean;
  /** The write claim (§2.3) — the keys this section, and only this section, patches. */
  readonly owns?: SettingsKeyClaim;
  /** The contributed `<Section>` node. Anchored via `settingsAnchorId(anchor, nav.id)` by the section. */
  readonly body: () => ReactNode;
}

/** A resolved contributed section — the node plus its nav, in declared registry order. */
export interface ResolvedSettingsSection {
  readonly id: string;
  readonly nav: SettingsSubcategory;
  readonly node: ReactNode;
}

/** Group every VISIBLE contribution by its own `anchor` into a total `Record<anchor, contributions[]>`, in
 *  declared registry order — one `when` evaluation feeding all three consumers. A KEYED write
 *  (`groups[c.anchor].push`), never an `anchor === "…"` comparison (the
 *  single-arm-dispatch-record-not-switch precedent); the seed is total over `SETTINGS_CATEGORY_IDS`. */
function groupByAnchor(
  registry: ContributorRegistry<SettingsSectionContribution>,
  viewer: SettingsViewerView,
): Record<SettingsCategoryId, readonly SettingsSectionContribution[]> {
  const groups = Object.fromEntries(SETTINGS_CATEGORY_IDS.map((a) => [a, [] as SettingsSectionContribution[]])) as Record<
    SettingsCategoryId,
    SettingsSectionContribution[]
  >;
  for (const c of registry.list()) {
    if (c.when?.(viewer) ?? true) {
      groups[c.anchor].push(c);
    }
  }
  return groups;
}

/** The visible contributed sections for one anchor, in declared registry order — the host pane renders
 *  these below its own sections. Zero contributions ⇒ an empty array (the caller renders no wrapper —
 *  byte-identical to today, the `editor-sections` posture). */
export function resolveSettingsSections(
  registry: ContributorRegistry<SettingsSectionContribution>,
  anchor: SettingsCategoryId,
  viewer: SettingsViewerView,
): readonly ResolvedSettingsSection[] {
  return groupByAnchor(registry, viewer)[anchor].map((c) => ({ id: c.id, nav: c.nav, node: c.body() }));
}

/** The `nav` entries the host merges into a pane's subcategory list, for one anchor — same grouping, same
 *  `when`, in declared registry order. Consumed by the shell (nav + search) while `resolveSettingsSections`
 *  is consumed by the surface (render), off the SAME keyed group so neither compares an anchor. */
export function settingsSectionNavs(
  registry: ContributorRegistry<SettingsSectionContribution>,
  anchor: SettingsCategoryId,
  viewer: SettingsViewerView,
): readonly SettingsSubcategory[] {
  return groupByAnchor(registry, viewer)[anchor].map((c) => c.nav);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// S2 — the key partition (SET-SEAMS §2.3). N sections saving into ONE `UserSettings` namespace is only
// safe because each patch is KEY-MINIMAL (S1): the server's read-merge-write is per-key
// (`deepMergePlain`) and serialized per user, so DISJOINT patches commute. This assertion is what turns
// that convention into a proof — it runs ONCE at the door, over the whole settings-section registry,
// against the contract defaults, and THROWS (the `createContributorRegistry` duplicate-id posture).
//
// The gap arm is scoped to CLAIMED namespaces: a namespace no section claims is still owned WHOLE by its
// pane's welded form (pre-SET-SEAMS-stage-1), which is not a partition violation — it is the migration
// state the stage table describes. The instant one section claims a key in a namespace, that namespace is
// under the partition and every remaining key must be claimed or CITED. So each stage that decomposes a
// pane brings its namespace under the pin automatically, and no stage can half-claim a namespace silently.
// The APP tier runs the OVERLAP arm only (including the nesting arm above — its claims may be leaf paths),
// never a gap arm: "an AppSettings key with no admin editor" is already `knob-wire-coverage`'s arm B2
// (D107), which reconciles it against the WHOLE admin surface with its own cited-deferral registry. Two
// registries of two different facts, deliberately (§10 Q5) — this one would only re-state it worse, since
// a key can be edited by a non-contributed surface.
// ════════════════════════════════════════════════════════════════════════════════════════════════════

/** One cited exemption from the gap arm — a key inside a CLAIMED namespace that has no client editor.
 *  Self-cleaning in BOTH directions (the D50 bus-coverage DEFERRED discipline): a key that GAINS a section
 *  REDs its stale entry, and a cite for a key that no longer exists (or for a namespace no section claims)
 *  REDs too. */
export interface UnclaimedSettingsKey {
  readonly section: UserSettingsSection;
  readonly key: string;
  /** WHY there is no editor — an unclaimed knob is the settings-side twin of a dead switch (D107). */
  readonly reason: string;
}

/** The cited gap-arm exemptions. Keep it SHORT — every entry is a knob a user cannot reach. */
export const UNCLAIMED_SETTINGS_KEYS: readonly UnclaimedSettingsKey[] = [
  {
    section: "databank",
    key: "chunk",
    reason: "ingest-time chunking params (size/overlap) — set at import, never edited after; the databank section deliberately round-trips them untouched.",
  },
];

/** `defaults[section]` as a plain key bag, or undefined when the namespace is not an object. */
function namespaceKeys(defaults: UserSettings, section: UserSettingsSection): readonly string[] | undefined {
  const value: unknown = defaults[section];
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.keys(value) : undefined;
}

function claimKey(tier: string, section: string, key: string): string {
  return `${tier}:${section}.${key}`;
}

/** A claim id back as its human `<section>.<key>` half (the tier prefix is scaffolding for the map). */
function claimLabel(id: string): string {
  return id.slice(id.indexOf(":") + 1);
}

/** An already-claimed key that NESTS with `id` — one is a dotted path INSIDE the other. A parent/child pair
 *  is an overlap in disguise: the parent's owner writes (and clears) the whole nested object, wiping the
 *  leaf owner's value. Returns the conflicting claim id + its owning section. */
function findNestedConflict(owners: ReadonlyMap<string, string>, id: string): readonly [string, string] | undefined {
  // The DOT is load-bearing: a claim that merely shares a name PREFIX (`engineLaunchExtra`) is a sibling key,
  // not a nested one.
  return [...owners].find(([claimed]) => claimed.startsWith(`${id}.`) || id.startsWith(`${claimed}.`));
}

/** Build the leaf-key → owning-section map, THROWING on the first overlap (two sections writing one key is
 *  a live lost-update: A's debounce carries its stale copy of B's value). */
function collectClaims(registry: ContributorRegistry<SettingsSectionContribution>): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const contribution of registry.list()) {
    const claim = contribution.owns;
    if (claim === undefined) {
      continue;
    }
    const section = claim.tier === "user" ? claim.section : "app";
    for (const key of claim.keys) {
      const id = claimKey(claim.tier, section, key);
      const firstOwner = owners.get(id);
      if (firstOwner !== undefined) {
        throw new Error(
          `assertSettingsKeyPartition: "${section}.${key}" is claimed by BOTH "${firstOwner}" and "${contribution.id}" — two sections writing one key is a lost update (SET-SEAMS §2.3 S2). Give the key exactly one owning section.`,
        );
      }
      const nested = findNestedConflict(owners, id);
      if (nested !== undefined) {
        throw new Error(
          `assertSettingsKeyPartition: "${section}.${key}" (claimed by "${contribution.id}") NESTS with "${claimLabel(nested[0])}" claimed by "${nested[1]}" — the outer claim's owner writes and CLEARS the whole nested object, wiping the inner one (SET-SEAMS §2.3 S2). Either split BOTH claims to disjoint leaves, or give the whole key to one section.`,
        );
      }
      owners.set(id, contribution.id);
    }
  }
  return owners;
}

/** THROWS on overlap (two sections write one key → clobber), on a GAP (a knob with no editor inside a
 *  claimed namespace → D107) that is not cited in {@link UNCLAIMED_SETTINGS_KEYS}, and on a STALE cite (a
 *  cited key that is now claimed, no longer exists, or sits in a namespace no section claims). Called once
 *  at the composition root, right after the settings-section registry is assembled. `exemptions` defaults
 *  to the live cite list and is injectable so each arm is unit-testable against a fixture. */
export function assertSettingsKeyPartition(
  registry: ContributorRegistry<SettingsSectionContribution>,
  defaults: UserSettings,
  exemptions: readonly UnclaimedSettingsKey[] = UNCLAIMED_SETTINGS_KEYS,
): void {
  const owners = collectClaims(registry);
  const claimedSections = new Set<UserSettingsSection>();
  for (const contribution of registry.list()) {
    if (contribution.owns?.tier === "user") {
      claimedSections.add(contribution.owns.section);
    }
  }
  const cited = validateCites(exemptions, owners, claimedSections, defaults);
  assertNoGaps(claimedSections, defaults, owners, cited);
}

/** The STALE-CITE arms — a cite that is now claimed, sits in an unclaimed (still pane-owned) namespace, or
 *  names a key the contract no longer has. Returns the validated cite ids. */
function validateCites(
  exemptions: readonly UnclaimedSettingsKey[],
  owners: ReadonlyMap<string, string>,
  claimedSections: ReadonlySet<UserSettingsSection>,
  defaults: UserSettings,
): ReadonlySet<string> {
  const cited = new Set<string>();
  for (const exemption of exemptions) {
    const id = claimKey("user", exemption.section, exemption.key);
    const owner = owners.get(id);
    if (owner !== undefined) {
      throw new Error(
        `assertSettingsKeyPartition: "${exemption.section}.${exemption.key}" is cited in UNCLAIMED_SETTINGS_KEYS but section "${owner}" now claims it — delete the stale cite (SET-SEAMS §2.3).`,
      );
    }
    if (!claimedSections.has(exemption.section)) {
      throw new Error(
        `assertSettingsKeyPartition: UNCLAIMED_SETTINGS_KEYS cites "${exemption.section}.${exemption.key}", but no section claims any key in "${exemption.section}" — the namespace is still pane-owned, so the cite is inert. Delete it (SET-SEAMS §2.3).`,
      );
    }
    if (!(namespaceKeys(defaults, exemption.section)?.includes(exemption.key) ?? false)) {
      throw new Error(
        `assertSettingsKeyPartition: UNCLAIMED_SETTINGS_KEYS cites "${exemption.section}.${exemption.key}", which is not a key of DEFAULT_USER_SETTINGS.${exemption.section} — delete the stale cite (SET-SEAMS §2.3).`,
      );
    }
    cited.add(id);
  }
  return cited;
}

/** The GAP arm — every key of a CLAIMED namespace is owned by a section or cited as editor-less. */
function assertNoGaps(
  claimedSections: ReadonlySet<UserSettingsSection>,
  defaults: UserSettings,
  owners: ReadonlyMap<string, string>,
  cited: ReadonlySet<string>,
): void {
  for (const section of claimedSections) {
    for (const key of namespaceKeys(defaults, section) ?? []) {
      const id = claimKey("user", section, key);
      if (!(owners.has(id) || cited.has(id))) {
        throw new Error(
          `assertSettingsKeyPartition: "${section}.${key}" has no owning section — the namespace is under the partition (another section claims part of it), so this knob has no editor (D107). Claim it in a section's \`owns\`, or cite it in UNCLAIMED_SETTINGS_KEYS with a reason (SET-SEAMS §2.3).`,
        );
      }
    }
  }
}
