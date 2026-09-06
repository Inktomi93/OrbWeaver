// #1296: HAR is real correlated CDP Network evidence, never the shallow Playwright request summary.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { openRunSlot, publishRunSlot } from "@orb/tooling/_shared/artifacts";
import { launchProbeSession, settle, withProbeSession } from "@orb/tooling/_shared/browser";
import { browserEvidenceRetentionBatchSchema } from "@orb/tooling/_shared/browser-evidence-ring";
import { networkRecordsForPages, selectNetworkBodies, wirePageNetwork } from "@orb/tooling/_shared/browser-network";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { CDPSession } from "@playwright/test";
import { chromium } from "@playwright/test";
import { vi } from "vitest";
import { assertCompleteNetworkHar, buildNetworkHar, writeNetworkHar } from "../../../../tooling/src/snap/lib/network-har.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

vi.setConfig({ testTimeout: scaledBudget(120_000, 4), hookTimeout: scaledBudget(120_000, 4) });

const SECRET = "planted-super-secret";
const NETWORK_CANARIES = {
  sig: "har-sig-canary",
  amz: "har-amz-canary",
  goog: "har-goog-canary",
  userinfo: "har-userinfo-canary",
} as const;
const LARGE_BYTES = 1_100_000;

function indexPath(stdout: string): string {
  const match = /\bindex=(\/\S+\/run\.json)\b/u.exec(stdout)?.[1];
  if (match === undefined) {
    throw new Error(`Snap did not print an immutable run index: ${stdout}`);
  }
  return match;
}

function pageHtml(): string {
  return `<!doctype html><html><body><h1>network plant</h1>
    <img src="http://user:${NETWORK_CANARIES.userinfo}@127.0.0.1:1/image?sig=${NETWORK_CANARIES.sig}">
    <script>
    Promise.allSettled([
      fetch('/post?access_token=${SECRET}&sig=${NETWORK_CANARIES.sig}&X-Amz-Signature=${NETWORK_CANARIES.amz}&X-Goog-Signature=${NETWORK_CANARIES.goog}', {method:'POST', headers:{authorization:'Bearer ${SECRET}','content-type':'application/json'}, body:JSON.stringify({password:'${SECRET}', visible:'kept'})}),
      fetch('/cache'), fetch('/cache'), fetch('/binary'), fetch('/large'), fetch('http://127.0.0.1:1/failure').catch(() => null)
    ]).then(() => console.info('network-settled'));
    window.open('/popup', '_blank');
  </script></body></html>`;
}

async function loopbackServer(): Promise<{ readonly base: string; readonly close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/start") {
      response.writeHead(302, { location: `/final?token=${SECRET}`, "set-cookie": `redirect=${SECRET}; HttpOnly` });
      response.end();
      return;
    }
    if (url.pathname === "/final") {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "text/html", "x-response-secret": SECRET });
        response.end(pageHtml());
      }, 25);
      return;
    }
    if (url.pathname === "/post") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.once("end", () => {
        response.writeHead(200, {
          "content-type": "application/json",
          "set-cookie": [`session=${SECRET}; HttpOnly`, `second=${SECRET}; SameSite=Lax`],
          "x-duplicate": ["one", "two"],
        });
        response.end(JSON.stringify({ ok: true, echoedBytes: Buffer.concat(chunks).length }));
      });
      return;
    }
    if (url.pathname === "/cache") {
      response.writeHead(200, { "content-type": "text/plain", "cache-control": "public,max-age=3600" });
      response.end("cacheable");
      return;
    }
    if (url.pathname === "/binary") {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(Buffer.from([0, 1, 2, 3, 4]));
      return;
    }
    if (url.pathname === "/large") {
      response.writeHead(200, { "content-type": "text/plain", "content-length": String(LARGE_BYTES) });
      response.end("x".repeat(LARGE_BYTES));
      return;
    }
    if (url.pathname === "/popup") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><title>popup</title><script>setTimeout(() => fetch('/popup-data'), 100)</script>");
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("popup-data");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: async () => await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error)))),
  };
}

