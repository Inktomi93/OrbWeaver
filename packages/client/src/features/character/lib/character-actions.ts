// THE CHARACTER ACTION REGISTRY — one artifact, ONE action vocabulary, three derived surfaces (#838).
//
// WHY THIS FILE EXISTS. The library row's `⋯`, the CONTEXT pane's `Character actions` kebab and the bulk
// bar each hand-spelled their own item list, and the three shared exactly ONE member (`Delete`): Export
// card and Archive existed only on the row, Open in Refinery / Convert to persona / Set as welcome greeter
// only in the context kebab, Tag only in bulk. With a character OPEN there was therefore no path to export
// her card, and the reviewer who drove the surface concluded the app could not export at all (side-eye
// 2026-08-30 rail-characters-delta P1, Nielsen #4 + §13 IA single-homing). Labels, membership and render
// order are DATA here; each surface renders its scope's slice and owns only the handler + its confirm copy.
//
// THE TWO AXES ARE TWO TUPLES, and the id union DERIVES FROM THE SCOPE MAP rather than sitting beside it —
// so a verb that belongs to no scope is not a dead affordance, it is un-spellable. `CHARACTER_ACTION_SCOPES`
// is the scope axis; `CHARACTER_ACTION_SCOPE_IDS` is a total `Record<CharacterActionScope, …>`, so a new
// SCOPE is a `tsc` error until it declares its members, and a new VERB is a `tsc` error until
// `CHARACTER_ACTIONS` carries its full definition. Each surface types its handler map as
// `Record<(typeof CHARACTER_ACTION_SCOPE_IDS)["<its scope>"][number], …>`, which is exhaustive over exactly
// the verbs it renders — a verb added to a scope fails that surface's compile until it is wired.
//
// TYPE HOME: the id/scope aliases are FILE-LOCAL by house rule (`no-inline-types` — an exported type alias
// outside a type home is RED; `character-card-facets.ts` sets this exact precedent). Consumers read the id
// through `CharacterActionDef["id"]` or derive their own local alias from the exported tuples.
//
// GLYPHS LIVE HERE, LABELS LIVE HERE, CONFIRM COPY DOES NOT. A destructive verb's confirm names the thing it
// is about to destroy ("Delete \"Sabine\"?" vs "Delete 3 characters?"), which only the calling surface knows.

import type { LucideIcon } from "@orb/ui/icons";
import { Archive, Copy, Download, Drama, FlaskConical, Handshake, Tag, Trash2 } from "@orb/ui/icons";

/**
 * The three surfaces one character's verbs are offered on.
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export const CHARACTER_ACTION_SCOPES = ["row", "open", "bulk"] as const;

/** File-local — consumers derive it from the tuple or read it off a signature. */
type CharacterActionScope = (typeof CHARACTER_ACTION_SCOPES)[number];

/**
 * WHICH VERBS EACH SURFACE OFFERS, IN ITS RENDER ORDER — the one membership home, and the reason the three
 * menus can no longer drift apart.
 *
 * `row` and `bulk` are byte-identical to what those surfaces already shipped. `open` is the SUPERSET the
 * P1 asked for: it gains `archive` (which had no affordance anywhere on an open character — the hero band's
 * header claimed one, and the band renders none) and `exportCard`.
 *
 * `tag` is DELIBERATELY bulk-only, against the review's fix text and with the orchestrator's ruling
 * (2026-08-30). An open character already has a first-class tagging affordance — `character-tags-row.tsx`,
 * the §6.2 chip strip under the hero, whose `Add tag` opens the same `TagPickerDialog` and fires the same
 * `bulkAddCardTag` verb. A `Tag` item in the kebab would mint the exact second-home-for-one-verb this
 * registry exists to kill.
 *
 * DESTRUCTIVE LAST is a property of these tuples, pinned by `character-actions.test.ts` rather than by a
 * sort — the order a menu renders in should be readable here, not computed.
 */
export const CHARACTER_ACTION_SCOPE_IDS = {
  row: ["archive", "duplicate", "exportCard", "delete"],
  open: ["openInRefinery", "archive", "duplicate", "exportCard", "convertToPersona", "setWelcomeGreeter", "delete"],
  bulk: ["tag", "archive", "delete"],
} as const satisfies Readonly<Record<CharacterActionScope, readonly string[]>>;

/** File-local — every verb that ANY scope offers. A verb outside this map cannot be named. */
type CharacterActionId = (typeof CHARACTER_ACTION_SCOPE_IDS)[CharacterActionScope][number];

/** File-local — the verbs ONE scope offers. This is what keeps a surface's handler map exhaustive over
 *  exactly its own slice instead of over the whole vocabulary. */
