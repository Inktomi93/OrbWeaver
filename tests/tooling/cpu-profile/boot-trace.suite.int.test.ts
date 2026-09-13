// @instrument-proof: this fixture plants every capability the one observed Chrome-MCP navigation trace
// returned: an image LCP, a stylesheet dependency chain, an oversized uncompressed document/image, and
// forced synchronous layout. The real perf-meter CLI must start tracing BEFORE its navigation, retain the
// raw trace, and publish all six observed trace-engine insight families. Starting after navigation loses
// the navigation insight set/LCP and must refuse rather than print partial parity.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { beginBootTrace } from "@orb/tooling/cpu-profile";
import type { CDPSession, Page } from "@playwright/test";
import sharp from "sharp";
import { vi } from "vitest";
import type { SnapRunArtifact } from "../../../tooling/src/snap/contract/run-index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(120_000, 4);
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

interface BootTraceReport {
  readonly contract: "snap-boot-trace-v1";
  readonly receipt: {
    readonly eventCount: number;
    readonly navigationId: string;
    readonly lcpMs: number;
    readonly insights: Record<string, { readonly state: string; readonly details: Record<string, unknown> }>;
    readonly rawTracePath: string;
  };
}

function plantedStartFailure(detachFailure?: Error): {
  readonly page: Page;
  readonly detach: ReturnType<typeof vi.fn>;
  readonly removeListener: ReturnType<typeof vi.fn>;
  readonly send: ReturnType<typeof vi.fn>;
} {
  const primary = new Error("planted Tracing.start refusal");
  const detach = vi.fn(() => (detachFailure === undefined ? Promise.resolve() : Promise.reject(detachFailure)));
  const removeListener = vi.fn();
  // This CDP boundary failure plant models the lifecycle calls reached around a Tracing.start rejection.
  const send = vi.fn((method: string) => {
    if (method === "Page.addScriptToEvaluateOnNewDocument") {
      return Promise.resolve({ identifier: "planted-boot-observer" });
    }
    if (method === "Tracing.start") {
      return Promise.reject(primary);
    }
    return Promise.resolve({});
  });
  const cdp = {
    on: vi.fn(),
    once: vi.fn(),
    removeListener,
    detach,
    send,
  } as unknown as CDPSession;
  // @orb-waive no-test-fabrication(unknown): this page exposes only the real newCDPSession boundary because the planted start rejection prevents every Page read. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const page = { context: () => ({ newCDPSession: (): Promise<CDPSession> => Promise.resolve(cdp) }) } as unknown as Page;
  return { page, detach, removeListener, send };
}

test("beginBootTrace detaches exactly once and removes listeners when Tracing.start refuses", async () => {
  const planted = plantedStartFailure();
  await expect(beginBootTrace(planted.page)).rejects.toThrow("planted Tracing.start refusal");
  expect(planted.detach).toHaveBeenCalledTimes(1);
  expect(planted.removeListener).toHaveBeenCalledTimes(2);
  expect(planted.send).toHaveBeenCalledWith("Page.enable");
  expect(planted.send).toHaveBeenCalledWith("Runtime.evaluate", expect.any(Object));
  expect(planted.send).toHaveBeenCalledWith("Page.removeScriptToEvaluateOnNewDocument", { identifier: "planted-boot-observer" });
});

test("beginBootTrace preserves the start and detach failures together", async () => {
  const cleanup = new Error("planted detach refusal");
  const planted = plantedStartFailure(cleanup);
  const failure = await beginBootTrace(planted.page).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toEqual([expect.objectContaining({ message: "planted Tracing.start refusal" }), cleanup]);
  expect(planted.detach).toHaveBeenCalledTimes(1);
  expect(planted.removeListener).toHaveBeenCalledTimes(2);
  expect(planted.send).toHaveBeenCalledWith("Page.enable");
  expect(planted.send).toHaveBeenCalledWith("Runtime.evaluate", expect.any(Object));
  expect(planted.send).toHaveBeenCalledWith("Page.removeScriptToEvaluateOnNewDocument", { identifier: "planted-boot-observer" });
});

