// verb: importFile / previewFile — the Presets page's single-preset import door (redesign §16.1 G6), for both formats
// a preset file arrives in. The envelope picks the arm: an `orb.preset` file goes as it is; anything else is read as a
// SillyTavern chat-completion preset through `parseStPresetJson`, the parse the profile folder's collector calls.
// Either way the preset lands through `createImportPresets` (verbs/import.ts) as a batch of one, the op the folder
// import and the portability bundle use, so the merge and collision rules are theirs by construction, and a
// SillyTavern preset's own regex scripts attach through the injected `importPresetScripts`, the folder's script lift.
//
// The preview is the same read and the same batch in dry-run mode, so it cannot promise what the run does not do.
// Neither arm throws for a bad file: a refusal is an outcome carrying its sentence.

import { clipImportText } from "@orb/contracts/import";
import { SAMPLER_KNOBS } from "@orb/contracts/inference";
import type { ImportPresets, PresetFilePreview, PresetImportOutcome, PromptConfig } from "@orb/contracts/preset";
import { PRESET_SCHEMA_KIND, parsePresetFile } from "@orb/contracts/preset";
import type { ImportPresetScripts, PlanPresetScripts, RegexScriptCard, RegexScriptRefusal } from "@orb/contracts/regex";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import { isPlainObject } from "@orb/kit/guards";
import { parseJsonText } from "@orb/kit/json";
import { NEVER_ABORTED, soleResult } from "#primitives/abort";
import { parseStPresetJson } from "#primitives/serde/preset";
import type { ImportPresetFileParams } from "../contract/params.ts";
import type { PresetService } from "../contract/service.ts";

const JSON_EXT = /\.json$/iu;
/** The name a SillyTavern preset lands under when its file name is only an extension; `parsePresetFile` uses the
 *  same name for a nameless orb file. */
const UNNAMED_PRESET = "Imported preset";
const NOT_JSON = "That file isn't valid JSON, so neither an orbweaver preset export nor a SillyTavern Chat Completion preset could be read from it.";

/** The context and output limits a preset stores beside its samplers. */
const LIMIT_PARAMS = ["maxContextTokens", "maxOutputTokens"] as const satisfies readonly (keyof PromptConfig["params"])[];

type LeftOut = Extract<PresetFilePreview, { ok: true }>["leftOut"][number];

// The reasons are written in plain words where the mapper and the serde produce them; the file's own field names are clipped.
function clippedLeftOut({ field, reason }: LeftOut): LeftOut {
  return { field: clipImportText(field), reason };
}

/** What the preset lands with, counted off the config the import writes. */
function configCounts(config: PromptConfig): {
  readonly sectionCount: number;
  readonly enabledCount: number;
  readonly samplerCount: number;
  readonly limitCount: number;
} {
  const set = (knob: keyof PromptConfig["params"]): boolean => config.params[knob] !== undefined;
  return {
    sectionCount: config.sections.length,
    enabledCount: config.sections.filter((section) => section.enabled).length,
    samplerCount: SAMPLER_KNOBS.filter(set).length,
    limitCount: LIMIT_PARAMS.filter(set).length,
  };
}

type PresetFileRead =
  | ({
      readonly ok: true;
      readonly format: Extract<PresetFilePreview, { ok: true }>["format"];
      readonly bytes: Uint8Array;
      readonly name: string;
      readonly leftOut: Extract<PresetFilePreview, { ok: true }>["leftOut"];
      readonly clamped: Extract<PresetFilePreview, { ok: true }>["clamped"];
      readonly regexScripts: readonly RegexScriptCard[];
      readonly addedSections: readonly string[];
    } & ReturnType<typeof configCounts>)
  | { readonly ok: false; readonly error: string };

// The SillyTavern reader's two refusals read differently: one never claimed the file, the other claimed it and
// refused what it mapped to, and saying "not a SillyTavern preset" for the second denies what the reason names.
function stRefusal(recognised: boolean, reason: string): string {
  return recognised
    ? `Recognised as a SillyTavern preset, refused: ${reason}`
    : `orbweaver couldn't import this file. It isn't an orbweaver preset export, and the SillyTavern reader stopped: ${reason}`;
}

/** SillyTavern names an imported preset by its file stem, so this door does too. */
function stemOf(fileName: string): string {
  const stem = fileName.replace(JSON_EXT, "").trim();
  return stem === "" ? UNNAMED_PRESET : stem;
}

