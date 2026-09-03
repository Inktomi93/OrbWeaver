// Argv parse for motion-audit — the strict-CLI posture (an unknown flag is a hard EXIT.misuse: a
// typo'd nav flag must not quietly audit the landing page under the name of the surface asked for).

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
import { MOBILE_DEVICE } from "@orb/tooling/_shared/browser-environment";
import { aliasRefusal, crossToolAdminRefusal, HELP_FLAGS, REDUCED_MOTION_FLAG, SESSION_FLAG } from "@orb/tooling/_shared/instrument-argv";
import { applyPanelPresetFlag, loadPanelPreset, PANEL_PRESET_VALUE_FLAGS } from "@orb/tooling/_shared/panel-flags";
import { applyThemeFlag, parseThemeFlag, THEME_VALUE_FLAGS } from "@orb/tooling/_shared/theme";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { DEFAULT_WINDOW_MS } from "../contract/defaults.ts";
import type { Args } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm motion-audit");

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };

// One handler per flag (Record dispatch, snap.ts house style) — keeps parseArgs flat under the
// cognitive-complexity cap instead of a long else-if chain.
type FlagHandler = (args: Args, rest: string[]) => void;
const FLAG_HANDLERS: Record<string, FlagHandler> = {
  "--click": (a, rest) => {
    a.reach.push({ kind: "click", selector: rest.shift() ?? "" });
  },
  "--goto": (a, rest) => {
    a.reach.push({ kind: "nav", method: "goto", target: rest.shift() ?? "" });
  },
  "--open-chat": (a, rest) => {
    a.reach.push({ kind: "nav", method: "open-chat", target: rest.shift() ?? "" });
  },
  "--open-character": (a, rest) => {
    a.reach.push({ kind: "nav", method: "open-character", target: rest.shift() ?? "" });
  },
  "--context-tab": (a, rest) => {
    a.reach.push({ kind: "nav", method: "context-tab", target: rest.shift() ?? "" });
  },
  "--panel": (a, rest) => {
    a.reach.push({ kind: "nav", method: "panel", target: rest.shift() ?? "" });
  },
  "--focus": (a, rest) => {
    a.reach.push({ kind: "nav", method: "focus", target: rest.shift() ?? "" });
  },
  // `--panels <preset>` expands into the SAME panel/focus actions at ITS argv position (_shared/panel-flags.ts).
  "--panels": (a, rest) => {
    applyPanelPresetFlag(loadPanelPreset(rest.shift() ?? ""), a.errors, (action) => {
      a.reach.push({ kind: "nav", ...action });
    });
  },
  "--url": (a, rest) => {
    a.url = rest.shift() ?? null;
  },
  "--base": (a, rest) => {
    a.base = rest.shift() ?? DEFAULT_BASE;
    a.baseExplicit = true;
  },
  "--selector": (a, rest) => {
    a.selector = rest.shift() ?? null;
  },
  "--window": (a, rest) => {
    a.windowMs = Number(rest.shift() ?? String(DEFAULT_WINDOW_MS)) || DEFAULT_WINDOW_MS;
  },
  "--viewport": (a, rest) => {
    const viewport = parseViewport(rest.shift() ?? "");
    if (viewport !== null) {
      a.viewport = viewport;
      a.device = null;
    }
  },
  "--mobile": (a) => {
    a.device = MOBILE_DEVICE;
  },
  "--desktop": (a) => {
    a.viewport = DEFAULT_VIEWPORT;
    a.device = null;
  },
  "--matrix": (a) => {
    a.matrix = true;
  },
  // ENVIRONMENT_FLAGS (§4.3, _shared/instrument-argv.ts, owner ruling 2026-09-03): the canonical
  // spelling — RENAMED from --os-reduced-motion/--os-full-motion, which are now REFUSALS (ALIAS_REFUSALS
  // in the same file), never a second accepted spelling. Default (absent) is full motion, matching snap.
  [REDUCED_MOTION_FLAG]: (a) => {
    a.osReducedMotion = true;
  },
  "--vnc": (a) => {
    a.vnc = true;
  },
  "--no-throttle": (a) => {
    a.throttle = false;
  },
  "--appearance": (a, rest) => {
    applyAppearanceFlag(a, parseAppearancePatch(rest.shift() ?? ""));
  },
  "--appearance-preset": (a, rest) => {
    applyAppearanceFlag(a, loadAppearancePreset(rest.shift() ?? ""));
  },
  "--full-motion": (a) => {
    a.appearance = mergeAppearancePatches(a.appearance, FULL_MOTION_PATCH);
  },
  "--theme": (a, rest) => {
    applyThemeFlag(a, parseThemeFlag(rest.shift() ?? ""));
  },
  // #1285: attach to a live snap session's browser (docs/design/1208-instrument-substrate.md §3.4)
  // instead of launching a fresh one — the shared WHERE_FLAGS spelling (_shared/instrument-argv.ts).
  [SESSION_FLAG]: (a, rest) => {
    a.session = rest.shift() ?? null;
  },
  // HELP_FLAGS (§4.3, _shared/instrument-argv.ts): print MOTION_AUDIT_HELP and exit 0 — before this
  // family, --help was an unknown flag and exited 3 (measured 8 hits, design §1 P5).
  ...Object.fromEntries(
    [...HELP_FLAGS].map((flag): [string, FlagHandler] => [
      flag,
      (a) => {
        a.help = true;
      },
    ]),
  ),
};

