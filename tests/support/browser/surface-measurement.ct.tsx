import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { CHARACTER_HANDLE_CONFLICT_OP_CODE } from "@orb/contracts/character";
import { isPlainObject } from "@orb/kit/guards";
import type { WebVitalsEmission } from "@orb/testkit/browser/spec";
import {
  accessibilityScan,
  assertSurfaceReady,
  drainWebVitals,
  installWebVitals,
  markExpectedSurfaceHttpFailure,
  observeSurfaceSession,
  readSurfaceDesignAudit,
  readWebVitals,
  surfaceAction,
  touchTargetFindings,
  webVitalsInitScript,
} from "@orb/testkit/browser/spec";
import { SURFACE_HTTP_ANNOTATION, SURFACE_PASSES } from "@orb/testkit/iso";
import { webVitalsSource } from "@orb/testkit/node/helpers";
import { readBrowserAcceleration } from "@orb/tooling/floor/browser/browser-acceleration";
import type { TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { attachNativeFile } from "../node/native-attachments.ts";
import type { SerializedPerformanceEntry } from "./performance-entry.ts";
import type { SurfaceDesignStory, SurfaceTouchTilingStory } from "./surface-design-fixtures.tsx";
import type { SurfaceFrameworkStory } from "./surface-framework-fixtures.tsx";
import { hitExtent, touchFloorPx } from "./touch-floor.ts";

test.use({ reuseContext: false });

const CONTROL_PATH = "/surface-measurement-control";
const DOCUMENT =
  '<!doctype html><html lang="en"><head><title>Measurement control</title></head><body><main><h1>Measurement control</h1><button>Continue</button></main></body></html>';
const HTTP_FAILURE_PATH = "/surface-http-failure";
const HTTP_EXPECTED_PATH = "/surface-http-expected";
const HTTP_CANCEL_PATH = "/surface-http-cancel";

const httpTest = test.extend<{ readonly httpOrigin: string }>({
  httpOrigin: async ({}, provide): Promise<void> => {
    await using server = createServer((request, response) => {
      const expected = request.url?.startsWith(HTTP_EXPECTED_PATH) === true;
      const ordinaryStatus = request.url?.startsWith(HTTP_FAILURE_PATH) === true ? 429 : 200;
      response.writeHead(expected ? 400 : ordinaryStatus, {
        "content-type": expected ? "application/json" : "text/html",
      });
      response.end(expected ? JSON.stringify({ reason: CHARACTER_HANDLE_CONFLICT_OP_CODE }) : DOCUMENT);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("The HTTP control did not bind its loopback listener");
    }
    await provide(`http://127.0.0.1:${String(address.port)}`);
  },
});

async function nativeAttachmentText(info: TestInfo, name: string): Promise<string> {
  const path = info.attachments.find((attachment) => attachment.name === name)?.path;
  if (path === undefined) {
    throw new Error(`The native control did not retain ${name}`);
  }
  return await readFile(path, "utf8");
}

for (const pass of SURFACE_PASSES) {
  httpTest(`surface HTTP unexpected response fails the native ${pass} case`, async ({ page, context, httpOrigin }, info) => {
    const name = `http-${pass}`;
    {
      await using _observation = await observeSurfaceSession(context, info, name, { pass, trace: "off", screenshot: "off", video: "off" });
      await page.goto(httpOrigin);
      const status = await page.evaluate(async (path) => (await fetch(path)).status, HTTP_FAILURE_PATH);
      expect(status).toBe(429);
      await expect(page.getByRole("heading", { name: "Measurement control", exact: true })).toBeVisible();
    }
    const retained = JSON.parse(await nativeAttachmentText(info, `${name}-console-network`));
    expect(retained).toMatchObject({ httpFailures: [{ status: 429, method: "GET", address: `${httpOrigin}${HTTP_FAILURE_PATH}`, expected: false }] });
    expect(info.annotations.find((annotation) => annotation.type === SURFACE_HTTP_ANNOTATION)?.description).toContain("unexpected=1 expected=0");
    expect(info.errors).toHaveLength(1);
    expect(info.errors[0]?.message).toContain(SURFACE_HTTP_ANNOTATION);
    test.fail(true, "The verified unexpected HTTP response must fail the native case despite its visible content");
  });

  httpTest(`surface HTTP healthy responses and cancellation remain separate in ${pass}`, async ({ page, context, httpOrigin }, info) => {
    const name = `healthy-${pass}`;
    {
      await using _observation = await observeSurfaceSession(context, info, name, { pass, trace: "off", screenshot: "off", video: "off" });
      const response = await page.goto(httpOrigin);
      expect(response?.status()).toBe(200);
      if (response === null) {
        throw new Error("The native healthy navigation has no response");
      }
      expect(() => markExpectedSurfaceHttpFailure(response)).toThrow("Only an observed failed HTTP response");
      await page.route(`${httpOrigin}${HTTP_CANCEL_PATH}`, (route) => route.abort("aborted"));
      const cancelled = page.waitForEvent("requestfailed", (request) => request.url() === `${httpOrigin}${HTTP_CANCEL_PATH}`);
      await page.evaluate(async (path) => await fetch(path).catch(() => null), HTTP_CANCEL_PATH);
      await cancelled;
      await expect(page.getByRole("heading", { name: "Measurement control", exact: true })).toBeVisible();
    }
    const retained = JSON.parse(await nativeAttachmentText(info, `${name}-console-network`));
    expect(retained).toMatchObject({ httpFailures: [], failedRequests: [{ method: "GET", address: `${httpOrigin}${HTTP_CANCEL_PATH}` }] });
    expect(info.annotations.find((annotation) => annotation.type === SURFACE_HTTP_ANNOTATION)?.description).toContain("unexpected=0 expected=0");
    expect(info.errors).toEqual([]);
  });

  httpTest(`surface HTTP accounts for only the exact expected ${pass} response`, async ({ page, context, httpOrigin }, info) => {
    const name = `expected-${pass}`;
    {
      await using _observation = await observeSurfaceSession(context, info, name, { pass, trace: "off", screenshot: "off", video: "off" });
      await page.goto(httpOrigin);
      const pending = page.waitForResponse((candidate) => candidate.url() === `${httpOrigin}${HTTP_EXPECTED_PATH}`);
      const status = await page.evaluate(async (path) => (await fetch(path)).status, HTTP_EXPECTED_PATH);
      const response = await pending;
      expect(status).toBe(400);
      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ reason: CHARACTER_HANDLE_CONFLICT_OP_CODE });
      await expect(page.getByRole("heading", { name: "Measurement control", exact: true })).toBeVisible();
      markExpectedSurfaceHttpFailure(response);
    }
    const retained = JSON.parse(await nativeAttachmentText(info, `${name}-console-network`));
    expect(retained).toMatchObject({ httpFailures: [{ status: 400, method: "GET", address: `${httpOrigin}${HTTP_EXPECTED_PATH}`, expected: true }] });
    expect(info.annotations.find((annotation) => annotation.type === SURFACE_HTTP_ANNOTATION)?.description).toContain("unexpected=0 expected=1");
    expect(info.errors).toEqual([]);
  });
}

