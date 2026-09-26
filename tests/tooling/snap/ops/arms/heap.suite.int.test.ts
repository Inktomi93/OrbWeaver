// @instrument-proof: a retained named object and detached DOM node must survive forced GC, appear in the
// parsed comparison, and expose a bounded retaining path plus dominator chain through Snap's real page.
//
// @instrument-absence-proof: a released clean twin and a non-empty ordinary heap prove that zero detached
// growth is measured rather than blind; missing/malformed/incompatible evidence must refuse, never pass.
import { copyFile, readFile, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { HOST_POOL_ROOT_ENV } from "@orb/tooling/_shared/host-slots";
import type { HeapComparisonReceipt, HeapRetainerReceipt, HeapSnapshotReceipt, SnapRunIndex } from "@orb/tooling/snap";
import {
  assertComparableHeapSnapshots,
  heapBrowserContextIdSchema,
  heapCaptureSessionIdSchema,
  heapTargetIdSchema,
  loadHeapSnapshotReceipt,
  withHeapDevToolsParser,
} from "@orb/tooling/snap";
import type { Page } from "@playwright/test";
import { vi } from "vitest";
import { captureRawHeap } from "../../../../../tooling/src/snap/ops/heap-capture.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(180_000);
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

const QUIET = ["--no-shot", "--no-deadcss", "--no-failure-evidence"];
const CALL_QUIET = ["--no-shot", "--no-deadcss"];
const SESSION_HOME_ENV = "ORB_SNAP_SESSION_HOME";
const SESSION_CAP_ENV = "ORB_SESSION_CAP";
const SESSION_TTL_ENV = "ORB_SESSION_TTL_MIN";
const HEAP_BUDGET_CONTROL = `new Promise((resolve) => {
  setTimeout(() => resolve("heap-budget-control"), 5500);
})`;
const FIXTURE = `<!doctype html>
<html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>heap fixture</title></head>
<body><main><button id="grow">grow</button><button id="release">release</button></main>
<script>
class OrbHeapLeak {
  constructor(node, seed) {
    this.node = node;
    this.payload = Array.from({ length: 5000 }, (_, index) => "orb-heap-" + seed + "-" + index + "-" + "x".repeat(32));
  }
}
globalThis.orbHeapLeaks = [];
document.querySelector("#grow").addEventListener("click", () => {
  for (let index = 0; index < 4; index += 1) {
    const node = document.createElement("article");
    node.className = "heap-detached-plant";
    node.textContent = "detached plant " + index;
    document.body.append(node);
    node.remove();
    globalThis.orbHeapLeaks.push(new OrbHeapLeak(node, index));
  }
});
document.querySelector("#release").addEventListener("click", () => { globalThis.orbHeapLeaks = []; });
globalThis.__orb = { consoleErrors: () => ({ records: [], dropped: 0, cap: 128 }), resetEvidence: () => {} };
</script></body></html>`;

function readJson<T>(path: string): Promise<T> {
  return readFile(path, "utf8").then((source) => JSON.parse(source) as T);
}

function indexPath(stdout: string): string {
  const match = /RESULT snap exit=\d+ index=(\S+)/u.exec(stdout);
  expect(match?.[1], `missing final Snap index in:\n${stdout}`).toBeTypeOf("string");
  return match?.[1] as string;
}

function artifact(index: SnapRunIndex, schema: string): string {
  const found = index.artifacts.find((row) => row.schema === schema)?.path;
  expect(found, `missing ${schema} in ${JSON.stringify(index.artifacts)}`).toBeTypeOf("string");
  return found as string;
}

test("the heap vocabulary is one derived arm family", async () => {
  const { parseSnapArgs } = await import("../../../../../tooling/src/snap/index.ts");
  const parsed = parseSnapArgs(["/", "--heap", "before", "--heap", "after", "--heap-compare", "before=after", "--heap-retainers", "after=detached"]);

  expect(parsed.errors).toEqual([]);
  expect(parsed.heapCaptures).toEqual([
    { label: "before", page: 0 },
    { label: "after", page: 0 },
  ]);
  expect(parsed.heapComparisons).toEqual([{ left: "before", right: "after", page: 0 }]);
  expect(parsed.heapRetainers).toEqual([{ snapshot: "after", selector: { kind: "detached" }, page: 0 }]);
  expect(parseSnapArgs(["/", "--heap-snapshot", "x"]).errors).toContain("unknown flag --heap-snapshot");
  expect(parseSnapArgs(["/", "--memory-diff", "a=b"]).errors).toContain("unknown flag --memory-diff");
});

test("heap provenance IDs retain their wire bytes and reject absent identities", () => {
  expect(heapCaptureSessionIdSchema.parse("session-1")).toBe("session-1");
  expect(heapTargetIdSchema.parse("target-1")).toBe("target-1");
  expect(heapBrowserContextIdSchema.parse("context-1")).toBe("context-1");
  expect(heapCaptureSessionIdSchema.safeParse("").success).toBe(false);
  expect(heapTargetIdSchema.safeParse("").success).toBe(false);
  expect(heapBrowserContextIdSchema.safeParse("").success).toBe(false);
});

test("a named session preserves exact-page labels, reports retained growth/retainers, and stays usable", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "heap.html": FIXTURE, "sessions/.keep": "" });
  const fixture = join(root, "heap.html");
  const env = { [SESSION_HOME_ENV]: join(root, "sessions"), [SESSION_CAP_ENV]: "1", [SESSION_TTL_ENV]: "10", [HOST_POOL_ROOT_ENV]: join(root, "host-slots") };
  const session = "heap-arm";
  try {
    const before = await runCli("snap", ["--session", session, "--file", fixture, "--heap", "before", ...QUIET], {
      env,
      timeoutMs: CLI_TIMEOUT_MS,
    });
    await expect(before).toExitWith(EXIT.clean);
    expect(before.stderr).toBe("");
    expect(before.stdout).toContain("HEAP         before");

    const leaked = await runCli(
      "snap",
      [
        "--session",
        session,
        "--eval",
        HEAP_BUDGET_CONTROL,
        "--click",
        "#grow",
        "--heap",
        "after",
        "--heap-compare",
        "before=after",
        "--heap-retainers",
        "after=detached",
        ...CALL_QUIET,
      ],
      { env, timeoutMs: CLI_TIMEOUT_MS },
    );
    // Heap findings are diagnostic facts, not an arbitrary universal memory budget gate.
    expect(leaked.stdout, leaked.stdout).not.toContain("HEAP REFUSED");
    expect(leaked.stdout, leaked.stdout).toContain("heap=measured");
    const leakedIndexPath = indexPath(leaked.stdout);
    const leakedIndex = await readJson<SnapRunIndex>(leakedIndexPath);
    expect(leakedIndex.resultPairs, JSON.stringify(leakedIndex, null, 2)).toContainEqual(["heap", "measured"]);
    await expect(leaked).toExitWith(EXIT.clean);
    expect(leaked.stderr).toBe("");
    expect(leaked.stdout).toContain("HEAP COMPARE before->after");
    expect(leaked.stdout).toContain("HEAP RETAIN  after node=@");
    expect(leaked.stdout).toContain("heap=measured");
    expect(leaked.stdout.trimEnd().split("\n").at(-1)).toMatch(/^RESULT snap exit=0 index=/u);

    expect(leakedIndex.resultPairs).toContainEqual(["heap-comparisons", "1"]);
    expect(leakedIndex.verdict.arms.find((row) => row.arm === "heap")?.state).toBe("passed");
    const summary = await readJson<HeapSnapshotReceipt>(artifact(leakedIndex, "snap-heap-snapshot-v1"));
    expect(summary.identity.parser).toEqual({ package: "chrome-devtools-mcp", version: "1.8.0", engine: "HeapSnapshotManager" });
    expect(summary.population.nodes).toBeGreaterThan(0);
    expect(summary.population.objects).toBeGreaterThan(0);
    expect(summary.parserProblems.total).toBeGreaterThan(0);
    expect(summary.parserProblems.omitted).toBeGreaterThan(0);
    expect(summary.detached.count).toBeGreaterThan(0);
    const comparison = await readJson<HeapComparisonReceipt>(artifact(leakedIndex, "snap-heap-comparison-v1"));
    expect(comparison.deltas.detachedCount).toBeGreaterThan(0);
    expect(comparison.problems.some((row) => row.metric === "class-growth" && row.subject === "OrbHeapLeak")).toBe(true);
    expect(comparison.problems.some((row) => row.metric === "detached-dom-growth")).toBe(true);
    const retainers = await readJson<HeapRetainerReceipt>(artifact(leakedIndex, "snap-heap-retainers-v1"));
    expect(retainers.selected.detached).toBe(true);
    expect(retainers.paths.length).toBeGreaterThan(0);
    expect(retainers.dominators.length).toBeGreaterThan(1);
    expect(retainers.candidates).toBeGreaterThan(0);

    const report = await runCli("snap", ["--report", leakedIndexPath, "--problems", "--arm", "heap"], { env, timeoutMs: CLI_TIMEOUT_MS });
    await expect(report).toExitWith(EXIT.clean);
    expect(report.stdout).toContain("FINDING      error | detached-dom-growth");
    expect(report.stdout).not.toContain("PROBLEM      arm=heap");
    expect(report.stdout).toContain("schema=snap-heap-comparison-v1");

    const rawReport = await runCli("snap", ["--report", leakedIndexPath, "--all", "--arm", "heap"], { env, timeoutMs: CLI_TIMEOUT_MS });
    await expect(rawReport).toExitWith(EXIT.clean);
    expect(rawReport.stdout).toContain("PROBLEM      arm=heap");

    const released = await runCli(
      "snap",
      ["--session", session, "--click", "#release", "--heap", "released", "--heap-compare", "before=released", ...CALL_QUIET],
      {
        env,
        timeoutMs: CLI_TIMEOUT_MS,
      },
    );
    await expect(released).toExitWith(EXIT.clean);
    const releasedIndex = await readJson<SnapRunIndex>(indexPath(released.stdout));
    const cleanComparison = await readJson<HeapComparisonReceipt>(artifact(releasedIndex, "snap-heap-comparison-v1"));
    expect(cleanComparison.classes.rows.some((row) => row.className === "OrbHeapLeak" && row.countDelta > 0)).toBe(false);
    expect(cleanComparison.classes.rows.some((row) => row.className === "Detached <article>" && row.countDelta > 0)).toBe(false);
    expect(cleanComparison.problems.some((row) => row.subject === "OrbHeapLeak")).toBe(false);

    const missing = await runCli("snap", ["--session", session, "--heap-compare", "missing=released", ...CALL_QUIET], { env, timeoutMs: CLI_TIMEOUT_MS });
    await expect(missing).toExitWith(EXIT.toolError);
    expect(missing.stdout).toContain('unknown heap label "missing"');
    expect(missing.stdout).toContain("heap=REFUSED");

    const usable = await runCli("snap", ["--session", session, "--eval", "document.title", ...CALL_QUIET], { env, timeoutMs: CLI_TIMEOUT_MS });
    await expect(usable).toExitWith(EXIT.clean);
    expect(usable.stdout).toContain('"heap fixture"');

    const raw = summary.identity.rawPath;
    const truncated = join(root, "truncated.heapsnapshot");
    await copyFile(raw, truncated);
    await truncate(truncated, 2048);
    await expect(withHeapDevToolsParser(async (parser) => await parser.snapshot(truncated))).rejects.toThrow("HEAP PARSER REFUSED");

    const mismatchedRaw = join(root, "hash-mismatch.heapsnapshot");
    await copyFile(raw, mismatchedRaw);
    const mismatchedSidecar = `${mismatchedRaw}.json`;
    await writeFile(
      mismatchedSidecar,
      `${JSON.stringify({ ...summary, identity: { ...summary.identity, rawPath: mismatchedRaw, summaryPath: mismatchedSidecar } })}\n`,
      "utf8",
    );
    await truncate(mismatchedRaw, summary.identity.bytes - 1);
    await expect(loadHeapSnapshotReceipt(mismatchedRaw)).rejects.toThrow("raw snapshot bytes disagree");
    expect(() =>
      assertComparableHeapSnapshots(summary, {
        ...summary,
        identity: { ...summary.identity, captureSessionId: heapCaptureSessionIdSchema.parse("another-browser-context") },
      }),
    ).toThrow("incompatible provenance (capture-session)");
  } finally {
    await runCli("snap", ["--session-close", session, "--force"], { env, timeoutMs: CLI_TIMEOUT_MS });
  }
});

