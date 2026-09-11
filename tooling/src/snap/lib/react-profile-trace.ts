// React trace capture for Snap's `--react-profile` arm: the CDP tracing session that brackets the React
// development-renderer read, the Performance.getMetrics clock calibration, and the projection of the raw
// trace into React track events. Split out of ops/arms/profile.ts when that file crossed the tooling size
// cap (2026-09-04); the arm owns the browser lifecycle and calls start/stop, this file owns the trace.
import { errorMessage } from "@orb/kit/error-message";
import type { CDPSession, Page } from "@playwright/test";
import { budget } from "../../_shared/load-budget.ts";
import type { ReactTraceEvent, TraceCalibration } from "./react-profile-receipt.ts";

const TRACE_COMPLETE_BASE_MS = 30_000;
const MICROSECONDS_PER_MILLISECOND = 1000;

export interface TraceCapture {
  readonly cdp: CDPSession;
  readonly events: unknown[];
  readonly complete: Promise<void>;
  readonly calibration: TraceCalibration | null;
  started: boolean;
}

export function recordOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : null;
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function traceEpochMs(
  timestampUs: number | null,
  calibration: TraceCalibration | null,
  originTs: number | null,
  originWallSeconds: number | null,
): number | null {
  if (timestampUs === null) {
    return null;
  }
  if (calibration !== null) {
    const epochMs = calibration.epochMs + (timestampUs - calibration.timestampUs) / MICROSECONDS_PER_MILLISECOND;
    return Math.round(epochMs * MICROSECONDS_PER_MILLISECOND) / MICROSECONDS_PER_MILLISECOND;
  }
  if (originTs === null || originWallSeconds === null) {
    return null;
  }
  const epochMs = originWallSeconds * MICROSECONDS_PER_MILLISECOND + (timestampUs - originTs) / MICROSECONDS_PER_MILLISECOND;
  return Math.round(epochMs * MICROSECONDS_PER_MILLISECOND) / MICROSECONDS_PER_MILLISECOND;
}

export function reactTraceEvents(events: readonly unknown[], calibration: TraceCalibration | null): readonly ReactTraceEvent[] {
  const rows: ReactTraceEvent[] = [];
  const origin = events
    .map(recordOf)
    .find((event) => event?.["name"] === "TracingStartedInBrowser" && recordOf(recordOf(event["args"])?.["data"])?.["wallTime"] !== undefined);
  const originData = recordOf(recordOf(origin?.["args"])?.["data"]);
  const originTs = numberOf(origin?.["ts"]);
  const originWallSeconds = numberOf(originData?.["wallTime"]);
  for (const raw of events) {
    const event = recordOf(raw);
    if (event === null) {
      continue;
    }
    const name = stringOf(event["name"]);
    const args = recordOf(event["args"]);
    const data = recordOf(args?.["data"]);
    const message = stringOf(data?.["message"]);
    const detailText = `${name} ${message} ${JSON.stringify(args ?? {})}`;
    if (!(detailText.includes("Components ⚛") || detailText.includes("Scheduler ⚛") || detailText.includes("react-component"))) {
      continue;
    }
    const timestampUs = numberOf(event["ts"]);
    rows.push({
      name: name || message || "React track event",
      category: stringOf(event["cat"]),
      phase: stringOf(event["ph"]),
      timestampUs,
      durationUs: numberOf(event["dur"]),
      epochMs: traceEpochMs(timestampUs, calibration, originTs, originWallSeconds),
      detail: args,
    });
  }
  return rows;
}

export async function stopTrace(capture: TraceCapture): Promise<string | null> {
  if (!capture.started) {
    return null;
  }
  let endSent = false;
  // @orb-waive caught-failure-ownership(error): the caught trace failure is returned as traceError, filed in the profile artifact and printed as `track limit`; Fiber evidence remains independently valid. Ends if stopTrace stops returning the caught detail or reportReactProfile stops printing traceError.
  try {
    await capture.cdp.send("Tracing.end");
    endSent = true;
    const timeoutMs = budget(TRACE_COMPLETE_BASE_MS);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        capture.complete,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error(`Chromium did not finish the React trace within ${String(timeoutMs)}ms`)), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    return null;
  } catch (error) {
    const failure = errorMessage(error);
    if (!endSent) {
      try {
        await capture.cdp.send("Tracing.end");
      } catch (cleanupError) {
        return `${failure}; cleanup retry failed: ${errorMessage(cleanupError)}`;
      }
    }
    return failure;
  } finally {
    capture.started = false;
    // Tracing.end above owns browser-side trace shutdown; detaching releases the transport. The retained
    // traceError remains explicit without replacing independently valid Fiber evidence.
    // @orb-waive caught-failure-ownership(capture.cdp.detach): Tracing.end is the terminal browser-side cleanup owner; the caught measurement/retry detail above is retained for the operator. Ends if stopTrace stops sending Tracing.end before detach.
    await capture.cdp.detach().catch(() => undefined);
  }
}

export async function startTrace(page: Page): Promise<{ readonly capture: TraceCapture | null; readonly error: string | null }> {
  let cdp: CDPSession | null = null;
  try {
    cdp = await page.context().newCDPSession(page);
    const events: unknown[] = [];
    const complete = Promise.withResolvers<void>();
    cdp.on("Tracing.dataCollected", (payload: { readonly value?: readonly unknown[] }) => events.push(...(payload.value ?? [])));
    cdp.once("Tracing.tracingComplete", () => complete.resolve());
    const before = Date.now();
    await cdp.send("Performance.enable");
    const metrics = await cdp.send("Performance.getMetrics");
    const after = Date.now();
    const timestampSeconds = metrics.metrics.find((metric) => metric.name === "Timestamp")?.value;
    const calibration =
      timestampSeconds === undefined
        ? null
        : { timestampUs: timestampSeconds * MICROSECONDS_PER_MILLISECOND * MICROSECONDS_PER_MILLISECOND, epochMs: (before + after) / 2 };
    const capture: TraceCapture = { cdp, events, complete: complete.promise, calibration, started: false };
    await cdp.send("Tracing.start", {
      categories: "-*,devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,blink.console",
      transferMode: "ReportEvents",
    });
    capture.started = true;
    return { capture, error: null };
  } catch (error) {
    if (cdp !== null) {
      // @orb-waive caught-failure-ownership(cdp.detach): a failed trace start owns no later measurement; detaching is best-effort and the caught start error is returned as the operator-visible track limit. Ends if this catch stops returning the start error.
      await cdp.detach().catch(() => undefined);
    }
    return { capture: null, error: errorMessage(error) };
  }
}
