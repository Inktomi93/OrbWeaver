// Per-page console, error, and request capture. Kept separate from browser.ts so the shared launcher owns
// resources and contexts while this module owns only the event wiring duplicated across every page.

import type { BrowserContext, ConsoleMessage, Page } from "@playwright/test";
import { exactScope } from "./artifact-scope.ts";
import type {
  CapturedConsole as BrowserCapturedConsole,
  CapturedRequest as BrowserCapturedRequest,
  BrowserDiagnostic,
  BrowserEvidenceChannels,
  BrowserEvidenceLimits,
  BrowserPageError,
  DiagnosticWindow,
  OrbConsoleCompleteness,
  ProbeSession,
} from "./browser-contract.ts";
import { instrumentPageError, runtimePageError } from "./browser-contract.ts";
import { recordPageConsole, recordPageError, wirePageDiagnostics } from "./browser-diagnostics.ts";
import type { BrowserEvidenceRetentionBatch } from "./browser-evidence-ring.ts";
import { BoundedEvidenceRing, BoundedLatestMap, BROWSER_EVIDENCE_SOURCES, retentionBatch } from "./browser-evidence-ring.ts";
import type { ProbeMedia } from "./browser-media.ts";
import { applyProbeMedia } from "./browser-media.ts";
import type { BrowserNetworkLimits } from "./browser-network.ts";
import { networkRetentionForPages } from "./browser-network.ts";
import type { RedactedRequestUrl } from "./browser-request-url.ts";
import { redactedRequestUrl } from "./browser-request-url.ts";

export type CapturedConsole = BrowserCapturedConsole;
export type CapturedRequest = BrowserCapturedRequest;

export const BROWSER_CONSOLE_CAP = 8192;
export const BROWSER_PAGE_ERROR_CAP = 2048;
export const BROWSER_DIAGNOSTIC_CAP = 16_384;
export const BROWSER_DIAGNOSTIC_COMPLETENESS_CAP = 4096;
export const BROWSER_REQUEST_SUMMARY_CAP = 8192;

export interface PageCapture {
  readonly media: ProbeMedia;
  readonly consoleMessages: readonly CapturedConsole[];
  readonly pageErrors: readonly BrowserPageError[];
  readonly requests: ReadonlyMap<string, CapturedRequest>;
  readonly diagnostics: readonly BrowserDiagnostic[];
  readonly diagnosticCompleteness: readonly OrbConsoleCompleteness[];
  readonly diagnosticWindow: DiagnosticWindow;
  readonly contextIndex: number;
  readonly evidence: BrowserEvidenceChannels;
  readonly networkLimits: BrowserNetworkLimits;
}

export function createBrowserEvidenceChannels(contextIndex: number, limits: BrowserEvidenceLimits = {}): BrowserEvidenceChannels {
  const console = new BoundedEvidenceRing<CapturedConsole>(limits.console ?? BROWSER_CONSOLE_CAP);
  const pageErrors = new BoundedEvidenceRing<BrowserPageError>(limits.pageErrors ?? BROWSER_PAGE_ERROR_CAP);
  const diagnostics = new BoundedEvidenceRing<BrowserDiagnostic>(limits.diagnostics ?? BROWSER_DIAGNOSTIC_CAP);
  const diagnosticCompleteness = new BoundedEvidenceRing<OrbConsoleCompleteness>(limits.diagnosticCompleteness ?? BROWSER_DIAGNOSTIC_COMPLETENESS_CAP);
  const requestSummary = new BoundedLatestMap<RedactedRequestUrl, CapturedRequest>(limits.requestSummary ?? BROWSER_REQUEST_SUMMARY_CAP);
  return {
    contextIndex,
    console,
    pageErrors,
    diagnostics,
    diagnosticCompleteness,
    requestSummary,
    retention: (): BrowserEvidenceRetentionBatch =>
      retentionBatch([
        ...console.receipts(BROWSER_EVIDENCE_SOURCES.console),
        ...pageErrors.receipts(BROWSER_EVIDENCE_SOURCES.pageErrors),
        ...diagnostics.receipts(BROWSER_EVIDENCE_SOURCES.diagnostics),
        ...diagnosticCompleteness.receipts(BROWSER_EVIDENCE_SOURCES.diagnosticCompleteness),
        ...requestSummary.receipts(BROWSER_EVIDENCE_SOURCES.requestSummary),
      ]),
  };
}

