// @instrument-proof: normalized terminal RESULT pairs travel through the real immutable writer, validator,
// and browser-free renderer without reinterpretation. A zero request denominator is refused everywhere;
// the nonzero sibling proves this is denominator-derived, not a blanket requests refusal.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { aggregateScope, factBatchId } from "@orb/tooling/_shared/artifact-scope";
import { printVerdictReceipt } from "@orb/tooling/_shared/evidence";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { installOutputSink } from "@orb/tooling/_shared/log";
import { snapArmFact } from "../../../../tooling/src/snap/contract/run-facts.ts";
import type { SnapRunIndex } from "../../../../tooling/src/snap/contract/run-index.ts";
import { parseSnapReportArgs } from "../../../../tooling/src/snap/lib/run-report-query.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { completeSnapRun, registerSnapFactBatch, registerSnapResultPairs } from "../../../../tooling/src/snap/ops/run-bundle.ts";
import { printSnapReport, readSnapRunIndex } from "../../../../tooling/src/snap/ops/run-report.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const STARTED_AT = "2026-09-03T12:00:00.000Z";

function git(root: string, args: readonly string[]): void {
  execFixtureGit(root, args);
}

async function repository(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  git(root, ["init", "-b", "main"]);
  await writeFile(join(root, ".gitignore"), "reports/\n");
  await writeFile(join(root, "seed.txt"), "seed\n");
  git(root, ["add", ".gitignore", "seed.txt"]);
  git(root, ["-c", "user.name=Snap Test", "-c", "user.email=snap@example.invalid", "commit", "-m", "seed"]);
}

async function slot(
  root: string,
  runId: string,
): Promise<{ readonly instrument: "snap"; readonly runId: string; readonly dir: string; readonly relDir: string; readonly racing: readonly string[] }> {
  const dir = join(root, "reports", "runs", "snap", runId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, ".inflight"), `${JSON.stringify({ startedAt: STARTED_AT })}\n`);
  return { instrument: "snap" as const, runId, dir, relDir: join("reports", "runs", "snap", runId), racing: [] };
}

async function capture<T>(run: () => Promise<T> | T): Promise<{ readonly value: T; readonly stdout: string }> {
  const lines: string[] = [];
  const release = installOutputSink({ line: (line) => lines.push(line), warn: (line) => lines.push(line) });
  try {
    return { value: await run(), stdout: lines.join("\n") };
  } finally {
    release();
  }
}

function requestsArm(index: SnapRunIndex): SnapRunIndex["verdict"]["arms"][number] | undefined {
  return index.verdict.arms.find((arm) => arm.arm === "requests");
}

function registerRequestsFact(recorded: number): void {
  registerSnapFactBatch({
    id: factBatchId(`requests-${String(recorded)}`),
    core: [],
    arms: [
      snapArmFact({
        arm: "requests",
        schema: "snap-arm-requests-v1",
        source: "browser request evidence ring",
        lifetime: "session boot through checkpoint window",
        scope: aggregateScope(),
        artifacts: [],
        data: {
          state: recorded === 0 ? "refused" : "passed",
          detail: `requests=${String(recorded)}`,
          recorded,
          shown: recorded,
          evicted: 0,
          artifact: null,
        },
      }),
    ],
  });
}

test("zero-request terminal, immutable index, and browser-free report agree on one refusal", async ({ scratch }) => {
  const root = join(scratch, "repo");
  await repository(root);
  const opts = parseSnapArgs(["--requests"]);
  const terminal = await capture(() =>
    printVerdictReceipt("snap", {
      verdict: EXIT.clean,
      denominators: { pages: { value: 1, refuseWhen: "zero" }, requests: { value: 0, refuseWhen: "zero" } },
      pairs: [
        ["requests-shown", 7],
        ["request-body", "off"],
      ],
    }),
  );
  expect(terminal.value.exit).toBe(EXIT.toolError);
  expect(terminal.stdout).toContain("RESULT snap verdict=INSTRUMENT-ERROR requests-shown=7 request-body=off pages=1 requests=0");

  registerSnapResultPairs(terminal.value.pairs);
  registerRequestsFact(0);
  const runSlot = await slot(root, "zero-requests");
  const path = await completeSnapRun({ slot: runSlot, root, exit: terminal.value.exit, error: null }, opts, ["snap", "--requests"]);
  const index = await readSnapRunIndex(path);
  expect(index.resultPairs).toEqual(terminal.value.pairs.map(([key, value]) => [String(key), String(value)]));
  expect(index.verdict).toMatchObject({ exit: EXIT.toolError, state: "refused" });
  expect(requestsArm(index)).toMatchObject({ state: "refused", detail: "requests=0" });

  const parsed = parseSnapReportArgs(["--report", path, "--problems"]);
  expect(parsed.errors).toEqual([]);
  expect(parsed.query).not.toBeNull();
  const report = await capture(async () => await printSnapReport(root, parsed.query as NonNullable<typeof parsed.query>));
  expect(report.value).toBe(EXIT.clean);
  expect(report.stdout).toContain("VERDICT      refused exit=2");
  expect(report.stdout).toContain("ARM          requests state=refused");
  expect(report.stdout).toContain("detail=requests=0");

  const positive = await capture(() =>
    printVerdictReceipt("snap", {
      verdict: EXIT.clean,
      denominators: { pages: { value: 1, refuseWhen: "zero" }, requests: { value: 2, refuseWhen: "zero" } },
      pairs: [["requests-shown", 0]],
    }),
  );
  registerSnapResultPairs(positive.value.pairs);
  registerRequestsFact(2);
  const positiveSlot = await slot(root, "two-requests");
  const positivePath = await completeSnapRun({ slot: positiveSlot, root, exit: positive.value.exit, error: null }, opts, ["snap", "--requests"]);
  const positiveIndex = await readSnapRunIndex(positivePath);
  expect(positiveIndex.resultPairs).toEqual(positive.value.pairs.map(([key, value]) => [String(key), String(value)]));
  expect(requestsArm(positiveIndex)).toMatchObject({ state: "passed", detail: "requests=2" });
});
