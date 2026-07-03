// domain/preset/substrate/views — the PURE row → view mappers (zero I/O). The ONE home for the read seam's
// two load-bearing projections: (1) `config` is run through `parsePromptConfig` (LENIENT — a malformed or
// older blob is lifted forward / bounded to DEFAULT rather than throwing mid-load;
// the db schema's "parsed at the read seam" note), and (2) `isSystemDefault` is derived from `ownerId IS
// NULL` so the client identifies the un-owned row without the domain-internal sentinel. Verbs map through
// here instead of re-spelling the projection at five call sites.

import { parsePromptConfig } from "@orb/contracts/preset";
import type { presets } from "@orb/db";
import type { PresetDetail, PresetSummary } from "../contract/views";

type PresetRow = typeof presets.$inferSelect;

/** The list-row projection (no config parse needed — summaries omit the blob). */
export function toPresetSummary(row: PresetRow): PresetSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    isSystemDefault: row.ownerId === null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The full projection — the summary PLUS the lifted `PromptConfig` blob + its mirrored version. */
export function toPresetDetail(row: PresetRow): PresetDetail {
  return {
    ...toPresetSummary(row),
    config: parsePromptConfig(row.config),
    schemaVersion: row.schemaVersion,
  };
}
