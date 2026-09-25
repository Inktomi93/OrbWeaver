// THE ONE STACK GRAMMAR: the cli parses every invocation here and dispatches on the result, so nothing
// unclassifiable can fall through to a default verb. A word the parser does not know exits 2 with usage.
import type { FixtureVerb, StackCommandParse, StackMode, StackParse, StackVerb } from "../contract/types.ts";
import { FIXTURE_VERBS, STACK_MODES, STACK_VERBS } from "../contract/types.ts";

/** The words that leave the dev/prod grammar: the production launcher, the fixture recipe and the
 *  served-module probe a staged tree's caller runs by name. */
const START_WORD = "start";
const FIXTURE_WORD = "fixture";
const SERVED_PROBE_WORD = "served-probe";

/** The dev-only verbs. `_leader` is the detached re-exec target; prod has no leader (its supervisor
 *  either detaches the server itself, for `up prod`, or runs it in this terminal, for `up-fg prod`). */
const DEV_ONLY_VERBS: ReadonlySet<StackVerb> = new Set<StackVerb>(["_leader"]);

/** The usage line — one home, printed by every parser refusal. */
export const STACK_USAGE = [
  "usage: pnpm stack {up|up-fg|down|restart [--force]|status|logs [server|client] [n]} [dev|prod] [--debug] [--build]",
  `       pnpm stack ${START_WORD} [--build | --no-build] [--setup] [--port <n>] [--share]   (the production launcher; also \`pnpm start\`)`,
  `       pnpm stack ${FIXTURE_WORD} {${FIXTURE_VERBS.join("|")}}   (the two-human sidecar; also \`pnpm fixture\`)`,
  `       pnpm stack ${SERVED_PROBE_WORD}`,
].join("\n");

type TailParse =
  | { readonly ok: true; readonly mode: StackMode; readonly debug: boolean; readonly build: boolean; readonly force: boolean; readonly rest: readonly string[] }
  | { readonly ok: false; readonly error: string };

function isStackMode(value: string): value is StackMode {
  return (STACK_MODES as readonly string[]).includes(value);
}

function isStackVerb(value: string): value is StackVerb {
  return (STACK_VERBS as readonly string[]).includes(value);
}

function isFixtureVerb(value: string): value is FixtureVerb {
  return (FIXTURE_VERBS as readonly string[]).includes(value);
}

/** The post-verb argument sweep: the optional positional mode, the three flags, and everything else as
 *  passthrough. An unrecognised `--flag` is an ERROR, never a silently-ignored word. */
function parseTail(tail: readonly string[]): TailParse {
  let mode: StackMode = "dev";
  let debug = false;
  let force = false;
  let build = false;
  let modeSeen = false;
  const rest: string[] = [];
  for (const arg of tail) {
    if (arg === "--debug") {
      debug = true;
    } else if (arg === "--build") {
      build = true;
    } else if (arg === "--force") {
      force = true;
    } else if (!modeSeen && isStackMode(arg)) {
      mode = arg;
      modeSeen = true;
    } else if (arg.startsWith("--")) {
      return { ok: false, error: `unknown flag '${arg}' — expected --debug | --build | --force` };
    } else {
      rest.push(arg);
    }
  }
  return { ok: true, mode, debug, build, force, rest };
}

/** The dev/prod grammar: `<verb> [mode] [--debug] [--build] [--force] [rest…]`. A bare `pnpm stack` is
 *  `status dev`. Mode is positional and optional. */
export function parseStackArgv(argv: readonly string[]): StackParse {
  if (argv.length === 0) {
    return { ok: true, invocation: { verb: "status", mode: "dev", debug: false, build: false, force: false, rest: [] } };
  }
  const [rawVerb = "", ...tail] = argv;
  if (!isStackVerb(rawVerb)) {
    return {
      ok: false,
      error: `unknown verb '${rawVerb}' — expected one of ${STACK_VERBS.join(" | ")} | ${START_WORD} | ${FIXTURE_WORD} | ${SERVED_PROBE_WORD}`,
    };
  }
  const verb = rawVerb;
  const tailParse = parseTail(tail);
  if (!tailParse.ok) {
    return tailParse;
  }
  const { mode, debug, build, force, rest } = tailParse;
  if (build && mode !== "prod") {
    return { ok: false, error: "--build is prod-only: dev mode serves the client through the vite dev server, which needs no bundle" };
  }
  if (mode === "prod" && DEV_ONLY_VERBS.has(verb)) {
    return {
      ok: false,
      error: `'${verb}' is an internal dev-only re-exec target: prod has no leader (its supervisor detaches the server for 'up prod', or runs it in the foreground for 'up-fg prod')`,
    };
  }
  if (force && mode === "prod") {
    // Prod's whole safety story is that it only ever signals an instance whose identity it proved; a
    // silently dropped flag would be the same class of defect as falling through to dev.
    return {
      ok: false,
      error: "--force is dev-only: the prod supervisor never kills a process it cannot prove is its own. Stop the port holder yourself, then `stack up prod`",
    };
  }
  return { ok: true, invocation: { verb, mode, debug, build, force, rest } };
}

/** argv (without the node/script prefix) → the command the cli runs. The first word decides the grammar:
 *  the launcher's flags pass through untouched, a fixture verb defaults to `up`, and everything else is the
 *  dev/prod grammar. */
export function parseStackCommand(argv: readonly string[]): StackCommandParse {
  const [first, ...rest] = argv;
  if (first === START_WORD) {
    return { ok: true, command: { kind: "start", argv: rest } };
  }
  if (first === FIXTURE_WORD) {
    const [verb = "up", ...extra] = rest;
    if (!isFixtureVerb(verb) || extra.length > 0) {
      return { ok: false, error: `usage: pnpm fixture {${FIXTURE_VERBS.join("|")}}` };
    }
    return { ok: true, command: { kind: "fixture", verb } };
  }
  if (first === SERVED_PROBE_WORD) {
    return rest.length === 0 ? { ok: true, command: { kind: "served-probe" } } : { ok: false, error: `${SERVED_PROBE_WORD} takes no arguments` };
  }
  const parsed = parseStackArgv(argv);
  return parsed.ok ? { ok: true, command: { kind: "stack", invocation: parsed.invocation } } : parsed;
}
