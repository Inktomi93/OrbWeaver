// The PURE row → view mappers (zero I/O). The ONE home for the read seam's two load-bearing
// projections: (1) `config` is run through `parsePromptConfig` (lenient — a malformed or older blob is
// lifted forward / bounded to DEFAULT rather than throwing mid-load; the db schema's "parsed at the
// read seam" note), and (2) `isSystemDefault` is derived from the sentinel id (`id === SYSTEM_DEFAULT_PRESET_ID`),
// NOT `ownerId IS NULL` — ownerless PACKAGED template rows are also un-owned but are NOT the default. Verbs
// map through here instead of re-spelling the projection at five call sites.

import { parsePromptConfig } from "@orb/contracts/preset";
import type { presets } from "@orb/db";
import { SYSTEM_DEFAULT_PRESET_ID } from "../constants";
import type { PresetDetail, PresetSummary } from "../contract/views";

type PresetRow = typeof presets.$inferSelect;

/** The list-row projection (no config parse needed — summaries omit the blob). */
export function toPresetSummary(row: PresetRow): PresetSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    isSystemDefault: row.id === SYSTEM_DEFAULT_PRESET_ID,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPresetDetail(row: PresetRow): PresetDetail {
  return {
    ...toPresetSummary(row),
    config: parsePromptConfig(row.config),
    schemaVersion: row.schemaVersion,
  };
}
