// Argv parse for ui-audit — the strict-CLI posture (an unknown flag is a hard EXIT.misuse, never an
// ignored line, because a typo'd flag silently scans the wrong surface and reports it clean).
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
import { parseViewport, splitLastEq } from "@orb/tooling/_shared/argv";
import { DEFAULT_BASE } from "@orb/tooling/_shared/browser";
import { MOBILE_DEVICE } from "@orb/tooling/_shared/browser-environment";
import type { NavMethod } from "@orb/tooling/_shared/nav";
import { applyThemeFlag, parseThemeFlag, THEME_VALUE_FLAGS, themeHelpBlock } from "@orb/tooling/_shared/theme";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Severity } from "../contract/findings.ts";
import type { Args } from "../contract/types.ts";
import { isValidSeverity } from "../lib/severity.ts";
import { stageArgErrors } from "../lib/stage-request.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
const DEFAULT_WAIT_MS = 500;
const DEFAULT_FAIL_ON: Severity = "P1";
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
  "--wait": (a, rest) => {
    a.waitMs = Number(rest.shift() ?? String(DEFAULT_WAIT_MS));
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
};

const REQUIRED_VALUE_FLAGS = new Set([
  "--click",
  "--upload",
  "--goto",
  "--open-chat",
  "--open-character",
  "--context-tab",
  "--wait",
  "--out",
  "--base",
  "--ref",
  "--viewport",
  "--fail-on",
  ...APPEARANCE_VALUE_FLAGS,
  ...THEME_VALUE_FLAGS,
]);

export const DESIGN_AUDIT_HELP = `design-audit — the deterministic UI defect scan

Usage:
  pnpm design-audit [route] [flags]

Surface (ONE argv-ordered queue — write the chain the way it should happen):
  --click <selector>        --goto <section|settings:cat|modal:slot>
  --open-chat <id|title|latest|current>   --open-character <id|name>
  --upload <selector>=<path[,path...]>    attach local file(s) to a file input — drills a wrapper
                            selector down to the real <input type="file"> automatically. PATH BOUNDARY:
                            every path must resolve inside this repo or the OS tmp dir; anything else is
                            refused loudly. Same shape and boundary as snap's --upload (_shared/upload.ts).
  --context-tab <tab>       --wait <ms>   settle after the last action (default ${DEFAULT_WAIT_MS})

Environment:
  --viewport <WxH>          default 1280x800
  --mobile                  iPhone 14 Pro Max — touch + pointer:coarse (the 44px tap floor)
  --desktop                 explicit 1280x800

Where it audits (default: ${DEFAULT_BASE} — the dev stack, which serves MAIN, never a worktree):
  --base <url>              audit an already-running origin (a stage, a file:// dir) — conflicts with the
                            stage flags below; two answers to "where" is refused, never defaulted
  --isolated                boot/reuse snap's ISOLATED STAGE (a second dev stack on offset ports, serving a
                            DETACHED worktree at a commit) and audit THAT — how a lane audits its own branch
  --ref <sha|branch|tag>    the commit the stage serves (implies --isolated; default HEAD). A ref this
                            checkout cannot resolve is CLI misuse — it never falls back to the dev stack
  --dirty                   stage the WORKING TREE instead of a commit (implies --isolated)
  --fresh                   rebuild the stage instead of reusing the warm one (implies --isolated)

  STAGE DB: the stage serves its OWN db — a FRESH stage sha copies the dev db at boot; a stage dir that
  already exists KEEPS the db it had (possibly older/thinner than dev). A corpus-dependent finding, or its
  absence, is a claim about THAT db. A run that BOOTS the stage REFUSES (exit 2) rather than judging a
  cold surface — vite's dep-optimizer is still churning and the walk would census a fraction of the page and
  call it clean — so the first invocation warms the stage and the second one measures it. Stage admin is
  snap's: pnpm snap --stage-status|--stage-down|--stage-sweep.

${appearanceHelpBlock()}

${themeHelpBlock()}

Verdict:
  --fail-on <P0|P1|P2|P3>   exit 1 at this severity or worse (default ${DEFAULT_FAIL_ON})
  --out <name|path>         reports/design-audit/<name>.json — or, path-shaped (absolute / ./ ../),
                            that exact file

Exit: 0 clean · 1 findings or nav error · 2 nothing was censused (empty walk) · 3 CLI misuse.`;

/** Argv is scanned for misuse BEFORE anything runs. An unknown flag used to print
 *  `UNKNOWN FLAG --goto (ignored)` and exit 0 — so a typo'd audit scanned home, reported clean, and the
 *  caller believed it had scanned the surface they named. Mirrors snap's strict-CLI posture. */
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

export function parseAuditArgs(argv: string[]): Args {
  const args: Args = {
    route: "/",
    base: DEFAULT_BASE,
    baseExplicit: false,
    isolated: false,
    ref: null,
    dirty: false,
    fresh: false,
    stageShortSha: null,
    actions: [],
    waitMs: DEFAULT_WAIT_MS,
    out: null,
    viewport: DEFAULT_VIEWPORT,
    device: null,
    failOn: DEFAULT_FAIL_ON,
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
  // Combination misuse is judged AFTER the whole argv is known (flag order must not change the verdict) —
  // still before anything runs, so a conflicting pair never boots a stage or a browser.
  args.errors.push(...stageArgErrors(args));
  return args;
}
