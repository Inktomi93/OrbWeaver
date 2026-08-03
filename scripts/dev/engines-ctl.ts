#!/usr/bin/env tsx
/**
 * engines-ctl — the LOGIC half of the fleet front door (A.4). The pgid/setsid choreography (`start`/`stop`)
 * stays in engines.sh (bash's wheelhouse); the wake-budget math, sleep/wake HTTP, hold marker, and status
 * pane live HERE, importing the server module so the budget math is ONE-homed (never re-spelled in bash).
 *
 *   tsx scripts/dev/engines-ctl.ts status       # per-engine pid · /health · /is_sleeping · per-GPU tenants
 *   tsx scripts/dev/engines-ctl.ts sleep         # POST /sleep?level=1 to each + write the hold marker
 *   tsx scripts/dev/engines-ctl.ts wake          # clear hold → reconcile → per-engine VRAM gate → wake+wait
 *   tsx scripts/dev/engines-ctl.ts reconcile      # stale-pidfile + orphan-family sweep (also run pre-spawn)
 *
 * Dev tooling (throwaway; global KISS applies — NOT the architecture). `sleep`/`wake` are plain loopback
 * HTTP + a marker FILE, so they work with the app server DOWN (the ComfyUI tenant workflow). The RESULT line
 * is the machine contract (probe convention); exit code carries the verdict (a wake refusal exits non-zero).
 */
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { engineLaunchEnvFloor } from "@orb/server/foundation/env";
import type { EngineUtilFractions, GpuVram } from "@orb/server/infra/providers/vllm/engine";
import {
  clearHold,
  countGpus,
  decideWake,
  enginePortPid,
  fleetRunDir,
  getIsSleeping,
  isHeld,
  postSleep,
  postWakeAndAwait,
  queryGpuVram,
  reapOrphanedFamily,
  VLLM_ENGINES,
  writeHold,
} from "@orb/server/infra/providers/vllm/engine";

const REPO_ROOT = process.cwd();
const RUN_DIR = fleetRunDir(REPO_ROOT);
const BYTES_PER_GIB = 1_073_741_824;
const HEALTH_TIMEOUT_MS = 2000;
// Column pad for the per-engine status line (widest engine name = "rerank").
const ENGINE_NAME_PAD = 6;

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
function engineState(up: boolean, sleeping: boolean, held: boolean): string {
  if (!up) {
    return "down";
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
  log(`hold marker: ${held ? "PRESENT (sleeping-held; `engines:wake` releases)" : "absent"}`);
  for (const engine of VLLM_ENGINES) {
    // biome-ignore lint/performance/noAwaitInLoops: a small, fixed, sequential fleet — three engines.
    await logEngineRow(engine, held);
  }
  for (const g of gpus) {
    const tenants = g.tenants.length === 0 ? "none" : g.tenants.map((t) => `${t.processName}(pid ${t.pid}, ${gib(t.usedBytes)})`).join(", ");
    log(`GPU${g.index} free=${gib(g.freeBytes)}/${gib(g.totalBytes)} tenants=${tenants}`);
  }
  result([
    ["verb", "status"],
    ["held", held ? "yes" : "no"],
    ["gpus", gpus.length],
  ]);
  return 0;
}

async function sleepAll(): Promise<number> {
  // The manual hold marker: intent ahead of occupancy — the wake gate refuses on it until `engines:wake`.
  // It goes down FIRST, BEFORE any /sleep POST (live step-9 finding 2026-08-01): the three sequential sleeps
  // take ~6s, and an engine already asleep while the marker is still absent reads as AUTO-slept — a stray
  // request in that window auto-wakes it and takes the VRAM straight back, defeating the operator's intent.
  // The live supervisor log caught exactly this straddle (embed `sleeping` while rerank/gen were already
  // `sleeping-held`). A marker written when the sleeps then FAIL is harmless: the engines stay awake, the
  // wake gate never runs, and `engines:wake` clears it.
  writeHold(RUN_DIR, Date.now());
  log("wrote hold marker — engines HELD; a stray request will NOT auto-wake them. `engines:wake` releases.");
  let slept = 0;
  for (const engine of VLLM_ENGINES) {
    // biome-ignore lint/performance/noAwaitInLoops: three engines, sequential loopback POSTs.
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
    // biome-ignore lint/performance/noAwaitInLoops: sequential wake — engines share GPUs, one at a time.
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
  sleep: sleepAll,
  wake: wakeAll,
  reconcile,
};

async function main(): Promise<number> {
  const verb = process.argv[2] ?? "status";
  const fn = VERBS[verb];
  if (fn === undefined) {
    log(`unknown verb '${verb}' — one of: ${Object.keys(VERBS).join(", ")}`);
    return 2;
  }
  return await fn();
}

void main().then((code) => process.exit(code));
