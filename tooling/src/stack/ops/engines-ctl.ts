/**
 * engines-ctl — the LOGIC half of the fleet front door (A.4). Spawn/setsid stays in engines.sh; stop lives
 * here because a negative-PGID signal must ride the SAME durable identity verifier as the server supervisor.
 * The wake-budget math, sleep/wake HTTP, hold marker, and status pane also live HERE, importing the server
 * module so the safety decisions are ONE-homed (never re-spelled in bash).
 *
 *   node tooling/src/stack/ops/engines-ctl.ts status     # per-engine pid · /health · /is_sleeping · per-GPU tenants
 *   node tooling/src/stack/ops/engines-ctl.ts sleep      # POST /sleep?level=1 to each + write the hold marker
 *   node tooling/src/stack/ops/engines-ctl.ts wake       # clear hold → reconcile → per-engine VRAM gate → wake+wait
 *   node tooling/src/stack/ops/engines-ctl.ts stop       # verified TERM → bounded wait → verified KILL
 *   node tooling/src/stack/ops/engines-ctl.ts reconcile  # stale-pidfile + orphan-family sweep (also run pre-spawn)
 *
 * Dev tooling (throwaway; global KISS applies — NOT the architecture). `sleep`/`wake` are plain loopback
 * HTTP + a marker FILE, so they work with the app server DOWN (the ComfyUI tenant workflow). The RESULT line
 * is the machine contract (probe convention); exit code carries the verdict (a wake refusal exits non-zero).
 */
import { userInfo } from "node:os";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { engineLaunchEnvFloor, processEnvSnapshot } from "@orb/server/foundation/env";
import type { EngineStopOutcome, EngineUtilFractions, GpuVram } from "@orb/server/infra/providers/vllm/engine";
import {
  clearHold,
  countGpus,
  decideWake,
  engineAdoptionText,
  enginePortPid,
  fleetRunDir,
  getIsSleeping,
  isHeld,
  isStopped,
  postSleep,
  postWakeAndAwait,
  queryGpuVram,
  reapOrphanedFamily,
  stopRecordedEngineProcess,
  VLLM_ENGINES,
  writeHold,
  writeStopped,
} from "@orb/server/infra/providers/vllm/engine";
import { budget } from "@orb/tooling/_shared/load-budget";
import { runTool, UsageError } from "../../_shared/run-tool.ts";

const REPO_ROOT = process.cwd();
const RUN_DIR = fleetRunDir(REPO_ROOT);
const BYTES_PER_GIB = 1_073_741_824;
// A CEILING, load-scaled through the one policy (#1232): the literal is the QUIET-BOX base.
const HEALTH_TIMEOUT_MS_BASE = 2000;
const HEALTH_TIMEOUT_MS = budget(HEALTH_TIMEOUT_MS_BASE);
// Column pad for the per-engine status line (widest engine name = "rerank").
const ENGINE_NAME_PAD = 6;
const STOP_GRACE_TICKS = 30;
/** The dispatch-probe env var (the `stack.sh` STACK_DISPATCH_PROBE convention) — see `main` below. */
const DISPATCH_PROBE_VAR = "ENGINES_CTL_DISPATCH_PROBE";
const STOP_POLL_MS = 500;

function log(msg: string): void {
  process.stdout.write(`engines-ctl: ${msg}\n`);
}

function result(pairs: readonly (readonly [string, string | number])[]): void {
  process.stdout.write(`\nRESULT engines ${pairs.map(([k, v]) => `${k}=${v}`).join(" ")}\n`);
}

/** The util fractions the wake budget reads — projected from the launch env floor (the SAME source the
 *  serve argv reads, so the pre-check footprint can't drift from the actual allocation). */
function utilFractions(): EngineUtilFractions {
  const f = engineLaunchEnvFloor();
  return {
    embedGpuUtil: f.VLLM_EMBED_GPU_UTIL,
    rerankGpuUtilMulti: f.VLLM_RERANK_GPU_UTIL_MULTI,
    rerankGpuUtilSingle: f.VLLM_RERANK_GPU_UTIL_SINGLE,
    genGpuUtilMulti: f.VLLM_GEN_GPU_UTIL_MULTI,
    genGpuUtilSingle: f.VLLM_GEN_GPU_UTIL_SINGLE,
  };
}

