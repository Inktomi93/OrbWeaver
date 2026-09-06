// The PURE row → view mappers (zero I/O). The ONE home for the read seam's two load-bearing
// projections: (1) `config` is run through `promptConfigConfig.parseOutcome` (lenient — a malformed or older
// blob is lifted forward / bounded to DEFAULT rather than throwing mid-load; the db schema's "parsed at the
// read seam" note — and since #1716 the outcome's PROVENANCE crosses as `configUnreadable`, see
// `toPresetDetail`), and (2) `isSystemDefault` is derived from the sentinel id (`id === SYSTEM_DEFAULT_PRESET_ID`),
// NOT `ownerId IS NULL` — ownerless PACKAGED template rows are also un-owned but are NOT the default. Verbs
// map through here instead of re-spelling the projection at five call sites.

import { promptConfigConfig } from "@orb/contracts/preset";
import type { presets } from "@orb/db";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants.ts";
import type { PresetDetail, PresetSummary } from "../contract/views.ts";

type PresetRow = typeof presets.$inferSelect;

/** The list-row projection (no config parse needed — summaries omit the blob). */
export function toPresetSummary(row: PresetRow): PresetSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    isSystemDefault: row.id === SYSTEM_DEFAULT_PRESET_ID,
    forkedFrom: row.forkedFrom,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * THE DETAIL PROJECTION READS THROUGH `parseOutcome`, NOT `parse` (#1716) — same walk, same value, plus the
 * PROVENANCE the editor needs. Two things ride on that:
 *
 *  • `configUnreadable` — the read-time twin of the #1026 write refusal. `updatePresetRow` re-reads this
 *    exact row through `promptConfigConfig.parseOutcome(row.config, row.schemaVersion)` and refuses a
 *    config write when it is not intact, so the DETAIL must ask the identical question or the editor's
 *    state and the save's verdict can disagree (the whole defect: a defaults-looking editor followed by a
 *    generic failure).
 *  • `row.schemaVersion` is threaded, which `parsePromptConfig` cannot do (it takes no stored version).
 *    The guard passes the COLUMN and `startVersion` prefers it over the in-blob probe, so omitting it here
 *    was the one way the two reads could resolve different versions for the same bytes.
 */
export function toPresetDetail(row: PresetRow): PresetDetail {
  const outcome = promptConfigConfig.parseOutcome(row.config, row.schemaVersion);
  return {
    ...toPresetSummary(row),
    config: outcome.value,
    schemaVersion: row.schemaVersion,
    configUnreadable: outcome.intact ? null : outcome.failure,
  };
}
