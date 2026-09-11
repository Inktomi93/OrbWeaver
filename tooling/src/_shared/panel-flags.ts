// CLI-facing PANEL-STATE vocabulary: the `--panels <preset>` axis, its JSON home, and the one shared help
// block. Sibling of appearance-flags.ts and shaped exactly like it — kept beside nav.ts (the bridge driver)
// rather than inside it because nav.ts's job is "one verb → one bridge call" and this file's job is "one
// preset name → the ordered verbs that reach a named configuration". Splitting them keeps nav.ts a decoder.
//
// WHY THE AXIS EXISTS (#148 item 3): --panel/--focus made the shell's panel layout DRIVABLE, but a run with
// no panel flags still occupies whichever configuration the account happened to be left in — so two runs of
// the same probe measured two different surfaces and neither said so. A preset lets a run OCCUPY a named
// configuration. It adds no mechanism: a preset expands into the same `--panel`/`--focus` nav actions, in
// the ONE argv-ordered queue, AT THE FLAG'S OWN POSITION — `--goto config --panels focus` and
// `--panels focus --goto config` therefore mean what they read as, and an explicit `--panel`/`--focus`
// written AFTER a preset composes over it (last write to a pane wins), the same way `--appearance` composes
// over `--appearance-preset`.

import { readFileSync } from "node:fs";
import type { NavMethod } from "./nav.ts";

/** One expanded action: the exact `{method, target}` pair every probe's nav queue carries. Each CLI maps it
 *  into its own action shape (design-audit/motion-audit/cpu-profile take it verbatim; snap adds its page
 *  index), so the shared home never owns a probe's queue type. */
export interface PanelPresetAction {
  readonly method: NavMethod;
  readonly target: string;
}

/** Parse outcome: the ordered actions, or a stated reason (the caller turns it into an ARG ERROR — EXIT.misuse). */
export type PanelPresetParse = { readonly actions: readonly PanelPresetAction[] } | { readonly error: string };

/** THE curated panel configurations (`--panels <name>`), committed beside the probes so a sweep names a
 *  configuration instead of chaining three flags. One home: new coverage is a new PROFILE there, never a new
 *  flag. Read eagerly at parse time so an unknown/broken profile is CLI misuse, not a mid-run surprise. */
const PRESETS_PATH = new URL("./panel-presets.json", import.meta.url);

/** The only verbs a panel preset may expand into. `goto`/`open-chat`/… are deliberately excluded: a "panel"
 *  preset that could navigate would silently move the surface the run claims to be measuring. */
const PRESET_METHODS: readonly NavMethod[] = ["panel", "focus"];

interface PresetFile {
  readonly presets?: Record<string, { readonly why?: string; readonly nav?: unknown }>;
}

/** Null when the committed file is missing or unparseable — the caller turns that into an ARG ERROR naming
 *  the path, never a silent "no such preset" that blames the caller for a broken file. */
function readPresetFile(): PresetFile | null {
  // @orb-waive caught-failure-ownership(catch): panel-preset JSON parse returns null so the caller emits its option-specific refusal; no nav action is queued. Ends if parse failure stops being a refusal.
  try {
    return JSON.parse(readFileSync(PRESETS_PATH, "utf8")) as PresetFile;
  } catch {
    return null;
  }
}

/** Every profile name, in file order — the list an ARG ERROR prints and `--help` echoes. */
export function panelPresetNames(): readonly string[] {
  return Object.keys(readPresetFile()?.presets ?? {});
}

/** Validate ONE committed row into its action. The vocabulary of panel NAMES and MODES is not re-homed here
 *  (packages/client/src/agent-nav/panel-request.ts owns it and refuses loudly on an unknown one); what is
 *  checked is the SHAPE the flags themselves check — `<name>=<mode>` with both halves present, and a bare
 *  `on|off` for focus — so a malformed committed row is misuse at parse time rather than a mid-run refusal. */
