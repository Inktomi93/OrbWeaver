// @instrument-proof: a loopback page issues a document, stylesheet, and two named JSON fetches. The
// shipped request ring reports their stable order and available Playwright sizes(), retains whole eligible
// JSON only while a matching body filter is active,
// refuses CSS/oversize bodies by exact reason, survives from a named session's boot into a later call,
// and never adds another page listener when repeated run-arm instances are minted.
//
// @instrument-absence-proof: URL/body filters that match nothing print an explicit empty answer against
// the real request denominator, never a silent omission.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { HOST_POOL_ROOT_ENV } from "@orb/tooling/_shared/host-slots";
import { vi } from "vitest";
import { REQUEST_BODY_CAP_BYTES, REQUEST_RING_CAPACITY } from "../../../../../tooling/src/snap/index.ts";
import { resultPairsOf } from "../../../../../tooling/src/snap/lib/session-wire.ts";
import { beginRunArms } from "../../../../../tooling/src/snap/ops/arms/registry.ts";
import { parseSnapArgs } from "../../../../../tooling/src/snap/ops/parse.ts";
import { finishSession, launchSnapSession } from "../../../../../tooling/src/snap/ops/session.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(120_000);
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

const REQUEST_SECRET = "request-log-sig-canary";
const BODY_CANARY = "boot-json-body-canary";
const KNOWN_JSON = JSON.stringify({ value: BODY_CANARY });
const OVERSIZE_JSON = JSON.stringify({ value: "x".repeat(REQUEST_BODY_CAP_BYTES) });
const PAGE = `<!doctype html><html lang="en" data-app-ready="loading"><head><title>request log fixture</title>
<link rel="stylesheet" href="/known.css?sig=${REQUEST_SECRET}&X-Amz-Signature=${REQUEST_SECRET}"></head>
<body><main><h1>Requests</h1></main><script>
globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{}};
Promise.all([fetch('/known.json?token=${REQUEST_SECRET}'), fetch('/oversize.json')]).then(() => document.documentElement.dataset.appReady='settled');
</script></body></html>`;
const ARGS = ["--no-shot", "--no-failure-evidence", "--no-deadcss"];
const SESSION_CALL_ARGS = ["--no-shot", "--no-deadcss"];

