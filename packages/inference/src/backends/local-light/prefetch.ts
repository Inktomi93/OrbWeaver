// The BOOT WARM-UP for the in-process tier: local-light's weights download LAZILY on first use, and on the
// GPU-less box this tier exists for that makes the FIRST search stall for minutes. The prefetch moves the
// download to just after the listener binds — but fires ONLY for the slots a task has ACTUALLY resolved to
// (§8.3: embed/imageEmbed → the encoder; rerank → the bound reranker).
// State is PER BACKEND INSTANCE (not module globals): a `downloading / ready / failed` record per slot, read
// in-process by the composition root. It has NO tRPC route and is owed none (owner ruling 2026-09-20, §8.3):
// the prefetch is a latency optimisation whose failure path is automatic, so there is no user-actionable
// state to render — an earlier draft promised a Connections-pane readout and that surface was struck.
// ONE attempt per slot per boot; a failure is a WARN, never a crash — the lazy path is untouched.
import type { ModelId } from "@orb/kit/ids";
import { formatBytes } from "@orb/kit/strings";
import type { LocalLightLoadProgress, LocalLightModelSlot } from "#contract";
import { LOCAL_LIGHT_MODEL_SLOTS } from "#contract";
import type {
  LocalLightPrefetchDeps,
  LocalLightPrefetchHandle,
  LocalLightPrefetchRecord,
  LocalLightPrefetchStatus,
  LocalLightPrefetchTarget,
} from "../../contract/local-light.ts";

const PERCENT = 100;

function downloadDetail(progress: LocalLightLoadProgress): string {
  const { modelId, loaded, total } = progress;
  if (total <= 0 || loaded > total) {
    return `downloading ${modelId}`;
  }
  return `downloading ${modelId} — ${String(Math.floor((loaded / total) * PERCENT))}% (${formatBytes(loaded)} / ${formatBytes(total)})`;
}

export function createLocalLightPrefetch(deps: LocalLightPrefetchDeps): LocalLightPrefetchHandle {
  const registry = new Map<LocalLightModelSlot, LocalLightPrefetchRecord>();
  const slotByModelId = new Map<ModelId, LocalLightModelSlot>();
  const targetBySlot = new Map<LocalLightModelSlot, LocalLightPrefetchTarget>();
  const inFlight = new Map<LocalLightModelSlot, Promise<void>>();
  let stopped = false;

  const publish = (slot: LocalLightModelSlot, status: LocalLightPrefetchStatus, detail: string): void => {
    registry.set(slot, { status, detail, updatedAt: deps.now() });
  };

  async function warm({ slot, modelId, onnx }: LocalLightPrefetchTarget): Promise<void> {
    const existing = inFlight.get(slot);
    if (existing !== undefined) {
      return await existing;
    }
    publish(slot, "downloading", `downloading ${modelId}`);
    const run = deps
      .cache()
      // the `deps.log.warn` at prefetch.ts:56 and the published `failed` state at prefetch.ts:57 own the failure; first use keeps the lazy load path. Ends if prefetch becomes required.
      .preload(slot, modelId, onnx)
      .then(() => publish(slot, "ready", `${modelId} ready`))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        deps.log.warn({ slot, modelId, err: message }, "local-light: model prefetch failed — the weights will download lazily on first use instead");
        publish(slot, "failed", `${modelId} — ${message} (it will download lazily on first use)`);
      })
      .finally(() => inFlight.delete(slot));
    inFlight.set(slot, run);
    return await run;
  }

  // SEQUENTIAL by design: concurrent fetches on a home connection make the one a user waits for arrive last.
  async function walk(targets: readonly LocalLightPrefetchTarget[]): Promise<void> {
    for (const target of targets) {
      if (stopped) {
        return;
      }
      await warm(target);
    }
  }

  return {
    start(targets): () => void {
      if (targets.length === 0) {
        return (): void => undefined;
      }
      for (const target of targets) {
        slotByModelId.set(target.modelId, target.slot);
        targetBySlot.set(target.slot, target);
        publish(target.slot, "queued", `queued — ${target.modelId}`);
      }
      deps.log.info({ targets: targets.map((t) => `${t.slot}:${t.modelId}`) }, "boot: local-light model prefetch scheduled (background, non-blocking)");
      deps.detach("local-light.prefetch.walk", () => walk(targets));
      return (): void => {
        stopped = true;
      };
    },
    async retry(slot): Promise<string> {
      const target = targetBySlot.get(slot);
      if (target === undefined) {
        return "not a scheduled local-light slot";
      }
      stopped = false;
      await warm(target);
      return registry.get(slot)?.detail ?? `${target.modelId} retried`;
    },
    status: () =>
      Object.fromEntries(LOCAL_LIGHT_MODEL_SLOTS.map((slot) => [slot, registry.get(slot)])) as Record<
        LocalLightModelSlot,
        LocalLightPrefetchRecord | undefined
      >,
    onProgress: (progress): void => {
      const slot = slotByModelId.get(progress.modelId);
      if (slot !== undefined) {
        publish(slot, "downloading", downloadDetail(progress));
      }
    },
  };
}

export type { LocalLightPrefetchDeps, LocalLightPrefetchHandle, LocalLightPrefetchRecord, LocalLightPrefetchTarget } from "../../contract/local-light.ts";
