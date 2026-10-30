import type { BrowserAccelerationEvidence } from "@orb/tooling/floor/browser/browser-acceleration";
import { readBrowserAcceleration } from "@orb/tooling/floor/browser/browser-acceleration";
import { timingCapability } from "@orb/tooling/floor/host/timing-capability";
import type { RequestRing } from "@orb/tooling/snap";
import type { BrowserContext, ConsoleMessage, Page, Request, Response, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import { SURFACE_HTTP_ANNOTATION } from "../iso/surface-pass.ts";
import { attachNativeFile } from "../node/native-attachments.ts";
import type { surfaceArtifactModes } from "../node/surface-run.ts";
import { webVitalsSource } from "../node/web-vitals-source.ts";
import type { WebVitalsEmission } from "./web-vitals.ts";
import { drainWebVitals, webVitalsInitScript } from "./web-vitals.ts";

const HTTP_ERROR_STATUS = 400;

interface HttpFailure {
  readonly status: number;
  readonly method: string;
  readonly address: string;
  expected: boolean;
}

const observedHttpFailures = new WeakMap<Response, HttpFailure>();

/** Account for one observed refusal only after its caller proves the expected response and rendered state. */
export function markExpectedSurfaceHttpFailure(response: Response): void {
  const failure = observedHttpFailures.get(response);
  if (failure === undefined) {
    throw new Error("Only an observed failed HTTP response can be expected");
  }
  failure.expected = true;
}

type Acceleration =
  | { readonly status: "measured"; readonly evidence: BrowserAccelerationEvidence }
  | { readonly status: "unavailable"; readonly reason: string };

function requestAddress(url: string): string {
  const address = new URL(url);
  return address.protocol === "http:" || address.protocol === "https:" ? `${address.origin}${address.pathname}` : address.protocol;
}

function httpSummary(name: string, failures: readonly HttpFailure[], transportFailures: number): string {
  const unexpected = failures.filter((failure) => !failure.expected).length;
  const statuses = new Map<number, number>();
  for (const failure of failures) {
    statuses.set(failure.status, (statuses.get(failure.status) ?? 0) + 1);
  }
  return `${name}: unexpected=${String(unexpected)} expected=${String(failures.length - unexpected)}; HTTP status counts=${[...statuses].map(([status, count]) => `${String(status)}:${String(count)}`).join(",") || "none"}; transport failures=${String(transportFailures)} (separate); details=${name}-console-network`;
}

async function accelerationOf(context: BrowserContext): Promise<Acceleration> {
  const browser = context.browser();
  if (browser === null || browser.browserType().name() !== "chromium") {
    return { status: "unavailable", reason: "The actual browser has no supported SystemInfo acceleration reader" };
  }
  try {
    return { status: "measured", evidence: await readBrowserAcceleration(browser) };
  } catch (error) {
    return { status: "unavailable", reason: String(error) };
  }
}

async function attachRequestEvidence(info: TestInfo, name: string, ring: RequestRing | null): Promise<void> {
  if (ring === null) {
    info.annotations.push({
      type: "request-ring",
      description: "Not requested in the measurement/manual-context pass; native minimal failure events remain separate",
    });
    return;
  }
  const receipt = await ring.read(0, null);
  await attachNativeFile(info, info, `${name}-request-ring`, {
    body: JSON.stringify(
      {
        ...receipt,
        entries: receipt.entries.map((entry) => ({ ...entry, url: requestAddress(entry.url) })),
        urlPolicy: "origin/path only; no query, credentials, headers or bodies retained",
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  info.annotations.push({
    type: "request-ring",
    description: `seen=${String(receipt.ring.seen)}; retained=${String(receipt.ring.retained)}; evicted=${String(receipt.ring.evicted)}; retained HTTP failures=${String(receipt.entries.filter((entry) => entry.status !== null && entry.status >= HTTP_ERROR_STATUS).length)}; failed/size-unavailable=${String(receipt.entries.filter((entry) => entry.failed !== null).length)}; incomplete request timing/sizes stay null, no latency threshold applied`,
  });
}

/** Observe the native context before navigation; raw diagnostics stay inside the private native report owner. */
export async function observeSurfaceSession(
  context: BrowserContext,
  info: TestInfo,
  name: string,
  artifacts?: ReturnType<typeof surfaceArtifactModes>,
): Promise<AsyncDisposable> {
  const ring = artifacts?.pass === "evidence" ? new (await import("@orb/tooling/snap")).RequestRing({ bodyCapBytes: 0, bodyBudgetBytes: 0 }) : null;
  ring?.attachContext(context);
  const emissions: WebVitalsEmission[] = [];
  const pageErrors: { readonly name: string; readonly message: string; readonly stack: string | undefined }[] = [];
  const consoleMessages: { readonly type: string; readonly text: string; readonly location: ReturnType<ConsoleMessage["location"]> }[] = [];
  const failedRequests: { readonly method: string; readonly address: string; readonly failure: string | undefined }[] = [];
  const httpFailures: HttpFailure[] = [];
  const pages = new Set<Page>();
  const pageError = (error: Error): void => {
    pageErrors.push({ name: error.name, message: error.message, stack: error.stack });
  };
  const consoleMessage = (message: ConsoleMessage): void => {
    consoleMessages.push({ type: message.type(), text: message.text(), location: message.location() });
  };
  const requestFailed = (request: Request): void => {
    failedRequests.push({ method: request.method(), address: requestAddress(request.url()), failure: request.failure()?.errorText });
  };
  const response = (answer: Response): void => {
    if (answer.status() >= HTTP_ERROR_STATUS) {
      const failure: HttpFailure = { status: answer.status(), method: answer.request().method(), address: requestAddress(answer.url()), expected: false };
      httpFailures.push(failure);
      observedHttpFailures.set(answer, failure);
    }
  };
  const watch = (page: Page): void => {
    if (pages.has(page)) {
      return;
    }
    pages.add(page);
    page.on("pageerror", pageError);
    page.on("console", consoleMessage);
  };
  context.on("requestfailed", requestFailed);
  context.on("response", response);
  context.on("page", watch);
  for (const page of context.pages()) {
    watch(page);
  }
  await context.exposeBinding("__surfaceVitalsReport", ({ frame }, emission: WebVitalsEmission) => {
    if (frame === frame.page().mainFrame()) {
      emissions.push(emission);
    }
  });
  await context.addInitScript({ content: webVitalsInitScript(await webVitalsSource()) });
  const acceleration = await accelerationOf(context);
  return {
    [Symbol.asyncDispose]: async (): Promise<void> => {
      await attachRequestEvidence(info, name, ring);
      const drainFailures: string[] = [];
      for (const page of pages) {
        if (!page.isClosed()) {
          try {
            await drainWebVitals(page);
          } catch (error) {
            drainFailures.push(String(error));
          }
        }
        page.off("pageerror", pageError);
        page.off("console", consoleMessage);
      }
      context.off("page", watch);
      context.off("requestfailed", requestFailed);
      context.off("response", response);
      await attachNativeFile(info, info, `${name}-document-lifecycle`, {
        body: JSON.stringify(
          {
            browser: context.browser()?.browserType().name() ?? "unavailable",
            browserVersion: context.browser()?.version() ?? "unavailable",
            acceleration,
            artifacts: artifacts ?? { status: "unavailable", reason: "The manually owned context did not supply resolved native recording options" },
            timingCapability: timingCapability(),
            budgetVerdicts: "not-requested",
            finalization: "incomplete",
            finalizationReason: "The last document is still visible before native teardown; only already emitted binding calls are drained",
            coverage: "top-document",
            iframeMetrics: "unmeasured",
            drainFailures,
            emissions,
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
      await attachNativeFile(info, info, `${name}-console-network`, {
        body: JSON.stringify(
          {
            pageErrors,
            consoleMessages,
            failedRequests,
            httpFailures,
            ...(ring === null
              ? {}
              : { networkEvidence: `${name}-request-ring; HTTP and transport failures remain complete above, independent of ring eviction` }),
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
      const unexpected = httpFailures.filter((failure) => !failure.expected);
      info.annotations.push({
        type: SURFACE_HTTP_ANNOTATION,
        description: httpSummary(name, httpFailures, failedRequests.length),
      });
      expect.soft(unexpected, `${SURFACE_HTTP_ANNOTATION}: unexpected HTTP responses; inspect ${name}-console-network`).toEqual([]);
      expect.soft(pageErrors.length, "Uncaught page errors; inspect the private console-network attachment").toBe(0);
      expect.soft(drainFailures.length, "Metric binding delivery was incomplete; inspect the private lifecycle attachment").toBe(0);
    },
  };
}
