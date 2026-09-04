// @instrument-proof: small-cap browser rings prove eviction, cursor windows, active CDP survival, body
// cleanup, scoped drop receipts and clean below-cap twins through the production shared browser path.
// @instrument-absence-proof: every over-cap channel must report omissions; a bounded population may not
// look complete merely because its retained suffix is non-empty.

import type { ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { aggregateScope, exactScope } from "@orb/tooling/_shared/artifact-scope";
import { launchProbeSession, settle, withProbeSession } from "@orb/tooling/_shared/browser";
import { browserEvidenceRetention } from "@orb/tooling/_shared/browser-capture";
import { BoundedEvidenceRing, browserEvidenceRetentionBatchSchema, diagnosticRetentionSummary } from "@orb/tooling/_shared/browser-evidence-ring";
import {
  __clearNetworkExtrasForTest,
  __networkRetentionStateForTest,
  __pushNetworkExtraForTest,
  networkRecordsForPages,
  selectNetworkBodies,
} from "@orb/tooling/_shared/browser-network";
import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

vi.setConfig({ testTimeout: scaledBudget(120_000, 4), hookTimeout: scaledBudget(120_000, 4) });

test("bounded browser evidence keeps cursor attribution and active network chains honest above every cap", async () => {
  const held: ServerResponse[] = [];
  const server = createServer((request, response) => {
    const url = request.url ?? "/";
    if (url.startsWith("/hold")) {
      held.push(response);
      return;
    }
    if (url === "/redirect") {
      response.writeHead(302, { location: "/body" });
      response.end();
      return;
    }
    if (url === "/body") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ retained: true }));
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html data-app-ready><body>retention</body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const session = await launchProbeSession({
    headless: true,
    viewport: { width: 640, height: 480 },
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
    evidenceLimits: {
      console: 4,
      pageErrors: 3,
      diagnostics: 5,
      diagnosticCompleteness: 2,
      requestSummary: 4,
      networkCompleted: 3,
      networkPendingExtra: 2,
    },
  });
  try {
    await withProbeSession(session, async () => {
      await session.page.goto(origin);
      await session.page.evaluate("fetch('/summary-secret?token=planted-secret').then(response => response.text())");
      await expect.poll(() => [...session.requests.keys()].some((key) => key.includes("/summary-secret"))).toBe(true);
      const summaryEntry = [...session.requests.entries()].find(([key]) => key.includes("/summary-secret"));
      expect(summaryEntry?.[0]).not.toContain("planted-secret");
      expect(summaryEntry?.[0]).toContain("%5BREDACTED%5D");
      expect(summaryEntry?.[1].url).toBe(summaryEntry?.[0]);
      for (let index = 0; index < 5; index += 1) {
        __pushNetworkExtraForTest(session.page, `orphan-${String(index)}`, "requestExtra");
      }
      expect(__networkRetentionStateForTest(session.page)).toMatchObject({ pendingRequestExtra: 2 });
      __clearNetworkExtrasForTest(session.page);
      const firstStart = session.evidence.console.cursor();
      await session.page.evaluate("for (let index = 0; index < 6; index += 1) console.log('window-0-' + index)");
      await settle(session.page, 50);
      const firstEnd = session.evidence.console.cursor();
      session.diagnosticWindow.value = 1;
      const secondStart = session.evidence.console.cursor();
      await session.page.evaluate(`(() => {
        for (let index = 0; index < 5; index += 1) console.warn('window-1-' + index);
        for (let index = 0; index < 5; index += 1) setTimeout(() => { throw new Error('page-error-' + index); }, 0);
      })()`);
      await expect.poll(() => session.pageErrors.length).toBe(3);
      const secondEnd = session.evidence.console.cursor();

      const first = session.evidence.console.read(firstStart, firstEnd, "test-console-window-0");
      const second = session.evidence.console.read(secondStart, secondEnd, "test-console-window-1");
      expect(first.receipt).toMatchObject({ observed: 6, retained: 0, dropped: 6, complete: false, scope: aggregateScope() });
      expect(second.receipt).toMatchObject({ observed: 5, retained: 4, dropped: 1, complete: false });
      expect(second.records.map((row) => row.text)).toEqual(["window-1-1", "window-1-2", "window-1-3", "window-1-4"]);
      expect(session.pageErrors).toHaveLength(3);
      expect(session.diagnostics.length).toBeLessThanOrEqual(5);

      for (let index = 0; index < 5; index += 1) {
        session.evidence.diagnosticCompleteness.push(
          { contextIndex: 0, pageIndex: 0, evidenceWindow: 1, records: index, dropped: 0, cap: 128, complete: true },
          exactScope(0, 0, 1),
        );
      }
      for (let index = 0; index < 7; index += 1) {
        await session.page.evaluate(`fetch('/done-${String(index)}').then(response => response.text())`);
      }
      await expect.poll(() => session.requests.size).toBe(4);

      selectNetworkBodies(session.pages, "body");
      await session.page.evaluate(
        "globalThis.__retentionHolds = Array.from({length:5}, (_, index) => fetch('/hold-' + index).then(response => response.text()))",
      );
      await expect.poll(() => __networkRetentionStateForTest(session.page)?.active).toBe(5);
      expect(__networkRetentionStateForTest(session.page)).toMatchObject({ completed: 3, active: 5, chains: 5 });
      for (const response of held) {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("released");
      }
      await session.page.evaluate("Promise.all(globalThis.__retentionHolds)");
      await session.page.evaluate("fetch('/redirect').then(response => response.json())");
      const network = await networkRecordsForPages(session.pages);
      const redirected = network.filter((record) => record.request.url.includes("/redirect") || record.request.url.includes("/body"));
      expect(redirected.map((record) => record.generation)).toEqual([0, 1]);
      expect(network).toHaveLength(3);
      expect(__networkRetentionStateForTest(session.page)).toEqual({
        completed: 3,
        active: 0,
        chains: 0,
        pendingRequestExtra: 0,
        pendingResponseExtra: 0,
        pendingBodies: 0,
      });

      const batch = browserEvidenceRetention(session);
      expect(browserEvidenceRetentionBatchSchema.parse(batch)).toEqual(batch);
      expect(batch.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: "browser-console", dropped: expect.any(Number), complete: false }),
          expect.objectContaining({ source: "browser-page-errors", dropped: 2, complete: false }),
          expect.objectContaining({ source: "browser-diagnostics", complete: false }),
          expect.objectContaining({ source: "browser-diagnostic-completeness", dropped: 3, complete: false }),
          expect.objectContaining({ source: "browser-request-summary-latest-url", complete: false }),
          expect.objectContaining({ source: "browser-network-completed", complete: false }),
          expect.objectContaining({ source: "browser-network-orphan-extra", dropped: 5, complete: false }),
          expect.objectContaining({
            source: "browser-console",
            dropped: expect.any(Number),
            scope: {
              kind: "scope-v1",
              context: { kind: "exact", value: 0 },
              page: { kind: "exact", value: 0 },
              window: { kind: "exact", value: "1" },
            },
          }),
        ]),
      );
      expect(batch.limits.length).toBeGreaterThan(0);
      expect(diagnosticRetentionSummary(batch)).toMatchObject({ complete: false, dropped: expect.any(Number) });
    });
  } finally {
    for (const response of held) {
      if (!response.writableEnded) {
        response.end();
      }
    }
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
  }
});

test("below-cap ring stays complete", () => {
  const ring = new BoundedEvidenceRing<string>(4);
  ring.push("a", exactScope(0, 0, 0));
  ring.push("b", exactScope(0, 0, 0));
  expect(ring.read(0, ring.cursor(), "clean-twin")).toMatchObject({ records: ["a", "b"], receipt: { dropped: 0, complete: true } });
  expect(ring.receipts("clean-twin")).toEqual(expect.arrayContaining([expect.objectContaining({ dropped: 0, complete: true })]));
});
