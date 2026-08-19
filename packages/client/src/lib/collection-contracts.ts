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
// BULK MODE follows the same split (REGX2): the MODE TOGGLE is band chrome and therefore a DATA field
// (`bulkSelect`, below), while the selection BAR and the checkbox rows are the contribution's, because they
// speak that library's own verbs. Host draws the door, owner decides what walks through it.
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

/** The windowed-arm box's height cap, spelled ONCE for every collection (side-eye 2026-08-03 P3 flagged it
 *  re-spelled in all three row files). It is a CAP, not a height: three collapsible bands share one scroll
 *  column, so an uncapped (or pane-filling) first library would push every sibling band below the fold —
 *  the exact failure collapsed-by-default groups exist to prevent. */
export const COLLECTION_WINDOW_MAX_HEIGHT = "max-h-96";

/** How many PREVIEW entries a contribution hands up, and therefore how many the welcome's hero draws —
 *  ONE constant, two readers (the owner slices its ranked list to it; the host draws what it is given and
 *  derives the "+N more" remainder from {@link CollectionContribution.useCount}), the
 *  {@link COLLECTION_LARGE_GROUP} discipline. Twelve is two comfortable chip rows at the docked pane's
 *  real width and three at a narrow one — past that the wall stops being a glance and starts being the
 *  roster, which is the line the preview must not cross (it is a top-N glance plus a door, never a second
 *  sortable list). */
export const COLLECTION_PREVIEW_LIMIT = 12;

/** ONE entry in a collection's welcome PREVIEW: a member's own name and the ONE datum that earns it a place
 *  in the glance. It homes HERE rather than in the owning feature because the HOST draws it blind for every
 *  contribution that has one — the same reason `blurb` and `emptyText` are contract fields and not host
 *  string tables.
 *
 *  `detail` IS A STRING, NOT A NUMBER (widened 2026-08-19, when regex and world-info grew previews of their
 *  own). A number can only ever mean "how much", which is the tag library's ranking and nobody else's: the
 *  regex library ranks by RECENCY ("4m ago") and the world-info library by ATTACHMENT ("42 entries ·
 *  attached ×3"). Forcing those through a numeric field would have meant the host inventing a unit for each
 *  — the insider-knowledge naming §3 forbids — so the owner formats its own datum in its own vocabulary and
 *  the host renders it at the `datum` voice. The owner is also the party that already has that spelling
 *  (`bookScent`, `formatRelative`); a second one here would be the drift those single homes exist to
 *  prevent. */