httpTest("surface HTTP retains an early refusal after evidence ring eviction", async ({ page, context, httpOrigin, browserName }, info) => {
  test.skip(browserName !== "chromium", "One native eviction control exercises the shared request ring");
  const { RequestRing } = await import("@orb/tooling/snap");
  const capacity = (await new RequestRing({ bodyCapBytes: 0, bodyBudgetBytes: 0 }).read(0, null)).ring.capacity;
  const name = "evicted-http";
  {
    await using _observation = await observeSurfaceSession(context, info, name, { pass: "evidence", trace: "off", screenshot: "off", video: "off" });
    await page.goto(httpOrigin);
    expect(await page.evaluate(async (path) => (await fetch(path)).status, `${HTTP_FAILURE_PATH}?control=private-value`)).toBe(429);
    const statuses = await page.evaluate(async (count) => {
      const statusCodes: number[] = [];
      for (let index = 0; index < count; index += 1) {
        const response = await fetch(`/healthy/${String(index)}`);
        await response.text();
        statusCodes.push(response.status);
      }
      return statusCodes;
    }, capacity + 1);
    expect(new Set(statuses)).toEqual(new Set([200]));
    await expect(page.getByRole("heading", { name: "Measurement control", exact: true })).toBeVisible();
  }
  const ring = JSON.parse(await nativeAttachmentText(info, `${name}-request-ring`));
  if (!(isPlainObject(ring) && isPlainObject(ring["ring"]))) {
    throw new Error("The native request ring did not retain its eviction accounting");
  }
  expect(ring).toMatchObject({ ring: { capacity, retained: capacity }, entries: expect.any(Array) });
  expect(ring["ring"]["evicted"]).toBeGreaterThan(0);
  expect(ring).not.toEqual(expect.objectContaining({ entries: expect.arrayContaining([expect.objectContaining({ status: 429 })]) }));
  const retained = JSON.parse(await nativeAttachmentText(info, `${name}-console-network`));
  expect(retained).toMatchObject({ httpFailures: [{ status: 429, method: "GET", address: `${httpOrigin}${HTTP_FAILURE_PATH}`, expected: false }] });
  expect(info.annotations.find((annotation) => annotation.type === SURFACE_HTTP_ANNOTATION)?.description).toContain("unexpected=1 expected=0");
  expect(info.errors).toHaveLength(1);
  expect(info.errors[0]?.message).toContain(SURFACE_HTTP_ANNOTATION);
  test.fail(true, "The verified unexpected HTTP response remains a native failure after forensic ring eviction");
});

test("the Chromium browser records actual acceleration without requiring hardware", async ({ browser, browserName }, info) => {
  test.skip(browserName !== "chromium", "This capability control requires Chromium's native SystemInfo API");
  const acceleration = await readBrowserAcceleration(browser);
  await attachNativeFile(info, info, "native-browser-acceleration", { body: JSON.stringify(acceleration, null, 2), contentType: "application/json" });
  expect(["hardware", "software", "unknown"]).toContain(acceleration.posture);
});

