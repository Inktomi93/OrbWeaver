// Argv parse for ui-audit — the strict-CLI posture (an unknown flag is a hard EXIT.misuse, never an
// ignored line, because a typo'd flag silently scans the wrong surface and reports it clean).

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
import { aliasRefusal, crossToolAdminRefusal, HELP_FLAGS, SESSION_FLAG } from "@orb/tooling/_shared/instrument-argv";
import type { NavMethod } from "@orb/tooling/_shared/nav";
import { applyPanelPresetFlag, loadPanelPreset, PANEL_PRESET_VALUE_FLAGS } from "@orb/tooling/_shared/panel-flags";
import { applyThemeFlag, parseThemeFlag, THEME_VALUE_FLAGS } from "@orb/tooling/_shared/theme";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { DEFAULT_FAIL_ON, DEFAULT_SETTLE_MS } from "../contract/defaults.ts";
import type { Args } from "../contract/types.ts";
import { isValidSeverity } from "../lib/severity.ts";
import { stageArgErrors } from "../lib/stage-request.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
type FlagHandler = (args: Args, rest: string[]) => void;

function pushNav(args: Args, method: NavMethod, rest: string[]): void {
  args.actions.push({ kind: "nav", method, target: rest.shift() ?? "" });
}

const FLAG_HANDLERS: Record<string, FlagHandler> = {
  "--click": (a, rest) => {
    a.actions.push({ kind: "click", selector: rest.shift() ?? "" });
  },
  // --upload <selector>=<path[,path...]> (#651): the SAME shape and boundary snap's --upload uses
  // (_shared/upload.ts) — a census over an empty dropzone was the false clean this whole row exists to
  // fix, so the walk needs to be able to POPULATE the surface it scans, not just navigate to it.
  "--upload": (a, rest) => {
    const s = splitLastEq(rest.shift() ?? "");
    const paths = s.tail
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p !== "");
    a.actions.push({ kind: "upload", selector: s.head, paths });
  },
  "--goto": (a, rest) => {
    pushNav(a, "goto", rest);
  },
  "--open-chat": (a, rest) => {
    pushNav(a, "open-chat", rest);
  },
  "--open-character": (a, rest) => {
    pushNav(a, "open-character", rest);
  },
  "--context-tab": (a, rest) => {
    pushNav(a, "context-tab", rest);
  },
  // `--panel <name>=<mode>` (the same `<a>=<b>` shape --fill/--key/--expect-text use, splitLastEq — a
  // panel NAME never contains `=`) and `--focus <on|off>` are validated HERE, not left for the bridge to
  // reject: a mistyped mode/on-off string must be CLI misuse, never silently decode to some other value.
  "--panel": (a, rest) => {
    const raw = rest.shift() ?? "";
    const s = splitLastEq(raw);
    if (s.head === "" || s.tail === "") {
      a.errors.push(`--panel expects name=mode, got ${JSON.stringify(raw)}`);
    }
    a.actions.push({ kind: "nav", method: "panel", target: raw });
  },
  "--focus": (a, rest) => {
    const raw = rest.shift() ?? "";
    if (raw !== "on" && raw !== "off") {
      a.errors.push(`--focus expects on|off, got ${JSON.stringify(raw)}`);
    }
    a.actions.push({ kind: "nav", method: "focus", target: raw });
  },
  // `--panels <preset>` expands into the SAME panel/focus actions, HERE at its own argv position — so it
  // composes with the hand-written flags by ordinary queue order (a --panel written after it wins) instead
  // of being a second, differently-behaving mechanism. The profiles live in _shared/panel-presets.json.
  "--panels": (a, rest) => {
    applyPanelPresetFlag(loadPanelPreset(rest.shift() ?? ""), a.errors, (action) => {
      a.actions.push({ kind: "nav", ...action });
    });
  },
  // #1290 F1: renamed from --wait (snap's --wait names a SELECTOR; this one always meant milliseconds,
  // perf-meter's/record's spelling) — the old spelling is refused BY NAME in scanArgv, never accepted.
  "--settle": (a, rest) => {
    a.waitMs = Number(rest.shift() ?? String(DEFAULT_SETTLE_MS));
  },
  "--out": (a, rest) => {
    a.out = rest.shift() ?? null;
  },
  "--base": (a, rest) => {
    a.base = rest.shift() ?? DEFAULT_BASE;
    a.baseExplicit = true;
  },
  // The isolated-stage family (#678) — the same four source flags snap carries, with the same implication
  // (naming a ref / forcing a rebuild / staging the working tree is meaningless against the live stack).
  // Stage ADMIN stays on snap: one band, one lifecycle owner.
  "--isolated": (a) => {
    a.isolated = true;
  },
  "--ref": (a, rest) => {
    a.ref = rest.shift() ?? null;
    a.isolated = true;
  },
  "--dirty": (a) => {
    a.dirty = true;
    a.isolated = true;
  },
  "--fresh": (a) => {
    a.fresh = true;
    a.isolated = true;
  },
  "--viewport": (a, rest) => {
    const raw = rest.shift() ?? "";
    const parsed = parseViewport(raw);
    if (parsed === null) {
      a.errors.push(`--viewport expects positive WxH, got ${JSON.stringify(raw)}`);
      return;
    }
    a.viewport = parsed;
    a.device = null;
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
  "--fail-on": (a, rest) => {
    const raw = (rest.shift() ?? "").toUpperCase();
    if (isValidSeverity(raw)) {
      a.failOn = raw;
    } else {
      a.errors.push(`--fail-on expects P0|P1|P2|P3, got ${JSON.stringify(raw)}`);
    }
  },
  // #1285: attach to a live snap session's browser (docs/design/1208-instrument-substrate.md §3.4)
  // instead of launching a fresh one — the shared WHERE_FLAGS spelling (_shared/instrument-argv.ts).
  [SESSION_FLAG]: (a, rest) => {
    a.session = rest.shift() ?? null;
  },
  // HELP_FLAGS (§4.3, _shared/instrument-argv.ts): print DESIGN_AUDIT_HELP and exit 0 — before this
  // family, --help was an unknown flag and exited 3 (measured 20 hits, design §1 P5).
  ...Object.fromEntries(
    [...HELP_FLAGS].map((flag): [string, FlagHandler] => [
      flag,
      (a) => {
        a.help = true;
      },
    ]),
  ),
};