async function requestServer(): Promise<{ readonly base: string; readonly close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/known.json") === true) {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(KNOWN_JSON);
      return;
    }
    if (request.url === "/later.json") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ value: "checkpoint-json-body" }));
      return;
    }
    if (request.url === "/oversize.json") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(OVERSIZE_JSON);
      return;
    }
    if (request.url?.startsWith("/known.css") === true) {
      response.writeHead(200, { "content-type": "text/css" });
      response.end("h1 { color: #111111; }\n");
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${String(address.port)}`,
    close: async () => await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error)))),
  };
}

test("every request is ordered under one denominator with measured sizes() evidence", async ({ runCli }) => {
  const server = await requestServer();
  try {
    const run = await runCli("snap", ["/", "--base", server.base, "--requests", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });
    expect(run.stdout).toContain("known.css");
    expect(run.stdout).toContain("known.json");
    expect(run.stdout).toContain("oversize.json");
    expect(run.stdout).toMatch(/--- REQUESTS \(4 of 4, no filter\) ---/u);
    expect(run.stdout).toContain("requests=4");
    expect(run.stdout).toContain("requests-shown=4");
    expect(run.stdout).toMatch(/size=(?:\d+|unknown)/u);
    const indexPath = /\bindex=(\S+\/run\.json)\b/u.exec(run.stdout)?.[1];
    expect(indexPath).toBeDefined();
    const index = JSON.parse(await readFile(indexPath as string, "utf8")) as {
      readonly resultPairs: readonly (readonly [string, string])[];
      readonly artifacts: readonly {
        readonly producer: string;
        readonly producerArm: string | null;
        readonly channel: string;
        readonly schema: string | null;
        readonly completeness: string;
        readonly records: number | null;
        readonly publishedPath: string | null;
        readonly scope: {
          readonly kind: string;
          readonly context: { readonly kind: string; readonly values: string };
          readonly page: { readonly kind: string; readonly values: string };
          readonly window: { readonly kind: string; readonly values: string };
        };
        readonly limits: readonly {
          readonly source: string;
          readonly complete: boolean;
          readonly policy: Readonly<Record<string, number>> | null;
          readonly events: readonly {
            readonly kind: string;
            readonly path: string;
            readonly original: number | null;
            readonly retained: number | null;
            readonly omitted: number | null;
          }[];
        }[];
      }[];
    };
    expect(index.resultPairs).toEqual(resultPairsOf(run.stdout.split("\n")));
    expect(index.resultPairs).toEqual(
      expect.arrayContaining([
        ["pages", "1"],
        ["requests", "4"],
      ]),
    );
    const artifact = index.artifacts.find((candidate) => candidate.channel === "request-log");
    expect(artifact).toMatchObject({
      producer: "requests",
      producerArm: "requests",
      channel: "request-log",
      schema: "snap-request-log-v1",
      completeness: "bounded",
      records: 4,
      scope: {
        kind: "scope-v1",
        context: { kind: "aggregate", values: "all" },
        page: { kind: "aggregate", values: "all" },
        window: { kind: "aggregate", values: "all" },
      },
      limits: [
        expect.objectContaining({
          source: "request-ring",
          complete: true,
          policy: { capacity: REQUEST_RING_CAPACITY },
          events: [{ kind: "ring-window", path: "$.requests", original: 4, retained: 4, omitted: 0 }],
        }),
      ],
    });
    expect(artifact?.publishedPath).not.toBeNull();
    await expect(readFile(artifact?.publishedPath as string, "utf8")).resolves.toContain('"requests"');
    const report = await runCli("snap", ["--report", indexPath as string, "--arm", "requests"]);
    expect(report.stdout).toContain("producer=requests arm=requests channel=request-log");
    expect(report.stdout).toContain("schema=snap-request-log-v1");
    expect(report.stdout).toContain("identity=c=all p=all w=all");
    expect(report.stdout).toContain("completeness=bounded");
    await expect(report).toExitWith(EXIT.clean);
    await expect(run).toExitWith(EXIT.clean);
  } finally {
    await server.close();
  }
});

test("a print filter narrows rows without narrowing the recorded denominator", async ({ runCli }) => {
  const server = await requestServer();
  try {
    const run = await runCli("snap", ["/", "--base", server.base, "--requests", "known.json", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });
    expect(run.stdout).toMatch(/--- REQUESTS \(1 of 4, filter "known.json"\) ---/u);
    expect(run.stdout).toContain("requests=4");
    expect(run.stdout).toContain("requests-shown=1");
    await expect(run).toExitWith(EXIT.clean);
  } finally {
    await server.close();
  }
});

test("eligible JSON is retained whole and the filed log redacts URL secrets", async ({ runCli }) => {
  const server = await requestServer();
  try {
    const run = await runCli("snap", ["/", "--base", server.base, "--request-body", "known.json", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });
    expect(run.stdout).toContain(BODY_CANARY);
    expect(run.stdout).toContain("content-type=application/json, complete");
    const logPath = /^ {2}log {10}(\S+)$/mu.exec(run.stdout)?.[1];
    expect(logPath).toBeDefined();
    const logText = await readFile(logPath as string, "utf8");
    expect(logText).not.toContain(REQUEST_SECRET);
    expect(logText).toContain("[REDACTED]");
    const log = JSON.parse(logText) as { total: number; requests: readonly { sizes: { responseBodySize: number } | null }[] };
    expect(log.total).toBe(4);
    expect(log.requests.every((entry) => entry.sizes === null || entry.sizes.responseBodySize >= 0)).toBe(true);
    await expect(run).toExitWith(EXIT.clean);
  } finally {
    await server.close();
  }
});

test("non-JSON and oversize JSON bodies are not retained and name the exact fence", async ({ runCli }) => {
  const server = await requestServer();
  try {
    const css = await runCli("snap", ["/", "--base", server.base, "--request-body", "known.css", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });
    expect(css.stdout).toContain("BODY NOT RETAINED reason=ineligible-content-type");
    expect(css.stdout).toContain("request-body=ineligible-content-type");
    await expect(css).toExitWith(EXIT.clean);

    const oversized = await runCli("snap", ["/", "--base", server.base, "--request-body", "oversize.json", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });
    expect(oversized.stdout).toContain("BODY NOT RETAINED reason=over-entry-cap");
    expect(oversized.stdout).toContain(`entry-cap=${String(REQUEST_BODY_CAP_BYTES)}`);
    expect(oversized.stdout).toContain("request-body=over-entry-cap");
    await expect(oversized).toExitWith(EXIT.clean);
  } finally {
    await server.close();
  }
});

test("no-match filters say zero against the observed population", async ({ runCli }) => {
  const server = await requestServer();
  try {
    const run = await runCli("snap", ["/", "--base", server.base, "--request-body", "no-such-resource", "--requests", "no-such-resource", ...ARGS], {
      timeoutMs: CLI_TIMEOUT_MS,
    });
    expect(run.stdout).toMatch(/--- REQUESTS \(0 of 4, filter "no-such-resource"\) ---/u);
    expect(run.stdout).toContain("no request in this run matched");
    expect(run.stdout).toContain("request-body=no-match");
    await expect(run).toExitWith(EXIT.clean);
  } finally {
    await server.close();
  }
});

test("a named session retains boot JSON only when the boot call activates its body filter", async ({ plantedTree, runCli }) => {
  const server = await requestServer();
  const root = await plantedTree({ "registry/.keep": "" });
  const home = join(root, "registry");
  const env = Object.fromEntries([
    ["ORB_SNAP_SESSION_HOME", home],
    [HOST_POOL_ROOT_ENV, join(root, "host-slots")],
    ["ORB_SESSION_CAP", "2"],
    ["ORB_SESSION_TTL_MIN", "1"],
  ]);
  const name = `request-ring-${String(process.pid)}`;
  try {
    const boot = await runCli("snap", ["--session", name, "--base", server.base, "/", "--request-body", "known.json", ...ARGS], {
      env,
      timeoutMs: CLI_TIMEOUT_MS,
    });
    await expect(boot).toExitWith(EXIT.clean);
    expect(boot.stdout).toContain(BODY_CANARY);

    const later = await runCli("snap", ["--session", name, "--request-body", "known.json", ...SESSION_CALL_ARGS], { env, timeoutMs: CLI_TIMEOUT_MS });
    await expect(later).toExitWith(EXIT.clean);
    expect(later.stdout).toContain(BODY_CANARY);
    expect(later.stdout).toContain("request-body=");
    expect(later.stdout).not.toContain("booting");

    const checkpoint = await runCli(
      "snap",
      [
        "--session",
        name,
        "--checkpoint",
        "--eval",
        "fetch('/later.json').then((response) => response.json())",
        "--request-body",
        "later.json",
        ...SESSION_CALL_ARGS,
      ],
      { env, timeoutMs: CLI_TIMEOUT_MS },
    );
    await expect(checkpoint).toExitWith(EXIT.clean);
    expect(checkpoint.stdout).toContain("checkpoint-json-body");
    expect(checkpoint.stdout).toMatch(/--- REQUESTS \(1 of 1, no filter\) ---/u);
    expect(checkpoint.stdout).not.toContain("known.json");
  } finally {
    await runCli("snap", ["--session-close", name], { env, timeoutMs: CLI_TIMEOUT_MS });
    await runCli("snap", ["--session-sweep"], { env, timeoutMs: CLI_TIMEOUT_MS });
    await server.close();
  }
});

test("minting repeated call arms does not add request listeners", async () => {
  const opts = parseSnapArgs(["--file", import.meta.filename, "--requests", ...ARGS]);
  const session = await launchSnapSession(opts);
  try {
    const listenerPage = session.page as typeof session.page & { readonly listenerCount: (event: string) => number };
    const before = ["request", "response", "requestfinished", "requestfailed"].map((event) => listenerPage.listenerCount(event));
    for (let call = 0; call < 8; call += 1) {
      beginRunArms(session, opts);
    }
    const after = ["request", "response", "requestfinished", "requestfailed"].map((event) => listenerPage.listenerCount(event));
    expect(before.every((count) => count > 0)).toBe(true);
    // The legacy failed-request capture has no requestfinished listener; this one is the ring's positive
    // attachment control, so an implementation that simply attaches nothing cannot pass on equality.
    expect(before[2]).toBe(1);
    expect(after).toEqual(before);
  } finally {
    await finishSession(session, false, "listener-growth", false);
  }
});
