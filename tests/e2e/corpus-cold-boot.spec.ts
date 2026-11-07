// A cold first navigation of the served app, on the committed corpus: the document, its scripts, stylesheets and fonts
// all load with no failed or refused request. The control aborts one stylesheet and the same watcher must name it.
import type { Page, Request } from "@playwright/test";
import { APP_READY_ATTR } from "#client/lib/app-ready-attribute.ts";
import { waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";

const STYLESHEET_SUFFIX = ".css";
const UNTOUCHED_URL = "about:blank";
const HTTP_ERROR_FLOOR = 400;

interface RequestFault {
  readonly url: string;
  readonly fault: string;
}

/** Every request of the first navigation that fails at the network or answers an error status, by url. */
function watchFaults(page: Page): readonly RequestFault[] {
  const faults: RequestFault[] = [];
  page.on("requestfailed", (request: Request) => {
    faults.push({ url: request.url(), fault: request.failure()?.errorText ?? "failed" });
  });
  page.on("response", (response) => {
    if (response.status() >= HTTP_ERROR_FLOOR) {
      faults.push({ url: response.url(), fault: `status ${String(response.status())}` });
    }
  });
  return faults;
}

test("the first navigation of a cold document finishes with no failed or refused request", { tag: "@smoke" }, async ({ coldPage: page }) => {
  expect(page.url()).toBe(UNTOUCHED_URL);
  const faults = watchFaults(page);
  await page.goto("/");
  await waitForAppReady(page);
  await expect(page.locator(`html[${APP_READY_ATTR}]`)).toHaveCount(1);
  expect(faults).toEqual([]);
});

test("the same watch names a stylesheet that is aborted", { tag: "@smoke" }, async ({ coldPage: page }) => {
  expect(page.url()).toBe(UNTOUCHED_URL);
  const faults = watchFaults(page);
  let aborted: string | undefined;
  await page.route(
    (url) => url.pathname.endsWith(STYLESHEET_SUFFIX),
    async (route) => {
      if (aborted === undefined) {
        aborted = route.request().url();
        await route.abort("aborted");
        return;
      }
      await route.continue();
    },
  );
  await page.goto("/");
  await expect.poll(() => aborted).toBeDefined();
  expect(faults.map((fault) => fault.url)).toContain(aborted);
});
