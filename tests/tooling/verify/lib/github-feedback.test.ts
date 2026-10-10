import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { vi } from "vitest";
import type { StageResult, VerifyReport } from "../../../../tooling/src/verify/contract/stage.ts";
import { finishGithubStage, printGithubReport, startGithubStage } from "../../../../tooling/src/verify/lib/github-feedback.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function stage(overrides: Partial<StageResult> = {}): StageResult {
  return {
    name: "tests:node",
    group: "tests",
    mode: "full",
    ok: false,
    exitCode: 1,
    childExit: 1,
    durationMs: 123,
    logFile: "reports/verify/tests-node.log",
    failureExcerpt: "first failure\nlast line",
    runsAt: null,
    notices: [],
    ...overrides,
  };
}
function report(stages: readonly StageResult[]): VerifyReport {
  return {
    tier: "push",
    scope: "application",
    ok: false,
    exitCode: 2,
    failed: stages.filter((s) => !s.ok).length,
    noVerdict: stages.filter((s) => s.childExit === null || s.exitCode === 2).map((s) => s.name),
    stages,
  };
}
function capture(action: () => void): string {
  let output = "";
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output += String(chunk);
    return true;
  });
  try {
    action();
    return output;
  } finally {
    spy.mockRestore();
  }
}

test("hosted omission summaries name unmeasured mutation rather than a passing score", ({ scratch }) => {
  const path = join(scratch, "omission.md");
  const { childExit: _childExit, ...omitted } = stage({
    name: "quality:mutation-gate",
    mode: "skipped",
    ok: true,
    exitCode: 0,
    durationMs: 0,
    logFile: null,
    failureExcerpt: null,
    runsAt: "verify --full",
    notices: ["tier precondition: mutation quality is not measured on GitHub-hosted CI"],
  });
  printGithubReport(report([omitted]), { ["GITHUB_STEP_SUMMARY"]: path });
  const text = readFileSync(path, "utf8");
  expect(text).toContain("not measured on GitHub-hosted CI");
  expect(text).not.toContain("| passed |");
  expect(text).not.toContain("mutation score");
});

test("failed stages annotate the first native excerpt line and escape workflow properties/data", () => {
  const output = capture(() =>
    printGithubReport(report([stage({ name: "lint:bad,%\nnext", failureExcerpt: "failure%\r\n::error::injection" })]), { ["GITHUB_ACTIONS"]: "true" }),
  );
  expect(output).toBe("::error title=lint%3Abad%2C%25%0Anext::failure%25\n");
});
test("tool errors and raw no-verdict children are annotated with their actual exit", () => {
  const output = capture(() =>
    printGithubReport(report([stage({ exitCode: 2, childExit: 7 }), stage({ name: "laundered", ok: true, exitCode: 0, childExit: null })]), {
      ["GITHUB_ACTIONS"]: "true",
    }),
  );
  expect(output).toContain("::error title=tests%3Anode::TOOL-ERROR (child exit 7): first failure");
  expect(output).toContain("::error title=laundered::TOOL-ERROR (child exit null): first failure");
});
test("only an evidenced mutation initial-run timeout is named a dry-run timeout", () => {
  const output = capture(() =>
    printGithubReport(
      report([
        stage({ name: "quality:mutation-gate", exitCode: 2, failureExcerpt: "Initial test run timed out!" }),
        stage({ name: "quality:other", exitCode: 2 }),
      ]),
      { ["GITHUB_ACTIONS"]: "true" },
    ),
  );
  expect(output).toContain("dry run timed out");
  expect(output.match(/dry run timed out/gu)).toHaveLength(1);
});
test("live groups promise only running, then close with actual measured status/duration without replay", () => {
  const output = capture(() => {
    startGithubStage("tests:node", { ["GITHUB_ACTIONS"]: "true" });
    process.stdout.write("live child\n");
    finishGithubStage(stage(), "live child\n", true, { ["GITHUB_ACTIONS"]: "true" });
  });
  expect(output).toBe("::group::tests:node (running)\nlive child\n\ntests:node (failed, 123ms)\n::endgroup::\n");
});
test("completed nonstreamed groups include accurate title and transcript", () => {
  expect(capture(() => finishGithubStage(stage({ ok: true, exitCode: 0 }), "child\n", false, { ["GITHUB_ACTIONS"]: "true" }))).toBe(
    "::group::tests:node (passed, 123ms)\nchild\n::endgroup::\n",
  );
});
test("local execution has no GitHub commands while explicit summary env still writes native stages", ({ scratch }) => {
  const path = join(scratch, "summary.md");
  expect(
    capture(() => {
      startGithubStage("tests:node", {});
      finishGithubStage(stage(), "body", false, {});
      printGithubReport(report([stage()]), { ["GITHUB_STEP_SUMMARY"]: path });
    }),
  ).toBe("");
  const text = readFileSync(path, "utf8");
  expect(text).toContain("| tests:node | failed | 123ms |");
  expect(text).toContain("```text\nfirst failure\nlast line\n```");
});
test("summary caps combined UTF8 bytes, retains closed fences, and does not mutate native report", ({ scratch }) => {
  const path = join(scratch, "summary.md");
  writeFileSync(path, "prior summary\n");
  const native = report([stage({ failureExcerpt: `\`\`\`\n${"é🙂".repeat(30_000)}\nforeign fence` })]);
  const before = JSON.stringify(native);
  capture(() => printGithubReport(native, { ["GITHUB_STEP_SUMMARY"]: path }));
  const text = readFileSync(path, "utf8");
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(60 * 1024);
  expect(text).toContain("truncated");
  expect(text).not.toContain("�");
  expect(text).toMatch(/\n`{4,}\n$/u);
  expect(JSON.stringify(native)).toBe(before);
  capture(() => printGithubReport(native, { ["GITHUB_STEP_SUMMARY"]: path }));
  expect(Buffer.byteLength(readFileSync(path))).toBeLessThanOrEqual(60 * 1024);
});

test("oversized failures share the cap so every failing stage retains its own closed excerpt block", ({ scratch }) => {
  const path = join(scratch, "shared-summary.md");
  const native = report([stage({ name: "first", failureExcerpt: "`".repeat(100_000) }), stage({ name: "second", failureExcerpt: "second cause" })]);
  capture(() => printGithubReport(native, { ["GITHUB_STEP_SUMMARY"]: path }));
  const text = readFileSync(path, "utf8");
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(60 * 1024);
  expect(text).toContain("#### first");
  expect(text).toContain("#### second");
  expect(text).toContain("second cause");
});

test("distributed tool-error annotations retain each partition child's real code", () => {
  const { childExit: _childExit, ...distributed } = stage({
    exitCode: 2,
    partitionResults: [{ key: "quality", result: stage({ exitCode: 2, childExit: 1 }) }],
  });
  const native = report([distributed]);
  expect(capture(() => printGithubReport(native, { ["GITHUB_ACTIONS"]: "true" }))).toContain("TOOL-ERROR (child exit quality=1)");
});