export interface CollectionPreviewEntry {
  /** The member's OWN id — the wall's React key, and the reason the wall has one (side-eye 2026-08-19 P1-1).
   *  The host keyed its chips on `label`, and a name is not an identity: the owner's corpus carries two books
   *  called "Shitty stories", so every visit logged React's duplicate-key error and left the wall's membership
   *  to reconciliation — while `+N more` kept deriving the remainder from `shown.length` as though nothing
   *  could have been dropped. Opaque at the seam, exactly like `CollectionDetailView.memberId`. */
  readonly id: string;
  /** The member's own name, as the library spells it. */
  readonly label: string;
  /** The ONE datum that ranks this member, in the library's own units and already formatted. */
  readonly detail: string;
}

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
  | {
      readonly kind: "body";
      /** The CONTEXT BAND's title while a member of this collection is open — REQUIRED, so a new collection
       *  cannot ship voiceless. It names what the pane ANSWERS, in this collection's own words ("Where it
       *  runs"), never the word "Details": the mock's band said "WHERE IT RUNS", and the generic default
       *  named nothing while two sibling arms below it spoke two different grammars (side-eye 2026-08-03
       *  P3). Same discipline as `ContextEmptyArm`'s no-default rule, one tier down. */
      readonly title: string;
      readonly render: (view: CollectionDetailView) => ReactNode;
    }
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
  /** The library's own CONTENTS as a ranked top-{@link COLLECTION_PREVIEW_LIMIT} glance, for the welcome's
   *  HERO (program #102, the owner-picked Hearth variant). It is the one thing NEITHER the roster band nor
   *  the `blurb` carries: the band says how MANY, the blurb says what the library is FOR, and this says
   *  what is actually IN it.
   *
   *  THAT IS WHY IT EXISTS, AND WHY IT DOES NOT RE-OPEN THE 2026-08-08 TRIM RULING. A populated launcher
   *  sheds its count + create because the band already carries them; the hero has to say something the
   *  band does not, or promoting it is chrome. The preview is that something — and it must stay a top-N
   *  glance plus a door. The moment it grows into a second full sortable list it IS the roster, which is
   *  the one-home line the trim ruling drew (`config-welcome.tsx`'s `BuiltLibrary` header states it).
   *
   *  DECLARED AS DATA + A HOOK, the `create`/`importFile`/`bulkSelect` grammar exactly, because the RANKING
   *  IS PART OF THE CLAIM (side-eye 2026-08-19 P1-2). The host used to hardcode "Most used" over whatever a
   *  contribution handed up, which was true of the one library that had a preview and would have been a lie
   *  the moment a second ranked by anything else — and both new adopters do: regex ranks by RECENCY,
   *  world-info by ATTACHMENT. `label` is the wall's kicker and names the rank in the library's own words,
   *  so a contribution cannot ship a glance whose ordering is unstated.
   *
   *  OPTIONAL, unlike `blurb`: a library with nothing rankable has no honest glance to offer, so it simply
   *  declines and its hero draws label + blurb + the door alone. `undefined` from `useEntries` takes the
   *  SAME arm as a declined field — the read has not landed, and a hero that flashed an empty chip wall
   *  would be worse than one that never drew it.
   *
   *  `useEntries` MUST be exactly ONE cache-first `useQuery` over the SAME key the collection's other hooks
   *  read, like {@link useCount}: this is a second reader of a list the roster already has, never a second
   *  request. All three adopters satisfy that today — the tag/regex/world-info list reads are the ones the
   *  roster's own rows already loaded. */
  readonly preview?: { readonly label: string; readonly useEntries: () => readonly CollectionPreviewEntry[] | undefined };
  /** The OPEN member's own name, for the mobile pushed frame's topbar title (the config section's
   *  `useSelectionTitle` — side-eye P2: a pushed detail must name the MEMBER, not the section). A hook over
   *  the member id, same call discipline as {@link useCount}: cache-first, non-suspending, `undefined`
   *  while the read has not landed. Optional — a collection that omits it falls back to its own singular
   *  `label`, which is honest ("Tag") rather than blank.
   *
   *  MUST be exactly ONE cache-first `useQuery` (like {@link useCount}): the host calls the OPEN member's
   *  kind only, so a kind switch swaps WHICH implementation runs. Identical hook shapes make that a change
   *  of query key rather than a change of hook set — the reason this can resolve without a keyed remount. */
  readonly useMemberTitle?: (memberId: string) => string | undefined;
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
   *  OPTIONAL, unlike `create`: a library you cannot ADD to is not a library, but a library with no portable
   *  single-entity file genuinely has nothing to import — `lifecycle-portability.ts`'s `LIFECYCLE_DOORS`
   *  table is the register of which family is which, and its `{ ruled }` cells carry the reason. (It used to
   *  say "regex scripts travel inside the card they belong to" as the example; that exemption ENDED with the
   *  owner's REGX2 ruling, and regex now declares a real door pair.)
   *  `label` is the trigger's accessible name AND its tooltip; `accept` is the file-picker filter; `useRun`
   *  is a HOOK returning the runner for the same reason `create.useRun` is. */
  readonly importFile?: { readonly label: string; readonly accept: string; readonly useRun: () => (file: File) => void };
  /** The optional BULK-SELECT mode, declared as DATA exactly like {@link create} and {@link importFile} — the
   *  host draws a pressed-state ghost toggle in the group band and the CONTRIBUTION owns both the mode state
   *  and everything the mode changes (checkbox rows, the `SelectionBar`, the batch verbs behind it).
   *
   *  WHY THE TOGGLE IS THE HOST'S AND THE BAR IS NOT: the group band IS this collection's chrome (C-4 — a
   *  contribution drawing its own band-class control inside the ROW area is the second chrome grammar this
   *  seam exists to forbid), so mode ENTRY belongs to the host, in one grammar, in one place, for every
   *  collection. The selection bar is not band chrome: it is a per-selection surface that appears under the
   *  rows and speaks the owner's own verbs (`character-bulk-bar` is the precedent), so it stays inside
   *  `list`. The host never learns what the selection MEANS.
   *
   *  `useMode` is a HOOK for the same reason the other two runners are — a definition is a module-level
   *  value, so the mode state has to be reachable through a hook the host calls unconditionally, once.
   *  `active` drives `aria-pressed`; `label` is the trigger's accessible name AND its tooltip.
   *
   *  FOR THE NEXT ADOPTER (tag, world-info): nothing here is regex-specific. Declare the field, own a mode
   *  flag, and render your own bar + checkbox rows inside `list` — the band half is already built. */
  readonly bulkSelect?: { readonly label: string; readonly useMode: () => { readonly active: boolean; readonly toggle: () => void } };
  /** CONTENT for a selected member of this kind — the full editor, owner-rendered, mounted, no popups. */
  readonly detail: (view: CollectionDetailView) => ReactNode;
  /** CONTEXT for a selected member of this kind (see {@link CollectionContext}). */
  readonly context: CollectionContext;
}
