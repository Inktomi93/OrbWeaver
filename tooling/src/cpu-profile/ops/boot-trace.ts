// Chromium navigation-trace capture for perf-meter. Start/stop ownership lives here so the caller
// cannot accidentally move `Tracing.start` below `page.goto` and turn a boot trace into a post-nav span.
import { writeFile } from "node:fs/promises";
import { errorMessage } from "@orb/kit/error-message";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { budget, loadKillError } from "@orb/tooling/_shared/load-budget";
import { warn } from "@orb/tooling/_shared/log";
import type { CDPSession, Page } from "@playwright/test";
import { defaultConfig, traceCategories } from "lighthouse";
import { TraceEngineResult } from "lighthouse/core/computed/trace-engine-result.js";
import type { BootTraceReceipt, BootTraceRetention, BootTraceRetentionContext } from "../contract/types.ts";
import { summarizeBootTrace } from "../lib/boot-trace.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --boot-trace");

interface TraceDataCollected {
  readonly value?: readonly unknown[];
}

const TRACE_COMPLETE_BASE_MS = 30_000;
const BOOT_LCP_STATE = "__orbBootLcpCandidates";

interface BootLcpState {
  readonly count: number;
  readonly latestStartTime: number | null;
}

async function installBootLcpObserver(cdp: CDPSession): Promise<string> {
  await cdp.send("Page.enable");
  const installed = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
    const animationFrame = globalThis.requestAnimationFrame.bind(globalThis);
    const waiters = new Set();
    const state = {
      count: 0,
      latestStartTime: null,
      presentation: () => new Promise((resolve) => {
        const done = () => {
          waiters.delete(done);
          resolve({ count: state.count, latestStartTime: state.latestStartTime });
        };
        waiters.add(done);
        animationFrame(() => animationFrame(done));
      }),
      dispose: () => {
        observer.disconnect();
        for (const done of waiters) done();
        waiters.clear();
      },
    };
    Object.defineProperty(globalThis, ${JSON.stringify(BOOT_LCP_STATE)}, { value: state, configurable: true });
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.count += 1;
        state.latestStartTime = entry.startTime;
      }
    });
    observer.observe({ type: "largest-contentful-paint", buffered: true });
  })()`,
  });
  if (installed.identifier === "") {
    throw new Error("Chromium did not return an identifier for the boot LCP observer");
  }
  return installed.identifier;
}

/** End the initial-navigation measurement after its resource graph loaded and Chromium had two
 * presentation opportunities. LCP entries are provisional, so the first text candidate is not a stop
 * signal; the post-load frame boundary lets a later, larger image replace it before analysis. */
async function awaitBootPresentation(page: Page): Promise<BootLcpState> {
  const timeoutMs = budget(TRACE_COMPLETE_BASE_MS);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async (): Promise<BootLcpState> => {
        // One owner for the whole endpoint: Playwright's inner timeout is disabled so load and the
        // presentation frames cannot race two differently classified clocks.
        // @orb-waive tooling-clock-budget(0): Playwright uses zero to disable its inner timer; the enclosing load-scaled race bounds both load and presentation. Ends if that outer budget is removed.
        await page.waitForLoadState("load", { timeout: 0 });
        return await page.evaluate<BootLcpState>(
          `globalThis[${JSON.stringify(BOOT_LCP_STATE)}]?.presentation() ?? Promise.resolve({ count: 0, latestStartTime: null })`,
        );
      })(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              loadKillError({
                what: "boot trace did not reach its post-load presentation boundary",
                budgetMs: timeoutMs,
                baseMs: TRACE_COMPLETE_BASE_MS,
              }),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function startCleanupError(primary: unknown, cleanup: unknown): AggregateError {
  return new AggregateError([primary, cleanup], "boot trace failed to start and its terminal cleanup also failed", { cause: primary });
}

async function stopTrace(cdp: CDPSession, complete: Promise<void>): Promise<void> {
  const timeoutMs = budget(TRACE_COMPLETE_BASE_MS);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async (): Promise<void> => {
        await cdp.send("Tracing.end");
        await complete;
      })(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Chromium did not finish the boot trace within its ${String(timeoutMs)}ms load-scaled budget`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/** Preserve partial evidence and every failed capture phase before permitting analysis. */
async function stopAndRetainTrace(
  stopping: Promise<void>,
  events: readonly unknown[],
  rawTracePath: string,
  { earlierFailures, onRetained }: BootTraceRetentionContext,
): Promise<void> {
  const failures = [...earlierFailures];
  let complete = false;
  try {
    await stopping;
    complete = true;
  } catch (error) {
    failures.push(error);
  }
  // A failed stop leaves a partial trace, which is still evidence. Never analyze it as complete.
  try {
    const eventCount = events.length;
    await writeFile(rawTracePath, JSON.stringify({ traceEvents: events }));
    await onRetained?.({ complete, eventCount });
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, `boot trace failed: ${failures.map(errorMessage).join("; ")}`, { cause: failures[0] });
  }
}

export interface ActiveBootTrace {
  readonly finish: (rawTracePath: string, onRetained?: (retained: BootTraceRetention) => Promise<void>) => Promise<BootTraceReceipt>;
  readonly abort: () => Promise<void>;
}

