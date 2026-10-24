// One root's observability read through the rings its `/api/_debug` surface serves: the root logger's lines, the
// sealed traces and a request-root span. A second root in the same worker reads only its own rings.

import type { ObservabilityRings, RequestTrace } from "@orb/server/foundation/observability";
import { initTracing, logSerializers, withRequestSpan } from "@orb/server/foundation/observability";

/** What one root logged and traced. */
export interface RootObservability {
  /** The root's newest serialized log lines, newest first. */
  readonly logLines: (limit?: number) => readonly string[];
  /** What the logger's `err` serializer writes for an error, before redaction. */
  readonly serializeError: (error: Error) => ReturnType<typeof logSerializers.err>;
  /** The root's newest sealed request traces. */
  readonly traces: (limit: number) => readonly RequestTrace[];
  /** Run `work` under a request-root span, as the HTTP observability middleware does; tracing starts on first use. */
  readonly inRequestSpan: <T>(requestId: string, name: string, work: () => Promise<T> | T) => Promise<T>;
}

/** The reads over one root's rings; only the harness builds one, beside the rings it composes with. */
export function observeRoot(rings: ObservabilityRings): RootObservability {
  return {
    logLines: (limit) => rings.logs.recent(limit),
    serializeError: (error) => logSerializers.err(error),
    traces: (limit) => rings.traces.recent(limit),
    inRequestSpan: <T>(requestId: string, name: string, work: () => Promise<T> | T): Promise<T> => {
      initTracing();
      return withRequestSpan({ traces: rings.traces, requestId }, name, {}, work);
    },
  };
}
