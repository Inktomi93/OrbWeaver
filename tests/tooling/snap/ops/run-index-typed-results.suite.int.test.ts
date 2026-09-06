// #1301: RESULT pairs remain transcript evidence; typed results and discriminated scopes are separate.
// @instrument-proof: current writer facts/scopes round-trip through the strict browser-free reader and a
// planted malformed schema/scope refuses instead of falling back to RESULT parsing.
// @instrument-absence-proof: a pair-only legacy v1 index remains explicitly legacy; current results are
// required and a missing typed population cannot read as a clean structured verdict.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  aggregateDimension,
  aggregateScope,
  artifactRef,
  contextIndex,
  exactScope,
  factBatchId,
  instrumentLegacyScopeSchema,
  notApplicableScope,
  pageIndex,
  scopeMatches,
  scopeV1,
} from "../../../../tooling/src/_shared/artifact-scope.ts";
import { BROWSER_EVIDENCE_SOURCES, retentionBatch } from "../../../../tooling/src/_shared/browser-evidence-ring.ts";
import { snapRatePostureIdSchema } from "../../../../tooling/src/snap/contract/rate-posture.ts";
import type { SnapRunFactBatch } from "../../../../tooling/src/snap/contract/run-facts.ts";
import { parseSnapRunResults, SNAP_RUN_RESULTS_VERSION, snapArmFact } from "../../../../tooling/src/snap/contract/run-facts.ts";
import type { SnapReportQuery, SnapRunArtifact } from "../../../../tooling/src/snap/contract/run-index.ts";
import { artifactMatches } from "../../../../tooling/src/snap/lib/run-report-query.ts";
import { readSessionEvent, resultPairsOf } from "../../../../tooling/src/snap/lib/session-wire.ts";
import { disabledRunArmFailures } from "../../../../tooling/src/snap/ops/arms/registry.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { completeSnapRun, registerSnapDiagnosticCompleteness, registerSnapFactBatch } from "../../../../tooling/src/snap/ops/run-bundle.ts";
import { readSnapRunIndex } from "../../../../tooling/src/snap/ops/run-report.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// ONE CEILING FOR THE CHILD AND FOR THE TEST (#1744): the two cases below each drive a REAL browser
// through the CLI, and their bodies ran under the parallel lane's 5s default — measured 4.98s on a
// whole-directory `test:scoped tests/tooling/snap --maxWorkers=4` (2026-09-05), i.e. inside 20ms of a
// timeout that would have read as a defect in the run-index writer.
const CLI_TIMEOUT_MS = scaledBudget(120_000);
const ZERO_FAILURES = {
  navigation: 0,
  navActions: 0,
  pageErrors: 0,
  failedRequests: 0,
  steps: 0,
  contrast: 0,
  aria: 0,
  map: 0,
  eval: 0,
  watch: 0,
  diff: 0,
  assertions: 0,
  consoleErrors: 0,
  consoleWarnings: 0,
  css: 0,
  deadCss: 0,
  emptyCss: 0,
  environment: 0,
  appearance: 0,
  lighthouse: 0,
} as const;

const QUERY: SnapReportQuery = {
  target: "fixture",
  mode: "all",
  level: null,
  arm: null,
  channel: null,
  source: null,
  category: null,
  text: null,
  page: null,
  context: null,
  window: null,
};