/** Start before navigation and return one total terminal owner. Snap owns the lifecycle; this retained
 *  engine owns the trace/analyzer protocol. */
export async function beginBootTrace(page: Page): Promise<ActiveBootTrace> {
  const cdp = await page.context().newCDPSession(page);
  const events: unknown[] = [];
  const complete = Promise.withResolvers<void>();
  const collect = (payload: TraceDataCollected): void => {
    events.push(...(payload.value ?? []));
  };
  const markComplete = (): void => complete.resolve();
  cdp.on("Tracing.dataCollected", collect);
  cdp.once("Tracing.tracingComplete", markComplete);
  let observerScript: string | undefined;
  let observerCleaned = false;
  const cleanupObserver = async (): Promise<void> => {
    if (observerCleaned || observerScript === undefined) {
      return;
    }
    observerCleaned = true;
    const failures: unknown[] = [];
    try {
      await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: observerScript });
    } catch (error) {
      failures.push(error);
    }
    try {
      const disposed = await cdp.send("Runtime.evaluate", {
        expression: `(() => { const state = globalThis[${JSON.stringify(BOOT_LCP_STATE)}]; state?.dispose(); return delete globalThis[${JSON.stringify(BOOT_LCP_STATE)}]; })()`,
        returnByValue: true,
      });
      if (disposed.exceptionDetails !== undefined) {
        failures.push(new Error(`boot LCP observer disposal threw: ${disposed.exceptionDetails.text}`));
      }
    } catch (error) {
      failures.push(error);
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "boot LCP observer cleanup failed");
    }
  };
  let detached = false;
  const detach = async (): Promise<void> => {
    if (detached) {
      return;
    }
    detached = true;
    cdp.removeListener("Tracing.dataCollected", collect);
    cdp.removeListener("Tracing.tracingComplete", markComplete);
    await cdp.detach();
  };

  try {
    observerScript = await installBootLcpObserver(cdp);
    await cdp.send("Tracing.start", {
      transferMode: "ReportEvents",
      traceConfig: { recordMode: "recordUntilFull", includedCategories: traceCategories },
    });
  } catch (error) {
    const failures: unknown[] = [];
    try {
      await cleanupObserver();
    } catch (cleanup) {
      failures.push(cleanup);
    }
    try {
      await detach();
    } catch (cleanup) {
      failures.push(cleanup);
    }
    if (failures.length > 0) {
      throw startCleanupError(error, failures.length === 1 ? failures[0] : new AggregateError(failures, "boot trace start cleanup failed"));
    }
    throw error;
  }
  let active = true;
  const detachReported = async (): Promise<void> => {
    await cleanupObserver().catch((error: unknown) => warn(`BOOT LCP CLEANUP     ${errorMessage(error)}`));
    // @orb-waive caught-failure-ownership(detach): detach is terminal cleanup after trace stop/abort; warn prints the exact failure and the owning Snap session still closes the browser. Ends if this warning or the following session close disappears.
    await detach().catch((error: unknown) => warn(`BOOT TRACE DETACH   ${errorMessage(error)}`));
  };
  const abort = async (): Promise<void> => {
    if (active) {
      active = false;
      // Cleanup cannot replace the navigation/analyzer failure already leaving this block, but it is
      // still operator-visible: a failed Tracing.end can leave Chromium recording until session close.
      // @orb-waive caught-failure-ownership(stopTrace): warn receives the caught cleanup error and prints it as BOOT TRACE CLEANUP; the surrounding session close remains the terminal cleanup owner. Ends if this warning stops carrying the failure or session close stops following this block.
      await stopTrace(cdp, complete.promise).catch((error: unknown) => warn(`BOOT TRACE CLEANUP  ${errorMessage(error)}`));
    }
    await detachReported();
  };
  return {
    abort,
    finish: async (rawTracePath, onRetained): Promise<BootTraceReceipt> => {
      if (!active) {
        throw new Error("boot trace was already finished");
      }
      active = false;
      try {
        let presentation: BootLcpState | undefined;
        const failures: unknown[] = [];
        try {
          presentation = await awaitBootPresentation(page);
        } catch (error) {
          failures.push(error);
        }
        await stopAndRetainTrace(stopTrace(cdp, complete.promise), events, rawTracePath, { earlierFailures: failures, onRetained });
        if (presentation === undefined || presentation.count === 0 || presentation.latestStartTime === null || presentation.latestStartTime <= 0) {
          throw new Error("boot trace reached its post-load presentation boundary without a positive LCP candidate");
        }
        const hostDpr = await page.evaluate(() => (globalThis as unknown as { readonly devicePixelRatio: number }).devicePixelRatio);
        const settings = defaultConfig.settings as Parameters<typeof TraceEngineResult.runTraceEngine>[1] | undefined;
        if (settings === undefined) {
          throw new Error("Lighthouse default config omitted trace-engine settings");
        }
        const analyzed = await TraceEngineResult.runTraceEngine(events as Parameters<typeof TraceEngineResult.runTraceEngine>[0], settings, [], hostDpr);
        return summarizeBootTrace(analyzed, events.length, rawTracePath);
      } finally {
        await detachReported();
      }
    },
  };
}