type ScopeActionId<S extends CharacterActionScope> = (typeof CHARACTER_ACTION_SCOPE_IDS)[S][number];

/** The owner-gated card download route (`GET /api/export/character/:characterId`). ONE mint, rendered by
 *  both kebabs that offer `exportCard` — the list row's and the CONTEXT pane's (#838). A single-entity door
 *  is a THIN ARM over the bundle descriptor it shares, never a second serialization path (D121 clause D). */
export const EXPORT_CHARACTER_PATH = "/api/export/character/";

/** One container the card-export route serves. Both are items of ONE submenu (the chat kebab's grammar) —
 *  a thin arm over the same serialization path, never a second one (D121 clause D). File-local: consumers
 *  reach it through `CharacterActionDef["formats"]`, never by name. */
interface CharacterExportFormat {
  readonly label: string;
  /** Appended to `/api/export/character/:characterId`. Empty string = the route's default PNG arm. */
  readonly query: string;
}

/** One verb in the character vocabulary. `Id` is narrowed per SCOPE by `characterActionsForScope`, which is
 *  what lets a surface's handler map cover exactly the verbs it renders. */
export interface CharacterActionDef<Id extends CharacterActionId = CharacterActionId> {
  readonly id: Id;
  /** The item's accessible name — the ONE spelling, on every surface that offers it. */
  readonly label: string;
  /** For a STATE TOGGLE, the label the verb wears when the character is already in the target state
   *  (Archive ⇄ Unarchive). `null` for a verb with one name. Bulk never toggles: it always archives. */
  readonly toggledLabel: string | null;
  /** Renders through the destructive slot (last, its own confirm). */
  readonly destructive: boolean;
  /** The item glyph. */
  readonly glyph: LucideIcon;
  /** Non-empty ⇒ the verb renders as a submenu of containers instead of a single item. */
  readonly formats: readonly CharacterExportFormat[];
}

/** The vocabulary. A `tsc` error until every scoped verb has a full definition — and the mapped `Id` pins
 *  each entry's own `id` to its key, so a copy-pasted row that kept the wrong id cannot compile. */
export const CHARACTER_ACTIONS: { readonly [Id in CharacterActionId]: CharacterActionDef<Id> } = {
  openInRefinery: { id: "openInRefinery", label: "Open in Refinery", toggledLabel: null, destructive: false, glyph: FlaskConical, formats: [] },
  tag: { id: "tag", label: "Tag", toggledLabel: null, destructive: false, glyph: Tag, formats: [] },
  archive: { id: "archive", label: "Archive", toggledLabel: "Unarchive", destructive: false, glyph: Archive, formats: [] },
  duplicate: { id: "duplicate", label: "Duplicate", toggledLabel: null, destructive: false, glyph: Copy, formats: [] },
  exportCard: {
    id: "exportCard",
    label: "Export card",
    toggledLabel: null,
    destructive: false,
    glyph: Download,
    formats: [
      // The route's DEFAULT arm — no `?format`, the ST-parity card with the avatar welded in.
      { label: "With avatar (.png)", query: "" },
      // The unwrapped V3 TavernCard the import door already accepts — the round trip is closed.
      { label: "Data only (.json)", query: "?format=json" },
    ],
  },
  convertToPersona: { id: "convertToPersona", label: "Convert to persona", toggledLabel: null, destructive: false, glyph: Drama, formats: [] },
  setWelcomeGreeter: { id: "setWelcomeGreeter", label: "Set as welcome greeter", toggledLabel: null, destructive: false, glyph: Handshake, formats: [] },
  delete: { id: "delete", label: "Delete", toggledLabel: null, destructive: true, glyph: Trash2, formats: [] },
};

/** The verbs a surface offers, in its declared render order — narrowed to that scope's own ids. */
export function characterActionsForScope<S extends CharacterActionScope>(scope: S): readonly CharacterActionDef<ScopeActionId<S>>[] {
  const ids: readonly ScopeActionId<S>[] = CHARACTER_ACTION_SCOPE_IDS[scope];
  return ids.map((id) => CHARACTER_ACTIONS[id]);
}

/** The verbs a surface renders as ITEMS — everything but the destructive one, which every menu host places
 *  itself (last, behind its own confirm). */
export function characterActionItemsForScope<S extends CharacterActionScope>(scope: S): readonly CharacterActionDef<ScopeActionId<S>>[] {
  return characterActionsForScope(scope).filter((action) => !action.destructive);
}

/** The verb's label for a character in a given state — the toggle's second face, or its one name. */
export function characterActionLabel(action: CharacterActionDef, state: { readonly archived: boolean }): string {
  return state.archived && action.toggledLabel !== null ? action.toggledLabel : action.label;
}