// Flags that consume the next token. A missing value used to swallow the following flag silently.
const REQUIRED_VALUE_FLAGS = new Set([
  "--click",
  "--goto",
  "--open-chat",
  "--open-character",
  "--context-tab",
  "--panel",
  "--focus",
  "--url",
  "--base",
  "--selector",
  "--window",
  "--viewport",
  SESSION_FLAG,
  ...PANEL_PRESET_VALUE_FLAGS,
  ...APPEARANCE_VALUE_FLAGS,
  ...THEME_VALUE_FLAGS,
]);

const KNOWN_FLAGS = new Set(Object.keys(FLAG_HANDLERS));

/** Argv is scanned for misuse BEFORE a browser boots — snap's and design-audit's strict-CLI posture. A
 *  typo'd nav flag used to print "(ignored)" and audit the landing page under the name of the surface the
 *  caller asked for, which is a smoothness verdict about the wrong thing. */
function scanArgv(argv: readonly string[]): string[] {
  const errors: string[] = [];
  let routeCount = 0;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (FLAG_HANDLERS[token] === undefined) {
      if (token.startsWith("-")) {
        errors.push(crossToolAdminRefusal(token) ?? aliasRefusal(token, KNOWN_FLAGS) ?? `unknown flag ${token}`);
      } else {
        routeCount += 1;
      }
      continue;
    }
    if (!REQUIRED_VALUE_FLAGS.has(token)) {
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

// `--panel`/`--focus` are validated HERE, not left for the bridge to reject: a mistyped mode/on-off string
// must be CLI misuse, never a silent decode to some other value (--panel splits with splitLastEq — the
// same `<a>=<b>` shape --fill/--key/--expect-text use; a panel NAME never carries `=`). Split out of
// strictValueErrors purely to keep it under the biome cognitive-complexity cap.
function shellNavValueErrors(flag: string | undefined, raw: string | undefined): string[] {
  if (flag === "--panel" && raw !== undefined) {
    const s = splitLastEq(raw);
    return s.head === "" || s.tail === "" ? [`--panel expects name=mode, got ${JSON.stringify(raw)}`] : [];
  }
  if (flag === "--focus" && raw !== undefined && raw !== "on" && raw !== "off") {
    return [`--focus expects on|off, got ${JSON.stringify(raw)}`];
  }
  return [];
}

function strictValueErrors(argv: readonly string[]): string[] {
  const errors: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const raw = argv[index + 1];
    if (flag === "--viewport" && raw !== undefined && parseViewport(raw) === null) {
      errors.push("--viewport requires WIDTHxHEIGHT positive integers");
    }
    if (flag === "--window" && raw !== undefined) {
      const duration = Number(raw);
      if (!Number.isFinite(duration) || duration <= 0) {
        errors.push("--window requires a positive finite duration in milliseconds");
      }
    }
    errors.push(...shellNavValueErrors(flag, raw));
  }
  return errors;
}

export function parseMotionArgs(argv: string[]): Args {
  const args: Args = {
    help: false,
    route: "/",
    url: null,
    base: DEFAULT_BASE,
    baseExplicit: false,
    matrix: false,
    selector: null,
    reach: [],
    windowMs: DEFAULT_WINDOW_MS,
    viewport: DEFAULT_VIEWPORT,
    device: null,
    osReducedMotion: false,
    vnc: false,
    throttle: true,
    appearance: null,
    theme: null,
    session: null,
    errors: scanArgv(argv),
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const tok = rest.shift() as string;
    const handler = FLAG_HANDLERS[tok];
    if (handler !== undefined) {
      handler(args, rest);
    } else if (!tok.startsWith("-")) {
      args.route = tok;
    }
  }
  if (args.matrix) {
    const overridden = ["--viewport", "--mobile", "--desktop", "--appearance", "--appearance-preset", "--full-motion", REDUCED_MOTION_FLAG].filter((flag) =>
      argv.includes(flag),
    );
    if (overridden.length > 0) {
      args.errors.push(`--matrix owns application-motion/OS-motion/device axes; drop: ${overridden.join(", ")}`);
    }
    if (args.selector === null) {
      args.errors.push("--matrix requires --selector so the entry and interaction scenarios are both executable");
    }
  }
  return args;
}
