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
import { buildPresetFile, tryImportStChatCompletionPreset } from "@orb/contracts/preset";
import type { RegexScriptCard } from "@orb/contracts/regex";
import { regexScriptCardSchema } from "@orb/contracts/regex";
import { isPlainObject } from "@orb/kit/guards";

/** The preset's extension-field object, read here rather than by the shared mapper. */
const ST_PRESET_EXTENSIONS_KEY = "extensions";
/** The name a preset file may carry, which SillyTavern's own import ignores in favour of the file stem. */
const ST_PRESET_NAME_KEY = "name";

/** One SillyTavern preset mapped to orb's portable preset file. */
export interface ParsedStPreset {
  readonly name: string;
  /** Fed verbatim to the preset domain's `ImportPresets` op as UTF-8 JSON bytes. */
  readonly file: PresetFile;
  /** ST fields present with a meaningful value that orb has no seat for, a refused regex script included. */
  readonly unmapped: readonly StDroppedField[];
  /** The preset's own regex scripts, lifted onto the library and attached to the preset AFTER its row exists.
   *  Not part of the preset file: scripts are owner-library rows, never embedded config (D121-E). */
  readonly regexScripts: readonly RegexScriptCard[];
}

/** Why a SillyTavern preset did not map: `recognised: false` when the object is not a chat-completion preset at
 *  all, `true` when it is one that maps to a config orb cannot store. */
export type StPresetParse =
  | { readonly ok: true; readonly parsed: ParsedStPreset }
  | { readonly ok: false; readonly recognised: boolean; readonly reason: string };

/** ST's presetManager stores extension fields on the preset itself under `extensions`; the regex extension's
 *  preset-scoped scripts ride `extensions.regex_scripts` (SillyTavern `extensions/regex/engine.js:126`). Each
 *  candidate parses through the ONE ST card-wire schema; an invalid one joins `dropped` by position, and any other
 *  `extensions.*` key is reported by name. */
function parsePresetExtensions(raw: Record<string, unknown>): {
  readonly regexScripts: RegexScriptCard[];
  readonly dropped: StDroppedField[];
} {
  const regexScripts: RegexScriptCard[] = [];
  const dropped: StDroppedField[] = [];
  const ext = raw[ST_PRESET_EXTENSIONS_KEY];
  if (!isPlainObject(ext)) {
    return { regexScripts, dropped };
  }
  const { regex_scripts: rawScripts, ...residue } = ext;
  if (Array.isArray(rawScripts)) {
    for (const [i, candidate] of rawScripts.entries()) {
      const parsed = regexScriptCardSchema.safeParse(candidate);
      if (parsed.success) {
        regexScripts.push(parsed.data);
      } else {
        dropped.push({ field: `${ST_PRESET_EXTENSIONS_KEY}.regex_scripts[${i}]`, reason: "not a recognizable regex script (malformed — dropped)" });
      }
    }
  }
  for (const key of Object.keys(residue)) {
    dropped.push({ field: `${ST_PRESET_EXTENSIONS_KEY}.${key}`, reason: "preset-scoped extension state — no orb seat" });
  }
  return { regexScripts, dropped };
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
  const { regexScripts, dropped } = parsePresetExtensions(raw);
  return {
    ok: true,
    parsed: {
      name: options.name,
      file: buildPresetFile(options.name, outcome.result.config),
      unmapped: [...outcome.result.dropped, ...dropped],
      regexScripts,
    },
  };
}
