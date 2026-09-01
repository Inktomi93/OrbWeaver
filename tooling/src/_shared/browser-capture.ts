// Per-page console, error, and request capture. Kept separate from browser.ts so the shared launcher owns
// resources and contexts while this module owns only the event wiring duplicated across every page.

import type { ConsoleMessage, Page } from "@playwright/test";
import type { CapturedConsole, CapturedRequest } from "./browser.ts";
import type { ProbeMedia } from "./browser-media.ts";
import { applyProbeMedia } from "./browser-media.ts";

export interface PageCapture {
  readonly media: ProbeMedia;
  readonly consoleLines: string[];
  readonly consoleMessages: CapturedConsole[];
  readonly pageErrors: string[];
  readonly requests: Map<string, CapturedRequest>;
}

/** Wire capture and media onto one page. Tabs and isolated contexts share this exact event contract. */
export function wireProbePage(page: Page, capture: PageCapture): Promise<void> {
  const { media, consoleLines, consoleMessages, pageErrors, requests } = capture;
  page.on("console", (message: ConsoleMessage) => {
    const type = message.type();
    const location = message.location();
    const where = (type === "error" || type === "warning") && location.url ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})` : "";
    const line = `[${type}] ${message.text()}${where}`;
    consoleLines.push(line);
    consoleMessages.push({
      type,
      text: message.text(),
      location: location.url ? { url: location.url, line: location.lineNumber, column: location.columnNumber } : null,
      line,
    });
  });
  page.on("pageerror", (error: Error) => {
    pageErrors.push(`${error.name}: ${error.message}\n${error.stack ?? ""}`);
  });
  page.on("request", (request) => {
    requests.set(request.url(), {
      method: request.method(),
      url: request.url(),
      status: null,
      failed: null,
      type: request.resourceType(),
    });
  });
  page.on("response", (response) => {
    const captured = requests.get(response.url());
    if (captured !== undefined) {
      captured.status = response.status();
    }
  });
  page.on("requestfailed", (request) => {
    const captured = requests.get(request.url());
    if (captured !== undefined) {
      captured.failed = request.failure()?.errorText ?? "failed";
    }
  });
  return applyProbeMedia(page, media);
}
