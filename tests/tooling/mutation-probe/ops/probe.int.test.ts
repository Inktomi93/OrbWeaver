// The probe's own honesty pins. Both cases below made the instrument report a CONFIDENT WRONG ANSWER
// before they were fixed, and both fail silently — the run looks like a successful adjudication.
//
// @instrument-proof: a mirror suite that is RED on unmutated source must REFUSE (every planted mutant
//   would read as killed), and a suite killed by the wall-clock ceiling must never be scored as a kill.
// @instrument-absence-proof: a source with no runnable mirror suite, and a report whose survivor
//   population is empty, must both fail loudly rather than return a clean zero-survivor summary.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { probeMutants } from "../../../../tooling/src/mutation-probe/index.ts";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import type { ToolFixtures } from "../../../support/tool-fixtures.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SRC_REL = "packages/server/src/domain/admin/guard.ts";
const SOURCE = "export const can = 1;\n";
const SPEC_REL = "tests/server/domain/admin/guard.test.ts";

const RUNNER_FAILURES = [
  "tool-error",
  "misuse",
  "abnormal-exit",
  "crash",
  "missing",
  "malformed",
  "incomplete",
  "stale",
  "unattributed",
  "wrong-spec",
  "unfinished-file",
  "supervisor-gap",
  "runtime-error",
  "exit-disagreement",
] as const;
const RUNNER_CONTROLS = ["killed", "survived", "baseline-red", "baseline-unmeasured"] as const;

async function fakeSuiteRunner(
  fakeBin: ToolFixtures["fakeBin"],
  root: string,
  failure?: (typeof RUNNER_FAILURES)[number],
  control: (typeof RUNNER_CONTROLS)[number] = "killed",
): Promise<void> {
  await fakeBin(
    "pnpm",
    `
    import { readFileSync, writeFileSync } from "node:fs";
    const flag = process.argv.slice(2).find((arg) => arg.startsWith("--outputFile.json="));
    if (flag === undefined) process.exit(2);
    const changed = readFileSync(${JSON.stringify(join(root, SRC_REL))}, "utf8") !== ${JSON.stringify(SOURCE)};
    const control = ${JSON.stringify(control)};
    const failed = control === "baseline-red" || (changed && control !== "survived");
    const failure = control === "baseline-unmeasured" ? "tool-error" : changed ? ${JSON.stringify(failure ?? null)} : null;
    const now = ${JSON.stringify(FROZEN_AT_MS)};
    const report = {
      success: !failed, startTime: now,
      numTotalTests: 1, numPassedTests: failed ? 0 : 1, numFailedTests: failed ? 1 : 0,
      numPendingTests: 0, numTodoTests: 0, numFailedTestSuites: failed ? 1 : 0,
      testResults: [{ name: ${JSON.stringify(join(root, SPEC_REL))}, startTime: now, endTime: now,
        status: failed ? "failed" : "passed", assertionResults: [{
          status: failed ? "failed" : "passed", title: "mutation witness",
          failureMessages: failed ? ["AssertionError: mutation witness"] : [],
        }],
      }],
    };
    if (failure === "missing") process.exit(1);
    if (failure === "crash") process.kill(process.pid, "SIGKILL");
    if (failure === "malformed") {
      writeFileSync(flag.slice("--outputFile.json=".length), "{"); process.exit(1);
    }
    if (failure === "incomplete") report.numTotalTests = 2;
    if (failure === "stale") report.startTime = 1;
    if (failure === "unattributed") delete report.testResults[0].assertionResults[0].title;
    if (failure === "wrong-spec") report.testResults[0].name = "tests/not-the-mirror.test.ts";
    if (failure === "unfinished-file") report.testResults[0].endTime = 0;
    if (failure === "supervisor-gap") report.orbShards = [{ wedged: false, nonVerdict: "worker did not report", unreported: [${JSON.stringify(SPEC_REL)}] }];
    if (failure === "runtime-error") report.numRuntimeErrorTestSuites = 1;
    writeFileSync(flag.slice("--outputFile.json=".length), JSON.stringify(report));
    process.exit(failure === "tool-error" ? 2 : failure === "misuse" ? 3 : failure === "abnormal-exit" ? 42 : failure === "exit-disagreement" ? 0 : failed ? 1 : 0);
  `,
  );
}

interface Fixture {
  readonly root: string;
  readonly reportPath: string;
}

/** A fake repo root carrying the source, optionally its mirror suite, and a report over it. */
function fixture(opts: { readonly withSpec: boolean; readonly status?: string }): Fixture {
  const root = mkdtempSync(join(tmpdir(), "mutation-probe-op-"));
  const src = join(root, SRC_REL);
  mkdirSync(dirname(src), { recursive: true });
  writeFileSync(src, SOURCE);
  if (opts.withSpec) {
    const spec = join(root, "tests/server/domain/admin/guard.test.ts");
    mkdirSync(dirname(spec), { recursive: true });
    writeFileSync(spec, "");
  }
  const reportPath = join(root, "report.json");
  writeFileSync(
    reportPath,
    JSON.stringify({
      files: {
        [SRC_REL]: {
          source: SOURCE,
          mutants: [
            {
              mutatorName: "StringLiteral",
              replacement: '""',
              status: opts.status ?? "Survived",
              location: { start: { line: 1, column: 19 }, end: { line: 1, column: 20 } },
            },
          ],
        },
      },
    }),
  );
  return { root, reportPath };
}

