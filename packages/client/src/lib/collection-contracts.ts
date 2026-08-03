// Tier-4 contract home for the COLLECTION contributor seam (config-rail-spec.md §2 · stickler review
// 2026-08-03-collection-contribution.md §4) — the ELEVENTH contributor family: one object LIBRARY
// (tags · regex scripts · later world-info) contributed to the Configuration workspace by its owning
// feature. It binds NO state-owned vocabulary (kind ids are host-opaque strings, member ids are opaque at
// the seam and re-branded at the owner's edge), so it is tier 4 — the `home-tile-contracts.ts` precedent.
// The `createCollectionSurface` name collision is tier-separated: that is the data-tier PAGINATION factory,
// this is the tier-4 contribution contract (review F-2).
//
// WHO DRAWS WHAT (host-controls vocabulary, C-6): the HOST (`features/config`) owns the section frame, the
// LIST band, every group band + its disclosure + create button + IMPORT trigger + filter input, the welcome,
// the context frame, and the ONE kinded selection. The CONTRIBUTION owns its rows, its member editor, its
// context body, and every query and mutation behind them. The host never learns what a member IS.
//
// LIFECYCLE CHROME (D121-D `band=Import · kebab=Export`, landed here by R2's world-info migration): the
// group band IS a collection's band in this workspace, so `importFile` is a DATA field the host renders
// (below); EXPORT stays per-member and therefore owner-rendered, inside the row's own kebab.
//
// ROOM-TIER BOUNDARY: every collection here is a USER-TIER library. Room-tier overrides (a per-chat preset
// binding, per-chat injections) never ride this seam — they stay on the chat context panel's machinery.
//
// DELIBERATE EXCLUSIONS, each with its why:
//  · no `anchor` field — placement is the DOOR ARRAY (review F-3), which is what makes moving a collection
//    between the rail and the roster one array line. The settings family needs `anchor` because ONE
//    registry serves ten pane hosts; a collection host consumes its own registry whole.
//  · no `owns` / partition pin — D120's partition exists because N sections patch ONE settings blob.
//    Collections write their OWN domain tables through their own verbs, so there is no shared write target
//    and importing the pin would be cargo cult. Do not "complete" the mirror.
//  · no `{dormant}` arm — every candidate collection is BUILT. If a dormant one ever registers, lift
//    `DormantDoorway` verbatim from home-tiles (marker and body are the same field).
//  · no `nav`/`search` field — cross-collection search is deferred (review F-10); per-collection filtering
//    is the host's `filter` input applied by the owner's own rows.

import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";

/** Member count above which a group earns the host's FILTER input and the owner virtualizes its rows.
 *  ONE constant, two readers (the host's group frame, each contribution's row list) — the owner's real
 *  library is ~400 tags, so "the list is a glance" stops being true well before then. */
export const COLLECTION_LARGE_GROUP = 30;

/** What the host hands a collection's LIST half. */
export interface CollectionListView {
  /** Selection arrives KIND-PRE-BOUND: non-null only when the selected member belongs to THIS collection. */
  readonly selectedId: string | null;
  /** The host's mixed-kind `selectFromList`, kind pre-bound (writes the selection AND closes an open LIST
   *  slide-over — the drill-store dual-write, unchanged). */
  readonly onSelect: (memberId: string) => void;
  /** The host's per-group filter box, verbatim (`""` = no filter). The BOX is host chrome (one grammar for
   *  every group, shown by count); applying it is the owner's, because the owner is the only party that
   *  knows what its rows are made of. */
  readonly filter: string;
}

/** What the host hands a collection's CONTENT / CONTEXT halves for one selected member. */
export interface CollectionDetailView {
  /** Opaque at the seam; the owner re-brands through its own id schema (the stamped-id posture — the same
   *  trade every drill store already makes at `P extends string`). */
  readonly memberId: string;
}

/** A collection's CONTEXT arm — an explicit DECISION, never an absence (the `SectionDefinition.context`
 *  `{kind:"none"}` discipline one level down). `none` carries the collection's OWN copy because the host
 *  would otherwise say one sentence for a tag and for a world book, and "nothing selected" would be a lie:
 *  something IS selected, this collection just has nothing to attach. */
