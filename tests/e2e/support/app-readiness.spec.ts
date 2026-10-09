import { readdir, readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { waitForAppReady } from "./chat-room.ts";
import type { WarmupDiagnostics } from "./global-setup.ts";
import { __warmClientsForTest } from "./global-setup.ts";
import { MODE_PROJECTS } from "./modes.ts";

test("readiness requires settled reads, not the degraded fallback marker", async ({ page }) => {
  await page.setContent('<html data-app-ready=""><body>Settled</body></html>');
  await waitForAppReady(page);
  await page.locator("html").evaluate((html) => html.setAttribute("data-app-ready", "degraded"));
  await expect(waitForAppReady(page, 100)).rejects.toThrow(/degraded/u);
});

test("a failed boot names the Vite import error rather than only a missing marker", async ({ page }) => {
  await page.setContent("<vite-error-overlay></vite-error-overlay>");
  await page.locator("vite-error-overlay").evaluate((overlay) => {
    const root = overlay.attachShadow({ mode: "open" });
    root.innerHTML = '<span class="message-body">Failed to resolve import ./missing-boot.ts</span>';
  });
  await expect(waitForAppReady(page, 100)).rejects.toThrow(/Failed to resolve import \.\/missing-boot\.ts/u);
});

test("a degraded boot can recover when its actual reads settle", async ({ page }) => {
  await page.setContent('<html data-app-ready="degraded"><body>Waiting for reads</body></html>');
  const ready = waitForAppReady(page, 1000);
  await page.locator("html").evaluate((html) => html.setAttribute("data-app-ready", ""));
  await ready;
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "");
});

test("an auth boundary is named and never mistaken for app readiness", async ({ page }) => {
  await page.setContent("<form><label>Username<input></label><button>Sign in</button></form>");
  await expect(waitForAppReady(page, 100)).rejects.toThrow(/Sign in/u);
});

test("diagnostic capture failure preserves the original readiness assertion", async ({ page }) => {
  await page.setContent('<html data-app-ready=""><body>Settled</body></html>');
  await waitForAppReady(page);
  await page.close();
  await expect(waitForAppReady(page, 100)).rejects.toMatchObject({
    message: expect.stringContaining("diagnostic capture failed"),
    cause: { message: expect.stringContaining("toHaveAttribute") },
  });
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("warm-up control server did not bind TCP");
  }
  return `http://127.0.0.1:${String(address.port)}`;
}

test("fatal warm-up persists complete evidence, bounds its error and drains the slower peer", async ({}, testInfo) => {
  // This control includes both unchanged readiness windows and the browser's capture/cleanup work.
  test.setTimeout(90_000);
  const early = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/octet-stream", "content-disposition": 'attachment; filename="unbootable.txt"' });
    response.end("Not an app document");
  });
  const longDetail = "x".repeat(500);
  const consoleRefusal = "console-only boot refusal";
  const scripts = Array.from(
    { length: 12 },
    (_, index) => `<script src="/refused-${String(index)}"></script><script>throw new Error("boot-failure-${String(index)}-${longDetail}")</script>`,
  ).join("");
  // Held bodies must not share the document retry's connection pool.
  const held = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain", "access-control-allow-origin": "*" });
    response.write("Held body");
  });
  let heldOrigin = "";
  const peer = createServer((request, response) => {
    if (request.url?.startsWith("/refused-") === true) {
      response.writeHead(503, { "content-type": "application/javascript" });
      response.end("Refused boot import");
    } else {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(
        `<html data-app-ready="degraded"><body>${scripts}<script>console.error(${JSON.stringify(`${consoleRefusal} http://127.0.0.1/missing.js?private=fixture-query`)});for (let i=0; i<12; i++) fetch('${heldOrigin}/held-'+i+'-${longDetail}')</script></body></html>`,
      );
    }
  });
  try {
    const [earlyOrigin, peerOrigin, heldBaseUrl] = await Promise.all([listen(early), listen(peer), listen(held)]);
    heldOrigin = heldBaseUrl;
    const startupReportNames = (await readdir(testInfo.project.outputDir)).filter((name) => /^warmup-.*\.json$/u.test(name)).sort();
    const startupReports = await Promise.all(startupReportNames.map(async (name) => ({ name, bytes: await readFile(join(testInfo.project.outputDir, name)) })));
    expect(startupReportNames).toContain("warmup-single-user.json");
    const reportDir = testInfo.outputPath("controlled-warmups");
    const modes = MODE_PROJECTS.filter((mode) => mode.name !== "forward-header").map((mode) => ({
      ...mode,
      baseUrl: mode.name === "single-user" ? earlyOrigin : peerOrigin,
      clientWarmup: "shell" as const,
    }));
    const failure = await __warmClientsForTest(modes, reportDir).then(
      () => new Error("fatal warm-up incorrectly succeeded"),
      (error: Error): Error => error,
    );
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([
      expect.objectContaining({ message: expect.stringContaining("single-user") }),
      expect.objectContaining({ message: expect.stringContaining("local") }),
    ]);
    expect(failure.message).toContain("2 mode(s) failed");
    expect(failure.message).toContain("failureCount");
    expect(failure.message.length).toBeLessThan(4000);
    expect(failure.message).not.toContain("boot-failure-11");
    expect(failure.message).not.toContain("/held-11");
    expect(modes.map((mode) => mode.name)).toEqual(["single-user", "local"]);
    expect((await readdir(testInfo.project.outputDir)).filter((name) => /^warmup-.*\.json$/u.test(name)).sort()).toEqual(startupReportNames);
    expect(await Promise.all(startupReports.map(async ({ name }) => readFile(join(testInfo.project.outputDir, name))))).toEqual(
      startupReports.map(({ bytes }) => bytes),
    );
    const reports = await Promise.all(
      modes.map(async (mode): Promise<WarmupDiagnostics> => {
        const artifact = join(reportDir, `warmup-${mode.name}.json`);
        await testInfo.attach(`warmup-${mode.name}`, { path: artifact, contentType: "application/json" });
        return JSON.parse(await readFile(artifact, "utf8")) as WarmupDiagnostics;
      }),
    );
    const [earlyReport, peerReport] = reports;
    expect(earlyReport?.loads).toEqual([]);
    expect(peerReport?.navigations.length).toBeGreaterThan(0);
    expect(peerReport?.failures).toContain(`JavaScript: boot-failure-11-${longDetail}`);
    expect(peerReport?.failures).toContain("HTTP 503: /refused-11");
    expect(peerReport?.failures).toContain(`Console: ${consoleRefusal} http://127.0.0.1/missing.js`);
    expect(JSON.stringify(peerReport)).not.toContain("fixture-query");
    expect(peerReport?.pendingRequests).toContain(`/held-11-${longDetail}`);
    expect(peerReport?.readiness).toEqual(expect.arrayContaining([expect.objectContaining({ state: "degraded" })]));
    expect(peerReport?.loads).toHaveLength(2);
  } finally {
    await Promise.all(
      [early, peer, held].map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
          }),
      ),
    );
  }
});
