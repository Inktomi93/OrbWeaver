// The VRAM headroom pre-check that guards EVERY engine wake AND every cold spawn (B.6). A wake into
// insufficient free VRAM cannot evict a co-tenant — it OOMs mid-`create_and_map` and leaves a half-woken
// engine — so the physics make contention moot: if a tenant OCCUPIES the VRAM, the wake REFUSES on physics
// alone (no policy, no "who wins", no eviction). This is the [[plan-for-small-hardware]] visible-refusal
// doctrine applied to GPU contention: generic by design, ZERO tenant-specific logic — the process list IS
// the diagnosis, so ANY tenant (ComfyUI, a training job, someone else's server) self-identifies by name.
//
// The need is derivable from OUR OWN config with zero new knowledge: `wake_up` remaps the engine's FULL
// original allocation (weights handles get their pinned backup copied back; KV handles remap as empty), so
// need(engine, gpu) ≈ its gpu-memory-utilization fraction × that card's total + a fixed safety pad.
//
// PURE: the decision (`decideWakeBudget`) takes injected GPU facts + returns a verdict; only `queryGpuVram`
// (nvidia-smi) is I/O, injected at the call sites so the decision is deterministically unit-testable. The
// orphan reconcile (supervisor reaper) MUST run FIRST wherever both apply — a dead engine's own EngineCore
// still holding VRAM must be reaped as ours, never NAMED as a "foreign tenant" in a refusal.

import { execFile } from "node:child_process";
import type { VLLM_ENGINES } from "./engines";

type VllmEngine = (typeof VLLM_ENGINES)[number];

// A fixed safety pad above the util-fraction footprint — CUDA context + fragmentation slack, so a wake that
// the fraction math says "just fits" isn't a coin-flip OOM. ~1 GiB (bytes).
const SAFETY_PAD_BYTES = 1_073_741_824;
const BYTES_PER_MIB = 1_048_576;
const BYTES_PER_GIB = 1_073_741_824;

/** One GPU's live facts (from nvidia-smi): index, total + free bytes, and the compute-app tenants holding
 *  memory on it (pid · process name · used bytes) — the tenants a refusal NAMES. */
export interface GpuVram {
  readonly index: number;
  readonly totalBytes: number;
  readonly freeBytes: number;
  readonly tenants: readonly GpuTenant[];
}

export interface GpuTenant {
  readonly pid: number;
  readonly processName: string;
  readonly usedBytes: number;
}

/** The per-engine GPU footprint the wake will reclaim: the util fraction × each touched card's total. gen
 *  spans BOTH cards (TP=2) so it needs its fraction on each; embed/rerank sit on one card each (multi-GPU).
 *  Single-GPU packs everything on GPU0. This mirrors buildEngineArgv's GPU pinning + util split. */
export interface EngineVramNeed {
  /** The util fraction on each GPU index the engine occupies (e.g. gen → 0.55 on GPU 0 and 0.55 on GPU 1). */
  readonly fractionByGpu: ReadonlyMap<number, number>;
}

/** The util fractions the wake-budget reads — a structural subset of EngineLaunchConfig (the resolved
 *  launch slice), kept file-local so this module never re-imports the whole config shape. */
export interface EngineUtilFractions {
  readonly embedGpuUtil: number;
  readonly rerankGpuUtilMulti: number;
  readonly rerankGpuUtilSingle: number;
  readonly genGpuUtilMulti: number;
  readonly genGpuUtilSingle: number;
}

/** Map an engine to the util fraction it holds on each GPU it touches — the SAME pinning + multi/single
 *  split as buildEngineArgv's engineCudaVisibleDevices + the util arms. gen spans all cards via TP. */