test("axe detects the planted image alternative defect and the healthy control clears it", async ({ page }) => {
  await page.route(`**${CONTROL_PATH}`, (route) => route.fulfill({ contentType: "text/html", body: DOCUMENT }));
  await page.goto(CONTROL_PATH);
  await expect(readWebVitals(page)).rejects.toThrow("web-vitals observers were not installed before navigation");
  await page.getByRole("main").evaluate((main) => {
    const image = document.createElement("img");
    image.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    main.append(image);
  });
  const broken = await accessibilityScan(page);
  expect(broken.violations.find(({ id }) => id === "image-alt")?.nodes.length).toBe(1);
  await page.getByRole("img").evaluate((image) => image.setAttribute("alt", "A measurement control"));
  const healthy = await accessibilityScan(page);
  expect(healthy.violations).toEqual([]);
  expect(healthy.passes.find(({ id }) => id === "image-alt")?.nodes.length).toBe(1);
  expect(healthy.inapplicable.length).toBeGreaterThan(0);
  expect(Array.isArray(healthy.incomplete)).toBe(true);
});

test("web-vitals initialization is per document and missing metric callbacks stay explicit", async ({ page }, info) => {
  await using documentServer = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(DOCUMENT);
  });
  await new Promise<void>((resolve, reject) => {
    documentServer.once("error", reject);
    documentServer.listen(0, "127.0.0.1", resolve);
  });
  const address = documentServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("The native measurement control did not bind a loopback TCP listener");
  }
  const pageErrors: string[] = [];
  const emissions: WebVitalsEmission[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.exposeBinding("__surfaceVitalsReport", (_source, emission: WebVitalsEmission) => {
    emissions.push(emission);
  });
  await page.addInitScript({ content: webVitalsInitScript(await webVitalsSource()) });
  await page.goto(`http://127.0.0.1:${String(address.port)}${CONTROL_PATH}`);
  await attachNativeFile(info, info, "native-navigation-timing", {
    body: JSON.stringify(await page.evaluate(() => performance.getEntriesByType("navigation").map((entry) => entry.toJSON())), null, 2),
    contentType: "application/json",
  });
  const before = await readWebVitals(page);
  await expect
    .poll(async () => (await readWebVitals(page)).metrics.find(({ name }) => name === "TTFB")?.status)
    .toBe(before.supportedEntryTypes.includes("navigation") ? "measured" : "unsupported");
  await drainWebVitals(page);
  const emitted = emissions.find(({ timeOrigin, metric }) => timeOrigin === before.timeOrigin && metric.name === "TTFB");
  expect(emitted?.metric.entries.some((entry) => entry.kind === "navigation" && entry.responseStart > 0) ?? false).toBe(
    before.supportedEntryTypes.includes("navigation"),
  );
  expect(emitted?.metric).toEqual((await readWebVitals(page)).metrics.find(({ name }) => name === "TTFB")?.metric);
  const store = await page.evaluateHandle(() => globalThis.__surfaceVitals);
  try {
    await page.evaluate(installWebVitals);
    expect(await page.evaluate((original) => globalThis.__surfaceVitals === original, store)).toBe(true);
  } finally {
    await store.dispose();
  }
  expect((await readWebVitals(page)).timeOrigin).toBe(before.timeOrigin);
  const inp = before.metrics.find(({ name }) => name === "INP");
  expect(inp?.status).toBe(before.supportedEntryTypes.includes("event") ? "unmeasured" : "unsupported");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.reload();
  const after = await readWebVitals(page);
  expect(after.timeOrigin).toBeGreaterThan(before.timeOrigin);
  expect(after.coverage).toBe("top-document");
  expect(after.iframeMetrics).toBe("unmeasured");
  await expect
    .poll(async () => (await readWebVitals(page)).metrics.find(({ name }) => name === "TTFB")?.status)
    .toBe(after.supportedEntryTypes.includes("navigation") ? "measured" : "unsupported");
  await drainWebVitals(page);
  expect(emissions.some(({ timeOrigin, metric }) => timeOrigin === after.timeOrigin && metric.name === "TTFB")).toBe(
    after.supportedEntryTypes.includes("navigation"),
  );
  expect(pageErrors).toEqual([]);
});