function delayedExtraAndFailedBody(cdp: CDPSession): CDPSession {
  return new Proxy(cdp, {
    get(target, property) {
      if (property === "send") {
        return async (method: string, params?: unknown): Promise<unknown> => {
          if (method === "Network.getResponseBody") {
            throw new Error("planted body eviction");
          }
          return await Reflect.apply(target.send, target, params === undefined ? [method] : [method, params]);
        };
      }
      if (property === "on") {
        return (event: string, listener: (payload: unknown) => void): CDPSession => {
          const delivered = event.endsWith("ExtraInfo")
            ? (payload: unknown): void => {
                setTimeout(() => listener(payload), 40);
              }
            : listener;
          return Reflect.apply(target.on, target, [event, delivered]) as CDPSession;
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function rejectNetworkEnable(cdp: CDPSession): CDPSession {
  return new Proxy(cdp, {
    get(target, property) {
      if (property === "send") {
        return async (method: string, params?: unknown): Promise<unknown> => {
          if (method === "Network.enable") {
            throw new Error("planted Network.enable refusal");
          }
          return await Reflect.apply(target.send, target, params === undefined ? [method] : [method, params]);
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function withoutPath(value: unknown, path: readonly string[]): unknown {
  const clone = structuredClone(value);
  let cursor = clone as Record<string, unknown>;
  for (const key of path.slice(0, -1)) {
    cursor = cursor[key] as Record<string, unknown>;
  }
  Reflect.deleteProperty(cursor, path.at(-1) as string);
  return clone;
}

test("real CDP Network evidence produces complete redacted HAR across redirects, bodies, cache, failure, and a popup", async () => {
  const server = await loopbackServer();
  const session = await launchProbeSession({
    headless: true,
    viewport: { width: 640, height: 480 },
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });
  try {
    await withProbeSession(session, async () => {
      const pages = session.contexts.flatMap((context) => context.pages);
      selectNetworkBodies(pages, "/post");
      selectNetworkBodies(pages, "/binary");
      selectNetworkBodies(pages, "/large");
      await session.page.goto(`${server.base}/start?api_key=${SECRET}&sig=${NETWORK_CANARIES.sig}&X-Amz-Credential=${NETWORK_CANARIES.amz}`);
      // LOAD-SCALED (#1758): 700ms/50ms are the QUIET-BOX bases. Under contention the browser PROCESS
      // itself is contention-starved, not just this node event loop — the popup's own `setTimeout(…, 100)`
      // fetch (fired from a page window.open'd during the main settle) needs real wall-clock headroom to
      // actually run, or its network activity never lands in the HAR and the `_orb.pageIndex === 1`
      // assertion below reads an honest absence for a reason that has nothing to do with the HAR builder.
      await settle(session.page, scaledBudget(700));
      for (const page of session.contexts.flatMap((context) => context.pages)) {
        await settle(page, scaledBudget(50));
      }
      const har = await buildNetworkHar(session);
      assertCompleteNetworkHar(har);
      for (const missing of [
        ["log", "version"],
        ["log", "pages"],
        ["log", "entries", "0", "startedDateTime"],
        ["log", "entries", "0", "request", "method"],
        ["log", "entries", "0", "request", "queryString"],
        ["log", "entries", "0", "response", "content", "_orbOmission"],
        ["log", "entries", "0", "cache"],
        ["log", "entries", "0", "timings", "receive"],
        ["log", "entries", "0", "_orb", "contextIndex"],
        ["log", "entries", "0", "_orb", "failure"],
      ]) {
        expect(() => assertCompleteNetworkHar(withoutPath(har, missing)), missing.join(".")).toThrow("INSTRUMENT ERROR");
      }
      const serialized = JSON.stringify(har);
      expect(serialized).not.toContain(SECRET);
      for (const canary of Object.values(NETWORK_CANARIES)) {
        expect(serialized).not.toContain(canary);
      }
      const log = har.log as { readonly entries: readonly Record<string, unknown>[] };
      expect(log.entries.length).toBeGreaterThan(7);
      expect(log.entries.some((entry) => (entry["_orb"] as { readonly generation: number }).generation > 0)).toBe(true);
      expect(log.entries.some((entry) => (entry["_orb"] as { readonly pageIndex: number }).pageIndex === 1)).toBe(true);
      expect(log.entries.some((entry) => (entry["request"] as { readonly headers: readonly unknown[] }).headers.length > 0)).toBe(true);
      expect(log.entries.some((entry) => (entry["response"] as { readonly cookies: readonly unknown[] }).cookies.length >= 2)).toBe(true);
      expect(
        log.entries.some(
          (entry) =>
            (entry["response"] as { readonly headers: readonly { readonly name: string }[] }).headers.filter(
              (header) => header.name.toLowerCase() === "x-duplicate",
            ).length >= 2,
        ),
      ).toBe(true);
      expect(log.entries.some((entry) => typeof (entry["timings"] as { readonly wait?: unknown }).wait === "number")).toBe(true);
      expect(log.entries.some((entry) => JSON.stringify(entry).includes("body-too-large"))).toBe(true);
      expect(log.entries.some((entry) => (entry["_orb"] as { readonly failure: unknown }).failure !== null)).toBe(true);
      const records = await networkRecordsForPages(session.contexts.flatMap((context) => context.pages));
      expect(records.some((record) => record.pageIndex === 1)).toBe(true);
    });
  } finally {
    await server.close();
  }
});

test("shallow evidence and Network setup failure are refused without an artifact or summary fallback", async ({ scratch }) => {
  const shallow = {
    log: {
      entries: [
        {
          request: { method: "GET", url: "http://example.invalid", headers: [] },
          response: { status: 200, headers: [] },
          timings: { send: 0, wait: 0, receive: 0 },
        },
      ],
    },
  };
  expect(() => assertCompleteNetworkHar(shallow)).toThrow("INSTRUMENT ERROR");
  expect(() =>
    assertCompleteNetworkHar({
      log: { entries: [{ request: { headers: [] }, response: { headers: [] }, timings: { wait: 0 }, _orb: { requestId: "x" } }] },
    }),
  ).toThrow();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const absent = join(scratch, "must-not-exist.har");
  try {
    const dead = await context.newCDPSession(page);
    await dead.detach();
    await expect(wirePageNetwork(dead, page, { contextIndex: 0, pageIndex: 0, window: { value: 0 } })).rejects.toThrow();
    const live = await context.newCDPSession(page);
    await expect(wirePageNetwork(rejectNetworkEnable(live), page, { contextIndex: 0, pageIndex: 0, window: { value: 0 } })).rejects.toThrow(
      "planted Network.enable refusal",
    );
    await expect(writeNetworkHar({ contexts: [{ pages: [page] }] }, absent)).rejects.toThrow("CDP HAR population is empty");
    expect(existsSync(absent)).toBe(false);
  } finally {
    await browser.close();
  }
});

test("out-of-order ExtraInfo still correlates, while an unavailable selected body is explicit", async () => {
  const server = await loopbackServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const cdp = delayedExtraAndFailedBody(await context.newCDPSession(page));
    await wirePageNetwork(cdp, page, { contextIndex: 0, pageIndex: 0, window: { value: 3 } });
    selectNetworkBodies([page], "/post");
    await page.goto(`${server.base}/final`);
    await settle(page, 700);
    const records = await networkRecordsForPages([page]);
    const post = records.find((record) => record.request.url.includes("/post"));
    if (post === undefined) {
      throw new Error("selected /post request was absent from correlated CDP records");
    }
    expect(post.requestExtra).not.toBeNull();
    expect(post.responseExtra).not.toBeNull();
    expect(post.responseBody).toEqual({ text: null, base64Encoded: false, unavailableReason: "evicted", truncatedAt: null });
    expect(post.evidenceWindow).toBe(3);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("session export snapshots the CDP HAR without closing its browser owner", async ({ repoRoot, runCli, scratch }) => {
  const server = await loopbackServer();
  const name = `session-har-${process.pid}`;
  const home = join(scratch, "sessions");
  const env = Object.fromEntries([
    ["ORB_SNAP_SESSION_HOME", home],
    ["ORB_SESSION_CAP", "2"],
    ["ORB_SESSION_TTL_MIN", "1"],
  ]);
  const exportDir = join(repoRoot, "reports", "sessions", name);
  try {
    const boot = await runCli("snap", ["--session", name, "--base", server.base, "/start", "--request-body", "/post", "--no-shot"], {
      env,
      timeoutMs: scaledBudget(60_000, 4),
    });
    await expect(boot).toExitWith(EXIT.violations);
    const exported = await runCli("snap", ["--session-export", name], { env, timeoutMs: scaledBudget(60_000, 4) });
    await expect(exported).toExitWith(EXIT.clean);
    const exportIndex = JSON.parse(readFileSync(indexPath(exported.stdout), "utf8")) as {
      readonly identity: { readonly runId: string };
      readonly provenance: {
        readonly session: string | null;
        readonly sessionCall: number | null;
        readonly evidenceWindow: number | null;
        readonly sessionBinding: { readonly kind: string; readonly url: string } | null;
        readonly stage: {
          readonly mode: string;
          readonly state: string;
          readonly ownerCheckout: string | null;
          readonly band: number | null;
          readonly ref: string | null;
          readonly binding: { readonly kind: string; readonly url: string } | null;
          readonly failure: string | null;
        };
        readonly concurrency: readonly string[];
      };
    };
    const { concurrency, ...stableProvenance } = exportIndex.provenance;
    expect(stableProvenance).toEqual({
      session: name,
      sessionCall: 1,
      evidenceWindow: 1,
      sessionBinding: { kind: "base", url: server.base },
      stage: {
        mode: "session",
        state: "not-applicable",
        ownerCheckout: null,
        band: null,
        ref: null,
        binding: { kind: "base", url: server.base },
        failure: null,
      },
    });
    expect(concurrency.every((row) => /^\S+ \(pid \d+, started \d{4}-\d{2}-\d{2}T\S+Z\)$/u.test(row))).toBe(true);
    expect(concurrency.some((row) => row.startsWith(`${exportIndex.identity.runId} (`))).toBe(false);

    // A live sibling run is real provenance, not flake noise. Plant one through the production slot door
    // and prove export records it without ever listing the export run itself.
    const sibling = openRunSlot(repoRoot, "snap");
    try {
      const concurrentExport = await runCli("snap", ["--session-export", name], { env, timeoutMs: scaledBudget(60_000, 4) });
      await expect(concurrentExport).toExitWith(EXIT.clean);
      const concurrentIndex = JSON.parse(readFileSync(indexPath(concurrentExport.stdout), "utf8")) as {
        readonly identity: { readonly runId: string };
        readonly provenance: { readonly concurrency: readonly string[] };
      };
      expect(concurrentIndex.provenance.concurrency.some((row) => row.startsWith(`${sibling.runId} (`))).toBe(true);
      expect(concurrentIndex.provenance.concurrency.some((row) => row.startsWith(`${concurrentIndex.identity.runId} (`))).toBe(false);
    } finally {
      publishRunSlot(repoRoot, sibling, []);
    }
    const harPath = join(exportDir, "session.har");
    const harText = readFileSync(harPath, "utf8");
    expect(harText).not.toContain(SECRET);
    const requestsText = readFileSync(join(exportDir, "requests.json"), "utf8");
    expect(requestsText).not.toContain(SECRET);
    for (const canary of Object.values(NETWORK_CANARIES)) {
      expect(harText).not.toContain(canary);
      expect(requestsText).not.toContain(canary);
    }
    const parsedHar = JSON.parse(harText) as { readonly log?: { readonly _orbRetention?: unknown } };
    assertCompleteNetworkHar(parsedHar);
    expect(browserEvidenceRetentionBatchSchema.parse(parsedHar.log._orbRetention).rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: "browser-network-completed", complete: true })]),
    );
    const stillLive = await runCli("snap", ["--session", name, "--eval", "document.querySelector('h1')?.textContent", "--no-shot"], {
      env,
      timeoutMs: scaledBudget(60_000, 4),
    });
    await expect(stillLive).toExitWith(EXIT.clean);
    expect(stillLive.stdout).toContain("network plant");
  } finally {
    await runCli("snap", ["--session-close", name, "--force"], { env, timeoutMs: scaledBudget(30_000, 4) });
    rmSync(exportDir, { recursive: true, force: true });
    await server.close();
  }
});
