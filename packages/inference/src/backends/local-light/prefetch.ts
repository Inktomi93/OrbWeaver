// The BOOT WARM-UP for the in-process tier: local-light's weights download LAZILY on first use, and on the
// GPU-less box this tier exists for that makes the FIRST search stall for minutes. The prefetch moves the
// download to just after the listener binds — but fires ONLY for the slots a task has ACTUALLY resolved to
// (§8.3: embed/imageEmbed → the encoder; rerank → the bound reranker).
// It keeps no readable state and has NO tRPC route (owner ruling 2026-09-20, §8.3): the prefetch is a latency
// optimisation whose failure path is automatic, so there is no user-actionable state to render.
// ONE attempt per slot per boot; a failure is a WARN, never a crash — the lazy path is untouched.
import type { LocalLightPrefetchDeps, LocalLightPrefetchHandle, LocalLightPrefetchTarget } from "#src/contract/local-light.ts";

export function createLocalLightPrefetch(deps: LocalLightPrefetchDeps): LocalLightPrefetchHandle {
  let stopped = false;

  async function warm({ slot, modelId, onnx }: LocalLightPrefetchTarget): Promise<void> {
    try {
      await deps.cache().preload(slot, modelId, onnx);
    } catch (err) {
      // the warn below owns the failure; first use keeps the lazy load path. Ends if prefetch becomes required.
      const message = err instanceof Error ? err.message : String(err);
      deps.log.warn({ slot, modelId, err: message }, "local-light: model prefetch failed — the weights will download lazily on first use instead");
    }
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
      deps.log.info({ targets: targets.map((t) => `${t.slot}:${t.modelId}`) }, "boot: local-light model prefetch scheduled (background, non-blocking)");
      deps.detach("local-light.prefetch.walk", () => walk(targets));
      return (): void => {
        stopped = true;
      };
    },
  };
}

export type { LocalLightPrefetchDeps, LocalLightPrefetchHandle } from "#src/contract/local-light.ts";