export type CollectionContext =
  | { readonly kind: "body"; readonly render: (view: CollectionDetailView) => ReactNode }
  | { readonly kind: "none"; readonly title: string; readonly description: string };

/** A feature-contributed member COLLECTION. A feature raises one; the config host skims it — the host
 *  imports ZERO contributors, so adding a library to Configuration is forever ONE co-located file plus ONE
 *  array member at the door (G8). */
export interface CollectionContribution {
  /** The collection KIND — registry key, React key, and the selection store's kind axis. Host-opaque (an
   *  open id ONE host interprets is not shell vocabulary — §5 rule 5's test). A duplicate THROWS at the door. */
  readonly id: string;
  /** The group band's kicker voice + icon (host-rendered — a contribution never draws its own band). */
  readonly label: string;
  readonly icon: LucideIcon;
  /** Canonical `(order, id)` — the assembleChrome/home-tile ordering precedent. */
  readonly order?: number;
  /** The ONE sentence the welcome's launcher card carries that the group band does not (fork F-12: the
   *  contract owns it, because a host holding three strings breaks the moment a fourth collection registers). */
  readonly blurb: string;
  /** The zero-member group's dashed one-liner ("No tags yet."). Collection-owned for the same reason the
   *  `none` context copy is: a host-generic "nothing here" reads as unbuilt (empty states are load-bearing). */
  readonly emptyText: string;
  /** Live CAPABILITY gate, called UNCONDITIONALLY over the door-frozen list (the `ChromeEntry.useVisible`
   *  contract). `false` ⇒ the whole group renders NOTHING. Never a BUILD fact. */
  readonly useVisible?: () => boolean;
  /** The group count for the band ("TAGS · 412") — a cache-first hook, same call discipline. It also drives
   *  the host's filter affordance at {@link COLLECTION_LARGE_GROUP}. */
  readonly useCount?: () => number | undefined;
  /** The group's rows — OWNER-rendered (its own query, its own row anatomy under the §12.2 row-action
   *  grammar + G6), inside the host's group frame, and mounted ONLY while the group is expanded. */
  readonly list: (view: CollectionListView) => ReactNode;
  /** The create verb as DATA — the host renders it in its own chrome grammar (the `ModalDefinition.trigger`
   *  precedent: self-declare, host places), at the group band AND in the group's empty slot. `label` is the
   *  affordance's accessible name ("New tag").
   *
   *  `useRun` is a HOOK returning the runner, not a bare `run`: a definition is a module-level value, so a
   *  plain function could never reach the owner's mutation — every real create verb is a mutation plus a
   *  selection write. The host calls it unconditionally, once, per rendered affordance. REQUIRED (not
   *  optional) so the call is never a conditional hook: a library you cannot add to is not a library. */
  readonly create: { readonly label: string; readonly useRun: () => () => void };
  /** The optional IMPORT door, declared as DATA exactly like {@link create} — the host draws a ghost
   *  `Upload` trigger in the group band beside the `+`, and the FileTrigger/accept plumbing stays one
   *  grammar for every collection that has one. This is D121-D's `band=Import · kebab=Export` anatomy
   *  landing on the group band: in this workspace the group band IS the collection's band, so a
   *  contribution rendering its own import button inside the ROW area would be the second chrome grammar
   *  C-4 exists to forbid. Export stays the row's own kebab arm (owner-rendered, per-member).
   *
   *  OPTIONAL, unlike `create`: a library you cannot ADD to is not a library, but a library with no
   *  portable single-entity file genuinely has nothing to import (regex scripts travel inside the card
   *  they belong to — `lifecycle-portability.ts`'s `{ ruled }` cells are the register of which is which).
   *  `label` is the trigger's accessible name AND its tooltip; `accept` is the file-picker filter; `useRun`
   *  is a HOOK returning the runner for the same reason `create.useRun` is. */
  readonly importFile?: { readonly label: string; readonly accept: string; readonly useRun: () => (file: File) => void };
  /** CONTENT for a selected member of this kind — the full editor, owner-rendered, mounted, no popups. */
  readonly detail: (view: CollectionDetailView) => ReactNode;
  /** CONTEXT for a selected member of this kind (see {@link CollectionContext}). */
  readonly context: CollectionContext;
}
