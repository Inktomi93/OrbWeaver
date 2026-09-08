// THE INNER LOOP STILL REACHES TOOLING TESTS (#1566) — proven by asking the RUNNER, not by reading argv.
//
// #1523 moved 280 files out of the `unit`/`integration` vitest projects into a `tooling` project and gave
// the new stage `tiers: ["push","full"]`. `tests:node`'s scoped argv copied a partial project list, so
// `verify --changed` over an instrument edit selected ZERO of its tests. The repair removes that second
// census: an absent project filter delegates ownership to Vitest's current configured projects.
//
// So this file drives vitest's own resolver over the project set the registry actually hands it, and asks
// whether a tests/tooling file is reachable through it at all. Deterministic on purpose — a `--changed`
// probe would depend on what this branch happens to have touched, and a selection test whose subject is
// the git log is a test that answers a different question every day. The second arm is the CONTROL: the
// same question, asked of the pre-#1566 project set, must find nothing.
import process from "node:process";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { vi } from "vitest";
import { stagesForTier } from "../../../../tooling/src/verify/lib/registry.ts";
import { resolveSelection } from "../../../../tooling/src/verify/lib/selection.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const TIMEOUT_MS = scaledBudget(120_000);
vi.setConfig({ testTimeout: TIMEOUT_MS, hookTimeout: TIMEOUT_MS });

const LIST_MAX_BUFFER = 64 * 1024 * 1024;
/** A file that exists, is a real spec, and lives under `tests/tooling` — the population the split moved. */
const TOOLING_FILTER = "tests/tooling/verify/lib/registry";

/** `vitest list` over an explicit project set, filtered to one path fragment, as repo-relative paths.
 *
 *  `--filesOnly` is load-bearing for SPEED (one row per file, not per case), and NO `--json` is passed:
 *  that flag's value is OPTIONAL, so a space-separated form consumes the next argument as an OUTPUT
 *  DESTINATION — the hazard that once overwrote a tracked test file with a JSON array. Plain stdout here. */
function listFiles(root: string, projects: readonly string[], filter: string): readonly string[] {
  const res = runNicedSync(
    process.execPath,
    [`${root}/node_modules/vitest/vitest.mjs`, "list", "--filesOnly", ...projects.flatMap((project) => ["--project", project]), filter],
    { cwd: root, maxBuffer: LIST_MAX_BUFFER },
  );
  if (res.status !== 0) {
    throw new Error(`vitest list failed (status ${String(res.status)}):\n${res.stderr}`);
  }
  // `vitest list` prefixes each row with its PROJECT (`[tooling] tests/...`) when more than one project
  // is in play, and prints repo-relative paths. Strip both shapes so the caller compares paths to paths.
  return res.stdout
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^\[[^\]]+\]\s*/u, "")
        .replace(`${root}/`, ""),
    )
    .filter((line) => line.endsWith(".test.ts"));
}

/** The projects `tests:node` hands vitest at `changed` scope, READ OFF THE REGISTRY rather than restated —
 *  this test must break when that list changes, which is the whole point of it. */
function scopedProjectFilters(): readonly string[] {
  const stage = stagesForTier("changed").find((row) => row.name === "tests:node");
  if (stage?.scopedArgv === undefined) {
    throw new Error("tests:node has no scoped argv at the changed tier");
  }
  // The REAL selection resolver over an empty explicit set: `tests:node`'s scoped argv reads only
  // `sel.gitRef`, and building the Selection through its own door keeps this fixture the contract's shape
  // rather than a cast past it (`no-test-fabrication`).
  const argv = stage.scopedArgv(resolveSelection({ kind: "file", paths: ["tooling/src/verify/lib/registry.ts"] }));
  if (argv === "whole-only" || argv === "skip-empty") {
    throw new Error(`tests:node scoped argv is ${argv} — it must be a real invocation at the changed tier`);
  }
  return argv.filter((token, index) => argv[index - 1] === "--project" && token !== "");
}

test("the changed tier delegates project ownership to Vitest and still reaches tests/tooling", ({ repoRoot }) => {
  const projects = scopedProjectFilters();
  expect(projects, "no copied project census rides the scoped argv").toEqual([]);

  const selected = listFiles(repoRoot, projects, TOOLING_FILTER);
  expect(
    selected.some((path) => path.startsWith("tests/tooling/")),
    `no tests/tooling file resolved from:\n${selected.join("\n")}`,
  ).toBe(true);
});

test("THE CONTROL: the pre-#1566 project set resolves none of them — the regression is reproducible", ({ repoRoot }) => {
  // Exactly the project list #1523 shipped. This is the state the inner loop was in: the same runner, the
  // same filter, zero files. If this ever finds one, the arm above proves nothing.
  expect(listFiles(repoRoot, ["unit", "integration"], TOOLING_FILTER)).toEqual([]);
  // …and the FILTER is not the reason: `tooling` alone finds it, so the empty above is the project list.
  expect(listFiles(repoRoot, ["tooling"], TOOLING_FILTER).some((path) => path.startsWith("tests/tooling/"))).toBe(true);
});
