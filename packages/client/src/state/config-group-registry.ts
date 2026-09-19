// The config-group contract (client-architecture-lockdown.md §8 · config-revamp-design.md §3.1) — the
// section/modal registry move applied to the unified Configuration workspace: ONE co-located definition
// per group, assembled at the door (`compose/authed-app.tsx`) into a registry total over
// `CONFIG_GROUP_IDS`, and handed to `makeConfigSection(groups)` by factory (the home-tiles precedent —
// the host is the registry's only reader, so there is no context pair). Homed here (not
// features/config) because it binds `CONFIG_GROUP_IDS` (state-owned, §5 rule 5) to the render shape.
//
// It was the settings-pane registry (a `SettingsPaneDefinition` total over the nine settings categories).
// The unification (#866 S1) added the `collection` body arm — the `CollectionContribution` seam's whole
// machinery, verbatim, with its identity (`id · label · icon · order · blurb`) lifted onto the group base
// so a library has ONE identity home — and the `shelf` axis the LIST paints. The section-contribution
// seam that used to share this file lives in `config-section-registry.ts`; the key partition in
// `config-section-partition.ts` (both split out for the component-size cap, not for architecture).
//
// EVERY NON-COLLECTION GROUP IS A SKIMMER BY TYPE (config-revamp-design.md §6.8, owner ruling 2026-08-30):
// the `surface` body arm and the group's own `subcategories` map are GONE. A group's parts are
// `ConfigSectionContribution`s at its anchor and nothing else — the host derives the LIST rows, the search
// index, the scroll-spy targets and the render from ONE registry, so a LIST row can never point at an
// anchor nothing renders and a body can never paint a section the LIST cannot reach. `tsc` is the wall
// (an excess `subcategories:`/`kind: "surface"` on a group literal is a compile error); the
// `config-group-completeness` gate covers the one hole tsc cannot see — a component stamping an anchor no
// contribution renders.
//
// `SettingsViewerView` keeps its name: it is the projection of who may SEE settings, consumed by a group's
// and a section's `when`; `#data`'s `useSettingsViewerView` is its ONE derivation home (§5 rule 6).

import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { CollectionContribution, Registry } from "#lib";
import type { ConfigGroupId, ConfigShelf } from "./config-group-ids.ts";

/** A reference to another KNOB — the teacher's "Related" link vocabulary (VS Code's `#other.setting#`,
 *  config-revamp-design.md §3.5). The host resolves it into an `openConfigTo` door; a ref that resolves to
 *  nothing is RED at the compose door (`assertTeachHonesty` — owner rider R-TEACH).
 *
 *  `setting` is REQUIRED, which is the wall (#1101): a ref without one resolves to a door labelled with its
 *  SECTION's name — a LIST row restated inside the context pane, and the context pane is never navigation
 *  (`UI-Architecture-and-Layout.md` §4.2). A cross-section jump belongs in the LIST, which already has it. */
export interface ConfigSettingRef {
  readonly group: ConfigGroupId;
  readonly sub: string;
  readonly setting: string;
}

/** What the context pane TEACHES about a setting (or a section) — contribution DATA the host renders
 *  (config-revamp-design.md §3.5/§7.2, #866 S3). The row itself stays label + control (the teacher law);
 *  the prose lives here. */
export interface SettingTeach {
  /** The definition — one short paragraph, plain language. Never empty (R-TEACH honesty arm). */
  readonly summary: string;
  /** What changes when this moves ("every new chat's first turn", "the admin rail only"). Never empty. */
  readonly affects: readonly string[];
  /** Where a NARROWER scope wins — each a DOOR the reader can walk, never prose. */
  readonly overriddenBy?: readonly { readonly label: string; readonly open: () => void }[];
  /** Other knobs that interact — rendered as links that land + flash (`openConfigTo`). */
  readonly related?: readonly ConfigSettingRef[];
  /** "Learn more", IN-APP (trusted markdown, a diagram, a live example) — never a link-out. The Learn
   *  tab exists only while this does (APPLICABILITY, never hiding). */
  readonly more?: () => ReactNode;
}