const REQUIRED_VALUE_FLAGS = new Set([
  "--click",
  "--upload",
  "--goto",
  "--open-chat",
  "--open-character",
  "--context-tab",
  "--panel",
  "--focus",
  "--settle",
  "--out",
  "--base",
  "--ref",
  "--viewport",
  "--fail-on",
  SESSION_FLAG,
  ...PANEL_PRESET_VALUE_FLAGS,
  ...APPEARANCE_VALUE_FLAGS,
  ...THEME_VALUE_FLAGS,
]);

const KNOWN_FLAGS = new Set(Object.keys(FLAG_HANDLERS));

/** Argv is scanned for misuse BEFORE anything runs. An unknown flag used to print
 *  `UNKNOWN FLAG --goto (ignored)` and exit 0 — so a typo'd audit scanned home, reported clean, and the
 *  caller believed it had scanned the surface they named. Mirrors snap's strict-CLI posture. */
function scanArgv(argv: readonly string[]): string[] {
  const errors: string[] = [];
  let routeCount = 0;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (FLAG_HANDLERS[token] === undefined) {
      if (token === "--wait") {
        // #1290 F1: the OLD spelling — refused BY NAME, never left to read as an unknown flag or a route.
        errors.push("unknown flag --wait — design-audit renamed it to --settle <ms> (snap's --wait names a selector; this always meant milliseconds)");
      } else if (token.startsWith("-")) {
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
  return errors;
}

export function parseAuditArgs(argv: string[]): Args {
  const args: Args = {
    help: false,
    route: "/",
    base: DEFAULT_BASE,
    matrix: false,
    baseExplicit: false,
    isolated: false,
    ref: null,
    dirty: false,
    fresh: false,
    stageShortSha: null,
    actions: [],
    waitMs: DEFAULT_SETTLE_MS,
    out: null,
    viewport: DEFAULT_VIEWPORT,
    device: null,
    failOn: DEFAULT_FAIL_ON,
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
  // Combination misuse is judged AFTER the whole argv is known (flag order must not change the verdict) —
  // still before anything runs, so a conflicting pair never boots a stage or a browser.
  args.errors.push(...stageArgErrors(args));
  if (args.matrix) {
    const overridden = ["--viewport", "--mobile", "--desktop", "--appearance", "--appearance-preset", "--full-motion", "--theme"].filter((flag) =>
      argv.includes(flag),
    );
    if (overridden.length > 0) {
      args.errors.push(`--matrix owns appearance/theme/device axes; drop: ${overridden.join(", ")}`);
    }
  }
  return args;
}