test("scenario checkpoints share the page-arm label owner without a scenario-only heap path", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "heap.html": FIXTURE });
  const fixture = join(root, "heap.html");
  const scenarioPath = join(root, "heap-scenario.json");
  await writeFile(
    scenarioPath,
    `${JSON.stringify({
      name: "heap-scenario",
      checkpoints: [
        { name: "before", args: ["--file", fixture, "--heap", "scenario-before", ...CALL_QUIET] },
        {
          name: "after",
          args: ["--file", fixture, "--click", "#grow", "--heap", "scenario-after", "--heap-compare", "scenario-before=scenario-after", ...CALL_QUIET],
        },
      ],
    })}\n`,
    "utf8",
  );
  const run = await runCli("snap", ["--scenario", scenarioPath, ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });

  await expect(run).toExitWith(EXIT.clean);
  expect(run.stderr).toBe("");
  expect(run.stdout).toContain("HEAP         scenario-before");
  expect(run.stdout).toContain("HEAP         scenario-after");
  expect(run.stdout).toContain("HEAP COMPARE scenario-before->scenario-after");
  const index = await readJson<SnapRunIndex>(indexPath(run.stdout));
  const comparison = await readJson<HeapComparisonReceipt>(artifact(index, "snap-heap-comparison-v1"));
  expect(comparison.deltas.detachedCount).toBeGreaterThan(0);
});

