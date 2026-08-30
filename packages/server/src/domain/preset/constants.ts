// Not cross-boundary: the system default is identified at the wire by the derived isSystemDefault flag.
// Reach external callers only through index.ts.

import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

// MUST NOT change — a unit test pins this literal as a valid preset id; the seed insert, the COW guard,
// the remove guard, and the boot-reseed comparison all pivot on it simultaneously.
export const SYSTEM_DEFAULT_PRESET_ID: PresetId = castId<PresetId>("preset_00000000000000000000000000");

export const SYSTEM_DEFAULT_PRESET_NAME = "Default";
export const SYSTEM_DEFAULT_PRESET_KIND = "system";

/** The kind an OWNED preset is born with — the copy-on-write fork's (side-eye 2026-08-30 P2-B, #856).
 *
 *  `kind` is free text describing what a preset IS, and it is rendered VERBATIM as the leading token of the
 *  library row's subtitle (`preset-row-view.ts`). The fork used to copy its base's kind, so a user's own
 *  fully-editable copy wore `system` — this surface's word for "locked, not yours, no Export, no Reset" —
 *  and the two doors to a copy disagreed (the client's New/Duplicate mints `generation`). Provenance is not
 *  this field's job: the same subtitle already carries it as `forked from <source>`. */
export const OWNED_PRESET_KIND = "generation";
