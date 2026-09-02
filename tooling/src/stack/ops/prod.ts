// ── stack-prod: the PRODUCTION half of `pnpm stack` ──────────────────────────────────────────────────
//
//   pnpm stack up prod [--debug] [--build]        boot production, detached, verified by INSTANCE IDENTITY
//   pnpm stack start-fg prod [--debug] [--build]  the production server in the FOREGROUND (this terminal)
//   pnpm stack down prod                          SIGTERM → watch the bounded drain → confirm gone
//   pnpm stack restart prod [--debug] [--build]
//   pnpm stack status prod
//
// This replaced a hand-rolled incantation the debug handoff doc made an operator retype (`setsid nohup env
// NODE_ENV=production node … & disown`, plus `ss | grep | grep -oP pid=` to find the pid, plus `tail -f` to
// eyeball the drain). Every trap that recipe carried is closed here:
//   • cwd — `.env` AND `CLIENT_DIST_DIR` are both cwd-relative; the spawn cwd is DERIVED, so the command
//     works from anywhere.
//   • dead boot — prod throws at startup without packages/client/dist/index.html. Checked BEFORE the old
//     instance is stopped, and reported as the build command instead of as a stack trace in a log.
//   • identity — a health check validates the PORT, and a stale incumbent answers. Nothing here trusts
//     /healthz alone: see classifyInstance in lib/identity.ts.
//   • .env editing — `--debug` arms DEBUG_TOKEN/WIRE_CAPTURE/RPG_TRACE as a spawn-time env OVERLAY. The
//     file is never written, and this launcher never mutates its own process.env.
//
// NO SERVER BUILD STEP: node 26 runs `packages/server/src/entry/index.ts` directly (type stripping).
// `--build` builds only the CLIENT bundle, through @orb/client's own `vite build` script.
//
// The DEV mode of `pnpm stack` is untouched and still lives in ../stack.sh.
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import { formatDispatch, parseStackArgv, STACK_USAGE } from "../lib/argv.ts";
import { bootBudgetLines } from "../lib/boot-budgets.ts";
import { debugConflictMessage, resolveDebugArming } from "../lib/debug-env.ts";
import { doDown, doStatus } from "./prod-down.ts";
import { readEnvFile, TOKEN_PATH } from "./prod-state.ts";
import { DEFAULT_LOG_LINES, debugToken, tailLog } from "./prod-support.ts";
import { doRestart, doUp, doUpFg } from "./prod-up.ts";
import { runServedProbe } from "./served-probe.ts";

refuseDirectInvocation(import.meta.url, "bash tooling/src/stack/stack.sh <verb>");

// `argv` here is ALREADY the operator's half (prod-entry.ts passes `process.argv.slice(2)`), so the verb
// sits at 0 and the `--` separator is searched from 1. Stated in the local frame on purpose: the old
// spelling searched the GLOBAL process.argv from index 3 — the same position, expressed in a frame this
// module cannot be handed by a caller or a test (Core-Tooling-Law §4.9).
const ARGV_AFTER_VERB = 1;

/** `debug-env` — the internal verb stack.sh calls for the DEV mode's `--debug` overlay, so both modes
 *  resolve arming through ONE implementation (including the `.env` conflict refusal). Prints `KEY=value`
 *  lines on stdout; the caller reads them with `read`, never `eval`. */
function doDebugEnv(): ExitCode {
  const arming = resolveDebugArming({ fileEnv: readEnvFile(), token: debugToken() });
  if (arming.kind === "refused") {
    warn(debugConflictMessage(arming.conflicts));
    return EXIT.violations;
  }
  for (const note of arming.notes) {
    warn(`stack[debug]: ${note}`);
  }
  warn(`stack[debug]: token in ${TOKEN_PATH()} (mode 0600; never printed).`);
  for (const [key, value] of Object.entries(arming.overlay)) {
    print(`${key}=${value}`);
  }
  return EXIT.clean;
}

/** `boot-budgets` — the internal verb stack.sh calls before a DEV boot, for the load-scaled `/healthz` and
 *  readiness ceilings (#1232 section 7.1). Same shape and same reason as `debug-env`: the shell is a front
 *  door and every number it acts on is node's, so the boot ceilings are not a second formula written in
 *  bash. Prints `KEY=<seconds>` lines on stdout; the caller reads them with `read`, never `eval`. */
function doBootBudgets(): ExitCode {
  for (const line of bootBudgetLines()) {
    print(line);
  }
  return EXIT.clean;
}

/** `classify` — the internal verb stack.sh calls FIRST, for EVERY invocation, before it does anything at
 *  all. The shell used to re-implement the grammar in bash and only look for a mode in argument position
 *  2; anything it did not recognise fell through to DEV. That is how `restart --force prod` became
 *  "SIGKILL the port holders AND the detached vLLM fleet, then boot dev" — a destructive verb aimed at the
 *  wrong mode. Now there is ONE grammar, the shell switches on its output, and anything unclassifiable
 *  exits 2 with usage. */
function doClassify(argv: readonly string[]): ExitCode {
  const parsed = parseStackArgv(argv);
  if (!parsed.ok) {
    warn(`stack: ${parsed.error}\n${STACK_USAGE}`);
    return EXIT.misuse;
  }
  print(formatDispatch(parsed.invocation).trimEnd());
  return EXIT.clean;
}

/** The prod launcher's whole dispatch. argv is WITHOUT the node/script prefix. */
export async function runStackProd(argv: readonly string[]): Promise<ExitCode> {
  if (argv[0] === "debug-env") {
    return doDebugEnv();
  }
  if (argv[0] === "boot-budgets") {
    return doBootBudgets();
  }
  if (argv[0] === "served-probe") {
    // The DEV mode's served-vs-disk freshness probe (#524), routed here for the same reason `debug-env` is:
    // stack.sh is a bash front door and every decision it makes is node's. Exit 1 = a STALE transform.
    return await runServedProbe();
  }
  if (argv[0] === "classify") {
    // `--` separates our verb from the operator's argv, so an operator arg named `classify` is inert.
    const sep = argv.indexOf("--", ARGV_AFTER_VERB);
    return doClassify(sep === -1 ? argv.slice(1) : argv.slice(sep + 1));
  }
  const parsed = parseStackArgv(argv);
  if (!parsed.ok) {
    warn(`stack[prod]: ${parsed.error}\n${STACK_USAGE}`);
    return EXIT.misuse;
  }
  const invocation = parsed.invocation;
  switch (invocation.verb) {
    case "up":
      return await doUp(invocation);
    case "up-fg":
      return await doUpFg(invocation);
    case "down":
      return await doDown();
    case "restart":
      return await doRestart(invocation);
    case "status":
      return await doStatus();
    case "logs":
      print(tailLog(Number(invocation.rest[0] ?? DEFAULT_LOG_LINES)).trimEnd());
      return EXIT.clean;
    // `_leader` is the DEV-ONLY setsid re-exec target (argv.ts `DEV_ONLY_VERBS`) — prod's supervisor is
    // its own, so `parseStackArgv` rejects it before this switch and it is unreachable HERE, not
    // undefined. Spelled as its own case rather than left to `default:` so a NEW verb fails the compile
    // (§5.5) instead of silently landing on the misuse arm.
    case "_leader":
      warn("stack[prod]: `_leader` is a dev-only verb — prod has no setsid leader");
      return EXIT.misuse;
  }
}
