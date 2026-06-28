// domain/preset/constants — the domain-internal sentinels (preset.md "Two row kinds" + esoteric #1).
// These are NOT cross-boundary (no client needs them — the system default is identified at the wire by the
// derived `isSystemDefault` flag on the views), so they stay domain-local and reach external callers only
// through the front door (`index.ts`).

import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

// The system default is exactly ONE row with `ownerId IS NULL`, keyed by the NIL TypeID — all-zero
// Crockford base32, the one literal that satisfies the branded `typeIdSchema('preset_')` constraint
// (esoteric #1). The seed insert, the COW guard (update.ts), the remove guard, and the boot-reseed
// comparison ALL pivot on this one constant simultaneously — a human-readable string (`'system-default'`)
// would be rejected at every request boundary, so this MUST NOT change. (A unit test pins that this
// literal parses as a valid preset id — the enforcer for esoteric #1.)
export const SYSTEM_DEFAULT_PRESET_ID: PresetId = castId<PresetId>(
  "preset_00000000000000000000000000",
);

/** The system default row's display name + free-text `kind` label (seeded at boot, reseeded on a
 *  `schemaVersion` bump). Domain-local — they label the one un-owned row. */
export const SYSTEM_DEFAULT_PRESET_NAME = "Default";
export const SYSTEM_DEFAULT_PRESET_KIND = "system";