test("a source with NO runnable mirror suite refuses instead of adjudicating nothing", () => {
  const { root, reportPath } = fixture({ withSpec: false });
  // Without this refusal the loop runs zero specs, every mutant survives, and the tool reports a
  // confident "N real survivors" over a file it never actually tested.
  expect(() => probeMutants({ reportPath, sourceRel: SRC_REL, root })).toThrow(/no runnable mirror suite/u);
});

test("an all-killed report refuses rather than returning a clean zero-survivor summary", () => {
  const { root, reportPath } = fixture({ withSpec: true, status: "Killed" });
  expect(() => probeMutants({ reportPath, sourceRel: SRC_REL, root })).toThrow(/ZERO survivors/u);
});

test("a completed red-on-pristine mirror suite refuses before planting", async ({ fakeBin, clock }) => {
  const { root, reportPath } = fixture({ withSpec: true });
  await fakeSuiteRunner(fakeBin, root, undefined, "baseline-red");
  expect(() => probeMutants({ reportPath, sourceRel: SRC_REL, root, now: clock.now })).toThrow(/RED on unmutated source/u);
  expect(readFileSync(join(root, SRC_REL), "utf8")).toBe(SOURCE);
});

test("a baseline tool error refuses before planting", async ({ fakeBin, clock }) => {
  const { root, reportPath } = fixture({ withSpec: true });
  await fakeSuiteRunner(fakeBin, root, undefined, "baseline-unmeasured");
  expect(() => probeMutants({ reportPath, sourceRel: SRC_REL, root, now: clock.now })).toThrow(/no complete attributed verdict on unmutated source/u);
  expect(readFileSync(join(root, SRC_REL), "utf8")).toBe(SOURCE);
});

test("REFUSES to plant into a source that already has uncommitted changes", ({ clock }) => {
  // A dirty target means the operator's WIP would be captured as "pristine" and restored over — and a
  // mutation stranded by an earlier hard kill looks identical to a deliberate edit. The repo shipped a
  // BLINDED gate this way once already (2026-08-24, a probe swept in by a broad `git add`).
  const { root, reportPath } = fixture({ withSpec: true });
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"]);
  writeFileSync(join(root, SRC_REL), "export const can = 2; // operator WIP\n");
  expect(() => probeMutants({ reportPath, sourceRel: SRC_REL, root, now: clock.now })).toThrow(/uncommitted changes/u);
});

test("the mirror runner uses the supervisor JSON-output contract and retains named failure attribution", async ({ fakeBin, clock }) => {
  const { root, reportPath } = fixture({ withSpec: true });
  await fakeSuiteRunner(fakeBin, root);
  const summary = probeMutants({ reportPath, sourceRel: SRC_REL, root, now: clock.now });
  expect(summary.measured).toBe(1);
  expect(summary.receipts).toEqual([expect.objectContaining({ killed: true, timedOut: false, attributionMissing: false, failedTests: ["mutation witness"] })]);
  expect(readFileSync(join(root, SRC_REL), "utf8")).toBe(SOURCE);
});

for (const failure of RUNNER_FAILURES) {
  test(`a planted mutant with ${failure} evidence is unmeasured and its source is restored`, async ({ fakeBin, clock }) => {
    const { root, reportPath } = fixture({ withSpec: true });
    await fakeSuiteRunner(fakeBin, root, failure);

    const summary = probeMutants({ reportPath, sourceRel: SRC_REL, root, now: clock.now });

    expect(summary.killed).toBe(0);
    expect(summary.stillSurvived).toBe(0);
    expect(summary.measured).toBe(0);
    expect(summary.unmeasured).toBe(1);
    expect(summary.receipts[0]).toMatchObject({ killed: false, unmeasured: true });
    expect(readFileSync(join(root, SRC_REL), "utf8")).toBe(SOURCE);
  });
}

test("a changed mutant with a completed green mirror remains a measured survivor", async ({ fakeBin, clock }) => {
  const { root, reportPath } = fixture({ withSpec: true });
  await fakeSuiteRunner(fakeBin, root, undefined, "survived");
  const summary = probeMutants({ reportPath, sourceRel: SRC_REL, root, now: clock.now });
  expect(summary).toMatchObject({ measured: 1, killed: 0, stillSurvived: 1, unmeasured: 0 });
  expect(summary.receipts[0]).toMatchObject({ noop: false, killed: false, unmeasured: false, failedTests: [] });
  expect(readFileSync(join(root, SRC_REL), "utf8")).toBe(SOURCE);
});

test("a completed kill of a NoCoverage mutant retains the false-coverage result", async ({ fakeBin, clock }) => {
  const { root, reportPath } = fixture({ withSpec: true, status: "NoCoverage" });
  await fakeSuiteRunner(fakeBin, root);
  const summary = probeMutants({ reportPath, sourceRel: SRC_REL, root, now: clock.now });
  expect(summary).toMatchObject({ measured: 1, killed: 1, falselyUncovered: 1, unmeasured: 0 });
  expect(readFileSync(join(root, SRC_REL), "utf8")).toBe(SOURCE);
});
