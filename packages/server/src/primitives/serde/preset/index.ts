// The one parse of a SillyTavern chat-completion preset: an already-JSON-parsed preset in, the orb-native
// `orb.preset` file out, with the preset's own regex scripts and every field that found no seat. Both preset
// doors call it, the profile folder's collector and the Presets page's single file (D290). Pure: never throws, so
// one bad preset is one refused preset.
//
// The ST to PromptConfig mapping is `tryImportStChatCompletionPreset` (@orb/contracts/preset); this module adds the
// preset's extension fields, which that mapper leaves to its caller, and takes the preset's name from the caller.
//
// The NAME is the caller's, read from the file name: SillyTavern names an imported preset by its file stem and
// never reads the `name` a preset file may carry, so that field is handled here and reported nowhere.

import type { PresetFile, StDroppedField } from "@orb/contracts/preset";
import { buildPresetFile, ST_PRESET_SCRIPT_LIST_FIELD, tryImportStChatCompletionPreset } from "@orb/contracts/preset";
import type { RegexScriptCard, RegexScriptRefusal } from "@orb/contracts/regex";
import { isPlainObject } from "@orb/kit/guards";
import { readStScriptList } from "#primitives/serde/regex";

/** The preset's extension-field object, read here rather than by the shared mapper. */
const ST_PRESET_EXTENSIONS_KEY = "extensions";
/** The name a preset file may carry, which SillyTavern's own import ignores in favour of the file stem. */
const ST_PRESET_NAME_KEY = "name";

/** One SillyTavern preset mapped to orb's portable preset file. */
export interface ParsedStPreset {
  readonly name: string;
  /** Fed verbatim to the preset domain's `ImportPresets` op as UTF-8 JSON bytes. */
  readonly file: PresetFile;
  /** ST fields present with a meaningful value that orb has no seat for, and what a kept script lost on the way in. */
  readonly unmapped: readonly StDroppedField[];
  /** The preset's own regex scripts, lifted onto the library and attached to the preset AFTER its row exists.
   *  Not part of the preset file: scripts are owner-library rows, never embedded config (D121-E). */
  readonly regexScripts: readonly RegexScriptCard[];
  /** The preset's scripts the parse refused, by name, in the file's order: every door lists them among the preset's
   *  scripts. */
  readonly refusedScripts: readonly RegexScriptRefusal[];
  /** The names of the sections added for orb's own slots, which the file has no prompt for. */
  readonly addedSections: readonly string[];
}

/** Why a SillyTavern preset did not map: `recognised: false` when the object is not a chat-completion preset at
 *  all, `true` when it is one that maps to a config orb cannot store. */
export type StPresetParse =
  | { readonly ok: true; readonly parsed: ParsedStPreset }
  | { readonly ok: false; readonly recognised: boolean; readonly reason: string };

/** ST's presetManager stores extension fields on the preset itself under `extensions`; the regex extension's
 *  preset-scoped scripts ride `extensions.regex_scripts` (SillyTavern `extensions/regex/engine.js:126`), read by the
 *  shared script-list reader, which names each refused script and what a kept one lost, by position. Any other
 *  `extensions.*` key is reported by name. */
function parsePresetExtensions(raw: Record<string, unknown>): {
  readonly regexScripts: RegexScriptCard[];
  readonly refusedScripts: RegexScriptRefusal[];
  readonly dropped: StDroppedField[];
} {
  const ext = raw[ST_PRESET_EXTENSIONS_KEY];
  if (!isPlainObject(ext)) {
    return { regexScripts: [], refusedScripts: [], dropped: [] };
  }
  const { regex_scripts: rawScripts, ...residue } = ext;
  const read = readStScriptList(Array.isArray(rawScripts) ? rawScripts : [], ST_PRESET_SCRIPT_LIST_FIELD, "scoped");
  const dropped: StDroppedField[] = [...read.notes];
  for (const key of Object.keys(residue)) {
    dropped.push({
      field: `${ST_PRESET_EXTENSIONS_KEY}.${key}`,
      reason: "Extension data saved with this preset. This app does not use it, so it was not imported.",
    });
  }
  return { regexScripts: read.scripts, refusedScripts: read.refused.map(({ name, reason }) => ({ name, reason })), dropped };
}

/** The field an orbweaver preset file carries its attached scripts in (`PresetFile.regexScripts`). */
const PRESET_FILE_SCRIPTS_FIELD = "regexScripts";

/** The scripts an already-JSON-parsed orbweaver preset file carries, read as every SillyTavern script list is: those
 *  that parsed and each one refused, by name. Undefined for a file with no script list, which an export wrote before
 *  it carried one. */
export function readPresetFileScripts(
  raw: unknown,
): { readonly scripts: readonly RegexScriptCard[]; readonly refused: readonly RegexScriptRefusal[] } | undefined {
  const list = isPlainObject(raw) ? raw[PRESET_FILE_SCRIPTS_FIELD] : undefined;
  if (!Array.isArray(list)) {
    return undefined;
  }
  const read = readStScriptList(list, PRESET_FILE_SCRIPTS_FIELD, "scoped");
  return { scripts: read.scripts, refused: read.refused.map(({ name, reason }) => ({ name, reason })) };
}

/** Map an already-JSON-parsed SillyTavern chat-completion preset, or say why it does not map.
 *
 *  `powerUser` is ST's global `settings.json.power_user` blob, the other half of what orb calls generation config.
 *  Only the live `oai_settings` preset takes it: a saved preset file is one author's tuning, and stamping one box's
 *  current knobs onto it would rewrite it. */
export function parseStPresetJson(raw: unknown, options: { readonly name: string; readonly powerUser?: unknown }): StPresetParse {
  if (!isPlainObject(raw)) {
    return { ok: false, recognised: false, reason: "Not a SillyTavern Chat Completion preset (not a JSON object)." };
  }
  const outcome = tryImportStChatCompletionPreset(raw, {
    powerUser: options.powerUser,
    handledFields: [ST_PRESET_EXTENSIONS_KEY, ST_PRESET_NAME_KEY],
  });
  if (!outcome.ok) {
    return outcome;
  }
  const { regexScripts, refusedScripts, dropped } = parsePresetExtensions(raw);
  return {
    ok: true,
    parsed: {
      name: options.name,
      file: buildPresetFile(options.name, outcome.result.config),
      unmapped: [...outcome.result.dropped, ...dropped],
      regexScripts,
      refusedScripts,
      addedSections: outcome.result.addedSections,
    },
  };
}