/** A leaf's teaching DECLARATION — REQUIRED on every leaf (owner rider R-TEACH, 2026-08-30): either the
 *  teach itself or an EXPLICIT opt-out with a stated reason (the planned-arm honesty precedent). tsc is
 *  the wall — a new leaf without a declaration is a compile error, never a hollow pane. */
export type SettingTeachDecl = SettingTeach | { readonly none: string };

export function isTeachNone(decl: SettingTeachDecl): decl is { readonly none: string } {
  return "none" in decl;
}

/** One labelled option of an enum-valued leaf — structurally the row a `SelectOption`/picker cell already
 *  is, DECLARED here so `#state` owns no UI type and the teacher never learns what a Select is.
 *
 *  IT IS A REFERENCE, NEVER A SECOND TABLE (#1099 F15): the leaf points at the SAME items array its visible
 *  control renders, so the pane and the control cannot drift. A hand-written twin map here would be exactly
 *  the drift the teacher law exists to prevent — the defect was the pane printing the WIRE value ("md.")
 *  under a control reading "Medium", and a duplicate map fixes it once and rots on the next option.
 *
 *  NOT EXPORTED, deliberately: a leaf author never names it (they hand over their control's items array),
 *  and the teacher names it as `ConfigSettingLeaf["options"]` — the indexed access says "whatever a leaf
 *  declares", which is the truer statement anyway and keeps `state/index.ts` at its 450-line cap. */
interface ConfigSettingOption {
  readonly value: string;
  readonly label: string;
}

/** One searchable/jumpable setting inside a subcategory — the leaf of the config search index. */
export interface ConfigSettingLeaf {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
  /** Hidden from search unless the reader asks with `@advanced` (§3.3 — the D107 progressive-disclosure
   *  axis). Absent = an ordinary row. */
  readonly advanced?: boolean;
  /** The teaching, LOCKED to the leaf so they cannot drift apart (R-TEACH). */
  readonly teach: SettingTeachDecl;
  /** The settings KEY this leaf's control writes, inside the owning contribution's USER-tier `owns` claim
   *  (§3.4 row chrome, #866): leaf ids are nav/search ids (`chat-width`), claim keys are wire keys
   *  (`chatWidthPct`) — nothing mechanical binds them, so the binding is DECLARED here and the door's
   *  `assertSettingsKeyPartition` proves every declared key is a member of its section's claim. Absent =
   *  no per-leaf value chrome (a composite row, a CRUD list, an app-tier section) — the modified stripe,
   *  the row menu's Reset, and About's default-vs-current all key on this. */
  readonly key?: string;
  /** The leaf's OPTION TABLE, when its control is a chooser — the same array the control renders. The
   *  teacher resolves `key`'s stored value through it, so the roster and About print the control's own
   *  display words. Absent = the value is not an enum (a boolean, a number, free text) and the honest
   *  fallbacks apply (On/Off · None · the number). An option-LIST value (an array key, `blurSurfaces`)
   *  maps every member through the same table. */
  readonly options?: readonly ConfigSettingOption[];
}

/** A subcategory = one anchored section inside a group; each stamps a stable anchor node the spy reads and
 *  the search jumps to. */
export interface ConfigSubcategory {
  readonly id: string;
  /** The section's real name — what its `<Section>` HEADING renders, and what search matches first. */
  readonly label: string;
  /**
   * A shorter name for the LIST ROW only, when `label` does not fit the LIST column. The heading keeps the
   * full `label` — a sidebar's width is never a reason to rename a section (side-eye 2026-08-01). Search
   * matches BOTH strings, so the abbreviation can never hide a section from the reader who typed its full
   * name. Absent = the row renders `label`, and it MUST fit (the list CT sweeps every group and REDs on
   * any clipped row).
   */
  readonly navLabel?: string;
  readonly keywords?: readonly string[];
  readonly settings?: readonly ConfigSettingLeaf[];
  /** The SECTION-level lesson (§3.5) — what the pane teaches when the section (not one of its leaves) has
   *  the reader's attention, and the fallback for a `{none}` leaf. Optional: R-TEACH binds LEAVES; a
   *  list-shaped section (a roster, a jobs table) states its lesson here and declares no leaves. */
  readonly teach?: SettingTeach;
}