function representativeBatch(): SnapRunFactBatch {
  const scope = aggregateScope();
  return {
    id: factBatchId("representative"),
    core: [
      {
        kind: "core",
        schema: "snap-rate-posture-v1",
        source: "browser-system-info+host-load",
        lifetime: "one Snap run/cell",
        scope,
        artifacts: [],
        data: {
          id: snapRatePostureIdSchema.parse(`sha256:${"1".repeat(64)}`),
          acceleration: {
            backend: "NVIDIA RTX",
            posture: "hardware",
            gpuCompositing: "enabled",
            rasterization: "enabled",
            webgl: "enabled",
            webgpu: "enabled",
          },
          accelerationError: null,
          load: { loadavg1: 0.5, cpuCount: 32 },
        },
      },
      {
        kind: "core",
        schema: "snap-core-run-v1",
        source: "snap-run-owner",
        lifetime: "one Snap run/cell",
        scope,
        artifacts: [artifactRef("evidence/core-capture.json")],
        data: {
          exit: 0,
          state: "passed",
          pages: 2,
          contexts: 1,
          captures: 2,
          fileActions: 0,
          failedRequests: 0,
          pageErrors: 0,
          diagnostics: 0,
          failures: ZERO_FAILURES,
        },
      },
    ],
    arms: [
      snapArmFact({
        arm: "requests",
        schema: "snap-arm-requests-v1",
        source: "browser request evidence ring",
        lifetime: "session boot through checkpoint window",
        scope,
        artifacts: [artifactRef("requests/page.json")],
        data: { state: "passed", detail: null, recorded: 18, shown: 3, evicted: 2, artifact: artifactRef("requests/page.json") },
      }),
      snapArmFact({
        arm: "motion",
        schema: "snap-arm-motion-v1",
        source: "__orb motion rings + CDP PipelineReporter",
        lifetime: "one tagged motion action/window",
        scope: exactScope(0, 0, "motion:2500ms"),
        artifacts: [artifactRef("motion/a.json")],
        data: { state: "failed", detail: "one planted frame problem", measurements: 1, problems: 1, artifact: artifactRef("motion/a.json") },
      }),
      snapArmFact({
        arm: "interaction-perf",
        schema: "snap-arm-interaction-perf-v1",
        source: "PerformanceObserver EventTiming/LoAF/longtask/layout-shift + rAF",
        lifetime: "one argv-ordered action tape",
        scope: exactScope(0, 0, "action-tape"),
        artifacts: [artifactRef("perf/a.json")],
        data: { state: "passed", detail: null, steps: 4, breachSteps: 0, artifact: artifactRef("perf/a.json") },
      }),
      snapArmFact({
        arm: "heap",
        schema: "snap-arm-heap-v1",
        source: "CDP HeapProfiler + official DevTools HeapSnapshotManager",
        lifetime: "one exact settled page checkpoint",
        scope: exactScope(0, 1, "heap-checkpoints"),
        artifacts: [artifactRef("heap/after.heapsnapshot")],
        data: { state: "passed", detail: null, snapshots: 2, comparisons: 1, retainers: 1, findings: 1, errors: 0 },
      }),
    ],
  };
}

function artifact(scope: SnapRunArtifact["scope"]): SnapRunArtifact {
  return {
    path: "/tmp/run/evidence.json",
    relativePath: artifactRef("evidence.json"),
    publishedPath: null,
    bytes: 1,
    producer: "snap",
    producerArm: null,
    channel: "test",
    mediaType: "application/json",
    schema: "test-v1",
    role: "primary",
    completeness: "complete",
    completenessDetail: "test",
    scope,
    records: 1,
    limits: [],
    declaration: "declared",
  };
}

function indexPath(stdout: string): string {
  const path = /\bindex=(\/\S+\/run\.json)\b/u.exec(stdout)?.[1];
  if (path === undefined) {
    throw new Error(`missing run index in ${stdout}`);
  }
  return path;
}

test("typed facts preserve strong rate/core/request/motion/perf/heap data without pair parsing", () => {
  const batch = representativeBatch();
  const serialized = JSON.parse(JSON.stringify({ v: SNAP_RUN_RESULTS_VERSION, batches: [batch] })) as unknown;
  const results = parseSnapRunResults(serialized);
  const rate = results.batches[0]?.core.find((fact) => fact.schema === "snap-rate-posture-v1");
  const arms = results.batches[0]?.arms ?? [];

  expect(rate?.data).toMatchObject({ acceleration: { backend: "NVIDIA RTX", posture: "hardware" }, load: { loadavg1: 0.5, cpuCount: 32 } });
  expect(arms.find((fact) => fact.arm === "requests")?.data).toMatchObject({ recorded: 18, shown: 3, evicted: 2 });
  expect(arms.find((fact) => fact.arm === "motion")?.data).toMatchObject({ measurements: 1, problems: 1 });
  expect(arms.find((fact) => fact.arm === "interaction-perf")?.data).toMatchObject({ steps: 4, breachSteps: 0 });
  expect(arms.find((fact) => fact.arm === "heap")?.data).toMatchObject({ snapshots: 2, comparisons: 1, retainers: 1, findings: 1 });
});

