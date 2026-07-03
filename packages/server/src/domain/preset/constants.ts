// Not cross-boundary: no client needs these — the system default is identified at the wire by the
// derived `isSystemDefault` flag on the views. Reach external callers only through `index.ts`.

import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

// The system default is exactly ONE row with `ownerId IS NULL`, keyed by the NIL TypeID — the one
// literal satisfying the branded `typeIdSchema('preset_')` constraint. The seed insert, the COW guard
// (update.ts), the remove guard, and the boot-reseed comparison all pivot on this constant
// simultaneously; a human-readable string would fail the id schema at every request boundary. MUST NOT
// change (a unit test pins this literal as a valid preset id).
export const SYSTEM_DEFAULT_PRESET_ID: PresetId = castId<PresetId>(
  "preset_00000000000000000000000000",
);

/** Seeded at boot, reseeded on a `schemaVersion` bump. */
export const SYSTEM_DEFAULT_PRESET_NAME = "Default";
export const SYSTEM_DEFAULT_PRESET_KIND = "system";
