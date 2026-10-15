import { addAbortListener } from "node:events";
import { ProviderError } from "../../contract/errors.ts";

export const RESOLUTION_ABORTED_MESSAGE = "connection resolution aborted";

/** Stop waiting without cancelling shared work; the race retains its rejection handler after abort. */
export async function abortableWait<T>(work: Promise<T>, signal: AbortSignal | undefined, message = "local-light request aborted"): Promise<T> {
  if (signal === undefined) {
    return work;
  }
  const aborted = Promise.withResolvers<never>();
  const onAbort = (): void => {
    aborted.reject(new ProviderError({ kind: "aborted", retryable: false, message }));
  };
  using _subscription = addAbortListener(signal, onAbort);
  if (signal.aborted) {
    onAbort();
  }
  return await Promise.race([aborted.promise, work]);
}

/** Admit before starting work: an already-aborted caller must cause no owned effects. */
export function requireActiveSignal(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new ProviderError({ kind: "aborted", retryable: false, message: RESOLUTION_ABORTED_MESSAGE });
  }
}