test("CSS token hygiene retains dead and empty findings, a healthy twin, and unreadable coverage", async ({ page }, info) => {
  const { scanDeadCss } = await import("@orb/tooling/snap");
  await page.route(`**${CONTROL_PATH}`, (route) => route.fulfill({ contentType: "text/html", body: DOCUMENT }));
  await page.goto(CONTROL_PATH);
  await expect(page.getByRole("heading", { name: "Measurement control", exact: true })).toBeVisible();
  await page.addStyleTag({ content: ".defined { color: black } .empty-used { width: --not-a-value }" });
  await page.getByRole("main").evaluate((main) => {
    main.classList.add("never-defined", "empty-used");
  });
  const broken = await scanDeadCss(page, false);
  await attachNativeFile(info, info, "css-token-broken", { body: JSON.stringify(broken, null, 2), contentType: "application/json" });
  expect(broken.dead).toEqual([{ token: "never-defined", count: 1 }]);
  expect(broken.empty).toEqual([".empty-used"]);
  expect(broken.drain).toBeNull();
  await page.getByRole("main").evaluate((main) => {
    main.classList.remove("never-defined", "empty-used");
    main.classList.add("defined");
  });
  const healthy = await scanDeadCss(page, false);
  await attachNativeFile(info, info, "css-token-healthy", { body: JSON.stringify(healthy, null, 2), contentType: "application/json" });
  expect(healthy.readableSheets).toBeGreaterThan(0);
  expect(healthy.used).toBeGreaterThan(0);
  expect(healthy.dead).toEqual([]);
  expect(healthy.empty).toEqual([]);
  expect(healthy.unreadable).toEqual([]);
  const stylesheet = "http://surface-css.invalid/control.css";
  await page.route(stylesheet, (route) => route.fulfill({ contentType: "text/css", body: ".cross-origin { color: black }" }));
  await page.addStyleTag({ url: stylesheet });
  const incomplete = await scanDeadCss(page, false);
  await attachNativeFile(info, info, "css-token-incomplete", { body: JSON.stringify(incomplete, null, 2), contentType: "application/json" });
  expect(incomplete.unreadable).toHaveLength(1);
  expect(incomplete.unreadable[0]?.href).toBe(stylesheet);
  expect(incomplete.unreadable[0]?.error).not.toBe("");
  expect(incomplete.readableSheets).toBeLessThan(incomplete.sheets);
});

test("production density variants conform to their own tokens and off-token overrides remain defects", async ({ mount, page }, info) => {
  await mount<typeof SurfaceDesignStory>("tests/support/browser/surface-design-fixtures/SurfaceDesignStory", { width: 640 });
  await expect(page.getByRole("textbox", { name: "Title field", exact: true })).toBeVisible();
  const healthy = await readSurfaceDesignAudit(page);
  await attachNativeFile(info, info, "production-density-healthy", { body: JSON.stringify(healthy, null, 2), contentType: "application/json" });
  expect(healthy.samples.tierDrifts?.length).toBeGreaterThan(0);
  expect(healthy.audit.findings.filter(({ rule }) => rule === "tier-drift")).toEqual([]);
  await page.getByRole("textbox", { name: "Title field", exact: true }).evaluate((element) => {
    element.style.setProperty("font-size", "var(--text-micro)");
  });
  const broken = await readSurfaceDesignAudit(page);
  await attachNativeFile(info, info, "production-density-broken", { body: JSON.stringify(broken, null, 2), contentType: "application/json" });
  expect(broken.audit.findings.some(({ rule, value }) => rule === "tier-drift" && value.includes("input-root"))).toBe(true);
});

test("cohort geometry compares the same declared variant rather than every button", async ({ mount, page }, info) => {
  await mount<typeof SurfaceDesignStory>("tests/support/browser/surface-design-fixtures/SurfaceDesignStory", { width: 640 });
  const target = page.getByRole("button", { name: "Small control three", exact: true });
  await expect(target).toHaveAttribute("data-size", "glyph-xs");
  await expect(page.getByRole("button", { name: "Full control", exact: true })).toHaveAttribute("data-size", "md");
  const healthy = await readSurfaceDesignAudit(page);
  await attachNativeFile(info, info, "production-cohort-healthy", { body: JSON.stringify(healthy, null, 2), contentType: "application/json" });
  expect(healthy.audit.findings.filter(({ rule }) => rule === "cohort-anatomy")).toEqual([]);
  await target.evaluate((element) => {
    element.style.setProperty("block-size", "var(--size-control-md)");
  });
  const broken = await readSurfaceDesignAudit(page);
  await attachNativeFile(info, info, "production-cohort-broken", { body: JSON.stringify(broken, null, 2), contentType: "application/json" });
  expect(broken.audit.findings.some(({ rule, selector }) => rule === "cohort-anatomy" && selector.includes("Small control three"))).toBe(true);
});

test("the design walk restores real nested scroll positions after a native reveal throws", async ({ mount, page }) => {
  await mount<typeof SurfaceDesignStory>("tests/support/browser/surface-design-fixtures/SurfaceDesignStory", { width: 640 });
  const viewport = page.locator('[data-slot="scroll-area-viewport"][aria-label="Design scroll control"]');
  await expect(viewport).toBeVisible();
  const before = await viewport.evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft }));
  const end = page.getByRole("button", { name: "Scroll end", exact: true });
  await end.evaluate((element) => {
    const reveal = element.scrollIntoView.bind(element);
    Object.defineProperty(element, "scrollIntoView", {
      configurable: true,
      value: (options?: ScrollIntoViewOptions | boolean): never => {
        reveal(options);
        element.setAttribute("data-reveal-fault", "reached");
        throw new Error("Planted failure after native scrolling");
      },
    });
  });
  try {
    await expect(readSurfaceDesignAudit(page)).rejects.toThrow("Planted failure after native scrolling");
    await expect(end).toHaveAttribute("data-reveal-fault", "reached");
    expect(await viewport.evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft }))).toEqual(before);
    expect(await page.evaluate(() => Object.hasOwn(globalThis, "__orbWalkObserver"))).toBe(false);
  } finally {
    await end.evaluate((element) => Reflect.deleteProperty(element, "scrollIntoView"));
  }
});

