// The failure classes a `fetch` and a response body read report for a cause outside the caller's code: the network
// (fetch's `TypeError`, by the WHATWG Fetch standard) and the request's abort or timeout signal. A catch that answers a
// fallback for an unreachable peer narrows to these and rethrows the rest. Matched by name, not by `DOMException`
// class, so the check holds in every compiler world and across realms.

const SIGNAL_FAILURE_NAMES: ReadonlySet<string> = new Set(["AbortError", "TimeoutError"]);

/** Whether a rejected `fetch` or body read failed on the network, or on the request's abort or timeout signal. */
export function isFetchFailure(error: unknown): boolean {
  return error instanceof TypeError || (Error.isError(error) && SIGNAL_FAILURE_NAMES.has(error.name));
}
