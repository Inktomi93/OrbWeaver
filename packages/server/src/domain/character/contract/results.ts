import type { CharacterId } from "@orb/kit/ids";

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

/** One character's per-item outcome inside `bulkAddCardTag`/`bulkRemoveCardTag` (#1694, internal to the
 *  domain — never crosses the wire; the wire shape is `@orb/contracts/character`'s `CharacterBulkTagResult`,
 *  which `substrate/bulk-tag-result.ts` folds this into). `applied` covers the silent no-op too
 *  (unowned/missing target, or the tag was already in the target state); `failed` carries the caught
 *  rejection reason UNCLASSIFIED — the substrate helper is what maps it onto the wire's closed union. */
export type BulkTagOutcome = { readonly characterId: CharacterId; readonly applied: boolean } | { readonly characterId: CharacterId; readonly failed: unknown };

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

export type {
  GeneratedGreeting,
  ListCharactersResult,
  ListCharacterTagGroupsResult,
  SnapshotRef,
  SnapshotSummary,
  SnapshotView,
} from "@orb/contracts/character";