export function engineVramNeed(engine: VllmEngine, gpuCount: number, util: EngineUtilFractions): EngineVramNeed {
  const multiGpu = gpuCount >= 2;
  if (engine === "embed") {
    return { fractionByGpu: new Map([[0, util.embedGpuUtil]]) };
  }
  if (engine === "rerank") {
    const gpu = multiGpu ? 1 : 0;
    return { fractionByGpu: new Map([[gpu, multiGpu ? util.rerankGpuUtilMulti : util.rerankGpuUtilSingle]]) };
  }
  // gen: TP spans every card multi-GPU, else GPU0 only.
  const fraction = multiGpu ? util.genGpuUtilMulti : util.genGpuUtilSingle;
  const entries: [number, number][] = multiGpu
    ? [
        [0, fraction],
        [1, fraction],
      ]
    : [[0, fraction]];
  return { fractionByGpu: new Map(entries) };
}

/** A per-GPU shortfall: what the wake needs on this card vs what's free, and who's holding the rest. */
export interface GpuShortfall {
  readonly index: number;
  readonly needBytes: number;
  readonly freeBytes: number;
  readonly tenants: readonly GpuTenant[];
}

// @orb-gate-ignore no-inline-types an engine-internal discriminated RESULT verdict — a union (not an
// interface), co-located with its decider `decideWakeBudget` below exactly like this file's sibling result
// interfaces (GpuTenant/GpuShortfall/EngineVramNeed); the engine dir has no cross-boundary contract home.
export type WakeBudgetVerdict = { readonly ok: true } | { readonly ok: false; readonly shortfalls: readonly GpuShortfall[]; readonly message: string };

function gib(bytes: number): string {
  return `${(bytes / BYTES_PER_GIB).toFixed(1)}GiB`;
}

/** Name the holders on a shorted GPU — "held by python3 (pid 3356292, 38.0GiB)", the generic self-ID that
 *  makes ANY tenant diagnosable without tenant-specific logic. Empty tenant list ⇒ "no named compute tenant"
 *  (the memory is held by something nvidia-smi doesn't attribute — still an honest refusal). */
function holdersLine(tenants: readonly GpuTenant[]): string {
  if (tenants.length === 0) {
    return "no named compute tenant";
  }
  return tenants.map((t) => `${t.processName} (pid ${t.pid}, ${gib(t.usedBytes)})`).join(", ");
}

/** The refusal message: one line per shorted GPU naming the need, the free headroom, and the holders. */
function refusalMessage(engine: VllmEngine, shortfalls: readonly GpuShortfall[]): string {
  const lines = shortfalls.map((s) => `${engine} needs ~${gib(s.needBytes)} on GPU${s.index}, ${gib(s.freeBytes)} free — held by ${holdersLine(s.tenants)}`);
  return `wake refused: ${lines.join("; ")}`;
}

/** The pure headroom decision: for each GPU the engine touches, need = fraction × card total + pad; if any
 *  card lacks the free headroom, REFUSE and name the holders. The engine STAYS ASLEEP on a refusal — a wake
 *  cannot evict a co-tenant, so backing off can't fix it (retryable:false at the call sites). */
export function decideWakeBudget(engine: VllmEngine, need: EngineVramNeed, gpus: readonly GpuVram[]): WakeBudgetVerdict {
  const byIndex = new Map(gpus.map((g) => [g.index, g]));
  const shortfalls: GpuShortfall[] = [];
  for (const [index, fraction] of need.fractionByGpu) {
    const gpu = byIndex.get(index);
    if (gpu === undefined) {
      // No facts for a card the engine needs — treat as a shortfall (can't prove headroom = refuse honestly).
      shortfalls.push({ index, needBytes: SAFETY_PAD_BYTES, freeBytes: 0, tenants: [] });
      continue;
    }
    const needBytes = Math.round(fraction * gpu.totalBytes) + SAFETY_PAD_BYTES;
    if (gpu.freeBytes < needBytes) {
      shortfalls.push({ index, needBytes, freeBytes: gpu.freeBytes, tenants: gpu.tenants });
    }
  }
  if (shortfalls.length === 0) {
    return { ok: true };
  }
  return { ok: false, shortfalls, message: refusalMessage(engine, shortfalls) };
}

