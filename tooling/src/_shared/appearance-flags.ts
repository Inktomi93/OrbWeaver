// CLI-facing Appearance vocabulary: JSON/profile parsing, accumulation, and the one shared help block.
// Kept beside the settings shim because four probe CLIs consume it, but split from appearance.ts so the
// browser interception door retains headroom and does not become a parser/help monolith.

import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { AppearancePatch } from "./appearance.ts";
import { mergeAppearancePatches } from "./appearance.ts";
import { isPlainObject } from "./page-validate.ts";

/** Parse outcome: a patch, or a stated reason (the caller turns it into an ARG ERROR — EXIT.misuse). */
export type AppearanceParse = { readonly patch: AppearancePatch } | { readonly error: string };

/** `--full-motion` is exactly this patch — the flag a motion sweep actually types. */
export const FULL_MOTION_PATCH: AppearancePatch = { reducedMotion: false };

/** THE curated appearance points (`--appearance-preset <name>`), committed beside the probes so a sweep
 *  names a profile instead of pasting JSON. One home: new coverage is a new PROFILE there, never a new flag.
 *  Read eagerly at parse time so an unknown/broken profile is CLI misuse (EXIT.misuse), not a mid-run surprise. */
const PRESETS_PATH = new URL("./appearance-presets.json", import.meta.url);

interface PresetFile {
  readonly presets?: Record<string, { readonly why?: string; readonly appearance?: unknown }>;
}

/** Refuse keys the shared schema strips and values its `.catch()` clauses would silently replace. A
 * probe arm is evidence about the requested value, so schema self-healing here would be a false receipt.
 *
 * `safeParse`, not `.parse` (#1509): this function's whole contract is the `{ error }` shape its callers
 * turn into an ARG ERROR at EXIT.misuse, and neither caller catches — a throw here would leave a raw
 * ZodError as the CLI's last word. Measured on the tree, the schema is total for every plain object (every
 * leaf carries a `.catch`), so the throwing arm is reachable only for a NON-object; both current callers
 * guard with `isPlainObject` first, which makes this a FENCE on the exported door rather than a live
 * defect fix — the function is exported, and the next caller does not inherit those guards. */
export function validateAppearancePatch(patch: AppearancePatch, source: string): AppearanceParse {
  const outcome = appearanceSettingsSchema.safeParse(patch);
  if (!outcome.success) {
    return { error: `${source} is not a readable appearance object: ${outcome.error.issues.map((issue) => issue.message).join("; ")}` };
  }
  const parsed = outcome.data as Readonly<Record<string, unknown>>;
  for (const [key, requested] of Object.entries(patch)) {
    if (!Object.hasOwn(parsed, key)) {
      return { error: `${source} contains unknown appearance key ${JSON.stringify(key)}` };
    }
    if (!isDeepStrictEqual(parsed[key], requested)) {
      return { error: `${source} contains invalid value for appearance key ${JSON.stringify(key)}: ${JSON.stringify(requested)}` };
    }
  }
  return { patch };
}

/** Null when the committed file is missing or unparseable — the caller turns that into an ARG ERROR naming
 *  the path, never a silent "no such preset" that blames the caller for a broken file. */
function readPresetFile(): PresetFile | null {
  // @orb-waive caught-failure-ownership(catch): appearance JSON parse returns null so the caller emits its option-specific refusal; no theme is applied. Ends if parse failure stops being a refusal.
  try {
    return JSON.parse(readFileSync(PRESETS_PATH, "utf8")) as PresetFile;
  } catch {
    return null;
  }
}

/** Every profile name, in file order — the list an ARG ERROR prints and `--help` echoes. */
export function appearancePresetNames(): readonly string[] {
  return Object.keys(readPresetFile()?.presets ?? {});
}

/** `--appearance-preset <name>` → its patch, or a stated reason naming the valid profiles. */
export function loadAppearancePreset(name: string): AppearanceParse {
  const file = readPresetFile();
  if (file === null) {
    return { error: "--appearance-preset could not read tooling/src/_shared/appearance-presets.json (missing or invalid JSON)" };
  }
  const presets = file.presets ?? {};
  const entry = presets[name];
  if (entry === undefined) {
    return { error: `--appearance-preset "${name}" is not a profile — valid: ${Object.keys(presets).join(", ")}` };
  }
  if (!isPlainObject(entry.appearance)) {
    return { error: `--appearance-preset "${name}" has no appearance object in tooling/src/_shared/appearance-presets.json` };
  }
  return validateAppearancePatch(entry.appearance, `--appearance-preset ${JSON.stringify(name)}`);
}

/** The value-taking appearance flags — every probe CLI adds these to its required-value scan. */
export const APPEARANCE_VALUE_FLAGS: readonly string[] = ["--appearance", "--appearance-preset"];

/** The one help block for the appearance axis, shared by all four probe CLIs so the axis warning cannot
 *  drift between them. Rendered with the house `Heading:` + two-space-indented flag list. */
export function appearanceHelpBlock(): string {
  return `Appearance (the APP's own settings, shimmed over the settings response and never written — a DIFFERENT
axis from --reduced-motion, which emulates the OS media query; they compose):
  --full-motion                 render with the app's reduce-motion setting OFF
  --appearance '<json>'         deep-merge any appearance keys, e.g. '{"density":"compact"}'
  --appearance-preset <name>    curated profile: ${appearancePresetNames().join(" | ")}
                                (tooling/src/_shared/appearance-presets.json is the ONE home for these —
                                new coverage is a new profile there, never a new flag; --appearance
                                composes OVER a preset). No flag = the account's real state.`;
}

/** Fold one appearance flag's outcome into a CLI's args — the patch accumulates (later keys win, so argv
 *  reads the way it behaves) and a stated reason becomes CLI misuse (EXIT.misuse). Shared by all four probes. */
export function applyAppearanceFlag(target: { appearance: AppearancePatch | null; errors: string[] }, parsed: AppearanceParse): void {
  if ("error" in parsed) {
    target.errors.push(parsed.error);
    return;
  }
  target.appearance = mergeAppearancePatches(target.appearance, parsed.patch);
}

/** `--appearance '<json>'` → a patch. A non-object is CLI misuse, not a silent no-op. */
export function parseAppearancePatch(raw: string): AppearanceParse {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    return { error: `--appearance expects a JSON object, got ${JSON.stringify(raw)} (${e instanceof Error ? e.message : String(e)})` };
  }
  if (!isPlainObject(value)) {
    return { error: `--appearance expects a JSON object, got ${JSON.stringify(raw)}` };
  }
  return validateAppearancePatch(value, "--appearance");
}
