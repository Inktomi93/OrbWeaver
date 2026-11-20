// domain/import/substrate/preset — where a SillyTavern profile keeps its presets: one `OpenAI Settings/<name>.json`
// (or the live `settings.json.oai_settings` blob) in, the shared parse's preset out. Pure, null on unparseable —
// never throws, so one bad preset is one skipped preset and never an aborted profile import.
//
// CHAT COMPLETION ONLY, BY OWNER RULING. ST ships four preset families; the other three
// (`TextGen Settings/`, `KoboldAI Settings/`, `NovelAI Settings/` and their `settings.json` twins
// `textgenerationwebui_settings`/`kai_settings`/`nai_settings`) are TEXT-COMPLETION presets, and orb has no
// text-completion mode to spend them in — the connection vocabulary has no such protocol arm
// (`ROUTING_ROLE_KEYS`/`PROVIDER_ROLES` are chat/embed/rerank/…; a whole-tree literal sweep for
// `v1/completions` returns zero). They stay reported-unhandled with that reason rather than importing as
// samplers on a room that will never run them.
//
// The ST preset parse itself is `parseStPresetJson` (#primitives/serde/preset), shared with the Presets page's
// single-file door. What IS owned here: the family's file/section locations and the folder's preset NAME rule.
//
// Preset names are QUALIFIED (`Marinara's Spaghetti Recipe (OpenAI)`) because the preset import verb is
// additive (D290: an equal preset is reused, a different same-named one lands under a numbered name). ST ships a
// preset literally called `Default.json`; qualifying the name keeps SillyTavern's apart from an owner's own
// preset of that name instead of numbering it "Default 2".

import { isPlainObject } from "@orb/kit/guards";
import { parseJsonText } from "@orb/kit/json";
import type { ParsedStPreset } from "#primitives/serde/preset";
import { parseStPresetJson } from "#primitives/serde/preset";
import { ST_POWER_USER_KEY } from "./appearance.ts";

/** The ST profile SUBDIRECTORY holding the chat-completion family's saved presets. */
export const ST_PRESET_DIR = "OpenAI Settings";
/** The `settings.json` section holding the family's LIVE (selected + unsaved-edits) copy. */
export const ST_PRESET_SETTINGS_KEY = "oai_settings";
/** The name qualifier — see the module header for why every imported preset carries one. */
const FAMILY_LABEL = "OpenAI";

/** The qualified preset name for a SAVED `OpenAI Settings/<stem>.json`: SillyTavern names a preset by its file
 *  stem, the same rule `parseStWorldFile` follows for books. */
function stPresetName(stem: string): string {
  return `${stem} (${FAMILY_LABEL})`;
}

/** The preset name for the LIVE `settings.json` blob. Measured against the real corpus, `oai_settings` matches
 *  the selected preset FILE on 90 of 95 shared keys — the differences are the author's UNSAVED tuning, so the
 *  blob imports rather than being dropped, under a name that can never merge onto a file preset. */
const ST_ACTIVE_PRESET_NAME = `${FAMILY_LABEL} (active)`;

// Both folder arms answer a refusal as `null`: the collector records it as unreadable, and a bulk import has no
// door to render a per-file reason at.
function stPresetFromJson(raw: unknown, name: string, powerUser?: unknown): ParsedStPreset | null {
  const outcome = parseStPresetJson(raw, { name, powerUser });
  return outcome.ok ? outcome.parsed : null;
}

/** Parse one saved `OpenAI Settings/<stem>.json` upload. Null on unparseable bytes / a non-preset object. */
export function parseStPresetFile(bytes: Uint8Array, stem: string): ParsedStPreset | null {
  // `collectPresetDir` records the `null` as one of the report's `unreadablePresets`.
  const raw = parseJsonText(new TextDecoder("utf-8").decode(bytes));
  return raw === undefined ? null : stPresetFromJson(raw, stPresetName(stem));
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
