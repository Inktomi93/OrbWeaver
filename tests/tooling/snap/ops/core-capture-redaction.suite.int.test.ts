// The always-written core capture is a disk boundary: raw browser canaries must be gone before its
// findings reach run.json, the bounded end card, or a later browser-free report.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(120_000);
// THE CHILD HAD A SCALED CEILING AND THE TEST DID NOT (#1744) — the `_shared/browser.int.test.ts` class
// exactly: this arm drives a REAL Chromium through the CLI and then reads it back through a second CLI,
// while the TEST body ran under the parallel lane's 5s default. Green alone, `Test timed out in 5000ms`
// the moment any snap sibling is co-scheduled (measured 2026-09-05 at loadavg ~28, six snap files at
// --maxWorkers=4). One ceiling for both halves: the child budget IS the test's cost.
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

interface CoreCaptureRunIndex {
  readonly artifacts: readonly { readonly path: string; readonly relativePath: string }[];
  readonly findings: readonly { readonly what: string }[];
}

function indexPath(stdout: string): string {
  const match = /\bindex=(\/\S+\/run\.json)\b/u.exec(stdout)?.[1];
  if (match === undefined) {
    throw new Error(`Snap did not print an immutable run index: ${stdout}`);
  }
  return match;
}

test("query and page-error canaries cannot cross the core-capture writer or its derived readers", async ({ runCli, scratch }) => {
  const queryCanary = "CORE_CAPTURE_QUERY_CANARY_7f";
  const textCanary = "CORE_CAPTURE_TEXT_CANARY_8a";
  const file = join(scratch, "core-capture-redaction.html");
  await writeFile(
    file,
    `<!doctype html><html data-app-ready="settled"><body>
      <img src="http://127.0.0.1:1/missing.png?ordinary=kept&token=${queryCanary}">
      <script>setTimeout(() => { throw new Error("ordinary page failure token=${textCanary}"); }, 0)</script>
    </body></html>`,
  );
  const rawFixture = await readFile(file, "utf8");
  expect(rawFixture).toContain(queryCanary);
  expect(rawFixture).toContain(textCanary);

  const run = await runCli("snap", ["--file", file, "--no-shot", "--no-deadcss", "--no-failure-evidence"], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(run).toExitWith(EXIT.violations);
  const path = indexPath(run.stdout);
  const indexText = await readFile(path, "utf8");
  const index = JSON.parse(indexText) as CoreCaptureRunIndex;
  const coreArtifact = index.artifacts.find((artifact) => artifact.relativePath === "evidence/core-capture.json");
  expect(coreArtifact).toBeDefined();
  const coreText = await readFile(coreArtifact?.path ?? "missing-core-capture", "utf8");
  const core = JSON.parse(coreText) as {
    readonly populations: {
      readonly pageErrors: { readonly records: number };
      readonly failedRequests: { readonly records: number; readonly dropped: null; readonly complete: false; readonly basis: "latest-per-url" };
    };
    readonly pageErrors: readonly {
      readonly kind: "runtime" | "instrument";
      readonly name: string | null;
      readonly message: string;
      readonly stack: string | null;
    }[];
    readonly failedRequests: readonly { readonly method: string; readonly url: string; readonly status: number | null; readonly type: string }[];
  };
  const card = run.stdout.slice(run.stdout.lastIndexOf("RUN        "));
  const report = await runCli("snap", ["--report", path, "--problems"]);
  await expect(report).toExitWith(EXIT.clean);

  for (const output of [coreText, indexText, card, report.stdout]) {
    expect(output).not.toContain(queryCanary);
    expect(output).not.toContain(textCanary);
  }
  expect(coreText).toContain("[REDACTED]");
  expect(core.pageErrors.some((entry) => entry.kind === "runtime" && entry.message.includes("ordinary page failure"))).toBe(true);
  expect(core.failedRequests).toEqual([expect.objectContaining({ method: "GET", url: expect.stringContaining("ordinary=kept"), status: null, type: "image" })]);
  expect(core.populations.pageErrors.records).toBe(core.pageErrors.length);
  expect(core.populations.failedRequests).toEqual({ records: core.failedRequests.length, dropped: null, complete: false, basis: "latest-per-url" });
  expect(index.findings.some((finding) => finding.what.includes("ordinary page failure"))).toBe(true);
  expect(card).toContain("ordinary page failure");
  expect(report.stdout).toContain("ordinary page failure");
  expect(report.stdout).not.toContain("structured evidence is malformed");
});
