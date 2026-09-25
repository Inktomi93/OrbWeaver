// The prod launcher's START side: `up` (detached, identity-verified), `up-fg` (this terminal owns it),
// `restart`, plus the spawn-window lock and `--debug` arming. Every decision comes from lib/ (pure);
// this file only performs them.
//
// FULL PRIORITY, deliberately (policy `tooling-child-process-door`, reviewed grant `tooling-child-process-door:stack-prod-up`): the process spawned
// here IS the application serving the operator's requests — a `nice -19` production server degrades the
// very thing the launcher exists to run.
import { mkdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { print, REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import { spawnFullPriorityChild } from "../../_shared/proc.ts";
import { childExitCode, forwardSignalsTo } from "../../_shared/proc-signals.ts";
import { SERVER_ENTRY_REL } from "../../_shared/server-entry.ts";
import type { ProdRecord, StackInvocation } from "../contract/types.ts";
import { debugConflictMessage, resolveDebugArming } from "../lib/debug-env.ts";
import { classifyInstance, decideUp } from "../lib/identity.ts";
import { mayRemovePidfile, serializeProdRecord } from "../lib/prod-record.ts";
import type { SpawnLockOpts } from "../lib/spawn-lock.ts";
import { acquireSpawnLock, releaseSpawnLock } from "../lib/spawn-lock.ts";
import { buildProdSpawnPlan } from "../lib/spawn-plan.ts";
import { spawnerForPort } from "../lib/spawners.ts";
import { doDown } from "./prod-down.ts";
import {
  AMBIENT,
  classify,
  LOCK_PATH,
  LOG_PATH,
  log,
  MS_PER_SECOND,
  observe,
  PIDFILE,
  POLL_INTERVAL_MS,
  processAlive,
  readEnvFile,
  readRecord,
  resolvePort,
  result,
  runDir,
  TOKEN_PATH,
} from "./prod-state.ts";
import { buildClient, debugToken, distVerdict, removePidfile, reportDebugPosture, tailLog } from "./prod-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm stack <verb> prod");

const BOOT_POLL_MAX_MS = 120_000;
// Log lines echoed when a boot dies or times out — enough to carry a stack trace, short enough to read.
const BOOT_FAILURE_LOG_LINES = 20;

/** Resolve `--debug` into a spawn overlay, or refuse loudly. `undefined` = debug was not asked for; `null`
 *  = REFUSED (the caller returns EXIT.violations without touching the running instance). */
function armDebug(invocation: StackInvocation, fileEnv: Readonly<Record<string, string | undefined>>): Readonly<Record<string, string>> | undefined | null {
  if (!invocation.debug) {
    return;
  }
  const arming = resolveDebugArming({ fileEnv, token: debugToken() });
  if (arming.kind === "refused") {
    warn(debugConflictMessage(arming.conflicts));
    return null;
  }
  for (const note of arming.notes) {
    log(note);
  }
  log(`debug surface ARMED — /api/_debug/* + wire capture + rpg trace. Token in ${TOKEN_PATH()} (mode 0600; not printed).`);
  return arming.overlay;
}

function withSpawnLock(): SpawnLockOpts {
  return { lockPath: LOCK_PATH(), selfPid: process.pid, isAlive: processAlive, log };
}

/** Build-then-gate: `--build` runs FIRST (a failed build must never leave the box with no server AND no
 *  bundle), then the dist gate refuses a missing bundle before anything is stopped. */
function preflightBundle(invocation: StackInvocation): ExitCode | null {
  if (invocation.build && !buildClient()) {
    result("mode=prod status=build-failed");
    return EXIT.violations;
  }
  const dist = distVerdict();
  if (dist.state === "missing") {
    log(`REFUSED — ${dist.message}`);
    result("mode=prod status=no-client-bundle");
    return EXIT.violations;
  }
  if (dist.state === "stale") {
    log(`WARN — ${dist.message}`);
  }
  return null;
}

export async function doUp(invocation: StackInvocation): Promise<ExitCode> {
  const fileEnv = readEnvFile();
  const port = resolvePort(fileEnv);
  const { classification } = await classify(port);
  const decision = decideUp(classification);

  if (decision.action === "adopt") {
    log(`already up — ${decision.reason}. Adopted in place; nothing spawned.`);
    await reportDebugPosture(port);
    const adopted = readRecord();
    result(`mode=prod status=already-up port=${port} pid=${adopted === null ? 0 : adopted.pid}`);
    return EXIT.clean;
  }
  if (decision.action === "refuse") {
    refusePort(port, decision.reason);
    return EXIT.violations;
  }
  const preflight = preflightBundle(invocation);
  if (preflight !== null) {
    return preflight;
  }
  const overlay = armDebug(invocation, fileEnv);
  if (overlay === null) {
    return EXIT.violations;
  }
  return await spawnProd(port, overlay !== undefined, overlay);
}

function refusePort(port: number, reason: string): void {
  const owner = spawnerForPort(port);
  log(`REFUSED — ${reason}.`);
  if (owner !== undefined) {
    log(`:${port} is also the ${owner.name} port (${owner.discriminator}). Stop that first, or point PORT elsewhere.`);
  }
  result(`mode=prod status=refused port=${port}`);
}

async function spawnProd(port: number, debug: boolean, overlay: Readonly<Record<string, string>> | undefined): Promise<ExitCode> {
  if (!acquireSpawnLock(withSpawnLock())) {
    result(`mode=prod status=spawn-locked port=${port}`);
    return EXIT.violations;
  }
  try {
    return await spawnProdLocked(port, debug, overlay);
  } finally {
    releaseSpawnLock(LOCK_PATH());
  }
}

/** The spawn itself, running under the spawn lock — see `acquireSpawnLock`. */
async function spawnProdLocked(port: number, debug: boolean, overlay: Readonly<Record<string, string>> | undefined): Promise<ExitCode> {
  mkdirSync(runDir(), { recursive: true });
  const plan = buildProdSpawnPlan({
    repoRoot: REPO_ROOT,
    nodePath: process.execPath,
    baseEnv: AMBIENT,
    ...(overlay === undefined ? {} : { debugOverlay: overlay }),
    logPath: LOG_PATH(),
  });
  // `detached:true` calls setsid(2) in the child BEFORE exec — so the child is its own session/group
  // leader (pgid === pid), survives this launcher's exit, and one group-kill takes its whole tree.
  const child = spawnFullPriorityChild(plan.command, plan.args, { cwd: plan.cwd, env: { ...plan.env }, logPath: plan.logPath, detached: true });
  if (child.pid === undefined) {
    log("spawn failed — no pid.");
    result("mode=prod status=spawn-failed");
    return EXIT.violations;
  }
  const pid = child.pid;
  // unref BEFORE the poll: the handle would otherwise hold this launcher's event loop open for as long as
  // the server lives (the immortal-launcher class the engines fleet paid for).
  child.unref();
  const record: ProdRecord = {
    mode: "prod",
    pid,
    pgid: pid,
    port,
    startedAt: new Date().toISOString(),
    debug,
    repoRoot: REPO_ROOT,
    logPath: plan.logPath,
  };
  writeFileSync(PIDFILE(), serializeProdRecord(record));
  log(`spawned pid ${pid} (NODE_ENV=production node ${SERVER_ENTRY_REL}) — log ${plan.logPath}`);

  const deadline = Date.now() + BOOT_POLL_MAX_MS;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) {
      log("the server EXITED during boot — last log lines:");
      print(tailLog(BOOT_FAILURE_LOG_LINES));
      // GUARDED, never unconditional: only clear the record if it is still OURS. An overlapping `up` whose
      // child died on EADDRINUSE would otherwise delete the winner's pidfile, and `down prod` would then
      // refuse to stop the instance this tool started.
      if (mayRemovePidfile(readRecord(), pid)) {
        removePidfile();
      } else {
        log("another launcher's record is on disk — leaving its pidfile intact.");
      }
      result(`mode=prod status=boot-failed log=${plan.logPath}`);
      return EXIT.violations;
    }
    const observed = await observe(port);
    if (classifyInstance({ record, observed, recordProcessAlive: true }).verdict === "ours-healthy") {
      log("up — verified by identity and answering /healthz");
      await reportDebugPosture(port);
      result(`mode=prod status=up pid=${pid} port=${port} debug=${debug} log=${plan.logPath}`);
      return EXIT.clean;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  log(`TIMEOUT after ${BOOT_POLL_MAX_MS / MS_PER_SECOND}s waiting for a verified-healthy instance — last log lines:`);
  print(tailLog(BOOT_FAILURE_LOG_LINES));
  result(`mode=prod status=boot-timeout pid=${pid} log=${plan.logPath}`);
  return EXIT.violations;
}

/** `up-fg prod` — run the PRODUCTION server in the FOREGROUND: `NODE_ENV=production node <entry>.ts` in
 *  THIS terminal, stdio inherited, the CALLER supervising and reaping it (Ctrl-C stops it). No detach, no
 *  pidfile. Foreground OWNS the port it boots: any live listener, ours or foreign, is a refusal (two
 *  servers cannot both bind :port). */
export async function doUpFg(invocation: StackInvocation): Promise<ExitCode> {
  const fileEnv = readEnvFile();
  const port = resolvePort(fileEnv);
  const { classification } = await classify(port);
  if (classification.verdict !== "absent") {
    refusePort(port, classification.reason);
    return EXIT.violations;
  }
  const preflight = preflightBundle(invocation);
  if (preflight !== null) {
    return preflight;
  }
  const overlay = armDebug(invocation, fileEnv);
  if (overlay === null) {
    return EXIT.violations;
  }
  return await spawnProdForeground(port, overlay);
}

/** Reuses `buildProdSpawnPlan` (identical argv/env/cwd to the detached path — so the no-server-build-step
 *  + debug-overlay pins cover this launcher too) but with inherited stdio and WITHOUT `detached`, then
 *  AWAITS the child. No spawn lock and no pidfile: nothing is detached, so there is no adopt/kill race to
 *  guard and nothing for `down prod`/`status prod` to track — the operator's terminal IS the supervisor. */
async function spawnProdForeground(port: number, overlay: Readonly<Record<string, string>> | undefined): Promise<ExitCode> {
  const plan = buildProdSpawnPlan({
    repoRoot: REPO_ROOT,
    nodePath: process.execPath,
    baseEnv: AMBIENT,
    ...(overlay === undefined ? {} : { debugOverlay: overlay }),
    logPath: LOG_PATH(),
  });
  log(`foreground — NODE_ENV=production node ${SERVER_ENTRY_REL} on :${port}. This terminal owns it (Ctrl-C to stop); no pidfile.`);
  const child = spawnFullPriorityChild(plan.command, plan.args, { cwd: plan.cwd, env: { ...plan.env }, stdio: "inherit" });
  // Our own handlers keep a signal from killing this launcher before the child finishes its bounded drain:
  // the signal is passed on and the launcher resolves on the child's exit, mirroring its status.
  forwardSignalsTo(
    { noteStop: (): void => undefined, kill: (signal): void => child.kill(signal) },
    (signal, handler) => {
      process.on(signal, handler);
    },
    process.platform,
  );
  const exit = await child.wait();
  if (exit.error !== undefined) {
    log(`spawn failed — ${exit.error.message}`);
    return EXIT.violations;
  }
  return childExitCode(exit) as ExitCode;
}

/** `restart` — BUILD FIRST, then stop. A restart --build that stopped the server first would open a window
 *  where the box has no server AND (on a failed build) no bundle to boot one against. */
export async function doRestart(invocation: StackInvocation): Promise<ExitCode> {
  if (invocation.build && !buildClient()) {
    result("mode=prod status=build-failed");
    return EXIT.violations;
  }
  const down = await doDown();
  if (down !== EXIT.clean) {
    return down;
  }
  return await doUp({ ...invocation, build: false });
}
