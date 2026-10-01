import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { z } from "zod";
import { awaitDevClientReady } from "../../../../tooling/src/dev/ops/client-ready.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const PROBE_TIMEOUT = scaledBudget(20_000);

test("cold module loading completes on the original document", { timeout: PROBE_TIMEOUT }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let documents = 0;
    let completedModules = 0;
    await page.route("http://contributor.test/", async (route) => {
      documents++;
      await route.fulfill({ contentType: "text/html", body: `<html data-app-ready="degraded"><script type="module" src="/cold.js"></script></html>` });
    });
    await page.route("http://contributor.test/cold.js", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      completedModules++;
      await route.fulfill({ contentType: "text/javascript", body: `document.documentElement.setAttribute("data-app-ready", "");` });
    });
    // @orb-waive test-determinism(Date.now): the subject is real browser module loading under a wall-clock deadline. Ends if browser loading and the waiter share an injected clock.
    await awaitDevClientReady(page, "http://contributor.test/", Date.now() + scaledBudget(5000));
    expect(documents).toBe(1);
    expect(completedModules).toBe(1);
    expect(await page.locator("html").getAttribute("data-app-ready")).toBe("");
  } finally {
    await browser.close();
  }
});

test("a permanently degraded app still refuses at the supplied startup deadline", { timeout: PROBE_TIMEOUT }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("http://contributor.test/", (route) => route.fulfill({ contentType: "text/html", body: '<html data-app-ready="degraded"></html>' }));
    // @orb-waive test-determinism(Date.now): this proof requires the real deadline to expire against a live browser. Ends if the browser and deadline use an injected clock.
    await expect(awaitDevClientReady(page, "http://contributor.test/", Date.now() + 500)).rejects.toThrow();
  } finally {
    await browser.close();
  }
});

test("a degraded document settles after dynamic modules without waiting for a live subscription", { timeout: PROBE_TIMEOUT }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let documents = 0;
    let moduleFinished = false;
    const abortedModules: string[] = [];
    page.on("requestfailed", (request) => {
      if (request.resourceType() === "script") {
        abortedModules.push(request.url());
      }
    });
    await page.route("http://contributor.test/", (route) => {
      documents++;
      return route.fulfill({
        contentType: "text/html",
        body: '<html data-app-ready="degraded"><script>fetch("/events"); import("/route.js");</script></html>',
      });
    });
    await page.route("http://contributor.test/events", () => undefined);
    await page.route("http://contributor.test/route.js", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({ contentType: "text/javascript", body: 'import "./nested.js";' });
    });
    await page.route("http://contributor.test/nested.js", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      moduleFinished = true;
      await route.fulfill({ contentType: "text/javascript", body: 'document.documentElement.setAttribute("data-app-ready", ""); export const loaded = true;' });
    });
    // @orb-waive test-determinism(Date.now): the subject is real browser module loading under a wall-clock deadline. Ends if browser loading and the waiter share an injected clock.
    await awaitDevClientReady(page, "http://contributor.test/", Date.now() + scaledBudget(5000));
    expect(documents).toBe(1);
    expect(moduleFinished).toBe(true);
    expect(abortedModules).toEqual([]);
  } finally {
    await browser.close();
  }
});

test("failed startup retains HAR request timing without response bodies", { timeout: PROBE_TIMEOUT }, async ({ scratch }) => {
  const browser = await chromium.launch({ headless: true });
  const har = join(scratch, "startup.har");
  try {
    const context = await browser.newContext({ recordHar: { path: har, mode: "full", content: "omit" } });
    try {
      const page = await context.newPage();
      await page.route("http://contributor.test/", (route) =>
        route.fulfill({ contentType: "text/html", body: '<html><script src="/diagnostic.js"></script></html>' }),
      );
      await page.route("http://contributor.test/diagnostic.js", (route) =>
        route.fulfill({ contentType: "text/javascript", body: 'globalThis.privateBodyMarker = "must-not-be-retained";' }),
      );
      // @orb-waive test-determinism(Date.now): the real browser must exhaust the startup deadline before HAR closure. Ends if the browser and deadline share an injected clock.
      await expect(awaitDevClientReady(page, "http://contributor.test/", Date.now() + 500)).rejects.toThrow();
    } finally {
      await context.close();
    }
    const source = readFileSync(har, "utf8");
    const report = z
      .object({ log: z.object({ entries: z.array(z.object({ request: z.object({ url: z.string() }), timings: z.object({ receive: z.number() }) })) }) })
      .parse(JSON.parse(source));
    expect(report.log.entries.some((entry) => entry.request.url.endsWith("/diagnostic.js") && entry.timings.receive >= 0)).toBe(true);
    expect(source).not.toContain("must-not-be-retained");
  } finally {
    await browser.close();
  }
});

test("late readiness recovery is awaited without restarting the document", { timeout: PROBE_TIMEOUT }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let documents = 0;
    await page.route("http://contributor.test/", (route) => {
      documents++;
      return route.fulfill({
        contentType: "text/html",
        body: '<html data-app-ready="degraded"><script>setTimeout(() => document.documentElement.setAttribute("data-app-ready", ""), 800);</script></html>',
      });
    });
    // @orb-waive test-determinism(Date.now): the real browser must settle a late marker within the caller's deadline. Ends if the browser and deadline share an injected clock.
    await awaitDevClientReady(page, "http://contributor.test/", Date.now() + scaledBudget(5000));
    expect(documents).toBe(1);
    expect(await page.locator("html").getAttribute("data-app-ready")).toBe("");
  } finally {
    await browser.close();
  }
});