/** The state-owned viewer PROJECTION a group's / a section's `when` consumes — plain derived values only,
 *  no `data/` import (§5 rule 6). Fields grow as gates need them: `isAdmin` gates the admin group + the
 *  distribute section; `isOwner` gates the host-Claude probe section (it used to render `null` for a
 *  non-owner under a LIST row that scrolled to nothing — the §6.8 conversion made the gate a `when`). */
export interface SettingsViewerView {
  readonly isAdmin: boolean;
  readonly isOwner: boolean;
}

/** One dynamic search row a group contributes at runtime (a collection's members, the persona names —
 *  config-revamp-design.md §3.3). `subId` names the anchor a hit lands on for a non-member row; a
 *  `memberId` row opens that member instead. */
export interface ConfigSearchRow {
  readonly id: string;
  readonly label: string;
  readonly keywords?: readonly string[];
  readonly subId?: string;
  readonly memberId?: string;
}

/** What a group RENDERS (config-revamp-design.md §3.1 as amended by §6.8) — an honest three-arm union:
 *  - `sections` — a pure SKIMMER: the group has no body of its own; the host renders the sections
 *    contributed at its anchor, and its LIST rows DERIVE from them (D120). Every settings-shaped group
 *    (nine of them) is this arm.
 *  - `collection` — the library arm: the `CollectionContribution` seam verbatim (rows · member editor ·
 *    context arm · create/import/bulk as DATA the host draws). The group's LIST rows are the owner's own.
 *  - `{ placeholder: true }` — the DECLARED-PLANNED arm; a group with no body can no longer silently
 *    placeholder.
 *  The `surface` arm (a feature-owned opaque render hosting its own hand-stamped anchors) was retired by
 *  §6.8: it was the old nav map beside the new one, in five groups.
 *
 *  THE PLACEHOLDER ARM HAS ZERO PRODUCTION OCCUPANTS TODAY (#1713, re-derived 2026-09-05 —
 *  config-revamp-design.md §8.2 ruling 3): `automation` graduated to a real surface at `cb8026bfc` and no group literal on
 *  the tree declares `{ placeholder: true }`. Kept as live declared intent, not speculative dead code — its
 *  ONLY subject is the synthetic `placeholderConfigGroups` registry (`tests/support/browser/ct-config-groups.ts`)
 *  `config-group-placeholder.ct.tsx` mounts, standing in for the next unbuilt group. Retire the arm only if
 *  the design doc's §8 ruling 2 (the LIST-owns-feature-status landing) itself retires — it has not. */
export type ConfigGroupBody =
  | { readonly kind: "sections" }
  | { readonly kind: "collection"; readonly collection: CollectionContribution }
  | { readonly placeholder: true };

/** Everything a group declares that is independent of its body arm. */
export interface ConfigGroupBase {
  readonly id: ConfigGroupId;
  /** The LIST shelf the group paints under — the `SETTINGS_GROUPS` successor. */
  readonly shelf: ConfigShelf;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Distinct teaching copy for the group — the welcome's launcher blurb for a collection, the placeholder
   *  body's copy for a planned group, and a search keyword for every group. */
  readonly description: string;
  /** Canonical `(shelf, order, id)` — the assembleChrome/home-tile ordering precedent. */
  readonly order?: number;
  /** Declarative viewer gating — consumes the PROJECTION, never `data/`'s `Viewer` (the §6b "def declares,
   *  consumer supplies" inversion). ONE predicate, three consumers: LIST, search and render. Absent =
   *  always visible. */
  readonly when?: (viewer: SettingsViewerView) => boolean;
  /** DYNAMIC search rows (config-revamp-design.md §3.3): a HOOK the host renders in its own fiber per
   *  group — a collection's members over the same cache-first list query its roster already loaded, the
   *  persona names. Called unconditionally over the door-frozen registry (the `useCount` discipline). */
  readonly useSearchRows?: () => readonly ConfigSearchRow[];
  /** The group's ADVANCED FOLD (#297's explicit custom arm — config-revamp-design.md §7.3): sections
   *  contributed with `advanced: true` render inside ONE collapsed-by-default disclosure the host draws
   *  with this label. `caption` is a RENDER (a component may read its own data — Appearance's names the
   *  current look), never a hook the host would have to call conditionally. Declaring a fold with zero
   *  advanced sections renders nothing; advanced sections without a fold render in flow AT THE END (the
   *  canonical order is `ConfigSectionPartition`'s, not each consumer's own sort).
   *
   *  THE LIST IS NOT UNTOUCHED (#978 F4, correcting this clause): the map paints the fold's sections last,
   *  inside a nested group wearing this `label`, and search flattens the same canonical order — because a
   *  LIST that advertised the raw declaration order over a pane that re-sorted it was telling the reader
   *  the wrong place to look. A landing whose target names a folded section still opens it first. */
  readonly advancedFold?: { readonly label: string; readonly caption?: () => ReactNode };
}