function readPresetAction(name: string, raw: unknown): PanelPresetAction | string {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return `--panels "${name}" has a nav entry that is not an object in tooling/src/_shared/panel-presets.json`;
  }
  const { method, target } = raw as { method?: unknown; target?: unknown };
  if (typeof method !== "string" || !(PRESET_METHODS as readonly string[]).includes(method)) {
    return `--panels "${name}" names method ${JSON.stringify(method)} — a panel preset expands only into: ${PRESET_METHODS.join(", ")}`;
  }
  if (typeof target !== "string") {
    return `--panels "${name}" has a ${method} entry with no string target in tooling/src/_shared/panel-presets.json`;
  }
  if (method === "focus" && target !== "on" && target !== "off") {
    return `--panels "${name}" has a focus entry of ${JSON.stringify(target)} — expected on|off`;
  }
  const eq = target.lastIndexOf("=");
  if (method === "panel" && (eq <= 0 || eq === target.length - 1)) {
    return `--panels "${name}" has a panel entry of ${JSON.stringify(target)} — expected name=mode`;
  }
  return { method: method as NavMethod, target };
}

/** `--panels <name>` → its ordered nav actions, or a stated reason naming the valid profiles. */
export function loadPanelPreset(name: string): PanelPresetParse {
  const file = readPresetFile();
  if (file === null) {
    return { error: "--panels could not read tooling/src/_shared/panel-presets.json (missing or invalid JSON)" };
  }
  const presets = file.presets ?? {};
  const entry = presets[name];
  if (entry === undefined) {
    return { error: `--panels "${name}" is not a profile — valid: ${Object.keys(presets).join(", ")}` };
  }
  if (!Array.isArray(entry.nav) || entry.nav.length === 0) {
    return { error: `--panels "${name}" has no nav array in tooling/src/_shared/panel-presets.json` };
  }
  const actions: PanelPresetAction[] = [];
  for (const raw of entry.nav) {
    const action = readPresetAction(name, raw);
    if (typeof action === "string") {
      return { error: action };
    }
    actions.push(action);
  }
  return { actions };
}

/** The value-taking panel flags — every probe CLI adds these to its required-value scan. */
export const PANEL_PRESET_VALUE_FLAGS: readonly string[] = ["--panels"];

/** Fold one `--panels` outcome into a CLI's argv-ordered queue: the actions are appended AT THE CALL SITE'S
 *  position (so a preset behaves like the flags it expands into) and a stated reason becomes CLI misuse.
 *  Takes an `enqueue` callback and the error list rather than an args object because the four probes spell
 *  their queue differently (`actions` / `reach` / a local `steps`) and snap wraps each action with a page
 *  index — the shared home stays out of every probe's action type. */
export function applyPanelPresetFlag(parsed: PanelPresetParse, errors: string[], enqueue: (action: PanelPresetAction) => void): void {
  if ("error" in parsed) {
    errors.push(parsed.error);
    return;
  }
  for (const action of parsed.actions) {
    enqueue(action);
  }
}

/** The one help block for the panel-state axis, shared by the probe CLIs so the axis cannot drift between
 *  them. Rendered with the house `Heading:` + two-space-indented flag list. */
export function panelPresetHelpBlock(): string {
  return `Panel state (the shell's own layout, driven through the dev nav bridge — NOT a viewport axis):
  --panels <name>               named configuration: ${panelPresetNames().join(" | ")}
                                (tooling/src/_shared/panel-presets.json is the ONE home for these — new
                                coverage is a new profile there, never a new flag). A preset expands into
                                the SAME --panel/--focus actions at ITS OWN argv position, so a --panel /
                                --focus written AFTER it composes over it (last write to a pane wins) and
                                one written before it is what the preset overwrites. A profile naming a pane
                                the active section does not declare REFUSES loudly (nav error, exit 1) —
                                it never half-applies. No flag = whatever layout the account was left in.`;
}
