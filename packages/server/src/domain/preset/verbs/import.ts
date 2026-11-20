// verb: import — the orb-native preset backup import: parse each untrusted orb.preset upload via parsePresetFile,
// then write the preset domain's own presets table ADDITIVELY (owner ruling): an owned preset with equal content, or
// one an earlier file of the batch landed, is reused; a different one under a taken name keeps its row and the file
// lands under the next free name. The dry run is this same loop with the write left out, so a preview cannot drift
// from the run. Never throws for a malformed file: it is a refusal outcome.
//
// A PRESET'S CONTENT is its config and, for a file whose caller attaches scripts, those scripts. SillyTavern runs a
// preset's scripts in its order, so the scripts key is each script's content key in that order. A script the write
// door refuses never attaches, so the file side leaves it out, and a script repeated in one file attaches once, so
// both sides keep its first place; an owned preset is keyed by what it holds now. A script's switch is not content:
// one library row holds one switch for every preset it is attached to. A file with no script list (an orbweaver
// backup written before the export carried one) is compared by its config alone.
//
// AN ORBWEAVER FILE CARRIES ITS SCRIPTS (`PresetFile.regexScripts`, from the export). Unless its caller attaches a list
// of its own (a SillyTavern preset's), this verb reads that list through the one SillyTavern script reader and
// attaches it to the preset the file lands as, through the injected `importPresetScripts`, the folder's script lift;
// a script the reader refuses is named in the outcome beside the lift's own refusals.

import type { ImportAnswer } from "@orb/contracts/import";
import { clipImportText } from "@orb/contracts/import";
import type { ImportPresets, PresetImportFile, PresetImportOutcome } from "@orb/contracts/preset";
import { OWNED_PRESET_KIND, parsePresetFile, presetContentKey } from "@orb/contracts/preset";
import type { RegexScriptCard, RegexScriptRefusal } from "@orb/contracts/regex";
import { regexScriptCardContentKey } from "@orb/contracts/regex";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { PresetId, UserId } from "@orb/kit/ids";
import { parseJsonText } from "@orb/kit/json";
import { nextFreeName } from "@orb/kit/strings";
import { getLog } from "#foundation/observability";
import { mapYielding } from "#primitives/abort";
import { readPresetFileScripts } from "#primitives/serde/preset";
import type { PresetContext } from "../contract/service.ts";
import { insertPreset, listOwned } from "../persistence/queries.ts";

const PRESET_IMPORT = "preset.import";
const PRESET_ENTITY = "preset";
const UNREADABLE_FILE = "Not a valid JSON preset file.";

type Batch = Omit<Parameters<ImportPresets>[0], "dryRun">;
type ParsedPreset = Extract<ReturnType<typeof parsePresetFile>, { ok: true }>;

/** Decode + JSON-parse without throwing — a non-UTF-8/non-JSON blob is a malformed file, not a crash. */
function readJson(bytes: Uint8Array): { ok: true; value: unknown } | { ok: false } {
  const value = parseJsonText(new TextDecoder().decode(bytes));
  return value === undefined ? { ok: false } : { ok: true, value };
}

interface LandedPreset {
  readonly id: PresetId;
  readonly name: string;
}

interface LibraryEntry {
  readonly row: LandedPreset;
  readonly scriptsKey: string;
  readonly owned: boolean;
}

/** The batch's library: each config key's rows with the scripts key of what each holds (owned rows first, in list
 *  order, then each row the batch lands), whether the owner held it before the batch, and every name taken. The stored
 *  blob is keyed as stored, so a row this build cannot read never equals a readable file; the file lands beside it. */
interface PresetLibrary {
  readonly byConfig: Map<string, LibraryEntry[]>;
  readonly takenNames: Set<string>;
}

// The scripts key of a run of script content keys: each key at its first place.
function scriptsKeyOf(keys: readonly string[]): string {
  return JSON.stringify([...new Set(keys)]);
}

const NO_SCRIPTS_KEY = scriptsKeyOf([]);

function libraryOf(owned: Awaited<ReturnType<typeof listOwned>>, held: ReadonlyMap<PresetId, readonly string[]>): PresetLibrary {
  const library: PresetLibrary = { byConfig: new Map(), takenNames: new Set(owned.map((row) => row.name)) };
  for (const row of owned) {
    enter(library, presetContentKey(row.config), { row: { id: row.id, name: row.name }, scriptsKey: scriptsKeyOf(held.get(row.id) ?? []), owned: true });
  }
  return library;
}

function enter(library: PresetLibrary, configKey: string, entry: LibraryEntry): void {
  library.byConfig.set(configKey, [...(library.byConfig.get(configKey) ?? []), entry]);
}

/** What the batch does with one file, in the batch's order: the answer a preview shows, the outcome the run reports,
 *  and the row to write when it is new. A new row is entered in `library`, so a later equal file reuses it. */
interface Decision {
  readonly answer: ImportAnswer;
  readonly outcome: PresetImportOutcome;
  readonly create?: { readonly row: LandedPreset; readonly parsed: ParsedPreset };
}

/** The scripts an orbweaver file carries, which this verb attaches: those its reader kept, and those it refused. */
interface CarriedScripts {
  readonly scripts: readonly RegexScriptCard[];
  readonly refused: readonly RegexScriptRefusal[];
}

