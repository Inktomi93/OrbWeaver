// Argv parse for motion-audit — the strict-CLI posture (an unknown flag is a hard EXIT.misuse: a
// typo'd nav flag must not quietly audit the landing page under the name of the surface asked for).

import { mergeAppearancePatches } from "@orb/tooling/_shared/appearance";
import {
  APPEARANCE_VALUE_FLAGS,
  appearanceHelpBlock,
  applyAppearanceFlag,
  FULL_MOTION_PATCH,
  loadAppearancePreset,
  parseAppearancePatch,
} from "@orb/tooling/_shared/appearance-flags";
import type { Viewport } from "@orb/tooling/_shared/argv";
import { parseViewport, splitLastEq } from "@orb/tooling/_shared/argv";
import { DEFAULT_BASE } from "@orb/tooling/_shared/browser";
import { MOBILE_DEVICE } from "@orb/tooling/_shared/browser-environment";
import { applyPanelPresetFlag, loadPanelPreset, PANEL_PRESET_VALUE_FLAGS, panelPresetHelpBlock } from "@orb/tooling/_shared/panel-flags";
import { applyThemeFlag, parseThemeFlag, THEME_VALUE_FLAGS, themeHelpBlock } from "@orb/tooling/_shared/theme";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm motion-audit");

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
  "--os-reduced-motion": (a) => {
    a.osReducedMotion = true;
  },
  "--os-full-motion": (a) => {
    a.osReducedMotion = false;
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
  "--panel",
  "--focus",
  "--url",
  "--base",
  "--selector",
  "--window",
  "--viewport",
  ...PANEL_PRESET_VALUE_FLAGS,
  ...APPEARANCE_VALUE_FLAGS,
  ...THEME_VALUE_FLAGS,
]);

export const MOTION_AUDIT_HELP = `motion-audit — the smoothness ground-truth harness

Usage:
  pnpm motion-audit [route] [flags]

Reach the surface (argv-ordered, run BEFORE the trace; evidence is reset after the last one):
  --click <selector>        --goto <section|settings:cat|modal:slot>
  --open-chat <id|title|latest|current>   --open-character <id|name>   --context-tab <tab>
  --panel <name>=<docked|overlay|collapsed>   drive the shell's panel layout (also the docked↔collapsed
                            FLIP transition — one of the app's largest motion surfaces)
  --focus <on|off>          the shell's zen/focus-mode toggle
  --panels <preset>         reach a NAMED panel configuration in one flag (see Panel state below)

Measure:
  --selector <sel>          THE interaction — clicked inside the trace window
  --window <ms>             observation window (default ${DEFAULT_WINDOW_MS})

Environment:
  --base <url> · --url <full-url> · --viewport <WxH> · --vnc (headful) · --no-throttle
  --mobile                  ${MOBILE_DEVICE} full descriptor (touch · pointer:coarse · mobile UA · DPR)
  --desktop                 explicit 1280x800 desktop (pointer:fine · hover)
  --os-reduced-motion       emulate prefers-reduced-motion: reduce (independent of app Appearance)
  --os-full-motion          explicit OS full-motion media-query arm (default)
  --matrix                  derive/run the six scenario × app-motion × OS-motion × device cells;
                            the exact reduced mobile entry may report STATIC-EXPECTED only beside the
                            nonzero full-motion mobile interaction control (ordinary zero-frame law stays)
                            rated Appearance recipe: --goto settings:appearance
                            --selector '[data-slot="collapsible-trigger"]'

${panelPresetHelpBlock()}

${appearanceHelpBlock()}

${themeHelpBlock()}
  A single-run motion verdict owes BOTH app arms: bare (the account's real state — does the floor hold?)
  and --full-motion (is the nice stuff good?). The independent --os-full-motion/--os-reduced-motion
  flags change only the browser media query; --matrix derives and runs both app and OS arms.

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
    route: "/",
    url: null,
    base: DEFAULT_BASE,
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
    const overridden = [
      "--viewport",
      "--mobile",
      "--desktop",
      "--appearance",
      "--appearance-preset",
      "--full-motion",
      "--os-reduced-motion",
      "--os-full-motion",
    ].filter((flag) => argv.includes(flag));
    if (overridden.length > 0) {
      args.errors.push(`--matrix owns application-motion/OS-motion/device axes; drop: ${overridden.join(", ")}`);
    }
    if (args.selector === null) {
      args.errors.push("--matrix requires --selector so the entry and interaction scenarios are both executable");
    }
  }
  return args;
}
