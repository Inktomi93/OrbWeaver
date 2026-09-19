// infra/providers/backends/local-light/prefetch — the BOOT WARM-UP for the in-process transformers.js
// tier, plus the process-local status registry the admin Engines panel renders it through.
//
// WHY IT EXISTS: local-light's weights download LAZILY, on the first call that needs them — jina-clip-v2
// (~3.5 GB fp32) for embed/imageEmbed, ms-marco-MiniLM (~92 MB) for rerank, RMBG-1.4 (~176 MB) for matte.
// On a GPU-less box (the audience local-light exists for) that makes the FIRST search, the first import and
// the first avatar matte stall for minutes with no explanation. This module moves that download to just
// after the listener binds, so the stall is paid while the operator is still reading the boot log.
//
// WHAT IT IS NOT: it is not a `WorkloadContribution`. The join-the-in-flight-download property lives in
// `model-cache.ts`'s per-model memo — an IN-PROCESS promise, not durable state — and the progress surface is
// the engine-status shape, not `WorkloadProgress`; a durable queue row would add a per-boot audit row for a
// job that is a no-op on every boot but the first and could not express either property. It is the
// structural twin of the vLLM engine supervisor instead: a handle off `createBackendRegistry`, started after
// the bind in `entry/lifecycle.ts`, drained in `shutdown()`, publishing into a process-local registry.
//
// FAILURE POSTURE: ONE attempt per slot per boot, and a failure is a single WARN — never a crash, never a
// retry storm. The lazy path is untouched by a failed prefetch (the memo evicts a rejected entry), so an
// offline box behaves exactly as it did before this module existed. The admin panel's per-row Restart is the
// manual retry door.

import { randomUUID } from "node:crypto";
import { formatBytes } from "@orb/kit/strings";
import { getLog, superviseDetached } from "#foundation/observability";
import type { LocalLightLoadProgress, LocalLightModelCache, LocalLightModelSlot } from "./model-cache.ts";
import { LOCAL_LIGHT_MODEL_SLOTS } from "./model-cache.ts";

/** Every state a prefetch slot can occupy. `queued` is "scheduled, not started" (the slots after the one in
 *  flight — the walk is sequential so a 3.5 GB fetch never races a 92 MB one for the same pipe); `ready`
 *  means the weights are loaded IN THIS PROCESS, not merely on disk. */
export const LOCAL_LIGHT_PREFETCH_STATUSES = ["queued", "downloading", "ready", "failed"] as const;
type PrefetchStatus = (typeof LOCAL_LIGHT_PREFETCH_STATUSES)[number];

/** One slot's process-local record — deliberately field-identical to the vLLM `EngineStatusRecord` so the
 *  admin read-model merges the two without a second shape. `updatedAt` is injected (no-raw-clock). */
export interface LocalLightPrefetchRecord {
  readonly status: PrefetchStatus;
  /** Human amplification: the model id plus, while bytes are moving, "42% (1.5 GB / 3.5 GB)". */
  readonly detail: string;
  readonly updatedAt: number;
}

/** The status-key namespace. The merged admin map is keyed by engine name and vLLM already owns `embed` and
 *  `rerank`, so a bare slot name would COLLIDE with a real engine row on a box running both tiers. */
export const LOCAL_LIGHT_STATUS_PREFIX = "local-light:";

/** What to warm: one slot and the model id the resolver said would serve it. */
export interface LocalLightPrefetchTarget {
  readonly slot: LocalLightModelSlot;
  // @orb-waive brand-in-name-position(modelId): a HuggingFace repo id (`Xenova/…`) handed straight to transformers.js, NOT the OpenRouter `ModelId` brand — a different registry's namespace sharing the spelling. Ends if local-light models ever enter the connection catalog under our brand.
  readonly modelId: string;
}

