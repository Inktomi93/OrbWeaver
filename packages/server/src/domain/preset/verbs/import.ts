// verb: import — the orb-native preset backup import: parse an untrusted orb.preset upload via
// parsePresetFile, then write the preset domain's own presets table ADDITIVELY (owner ruling): an owned
// preset with equal content is reused; a different one under the same name keeps its row and the file lands
// under the next free name. Never throws for a malformed file — returns { ok:false, error }.

import { parsePresetFile, presetContentKey } from "@orb/contracts/preset";
import { nextFreeName } from "@orb/kit/strings";
import { getLog } from "#foundation/observability";
import type { PresetContext } from "../context.ts";
import type { ImportPreset, PresetImportOutcome } from "../contract/portability.ts";
import { insertPreset, listOwned } from "../persistence/queries.ts";

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

    const { config } = parsed;
    const at = ctx.now();
    const owned = await listOwned(ctx.db, ownerId);
    // The stored blob is compared as stored: a row this build cannot read never equals a readable file, so
    // the file lands beside it and the unreadable row stays for the owner to delete.
    const key = presetContentKey(config);
    const same = owned.find((row) => presetContentKey(row.config) === key);
    if (same !== undefined) {
      getLog().info({ userId: ownerId, presetId: same.id }, "preset: import reused an equal preset");
      return { ok: true, created: false, presetId: same.id, name: same.name, renamedFrom: null };
    }

    const name = nextFreeName(
      parsed.name,
      owned.map((row) => row.name),
    );
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
        metadata: { name, renamedFrom: name === parsed.name ? null : parsed.name },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "presetsChanged", presetId });
    getLog().info({ userId: ownerId, presetId }, "preset: imported (created)");
    return { ok: true, created: true, presetId, name, renamedFrom: name === parsed.name ? null : parsed.name };
  };
}
