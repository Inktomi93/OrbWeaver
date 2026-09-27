// `stack up`, `up-fg` and `restart`: the preflight over the record and the ports, the detached leader
// spawn with its readiness poll, and the foreground leader for a caller that owns the tree (Playwright).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { httpOk } from "../../_shared/http-probe.ts";
import { budget } from "../../_shared/load-budget.ts";
import { warn } from "../../_shared/log.ts";
import { listeningPids } from "../../_shared/platform.ts";
import { spawnFullPriorityChild } from "../../_shared/proc.ts";
import type { StackContext, StackInvocation } from "../contract/types.ts";
import { debugConflictMessage, resolveDebugArming } from "../lib/debug-env.ts";
import { LAUNCH_ID_ENV } from "../lib/leader-record.ts";
import { pidIsAlive } from "../lib/spawn-lock.ts";
import { healthzUrl, STACK_CLI_REL, viteUrl } from "../lib/stack-plan.ts";
import { doDevDown, log, readVerdict, refuseUnreadableTable, result } from "./dev-down.ts";
import { rotateLog, runLeader } from "./leader.ts";
import { readEnvFile } from "./prod-state.ts";
import { debugToken } from "./prod-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm stack up");

/** Quiet-box ceiling for the readiness poll: ahead of the server's own healthz gate plus a cold vite
 *  compile, so the supervisor never declares a timeout while the leader is legitimately still booting. */
const READINESS_BASE_MS = 960_000;
const READINESS_POLL_MS = 1000;
// Log lines echoed when a boot dies or times out: enough to carry a stack trace, short enough to read.
const BOOT_FAILURE_LOG_LINES = 20;
const LINE_BREAK_RE = /\r?\n/u;

type Preflight =
  | { readonly kind: "free" }
  | { readonly kind: "already-up"; readonly group: string }
  | { readonly kind: "port-conflict"; readonly server: number | null; readonly vite: number | null }
  | { readonly kind: "unreadable"; readonly reason: string };

/** May a leader boot? A live record is an idempotent no-op; a bound port that is not a live record is
 *  refused, because two stacks cannot share a pair and an unknown owner is never fought. A socket table that
 *  cannot be read is not a free pair. */
function preflight(ctx: StackContext): Preflight {
  const { read, state } = readVerdict(ctx);
  if (read.kind === "record" && state === "live") {
    return { kind: "already-up", group: String(read.record.pgid ?? read.record.pid) };
  }
  const table = listeningPids();
  if (table.kind === "refused") {
    return { kind: "unreadable", reason: table.reason };
  }
  const server = table.value.get(ctx.ports.server) ?? null;
  const vite = table.value.get(ctx.ports.vite) ?? null;
  return server === null && vite === null ? { kind: "free" } : { kind: "port-conflict", server, vite };
}

/** Resolve `--debug` into a spawn overlay, or refuse loudly. `undefined` = not asked for; `null` = refused. */
function armDebug(invocation: StackInvocation): Readonly<Record<string, string>> | undefined | null {
  if (!invocation.debug) {
    return;
  }
  const arming = resolveDebugArming({ fileEnv: readEnvFile(), token: debugToken() });
  if (arming.kind === "refused") {
    warn(debugConflictMessage(arming.conflicts));
    return null;
  }
  for (const note of arming.notes) {
    log(`[debug] ${note}`);
  }
  log("--debug armed the /api/_debug surface for this stack (env overlay; .env untouched).");
  return arming.overlay;
}

function tailFile(path: string, lines: number): string {
  // @orb-waive caught-failure-ownership(catch): an unreadable optional log renders the explicit no-log sentinel to the operator. Ends if log content becomes a control verdict.
  try {
    return readFileSync(path, "utf8").split(LINE_BREAK_RE).slice(-lines).join("\n");
  } catch {
    return "(no log)";
  }
}

async function stackAnswers(ctx: StackContext): Promise<boolean> {
  return (await httpOk(viteUrl(ctx.ports.vite))) && (await httpOk(healthzUrl(ctx.ports.server)));
}

