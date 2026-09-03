// Argv parse for cpu-profile — the strict-CLI posture (an unknown flag is a hard EXIT.misuse: a
// typo'd step silently meters the landing page and reports it clean).

import { mergeAppearancePatches } from "@orb/tooling/_shared/appearance";
import {
  APPEARANCE_VALUE_FLAGS,
  applyAppearanceFlag,
  FULL_MOTION_PATCH,
  loadAppearancePreset,
  parseAppearancePatch,
} from "@orb/tooling/_shared/appearance-flags";
import type { Viewport } from "@orb/tooling/_shared/argv";
import { parseViewport, splitLastEq } from "@orb/tooling/_shared/argv";
import { DEFAULT_BASE } from "@orb/tooling/_shared/browser";
import { aliasRefusal, HELP_FLAGS, SESSION_FLAG } from "@orb/tooling/_shared/instrument-argv";
import { NAV_FLAG_METHOD, NAV_FLAGS } from "@orb/tooling/_shared/nav";
import { applyPanelPresetFlag, loadPanelPreset, PANEL_PRESET_VALUE_FLAGS } from "@orb/tooling/_shared/panel-flags";
import { applyThemeFlag, parseThemeFlag, THEME_VALUE_FLAGS } from "@orb/tooling/_shared/theme";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { DEFAULT_SETTLE_MS } from "../contract/defaults.ts";
import type { Args, Step } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm perf-meter");

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
const DEFAULT_PAUSE_MS = 600;
const DEFAULT_WHEEL_DY = 400;
const DEFAULT_WHEELBURST_DY = 400;
const DEFAULT_WHEELBURST_COUNT = 10;

/** The wheel-family flags (--wheel/--wheelburst) split out of parseStepFlag purely to keep its
 *  cognitive-complexity under the biome cap — same `sel=dy[:n]` LAST-`=` idiom either way. */
function parseWheelFlag(flag: string, rest: string[], steps: Step[]): boolean {
  if (flag === "--wheel") {
    const { head, tail } = splitLastEq(rest.shift() ?? "");
    steps.push({
      kind: "wheel",
      selector: head,
      dy: tail === "" ? DEFAULT_WHEEL_DY : Number(tail),
    });
    return true;
  }
  if (flag === "--wheelburst") {
    // sel=dy:n
    const { head, tail } = splitLastEq(rest.shift() ?? "");
    const [dyRaw, nRaw] = tail.split(":");
    steps.push({
      kind: "wheelburst",
      selector: head,
      dy: dyRaw === undefined || dyRaw === "" ? DEFAULT_WHEELBURST_DY : Number(dyRaw),
      count: nRaw === undefined || nRaw === "" ? DEFAULT_WHEELBURST_COUNT : Number(nRaw),
    });
    return true;
  }
  return false;
}

/** The step-producing flags. Returns false when `flag` isn't one of them. */
function parseStepFlag(flag: string, rest: string[], steps: Step[]): boolean {
  const navMethod = NAV_FLAG_METHOD[flag];
  if (navMethod !== undefined) {
    steps.push({ kind: "nav", method: navMethod, target: rest.shift() ?? "" });
    return true;
  }
  if (flag === "--pause") {
    steps.push({ kind: "pause", ms: Number(rest.shift() ?? String(DEFAULT_PAUSE_MS)) });
    return true;
  }
  if (flag === "--click" || flag === "--jsclick" || flag === "--hover") {
    steps.push({
      kind: flag.slice(2) as "click" | "jsclick" | "hover",
      selector: rest.shift() ?? "",
    });
    return true;
  }
  if (flag === "--fill") {
    // LAST `=` split — selectors contain `=`, values rarely do (_shared/argv.ts).
    const { head, tail } = splitLastEq(rest.shift() ?? "");
    steps.push({ kind: "fill", selector: head, value: tail });
    return true;
  }
  return parseWheelFlag(flag, rest, steps);
}

/** `--panels <preset>` — its own arm (the step flags above take only the tape, and a preset also owes a
 *  stated reason to `args.errors`). The actions land on the tape AT THIS ARGV POSITION, so a preset behaves
 *  exactly like the --panel/--focus steps it expands into (_shared/panel-flags.ts). */
function parsePanelPresetFlag(flag: string, rest: string[], args: Args): boolean {
  if (flag !== "--panels") {
    return false;
  }
  applyPanelPresetFlag(loadPanelPreset(rest.shift() ?? ""), args.errors, (action) => {
    args.steps.push({ kind: "nav", ...action });
  });
  return true;
}

/** The appearance-shim flags — its own arm (not folded into parseScalarFlag) so that function stays under
 *  the cognitive-complexity cap, and so the axis has one visible home in each probe's parser. */
function parseAppearanceFlag(flag: string, rest: string[], args: Args): boolean {
  if (flag === "--appearance") {
    applyAppearanceFlag(args, parseAppearancePatch(rest.shift() ?? ""));
    return true;
  }
  if (flag === "--appearance-preset") {
    applyAppearanceFlag(args, loadAppearancePreset(rest.shift() ?? ""));
    return true;
  }
  if (flag === "--full-motion") {
    args.appearance = mergeAppearancePatches(args.appearance, FULL_MOTION_PATCH);
    return true;
  }
  if (flag === "--theme") {
    applyThemeFlag(args, parseThemeFlag(rest.shift() ?? ""));
    return true;
  }
  return false;
}

