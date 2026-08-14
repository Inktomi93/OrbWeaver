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

import { buildPresetFile, importStChatCompletionPreset } from "@orb/contracts/preset";
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

/** Map an already-JSON-parsed ST chat-completion preset → the portable orb file + its unmapped-field list, or
 *  null when the object is not a recognizable chat-completion preset. Never throws (the shared mapper DOES
 *  throw on a non-preset, which is contained here).
 *
 *  `powerUser` is ST's GLOBAL `settings.json.power_user` blob — the OTHER half of what orb calls generation
 *  config (stop strings, the four post-process switches, the inline-reasoning tag pair). Supplied ONLY for the
 *  LIVE preset below; a saved preset FILE gets none, because those knobs are one box's current tuning and
 *  stamping them onto every saved preset would rewrite presets their author tuned for something else. */
export function stPresetFromJson(raw: unknown, name: string, powerUser?: unknown): ParsedStPreset | null {
  if (!isPlainObject(raw)) {
    return null;
  }
  try {
    const result = importStChatCompletionPreset(raw, powerUser);
    return { name, file: buildPresetFile(name, result.config), unmapped: result.dropped };
  } catch {
    return null;
  }
}

/** Parse one saved `OpenAI Settings/<stem>.json` upload. Null on unparseable bytes / a non-preset object. */
export function parseStPresetFile(bytes: Uint8Array, stem: string): ParsedStPreset | null {
  let raw: unknown;
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
