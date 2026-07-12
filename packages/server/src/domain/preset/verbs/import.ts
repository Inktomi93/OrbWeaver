// verb: import (W-preset; export-import-portability.md §1) — the orb-NATIVE preset backup import: parse an
// untrusted `orb.preset` upload via the ONE preset codec (`@orb/contracts/preset` `parsePresetFile`, which
// STRICTLY validates + lifts an older config forward) → write the preset domain's OWN `presets` table
// directly (a self-contained backup — no cross-domain Option-B op). Idempotent on `(ownerId, name)`: an
// existing same-named owned preset is MERGED
// (its config replaced in place, same id, kind preserved); otherwise a fresh owned preset is created.
//
// NEVER throws for a malformed file — a JSON-parse miss or a codec rejection returns `{ ok:false, error }` so
// one bad file can't abort a bundle import (the delivery-core per-file isolation posture). `export.ts` is the
// round-trip twin. The portable file carries no `kind` (the codec is name+config only), so a fresh import
// lands under the neutral `roleplay` label; a merge keeps the target's existing kind.

import { parsePresetFile } from "@orb/contracts/preset";
import { getLog } from "#foundation/observability";
import type { ImportPreset, PresetImportOutcome } from "../contract/portability";
import type { PresetContext } from "../contract/service";
import { findOwnedPresetByName, insertPreset, updatePresetRow } from "../persistence/queries";

const PRESET_IMPORT = "preset.import";
const PRESET_ENTITY = "preset";
// The portable file carries no `kind`; a freshly-imported preset lands under this neutral label.
const IMPORTED_PRESET_KIND = "roleplay";

/** Decode + JSON-parse the upload without throwing — a non-UTF-8 / non-JSON blob is a malformed file, not a
 *  crash. `ok:false` on any parse failure (the caller maps it to `{ ok:false, error }`). */
function readJson(bytes: Uint8Array): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false };
  }
}

export function createImport(ctx: PresetContext): ImportPreset {
  return async ({ ownerId, bytes }): Promise<PresetImportOutcome> => {
    const decoded = readJson(bytes);
    if (!decoded.ok) {
      return { ok: false, error: "Not a valid JSON preset file." };
    }
    const parsed = parsePresetFile(decoded.value);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    const { name, config } = parsed;
    const at = ctx.now();
    const existingId = await findOwnedPresetByName(ctx.db, ownerId, name);

    if (existingId !== null) {
      // Re-import: merge into the existing owned row (config swap in place, same id, kind untouched).
      await updatePresetRow(ctx.db, existingId, ownerId, {
        config,
        schemaVersion: config.schemaVersion,
        updatedAt: at,
      });
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: PRESET_IMPORT,
          entityType: PRESET_ENTITY,
          entityId: existingId,
          metadata: { name, merged: true },
        },
        at,
      );
      ctx.emitUserEvent(ownerId, { type: "presetsChanged", presetId: existingId });
      getLog().info({ userId: ownerId, presetId: existingId }, "preset: imported (merged)");
      return { ok: true, created: false };
    }

    const presetId = ctx.newPresetId();
    await insertPreset(ctx.db, {
      id: presetId,
      ownerId,
      name,
      kind: IMPORTED_PRESET_KIND,
      config,
      schemaVersion: config.schemaVersion,
      createdAt: at,
      updatedAt: at,
    });
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: PRESET_IMPORT,
        entityType: PRESET_ENTITY,
        entityId: presetId,
        metadata: { name, merged: false },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "presetsChanged", presetId });
    getLog().info({ userId: ownerId, presetId }, "preset: imported (created)");
    return { ok: true, created: true };
  };
}
