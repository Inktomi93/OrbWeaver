// Exact-page CDP screencast controller with bounded retention and lossless cleanup errors.
import { performance } from "node:perf_hooks";
import type { CDPSession, Page } from "@playwright/test";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { budget } from "../../_shared/load-budget.ts";
import type { FilmstripCaptureReceipt, FilmstripLimits } from "../contract/filmstrip.ts";
import { FILMSTRIP_LIMITS } from "../contract/filmstrip.ts";
import type { SnapAction } from "../contract/types.ts";
import { FilmstripBuffer } from "../lib/filmstrip-buffer.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --filmstrip");

interface ScreencastFrameEvent {
  readonly data: string;
  readonly sessionId: number;
}

interface FilmstripScreencastOptions {
  readonly format: "jpeg";
  readonly quality: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly everyNthFrame: number;
}

export interface FilmstripCdp {
  readonly startScreencast: (options: FilmstripScreencastOptions) => Promise<void>;
  readonly stopScreencast: () => Promise<void>;
  readonly acknowledgeFrame: (sessionId: number) => Promise<void>;
  readonly onFrame: (listener: (event: object) => void) => void;
  readonly offFrame: (listener: (event: object) => void) => void;
  readonly detach: () => Promise<void>;
}

export interface FilmstripCaptureController {
  readonly mark: (index: number, action: SnapAction) => void;
  readonly stop: () => Promise<FilmstripCaptureReceipt>;
}

export interface FilmstripCaptureDeps {
  readonly now?: () => number;
  readonly createCdp?: (page: Page | null) => Promise<FilmstripCdp>;
}

type OperationOutcome = { readonly status: "ok" } | { readonly status: "failed"; readonly error: Error };

const INITIAL_FRAME_TIMEOUT_BASE_MS = 1000;
const INITIAL_FRAME_TIMEOUT_MS = budget(INITIAL_FRAME_TIMEOUT_BASE_MS);

function filmstripActionLabel(action: SnapAction): string {
  if (action.type === "eval") {
    return `eval ${action.action.expr}`;
  }
  if (action.type === "nav") {
    return `${action.action.kind} ${action.action.target}`;
  }
  const step = action.action;
  if (step.kind === "pause") {
    return `pause ${String(step.ms)}ms`;
  }
  if (step.kind === "keyboard") {
    return `keyboard ${step.key}`;
  }
  if (step.kind === "fill") {
    return `fill ${step.selector}`;
  }
  if (step.kind === "key") {
    return `key ${step.selector}=${step.key}`;
  }
  if (step.kind === "upload" || step.kind === "drop-files") {
    return `${step.kind} ${step.selector}`;
  }
  if (step.kind === "wheel" || step.kind === "wheelburst") {
    return `${step.kind} ${step.selector}`;
  }
  return `${step.kind} ${step.selector ?? "entry"}`;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function throwCleanupErrors(cleanup: readonly Error[]): void {
  if (cleanup.length > 0) {
    throw new AggregateError(cleanup, "filmstrip capture cleanup failed");
  }
}

function captureAndCleanupError(primary: unknown, cleanup: unknown): AggregateError {
  const primaryError = asError(primary);
  return new AggregateError([primaryError, asError(cleanup)], "filmstrip capture and cleanup failed", { cause: primaryError });
}

async function defaultCdp(page: Page): Promise<FilmstripCdp> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  return {
    startScreencast: async (options): Promise<void> => {
      await cdp.send("Page.startScreencast", options);
    },
    stopScreencast: async (): Promise<void> => {
      await cdp.send("Page.stopScreencast");
    },
    acknowledgeFrame: async (sessionId): Promise<void> => {
      await cdp.send("Page.screencastFrameAck", { sessionId });
    },
    onFrame: (listener): void => {
      cdp.on("Page.screencastFrame", listener);
    },
    offFrame: (listener): void => {
      cdp.off("Page.screencastFrame", listener);
    },
    detach: async (): Promise<void> => {
      await cdp.detach();
    },
  };
}

function createCaptureCdp(page: Page | null, deps: FilmstripCaptureDeps): Promise<FilmstripCdp> {
  if (deps.createCdp !== undefined) {
    return deps.createCdp(page);
  }
  if (page === null) {
    throw new Error("filmstrip capture requires a page when no CDP factory is provided");
  }
  return defaultCdp(page);
}

function retainFrame(buffer: FilmstripBuffer, event: ScreencastFrameEvent, now: () => number): OperationOutcome {
  try {
    buffer.push(Buffer.from(event.data, "base64"), now());
    return { status: "ok" };
  } catch (error) {
    return { status: "failed", error: asError(error) };
  }
}

function screencastFrameEvent(value: object): ScreencastFrameEvent | null {
  const data = Reflect.get(value, "data");
  const sessionId = Reflect.get(value, "sessionId");
  return typeof data === "string" && Number.isInteger(sessionId) ? { data, sessionId: Number(sessionId) } : null;
}

