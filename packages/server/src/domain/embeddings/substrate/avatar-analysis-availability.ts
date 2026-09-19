// domain/embeddings/substrate/avatar-analysis-availability — the per-process memory of "this summarize model
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
// ASSUMES(single-replica): module scope, per process — like `connection/substrate/vllm-gen-window-cache`,
// and for the same reason (the engines are loopback-local on the one-box deployment). A restart re-asks, which
// is the right window: swapping the served checkpoint is a restart-scale event.
//
// DELIBERATELY NOT PERSISTED and deliberately not a negative CACHE with a TTL: a durable row would outlive the
// engine swap that fixes it, and a TTL would re-introduce the wake on a schedule. "Ask once per process" is
// the whole contract.

/** Model ids the summarize backend has refused as nonexistent/unavailable this process. */
const unservable = new Set<string>();

/** Model ids whose skip has already been announced — the reason is logged ONCE, not once per asset. */
const announced = new Set<string>();

/** Has this model already told us it cannot serve an avatar analysis? */
export function avatarAnalysisUnservable(model: string): boolean {
  return unservable.has(model);
}

/** Record the backend's own refusal for this model. Returns true when THIS call latched it (the caller logs
 *  the loud line exactly then — a later asset's skip is silent by design). */
export function markAvatarAnalysisUnservable(model: string): boolean {
  if (unservable.has(model)) {
    return false;
  }
  unservable.add(model);
  return true;
}

/** True the FIRST time a given model's skip is announced — the once-per-process log gate for a skip that is
 *  decided before any call (a summarize model that declares no image input). */
export function announceAvatarAnalysisSkip(model: string): boolean {
  if (announced.has(model)) {
    return false;
  }
  announced.add(model);
  return true;
}

/** @internal test seam — drop the per-process memory for within-file cold/warm transitions. */
export function __resetAvatarAnalysisAvailability(): void {
  unservable.clear();
  announced.clear();
}