test("beginBootTrace abort stops tracing and removes its browser instrumentation", async () => {
  let tracingComplete: (() => void) | undefined;
  const send = vi.fn((method: string) => {
    if (method === "Page.addScriptToEvaluateOnNewDocument") {
      return Promise.resolve({ identifier: "aborted-boot-observer" });
    }
    if (method === "Tracing.end") {
      tracingComplete?.();
    }
    return Promise.resolve({});
  });
  const detach = vi.fn(() => Promise.resolve());
  const cdp = {
    on: vi.fn(),
    once: vi.fn((event: string, listener: () => void) => {
      if (event === "Tracing.tracingComplete") {
        tracingComplete = listener;
      }
    }),
    removeListener: vi.fn(),
    detach,
    send,
  } as unknown as CDPSession;
  const page = { context: () => ({ newCDPSession: (): Promise<CDPSession> => Promise.resolve(cdp) }) } as unknown as Page;
  const active = await beginBootTrace(page);
  await active.abort();
  expect(send).toHaveBeenCalledWith("Tracing.end");
  expect(send).toHaveBeenCalledWith("Runtime.evaluate", expect.any(Object));
  expect(send).toHaveBeenCalledWith("Page.removeScriptToEvaluateOnNewDocument", { identifier: "aborted-boot-observer" });
  expect(detach).toHaveBeenCalledTimes(1);
});

