// infra/providers/backends/kit/abort-flatten — the ONE home for "fold a CALLER's AbortSignal into a signal
// WE own", and therefore the one home of the reason-flattening law every provider call obeys.
//
// THE BUG CLASS THIS EXISTS TO KILL (STRUCTURED-ABORT-REASON-LEAK): `AbortSignal.any([external, mine])`
// PROPAGATES the source signal's `reason`, and a signal handed to `fetch` makes that reason the value the
// fetch promise REJECTS with (per spec — undici does exactly this). So a caller's abort reason becomes the
// error text our transport classifier reads. `classifyTransportName` (`./error-classify.ts`) decides
// `aborted` vs retryable-`server` by matching /timeout|connection|network|overload/ over an error's
// name+message — so a domain abort whose reason merely CONTAINS one of those words ("timeout waiting for the
// user", "connection closed by the host") classifies a DELIBERATE CANCELLATION as a transient fault. A
// retryable verdict is then honoured by our own pre-commit retry loop (`./retry.ts`), and — measured on
// `@openrouter/sdk@1.1.8` — by the SDK's OWN default `retryConfig` (`retryConnectionErrors: true`, backoff
// with `maxElapsedTime: 3600000`), whose `isTimeoutError` heuristic fires on any reason named `TimeoutError`
// (which is precisely what `AbortSignal.any([external, AbortSignal.timeout(n)])` propagates). The cancelled
// call is RE-RUN — the exact opposite of cancelling, and it bills.
//
// THE FIX SHAPE: never compose with `.any`. Re-abort OUR OWN controller with NO argument, so every cause
// flattens to a plain `AbortError` and the provider taxonomy stays independent of any caller's abort
// vocabulary. The cancellation still propagates (same instant, same semantics) — only the REASON is dropped,
// and the reason was never ours to interpret.
//
// USERS: `./idle-timeout.ts` (the streaming chat runners' rolling stall guard) and `roles/dispatch.ts`
// (`runRole` — the ONE seam every role dispatch crosses, so every role gets it and a future role cannot
// forget). `domain/rpg/flush-barrier.ts` folds the same way for the same reason and cannot import this
// (providers is sealed to domain); its header cites this law.

/** A caller signal flattened onto a signal we own — hand `signal` to the provider call, `dispose()` on
 *  settle so a long-lived caller signal doesn't accumulate listeners across calls. */
export interface FlattenedAbort {
  /** OUR signal. Fires when the external one does; its `reason` is always a plain `AbortError`. */
  readonly signal: AbortSignal;
  /** Detach from the external signal (idempotent, safe after abort). */
  readonly dispose: () => void;
}

/**
 * Fold `external`'s cancellation into `controller` by RE-ABORTING it with no argument — never
 * `AbortSignal.any` (see the file header: `.any` propagates the reason, and the reason poisons the transport
 * classifier). An already-aborted `external` aborts synchronously, so a call entered post-cancel never
 * reaches the wire. Returns the detach function for the fold's listener.
 */
export function foldAbortInto(controller: AbortController, external: AbortSignal | undefined): () => void {
  const onAbort = (): void => controller.abort();
  if (external !== undefined) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener("abort", onAbort, { once: true });
    }
  }
  return (): void => external?.removeEventListener("abort", onAbort);
}

/** {@link foldAbortInto} over a fresh controller — the whole primitive for a caller that only needs a
 *  reason-free mirror of someone else's signal (the role-dispatch seam). */
export function flattenAbortSignal(external: AbortSignal): FlattenedAbort {
  const controller = new AbortController();
  const dispose = foldAbortInto(controller, external);
  return { signal: controller.signal, dispose };
}
