// Marks a failed request `discarded` when a later committed main-frame document (or the page's close)
// replaced the document that issued it. A navigation that never commits — a download, a 204 — discards nothing.
// Chromium reports nothing for a request a navigation kills (no `requestfailed`, no CDP `Network.loadingFailed`,
// and `response.body()` rejects only at close), so a request still unsettled when its document is replaced
// is recorded here as the abort it is.
import type { Page, Request } from "@playwright/test";
import type { CapturedRequest } from "./browser-contract.ts";

/** Chromium's failure text for a request cancelled before it finished. */
export const REQUEST_ABORTED = "net::ERR_ABORTED";

/** Answers that leave the current document in place: 204 No Content and 205 Reset Content. */
const HTTP_NO_CONTENT = 204;
const HTTP_RESET_CONTENT = 205;
const NO_CONTENT_STATUSES: ReadonlySet<number> = new Set([HTTP_NO_CONTENT, HTTP_RESET_CONTENT]);

/** One committed replacement: the event order at which its navigation started and at which it committed. */
interface Replacement {
  readonly started: number;
  readonly committed: number;
}

interface TrackedRequest {
  readonly captured: CapturedRequest;
  readonly issued: number;
  /** A main-frame or sub-frame document request: the document that replaces the old one, never a request it issued. */
  readonly navigation: boolean;
  failed: number | null;
}

/** The request side of the tracker: `wireProbePage` registers each request and reports each failure. */
export interface DocumentDiscards {
  readonly issued: (request: Request, captured: CapturedRequest) => void;
  readonly failed: (request: Request) => CapturedRequest | null;
  readonly record: (request: Request) => CapturedRequest | null;
}

export function trackDocumentDiscards(page: Page): DocumentDiscards {
  const tracked = new WeakMap<Request, TrackedRequest>();
  const failures = new Set<TrackedRequest>();
  // Issued and neither finished nor failed: the requests a navigation can silently kill.
  const unsettled = new Set<TrackedRequest>();
  const replacements: Replacement[] = [];
  let order = 0;
  let navigationStarted: number | null = null;
  // The order at which the main-frame navigation's response arrived. The old document is replaced right
  // after it, before the new document issues anything, so it marks the boundary; DOMContentLoaded only
  // confirms that the response became a document.
  let navigationAnswered: number | null = null;

  // Judged against every replacement so far, so the verdict does not depend on whether the abort or the
  // commit event arrived first. A request issued before the commit that failed after its navigation began
  // belonged to the replaced document.
  const judge = (entry: TrackedRequest): void => {
    const failedAt = entry.failed;
    if (failedAt !== null && replacements.some((replacement) => entry.issued < replacement.committed && failedAt >= replacement.started)) {
      entry.captured.discarded = true;
    }
  };
  const replaced = (started: number, committed: number): void => {
    replacements.push({ started, committed });
    for (const entry of failures) {
      judge(entry);
    }
  };

  // A request the replaced document issued that never finished or failed was killed by the navigation, and
  // the browser says nothing about it. The close needs no such pass: a request still open at the end of the
  // run is not a failure, and a real abort at close arrives as `requestfailed`.
  const abandonUnsettled = (committed: number): void => {
    for (const entry of unsettled) {
      if (!entry.navigation && entry.issued < committed) {
        order += 1;
        entry.failed = order;
        entry.captured.failed ??= REQUEST_ABORTED;
        failures.add(entry);
        judge(entry);
        unsettled.delete(entry);
      }
    }
  };

  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      order += 1;
      navigationStarted = order;
      navigationAnswered = null;
    }
  });
  // A main-frame navigation that failed (a download, a 204) replaced nothing; a later commit without a
  // request of its own (about:blank, setContent) must not inherit its start.
  page.on("requestfailed", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      navigationStarted = null;
      navigationAnswered = null;
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      // A no-content answer finishes without a `requestfailed`, so nothing else would drop its start.
      if (NO_CONTENT_STATUSES.has(response.status())) {
        navigationStarted = null;
        navigationAnswered = null;
        return;
      }
      order += 1;
      navigationAnswered = order;
    }
  });
  // DOMContentLoaded fires once per committed document and never for pushState, a download or a 204.
  page.on("domcontentloaded", () => {
    order += 1;
    const committed = navigationAnswered ?? order;
    replaced(navigationStarted ?? order, committed);
    abandonUnsettled(committed);
    navigationStarted = null;
    navigationAnswered = null;
  });
  page.on("requestfinished", (request) => {
    const entry = tracked.get(request);
    if (entry !== undefined) {
      unsettled.delete(entry);
    }
  });
  page.on("close", () => {
    order += 1;
    replaced(order, order);
  });

  return {
    issued: (request, captured): void => {
      order += 1;
      const entry: TrackedRequest = { captured, issued: order, navigation: request.isNavigationRequest(), failed: null };
      tracked.set(request, entry);
      unsettled.add(entry);
    },
    failed: (request): CapturedRequest | null => {
      const entry = tracked.get(request);
      if (entry === undefined) {
        return null;
      }
      order += 1;
      entry.failed = order;
      unsettled.delete(entry);
      failures.add(entry);
      judge(entry);
      return entry.captured;
    },
    record: (request): CapturedRequest | null => tracked.get(request)?.captured ?? null,
  };
}
