// domain/preset/contract/portability — the orb-NATIVE preset backup op types (export-import-portability.md
// §1, W-preset). Preset is a self-contained owner-scoped entity: its export/import verbs read + write the
// domain's OWN `presets` table directly (no cross-domain Option-B op). The serde IS the already-built preset
// codec (`buildPresetFile`/`parsePresetFile` in `@orb/contracts/preset`) — these verbs are the thin
// owner-scoped relational half over it. Homed under `contract/` (types-in-contract / no-context-returntype);
// explicit interfaces, never a `ReturnType<>`.
//
// The result shapes are STRUCTURALLY the delivery-core `PortableFile` / `PortableImportOutcome` (design §2) so
// the entry-root registry descriptor composes them without a mapping layer — this domain never imports the
// `@orb/contracts/portability` registry contract (the core owns it; one-directional flow).

import type { UserId } from "@orb/kit/ids";

/** One portable preset file: its `filename` (relative — the registry descriptor prefixes the bundle `dir`)
 *  and the serialized `bytes` (the UTF-8 `orb.preset` JSON from `buildPresetFile`). */
export interface PresetExportFile {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** The per-file import outcome (structurally the delivery-core `PortableImportOutcome`): `ok:false` + `error`
 *  for a malformed upload (NEVER thrown — one bad file can't abort a bundle), else `ok:true` with
 *  `created:false` when a same-named owned preset was merged in place (an idempotent re-import). */
export interface PresetImportOutcome {
  readonly ok: boolean;
  readonly created?: boolean;
  readonly error?: string;
}

/** Export ALL of the owner's presets (excludes the shared, un-owned system default) as portable files —
 *  one `orb.preset` JSON per preset, filename = slug(name) + ".json". Pure owner-scoped read + serde. */
export type ExportPresets = (args: { readonly ownerId: UserId }) => Promise<PresetExportFile[]>;

/** Import ONE `orb.preset` upload into the owner's library. Idempotent on `(ownerId, name)`: an existing
 *  same-named owned preset is merged (config replaced in place, same id); otherwise a fresh preset is
 *  created. Never throws for a malformed file — returns `{ ok:false, error }`. */
export type ImportPreset = (args: {
  readonly ownerId: UserId;
  readonly bytes: Uint8Array;
}) => Promise<PresetImportOutcome>;
