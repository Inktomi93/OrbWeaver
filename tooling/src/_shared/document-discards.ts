// Marks a failed request `discarded` when a later committed main-frame document (or the page's close)
// replaced the document that issued it. A navigation that never commits — a download, a 204 — discards nothing.
import type { Page, Request } from "@playwright/test";
import type { CapturedRequest } from "./browser-contract.ts";

/** One committed replacement: the event order at which its navigation started and at which it committed. */
interface Replacement {
  readonly started: number;
  readonly committed: number;
}

interface TrackedRequest {
  readonly captured: CapturedRequest;
  readonly issued: number;
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

  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      order += 1;
      navigationStarted = order;
      navigationAnswered = null;
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      order += 1;
      navigationAnswered = order;
    }
  });
  // DOMContentLoaded fires once per committed document and never for pushState, a download or a 204.
  page.on("domcontentloaded", () => {
    order += 1;
    replaced(navigationStarted ?? order, navigationAnswered ?? order);
    navigationStarted = null;
    navigationAnswered = null;
  });
  page.on("close", () => {
    order += 1;
    replaced(order, order);
  });

  return {
    issued: (request, captured): void => {
      order += 1;
      tracked.set(request, { captured, issued: order, failed: null });
    },
    failed: (request): CapturedRequest | null => {
      const entry = tracked.get(request);
      if (entry === undefined) {
        return null;
      }
      order += 1;
      entry.failed = order;
      failures.add(entry);
      judge(entry);
      return entry.captured;
    },
    record: (request): CapturedRequest | null => tracked.get(request)?.captured ?? null,
  };
}