test("capture keeps the primary, disable, and detach failures without closing the page context", async ({ scratch }) => {
  const send = vi.fn((method: string): Promise<unknown> => {
    if (method === "Browser.getVersion") {
      return Promise.resolve({ product: "Chrome/149", protocolVersion: "1.3", revision: "r", userAgent: "ua", jsVersion: "v8" });
    }
    if (method === "Target.getTargetInfo") {
      return Promise.resolve({ targetInfo: { targetId: "target", browserContextId: "context", url: "file:///fixture", title: "fixture" } });
    }
    if (method === "HeapProfiler.takeHeapSnapshot") {
      return Promise.reject(new Error("primary take failure"));
    }
    if (method === "HeapProfiler.disable") {
      return Promise.reject(new Error("disable failure"));
    }
    return Promise.resolve({});
  });
  const detach = vi.fn((): Promise<void> => Promise.reject(new Error("detach failure")));
  const cdp = { send, on: vi.fn(), off: vi.fn(), detach };
  const context = { newCDPSession: vi.fn(async () => cdp) };
  // @orb-waive no-test-fabrication(unknown): deliberate partial Playwright Page double plants CDP primary/cleanup failures; real-browser tests above own the success contract. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const page = { context: () => context } as unknown as Page;

  let caught: unknown;
  try {
    await captureRawHeap(page, join(scratch, "failed.heapsnapshot"));
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AggregateError);
  const messages = (caught as AggregateError).errors.map((error) => String((error as Error).message));
  expect(messages).toEqual(expect.arrayContaining(["primary take failure", "disable failure", "detach failure"]));
  expect(detach).toHaveBeenCalledTimes(1);
  expect(context.newCDPSession).toHaveBeenCalledTimes(1);
});
