import type { CharacterId } from "@orb/kit/ids";

export type { PluginCardDataHit, PluginCardDataRead } from "@orb/contracts/character";

/** One character's per-item outcome inside `bulkAddCardTag`/`bulkRemoveCardTag` (#1694, internal to the
 *  domain — never crosses the wire; the wire shape is `@orb/contracts/character`'s `CharacterBulkTagResult`,
 *  which `substrate/bulk-tag-result.ts` folds this into). `applied` covers the silent no-op too
 *  (unowned/missing target, or the tag was already in the target state); `failed` carries the caught
 *  rejection reason UNCLASSIFIED — the substrate helper is what maps it onto the wire's closed union. */
export type BulkTagOutcome = { readonly characterId: CharacterId; readonly applied: boolean } | { readonly characterId: CharacterId; readonly failed: unknown };

/** The #1708 pre-#1702 plugin-provenance backfill verdict (`persistence/backfill-plugin-provenance.ts`).
 *  Homed HERE per §7.4. */
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
  SnapshotSummary,
  SnapshotView,
} from "@orb/contracts/character";
