// Not cross-boundary: the system default is identified at the wire by the derived isSystemDefault flag.
// Reach external callers only through index.ts.

import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

// MUST NOT change — a unit test pins this literal as a valid preset id; the seed insert, the COW guard,
// the remove guard, and the boot-reseed comparison all pivot on it simultaneously.
export const SYSTEM_DEFAULT_PRESET_ID: PresetId = castId<PresetId>("preset_00000000000000000000000000");

export const SYSTEM_DEFAULT_PRESET_NAME = "Default";
export const SYSTEM_DEFAULT_PRESET_KIND = "system";
