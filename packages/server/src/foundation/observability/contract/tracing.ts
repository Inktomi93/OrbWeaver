import type { SpanContext } from "@opentelemetry/api";
import type { ReadableSpan, TimedEvent } from "@opentelemetry/sdk-trace";

type ScalarAttribute = string | number | boolean;

/** Serialization converts native time tuples to milliseconds and flattens native attribute arrays. */
export interface SerializedSpan {
  spanId: SpanContext["spanId"];
  parentSpanId: SpanContext["spanId"] | undefined;
  name: ReadableSpan["name"];
  startedAt: number;
  durationMs: number;
  status: "ok" | "error";
  attributes: Record<string, ScalarAttribute>;
  events: SerializedSpanEvent[];
  requestId: string;
}

export interface SerializedSpanEvent {
  name: TimedEvent["name"];
  at: number;
  attributes?: SerializedSpan["attributes"];
}

export interface RequestTraceTotals {
  spanCount: number;
  dbSpanCount: number;
  dbDurationMs: number;
  providerDurationMs: number;
}

export interface RequestTrace extends Pick<SerializedSpan, "requestId" | "startedAt" | "durationMs" | "status"> {
  rootName: SerializedSpan["name"];
  spans: SerializedSpan[];
  totals: RequestTraceTotals;
}

/** Callers supply scalar metadata; native SDK arrays are accepted only by the serialization boundary. */
export interface SpanAttrs {
  [key: string]: ScalarAttribute | undefined;
}

/** The two detached-work boundaries one root's logger reports through (`createDetachedSupervision`). */
export interface DetachedSupervision {
  readonly superviseDetached: (requestId: string, name: string, attrs: SpanAttrs, operation: () => Promise<unknown> | unknown) => void;
  readonly superviseSettled: (requestId: string, name: string, attrs: SpanAttrs, operation: () => Promise<unknown> | unknown) => Promise<void>;
}
