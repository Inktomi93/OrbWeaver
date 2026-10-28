// Production stop/status: POSIX drains after root SIGTERM; Windows force-stops the identity-qualified tree.
// Stop may signal only a verified instance and removes its record only after complete tree termination.
import { setTimeout as sleep } from "node:timers/promises";
import { print } from "../../floor/artifacts/artifacts.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { ExitCode } from "../../floor/cli/exit-contract.ts";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import type { ProcessGroup, ProcessGroupDeps } from "../../floor/process/proc.ts";
import { captureProcessGroup } from "../../floor/process/proc.ts";
import { SERVER_ENTRY_REL } from "../../floor/process/server-entry.ts";
import type { DrainOutcome, ProdRecord } from "../contract/types.ts";
import { decideDown } from "../lib/identity.ts";
import { spawnerForPort } from "../lib/spawners.ts";
import { classifyDrainTail, DRAIN_WATCH_MS, debugPostureText } from "../lib/verdicts.ts";
import { classify, LOG_PATH, log, MS_PER_SECOND, PIDFILE, POLL_INTERVAL_MS, readEnvFile, resolvePort, result, TOKEN_PATH } from "./prod-state.ts";
import { distVerdict, readFrom, removePidfile, safeSize, uptimeText } from "./prod-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm stack <verb> prod");

/** External process/time edges and invocation port; ownership classification always reads the actual instance. */
export interface DownDeps {
  readonly process?: ProcessGroupDeps;
  readonly port?: number;
  readonly now?: () => number;
  readonly pause?: (ms: number) => Promise<void>;
}

function logEscalation(platform: NodeJS.Platform): void {
  log(
    platform === "win32"
      ? "the owned process tree remains live — repeating forced termination."
      : `the process did not report a clean shutdown within ${DRAIN_WATCH_MS / MS_PER_SECOND}s — escalating to SIGKILL on the process group.`,
  );
}

export async function doDown(deps: DownDeps = {}): Promise<ExitCode> {
  const port = deps.port ?? resolvePort(readEnvFile());
  const { record, classification } = await classify(port);
  const decision = decideDown(classification);
  if (decision.action === "noop") {
    if (record !== null && captureProcessGroup(record.pid, deps.process).alive()) {
      log("REFUSED — the recorded process tree remains live without a verified listener.");
      result(`mode=prod status=refused port=${port}`);
      return EXIT.violations;
    }
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

  const tree = captureProcessGroup(record.pid, deps.process);
  const logSizeAtSignal = safeSize(record.logPath);
  log(
    tree.platform === "win32"
      ? `forced termination → owned process tree ${record.pid}.`
      : `SIGTERM → pid ${record.pid}; watching the bounded drain (${DRAIN_WATCH_MS / MS_PER_SECOND}s max)…`,
  );
  tree.signalRoot("SIGTERM");
  const outcome = await watchDrain(record, logSizeAtSignal, tree, deps);
  if (outcome === "deadline-hit") {
    log("drain deadline hit — long-lived streams were force-closed (expected during a deploy; a client saw a truncated stream).");
  } else if (outcome === "complete") {
    log("shutdown: complete");
  }
  if ((outcome === "pending" && tree.alive()) || !(await waitGone(tree, deps))) {
    logEscalation(tree.platform);
    tree.signal("SIGKILL");
  }
  if (!(await waitGone(tree, deps))) {
    throw new Error(`production server process tree ${record.pid} remained live after the shutdown deadline`);
  }
  removePidfile();
  log(`stopped (pid ${record.pid}).`);
  result(`mode=prod status=stopped pid=${record.pid} port=${port} drain=${outcome}`);
  return EXIT.clean;
}

/** Watch the prod log from the byte offset at SIGTERM for the lifecycle's own shutdown lines. Reading the
 *  log (not just polling the pid) is what turns "tail -f and eyeball it" into a verdict. */
async function watchDrain(record: ProdRecord, fromOffset: number, tree: ProcessGroup, deps: DownDeps): Promise<DrainOutcome> {
  const now = deps.now ?? Date.now;
  const deadline = now() + DRAIN_WATCH_MS;
  while (now() < deadline) {
    const outcome = classifyDrainTail(readFrom(record.logPath, fromOffset));
    if (outcome !== "pending") {
      return outcome;
    }
    if (!tree.rootAlive()) {
      return classifyDrainTail(readFrom(record.logPath, fromOffset));
    }
    await (deps.pause ?? sleep)(POLL_INTERVAL_MS);
  }
  return "pending";
}

async function waitGone(tree: ProcessGroup, deps: DownDeps): Promise<boolean> {
  const now = deps.now ?? Date.now;
  const deadline = now() + DRAIN_WATCH_MS;
  while (now() < deadline && tree.alive()) {
    await (deps.pause ?? sleep)(POLL_INTERVAL_MS);
  }
  return !tree.alive();
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