test("unknown schema, malformed scope, duplicate fact identity, and wrong-arm data refuse", () => {
  const batch = representativeBatch();
  const base = JSON.parse(JSON.stringify({ v: 1, batches: [batch] })) as { batches: { arms: Record<string, unknown>[] }[] };
  base.batches[0]?.arms.splice(1);

  expect(() =>
    parseSnapRunResults({ ...base, batches: [{ ...base.batches[0], arms: [{ ...base.batches[0]?.arms[0], schema: "snap-arm-requests-v999" }] }] }),
  ).toThrow("snap-arm-requests-v1");
  expect(() =>
    parseSnapRunResults({
      ...base,
      batches: [{ ...base.batches[0], arms: [{ ...base.batches[0]?.arms[0], scope: { kind: "scope-v1", context: null, page: null, window: null } }] }],
    }),
  ).toThrow();
  expect(() => parseSnapRunResults({ ...base, batches: [{ ...base.batches[0], arms: [base.batches[0]?.arms[0], base.batches[0]?.arms[0]] }] })).toThrow(
    "duplicate requests fact scope",
  );
  expect(() =>
    parseSnapRunResults({
      ...base,
      batches: [{ ...base.batches[0], arms: [{ ...base.batches[0]?.arms[0], data: { state: "passed", detail: null, snapshots: 1 } }] }],
    }),
  ).toThrow("recorded");
});

test("scope filters distinguish exact, aggregate, N/A, and reader-only legacy null", () => {
  const exact = exactScope(2, 3, "w4");
  const selected = scopeV1({
    context: aggregateDimension([contextIndex(2)]),
    page: aggregateDimension([pageIndex(3), pageIndex(4)]),
    window: aggregateDimension(),
  });
  const na = notApplicableScope("global receipt");
  const legacy = instrumentLegacyScopeSchema.parse({ kind: "legacy", context: null, page: 3, window: null });

  expect(scopeMatches(exact, { context: 2, page: 3, window: "w4" })).toBe(true);
  expect(scopeMatches(exact, { context: 2, page: 4, window: null })).toBe(false);
  expect(scopeMatches(selected, { context: 2, page: 4, window: "anything" })).toBe(true);
  expect(scopeMatches(selected, { context: 1, page: 4, window: null })).toBe(false);
  expect(scopeMatches(na, { context: null, page: null, window: null })).toBe(true);
  expect(scopeMatches(na, { context: null, page: 0, window: null })).toBe(false);
  expect(scopeMatches(legacy, { context: null, page: 3, window: null })).toBe(true);
  expect(scopeMatches(legacy, { context: 0, page: 3, window: null })).toBe(false);
  expect(artifactMatches(artifact(selected), { ...QUERY, context: 2, page: 4, window: "anything" })).toBe(true);
  expect(artifactMatches(artifact(na), { ...QUERY, page: 0 })).toBe(false);
});

test("session done wire preserves exact pairs and typed fact batches; malformed facts refuse", () => {
  const batch = representativeBatch();
  const line = JSON.stringify({ kind: "done", exit: 0, pairs: [["rate-posture", "literal%7Cbytes"]], facts: [batch] });
  const event = readSessionEvent(line);
  expect(event).toMatchObject({ kind: "done", exit: 0, pairs: [["rate-posture", "literal%7Cbytes"]] });
  expect(event?.kind === "done" ? event.facts?.[0]?.core[0]?.schema : null).toBe("snap-rate-posture-v1");
  expect(readSessionEvent(JSON.stringify({ kind: "done", exit: 0, pairs: [], facts: [{ ...batch, id: "" }] }))).toBeNull();
});

test("page-only contexts derive disabled run-arm verdict fields without absent pairs", () => {
  const contexts = parseSnapArgs(["/", "--contexts", "2"]);
  expect(contexts.errors).toEqual([]);
  expect(disabledRunArmFailures(contexts)).toEqual({ lighthouse: 0 });

  const impossible = parseSnapArgs(["/", "--contexts", "2", "--lighthouse", "desktop"]);
  expect(impossible.errors.join("\n")).toContain("would silently ignore the arm");
  expect(() => disabledRunArmFailures(impossible)).toThrow("page-only host cannot skip enabled run arm lighthouse");
});