function readPresetFile({ fileText, fileName }: Pick<ImportPresetFileParams, "fileText" | "fileName">): PresetFileRead {
  const raw = parseJsonText(fileText);
  if (raw === undefined) {
    return { ok: false, error: NOT_JSON };
  }
  if (isPlainObject(raw) && raw["schemaKind"] === PRESET_SCHEMA_KIND) {
    const orb = parsePresetFile(raw);
    if (!orb.ok) {
      return orb;
    }
    const bytes = new TextEncoder().encode(fileText);
    return { ok: true, format: "orbweaver", bytes, name: orb.name, ...configCounts(orb.config), leftOut: [], clamped: [], regexScripts: [], addedSections: [] };
  }
  const st = parseStPresetJson(raw, { name: stemOf(fileName) });
  if (!st.ok) {
    return { ok: false, error: stRefusal(st.recognised, st.reason) };
  }
  const { name, file, unmapped, regexScripts, addedSections } = st.parsed;
  return {
    ok: true,
    format: "sillyTavern",
    bytes: new TextEncoder().encode(JSON.stringify(file)),
    name,
    ...configCounts(file.config),
    // A value brought into range was imported, so it is reported as changed and never as left out.
    leftOut: unmapped.filter(({ clamped }) => clamped === undefined).map(clippedLeftOut),
    clamped: unmapped.flatMap(({ field, clamped }) => (clamped === undefined ? [] : [{ field: clipImportText(field), ...clamped }])),
    regexScripts,
    addedSections,
  };
}

// A refusal crosses the wire with the file's name and the door's reason, both clipped as an import shows them.
function clippedRefusal(name: string, reason: string): RegexScriptRefusal {
  return { name: clipImportText(name), reason: clipImportText(reason) };
}

/** Both ops are INJECTED (verb-to-verb value imports are the banned edge — `domain-no-cross-verb`): service.ts
 *  builds `createImportPresets(ctx)` once and hands it here with the regex domain's script lift. */
export function createImportFile(deps: {
  readonly importPresets: ImportPresets;
  readonly importPresetScripts: ImportPresetScripts;
  readonly planPresetScripts: PlanPresetScripts;
  readonly emitUserEvent: EmitUserEvent;
}): Pick<PresetService, "importFile" | "previewFile"> {
  async function previewFile(params: ImportPresetFileParams): Promise<PresetFilePreview> {
    const read = readPresetFile(params);
    if (!read.ok) {
      return read;
    }
    const answer = soleResult(await deps.importPresets({ ownerId: params.userId, files: [read.bytes], dryRun: true, signal: NEVER_ABORTED }));
    const [plan = []] = await deps.planPresetScripts({ ownerId: params.userId, presets: [read.regexScripts] });
    const refusedScripts = plan.flatMap((verdict, i) => ("refused" in verdict ? [clippedRefusal(read.regexScripts[i]?.name ?? "", verdict.refused)] : []));
    return {
      ok: true,
      format: read.format,
      name: clipImportText(read.name),
      inLibrary: answer.reuse === "library",
      sectionCount: read.sectionCount,
      enabledCount: read.enabledCount,
      samplerCount: read.samplerCount,
      limitCount: read.limitCount,
      leftOut: read.leftOut,
      clamped: read.clamped,
      regexScripts: read.regexScripts.length - refusedScripts.length,
      refusedScripts,
      // A reused preset already holds the sections, so the run adds none.
      addedSections: answer.reuse === "library" ? [] : read.addedSections,
    };
  }

  async function importFile(params: ImportPresetFileParams): Promise<PresetImportOutcome> {
    const read = readPresetFile(params);
    if (!read.ok) {
      return read;
    }
    const landed = soleResult(await deps.importPresets({ ownerId: params.userId, files: [read.bytes], dryRun: false, signal: NEVER_ABORTED }));
    const outcome = landed.ok && landed.created === true && read.addedSections.length > 0 ? { ...landed, addedSections: read.addedSections } : landed;
    // A reused equal preset takes the scripts too: the lift reuses equal script rows and its attach is idempotent,
    // so a second import of one file writes nothing.
    if (!outcome.ok || outcome.presetId === undefined || read.regexScripts.length === 0) {
      return outcome;
    }
    const regexScripts = await deps.importPresetScripts({ ownerId: params.userId, presetId: outcome.presetId, scripts: read.regexScripts });
    // The lift writes the regex library and the preset's attachments without an event of its own.
    deps.emitUserEvent(params.userId, { type: "regexChanged" });
    return { ...outcome, regexScripts: { ...regexScripts, refused: regexScripts.refused.map(({ name, reason }) => clippedRefusal(name, reason)) } };
  }

  return { importFile, previewFile };
}