/** The lifecycle handle `entry/` wires — the twin of `VllmEngineHandle`, minus everything about processes. */
export interface LocalLightPrefetchHandle {
  /** Schedule the walk. Returns IMMEDIATELY (the download is detached — boot must never await it) and hands
   *  back the drain: it stops the walk BEFORE the next slot, since an in-flight ONNX load cannot be
   *  interrupted (the same reason `throwIfAborted` checks at role boundaries rather than mid-run). An EMPTY
   *  target list publishes nothing at all — the "nothing resolves to local-light" and "prefetch off" arms
   *  must be indistinguishable from a box that never had this feature. */
  readonly start: (targets: readonly LocalLightPrefetchTarget[]) => () => void;
  /** Re-attempt ONE slot (the admin panel's Restart on a local-light row). Resolves with the status line the
   *  panel echoes; a slot that is already in flight joins it rather than starting a second. */
  readonly retry: (statusKey: string) => Promise<string>;
  /** Snapshot every published slot, keyed `local-light:<slot>`. Empty before `start` publishes anything. */
  readonly status: () => Record<string, LocalLightPrefetchRecord>;
}

// ASSUMES(single-replica): a per-PROCESS registry of what THIS process's model cache is loading, exactly like
// `vllm/engine/engine-status.ts`. It cannot be DB-backed — the thing it describes is an in-memory promise,
// and a replica restart legitimately drops it along with the loads it describes.
const registry = new Map<LocalLightModelSlot, LocalLightPrefetchRecord>();
// The reverse index the progress sink routes on: transformers.js reports progress by REPO ID, and the sink is
// installed at cache construction, long before anyone knows which slots this boot will warm.
const slotByModelId = new Map<string, LocalLightModelSlot>();

function statusKeyFor(slot: LocalLightModelSlot): string {
  return `${LOCAL_LIGHT_STATUS_PREFIX}${slot}`;
}

function publish(slot: LocalLightModelSlot, status: PrefetchStatus, detail: string, at: number): void {
  registry.set(slot, { status, detail, updatedAt: at });
}

/** Snapshot of every published slot — the half `entry/compose/admin.ts` merges into the Engines panel. */
export function allLocalLightPrefetchStatuses(): Record<string, LocalLightPrefetchRecord> {
  return Object.fromEntries([...registry.entries()].map(([slot, record]) => [statusKeyFor(slot), record]));
}

/** The download-progress sink `createBackendRegistry` hands the model cache. Routes a tick to whichever slot
 *  registered that repo id; an UNREGISTERED id (a model nobody prefetched, loaded lazily by a request) is
 *  dropped rather than published under a slot it does not belong to. */
export function recordLocalLightLoadProgress(progress: LocalLightLoadProgress, at: number): void {
  const slot = slotByModelId.get(progress.modelId);
  if (slot === undefined) {
    return;
  }
  publish(slot, "downloading", downloadDetail(progress), at);
}

// "jinaai/jina-clip-v2 — 42% (1.5 GB / 3.5 GB)"; phase-level when the hub served no content-length, because a
// percentage of an unknown total is a fabricated measurement.
function downloadDetail(progress: LocalLightLoadProgress): string {
  const { modelId, loaded, total } = progress;
  if (total <= 0 || loaded > total) {
    return `downloading ${modelId}`;
  }
  const PERCENT = 100;
  const percent = Math.floor((loaded / total) * PERCENT);
  return `downloading ${modelId} — ${String(percent)}% (${formatBytes(loaded)} / ${formatBytes(total)})`;
}

/** Reset the process-local registry. @public Test seam — the registry is module state shared by every test
 *  file in a worker, so a suite that asserts an empty surface must be able to clear a sibling's writes. */
export function __resetLocalLightPrefetchForTest(): void {
  registry.clear();
  slotByModelId.clear();
}

export interface LocalLightPrefetchDeps {
  /** The SHARED model cache — the same instance the backend serves requests from, which is the whole point:
   *  the memo inside it is what makes a mid-download request join rather than start a second download. */
  readonly cache: Pick<LocalLightModelCache, "preload">;
  /** The injected epoch-ms clock (no-raw-clock; every record's `updatedAt`). */
  readonly now: () => number;
}