export async function startFilmstripCapture(
  page: Page | null,
  limits: FilmstripLimits = FILMSTRIP_LIMITS,
  deps: FilmstripCaptureDeps = {},
): Promise<FilmstripCaptureController> {
  const now = deps.now ?? performance.now.bind(performance);
  const cdp = await createCaptureCdp(page, deps);
  const startedAt = now();
  const buffer = new FilmstripBuffer(limits, startedAt);
  const pendingAcks = new Set<Promise<unknown>>();
  const frameErrors: Error[] = [];
  let stopPromise: Promise<unknown> | null = null;
  let stopped = false;
  let resolveFirstFrame: (() => void) | null = null;
  const firstFrame = new Promise<void>((resolve) => {
    resolveFirstFrame = resolve;
  });

  const stopProtocol = (): Promise<unknown> => {
    if (stopPromise === null) {
      stopPromise = cdp.stopScreencast();
    }
    return stopPromise;
  };

  const onFrame = (rawEvent: object): void => {
    const event = screencastFrameEvent(rawEvent);
    if (event === null) {
      frameErrors.push(new Error("FILMSTRIP REFUSED: malformed Page.screencastFrame event"));
      return;
    }
    const ack = cdp.acknowledgeFrame(event.sessionId);
    pendingAcks.add(ack);
    // Ack is independent of decode/retention: malformed or omitted payloads must not stall Chromium.
    const retained = retainFrame(buffer, event, now);
    if (retained.status === "failed") {
      frameErrors.push(retained.error);
    }
    resolveFirstFrame?.();
    resolveFirstFrame = null;
  };

  cdp.onFrame(onFrame);
  try {
    await cdp.startScreencast({
      format: "jpeg",
      quality: limits.quality,
      maxWidth: limits.maxWidth,
      maxHeight: limits.maxHeight,
      everyNthFrame: 1,
    });
  } catch (error) {
    cdp.offFrame(onFrame);
    const [detach] = await Promise.allSettled([cdp.detach()]);
    if (detach.status === "rejected") {
      throw captureAndCleanupError(error, detach.reason);
    }
    throw asError(error);
  }

  if (deps.createCdp === undefined) {
    const timeoutResult = Promise.withResolvers<false>();
    const timeout = setTimeout(() => timeoutResult.resolve(false), INITIAL_FRAME_TIMEOUT_MS);
    const initialFrame = await Promise.race([firstFrame.then(() => true), timeoutResult.promise]);
    clearTimeout(timeout);
    if (!initialFrame) {
      cdp.offFrame(onFrame);
      const cleanup = await Promise.allSettled([cdp.stopScreencast(), cdp.detach()]);
      const failures = cleanup.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected").map((outcome) => asError(outcome.reason));
      if (failures.length > 0) {
        throw new AggregateError(
          [new Error("FILMSTRIP REFUSED: no initial frame before the action tape"), ...failures],
          "filmstrip capture and cleanup failed",
        );
      }
      throw new Error("FILMSTRIP REFUSED: no initial frame before the action tape");
    }
  }

  const durationTimer = setTimeout(
    () => {
      buffer.limitDuration();
      // The original stop promise remains memoized for stop() to inspect and surface during cleanup.
      // @orb-waive caught-failure-ownership(stopProtocol): the timeout callback has no awaiter; stopProtocol memoizes the original promise and stop() awaits it, then returns the rejection as typed cleanup evidence. Ends if stop() stops awaiting that memoized promise.
      stopProtocol().catch(() => undefined);
    },
    Math.max(0, limits.durationMs - (now() - startedAt)),
  );

  return {
    mark: (index, action): void => buffer.mark(index, filmstripActionLabel(action), now()),
    stop: async (): Promise<FilmstripCaptureReceipt> => {
      if (stopped) {
        throw new Error("filmstrip capture already stopped");
      }
      stopped = true;
      clearTimeout(durationTimer);
      const [stoppedCapture] = await Promise.allSettled([stopProtocol()]);
      cdp.offFrame(onFrame);
      const acknowledgements = await Promise.allSettled([...pendingAcks]);
      for (const acknowledgement of acknowledgements) {
        if (acknowledgement.status === "fulfilled") {
          buffer.acknowledge();
        }
      }
      const cleanup = [
        ...frameErrors,
        ...acknowledgements.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected").map((outcome) => asError(outcome.reason)),
        ...(stoppedCapture.status === "rejected" ? [asError(stoppedCapture.reason)] : []),
      ];
      const [detach] = await Promise.allSettled([cdp.detach()]);
      if (detach.status === "rejected") {
        cleanup.push(asError(detach.reason));
      }
      throwCleanupErrors(cleanup);
      return buffer.receipt(now());
    },
  };
}
