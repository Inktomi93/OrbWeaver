// Chromium navigation-trace capture for perf-meter. Start/stop ownership lives here so the caller
// cannot accidentally move `Tracing.start` below `page.goto` and turn a boot trace into a post-nav span.
import { writeFile } from "node:fs/promises";
import { errorMessage } from "@orb/kit/error-message";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { budget } from "@orb/tooling/_shared/load-budget";
import { warn } from "@orb/tooling/_shared/log";
import type { CDPSession, Page } from "@playwright/test";
import { defaultConfig, traceCategories } from "lighthouse";
import { TraceEngineResult } from "lighthouse/core/computed/trace-engine-result.js";
import type { BootTraceReceipt } from "../contract/types.ts";
import { summarizeBootTrace } from "../lib/boot-trace.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --boot-trace");

interface TraceDataCollected {
  readonly value?: readonly unknown[];
}

const TRACE_COMPLETE_BASE_MS = 30_000;

function startCleanupError(primary: unknown, cleanup: unknown): AggregateError {
  return new AggregateError([primary, cleanup], "boot trace failed to start and its CDP session also failed to detach", { cause: primary });
}

async function stopTrace(cdp: CDPSession, complete: Promise<void>): Promise<void> {
  await cdp.send("Tracing.end");
  const timeoutMs = budget(TRACE_COMPLETE_BASE_MS);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      complete,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Chromium did not finish the boot trace within its ${String(timeoutMs)}ms load-scaled budget`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export interface ActiveBootTrace {
  readonly finish: (rawTracePath: string) => Promise<BootTraceReceipt>;
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
    await cdp.send("Tracing.start", {
      transferMode: "ReportEvents",
      traceConfig: { recordMode: "recordUntilFull", includedCategories: traceCategories },
    });
  } catch (error) {
    try {
      await detach();
    } catch (cleanup) {
      throw startCleanupError(error, cleanup);
    }
    throw error;
  }
  let active = true;
  const detachReported = async (): Promise<void> => {
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
    finish: async (rawTracePath): Promise<BootTraceReceipt> => {
      if (!active) {
        throw new Error("boot trace was already finished");
      }
      active = false;
      try {
        await stopTrace(cdp, complete.promise);
        await writeFile(rawTracePath, JSON.stringify({ traceEvents: events }));
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