/** One file of the batch, read once: its JSON, the scripts key of the scripts that attach (null when the file speaks
 *  for none), and the scripts this verb attaches itself when its caller attaches none. */
interface KeyedFile {
  readonly decoded: ReturnType<typeof readJson>;
  readonly scriptsKey: string | null;
  readonly carried?: CarriedScripts;
}

function decide(library: PresetLibrary, { decoded, scriptsKey }: KeyedFile, newId: () => PresetId): Decision {
  const parsed = decoded.ok ? parsePresetFile(decoded.value) : null;
  if (parsed?.ok !== true) {
    return { answer: { reuse: null, keys: [] }, outcome: { ok: false, error: parsed?.error ?? UNREADABLE_FILE } };
  }
  const configKey = presetContentKey(parsed.config);
  const keys = scriptsKey === null ? [configKey] : [configKey, scriptsKey];
  const same = library.byConfig.get(configKey)?.find((entry) => scriptsKey === null || entry.scriptsKey === scriptsKey);
  if (same !== undefined) {
    return {
      answer: { reuse: same.owned ? "library" : "upload", keys },
      outcome: { ok: true, created: false, presetId: same.row.id, name: same.row.name, renamedFrom: null },
    };
  }
  const row: LandedPreset = { id: newId(), name: nextFreeName(parsed.name, library.takenNames) };
  library.takenNames.add(row.name);
  enter(library, configKey, { row, scriptsKey: scriptsKey ?? NO_SCRIPTS_KEY, owned: false });
  return {
    answer: { reuse: null, keys },
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
      kind: OWNED_PRESET_KIND,
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

  // Each file's scripts key over the scripts its lift attaches: the write door's verdict, asked of the lift's own plan.
  async function keyedFiles(ownerId: UserId, files: readonly PresetImportFile[]): Promise<readonly KeyedFile[]> {
    const read = files.map(({ bytes, regexScripts }) => {
      const decoded = readJson(bytes);
      const carried = regexScripts === undefined && decoded.ok ? readPresetFileScripts(decoded.value) : undefined;
      return { decoded, carried, scripts: regexScripts ?? carried?.scripts };
    });
    const carrying = read.flatMap(({ scripts }) => (scripts === undefined ? [] : [scripts]));
    const plans = carrying.length === 0 ? [] : await ctx.planPresetScripts({ ownerId, presets: carrying });
    let at = 0;
    return read.map(({ decoded, carried, scripts }): KeyedFile => {
      if (scripts === undefined) {
        return { decoded, scriptsKey: null };
      }
      const plan = plans[at] ?? [];
      at += 1;
      const attached = scripts.filter((_, i) => {
        const verdict = plan[i];
        return verdict === undefined || !("refused" in verdict);
      });
      const scriptsKey = scriptsKeyOf(attached.map(regexScriptCardContentKey));
      return carried === undefined ? { decoded, scriptsKey } : { decoded, scriptsKey, carried };
    });
  }

  // A landed file's own scripts, attached to the preset it landed as. A reused preset takes them too: the lift reuses
  // equal script rows and its attach is idempotent, so a second import of one file writes nothing.
  async function attachCarried(ownerId: UserId, outcome: PresetImportOutcome, carried: CarriedScripts): Promise<PresetImportOutcome> {
    if (!outcome.ok || outcome.presetId === undefined || carried.scripts.length + carried.refused.length === 0) {
      return outcome;
    }
    const lifted =
      carried.scripts.length === 0
        ? { created: 0, reused: 0, refused: [] }
        : await ctx.importPresetScripts({ ownerId, presetId: outcome.presetId, scripts: carried.scripts });
    if (carried.scripts.length > 0) {
      // The lift writes the regex library and the preset's attachments without an event of its own.
      ctx.emitUserEvent(ownerId, { type: "regexChanged" });
    }
    const refused = [...lifted.refused, ...carried.refused].map(({ name, reason }) => ({ name: clipImportText(name), reason: clipImportText(reason) }));
    return { ...outcome, regexScripts: { ...lifted, refused } };
  }

  async function importPresets(args: Batch & { readonly dryRun: true }): Promise<readonly ImportAnswer[]>;
  async function importPresets(args: Batch & { readonly dryRun: false }): Promise<readonly PresetImportOutcome[]>;
  async function importPresets({
    ownerId,
    files,
    signal,
    dryRun,
  }: Batch & { readonly dryRun: boolean }): Promise<readonly ImportAnswer[] | readonly PresetImportOutcome[]> {
    const library = libraryOf(await listOwned(ctx.db, ownerId), await ctx.listPresetScriptKeys({ ownerId }));
    const decided = await mapYielding(await keyedFiles(ownerId, files), signal, async (file): Promise<Decision> => {
      const decision = decide(library, file, ctx.newPresetId);
      if (dryRun) {
        return decision;
      }
      if (decision.create !== undefined) {
        await write(ownerId, decision.create);
      }
      return file.carried === undefined ? decision : { ...decision, outcome: await attachCarried(ownerId, decision.outcome, file.carried) };
    });
    return dryRun ? decided.map(({ answer }) => answer) : decided.map(({ outcome }) => outcome);
  }
  return importPresets;
}