async function healthOk(engine: (typeof VLLM_ENGINES)[number]): Promise<boolean> {
  // @orb-gate-ignore caught-failure-ownership(default:catch): a failed engine identity probe returns false and the caller refuses control of that process. Ends if false can authorize a signal.
  try {
    const res = await fetch(`http://127.0.0.1:${engineLaunchEnvFloor()[portKey(engine)]}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

function portKey(engine: (typeof VLLM_ENGINES)[number]): "VLLM_EMBED_PORT" | "VLLM_RERANK_PORT" | "VLLM_GEN_PORT" {
  if (engine === "embed") {
    return "VLLM_EMBED_PORT";
  }
  return engine === "rerank" ? "VLLM_RERANK_PORT" : "VLLM_GEN_PORT";
}

function gib(bytes: number): string {
  return `${(bytes / BYTES_PER_GIB).toFixed(1)}GiB`;
}

/** Best-effort "who" for the stopped marker — the file is a human-readable receipt, not an auth record. */
function safeUsername(): string {
  // @orb-gate-ignore caught-failure-ownership(default:catch): an unreadable OS user identity falls back to a fixed label ("unknown") for a HUMAN-READABLE receipt on a marker file, never an authorization decision. Ends if the fallback ever gates a signal.
  try {
    return userInfo().username;
  } catch {
    return "unknown";
  }
}

// ── reconcile: stale-pidfile handling stays in bash; the orphan-family sweep is the reaper (cwd-equality) ──
async function reconcile(): Promise<number> {
  const reaped = await reapOrphanedFamily(REPO_ROOT);
  if (reaped.length > 0) {
    log(`reaped orphaned engine-family process(es): ${reaped.join(", ")}`);
  } else {
    log("no orphaned engine-family processes to reap");
  }
  result([
    ["verb", "reconcile"],
    ["reaped", reaped.length],
  ]);
  return 0;
}

/** The lifecycle label for an engine's probe triple + the hold marker. */
function engineState(up: boolean, sleeping: boolean | null, held: boolean): string {
  if (!up) {
    return "down";
  }
  if (sleeping === null) {
    return "sleep-state-unknown";
  }
  if (!sleeping) {
    return "healthy";
  }
  return held ? "sleeping-held" : "sleeping";
}

async function logEngineRow(engine: (typeof VLLM_ENGINES)[number], held: boolean): Promise<void> {
  const [pid, up, sleeping] = await Promise.all([enginePortPid(engine), healthOk(engine), getIsSleeping(engine)]);
  log(`${engine.padEnd(ENGINE_NAME_PAD)} pid=${pid ?? "—"} health=${up ? "ok" : "down"} ${engineState(up, sleeping, held)}`);
}

async function status(): Promise<number> {
  const gpus = await queryGpuVram();
  const held = isHeld(RUN_DIR);
  const stopped = isStopped(RUN_DIR);
  log(`hold marker: ${held ? "PRESENT (sleeping-held; `engines wake` releases)" : "absent"}`);
  log(`stopped marker: ${stopped ? "PRESENT (supervisor will NOT take over; `engines start` clears it)" : "absent"}`);
  for (const engine of VLLM_ENGINES) {
    await logEngineRow(engine, held);
  }
  for (const g of gpus) {
    const tenants = g.tenants.length === 0 ? "none" : g.tenants.map((t) => `${t.processName}(pid ${t.pid}, ${gib(t.usedBytes)})`).join(", ");
    log(`GPU${g.index} free=${gib(g.freeBytes)}/${gib(g.totalBytes)} tenants=${tenants}`);
  }
  result([
    ["verb", "status"],
    ["held", held ? "yes" : "no"],
    ["stopped", stopped ? "yes" : "no"],
    ["gpus", gpus.length],
  ]);
  return 0;
}

function enginePort(engine: (typeof VLLM_ENGINES)[number]): number {
  return engineLaunchEnvFloor()[portKey(engine)];
}

type VllmEngine = (typeof VLLM_ENGINES)[number];

/** Print BOTH doors' verdicts (#1756). The ordinary identity door's line is unchanged; the adoption line
 *  appears only when that door declined and the marker door was therefore consulted, and it always NAMES the
 *  evidence — which pids were adopted, or which pid refused the group. An engine stays `refused` unless one
 *  of the two doors actually signalled: the operator's tally must never call an adoption failure a stop. */
function recordStopOutcome(engine: VllmEngine, signal: NodeJS.Signals, outcome: EngineStopOutcome, refused: Set<VllmEngine>): number {
  const recorded = outcome.recorded;
  log(`${engine}: ${signal === "SIGTERM" ? "TERM" : "KILL"} ${recorded.verdict}${"reason" in recorded ? ` — ${recorded.reason}` : ` pgid=${recorded.pgid}`}`);
  if (outcome.adoption !== undefined) {
    log(`${engine}: adoption — ${engineAdoptionText(outcome.adoption)}`);
  }
  if (!outcome.signaled && recorded.verdict === "refused") {
    refused.add(engine);
  }
  return outcome.signaled ? 1 : 0;
}

async function signalFleet(signal: NodeJS.Signals, requireListener: boolean, refused: Set<VllmEngine>): Promise<number> {
  const counts = await Promise.all(
    VLLM_ENGINES.map(async (engine) => {
      const listenerPid = await enginePortPid(engine);
      if (requireListener && listenerPid === null) {
        return 0;
      }
      const outcome = stopRecordedEngineProcess({ repoRoot: REPO_ROOT, engine, port: enginePort(engine), listenerPid, signal });
      return recordStopOutcome(engine, signal, outcome, refused);
    }),
  );
  return counts.reduce((sum, count) => sum + count, 0);
}

async function waitForFleetPortsFree(ticksLeft: number): Promise<void> {
  const listeners = await Promise.all(VLLM_ENGINES.map((engine) => enginePortPid(engine)));
  if (ticksLeft <= 1 || listeners.every((pid) => pid === null)) {
    return;
  }
  await sleep(STOP_POLL_MS);
  await waitForFleetPortsFree(ticksLeft - 1);
}

/** Stop only launch identities that still own their configured port. A missing/corrupt record or a foreign
 * listener is an explicit refusal; neither the TERM nor KILL pass can derive a target from the port alone. */
async function stopAll(): Promise<number> {
  const refused = new Set<VllmEngine>();
  const terminated = await signalFleet("SIGTERM", false, refused);
  await waitForFleetPortsFree(STOP_GRACE_TICKS);
  const escalated = await signalFleet("SIGKILL", true, refused);

  // #1929: a verified stop (no refusals — every engine was either signaled or already absent) records
  // INTENT the supervisor's takeover decision honors. Written only on the clean verdict: a refusal means
  // the fleet's state is uncertain (a foreign listener, a mismatched record), and claiming "stopped on
  // purpose" for the whole fleet in that case would be asserting evidence nobody observed.
  if (refused.size === 0) {
    const who = safeUsername();
    writeStopped(RUN_DIR, Date.now(), who);
    log(`wrote stopped marker (by ${who}) — the supervisor will not take over a dead pidfile; \`engines start\` clears it`);
  }

  result([
    ["verb", "stop"],
    ["terminated", terminated],
    ["escalated", escalated],
    ["refused", refused.size],
  ]);
  return refused.size === 0 ? 0 : 1;
}