// ── nvidia-smi I/O (injected at call sites) ──────────────────────────────────────────────────────────────

const QUERY_GPU_ARGS = ["--query-gpu=index,memory.total,memory.free", "--format=csv,noheader,nounits"];
const QUERY_APPS_ARGS = ["--query-compute-apps=pid,process_name,used_memory,gpu_uuid", "--format=csv,noheader,nounits"];
// CSV column-count floors: `index,total,free` = 3; `pid,name,used,uuid` = 4.
const GPU_CSV_COLS = 3;
const APPS_CSV_COLS = 4;

function runNvidiaSmi(args: readonly string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile("nvidia-smi", args, { encoding: "utf8" }, (err, stdout) => resolve(err ? "" : stdout));
  });
}

/** Parse `index,memory.total,memory.free` CSV rows (MiB, nounits) into per-GPU totals/free bytes. */
export function parseGpuVramCsv(csv: string): { index: number; totalBytes: number; freeBytes: number }[] {
  const out: { index: number; totalBytes: number; freeBytes: number }[] = [];
  for (const line of csv.split("\n")) {
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < GPU_CSV_COLS) {
      continue;
    }
    const [index, total, free] = [Number(cols[0]), Number(cols[1]), Number(cols[2])];
    if (Number.isNaN(index) || Number.isNaN(total) || Number.isNaN(free)) {
      continue;
    }
    out.push({ index, totalBytes: total * BYTES_PER_MIB, freeBytes: free * BYTES_PER_MIB });
  }
  return out;
}

/** Parse `pid,process_name,used_memory,gpu_uuid` CSV rows (MiB, nounits) into per-uuid tenant lists. */
export function parseComputeAppsCsv(csv: string): Map<string, GpuTenant[]> {
  const byUuid = new Map<string, GpuTenant[]>();
  for (const line of csv.split("\n")) {
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < APPS_CSV_COLS) {
      continue;
    }
    const pid = Number(cols[0]);
    const used = Number(cols[2]);
    const uuid = cols[3] ?? "";
    if (Number.isNaN(pid) || Number.isNaN(used) || uuid.length === 0) {
      continue;
    }
    const list = byUuid.get(uuid) ?? [];
    list.push({ pid, processName: cols[1] ?? "?", usedBytes: used * BYTES_PER_MIB });
    byUuid.set(uuid, list);
  }
  return byUuid;
}

/** Query per-GPU VRAM + the compute-app tenants (plain NVML facts). Two nvidia-smi calls; tenants are keyed
 *  by gpu_uuid (the apps query) and joined to the index query via a THIRD uuid column. Never throws — a
 *  failed query yields an empty list (the caller refuses honestly on missing facts). This is the ONE I/O
 *  seam; the decision is pure. */
export async function queryGpuVram(): Promise<GpuVram[]> {
  const [gpuCsv, appsCsv, uuidCsv] = await Promise.all([
    runNvidiaSmi(QUERY_GPU_ARGS),
    runNvidiaSmi(QUERY_APPS_ARGS),
    runNvidiaSmi(["--query-gpu=index,uuid", "--format=csv,noheader,nounits"]),
  ]);
  const uuidByIndex = new Map<number, string>();
  for (const line of uuidCsv.split("\n")) {
    const cols = line.split(",").map((c) => c.trim());
    const index = Number(cols[0]);
    if (!Number.isNaN(index) && (cols[1]?.length ?? 0) > 0) {
      uuidByIndex.set(index, cols[1] as string);
    }
  }
  const tenantsByUuid = parseComputeAppsCsv(appsCsv);
  return parseGpuVramCsv(gpuCsv).map((g) => ({
    ...g,
    tenants: tenantsByUuid.get(uuidByIndex.get(g.index) ?? "") ?? [],
  }));
}
