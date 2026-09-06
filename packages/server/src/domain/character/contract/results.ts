// domain/character/contract/results — the thin result shapes that aren't a `CharacterDetail`/`void`
// (one home, §7.4). The CRUD reads return `CharacterDetail` (views.ts); the bulk mutators return `void`.
// Only the history + synthetic-identity verbs carry their own small shapes.

import type { CharacterCard } from "@orb/contracts/character";
import type { CharacterId, CharacterSnapshotId } from "@orb/kit/ids";
import type { CharacterListCursor } from "./params.ts";
import type { CharacterSummary, CharacterTagGroupCensus } from "./views.ts";

/** A handle to a character identity row — the return of the injected synthetic-group mint/find ops
 *  (chat consumes it cross-feature; type-only re-exported from the front door). */
export interface CharacterRef {
  readonly characterId: CharacterId;
}

/** One `findByImportedFrom` match — the owner's character carrying a queried `importedFrom` value. The hub
 *  search verb builds a `importedFrom → characterId` map from the batch to stamp its page markers. */
export interface ImportedFromMatch {
  readonly importedFrom: string;
  readonly characterId: CharacterId;
}

/** Returned by the greeting-studio verbs (`rewriteGreeting`/`generateGreeting`, audit §3): the generated
 *  greeting text + the side-LLM spend. The verb NEVER writes — the client previews `text` and appends it to
 *  `characters.greetings` via `character.update` on accept. `costUsd` is null when the provider didn't report it. */
export interface GeneratedGreeting {
  readonly text: string;
  readonly costUsd: number | null;
}

/** Returned by `snapshot`. */
export interface SnapshotRef {
  readonly id: CharacterSnapshotId;
  readonly characterId: CharacterId;
  readonly createdAt: number;
}

/** A browse-history row (the git "commit log" entry); the opaque blob itself is read only on `restore`
 *  and through {@link SnapshotView} (the refinery Versions walk's compare read — schema-renderer §16.2:
 *  the LIST stays trimmed; content is fetched per selected snapshot). */
export interface SnapshotSummary {
  readonly id: CharacterSnapshotId;
  readonly label: string | null;
  readonly createdAt: number;
}

/** One snapshot WITH its card blob — the compare/inspect read (`getSnapshot`). Read-only: the STORED row
 *  is the D28 opaque history entry and is never rewritten, healed or migrated (it describes the card as it
 *  stood). What crosses THIS boundary is the `cardOf` projection of it — the same seam `restore` reads the
 *  blob through — so `content` is an honest `CharacterCard` and the compare view shows what a restore
 *  would actually produce. */
export interface SnapshotView extends SnapshotSummary {
  readonly content: CharacterCard;
}

/** A cursor page of the caller's own character library — sorted per the request's `sort` (default recent),
 *  synthetic buckets excluded (invariant 3). Mirrors `domain/notifications`'s `ListInboxResult`
 *  `{items, nextCursor}` shape. */
export interface ListCharactersResult {
  readonly items: readonly CharacterSummary[];
  /** The sort-discriminated keyset cursor to pass as the next `cursor`, or `null` when a short page came
   *  back (no further row remains in this sort's order). Its `sort` matches the request's. */
  readonly nextCursor: CharacterListCursor | null;
  /** A real server `COUNT` over the SAME scope this page windows (search + chips included), never
   *  `items.length` — the `ChatListPage.totalCount` precedent. The band printed no count at all while the
   *  only number available was "loaded so far"; this is the honest one, so it can print again. */
  readonly totalCount: number;
}

/**
 * THE GROUP-BY-TAG CENSUS (#1696) — every bucket the categorized view can render, counted over the request's
 * lens.
 *
 * `uncategorized` is a FIRST-CLASS member rather than a derivation: it is the biggest bucket on a real
 * library and it cannot be computed from `groups` (a character with two tags is counted in both, so the
 * group counts do not sum to the matched total). It is also precisely the number the prior arm could not
 * source at all, which is the reason that arm refused a census outright.
 */
export interface ListCharacterTagGroupsResult {
  /** One bucket per VISIBLE tag that at least one matching character carries — most-populated first, ties
   *  alphabetical, so the same total order the header list is rendered in has one author (the server). */
  readonly groups: readonly CharacterTagGroupCensus[];
  /** Matching characters carrying NO visible tag — the "Uncategorized" bucket. */
  readonly uncategorized: number;
}

/** The D148 plugin card-state read verdict (`persistence/plugin-card-data.ts`): `found:false` ⇒ no such OWNED
 *  character (foreign or absent — leak-free, the caller maps it to the plugin domain's NOT_FOUND); `found:true`
 *  ⇒ the installer owns it, `data` is the stored blob or `null` when this plugin has written none on that
 *  character. Homed HERE per no-inline-types §7.4. */
export type PluginCardDataRead = { readonly found: false } | { readonly found: true; readonly data: Record<string, unknown> | null };

/** The #1708 pre-#1702 plugin-provenance backfill verdict (`persistence/backfill-plugin-provenance.ts`).
 *  Homed HERE per no-inline-types §7.4. */
export interface BackfillPluginProvenanceResult {
  /** Rows whose `importedFrom` was minted from a recovered plugin identity. */
  readonly backfilled: number;
  /** Candidates left `authored` — no reserved `plugin_<slug>` key, or the named slug names no installed
   *  plugin for that owner (uninstalled since, or the key predates any install this owner still holds). */
  readonly leftAuthored: number;
}
