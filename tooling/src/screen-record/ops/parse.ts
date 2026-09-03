// Argv parse for screen-record — brought to the strict-CLI posture at the promotion (stated
// refinement): record was the fleet's last lenient parser, and a typo'd step silently recorded the
// wrong tape.
import type { Viewport } from "@orb/tooling/_shared/argv";
import { parseViewport, splitLastEq } from "@orb/tooling/_shared/argv";
import { DEFAULT_BASE } from "@orb/tooling/_shared/browser";
import { aliasRefusal, crossToolAdminRefusal, HELP_FLAGS, SESSION_FLAG } from "@orb/tooling/_shared/instrument-argv";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { DEFAULT_FRAMES_OFFSET_MS, DEFAULT_SETTLE_MS } from "../contract/defaults.ts";
import type { Args, Step } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm record");

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
const DEFAULT_PAUSE_MS = 600;
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

/** The session-attach and help flags — its own arm purely to keep parseScalarFlag under the biome
 *  cognitive-complexity cap; both are boolean/instrument-argv-owned rather than record's own scalars. */
function parseInstrumentFlag(flag: string, rest: string[], args: Args): boolean {
  // #1285: attach to a live snap session's browser (docs/design/1208-instrument-substrate.md §3.4/§5)
  // instead of launching a fresh one — the shared WHERE_FLAGS spelling (_shared/instrument-argv.ts).
  // record opens its OWN new context on the session browser (ops/record.ts) rather than reusing a page.
  if (flag === SESSION_FLAG) {
    args.session = rest.shift() ?? null;
    return true;
  }
  // HELP_FLAGS (§4.3, _shared/instrument-argv.ts): print RECORD_HELP and exit 0 — before this family,
  // --help was an unknown flag and exited 3.
  if (HELP_FLAGS.has(flag)) {
    args.help = true;
    return true;
  }
  return false;
}

function parseScalarFlag(flag: string, rest: string[], args: Args): boolean {
  if (flag === "--base") {
    args.base = rest.shift() ?? DEFAULT_BASE;
    args.baseExplicit = true;
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
  return parseInstrumentFlag(flag, rest, args);
}

export function parseRecordArgs(argv: string[]): Args {
  const args: Args = {
    help: false,
    route: "/",
    base: DEFAULT_BASE,
    baseExplicit: false,
    out: "recording",
    viewport: DEFAULT_VIEWPORT,
    settleMs: DEFAULT_SETTLE_MS,
    framesOffsetMs: null,
    steps: [],
    session: null,
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
// --frames takes an OPTIONAL numeric, handled inline. --help/-h are BOOLEAN (never consume a value) so
// they are deliberately not in this set — see scanArgv's own HELP_FLAGS branch.
const VALUE_FLAGS = new Set(["--click", "--jsclick", "--hover", "--fill", "--wheel", "--pause", "--base", "--out", "--settle", "--viewport", SESSION_FLAG]);
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, ...HELP_FLAGS]);

function scanValueFlag(token: string, value: string | undefined): readonly [error: string | null, consumesValue: boolean] {
  if (!VALUE_FLAGS.has(token)) {
    return [crossToolAdminRefusal(token) ?? aliasRefusal(token, KNOWN_FLAGS) ?? `unknown flag ${token}`, false];
  }
  if (value === undefined || value.startsWith("--")) {
    return [`${token} requires a value`, false];
  }
  if (token === "--viewport" && parseViewport(value) === null) {
    return ["--viewport requires WIDTHxHEIGHT positive integers", true];
  }
  return [null, true];
}

/** `--frames` (optional numeric offset) and HELP_FLAGS (never consume a value) both bypass the ordinary
 *  VALUE_FLAGS scan — split out purely to keep scanArgv under the biome cognitive-complexity cap. Returns
 *  the extra-token count to skip, or null when `token` is neither. */
function specialFlagSkip(token: string, peek: string | undefined): number | null {
  if (token === "--frames") {
    return peek !== undefined && INT_RE.test(peek) ? 1 : 0;
  }
  return HELP_FLAGS.has(token) ? 0 : null;
}

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
    const special = specialFlagSkip(token, argv[index + 1]);
    if (special !== null) {
      index += special;
      continue;
    }
    const [error, consumesValue] = scanValueFlag(token, argv[index + 1]);
    if (error !== null) {
      errors.push(error);
    }
    if (consumesValue) {
      index += 1;
    }
  }
  if (routeCount > 1) {
    errors.push(`expected at most one route, got ${routeCount}`);
  }
  return errors;
}
