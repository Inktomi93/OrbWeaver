import { chromium } from "@playwright/test";
import { awaitDevClientReady } from "../../../../tooling/src/dev/ops/client-ready.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const PROBE_TIMEOUT = scaledBudget(20_000);

test("cold module loading completes before a degraded document is replaced", { timeout: PROBE_TIMEOUT }, async () => {
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
    await expect(awaitDevClientReady(page, "http://contributor.test/", Date.now() + 500)).rejects.toThrow();
  } finally {
    await browser.close();
  }
});

test("a degraded document waits for dynamic modules but not a live subscription before retrying", { timeout: PROBE_TIMEOUT }, async () => {
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
        body:
          documents === 1
            ? '<html data-app-ready="degraded"><script>fetch("/events"); import("/route.js");</script></html>'
            : '<html data-app-ready=""></html>',
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
      await route.fulfill({ contentType: "text/javascript", body: "export const loaded = true;" });
    });
    await awaitDevClientReady(page, "http://contributor.test/", Date.now() + scaledBudget(5000));
    expect(documents).toBe(2);
    expect(moduleFinished).toBe(true);
    expect(abortedModules).toEqual([]);
  } finally {
    await browser.close();
  }
});
