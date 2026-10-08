// The one-off cohort formatter must preserve cases displaced by opt-in native shard boundaries.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

function report(ids: readonly string[], diagnostic = false): string {
  return JSON.stringify({
    config: { rootDir: "/repo/tests" },
    errors: [],
    suites: [
      {
        title: "client/probe.ct.tsx",
        file: "client/probe.ct.tsx",
        specs: ids.map((id) => ({
          id,
          file: "client/probe.ct.tsx",
          title: id,
          tests: [{ projectName: "chromium", annotations: diagnostic && id.startsWith("diagnostic-") ? [{ type: "diagnostic-only" }] : [] }],
        })),
      },
    ],
  });
}

function run(root: string, args: readonly string[]): ReturnType<typeof runNicedSync> {
  return runNicedSync(process.execPath, [join(root, "scripts/select-cpu-diagnostic-context.ts"), ...args], { cwd: root, timeout: scaledBudget(5000) });
}

test("native cohort creation preserves both displaced edge cases and rejects the old narrower opt-in shard", ({ repoRoot, scratch }) => {
  const ordinary = join(scratch, "ordinary.json");
  const optIn = join(scratch, "opt-in.json");
  const selected = join(scratch, "selected.json");
  const list = join(scratch, "cases.list");
  writeFileSync(ordinary, report(["edge-a", "edge-b", "ordinary"]));
  writeFileSync(optIn, report(["ordinary", "diagnostic-success", "diagnostic-fault"], true));
  const made = run(repoRoot, ["create", ordinary, optIn, list]);
  expect(made.status, made.stderr).toBe(0);
  expect(readFileSync(list, "utf8").split("\n").filter(Boolean)).toEqual(
    ["edge-a", "edge-b", "ordinary", "diagnostic-success", "diagnostic-fault"].map((id) => `[chromium] › client/probe.ct.tsx › ${id}`),
  );
  const oldSelection = run(repoRoot, ["verify", ordinary, optIn, optIn]);
  expect(oldSelection.status).toBe(2);
  expect(oldSelection.stderr).toContain("native recollection differs");
  writeFileSync(selected, report(["edge-a", "edge-b", "ordinary", "diagnostic-success", "diagnostic-fault"], true));
  expect(run(repoRoot, ["verify", ordinary, optIn, selected]).status).toBe(0);
});

test("native context refuses a duplicate recollection or a diagnostic registration invisible to collection", ({ repoRoot, scratch }) => {
  const ordinary = join(scratch, "ordinary.json");
  const optIn = join(scratch, "opt-in.json");
  const selected = join(scratch, "selected.json");
  const list = join(scratch, "cases.list");
  writeFileSync(ordinary, report(["ordinary"]));
  writeFileSync(optIn, report(["ordinary", "diagnostic-success", "diagnostic-fault"]));
  const invisible = run(repoRoot, ["create", ordinary, optIn, list]);
  expect(invisible.status).toBe(2);
  expect(invisible.stderr).toContain("expected 2 native diagnostic-only cases, got 0");
  writeFileSync(optIn, report(["ordinary", "diagnostic-success", "diagnostic-fault"], true));
  writeFileSync(selected, report(["ordinary", "ordinary", "diagnostic-success", "diagnostic-fault"], true));
  const duplicate = run(repoRoot, ["verify", ordinary, optIn, selected]);
  expect(duplicate.status).toBe(2);
  expect(duplicate.stderr).toContain("duplicate native CT case ID");
});