/** Spawn the detached leader and poll until the stack answers, the leader dies, or the ceiling runs out. */
async function bootDetached(ctx: StackContext, overlay: Readonly<Record<string, string>>): Promise<ExitCode> {
  rotateLog(ctx.logs.stack);
  const inherited: Record<string, string> = {};
  for (const [key, value] of Object.entries(ctx.ambient)) {
    if (value !== undefined) {
      inherited[key] = value;
    }
  }
  const env = { ...inherited, ...overlay, [LAUNCH_ID_ENV]: randomUUID() };
  // `detached` gives the leader its own session and group, so one group id names the whole tree.
  const child = spawnFullPriorityChild(process.execPath, [join(ctx.repoRoot, STACK_CLI_REL), "_leader"], {
    cwd: ctx.repoRoot,
    env,
    logPath: ctx.logs.stack,
    detached: true,
  });
  const pid = child.pid;
  if (pid === undefined) {
    log("spawn failed — no pid.");
    result("status=spawn-failed");
    return EXIT.violations;
  }
  child.unref();
  log(`booting (pgid ${String(pid)}, log ${ctx.logs.stack})…`);
  const polls = Math.ceil(budget(READINESS_BASE_MS) / READINESS_POLL_MS);
  for (let poll = 0; poll < polls; poll += 1) {
    await sleep(READINESS_POLL_MS);
    if (await stackAnswers(ctx)) {
      log(`up — server :${String(ctx.ports.server)} (healthz ok) · vite :${String(ctx.ports.vite)}`);
      result(`status=up pgid=${String(pid)} log=${ctx.logs.stack}`);
      return EXIT.clean;
    }
    if (!pidIsAlive(pid)) {
      log("the leader died during boot — leader log:");
      print(tailFile(ctx.logs.stack, BOOT_FAILURE_LOG_LINES));
      await doDevDown(ctx, { quiet: true });
      result(`status=boot-failed log=${ctx.logs.stack}`);
      return EXIT.violations;
    }
  }
  log("TIMEOUT waiting for readiness — leader log:");
  print(tailFile(ctx.logs.stack, BOOT_FAILURE_LOG_LINES));
  result(`status=boot-timeout pgid=${String(pid)} log=${ctx.logs.stack}`);
  return EXIT.violations;
}

function refuseConflict(ctx: StackContext, conflict: Extract<Preflight, { kind: "port-conflict" }>): ExitCode {
  log(`ports busy (server=${String(conflict.server ?? 0)} vite=${String(conflict.vite ?? 0)}) but not a live stack recorded under ${ctx.runDir}.`);
  log("refusing to fight an unknown owner — inspect with 'status'; 'down' stops a holder from this checkout, or stop it yourself.");
  result(`status=port-conflict server-pid=${String(conflict.server ?? 0)} vite-pid=${String(conflict.vite ?? 0)} pidfile=${ctx.runDir}`);
  return EXIT.violations;
}

/** `up`: idempotent over a live stack; `--force` stops whatever this checkout holds on the ports first. */
export async function doDevUp(ctx: StackContext, invocation: StackInvocation): Promise<ExitCode> {
  if (invocation.force) {
    const down = await doDevDown(ctx, { quiet: true });
    if (down !== EXIT.clean) {
      return down;
    }
  }
  const pre = preflight(ctx);
  if (pre.kind === "already-up") {
    log(`already running (pgid ${pre.group}) — use 'restart', or 'status' to inspect`);
    result(`status=already-up pgid=${pre.group}`);
    return EXIT.clean;
  }
  if (pre.kind === "unreadable") {
    return refuseUnreadableTable(pre.reason, "pgid=none");
  }
  if (pre.kind === "port-conflict") {
    return refuseConflict(ctx, pre);
  }
  const overlay = armDebug(invocation);
  if (overlay === null) {
    return EXIT.violations;
  }
  return await bootDetached(ctx, overlay ?? {});
}

/** `up-fg`: the same leader body in this terminal, no record; the caller owns and reaps the tree. A live
 *  stack refuses too, because a foreground leader must own what it boots. */
export async function doDevUpFg(ctx: StackContext, invocation: StackInvocation): Promise<ExitCode> {
  const pre = preflight(ctx);
  if (pre.kind === "already-up") {
    log(`already running (pgid ${pre.group}) — a foreground leader must own the ports it boots`);
    result(`status=already-up pgid=${pre.group}`);
    return EXIT.violations;
  }
  if (pre.kind === "unreadable") {
    return refuseUnreadableTable(pre.reason, "pgid=none");
  }
  if (pre.kind === "port-conflict") {
    return refuseConflict(ctx, pre);
  }
  const overlay = armDebug(invocation);
  if (overlay === null) {
    return EXIT.violations;
  }
  return (await runLeader(ctx, { record: false, overlay: overlay ?? {} })) as ExitCode;
}

export async function doDevRestart(ctx: StackContext, invocation: StackInvocation): Promise<ExitCode> {
  const down = await doDevDown(ctx, { quiet: true });
  if (down !== EXIT.clean) {
    return down;
  }
  return await doDevUp(ctx, { ...invocation, force: false });
}
