// domain/import/substrate/preset — the ST PRESET-FILE parser: one `OpenAI Settings/<name>.json` (or the live
// `settings.json.oai_settings` blob) in → an orb-native `orb.preset` file out, plus the honest per-file list of
// the ST fields that found no orb seat. Pure: bytes/JSON in, data out, null on unparseable — never throws, so
// one bad preset is one skipped preset and never an aborted profile import.
//
// CHAT COMPLETION ONLY, BY OWNER RULING. ST ships four preset families; the other three
// (`TextGen Settings/`, `KoboldAI Settings/`, `NovelAI Settings/` and their `settings.json` twins
// `textgenerationwebui_settings`/`kai_settings`/`nai_settings`) are TEXT-COMPLETION presets, and orb has no
// text-completion mode to spend them in — the connection vocabulary has no such protocol arm
// (`ROUTING_ROLE_KEYS`/`PROVIDER_ROLES` are chat/embed/rerank/…; a whole-tree literal sweep for
// `v1/completions` returns zero). They stay reported-unhandled with that reason rather than importing as
// samplers on a room that will never run them.
//
// This module also owns NO ST→PromptConfig mapping of its own: the chat-completion mapper already exists and
// is shared with the client's single-file import dialog — `importStChatCompletionPreset` (@orb/contracts/preset).
// A second answer here would be the banned parallel path. What IS owned here: the family's file/section
// locations, the preset NAME rule, and the never-throw envelope.
//
// Preset names are QUALIFIED (`Marinara's Spaghetti Recipe (OpenAI)`) because the preset import verb is
// idempotent on (ownerId, name) and MERGES a same-named preset in place. ST ships a preset literally called
// `Default.json`; an unqualified import would silently overwrite an owner's own preset of that name with
// SillyTavern's, which is the one thing a whole-profile import must never do.

import { buildPresetFile, tryImportStChatCompletionPreset } from "@orb/contracts/preset";
import type { RegexScriptCard } from "@orb/contracts/regex";
import { regexScriptCardSchema } from "@orb/contracts/regex";
import { isPlainObject } from "@orb/kit/guards";
import type { ParsedStPreset } from "../contract/views.ts";
import { ST_POWER_USER_KEY } from "./appearance.ts";

/** The ST profile SUBDIRECTORY holding the chat-completion family's saved presets. */
export const ST_PRESET_DIR = "OpenAI Settings";
/** The `settings.json` section holding the family's LIVE (selected + unsaved-edits) copy. */
export const ST_PRESET_SETTINGS_KEY = "oai_settings";
/** The name qualifier — see the module header for why every imported preset carries one. */
const FAMILY_LABEL = "OpenAI";

/** The qualified preset name for a SAVED `OpenAI Settings/<stem>.json` (ST preset files carry no internal
 *  name — the same rule `parseStWorldFile` follows for books). */
export function stPresetName(stem: string): string {
  return `${stem} (${FAMILY_LABEL})`;
}

/** The preset name for the LIVE `settings.json` blob. Measured against the real corpus, `oai_settings` matches
 *  the selected preset FILE on 90 of 95 shared keys — the differences are the author's UNSAVED tuning, so the
 *  blob imports rather than being dropped, under a name that can never merge onto a file preset. */
export const ST_ACTIVE_PRESET_NAME = `${FAMILY_LABEL} (active)`;

/** ST's presetManager stores EXTENSION FIELDS on the preset itself under `extensions` — the regex
 *  extension's preset-scoped scripts ride `extensions.regex_scripts` (SillyTavern
 *  `extensions/regex/engine.js:126` — `readPresetExtensionField({ path: 'regex_scripts' })`). Each candidate
 *  parses through the ONE ST card-wire schema (the numeric-placement/`scriptName` dialect included); an
 *  invalid candidate joins the preset's `unmapped` note rather than dropping silently — the exact silence
 *  this parser existed to end (measured: 15 real scripts on the corpus's Marinara preset, ignored). Any
 *  OTHER `extensions.*` key is reported unmapped by name (nothing under this key is ever silent again). */
function parsePresetExtensions(raw: Record<string, unknown>): {
  readonly regexScripts: RegexScriptCard[];
  readonly dropped: { field: string; reason: string }[];
} {
  const regexScripts: RegexScriptCard[] = [];
  const dropped: { field: string; reason: string }[] = [];
  const ext = raw["extensions"];
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
        dropped.push({ field: `extensions.regex_scripts[${i}]`, reason: "not a recognizable regex script (malformed — dropped)" });
      }
    }
  }
  for (const key of Object.keys(residue)) {
    dropped.push({ field: `extensions.${key}`, reason: "preset-scoped extension state — no orb seat" });
  }
  return { regexScripts, dropped };
}

/** Map an already-JSON-parsed ST chat-completion preset → the portable orb file + its unmapped-field list, or
 *  null when the object is not a recognizable chat-completion preset, OR when it maps to a config orb cannot
 *  store (#1363 — the mapper REFUSES rather than returning orb's default preset dressed as the import).
 *  Never throws: since #1580 the shared mapper ANSWERS both refusals as a typed outcome, so this reads the
 *  refusal instead of catching one. Both arms are the same `null` here — a BULK import has no door to render
 *  a per-file reason at (the operator gets the not-imported report) — but the two are now distinguishable if
 *  that report ever grows a per-file reason. A refused preset is reported as not-imported, never as
 *  imported-with-someone-else's-content.
 *
 *  `powerUser` is ST's GLOBAL `settings.json.power_user` blob — the OTHER half of what orb calls generation
 *  config (stop strings, the four post-process switches, the inline-reasoning tag pair). Supplied ONLY for the
 *  LIVE preset below; a saved preset FILE gets none, because those knobs are one box's current tuning and
 *  stamping them onto every saved preset would rewrite presets their author tuned for something else. */
export function stPresetFromJson(raw: unknown, name: string, powerUser?: unknown): ParsedStPreset | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  const outcome = tryImportStChatCompletionPreset(raw, powerUser);
  if (!outcome.ok) {
    return null;
  }
  const { regexScripts, dropped } = parsePresetExtensions(raw);
  return { name, file: buildPresetFile(name, outcome.result.config), unmapped: [...outcome.result.dropped, ...dropped], regexScripts };
}

/** Parse one saved `OpenAI Settings/<stem>.json` upload. Null on unparseable bytes / a non-preset object. */
export function parseStPresetFile(bytes: Uint8Array, stem: string): ParsedStPreset | null {
  let raw: unknown;
  // @orb-waive caught-failure-ownership(catch): pure `JSON.parse` over untrusted upload
  // bytes — documented above: "Null on unparseable bytes / a non-preset object."
  try {
    raw = JSON.parse(new TextDecoder("utf-8").decode(bytes));
  } catch {
    return null;
  }
  return stPresetFromJson(raw, stPresetName(stem));
}

/** The LIVE preset blob inside an already-parsed `settings.json`, or null when the section is absent or is not
 *  a recognizable preset — never a throw, never a fabricated preset. */
export function parseStSettingsPreset(settingsRaw: unknown): ParsedStPreset | null {
  if (!isPlainObject(settingsRaw)) {
    return null;
  }
  // THE LIVE preset is the carrier for the `power_user` generation knobs (owner ruling — gen
  // settings are preset-owned in orb, and ST's are split across `oai_settings` + the global `power_user`).
  // This preset is by definition the author's CURRENT tuning, which is exactly what `power_user` holds.
  return stPresetFromJson(settingsRaw[ST_PRESET_SETTINGS_KEY], ST_ACTIVE_PRESET_NAME, settingsRaw[ST_POWER_USER_KEY]);
}
