// The prod launcher's STOP/REPORT side: `down` (SIGTERM → watch the bounded drain → confirm gone) and
// `status`. `down` may only signal an instance whose IDENTITY it proved — that is the whole safety story,
// and why prod has no `--force`.
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { SERVER_ENTRY_REL } from "../../_shared/server-entry.ts";
import type { DrainOutcome, ProdRecord } from "../contract/types.ts";
import { decideDown } from "../lib/identity.ts";
import { spawnerForPort } from "../lib/spawners.ts";
import { classifyDrainTail, DRAIN_WATCH_MS, debugPostureText } from "../lib/verdicts.ts";
import { classify, LOG_PATH, log, MS_PER_SECOND, PIDFILE, POLL_INTERVAL_MS, processAlive, readEnvFile, resolvePort, result, TOKEN_PATH } from "./prod-state.ts";
import { distVerdict, readFrom, removePidfile, safeSize, uptimeText } from "./prod-support.ts";

refuseDirectInvocation(import.meta.url, "bash tooling/src/stack/stack.sh <verb>");

function processIsGone(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH";
}

/** The two collaborators a failure test must steer — the ownership verdict and the liveness poll. Everything
 *  else `doDown` reaches is real. An INJECTION SEAM, not a knob (`Spine-Testing.md` §3: internal modules are
 *  injected, never `vi.mock`ed); production callers take the defaults and are unchanged. */
export interface DownDeps {
  readonly classify: typeof classify;
  readonly processAlive: typeof processAlive;
}

const REAL_DOWN_DEPS: DownDeps = { classify, processAlive };

export async function doDown(deps: DownDeps = REAL_DOWN_DEPS): Promise<ExitCode> {
  const port = resolvePort(readEnvFile());
  const { record, classification } = await deps.classify(port);
  const decision = decideDown(classification);
  if (decision.action === "noop") {
    log(`nothing to stop — ${decision.reason}.`);
    removePidfile();
    result(`mode=prod status=stopped port=${port}`);
    return EXIT.clean;
  }
  if (decision.action === "refuse" || record === null) {
    log(`REFUSED — ${decision.reason}. This tool only signals an instance whose identity it can prove.`);
    result(`mode=prod status=refused port=${port}`);
    return EXIT.violations;
  }

  const logSizeAtSignal = safeSize(record.logPath);
  log(`SIGTERM → pid ${record.pid}; watching the bounded drain (${DRAIN_WATCH_MS / MS_PER_SECOND}s max)…`);
  // @orb-waive caught-failure-ownership(error): ESRCH alone means the verified pid vanished before SIGTERM; every other signal error is rethrown. Ends if signal classification changes.
  try {
    process.kill(record.pid, "SIGTERM");
  } catch (error) {
    if (!processIsGone(error)) {
      throw error;
    }
    log("the process vanished before the signal landed.");
  }
  const outcome = await watchDrain(record, logSizeAtSignal, deps.processAlive);
  if (outcome === "deadline-hit") {
    log("drain deadline hit — long-lived streams were force-closed (expected during a deploy; a client saw a truncated stream).");
  } else if (outcome === "complete") {
    log("shutdown: complete");
  } else {
    log(`the process did not report a clean shutdown within ${DRAIN_WATCH_MS / MS_PER_SECOND}s — escalating to SIGKILL on the process group.`);
    // @orb-waive caught-failure-ownership(error): ESRCH alone means the verified group vanished before SIGKILL; every other signal error is rethrown. Ends if signal classification changes.
    try {
      process.kill(-record.pgid, "SIGKILL");
    } catch (error) {
      if (!processIsGone(error)) {
        throw error;
      }
    }
  }
  await waitGone(record.pid, deps.processAlive);
  removePidfile();
  log(`stopped (pid ${record.pid}).`);
  result(`mode=prod status=stopped pid=${record.pid} port=${port} drain=${outcome}`);
  return EXIT.clean;
}

/** Watch the prod log from the byte offset at SIGTERM for the lifecycle's own shutdown lines. Reading the
 *  log (not just polling the pid) is what turns "tail -f and eyeball it" into a verdict. */
async function watchDrain(record: ProdRecord, fromOffset: number, isAlive: DownDeps["processAlive"]): Promise<DrainOutcome> {
  const deadline = Date.now() + DRAIN_WATCH_MS;
  while (Date.now() < deadline) {
    const outcome = classifyDrainTail(readFrom(record.logPath, fromOffset));
    if (outcome !== "pending") {
      return outcome;
    }
    if (!isAlive(record.pid)) {
      return classifyDrainTail(readFrom(record.logPath, fromOffset));
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return "pending";
}

async function waitGone(pid: number, isAlive: DownDeps["processAlive"]): Promise<void> {
  const deadline = Date.now() + DRAIN_WATCH_MS;
  while (Date.now() < deadline && isAlive(pid)) {
    await sleep(POLL_INTERVAL_MS);
  }
  if (isAlive(pid)) {
    throw new Error(`pid ${pid} remained live after the shutdown deadline`);
  }
}

export async function doStatus(): Promise<ExitCode> {
  const port = resolvePort(readEnvFile());
  const { record, observed, classification } = await classify(port);
  const dist = distVerdict();
  const foreign = observed.listenerPid !== null && classification.verdict === "foreign" ? spawnerForPort(port) : undefined;

  print(`mode          : prod (NODE_ENV=production · node ${SERVER_ENTRY_REL} · no server build step)`);
  print(`pidfile       : ${PIDFILE()} ${record === null ? "(none)" : `→ pid ${record.pid}, started ${record.startedAt}`}`);
  print(
    `server :${port}  : ${observed.listenerPid === null ? "not bound" : `pid ${observed.listenerPid}`} · healthz ${observed.healthy ? "ok" : "unreachable"}${observed.harness === true ? " · HARNESS STACK" : ""}`,
  );
  print(`identity      : ${classification.verdict} — ${classification.reason}`);
  if (foreign !== undefined) {
    print(`               :${port} is also the ${foreign.name} port (${foreign.discriminator})`);
  }
  print(`uptime        : ${record === null || !observed.healthy ? "—" : uptimeText(record.startedAt)}`);
  print(`debug         : ${debugPostureText(observed.posture, TOKEN_PATH())}`);
  print(`client bundle : ${dist.state} — ${dist.message}`);
  print(`log           : ${LOG_PATH()}`);
  result(
    `mode=prod status=${classification.verdict} port=${port} pid=${observed.listenerPid ?? 0} healthz=${observed.healthy ? "ok" : "unreachable"} debug=${observed.posture} dist=${dist.state}`,
  );
  return EXIT.clean;
}
