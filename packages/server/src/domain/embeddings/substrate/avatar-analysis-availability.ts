// domain/embeddings/substrate/avatar-analysis-availability — one root's memory of "this summarize model
// cannot analyse an avatar", so the indexer asks a backend ONCE instead of once per asset, every sweep,
// forever (#2422).
//
// THE INCIDENT. On a box whose engine serves a checkpoint other than the configured summarize model, every
// avatar in the corpus produced its own chat request, its own 404 ("The model `…` does not exist") and its own
// WARN — and on a sleeping local engine the FIRST of those requests WAKES the fleet, so a boot spent a GPU
// wake plus N failed calls for zero rows. The verdict is deterministic and identical for every asset: it is a
// fact about the MODEL, not about the image, so it belongs in one place that is asked before the call.
//
// KEYED BY MODEL ID, never a global flag: a role re-point (settings → summarize role, or a different engine
// checkpoint) is a DIFFERENT model, and it must get its own first attempt rather than inheriting a verdict
// about the model it replaced. The key is the same `roleClients.summarizerModel` string the caption row is
// stamped with, so the latch and the provenance column can never disagree about which model is meant.
//
// ONE PER COMPOSITION ROOT: a root's verdict about its own engine never skips another root's call. A restart
// re-asks, which is the right window: swapping the served checkpoint is a restart-scale event.
//
// DELIBERATELY NOT PERSISTED and deliberately not a negative CACHE with a TTL: a durable row would outlive the
// engine swap that fixes it, and a TTL would re-introduce the wake on a schedule. "Ask once per root" is
// the whole contract.

import type { AvatarAnalysisAvailability } from "../contract/service.ts";

/** A root's empty availability latch. */
export function createAvatarAnalysisAvailability(): AvatarAnalysisAvailability {
  // Model ids the summarize backend has refused as nonexistent/unavailable for this root.
  const unservable = new Set<string>();
  // Model ids whose skip has already been announced — the reason is logged ONCE, not once per asset.
  const announced = new Set<string>();
  return {
    unservable: (model) => unservable.has(model),
    markUnservable: (model): boolean => {
      if (unservable.has(model)) {
        return false;
      }
      unservable.add(model);
      return true;
    },
    announceSkip: (model): boolean => {
      if (announced.has(model)) {
        return false;
      }
      announced.add(model);
      return true;
    },
  };
}