function parseScalarFlag(flag: string, rest: string[], args: Args): boolean {
  if (flag === "--base") {
    args.base = rest.shift() ?? DEFAULT_BASE;
    return true;
  }
  if (flag === "--out") {
    args.out = rest.shift() ?? args.out;
    return true;
  }
  if (flag === "--settle") {
    args.settleMs = Number(rest.shift() ?? String(DEFAULT_SETTLE_MS));
    return true;
  }
  if (flag === "--viewport") {
    args.viewport = parseViewport(rest.shift() ?? "") ?? args.viewport;
    return true;
  }
  if (flag === "--cycles") {
    args.cycles = Math.max(1, Number(rest.shift() ?? "1"));
    return true;
  }
  if (flag === "--cpuprofile") {
    args.cpuProfile = true;
    return true;
  }
  // #1285: attach to a live snap session's browser (docs/design/1208-instrument-substrate.md §3.4)
  // instead of launching a fresh one — the shared WHERE_FLAGS spelling (_shared/instrument-argv.ts).
  if (flag === SESSION_FLAG) {
    args.session = rest.shift() ?? null;
    return true;
  }
  // HELP_FLAGS (§4.3, _shared/instrument-argv.ts): print PERF_METER_HELP and exit 0 — before this
  // family, --help was an unknown flag and exited 3 (measured 2 hits, design §1 P5).
  if (HELP_FLAGS.has(flag)) {
    args.help = true;
    return true;
  }
  return false;
}

// Every flag this CLI knows, and which of them consume the next token. Used ONLY by the misuse scan.
const VALUE_FLAGS = new Set([
  ...NAV_FLAGS,
  "--click",
  "--jsclick",
  "--hover",
  "--fill",
  "--wheel",
  "--wheelburst",
  "--pause",
  "--base",
  "--out",
  "--settle",
  "--viewport",
  "--cycles",
  SESSION_FLAG,
  ...PANEL_PRESET_VALUE_FLAGS,
  ...APPEARANCE_VALUE_FLAGS,
  ...THEME_VALUE_FLAGS,
]);
const BOOLEAN_FLAGS = new Set(["--cpuprofile", "--full-motion", ...HELP_FLAGS]);
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, ...BOOLEAN_FLAGS]);

/** Argv is scanned for misuse BEFORE a browser boots (snap/design-audit's strict-CLI posture). An unknown
 *  flag used to be silently skipped, so a typo'd step metered the landing page and reported it clean. */
function scanArgv(argv: readonly string[]): string[] {
  const errors: string[] = [];
  let routeCount = 0;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (!token.startsWith("-")) {
      routeCount += 1;
      continue;
    }
    if (BOOLEAN_FLAGS.has(token)) {
      continue;
    }
    if (!VALUE_FLAGS.has(token)) {
      errors.push(aliasRefusal(token, KNOWN_FLAGS) ?? `unknown flag ${token}`);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      errors.push(`${token} requires a value`);
      continue;
    }
    index += 1;
  }
  if (routeCount > 1) {
    errors.push(`expected at most one route, got ${routeCount}`);
  }
  errors.push(...strictValueErrors(argv));
  return errors;
}

function strictValueErrors(argv: readonly string[]): string[] {
  const errors: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const raw = argv[index + 1];
    if (flag === "--viewport" && raw !== undefined && parseViewport(raw) === null) {
      errors.push("--viewport requires WIDTHxHEIGHT positive integers");
    }
    if ((flag === "--settle" || flag === "--pause") && raw !== undefined) {
      const duration = Number(raw);
      if (!Number.isFinite(duration) || duration <= 0) {
        errors.push(`${flag} requires a positive finite duration in milliseconds`);
      }
    }
  }
  return errors;
}

export function parsePerfArgs(argv: string[]): Args {
  const args: Args = {
    help: false,
    route: "/",
    base: DEFAULT_BASE,
    out: "perf-meter",
    viewport: DEFAULT_VIEWPORT,
    settleMs: DEFAULT_SETTLE_MS,
    cycles: 1,
    cpuProfile: false,
    steps: [],
    appearance: null,
    theme: null,
    session: null,
    errors: scanArgv(argv),
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift() as string;
    if (parseScalarFlag(a, rest, args) || parseAppearanceFlag(a, rest, args) || parsePanelPresetFlag(a, rest, args) || parseStepFlag(a, rest, args.steps)) {
      continue;
    }
    if (!a.startsWith("--")) {
      args.route = a;
    }
  }
  // Repetition-decay one-liner: unroll the whole sequence n times. The per-step table keeps
  // absolute indices, so decay reads as a column scan.
  if (args.cycles > 1) {
    const once = [...args.steps];
    for (let c = 1; c < args.cycles; c += 1) {
      args.steps.push(...once);
    }
  }
  return args;
}
