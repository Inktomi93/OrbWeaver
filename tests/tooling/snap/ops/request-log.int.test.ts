// @instrument-proof: a fixture page whose requests are KNOWN by name — the document plus two named
// subresources — must be reported as an ordered log naming each one, with a request COUNT that is the
// denominator of everything printed; and `--request-body` must return the matching body, cut at the cap
// with the cut ACCOUNTED (`truncatedAt=<bytes>`), never silently shortened.
//
// @instrument-absence-proof: a `--requests` filter that matches nothing prints `0 of <total>` and a
// `--request-body` filter that matches nothing SAYS so — an empty answer about the page, never a silent
// omission that reads like "there was no body".
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { vi } from "vitest";
import { REQUEST_BODY_CAP_BYTES } from "../../../../tooling/src/snap/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(120_000);
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

const PAGE = `<!doctype html><html lang="en" data-app-ready="settled"><head><title>request log fixture</title>
<link rel="stylesheet" href="./known.css"><link rel="stylesheet" href="./oversize.css"></head>
<body><main><h1>Requests</h1></main><script src="./known.js"></script></body></html>`;
const KNOWN_CSS = "h1 { color: #111111; }\n";
const OVERSIZE_CSS = `/* ${"pad".repeat(REQUEST_BODY_CAP_BYTES)} */\nh1 { color: #222222; }\n`;

const ARGS = ["--no-shot", "--no-failure-evidence", "--no-deadcss"];

async function fixture(plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>): Promise<string> {
  const root = await plantedTree({
    "page.html": PAGE,
    "known.css": KNOWN_CSS,
    "oversize.css": OVERSIZE_CSS,
    "known.js": "globalThis.__known = 1;\n",
  });
  return join(root, "page.html");
}

test("every request the page issued is logged in order, by name, under one denominator", async ({ plantedTree, runCli }) => {
  const page = await fixture(plantedTree);

  const run = await runCli("snap", ["--file", page, "--requests", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });

  expect(run.stdout).toContain("known.css");
  expect(run.stdout).toContain("known.js");
  expect(run.stdout).toContain("page.html");
  // The document + three subresources: the denominator is real, and `shown` equals it with no filter.
  expect(run.stdout).toMatch(/--- REQUESTS \(4 of 4, no filter\) ---/u);
  expect(run.stdout).toContain("requests=4");
  expect(run.stdout).toContain("requests-shown=4");
  await expect(run).toExitWith(EXIT.clean);
});

test("the filter narrows what is PRINTED and never what was recorded", async ({ plantedTree, runCli }) => {
  const page = await fixture(plantedTree);

  const run = await runCli("snap", ["--file", page, "--requests", "known.css", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });

  expect(run.stdout).toMatch(/--- REQUESTS \(1 of 4, filter "known.css"\) ---/u);
  expect(run.stdout).toContain("requests=4");
  expect(run.stdout).toContain("requests-shown=1");
  expect(run.stdout).not.toContain("known.js");
  await expect(run).toExitWith(EXIT.clean);
});

test("a filter that matches nothing prints 0 of the real total, never an empty-looking run", async ({ plantedTree, runCli }) => {
  const page = await fixture(plantedTree);

  const run = await runCli("snap", ["--file", page, "--requests", "no-such-resource", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });

  expect(run.stdout).toMatch(/--- REQUESTS \(0 of 4, filter "no-such-resource"\) ---/u);
  expect(run.stdout).toContain("requests=4");
  await expect(run).toExitWith(EXIT.clean);
});

test("--request-body returns the matching body and files the complete log beside it", async ({ plantedTree, runCli }) => {
  const page = await fixture(plantedTree);

  const run = await runCli("snap", ["--file", page, "--request-body", "known.css", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });

  expect(run.stdout).toContain("h1 { color: #111111; }");
  expect(run.stdout).toContain("complete");
  // --request-body implies --requests, so the body is always readable next to the request that carried it.
  expect(run.stdout).toMatch(/--- REQUESTS \(4 of 4/u);
  const logPath = /^ {2}log {10}(\S+)$/mu.exec(run.stdout)?.[1];
  expect(logPath).toBeDefined();
  const log = JSON.parse(await readFile(logPath as string, "utf8")) as { total: number; requests: readonly { url: string }[] };
  expect(log.total).toBe(4);
  expect(log.requests.some((entry) => entry.url.endsWith("known.js"))).toBe(true);
  await expect(run).toExitWith(EXIT.clean);
});

test("a body over the cap is CUT AT A STATED BYTE, not silently shortened", async ({ plantedTree, runCli }) => {
  const page = await fixture(plantedTree);

  const run = await runCli("snap", ["--file", page, "--request-body", "oversize.css", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });

  expect(run.stdout).toContain(`truncatedAt=${REQUEST_BODY_CAP_BYTES}`);
  expect(run.stdout).toContain(`bytes=${Buffer.byteLength(OVERSIZE_CSS, "utf8")}`);
  await expect(run).toExitWith(EXIT.clean);
});

test("a body filter that matches nothing says so rather than printing nothing", async ({ plantedTree, runCli }) => {
  const page = await fixture(plantedTree);

  const run = await runCli("snap", ["--file", page, "--request-body", "no-such-resource", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });

  expect(run.stdout).toContain("no request in this run matched");
  expect(run.stdout).toContain("request-body=no-match");
  await expect(run).toExitWith(EXIT.clean);
});
