// Argv parse for motion-audit — the strict-CLI posture (an unknown flag is a hard EXIT.misuse: a
// typo'd nav flag must not quietly audit the landing page under the name of the surface asked for).
import {
  APPEARANCE_VALUE_FLAGS,
  appearanceHelpBlock,
  applyAppearanceFlag,
  FULL_MOTION_PATCH,
  loadAppearancePreset,
  mergeAppearancePatches,
  parseAppearancePatch,
} from "@orb/tooling/_shared/appearance";
import type { Viewport } from "@orb/tooling/_shared/argv";
import { parseViewport } from "@orb/tooling/_shared/argv";
import { DEFAULT_BASE } from "@orb/tooling/_shared/browser";
import { applyThemeFlag, parseThemeFlag, THEME_VALUE_FLAGS, themeHelpBlock } from "@orb/tooling/_shared/theme";
import type { Args } from "../contract/types.ts";

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
const DEFAULT_WINDOW_MS = 2500;

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
  "--url": (a, rest) => {
    a.url = rest.shift() ?? null;
  },
  "--base": (a, rest) => {
    a.base = rest.shift() ?? DEFAULT_BASE;
  },
  "--selector": (a, rest) => {
    a.selector = rest.shift() ?? null;
  },
  "--window": (a, rest) => {
    a.windowMs = Number(rest.shift() ?? String(DEFAULT_WINDOW_MS)) || DEFAULT_WINDOW_MS;
  },
  "--viewport": (a, rest) => {
    a.viewport = parseViewport(rest.shift() ?? "") ?? a.viewport;
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
};

// Flags that consume the next token. A missing value used to swallow the following flag silently.
const REQUIRED_VALUE_FLAGS = new Set([
  "--click",
  "--goto",
  "--open-chat",
  "--open-character",
  "--context-tab",
  "--url",
  "--base",
  "--selector",
  "--window",
  "--viewport",
  ...APPEARANCE_VALUE_FLAGS,
  ...THEME_VALUE_FLAGS,
]);

export const MOTION_AUDIT_HELP = `motion-audit — the smoothness ground-truth harness

Usage:
  pnpm motion-audit [route] [flags]

Reach the surface (argv-ordered, run BEFORE the trace; evidence is reset after the last one):
  --click <selector>        --goto <section|settings:cat|modal:slot>
  --open-chat <id|title|latest|current>   --open-character <id|name>   --context-tab <tab>

Measure:
  --selector <sel>          THE interaction — clicked inside the trace window
  --window <ms>             observation window (default ${DEFAULT_WINDOW_MS})

Environment:
  --base <url> · --url <full-url> · --viewport <WxH> · --vnc (headful) · --no-throttle

${appearanceHelpBlock()}

${themeHelpBlock()}
  A motion verdict owes BOTH arms: bare (the account's real state — does the floor hold?) and
  --full-motion (is the nice stuff good?). This probe's browser-level reducedMotion:false is the OS
  media query only; it does NOT turn the app's own setting back on.

Exit: 0 pass · 1 budget breach / failed action / page error · 2 nothing was observed (no __orb bridge,
      no composited frame) · 3 CLI misuse.`;

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
        errors.push(`unknown flag ${token}`);
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
  return errors;
}

export function parseMotionArgs(argv: string[]): Args {
  const args: Args = {
    route: "/",
    url: null,
    base: DEFAULT_BASE,
    selector: null,
    reach: [],
    windowMs: DEFAULT_WINDOW_MS,
    viewport: DEFAULT_VIEWPORT,
    vnc: false,
    throttle: true,
    appearance: null,
    theme: null,
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
  return args;
}
