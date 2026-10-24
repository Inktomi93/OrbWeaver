// The process observability every root writes to: the line ring every root logger feeds, the trace ring and a request-root span.
// Log reads cover what was written since the first live root opened (that root empties the ring); overlapping roots share lines.

import type { RequestTrace } from "@orb/server/foundation/observability";
import { initTracing, logRing, logSerializers, recentTraces, withRequestSpan } from "@orb/server/foundation/observability";

let liveRoots = 0;

/** What production logged and traced, read through the rings `/api/_debug` serves. */
export const processObservability = {
  /** Open a root's log scope; disposing it closes the scope. Only the harness opens one, around a root's lifetime. */
  openRoot: (): Disposable => {
    if (liveRoots === 0) {
      logRing.clear();
    }
    liveRoots += 1;
    let open = true;
    return {
      [Symbol.dispose]: (): void => {
        if (open) {
          open = false;
          liveRoots -= 1;
        }
      },
    };
  },
  /** The newest serialized log lines written since the first live root opened, newest first. */
  logLines: (limit?: number): readonly string[] => logRing.recent(limit),
  /** What the logger's `err` serializer writes for an error, before redaction. */
  serializeError: (error: Error): ReturnType<typeof logSerializers.err> => logSerializers.err(error),
  /** The newest sealed request traces. */
  traces: (limit: number): readonly RequestTrace[] => recentTraces(limit),
  /** Run `work` under a request-root span, as the HTTP observability middleware does; tracing starts on first use. */
  inRequestSpan: <T>(requestId: string, name: string, work: () => Promise<T> | T): Promise<T> => {
    initTracing();
    return withRequestSpan(requestId, name, {}, work);
  },
};
