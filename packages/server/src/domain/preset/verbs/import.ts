// verb: import — the orb-native preset backup import: parse an untrusted orb.preset upload via
// parsePresetFile, then write the preset domain's own presets table directly. Idempotent on (ownerId, name):
// an existing same-named preset is merged in place; otherwise a fresh one is created. Never throws for a
// malformed file — returns { ok:false, error } so one bad file can't abort a bundle import.

import { parsePresetFile } from "@orb/contracts/preset";
import { getLog } from "#foundation/observability";
import type { PresetContext } from "../context.ts";
import type { ImportPreset, PresetImportOutcome } from "../contract/portability.ts";
import { findOwnedPresetByName, insertPreset, replacePresetConfig } from "../persistence/queries.ts";

const PRESET_IMPORT = "preset.import";
const PRESET_ENTITY = "preset";
// The portable file carries no `kind`; a freshly-imported preset lands under this neutral label.
const IMPORTED_PRESET_KIND = "roleplay";

/** Decode + JSON-parse without throwing — a non-UTF-8/non-JSON blob is a malformed file, not a crash. */
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
      // `replacePresetConfig`, not `updatePresetRow`: the new content is the uploaded FILE's config
      // (strictly parsed by `parsePresetFile`) and never descends from the row it lands on — so the #471
      // refusal does not apply, and re-importing a backup over a preset the current build cannot read is
      // exactly the recovery the guard exists to leave open (#1026).
      await replacePresetConfig(ctx.db, existingId, ownerId, {
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
      return { ok: true, created: false, presetId: existingId };
    }

    const presetId = ctx.newPresetId();
    await insertPreset(ctx.db, {
      id: presetId,
      ownerId,
      name,
      kind: IMPORTED_PRESET_KIND,
      config,
      schemaVersion: config.schemaVersion,
      // An import is born here — its provenance is the FILE, and the source preset (if any) is not a row
      // in this database.
      forkedFrom: null,
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
    return { ok: true, created: true, presetId };
  };
}
