// The retained, JSON-safe slice of DevTools' trace-engine output. Raw trace events are written beside
// the report; this summary keeps the actual boot metric and the six insight families observed in the
// Chrome-MCP retirement census without trying to serialize trace-engine Maps, Sets, or event graphs.
import type { BootTraceInsightName, BootTraceInsightReceipt, BootTraceReceipt } from "../contract/types.ts";
import { BOOT_TRACE_INSIGHTS } from "../contract/types.ts";

const MICROSECONDS_PER_MILLISECOND = 1000;

interface InsightSetLike {
  readonly id?: unknown;
  readonly url?: unknown;
  readonly navigation?: unknown;
  readonly model?: unknown;
  readonly modelErrors?: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function size(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }
  return value instanceof Map || value instanceof Set ? value.size : 0;
}

function microToMs(value: unknown): number | null {
  const measured = number(value);
  return measured === null ? null : measured / MICROSECONDS_PER_MILLISECOND;
}

function state(model: Record<string, unknown>, name: BootTraceInsightName): BootTraceInsightReceipt["state"] {
  const measured = model["state"];
  if (measured === "pass" || measured === "fail" || measured === "informative") {
    return measured;
  }
  throw new Error(`boot trace ${name} did not publish a verdict state`);
}

function lcpDetails(model: Record<string, unknown>): Record<string, unknown> {
  const subparts = record(model["subparts"]);
  const durations = Object.fromEntries(Object.entries(subparts).map(([name, subpart]) => [name, microToMs(record(subpart)["range"])]));
  return { lcpMs: number(model["lcpMs"]), subpartsMs: durations, hasImageRequest: model["lcpRequest"] !== undefined };
}

function insightDetails(name: BootTraceInsightName, model: Record<string, unknown>): Record<string, unknown> {
  switch (name) {
    case "LCPBreakdown":
      return lcpDetails(model);
    case "CLSCulprits":
      return { shifts: size(model["shifts"]), clusters: size(model["clusters"]), animationFailures: size(model["animationFailures"]) };
    case "NetworkDependencyTree":
      return { roots: size(model["rootNodes"]), maxCriticalPathMs: microToMs(model["maxTime"]), failed: model["fail"] === true };
    case "ImageDelivery":
      return { optimizableImages: size(model["optimizableImages"]), wastedBytes: number(model["wastedBytes"]) };
    case "DocumentLatency": {
      const data = record(model["data"]);
      const checklist = record(data["checklist"]);
      return {
        serverResponseMs: number(data["serverResponseTime"]),
        redirectMs: number(data["redirectDuration"]),
        uncompressedBytes: number(data["uncompressedResponseBytes"]),
        checklist: Object.fromEntries(Object.entries(checklist).map(([key, item]) => [key, record(item)["value"] === true])),
      };
    }
    case "ForcedReflow": {
      const top = record(model["topLevelFunctionCallData"]);
      const frames: unknown[] = Array.isArray(model["aggregatedBottomUpData"]) ? model["aggregatedBottomUpData"] : [];
      const attributedTotal = frames.reduce<number>((total, frame) => total + (number(record(frame)["totalTime"]) ?? 0), 0);
      return {
        totalReflowMs: microToMs(number(top["totalReflowTime"]) ?? attributedTotal),
        callFrames: frames.length,
      };
    }
  }
}

function navigationSet(insights: unknown): InsightSetLike {
  if (!(insights instanceof Map)) {
    throw new Error("boot trace analyzer did not return an insight-set Map");
  }
  for (const candidate of insights.values()) {
    const set = candidate as InsightSetLike;
    if (set.navigation !== undefined) {
      return set;
    }
  }
  throw new Error("boot trace has no navigation insight set; capture must begin before page navigation");
}

export function summarizeBootTrace(analyzed: { readonly insights: unknown }, eventCount: number, rawTracePath: string): BootTraceReceipt {
  const set = navigationSet(analyzed.insights);
  const models = record(set.model);
  const modelErrors = record(set.modelErrors);
  const receipts = {} as Record<BootTraceInsightName, BootTraceInsightReceipt>;
  for (const name of BOOT_TRACE_INSIGHTS) {
    if (modelErrors[name] !== undefined) {
      throw new Error(`boot trace insight ${name} failed: ${String(modelErrors[name])}`);
    }
    const model = record(models[name]);
    if (Object.keys(model).length === 0) {
      throw new Error(`boot trace omitted required insight family ${name}`);
    }
    receipts[name] = { state: state(model, name), details: insightDetails(name, model) };
  }
  const lcpMs = number(record(models["LCPBreakdown"])["lcpMs"]);
  if (lcpMs === null || lcpMs <= 0) {
    throw new Error("boot trace has no positive LCP; capture likely began after navigation");
  }
  const navigationId = typeof set.id === "string" ? set.id : "";
  if (navigationId === "") {
    throw new Error("boot trace navigation insight set has no navigation id");
  }
  return {
    eventCount,
    navigationId,
    url: String(set.url ?? ""),
    lcpMs,
    rawTracePath,
    insights: receipts,
  };
}