test("diagnostic ring eviction makes the run-index state incomplete even when retained reads are clean", async ({ scratch }) => {
  const root = join(scratch, "retention-repo");
  const runId = "diagnostic-retention";
  const dir = join(root, "reports", "runs", "snap", runId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, ".inflight"), '{"startedAt":"2026-09-04T00:00:00.000Z"}\n');
  const scope = aggregateScope();
  const retention = retentionBatch([
    {
      source: BROWSER_EVIDENCE_SOURCES.diagnostics,
      capacity: 1,
      observed: 2,
      retained: 1,
      dropped: 1,
      complete: false,
      cursor: { start: 0, end: 2, retainedStart: 1 },
      scope,
    },
    {
      source: BROWSER_EVIDENCE_SOURCES.diagnosticCompleteness,
      capacity: 1,
      observed: 1,
      retained: 1,
      dropped: 0,
      complete: true,
      cursor: { start: 0, end: 1, retainedStart: 0 },
      scope,
    },
  ]);
  registerSnapFactBatch({
    id: factBatchId("retention"),
    core: [
      {
        kind: "core",
        schema: "snap-browser-retention-v1",
        source: "bounded-browser-evidence-rings",
        lifetime: "one Snap run/cell",
        scope,
        artifacts: [],
        data: retention,
      },
    ],
    arms: [],
  });
  registerSnapDiagnosticCompleteness({
    source: "orb-console-ring",
    reads: [{ contextIndex: 0, pageIndex: 0, evidenceWindow: 1, records: 0, dropped: 0, cap: 128, complete: true }],
    totals: { reads: 1, records: 0, dropped: 0, complete: true },
  });
  const path = await completeSnapRun(
    { slot: { instrument: "snap", runId, dir, relDir: join("reports", "runs", "snap", runId), racing: [] }, root, exit: 0, error: null },
    parseSnapArgs([]),
    ["snap"],
  );
  const index = JSON.parse(await readFile(path, "utf8")) as { readonly diagnostics: { readonly state: string } };
  expect(index.diagnostics.state).toBe("incomplete");
});

test("current writer is cold-agent-readable, preserves pair bytes, and never emits nullable scope", { timeout: CLI_TIMEOUT_MS }, async ({
  runCli,
  scratch,
}) => {
  const file = join(scratch, "typed-results.html");
  await writeFile(file, '<!doctype html><html><body><button id="ok">okay</button></body></html>');
  const run = await runCli("snap", ["--file", file, "--no-deadcss", "--no-failure-evidence"], { timeoutMs: CLI_TIMEOUT_MS });
  const path = indexPath(run.stdout);
  const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  const index = await readSnapRunIndex(path);

  expect(index.results?.batches).toHaveLength(1);
  expect(index.results?.batches[0]?.core.map((fact) => fact.schema)).toEqual(
    expect.arrayContaining(["snap-rate-posture-v1", "snap-browser-retention-v1", "snap-core-run-v1"]),
  );
  expect(index.results?.batches[0]?.arms.find((fact) => fact.arm === "shot")?.scope).toMatchObject({
    kind: "scope-v1",
    context: { kind: "exact", value: 0 },
    page: { kind: "exact", value: 0 },
  });
  expect(index.artifacts.every((row) => row.scope.kind === "scope-v1")).toBe(true);
  expect(JSON.stringify(raw)).not.toMatch(/"(?:page|context|window)":null/u);
  expect(index.resultPairs).toEqual(resultPairsOf(run.stdout.split("\n")));

  const report = await runCli("snap", ["--report", path, "--all"]);
  await expect(report).toExitWith(0);
  expect(report.stdout).toContain("FACT         batch=");
  expect(report.stdout).toContain("core=snap-rate-posture-v1");
  expect(report.stdout).toContain("arm=shot schema=snap-arm-shot-v1");
});

test("legacy v1 null triples normalize only in the reader and malformed current results refuse", { timeout: CLI_TIMEOUT_MS }, async ({ runCli, scratch }) => {
  const file = join(scratch, "legacy.html");
  await writeFile(file, "<!doctype html><html><body>legacy</body></html>");
  const run = await runCli("snap", ["--file", file, "--no-shot", "--no-deadcss", "--no-failure-evidence"], { timeoutMs: CLI_TIMEOUT_MS });
  const path = indexPath(run.stdout);
  const original = await readFile(path, "utf8");
  const current = JSON.parse(original) as Record<string, unknown>;
  const artifacts = (current["artifacts"] as Record<string, unknown>[]).map(({ scope: _scope, ...row }) => ({
    ...row,
    page: null,
    context: null,
    window: null,
  }));
  const { results: _results, ...legacyBase } = current;
  const legacy: Record<string, unknown> = { ...legacyBase, artifacts };

  try {
    await writeFile(path, `${JSON.stringify(legacy)}\n`);
    const read = await readSnapRunIndex(path);
    expect(read.results).toBeUndefined();
    expect(read.artifacts.every((row) => row.scope.kind === "legacy")).toBe(true);

    const malformed = {
      ...current,
      results: { v: 1, batches: [{ ...representativeBatch(), arms: [{ ...representativeBatch().arms[0], schema: "snap-arm-requests-v999" }] }] },
    };
    await writeFile(path, `${JSON.stringify(malformed)}\n`);
    await expect(readSnapRunIndex(path)).rejects.toThrow("snap-arm-requests-v1");
  } finally {
    await writeFile(path, original);
  }
});
