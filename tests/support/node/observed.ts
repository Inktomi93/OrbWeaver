// The process observability every root writes to: the logger, its line ring, the trace ring and a request-root span.
// Logging and tracing are process singletons, so two roots in one worker share them; a suite filters by its own ids.

import type { RequestTrace } from "@orb/server/foundation/observability";
import { getLog, initTracing, logRing, logSerializers, recentTraces, withRequestSpan } from "@orb/server/foundation/observability";

type Logger = ReturnType<typeof getLog>;

/** What production logged and traced, read through the rings `/api/_debug` serves. */
export const processObservability = {
  /** The logger a root's graph writes through outside a request scope; a suite spies on it. */
  logger: (): Logger => getLog(),
  /** The newest serialized log lines, oldest first. */
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