export function createPageCapture(media: ProbeMedia, contextIndex: number, limits: BrowserEvidenceLimits = {}): PageCapture {
  const evidence = createBrowserEvidenceChannels(contextIndex, limits);
  return {
    media,
    consoleMessages: evidence.console.values(),
    pageErrors: evidence.pageErrors.values(),
    requests: evidence.requestSummary.view(),
    diagnostics: evidence.diagnostics.values(),
    diagnosticCompleteness: evidence.diagnosticCompleteness.values(),
    diagnosticWindow: { value: 0 },
    contextIndex,
    evidence,
    networkLimits: {
      ...(limits.networkCompleted === undefined ? {} : { completed: limits.networkCompleted }),
      ...(limits.networkPendingExtra === undefined ? {} : { pendingExtra: limits.networkPendingExtra }),
      ...(limits.networkBodyReadTimeoutMs === undefined ? {} : { bodyReadTimeoutMs: limits.networkBodyReadTimeoutMs }),
    },
  };
}

export function browserEvidenceRetention(session: ProbeSession): BrowserEvidenceRetentionBatch {
  const rows = session.contexts.flatMap((context) => [...context.evidence.retention().rows, ...networkRetentionForPages(context.pages)]);
  return retentionBatch(rows);
}

/** Wire capture (and, by default, media) onto one page. Tabs and isolated contexts share this exact event
 *  contract. `"observe"` wires the events only — an ATTACHED session (a sibling on a daemon's browser)
 *  declares the owner's media for its environment contract and must never re-emulate it on the owner's
 *  page: a re-applied override from an attacher is the P3 leak the substrate exists to end. */
export async function wireProbePage(page: Page, capture: PageCapture, pageIndex: number, mediaMode: "apply" | "observe" = "apply"): Promise<void> {
  const { media, evidence, diagnosticWindow, contextIndex } = capture;
  const identity = { contextIndex, pageIndex, window: diagnosticWindow };
  page.on("console", (message: ConsoleMessage) => {
    const type = message.type();
    const location = message.location();
    const where = (type === "error" || type === "warning") && location.url ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})` : "";
    const line = `[${type}] ${message.text()}${where}`;
    const scope = exactScope(contextIndex, pageIndex, diagnosticWindow.value);
    evidence.console.push(
      {
        type,
        text: message.text(),
        location: location.url ? { url: location.url, line: location.lineNumber, column: location.columnNumber } : null,
        line,
      },
      scope,
    );
    recordPageConsole(evidence.diagnostics, identity, message);
  });
  page.on("pageerror", (error: Error) => {
    const scope = exactScope(contextIndex, pageIndex, diagnosticWindow.value);
    evidence.pageErrors.push(runtimePageError(error), scope);
    recordPageError(evidence.diagnostics, identity, error);
  });
  page.on("request", (request) => {
    const url = redactedRequestUrl(request.url());
    evidence.requestSummary.set(
      url,
      {
        method: request.method(),
        url,
        status: null,
        failed: null,
        type: request.resourceType(),
      },
      exactScope(contextIndex, pageIndex, diagnosticWindow.value),
    );
  });
  page.on("response", (response) => {
    const captured = evidence.requestSummary.get(redactedRequestUrl(response.url()));
    if (captured !== undefined) {
      captured.status = response.status();
    }
  });
  page.on("requestfailed", (request) => {
    const captured = evidence.requestSummary.get(redactedRequestUrl(request.url()));
    if (captured !== undefined) {
      captured.failed = request.failure()?.errorText ?? "failed";
    }
  });
  const cdp = await page.context().newCDPSession(page);
  await wirePageDiagnostics(page, evidence.diagnostics, identity, {
    cdp,
    network: capture.networkLimits,
  });
  if (mediaMode === "apply") {
    await applyProbeMedia(page, media, cdp);
  }
}

/** Wire existing pages and every later popup/tab through the same capture rings. The browser `page`
 * event has no awaiter, so an asynchronous setup failure enters pageErrors and therefore fails the run. */
export function watchProbeContextPages(
  context: BrowserContext,
  capture: PageCapture,
  pages: Page[],
  mediaMode: "apply" | "observe" = "apply",
): (page: Page) => Promise<void> {
  const wiring = new WeakMap<Page, Promise<void>>();
  const wire = (page: Page): Promise<void> => {
    const existing = wiring.get(page);
    if (existing !== undefined) {
      return existing;
    }
    let pageIndex = pages.indexOf(page);
    if (pageIndex < 0) {
      pageIndex = pages.length;
      pages.push(page);
    }
    const pending = wireProbePage(page, capture, pageIndex, mediaMode);
    wiring.set(page, pending);
    return pending;
  };
  context.on("page", (page) => {
    // @orb-waive caught-failure-ownership(wire): the event has no awaiter; setup rejection is retained in pageErrors, which makes Snap's verdict red. Ends if pageErrors stops contributing to the verdict.
    wire(page).catch((error: unknown) => {
      capture.evidence.pageErrors.push(
        instrumentPageError(`browser diagnostic setup failed: ${error instanceof Error ? error.message : String(error)}`),
        exactScope(capture.contextIndex, Math.max(0, pages.indexOf(page)), capture.diagnosticWindow.value),
      );
    });
  });
  return wire;
}
