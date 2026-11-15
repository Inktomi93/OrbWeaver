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
import type { ImportPresets, PresetFilePreview, PresetImportFile, PresetImportOutcome, PromptConfig } from "@orb/contracts/preset";
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

// The serde's unmapped-field reasons are written for the profile folder's report and name this app's internals. This
// door says the same facts in plain words. A refused regex script's reason already names its script and its limit.
const NO_EQUIVALENT = "This app has no equivalent.";
const REFUSED_SCRIPT_FIELD = /^extensions\.regex_scripts\[/u;
const PLAIN_REASONS: Readonly<Record<string, string>> = {
  ["group_nudge_prompt"]: "Group nudges are set per chat here, not in a preset.",
  ["new_group_chat_prompt"]: "There is one start-of-chat line here, taken from the new chat prompt, so a group-only one has no place.",
  ["new_example_chat_prompt"]: "There is no example-chat line here.",
  ["bias_preset_selected"]: "There are no saved logit bias presets here.",
  ["assistant_prefill"]: "Response prefill isn't supported across providers.",
  ["assistant_impersonation"]: "There is no impersonation prefill here.",
  ["wrap_in_quotes"]: "There is no quote-wrapping setting here.",
  ["function_calling"]: "Chat presets don't switch tool calling on.",
  ["enable_web_search"]: "There is no web-search setting here.",
};

type LeftOut = Extract<PresetFilePreview, { ok: true }>["leftOut"][number];

function plainLeftOut({ field, reason }: LeftOut): LeftOut {
  return { field: clipImportText(field), reason: REFUSED_SCRIPT_FIELD.test(field) ? reason : (PLAIN_REASONS[field] ?? NO_EQUIVALENT) };
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
      /** The batch file: a SillyTavern preset carries the scripts its lift attaches; an orbweaver file carries none. */
      readonly file: PresetImportFile;
      readonly name: string;
      readonly leftOut: Extract<PresetFilePreview, { ok: true }>["leftOut"];
      readonly clamped: Extract<PresetFilePreview, { ok: true }>["clamped"];
      readonly regexScripts: readonly RegexScriptCard[];
      /** The scripts the parse refused, by name; the lift's own refusals join them. */
      readonly refusedScripts: readonly RegexScriptRefusal[];
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
    const file = { bytes: new TextEncoder().encode(fileText) };
    return {
      ok: true,
      format: "orbweaver",
      file,
      name: orb.name,
      ...configCounts(orb.config),
      leftOut: [],
      clamped: [],
      regexScripts: [],
      refusedScripts: [],
      addedSections: [],
    };
  }
  const st = parseStPresetJson(raw, { name: stemOf(fileName) });
  if (!st.ok) {
    return { ok: false, error: stRefusal(st.recognised, st.reason) };
  }
  const { name, file, unmapped, regexScripts, refusedScripts, addedSections } = st.parsed;
  return {
    ok: true,
    format: "sillyTavern",
    file: { bytes: new TextEncoder().encode(JSON.stringify(file)), regexScripts },
    name,
    ...configCounts(file.config),
    // A value brought into range was imported, so it is reported as changed and never as left out.
    leftOut: unmapped.filter(({ clamped }) => clamped === undefined).map(plainLeftOut),
    clamped: unmapped.flatMap(({ field, clamped }) => (clamped === undefined ? [] : [{ field: clipImportText(field), ...clamped }])),
    regexScripts,
    refusedScripts,
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
    const answer = soleResult(await deps.importPresets({ ownerId: params.userId, files: [read.file], dryRun: true, signal: NEVER_ABORTED }));
    const [plan = []] = await deps.planPresetScripts({ ownerId: params.userId, presets: [read.regexScripts] });
    const liftRefused = plan.flatMap((verdict, i) => ("refused" in verdict ? [clippedRefusal(read.regexScripts[i]?.name ?? "", verdict.refused)] : []));
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
      regexScripts: read.regexScripts.length - liftRefused.length,
      refusedScripts: [...liftRefused, ...read.refusedScripts.map(({ name, reason }) => clippedRefusal(name, reason))],
      // A reused preset already holds the sections, so the run adds none.
      addedSections: answer.reuse === "library" ? [] : read.addedSections,
    };
  }

  async function importFile(params: ImportPresetFileParams): Promise<PresetImportOutcome> {
    const read = readPresetFile(params);
    if (!read.ok) {
      return read;
    }
    const landed = soleResult(await deps.importPresets({ ownerId: params.userId, files: [read.file], dryRun: false, signal: NEVER_ABORTED }));
    const outcome = landed.ok && landed.created === true && read.addedSections.length > 0 ? { ...landed, addedSections: read.addedSections } : landed;
    if (!outcome.ok || outcome.presetId === undefined || read.regexScripts.length + read.refusedScripts.length === 0) {
      return outcome;
    }
    // A reused equal preset takes the scripts too: the lift reuses equal script rows and its attach is idempotent,
    // so a second import of one file writes nothing.
    const lifted =
      read.regexScripts.length === 0
        ? { created: 0, reused: 0, refused: [] }
        : await deps.importPresetScripts({ ownerId: params.userId, presetId: outcome.presetId, scripts: read.regexScripts });
    if (read.regexScripts.length > 0) {
      // The lift writes the regex library and the preset's attachments without an event of its own.
      deps.emitUserEvent(params.userId, { type: "regexChanged" });
    }
    const refused = [...lifted.refused, ...read.refusedScripts].map(({ name, reason }) => clippedRefusal(name, reason));
    return { ...outcome, regexScripts: { ...lifted, refused } };
  }

  return { importFile, previewFile };
}