async function sleepAll(): Promise<number> {
  // The manual hold marker: intent ahead of occupancy — the wake gate refuses on it until `engines wake`.
  // It goes down FIRST, BEFORE any /sleep POST (live step-9 finding 2026-08-01): the three sequential sleeps
  // take ~6s, and an engine already asleep while the marker is still absent reads as AUTO-slept — a stray
  // request in that window auto-wakes it and takes the VRAM straight back, defeating the operator's intent.
  // The live supervisor log caught exactly this straddle (embed `sleeping` while rerank/gen were already
  // `sleeping-held`). A marker written when the sleeps then FAIL is harmless: the engines stay awake, the
  // wake gate never runs, and `engines wake` clears it.
  writeHold(RUN_DIR, Date.now());
  log("wrote hold marker — engines HELD; a stray request will NOT auto-wake them. `engines wake` releases.");
  let slept = 0;
  for (const engine of VLLM_ENGINES) {
    const ok = await postSleep(engine);
    log(`${engine}: /sleep?level=1 → ${ok ? "ok" : "FAILED (engine down or sleep-mode off?)"}`);
    if (ok) {
      slept += 1;
    }
  }
  result([
    ["verb", "sleep"],
    ["slept", slept],
    ["held", "yes"],
  ]);
  return slept === VLLM_ENGINES.length ? 0 : 1;
}