/** A config group as ONE definition. `body` is the §3.1 union. */
export type ConfigGroupDefinition = ConfigGroupBase & { readonly body: ConfigGroupBody };

/** The closed, tsc-total registry the door assembles and `makeConfigSection` consumes. */
export type ConfigGroupRegistry = Registry<ConfigGroupId, ConfigGroupDefinition>;

/** The DOM id of a subcategory's anchor node — derived from the registry keys, never a scattered string
 *  literal. Shared by every group surface (owner features + the config host's scroll-spy and search). */
export function configAnchorId(groupId: ConfigGroupId, subId: string): string {
  return `config-anchor-${groupId}-${subId}`;
}

/** A group whose body is the `collection` arm — the narrowing the host's welcome, mobile teaching, context
 *  routing and selection title all read, spelled ONCE. */
export type CollectionGroupDefinition = ConfigGroupBase & { readonly body: Extract<ConfigGroupBody, { readonly kind: "collection" }> };

export function isCollectionGroup(def: ConfigGroupDefinition): def is CollectionGroupDefinition {
  return "kind" in def.body && def.body.kind === "collection";
}

/** A group whose surface has NOT been built — the DECLARED-PLANNED arm. ONE home for the narrowing, because
 *  as of #925 it has two readers that must agree: CONTENT renders the coming-soon body, and the LIST paints
 *  the row that opens it as a quiet, marked, still-clickable door. Feature READINESS is a fact about this
 *  arm and nothing else — a library the user has simply not filled is a `collection` group with a count of
 *  zero, and conflating the two is the defect #1043 was filed on. */
export function isPlaceholderGroup(def: ConfigGroupDefinition): boolean {
  return "placeholder" in def.body;
}

/** Does this group render a body the CONTENT surface's `GroupBody` arm can draw — the section registry's
 *  sections or the honest placeholder's coming-soon copy?
 *
 * ═══ THIS WAS `isPushingGroup`, AND SPLITTING IT IS THE POINT (#1725, stickler F15) ═══════════════════
 * One predicate answered two questions that used to have the same answer: "does CONTENT have a body to
 * draw for this group" and "does activating it take over the screen on a phone". A collection answered
 * `false` to both — its CONTENT was a MEMBER, so a band tap left the phone on the LIST.
 *
 * The owner's 2026-09-05 ruling made a collection's CONTENT the LIBRARY ("tag list under in list is kinda a
 * no go that needs to move into content"), so the second answer flipped and the first did not: a band tap
 * DOES take over the phone now, and `GroupBody` still has nothing to draw for a collection (its landing is
 * a different arm entirely). A flip would have routed every collection into `GroupBody`, which returns
 * `null` for one — a blank CONTENT pane behind a door that says it opened. So the predicate SPLITS: this
 * one keeps the CONTENT router's question and the name that states it, and the phone's question is now
 * simply "is a group active at all" (`config-section.tsx`'s selection seam), because after the ruling every
 * arm takes over the screen and a predicate that is true for all three arms is not a predicate. */
export function rendersOwnBody(def: ConfigGroupDefinition): boolean {
  return !isCollectionGroup(def);
}
