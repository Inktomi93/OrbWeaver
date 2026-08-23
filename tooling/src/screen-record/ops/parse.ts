// Argv parse for screen-record — brought to the strict-CLI posture at the promotion (stated
// refinement): record was the fleet's last lenient parser, and a typo'd step silently recorded the
// wrong tape.
import type { Viewport } from "@orb/tooling/_shared/argv";
import { parseViewport, splitLastEq } from "@orb/tooling/_shared/argv";
import { DEFAULT_BASE } from "@orb/tooling/_shared/browser";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, Step } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm record");

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
const DEFAULT_SETTLE_MS = 1500;
const DEFAULT_PAUSE_MS = 600;
const DEFAULT_FRAMES_OFFSET_MS = 450;
const DEFAULT_WHEEL_DY = 600;

const INT_RE = /^\d+$/u;

/** The step-producing flags. Returns false when `flag` isn't one of them. */
function parseStepFlag(flag: string, rest: string[], steps: Step[]): boolean {
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
  if (flag === "--wheel") {
    const { head, tail } = splitLastEq(rest.shift() ?? "");
    steps.push({
      kind: "wheel",
      selector: head,
      dy: tail === "" ? DEFAULT_WHEEL_DY : Number(tail),
    });
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
  if (flag === "--frames") {
    // Optional numeric offset argument; bare --frames takes the default.
    const peek = rest[0];
    args.framesOffsetMs = peek !== undefined && INT_RE.test(peek) ? Number(rest.shift()) : DEFAULT_FRAMES_OFFSET_MS;
    return true;
  }
  return false;
}

export function parseRecordArgs(argv: string[]): Args {
  const args: Args = {
    route: "/",
    base: DEFAULT_BASE,
    out: "recording",
    viewport: DEFAULT_VIEWPORT,
    settleMs: DEFAULT_SETTLE_MS,
    framesOffsetMs: null,
    steps: [],
    errors: scanArgv(argv),
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift() as string;
    if (parseScalarFlag(a, rest, args) || parseStepFlag(a, rest, args.steps)) {
      continue;
    }
    if (!a.startsWith("--")) {
      args.route = a;
    }
  }
  return args;
}

// Every flag this CLI knows, and which of them consume the next token. Used ONLY by the misuse scan;
// --frames takes an OPTIONAL numeric, handled inline.
const VALUE_FLAGS = new Set(["--click", "--jsclick", "--hover", "--fill", "--wheel", "--pause", "--base", "--out", "--settle", "--viewport"]);

export const RECORD_HELP = `record — animation-responsiveness screencasts

Usage:
  pnpm record [route] [flags]

Steps (ONE argv-ordered tape):
  --click/--jsclick/--hover <sel>   --fill "sel=value"   --wheel "sel=dy"   --pause <ms>

Run:
  --base <url> · --viewport <WxH> · --settle <ms> (initial, default ${DEFAULT_SETTLE_MS}) ·
  --out <name> · --frames [offsetMs] (per-step full-res PNGs, default offset ${DEFAULT_FRAMES_OFFSET_MS})

Exit: 0 recorded · 1 step failure / page error · EXIT.misuse on a bad CLI.`;

/** Argv scanned for misuse BEFORE a browser boots (the fleet's strict-CLI posture — a typo'd flag
 *  must not silently record the wrong tape). */
function scanArgv(argv: readonly string[]): string[] {
  const errors: string[] = [];
  let routeCount = 0;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (!token.startsWith("-")) {
      routeCount += 1;
      continue;
    }
    if (token === "--frames") {
      const peek = argv[index + 1];
      if (peek !== undefined && INT_RE.test(peek)) {
        index += 1;
      }
      continue;
    }
    if (!VALUE_FLAGS.has(token)) {
      errors.push(`unknown flag ${token}`);
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