export function createLocalLightPrefetch(deps: LocalLightPrefetchDeps): LocalLightPrefetchHandle {
  const log = getLog();
  // Per-slot single-flight ACROSS entry points: `start`'s walk and an admin `retry` of the same slot share
  // one promise, so the panel's Restart button can never double a 3.5 GB download.
  const inFlight = new Map<LocalLightModelSlot, Promise<void>>();
  const modelIdBySlot = new Map<LocalLightModelSlot, string>();
  let stopped = false;

  // @orb-waive brand-in-name-position(modelId): a HuggingFace repo id (`Xenova/…`) handed straight to transformers.js, NOT the OpenRouter `ModelId` brand — a different registry's namespace sharing the spelling. Ends if local-light models ever enter the connection catalog under our brand.
  async function warm(slot: LocalLightModelSlot, modelId: string): Promise<void> {
    const existing = inFlight.get(slot);
    if (existing !== undefined) {
      return await existing;
    }
    publish(slot, "downloading", `downloading ${modelId}`, deps.now());
    // @orb-waive caught-failure-ownership(preload): the failure IS surfaced, twice — a WARN naming the slot, the model and the knob, and a `failed` record on the admin engine-status surface carrying the reason. It is deliberately not propagated: the caller is a detached boot walk with no request to fail, and the lazy first-use path (untouched by a failed prefetch) remains the working arm. Ends if the prefetch becomes required for correctness rather than latency.
    const run = deps.cache
      .preload(slot, modelId)
      .then(() => {
        publish(slot, "ready", `${modelId} ready`, deps.now());
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        // ONE warn, no rethrow, no retry: the lazy path still works, so this is a slower box, not a broken
        // one. The sentence names the knob AND the consequence so an offline operator needs no source read.
        log.warn(
          { slot, modelId, err: message },
          "local-light: model prefetch failed — the weights will download lazily on first use instead (set LOCAL_LIGHT_PREFETCH=off to stop prefetching)",
        );
        publish(slot, "failed", `${modelId} — ${message} (it will download lazily on first use)`, deps.now());
      })
      .finally(() => {
        inFlight.delete(slot);
      });
    inFlight.set(slot, run);
    return await run;
  }

  // SEQUENTIAL by design: three concurrent fetches on a home connection make the one a user is waiting for
  // (embed) arrive last. The `stopped` check sits between slots because an in-flight ONNX load has no
  // interrupt — shutdown stops the WALK, and the last load settles into a registry nobody reads again.
  async function walk(targets: readonly LocalLightPrefetchTarget[]): Promise<void> {
    for (const { slot, modelId } of targets) {
      if (stopped) {
        return;
      }
      await warm(slot, modelId);
    }
  }

  return {
    start(targets): () => void {
      if (targets.length === 0) {
        return (): void => undefined;
      }
      const at = deps.now();
      // Register BEFORE the first load so a request that beats the walk to a model still routes its progress
      // to the right slot, and publish every slot up front so the panel shows the whole plan immediately.
      for (const { slot, modelId } of targets) {
        slotByModelId.set(modelId, slot);
        modelIdBySlot.set(slot, modelId);
        publish(slot, "queued", `queued — ${modelId}`, at);
      }
      log.info({ targets: targets.map((t) => `${t.slot}:${t.modelId}`) }, "boot: local-light model prefetch scheduled (background, non-blocking)");
      // DETACHED on purpose — this is the line that keeps boot off the download's critical path. Through
      // `superviseDetached` (the house seam for owned fire-and-forget) rather than a bare `void`, so the walk
      // gets its own span and any surprise from it is traced rather than silently lost; `walk` itself never
      // rejects, since every per-slot failure is already absorbed and published by `warm`.
      superviseDetached(`local-light:prefetch:${randomUUID()}`, "local-light.prefetch.walk", { slots: targets.length }, () => walk(targets));
      return (): void => {
        stopped = true;
      };
    },

    async retry(statusKey): Promise<string> {
      const slot = LOCAL_LIGHT_MODEL_SLOTS.find((candidate) => statusKeyFor(candidate) === statusKey);
      const modelId = slot === undefined ? undefined : modelIdBySlot.get(slot);
      if (slot === undefined || modelId === undefined) {
        return "not a local-light prefetch slot";
      }
      stopped = false;
      await warm(slot, modelId);
      return registry.get(slot)?.detail ?? `${modelId} retried`;
    },

    status: (): Record<string, LocalLightPrefetchRecord> => allLocalLightPrefetchStatuses(),
  };
}
