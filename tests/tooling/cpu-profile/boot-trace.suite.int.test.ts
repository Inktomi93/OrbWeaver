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
} {
  const primary = new Error("planted Tracing.start refusal");
  const detach = vi.fn(() => (detachFailure === undefined ? Promise.resolve() : Promise.reject(detachFailure)));
  const removeListener = vi.fn();
  // FABRICATION-OK: this is the deliberate third-party CDP boundary failure plant; beginBootTrace only reaches these five members before Tracing.start rejects.
  const cdp = {
    on: vi.fn(),
    once: vi.fn(),
    removeListener,
    detach,
    send: vi.fn((method: string) => {
      if (method === "Tracing.start") {
        return Promise.reject(primary);
      }
      return Promise.resolve({});
    }),
  } as unknown as CDPSession;
  // FABRICATION-OK: this page exposes only the real newCDPSession boundary because the planted start rejection prevents every later Page read.
  const page = { context: () => ({ newCDPSession: (): Promise<CDPSession> => Promise.resolve(cdp) }) } as unknown as Page;
  return { page, detach, removeListener };
}

test("beginBootTrace detaches exactly once and removes listeners when Tracing.start refuses", async () => {
  const planted = plantedStartFailure();
  await expect(beginBootTrace(planted.page)).rejects.toThrow("planted Tracing.start refusal");
  expect(planted.detach).toHaveBeenCalledTimes(1);
  expect(planted.removeListener).toHaveBeenCalledTimes(2);
});

test("beginBootTrace preserves the start and detach failures together", async () => {
  const cleanup = new Error("planted detach refusal");
  const planted = plantedStartFailure(cleanup);
  const failure = await beginBootTrace(planted.page).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toEqual([expect.objectContaining({ message: "planted Tracing.start refusal" }), cleanup]);
  expect(planted.detach).toHaveBeenCalledTimes(1);
  expect(planted.removeListener).toHaveBeenCalledTimes(2);
});

function resultValue(stdout: string, key: string): string {
  const prefix = `${key}=`;
  const token = stdout.split(/\s+/u).find((entry) => entry.startsWith(prefix));
  expect(token, `missing ${key} in:\n${stdout}`).toBeTypeOf("string");
  return String(token).slice(prefix.length);
}

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
      response.end(image);
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
    expect(JSON.parse(await readFile(report.receipt.rawTracePath, "utf8"))).toHaveProperty("traceEvents");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
  }
});
