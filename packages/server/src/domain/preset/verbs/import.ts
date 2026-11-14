// verb: import — the orb-native preset backup import: parse each untrusted orb.preset upload via parsePresetFile,
// then write the preset domain's own presets table ADDITIVELY (owner ruling): an owned preset with equal content, or
// one an earlier file of the batch landed, is reused; a different one under a taken name keeps its row and the file
// lands under the next free name. The dry run is this same loop with the write left out, so a preview cannot drift
// from the run. Never throws for a malformed file: it is a refusal outcome.

import type { ImportAnswer } from "@orb/contracts/import";
import type { ImportPresets, PresetImportOutcome } from "@orb/contracts/preset";
import { parsePresetFile, presetContentKey } from "@orb/contracts/preset";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { PresetId, UserId } from "@orb/kit/ids";
import { nextFreeName } from "@orb/kit/strings";
import { getLog } from "#foundation/observability";
import { mapYielding } from "#primitives/abort";
import type { PresetContext } from "../contract/service.ts";
import { insertPreset, listOwned } from "../persistence/queries.ts";

const PRESET_IMPORT = "preset.import";
const PRESET_ENTITY = "preset";
// The portable file carries no `kind`; a freshly-imported preset lands under this neutral label.
const IMPORTED_PRESET_KIND = "roleplay";
const UNREADABLE_FILE = "Not a valid JSON preset file.";

type Batch = Omit<Parameters<ImportPresets>[0], "dryRun">;
type ParsedPreset = Extract<ReturnType<typeof parsePresetFile>, { ok: true }>;

/** Decode + JSON-parse without throwing — a non-UTF-8/non-JSON blob is a malformed file, not a crash. */
function readJson(bytes: Uint8Array): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false };
  }
}

interface LandedPreset {
  readonly id: PresetId;
  readonly name: string;
}

/** The batch's library: each content key's row (the first owned row wins on equal content, then each row the batch
 *  lands), whether the owner held it before the batch, and every name taken. The stored blob is keyed as stored, so a
 *  row this build cannot read never equals a readable file; the file lands beside it. */
interface PresetLibrary {
  readonly byKey: Map<string, { readonly row: LandedPreset; readonly owned: boolean }>;
  readonly takenNames: Set<string>;
}

function libraryOf(owned: Awaited<ReturnType<typeof listOwned>>): PresetLibrary {
  const library: PresetLibrary = { byKey: new Map(), takenNames: new Set(owned.map((row) => row.name)) };
  for (const row of owned) {
    const key = presetContentKey(row.config);
    if (!library.byKey.has(key)) {
      library.byKey.set(key, { row: { id: row.id, name: row.name }, owned: true });
    }
  }
  return library;
}

/** What the batch does with one file, in the batch's order: the answer a preview shows, the outcome the run reports,
 *  and the row to write when it is new. A new row is entered in `library`, so a later equal file reuses it. */
interface Decision {
  readonly answer: ImportAnswer;
  readonly outcome: PresetImportOutcome;
  readonly create?: { readonly row: LandedPreset; readonly parsed: ParsedPreset };
}

function decide(library: PresetLibrary, bytes: Uint8Array, newId: () => PresetId): Decision {
  const decoded = readJson(bytes);
  const parsed = decoded.ok ? parsePresetFile(decoded.value) : null;
  if (parsed?.ok !== true) {
    return { answer: { reuse: null, keys: [] }, outcome: { ok: false, error: parsed?.error ?? UNREADABLE_FILE } };
  }
  const key = presetContentKey(parsed.config);
  const same = library.byKey.get(key);
  if (same !== undefined) {
    return {
      answer: { reuse: same.owned ? "library" : "upload", keys: [key] },
      outcome: { ok: true, created: false, presetId: same.row.id, name: same.row.name, renamedFrom: null },
    };
  }
  const row: LandedPreset = { id: newId(), name: nextFreeName(parsed.name, library.takenNames) };
  library.takenNames.add(row.name);
  library.byKey.set(key, { row, owned: false });
  return {
    answer: { reuse: null, keys: [key] },
    outcome: { ok: true, created: true, presetId: row.id, name: row.name, renamedFrom: row.name === parsed.name ? null : parsed.name },
    create: { row, parsed },
  };
}

export function createImportPresets(input: DbAssemblyInput<PresetContext>): ImportPresets {
  const ctx: PresetContext = { ...input, db: databaseForOwner(input.db) };
  const log = getLog(input.logger);

  async function write(ownerId: UserId, { row, parsed }: NonNullable<Decision["create"]>): Promise<void> {
    const at = ctx.now();
    await insertPreset(ctx.db, {
      id: row.id,
      ownerId,
      name: row.name,
      kind: IMPORTED_PRESET_KIND,
      config: parsed.config,
      schemaVersion: parsed.config.schemaVersion,
      // An import is born here — its provenance is the FILE, and the source preset (if any) is not a row
      // in this database.
      forkedFrom: null,
      createdAt: at,
      updatedAt: at,
    });
    const metadata = { name: row.name, renamedFrom: row.name === parsed.name ? null : parsed.name };
    await ctx.audit({ actorUserId: ownerId, action: PRESET_IMPORT, entityType: PRESET_ENTITY, entityId: row.id, metadata }, at);
    ctx.emitUserEvent(ownerId, { type: "presetsChanged", presetId: row.id });
    log.info({ userId: ownerId, presetId: row.id }, "preset: imported (created)");
  }

  async function importPresets(args: Batch & { readonly dryRun: true }): Promise<readonly ImportAnswer[]>;
  async function importPresets(args: Batch & { readonly dryRun: false }): Promise<readonly PresetImportOutcome[]>;
  async function importPresets({
    ownerId,
    files,
    signal,
    dryRun,
  }: Batch & { readonly dryRun: boolean }): Promise<readonly ImportAnswer[] | readonly PresetImportOutcome[]> {
    const library = libraryOf(await listOwned(ctx.db, ownerId));
    const decided = await mapYielding(files, signal, async (bytes): Promise<Decision> => {
      const decision = decide(library, bytes, ctx.newPresetId);
      if (!dryRun && decision.create !== undefined) {
        await write(ownerId, decision.create);
      }
      return decision;
    });
    return dryRun ? decided.map(({ answer }) => answer) : decided.map(({ outcome }) => outcome);
  }
  return importPresets;
}