test("beginBootTrace bounds a stalled presentation, retains raw events, and performs terminal cleanup", async ({ scratch }) => {
  vi.useFakeTimers();
  try {
    let tracingComplete: (() => void) | undefined;
    const send = vi.fn((method: string) => {
      if (method === "Page.addScriptToEvaluateOnNewDocument") {
        return Promise.resolve({ identifier: "stalled-boot-observer" });
      }
      if (method === "Tracing.end") {
        tracingComplete?.();
      }
      return Promise.resolve({});
    });
    const detach = vi.fn(() => Promise.resolve());
    const cdp = {
      on: vi.fn(),
      once: vi.fn((event: string, listener: () => void) => {
        if (event === "Tracing.tracingComplete") {
          tracingComplete = listener;
        }
      }),
      removeListener: vi.fn(),
      detach,
      send,
    } as unknown as CDPSession;
    const page = {
      context: () => ({ newCDPSession: (): Promise<CDPSession> => Promise.resolve(cdp) }),
      waitForLoadState: vi.fn(() => Promise.resolve()),
      evaluate: vi.fn(() => new Promise<never>(() => undefined)),
    } as unknown as Page;
    const rawTracePath = join(scratch, "stalled-presentation.trace.json");
    const active = await beginBootTrace(page);
    const finishing = active.finish(rawTracePath);
    await vi.advanceTimersByTimeAsync(600_001);
    await expect(finishing).rejects.toThrow("ORB-LOAD-KILL: boot trace did not reach its post-load presentation boundary");
    expect(JSON.parse(await readFile(rawTracePath, "utf8"))).toEqual({ traceEvents: [] });
    expect(send).toHaveBeenCalledWith("Tracing.end");
    expect(send).toHaveBeenCalledWith("Runtime.evaluate", expect.any(Object));
    expect(send).toHaveBeenCalledWith("Page.removeScriptToEvaluateOnNewDocument", { identifier: "stalled-boot-observer" });
    expect(detach).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

for (const failureMode of ["completion", "presentation-and-completion", "end-command"] as const) {
  test(`beginBootTrace retains collected events when ${failureMode} stalls`, async ({ scratch }) => {
    vi.useFakeTimers();
    try {
      const event = { name: "retained-before-stop", ts: 1 };
      const send = vi.fn((method: string) => {
        if (method === "Page.addScriptToEvaluateOnNewDocument") {
          return Promise.resolve({ identifier: "stop-failure-observer" });
        }
        if (method === "Tracing.end" && failureMode === "end-command") {
          return new Promise<never>(() => undefined);
        }
        return Promise.resolve({});
      });
      const detach = vi.fn(() => Promise.resolve());
      // @orb-waive no-test-fabrication(unknown): deliberately stall the third-party CDP stop boundary after delivering one real-shaped event. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      const cdp = {
        on: vi.fn((_name: string, collect: (payload: { value: unknown[] }) => void) => collect({ value: [event] })),
        once: vi.fn(),
        removeListener: vi.fn(),
        detach,
        send,
      } as unknown as CDPSession;
      const page = {
        context: () => ({ newCDPSession: (): Promise<CDPSession> => Promise.resolve(cdp) }),
        waitForLoadState: vi.fn(() => Promise.resolve()),
        evaluate: vi.fn(() =>
          failureMode === "presentation-and-completion" ? new Promise<never>(() => undefined) : Promise.resolve({ count: 1, latestStartTime: 1 }),
        ),
      } as unknown as Page;
      const rawTracePath = join(scratch, `${failureMode}.trace.json`);
      const active = await beginBootTrace(page);
      let failure: unknown;
      let settled = false;
      const retained = vi.fn(() => (failureMode === "completion" ? Promise.reject(new Error("planted metadata failure")) : Promise.resolve()));
      const finishing = active
        .finish(rawTracePath, retained)
        .catch((error: unknown) => {
          failure = error;
        })
        .finally(() => {
          settled = true;
        });
      await vi.advanceTimersByTimeAsync(1_200_002);
      // Flush filesystem I/O without waiting indefinitely on a broken stop implementation.
      vi.useRealTimers();
      await expect.poll(() => settled, { timeout: scaledBudget(5000) }).toBe(true);
      await finishing;
      expect(JSON.parse(await readFile(rawTracePath, "utf8"))).toEqual({ traceEvents: [event] });
      const messages = failureMode === "presentation-and-completion" ? ["ORB-LOAD-KILL", "Chromium did not finish"] : ["Chromium did not finish"];
      if (failureMode === "completion") {
        messages.push("planted metadata failure");
      }
      const errors = failure instanceof AggregateError ? failure.errors : [failure];
      expect(errors).toEqual(messages.map((message) => expect.objectContaining({ message: expect.stringContaining(message) })));
      expect(retained).toHaveBeenCalledExactlyOnceWith({ complete: false, eventCount: 1 });
      expect(detach).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith("Page.removeScriptToEvaluateOnNewDocument", { identifier: "stop-failure-observer" });
    } finally {
      vi.useRealTimers();
    }
  });
}

function resultValue(stdout: string, key: string): string {
  const prefix = `${key}=`;
  const token = stdout.split(/\s+/u).find((entry) => entry.startsWith(prefix));
  expect(token, `missing ${key} in:\n${stdout}`).toBeTypeOf("string");
  return String(token).slice(prefix.length);
}

async function rawTraceDeclaration(stdout: string): Promise<SnapRunArtifact> {
  const index = JSON.parse(await readFile(resultValue(stdout, "index"), "utf8")) as { readonly artifacts: readonly SnapRunArtifact[] };
  const artifact = index.artifacts.find(({ channel }) => channel === "chromium-trace");
  if (artifact === undefined) {
    throw new Error("Snap run index omitted the retained Chromium trace");
  }
  return artifact;
}

test("Snap marks retained raw trace incomplete when the CDP stop command refuses", async ({ runCli, plantedTree }) => {
  const root = await plantedTree({
    "page.html":
      '<!doctype html><html data-app-ready="settled"><head><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128})};</script></head><body><p>boot candidate</p></body></html>',
  });
  const result = await runCli("snap", ["--file", join(root, "page.html"), "--boot-trace", "--no-shot", "--no-deadcss", "--no-failure-evidence"], {
    timeoutMs: CLI_TIMEOUT_MS,
    env: { ["ORB_PROBE_TEST_CDP_FAULT"]: "Tracing.end" },
  });
  await expect(result).toExitWith(2);
  expect(result.stdout).toContain("planted CDP fault: Tracing.end");
  expect(result.stdout).toContain("boot-trace=REFUSED");
  const artifact = await rawTraceDeclaration(result.stdout);
  const raw = JSON.parse(await readFile(artifact.path, "utf8")) as { readonly traceEvents: readonly unknown[] };
  expect(artifact.completeness).toBe("unknown");
  expect(artifact.completenessDetail).toContain("partial");
  expect(artifact.records).toBe(raw.traceEvents.length);
});

function plantedImage(): Promise<Buffer> {
  const width = 1200;
  const height = 1200;
  const pixels = Buffer.alloc(width * height * 3);
  for (let offset = 0; offset < pixels.length; offset += 3) {
    const pixel = offset / 3;
    pixels[offset] = pixel % 251;
    pixels[offset + 1] = Math.floor(pixel / width) % 239;
    pixels[offset + 2] = Math.floor(pixel / 17) % 233;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

function document(): string {
  const documentPadding = "trace-document-padding-".repeat(500);
  const layoutChildren = "<span>layout</span>".repeat(300);
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>boot trace plant</title>
<link rel="stylesheet" href="/root.css"><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128})};</script></head>
<!-- ${documentPadding} -->
<body><main><div id="layout-plant">${layoutChildren}</div>
<img id="hero" src="/hero.png" width="300" height="300" alt="planted LCP"></main>
<script>
  const plant = document.querySelector('#layout-plant');
  for (let index = 0; index < 1000; index += 1) {
    plant.style.width = index % 2 === 0 ? '319px' : '320px';
    void plant.offsetWidth;
  }
</script></body></html>`;
}

test("Snap --boot-trace captures navigation and retains every observed insight family", async ({ runCli, scratch }) => {
  const image = await plantedImage();
  const server = createServer((request, response) => {
    if (request.url === "/hero.png") {
      response.writeHead(200, { "content-type": "image/png", "content-length": image.length });
      setTimeout(() => response.end(image), 100);
      return;
    }
    if (request.url === "/root.css") {
      response.writeHead(200, { "content-type": "text/css" });
      response.end('@import url("/leaf.css"); body { margin: 0; }');
      return;
    }
    if (request.url === "/leaf.css") {
      response.writeHead(200, { "content-type": "text/css" });
      response.end("#layout-plant { height: 20px; overflow: hidden; } #hero { display: block; object-fit: cover; }");
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(document());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("fixture server did not bind a TCP port");
    }
    const out = join(scratch, "boot-trace-proof");
    const result = await runCli(
      "snap",
      ["/", "--base", `http://127.0.0.1:${address.port}`, "--boot-trace", "--out", out, "--no-shot", "--no-deadcss", "--no-failure-evidence"],
      { timeoutMs: CLI_TIMEOUT_MS },
    );

    await expect(result).toExitWith(0);
    expect(result.stdout).toContain("boot-trace=observed");
    expect(result.stdout).toContain("perf=off");
    expect(result.stdout).not.toContain("breach-steps=");
    expect(result.stdout).toContain("boot-insights=6");

    const report = JSON.parse(await readFile(resultValue(result.stdout, "boot-trace-artifact"), "utf8")) as BootTraceReport;
    expect(report.contract).toBe("snap-boot-trace-v1");
    expect(report.receipt.eventCount).toBeGreaterThan(0);
    expect(report.receipt.navigationId).not.toBe("");
    expect(report.receipt.lcpMs).toBeGreaterThan(0);
    expect(report.receipt.insights["LCPBreakdown"]?.details["hasImageRequest"]).toBe(true);
    expect(Object.keys(report.receipt.insights).sort()).toEqual(
      ["CLSCulprits", "DocumentLatency", "ForcedReflow", "ImageDelivery", "LCPBreakdown", "NetworkDependencyTree"].sort(),
    );
    const imageDelivery = report.receipt.insights["ImageDelivery"];
    const forcedReflow = report.receipt.insights["ForcedReflow"];
    expect(imageDelivery?.state, JSON.stringify(imageDelivery?.details)).toBe("fail");
    expect(forcedReflow?.state, JSON.stringify(forcedReflow?.details)).toBe("fail");
    expect(Number(report.receipt.insights["NetworkDependencyTree"]?.details["roots"])).toBeGreaterThan(0);
    expect(Number(imageDelivery?.details["wastedBytes"])).toBeGreaterThan(0);
    expect(Number(report.receipt.insights["DocumentLatency"]?.details["uncompressedBytes"])).toBeGreaterThan(0);
    expect(Number(forcedReflow?.details["totalReflowMs"])).toBeGreaterThan(0);
    expect(Object.keys(report.receipt.insights["LCPBreakdown"]?.details["subpartsMs"] as object)).toContain("ttfb");
    const raw = JSON.parse(await readFile(report.receipt.rawTracePath, "utf8")) as { readonly traceEvents: readonly { readonly name?: string }[] };
    expect(raw).toHaveProperty("traceEvents");
    expect(raw.traceEvents.some(({ name }) => name === "LargestTextPaint::Candidate")).toBe(true);
    expect(raw.traceEvents.some(({ name }) => name === "LargestImagePaint::Candidate")).toBe(true);
    expect(await rawTraceDeclaration(result.stdout)).toMatchObject({ completeness: "complete", records: raw.traceEvents.length });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
  }
});

