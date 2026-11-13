// verb: import — the orb-native preset backup import: parse an untrusted orb.preset upload via
// parsePresetFile, then write the preset domain's own presets table ADDITIVELY (owner ruling): an owned
// preset with equal content is reused; a different one under the same name keeps its row and the file lands
// under the next free name. Never throws for a malformed file — returns { ok:false, error }.

import type { ImportReuse } from "@orb/contracts/import";
import type { FindOwnedPresets, ImportPreset, PresetImportOutcome } from "@orb/contracts/preset";
import { parsePresetFile, presetContentKey } from "@orb/contracts/preset";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { nextFreeName } from "@orb/kit/strings";
import { getLog } from "#foundation/observability";
import { mapYielding } from "#primitives/abort";
import type { PresetContext } from "../contract/service.ts";
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

type OwnedPreset = Awaited<ReturnType<typeof listOwned>>[number];

/** The reuse test, keyed once over the owned rows: the owned row an incoming config equals, or undefined. The
 *  stored blob is compared as stored, so a row this build cannot read never equals a readable file; the file
 *  lands beside it and the unreadable row stays for the owner to delete. The first row wins on equal content. */
function reusablePreset(owned: readonly OwnedPreset[]): (config: Parameters<typeof presetContentKey>[0]) => OwnedPreset | undefined {
  const byKey = new Map<string, OwnedPreset>();
  for (const row of owned) {
    const key = presetContentKey(row.config);
    if (!byKey.has(key)) {
      byKey.set(key, row);
    }
  }
  return (config) => byKey.get(presetContentKey(config));
}

/** The read-only twin of {@link createImportPresets}'s reuse test, for a preview that must not write. It judges the
 *  files in the order the import lands them, so a preset equal to an earlier file's answers `"upload"`. */
export function createFindOwnedPresets(input: DbAssemblyInput<Pick<PresetContext, "db">>): FindOwnedPresets {
  const db = databaseForOwner(input.db);
  return async ({ ownerId, files, signal }): Promise<readonly (ImportReuse | null)[]> => {
    const reuse = reusablePreset(await listOwned(db, ownerId));
    // call-local: the content keys of the files judged so far. Ends if it outlives the call.
    const landed = new Set<string>();
    return await mapYielding(files, signal, (bytes): ImportReuse | null => {
      const decoded = readJson(bytes);
      const parsed = decoded.ok ? parsePresetFile(decoded.value) : null;
      if (parsed?.ok !== true) {
        return null;
      }
      if (reuse(parsed.config) !== undefined) {
        return "library";
      }
      const key = presetContentKey(parsed.config);
      if (landed.has(key)) {
        return "upload";
      }
      landed.add(key);
      return null;
    });
  };
}

export function createImportPresets(input: DbAssemblyInput<PresetContext>): ImportPreset {
  const ctx: PresetContext = { ...input, db: databaseForOwner(input.db) };
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
    const same = reusablePreset(owned)(config);
    if (same !== undefined) {
      getLog(input.logger).info({ userId: ownerId, presetId: same.id }, "preset: import reused an equal preset");
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
    getLog(input.logger).info({ userId: ownerId, presetId }, "preset: imported (created)");
    return { ok: true, created: true, presetId, name, renamedFrom: name === parsed.name ? null : parsed.name };
  };
}
