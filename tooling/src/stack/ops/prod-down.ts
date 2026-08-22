// The prod launcher's STOP/REPORT side: `down` (SIGTERM → watch the bounded drain → confirm gone) and
// `status`. `down` may only signal an instance whose IDENTITY it proved — that is the whole safety story,
// and why prod has no `--force`.
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { print } from "../../_shared/artifacts.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { DrainOutcome, ProdRecord } from "../contract/types.ts";
import { decideDown } from "../lib/identity.ts";
import { SERVER_ENTRY_REL } from "../lib/spawn-plan.ts";
import { spawnerForPort } from "../lib/spawners.ts";
import { classifyDrainTail, DRAIN_WATCH_MS, debugPostureText } from "../lib/verdicts.ts";
import { classify, LOG_PATH, log, MS_PER_SECOND, PIDFILE, POLL_INTERVAL_MS, processAlive, readEnvFile, resolvePort, result, TOKEN_PATH } from "./prod-state.ts";
import { distVerdict, readFrom, removePidfile, safeSize, uptimeText } from "./prod-support.ts";

export async function doDown(): Promise<ExitCode> {
  const port = resolvePort(readEnvFile());
  const { record, classification } = await classify(port);
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
  try {
    process.kill(record.pid, "SIGTERM");
  } catch {
    log("the process vanished before the signal landed.");
  }
  const outcome = await watchDrain(record, logSizeAtSignal);
  if (outcome === "deadline-hit") {
    log("drain deadline hit — long-lived streams were force-closed (expected during a deploy; a client saw a truncated stream).");
  } else if (outcome === "complete") {
    log("shutdown: complete");
  } else {
    log(`the process did not report a clean shutdown within ${DRAIN_WATCH_MS / MS_PER_SECOND}s — escalating to SIGKILL on the process group.`);
    try {
      process.kill(-record.pgid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  await waitGone(record.pid);
  removePidfile();
  log(`stopped (pid ${record.pid}).`);
  result(`mode=prod status=stopped pid=${record.pid} port=${port} drain=${outcome}`);
  return EXIT.clean;
}

/** Watch the prod log from the byte offset at SIGTERM for the lifecycle's own shutdown lines. Reading the
 *  log (not just polling the pid) is what turns "tail -f and eyeball it" into a verdict. */
async function watchDrain(record: ProdRecord, fromOffset: number): Promise<DrainOutcome> {
  const deadline = Date.now() + DRAIN_WATCH_MS;
  while (Date.now() < deadline) {
    const outcome = classifyDrainTail(readFrom(record.logPath, fromOffset));
    if (outcome !== "pending") {
      return outcome;
    }
    if (!processAlive(record.pid)) {
      return classifyDrainTail(readFrom(record.logPath, fromOffset));
    }
    // biome-ignore lint/performance/noAwaitInLoops: a drain watch is inherently serial.
    await sleep(POLL_INTERVAL_MS);
  }
  return "pending";
}

async function waitGone(pid: number): Promise<void> {
  const deadline = Date.now() + DRAIN_WATCH_MS;
  while (Date.now() < deadline && processAlive(pid)) {
    // biome-ignore lint/performance/noAwaitInLoops: serial wait.
    await sleep(POLL_INTERVAL_MS);
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