test("Snap --boot-trace refuses a post-load presented document with no LCP candidate and retains its raw trace", async ({ runCli, scratch, repoRoot }) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(
      '<!doctype html><html data-app-ready="settled"><head><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128})};</script></head><body></body></html>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("fixture server did not bind a TCP port");
    }
    const result = await runCli(
      "snap",
      [
        "/",
        "--base",
        `http://127.0.0.1:${address.port}`,
        "--boot-trace",
        "--out",
        join(scratch, "no-lcp"),
        "--no-shot",
        "--no-deadcss",
        "--no-failure-evidence",
      ],
      { timeoutMs: CLI_TIMEOUT_MS },
    );
    await expect(result).toExitWith(2);
    expect(result.stdout).toContain("post-load presentation boundary without a positive LCP candidate");
    expect(result.stdout).toContain("boot-trace=REFUSED");
    const slot = /^run slot\s+(\S+)$/mu.exec(result.stdout)?.[1];
    expect(slot, result.stdout).toBeTypeOf("string");
    const raw = JSON.parse(await readFile(join(repoRoot, String(slot), "boot-trace", "snap-boot.trace.json"), "utf8")) as {
      readonly traceEvents: readonly unknown[];
    };
    expect(raw.traceEvents.length).toBeGreaterThan(0);
    expect(await rawTraceDeclaration(result.stdout)).toMatchObject({ completeness: "complete", records: raw.traceEvents.length });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
  }
});
