// THE ONE STACK GRAMMAR. `stack.sh` classifies EVERY invocation through this parser (the `classify` verb)
// and switches on its output instead of re-implementing the grammar in bash.
//
// THE DEFECT THIS EXISTS FOR: the shell used to look for a mode in argument position 2 and let anything it
// did not recognise fall through to DEV. That is how `restart --force prod` became "SIGKILL the port
// holders AND the detached vLLM fleet, then boot dev" — a destructive verb aimed at the wrong mode.
import type { StackInvocation, StackMode, StackParse, StackVerb } from "../contract/types.ts";
import { STACK_MODES } from "../contract/types.ts";

/** `start`/`stop` are the ORIGINAL spellings and stay first-class forever: playwright's webServer
 *  (`stack.sh start-fg`), snap-stage's boot/teardown and multi-user-fixture.sh all call them by name.
 *  `up`/`down` are the owner-facing spelling added with modes.
 *
 *  `up-fg` (`start-fg`) is FOREGROUND: in dev it is the Playwright webServer entrypoint (server + vite in
 *  the foreground, caller reaps); in prod it is the on-box direct run — `NODE_ENV=production node <entry>.ts`
 *  in this terminal — that replaced the removed `pnpm start`. `_leader` is the DEV-ONLY setsid re-exec
 *  target. Both live in this table because a verb the parser does not know must exit 2, so a known-internal
 *  is not unknown. */
const VERB_ALIASES: Readonly<Record<string, StackVerb>> = {
  up: "up",
  start: "up",
  down: "down",
  stop: "down",
  restart: "restart",
  "force-restart": "restart",
  status: "status",
  logs: "logs",
  "start-fg": "up-fg",
  _leader: "_leader",
};

/** The dev-only verbs. `_leader` is the setsid re-exec target — prod has no setsid leader (its supervisor
 *  either detaches the server itself, for `up prod`, or runs it in this terminal, for `start-fg prod`). */
const DEV_ONLY_VERBS: ReadonlySet<StackVerb> = new Set<StackVerb>(["_leader"]);

/** The `stack.sh` case-label each verb maps back to. */
const VERB_TO_SHELL_LABEL: Readonly<Record<StackVerb, string>> = {
  up: "start",
  down: "stop",
  restart: "restart",
  status: "status",
  logs: "logs",
  "up-fg": "start-fg",
  _leader: "_leader",
};

/** The usage line — one home, printed by the shell's `*)` arm AND by every parser refusal. */
export const STACK_USAGE =
  "usage: stack.sh {up|start|start-fg|down|stop|restart [--force]|force-restart|status|logs [server|client] [n]} [dev|prod] [--debug] [--build]";

type TailParse =
  | { readonly ok: true; readonly mode: StackMode; readonly debug: boolean; readonly build: boolean; readonly force: boolean; readonly rest: readonly string[] }
  | { readonly ok: false; readonly error: string };

function isStackMode(value: string): value is StackMode {
  return (STACK_MODES as readonly string[]).includes(value);
}

/** The post-verb argument sweep: the optional positional mode, the three flags, and everything else as
 *  passthrough. An unrecognised `--flag` is an ERROR, never a silently-ignored word. */
function parseTail(tail: readonly string[], forcedByVerb: boolean): TailParse {
  let mode: StackMode = "dev";
  let debug = false;
  let force = forcedByVerb;
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

/** argv (WITHOUT the node/script prefix) → an invocation. Grammar:
 *    `<verb> [mode] [--debug] [--build] [--force] [rest…]`
 *  A bare `pnpm stack` is `status dev` (the pre-existing default). Mode is positional and OPTIONAL, so
 *  every call that existed before modes (`stack start`, `stack restart --force`, `stack logs server 80`)
 *  parses to exactly what it did before. */
export function parseStackArgv(argv: readonly string[]): StackParse {
  if (argv.length === 0) {
    return { ok: true, invocation: { verb: "status", mode: "dev", debug: false, build: false, force: false, rest: [] } };
  }
  const [rawVerb, ...tail] = argv;
  const verb = VERB_ALIASES[rawVerb ?? ""];
  if (verb === undefined) {
    return { ok: false, error: `unknown verb '${rawVerb ?? ""}' — expected one of ${Object.keys(VERB_ALIASES).join(" | ")}` };
  }
  // `force-restart` is the standing alias for `restart --force`; keep its flag implied.
  const tailParse = parseTail(tail, rawVerb === "force-restart");
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
      error: `'${rawVerb ?? ""}' is an internal dev-only re-exec target: prod has no setsid leader (its supervisor detaches the server for 'up prod', or runs it in the foreground for 'start-fg prod')`,
    };
  }
  if (force && mode === "prod") {
    // The dev `--force` NUKES the port holders AND the detached vLLM fleet, ignoring ownership. Prod has
    // no such verb by design — its whole safety story is that it only ever signals an instance whose
    // IDENTITY it proved. Silently dropping the flag would be the same class of defect as falling
    // through to dev: the operator asked for something destructive and would get something else.
    return {
      ok: false,
      error: "--force is dev-only: the prod supervisor never kills a process it cannot prove is its own. Stop the port holder yourself, then `stack up prod`",
    };
  }
  return { ok: true, invocation: { verb, mode, debug, build, force, rest } };
}

/** The shell contract: `stack.sh` execs the prod entry's `classify --` verb and switches on these lines.
 *  `rest` is emitted one line per argument so a value containing spaces survives; every line is
 *  `key=value` and the reader splits on the FIRST `=`. */
export function formatDispatch(invocation: StackInvocation): string {
  return [
    `verb=${VERB_TO_SHELL_LABEL[invocation.verb]}`,
    `mode=${invocation.mode}`,
    `debug=${invocation.debug ? "1" : ""}`,
    `build=${invocation.build ? "1" : ""}`,
    `force=${invocation.force ? "1" : ""}`,
    ...invocation.rest.map((arg) => `rest=${arg}`),
    "",
  ].join("\n");
}