async function wakeAll(): Promise<number> {
  // Clearing the hold FIRST is the point of the manual wake — then everyone runs the same headroom gate.
  clearHold(RUN_DIR);
  log("cleared hold marker");
  // Reconcile FIRST so a dead engine's own core is reaped as OURS, never named as a foreign tenant (B.6).
  const reaped = await reapOrphanedFamily(REPO_ROOT);
  if (reaped.length > 0) {
    log(`reaped orphaned engine-family process(es) before wake: ${reaped.join(", ")}`);
  }
  const gpus: GpuVram[] = await queryGpuVram();
  const util = utilFractions();
  const gpuCount = countGpus();
  let woke = 0;
  let refused = 0;
  for (const engine of VLLM_ENGINES) {
    // The hold is already cleared, so decideWake gates purely on VRAM headroom here.
    const decision = decideWake(engine, { held: false, gpuCount, util, gpus });
    if (!decision.ok) {
      log(`${engine}: WAKE REFUSED — ${decision.reason}`);
      refused += 1;
      continue;
    }
    const ok = await postWakeAndAwait(engine, { now: () => Date.now(), sleep });
    log(`${engine}: wake ${ok ? "→ ready" : "TIMED OUT (30s bound)"}`);
    if (ok) {
      woke += 1;
    }
  }
  result([
    ["verb", "wake"],
    ["woke", woke],
    ["refused", refused],
  ]);
  return refused > 0 ? 1 : 0;
}

const VERBS: Record<string, () => Promise<number>> = {
  status,
  stop: stopAll,
  sleep: sleepAll,
  wake: wakeAll,
  reconcile,
};

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const verb = argv[0] ?? "status";
  const fn = VERBS[verb];
  if (fn === undefined) {
    throw new UsageError(`unknown verb '${verb}' — one of: ${Object.keys(VERBS).join(", ")}`);
  }
  // No verb takes an argument. Trailing tokens used to be dropped, so `engines-ctl sleep --level 2`
  // ran a plain sleep and reported success for a request nobody honoured (#971).
  if (argv.length > 1) {
    throw new UsageError(
      `verb '${verb}' takes no arguments — got ${argv
        .slice(1)
        .map((a) => JSON.stringify(a))
        .join(" ")}`,
    );
  }
  // Test seam (tests/tooling/stack/ops/engines-ctl.int.test.ts), the `stack.sh` STACK_DISPATCH_PROBE
  // convention: print the classification and stop — AFTER the grammar is decided, BEFORE the verb runs.
  // Every verb here touches the LIVE fleet (reconcile REAPS, status probes, sleep/wake/stop post to the
  // engines), so without this seam the only thing standing between a red-first plant and production
  // hardware is the very refusal such a plant removes. Paid 2026-09-02: a bite-proof that neutered the
  // refusal drove `sleep` and put the live embed + rerank engines to sleep. The probe is the neutering.
  if (processEnvSnapshot()[DISPATCH_PROBE_VAR] !== undefined) {
    log(`DISPATCH verb=${verb}`);
    return 0;
  }
  return await fn();
}

await runTool(main);