for (const [styleKind, originalStyle] of [
  ["absent", null],
  ["present", "color: var(--color-foreground);  font-family: inherit;"],
  ["important", "color: var(--color-foreground) !important;  font-size: var(--text-body) !important;"],
] as const) {
  test(`the design walk restores exact inline styles after a token probe throws (${styleKind})`, async ({ mount, page }, info) => {
    await mount<typeof SurfaceDesignStory>("tests/support/browser/surface-design-fixtures/SurfaceDesignStory", { width: 640 });
    const card = page.getByLabel("Floating island", { exact: true });
    await expect(card).toBeVisible();
    await card.evaluate((element, style) => {
      if (style !== null) {
        element.setAttribute("style", style);
      }
    }, originalStyle);
    const before = await card.getAttribute("style");
    const setup = await card.evaluate((element) => {
      const beforeStyleRead = element.getAttribute("style");
      const nativeStyle = element.style;
      const afterStyleRead = element.getAttribute("style");
      Object.defineProperty(element, "style", {
        configurable: true,
        get: () => ({
          setProperty: (property: string, value: string): never => {
            element.setAttribute("data-style-at-probe", JSON.stringify(element.getAttribute("style")));
            nativeStyle.setProperty(property, value);
            element.setAttribute("data-style-fault", "reached");
            throw new Error("Planted failure after native style write");
          },
        }),
      });
      return { beforeStyleRead, afterStyleRead, afterFaultSetup: element.getAttribute("style") };
    });
    try {
      await expect(readSurfaceDesignAudit(page)).rejects.toThrow("Planted failure after native style write");
      await expect(card).toHaveAttribute("data-style-fault", "reached");
      await attachNativeFile(info, info, "native-style-cleanup-lifetime", {
        body: JSON.stringify(
          {
            before,
            setup,
            atProbe: await card.getAttribute("data-style-at-probe"),
            after: await card.getAttribute("style"),
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
      await expect.poll(() => card.getAttribute("style")).toBe(before);
      expect(await page.evaluate(() => Object.hasOwn(globalThis, "__orbWalkObserver"))).toBe(false);
    } finally {
      await card.evaluate((element) => {
        Reflect.deleteProperty(element, "style");
      });
    }
  });
}

test("Chromium records actual shift and interaction evidence inside ready-bounded action windows", async ({ page, browserName }, info) => {
  test.skip(browserName !== "chromium", "This positive control requires Chromium's CLS, Event Timing, and LoAF APIs");
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript({ content: webVitalsInitScript(await webVitalsSource()) });
  await page.route(`**${CONTROL_PATH}`, (route) => route.fulfill({ contentType: "text/html", body: DOCUMENT }));
  await page.goto(CONTROL_PATH);
  const initial = await readWebVitals(page);
  expect(initial.supportedEntryTypes).toEqual(expect.arrayContaining(["layout-shift", "event", "longtask", "long-animation-frame"]));
  await expect.poll(async () => (await readWebVitals(page)).metrics.find(({ name }) => name === "FCP")?.status).toBe("measured");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const shifted = await surfaceAction(info, {
    name: "planted-layout-shift",
    page,
    action: async () => {
      await page.getByRole("main").evaluate((main) => {
        main.style.paddingTop = "80px";
      });
    },
    ready: async () => {
      await expect(page.getByRole("main")).toHaveCSS("padding-top", "80px");
      await expect.poll(async () => (await readWebVitals(page)).metrics.find(({ name }) => name === "CLS")?.metric?.value ?? 0).toBeGreaterThan(0);
    },
  });
  const shifts = shifted.entries.filter((entry) => entry.kind === "layout-shift");
  expect(shifts.length).toBeGreaterThan(0);
  for (const entry of shifts) {
    expect(entry.startTime).toBeGreaterThanOrEqual(shifted.startTime);
    expect(entry.startTime).toBeLessThanOrEqual(shifted.readyAt);
    expect(entry.value).toBeGreaterThan(0);
    expect(entry.hadRecentInput).toBe(false);
    expect(entry.sources.length).toBeGreaterThan(0);
    expect(entry.sources[0]?.target).toContain(":nth-of-type(");
  }
  await page.getByRole("button", { name: "Continue", exact: true }).evaluate((button) => {
    button.addEventListener("click", () => {
      const end = performance.now() + 120;
      while (performance.now() < end) {
        // Deliberate main-thread work makes the browser emit diagnostic event and long-frame entries.
      }
      button.setAttribute("data-complete", "true");
    });
  });
  const interacted = await surfaceAction(info, {
    name: "planted-slow-interaction",
    page,
    action: async () => {
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    },
    ready: async () => {
      await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveAttribute("data-complete", "true");
    },
  });
  await expect.poll(async () => (await readWebVitals(page)).metrics.find(({ name }) => name === "INP")?.status).toBe("measured");
  await attachNativeFile(info, info, "fast-ready-interaction-delivery", {
    body: JSON.stringify({ window: interacted, delivered: await readWebVitals(page) }, null, 2),
    contentType: "application/json",
  });
  const events = interacted.entries.filter((entry) => entry.kind === "event");
  expect(interacted.collectedAt).toBeGreaterThan(interacted.readyAt);
  expect(interacted.duration).toBe(interacted.readyAt - interacted.startTime);
  expect(events.length).toBeGreaterThan(0);
  expect(events.some((entry) => entry.interactionId > 0 && entry.processingEnd > entry.processingStart)).toBe(true);
  const frames = interacted.entries.filter((entry) => entry.kind === "long-animation-frame");
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.some((entry) => entry.blockingDuration > 0 && entry.scripts.length > 0)).toBe(true);
  for (const entry of interacted.entries) {
    expect(entry.startTime + entry.duration).toBeGreaterThanOrEqual(interacted.startTime);
    expect(entry.startTime).toBeLessThanOrEqual(interacted.readyAt);
  }
  expect(pageErrors).toEqual([]);
});

test("failed readiness preserves its native action window and original failure", async ({ page }, info) => {
  await page.addInitScript({ content: webVitalsInitScript(await webVitalsSource()) });
  await page.route(`**${CONTROL_PATH}`, (route) => route.fulfill({ contentType: "text/html", body: DOCUMENT }));
  await page.goto(CONTROL_PATH);
  const failure = new Error("planted-ready-failure");
  await expect(
    surfaceAction(info, {
      name: "failed-readiness-control",
      page,
      action: async () => {
        await page.getByRole("button", { name: "Continue", exact: true }).click();
      },
      ready: () => Promise.reject(failure),
    }),
  ).rejects.toBe(failure);
  const attachment = info.attachments.find(({ name }) => name === "failed-readiness-control-failed-action-window");
  expect(attachment?.contentType).toBe("application/json");
  if (attachment?.path === undefined) {
    throw new Error("Failed readiness did not retain its native file attachment");
  }
  const payload = await readFile(attachment.path, "utf8");
  expect(payload).toContain('"phase": "ready"');
  expect(payload).toContain('"status": "same-document"');
});

test("document CLS uses separate session windows and excludes recent-input shifts", async ({ page, browserName }, info) => {
  test.skip(browserName !== "chromium", "This positive aggregation control requires native Chromium layout-shift evidence");
  await page.addInitScript({ content: webVitalsInitScript(await webVitalsSource()) });
  await page.route(`**${CONTROL_PATH}`, (route) => route.fulfill({ contentType: "text/html", body: DOCUMENT }));
  await page.goto(CONTROL_PATH);
  await expect.poll(async () => (await readWebVitals(page)).metrics.find(({ name }) => name === "FCP")?.status).toBe("measured");
  const rawShifts = async (): Promise<readonly Extract<SerializedPerformanceEntry, { readonly kind: "layout-shift" }>[]> =>
    await page.evaluate(() => {
      const store = globalThis.__surfaceVitals;
      if (store === undefined) {
        throw new Error("Missing installed control instrumentation");
      }
      for (const observer of store.observers) {
        store.entries.push(...observer.takeRecords());
      }
      return store.entries.map(store.serializeEntry).filter((entry) => entry.kind === "layout-shift");
    });
  await page.getByRole("main").evaluate((main) => {
    main.style.paddingTop = "80px";
  });
  await expect.poll(async () => (await rawShifts()).filter((entry) => !entry.hadRecentInput).length).toBeGreaterThan(0);
  // The browser's CLS session boundary is one second of quiet, not an application performance budget.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 1100)));
  const beforeSecond = (await rawShifts()).length;
  await page.getByRole("main").evaluate((main) => {
    main.style.paddingTop = "160px";
  });
  await expect.poll(async () => (await rawShifts()).length).toBeGreaterThan(beforeSecond);
  await expect.poll(async () => (await readWebVitals(page)).metrics.find(({ name }) => name === "CLS")?.status).toBe("measured");
  const unexpected = (await rawShifts()).filter((entry) => !entry.hadRecentInput);
  const first = unexpected.at(0);
  const last = unexpected.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error("The planted session shifts were not observed");
  }
  expect(last.startTime - first.startTime).toBeGreaterThan(1000);
  const rawSum = unexpected.reduce((total, entry) => total + entry.value, 0);
  const beforeInput = (await readWebVitals(page)).metrics.find(({ name }) => name === "CLS")?.metric?.value;
  expect(beforeInput).toBeDefined();
  expect(beforeInput).toBeLessThan(rawSum);
  await page.getByRole("button", { name: "Continue", exact: true }).evaluate((button) => {
    button.addEventListener("click", () => {
      document.querySelector("main")?.setAttribute("style", "padding-top:240px");
    });
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect.poll(async () => (await rawShifts()).some((entry) => entry.hadRecentInput && entry.value > 0)).toBe(true);
  expect((await readWebVitals(page)).metrics.find(({ name }) => name === "CLS")?.metric?.value).toBe(beforeInput);
  await attachNativeFile(info, info, "cls-session-and-input-control", {
    body: JSON.stringify({ rawShifts: await rawShifts(), vendor: await readWebVitals(page) }, null, 2),
    contentType: "application/json",
  });
});

test("a browser without layout-shift support reports unsupported rather than zero", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "The explicit unsupported control runs on the WebKit project");
  await page.addInitScript({ content: webVitalsInitScript(await webVitalsSource()) });
  await page.route(`**${CONTROL_PATH}`, (route) => route.fulfill({ contentType: "text/html", body: DOCUMENT }));
  await page.goto(CONTROL_PATH);
  const snapshot = await readWebVitals(page);
  test.skip(snapshot.supportedEntryTypes.includes("layout-shift"), "This browser version supports layout-shift; it cannot prove the unsupported branch");
  expect(snapshot.metrics.find(({ name }) => name === "CLS")).toEqual({ name: "CLS", status: "unsupported" });
});

test("lifecycle drain waits for a real pending browser binding without claiming finalization", async ({ page }) => {
  let entered = false;
  const release = Promise.withResolvers<void>();
  let delivered = 0;
  await page.exposeBinding("__surfaceVitalsReport", async () => {
    entered = true;
    await release.promise;
    delivered += 1;
  });
  await page.addInitScript({ content: webVitalsInitScript(await webVitalsSource()) });
  await page.route(`**${CONTROL_PATH}`, (route) => route.fulfill({ contentType: "text/html", body: DOCUMENT }));
  await page.goto(CONTROL_PATH);
  await expect.poll(() => entered).toBe(true);
  const draining = drainWebVitals(page).then(() => "drained" as const);
  try {
    expect(await Promise.race([draining, page.evaluate(() => "binding-pending" as const)])).toBe("binding-pending");
    expect(delivered).toBe(0);
  } finally {
    release.resolve();
    await draining;
  }
  expect(delivered).toBeGreaterThan(0);
  expect((await readWebVitals(page)).finalization).toBe("provisional");
});

test("Base UI hidden form inputs and open Select portals retain their real accessible semantics", async ({ mount, page }) => {
  await mount<typeof SurfaceFrameworkStory>("tests/support/browser/surface-framework-fixtures/SurfaceFrameworkStory");
  const choice = page.getByRole("combobox", { name: "Choice", exact: true });
  await expect(choice).toHaveText("Alpha");
  await expect(page.locator('input[name="surface-choice"]')).toHaveAttribute("aria-label", "Choice");
  expect((await accessibilityScan(page)).violations).toEqual([]);
  await choice.focus();
  await page.keyboard.press("ArrowDown");
  const listbox = page.getByRole("listbox", { name: "Choice", exact: true });
  await expect(listbox).toBeVisible();
  expect((await accessibilityScan(page)).violations).toEqual([]);
  await page.getByRole("option", { name: "Beta", exact: true }).click();
  await expect(choice).toHaveText("Beta");
  await expect(listbox).toBeHidden();
  await expect(choice).toBeFocused();
});

test("Suspense and Activity dormant content is not covered until its actual state becomes visible", async ({ mount, page }) => {
  await mount<typeof SurfaceFrameworkStory>("tests/support/browser/surface-framework-fixtures/SurfaceFrameworkStory");
  await expect(page.getByRole("status")).toHaveText("Awaiting content");
  await expect(page.getByRole("button", { name: "Resolved action", exact: true })).toHaveCount(0);
  await expect(page.locator('section[aria-label="Activity control"]')).toBeAttached();
  await expect(page.locator('section[aria-label="Activity control"]')).toBeHidden();
  await expect(page.getByRole("region", { name: "Activity control", exact: true })).toHaveCount(0);
  await expect(
    assertSurfaceReady({
      name: "held-suspense",
      scope: page.getByRole("main"),
      state: "loaded",
      witnesses: [page.getByRole("button", { name: "Resolved action", exact: true })],
      checks: ["names"],
    }),
  ).rejects.toThrow();
  expect((await accessibilityScan(page)).violations).toEqual([]);
  await page.getByRole("button", { name: "Resolve content", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resolved action", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show activity", exact: true }).click();
  const activity = page.getByRole("region", { name: "Activity control", exact: true });
  await expect(activity).toBeVisible();
  const visible = await accessibilityScan(page);
  expect(visible.violations.find(({ id }) => id === "button-name")?.nodes.length).toBe(1);
  await page.getByRole("button", { name: "Label activity", exact: true }).click();
  await expect(activity.getByRole("button", { name: "Activity action", exact: true })).toBeVisible();
  expect((await accessibilityScan(page)).violations).toEqual([]);
});

test("a visible Base UI portal is audited and its focus trap and return remain observable", async ({ mount, page }) => {
  await mount<typeof SurfaceFrameworkStory>("tests/support/browser/surface-framework-fixtures/SurfaceFrameworkStory");
  const trigger = page.getByRole("button", { name: "Open portal", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Portal control", exact: true });
  await expect(dialog).toBeVisible();
  const defective = await accessibilityScan(page);
  expect(defective.violations.find(({ id }) => id === "button-name")?.nodes.length).toBe(1);
  await dialog.getByRole("button", { name: "Label portal", exact: true }).click();
  const action = dialog.getByRole("button", { name: "Portal action", exact: true });
  await expect(action).toBeVisible();
  expect((await accessibilityScan(page)).violations).toEqual([]);
  await action.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Close portal", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test.describe("coarse-pointer framework controls", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("adjacent full-floor hit pseudos pass while a one-pixel-short target remains a finding", async ({ mount, page }, info) => {
    await mount<typeof SurfaceTouchTilingStory>("tests/support/browser/surface-design-fixtures/SurfaceTouchTilingStory");
    const left = page.getByRole("button", { name: "Tiled Left", exact: true });
    const floor = await touchFloorPx(page);
    expect(await hitExtent(left, "x")).toBe(floor);
    expect(await touchTargetFindings(page)).toEqual([]);
    const healthy = await readSurfaceDesignAudit(page);
    await attachNativeFile(info, info, "tiled-hit-healthy", { body: JSON.stringify(healthy, null, 2), contentType: "application/json" });
    expect(healthy.audit.findings.filter(({ rule }) => rule === "tap-target")).toEqual([]);
    await page.addStyleTag({ content: `button[aria-label="Tiled Left"]::before { inline-size: ${floor - 1}px; block-size: ${floor - 1}px; }` });
    expect(await left.evaluate((element) => getComputedStyle(element, "::before").inlineSize)).toBe(`${floor - 1}px`);
    expect(await hitExtent(left, "x")).toBeLessThan(floor);
    const shortPseudo = await readSurfaceDesignAudit(page);
    await attachNativeFile(info, info, "tiled-hit-short-pseudo", { body: JSON.stringify(shortPseudo, null, 2), contentType: "application/json" });
    expect(shortPseudo.audit.findings.some(({ rule, selector }) => rule === "tap-target" && selector.includes("Tiled Left"))).toBe(true);
    await page.addStyleTag({
      content: `button[aria-label="Tiled Left"] { inline-size: ${floor - 1}px; block-size: ${floor - 1}px; } button[aria-label="Tiled Left"]::before { content: none; }`,
    });
    await expect(left).toHaveCSS("inline-size", `${floor - 1}px`);
    await expect(left).toHaveCSS("block-size", `${floor - 1}px`);
    expect(await hitExtent(left, "x")).toBeLessThan(floor);
    const broken = await readSurfaceDesignAudit(page);
    await attachNativeFile(info, info, "tiled-hit-short", { body: JSON.stringify(broken, null, 2), contentType: "application/json" });
    expect(broken.audit.findings.some(({ rule, selector }) => rule === "tap-target" && selector.includes("Tiled Left"))).toBe(true);
    expect((await touchTargetFindings(page)).some((finding) => finding.includes("under the"))).toBe(true);
  });
  test("a control another layer covers is reported as occluded, never as an undersized target", async ({ mount, page }) => {
    await mount<typeof SurfaceTouchTilingStory>("tests/support/browser/surface-design-fixtures/SurfaceTouchTilingStory");
    const middle = page.getByRole("button", { name: "Tiled Middle", exact: true });
    expect(await touchTargetFindings(page)).toEqual([]);
    await middle.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const cover = document.createElement("div");
      cover.setAttribute(
        "style",
        `position:fixed;left:${String(box.left)}px;top:${String(box.top)}px;inline-size:${String(box.width)}px;block-size:${String(box.height)}px`,
      );
      document.body.append(cover);
    });
    const covered = await touchTargetFindings(page);
    expect(covered).toHaveLength(1);
    expect(covered[0]).toMatch(/^occluded at its centre, not measured for size: .*"tag":"DIV"/u);
  });
  test("touch admission distinguishes native inert content from visually active aria-hidden content", async ({ mount, page }) => {
    await mount<typeof SurfaceFrameworkStory>("tests/support/browser/surface-framework-fixtures/SurfaceFrameworkStory");
    const target = page.getByRole("button", { name: "Resolve content", exact: true, includeHidden: true });
    await target.evaluate((node) => {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("aria-hidden", "true");
      node.before(wrapper);
      wrapper.append(node);
      node.setAttribute("style", "inline-size:8px;block-size:8px;min-inline-size:0;min-block-size:0;padding:0;border:0");
    });
    const hiddenOnly = await touchTargetFindings(page);
    expect(hiddenOnly.length).toBeGreaterThan(0);
    await target.evaluate((node) => {
      node.style.pointerEvents = "none";
    });
    expect(await touchTargetFindings(page)).toEqual([]);
    await target.evaluate((node) => {
      node.style.pointerEvents = "auto";
    });
    expect((await touchTargetFindings(page)).length).toBeGreaterThan(0);
    await target.evaluate((node) => {
      const parent = node.parentElement;
      if (parent === null) {
        throw new Error("The control lost its declared hidden parent");
      }
      parent.inert = true;
    });
    expect(await touchTargetFindings(page)).toEqual([]);
  });
  test("production wrappers keep reachable targets while dormant controls remain outside the population", async ({ mount, page }) => {
    await mount<typeof SurfaceFrameworkStory>("tests/support/browser/surface-framework-fixtures/SurfaceFrameworkStory");
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await expect(page.getByRole("region", { name: "Activity control", exact: true })).toHaveCount(0);
    expect(await touchTargetFindings(page)).toEqual([]);
    await page.getByRole("button", { name: "Open portal", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Portal control", exact: true });
    await expect(dialog).toBeVisible();
    expect(await touchTargetFindings(page)).toEqual([]);
    await dialog.getByRole("button", { name: "Close portal", exact: true }).click();
    await expect(dialog).toBeHidden();
  });
});
