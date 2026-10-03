// The PURE row → view mappers (zero I/O). The ONE home for the read seam's two load-bearing
// projections: (1) `config` is run through `promptConfigConfig.parseOutcome` (lenient — a malformed or older
// blob is lifted forward / bounded to DEFAULT rather than throwing mid-load; the db schema's "parsed at the
// read seam" note — and since #1716 the outcome's PROVENANCE crosses as `configUnreadable`, see
// `toPresetDetail`), and (2) `isSystemDefault` is derived from the sentinel id (`id === SYSTEM_DEFAULT_PRESET_ID`),
// NOT `ownerId IS NULL` — any other ownerless row (a retired packaged template) is NOT the default. Verbs
// map through here instead of re-spelling the projection at five call sites.

import { promptConfigConfig } from "@orb/contracts/preset";
import type { presets } from "@orb/db";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants.ts";
import type { PresetDetail, PresetSummary } from "../contract/views.ts";

type PresetRow = typeof presets.$inferSelect;

type PresetConfigOutcome = ReturnType<typeof promptConfigConfig.parseOutcome>;

// Both projections ask the write guard's exact question (`parseOutcome` over the stored COLUMN version), so
// the list row, the editor and `updatePresetRow`'s refusal cannot disagree about one row.
function readConfig(row: PresetRow): PresetConfigOutcome {
  return promptConfigConfig.parseOutcome(row.config, row.schemaVersion);
}

function summaryOf(row: PresetRow, outcome: PresetConfigOutcome): PresetSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    isSystemDefault: row.id === SYSTEM_DEFAULT_PRESET_ID,
    forkedFrom: row.forkedFrom,
    configUnreadable: outcome.intact ? null : outcome.failure,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The list-row projection. It parses the blob only for its verdict, so the list can mark an unreadable row
 *  before the editor opens it (ADR 0290: a re-import lands beside such a row and never heals it). */
export function toPresetSummary(row: PresetRow): PresetSummary {
  return summaryOf(row, readConfig(row));
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
  const outcome = readConfig(row);
  return {
    ...summaryOf(row, outcome),
    config: outcome.value,
    schemaVersion: row.schemaVersion,
  };
}
