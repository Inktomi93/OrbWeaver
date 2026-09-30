// A request a harness navigation discards is not an app failure; a failure on the kept document still is.
import type { ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { launchProbeSession, withProbeSession } from "@orb/tooling/_shared/browser";
import { vi } from "vitest";
import { partitionFailedRequests } from "../../../../tooling/src/snap/ops/noise.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

vi.setConfig({ testTimeout: scaledBudget(60_000, 4), hookTimeout: scaledBudget(60_000, 4) });

const STREAM_PAGE = `<!doctype html><html data-app-ready><body>stream<script>fetch("/stream", { method: "POST" });</script></body></html>`;
const KEPT_PAGE = `<!doctype html><html data-app-ready><body>kept<script>
  fetch("/missing");
  const controller = new AbortController();
  fetch("/app-abort", { signal: controller.signal }).catch(() => undefined);
  setTimeout(() => controller.abort(), 50);
</script></body></html>`;

test("aborts from a document the harness navigated away from leave the verdict; a real failure on the kept page counts", async () => {
  const held: ServerResponse[] = [];
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    if (url === "/stream" || url === "/app-abort") {
      // A long-lived stream: the head is sent, the body never ends, like the app's stream.connect.
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(": open\n\n");
      held.push(response);
      return;
    }
    if (url === "/missing") {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(url === "/kept" ? KEPT_PAGE : STREAM_PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const session = await launchProbeSession({
    headless: true,
    viewport: { width: 640, height: 480 },
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });
  try {
    await withProbeSession(session, async () => {
      const failedPaths = (): string[] => partitionFailedRequests(session.requests.values()).failed.map((request) => new URL(request.url).pathname);
      await session.page.goto(origin);
      await expect.poll(() => [...session.requests.values()].find((request) => request.url.endsWith("/stream"))?.status).toBe(200);
      // The warm-up re-navigation shape: the same URL again, so the discarded document's stream aborts.
      await session.page.goto(origin);
      await expect.poll(() => held.length).toBeGreaterThanOrEqual(2);
      await session.page.goto(`${origin}/kept`);
      await expect.poll(() => failedPaths().toSorted((a, b) => a.localeCompare(b))).toEqual(["/app-abort", "/missing"]);
      const { navigationAborts } = partitionFailedRequests(session.requests.values());
      expect(navigationAborts.map((request) => new URL(request.url).pathname)).toEqual(["/stream"]);
    });
  } finally {
    for (const response of held) {
      response.destroy();
    }
    server.close();
  }
});

// A navigation that never replaces the page (an attachment download, a 204) discards no document, so an
// abort the app then makes on the page it is still showing remains an app failure.
const STAYING_PAGE = `<!doctype html><html data-app-ready><body>staying<a id="export" href="/export">export</a><script>
  window.startFetch = () => { window.controller = new AbortController(); fetch("/app-abort", { signal: window.controller.signal }).catch(() => undefined); };
</script></body></html>`;

test.each(["download", "no-content"] as const)("a %s navigation keeps the page, so a later app abort on it still counts", async (kind) => {
  const held: ServerResponse[] = [];
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    if (url === "/app-abort") {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(": open\n\n");
      held.push(response);
      return;
    }
    if (url === "/export") {
      response.writeHead(200, { "content-type": "application/octet-stream", "content-disposition": "attachment; filename=x.json" });
      response.end("{}");
      return;
    }
    if (url === "/nocontent") {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(STAYING_PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const session = await launchProbeSession({
    headless: true,
    viewport: { width: 640, height: 480 },
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });
  try {
    await withProbeSession(session, async () => {
      await session.page.goto(origin);
      await session.page.evaluate("window.startFetch()");
      await expect.poll(() => held.length).toBe(1);
      if (kind === "download") {
        const download = session.page.waitForEvent("download");
        await session.page.click("#export");
        await download;
      } else {
        const answered = session.page.waitForResponse((response) => response.url().endsWith("/nocontent"));
        await session.page.evaluate("location.href = '/nocontent'");
        await answered;
      }
      // Positive control: the page really stayed.
      expect(await session.page.textContent("body")).toContain("staying");
      await session.page.evaluate("window.controller.abort()");
      await expect
        .poll(() => partitionFailedRequests(session.requests.values()).failed.map((request) => new URL(request.url).pathname))
        .toContain("/app-abort");
      expect(partitionFailedRequests(session.requests.values()).navigationAborts).toEqual([]);
    });
  } finally {
    for (const response of held) {
      response.destroy();
    }
    server.close();
  }
});
