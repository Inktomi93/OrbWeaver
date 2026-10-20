import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { z } from "zod";
import { scaledBudget } from "./_load-budget.ts";
import { workflowJobs } from "./_workflow-support.ts";

test("failed or timed-out classification runs every check without granting qualification authority", { timeout: scaledBudget(20_000) }, async ({
  repoRoot,
  scratch,
  fakeBin,
}) => {
  const jobs = workflowJobs(repoRoot, "ci");
  const changes = jobs["changes"];
  const diff = changes?.steps.find((step) => step.id === "diff");
  const command = z.string().parse(diff?.run);
  const gate = z.string().parse(jobs["ci-ok"]?.steps[0]?.run);
  const head = "a".repeat(40);
  const base = "b".repeat(40);
  await fakeBin(
    "pnpm",
    [
      "import fs from 'node:fs';",
      "fs.appendFileSync(process.env.CI_CALLS,JSON.stringify(process.argv.slice(2))+'\\n');",
      "fs.appendFileSync(process.env.GITHUB_OUTPUT,'code='+(process.env.CI_CASE==='code'?'true':'false')+'\\nbase='+process.env.BEFORE+'\\nhead='+process.env.GITHUB_SHA+'\\n');",
      "if(process.env.CI_CASE==='timeout'){setInterval(()=>{},1000);}else if(process.env.CI_CASE==='failure'){process.exitCode=2;}",
    ].join("\n"),
  );
  const runtime = ["node", "node-legacy", "verb-coverage", "ct", "ct-legacy", "e2e-smoke", "e2e-corpus"];
  for (const scenario of ["success", "code", "failure", "timeout"]) {
    const output = join(scratch, `${scenario}-output`);
    const calls = join(scratch, `${scenario}-calls`);
    const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", command], {
      cwd: scratch,
      env: {
        ["GITHUB_SHA"]: head,
        ["BEFORE"]: base,
        ["GITHUB_OUTPUT"]: output,
        ["CI_CASE"]: scenario,
        ["CI_CALLS"]: calls,
        ["CLASSIFICATION_TIMEOUT_SECONDS"]: String(scaledBudget(500) / 1000),
      },
    });
    expect(result.code, `${scenario}: ${result.stderr}`).toBe(0);
    const selected = Object.fromEntries(
      readFileSync(output, "utf8")
        .trim()
        .split("\n")
        .map((line) => line.split("=")),
    );
    const classified = scenario === "success" || scenario === "code";
    expect(selected).toEqual(classified ? { code: String(scenario === "code"), base, head, classified: "true" } : { code: "true", classified: "false" });
    expect(
      readFileSync(calls, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([["exec", "node", "scripts/ci-qualification.ts", "baseline", head, base]]);
    const needs = {
      changes: { result: "success", outputs: selected },
      static: { result: "success" },
      ...Object.fromEntries(runtime.map((id) => [id, { result: selected["code"] === "true" ? "success" : "skipped" }])),
    };
    const verdict = await spawnNiced("bash", ["-euo", "pipefail", "-c", gate], {
      cwd: scratch,
      env: { ["NEEDS"]: JSON.stringify(needs), ["GITHUB_STEP_SUMMARY"]: join(scratch, `${scenario}-summary`) },
    });
    expect(verdict.code, verdict.stderr).toBe(classified ? 0 : 1);
  }
  expect(changes?.outputs?.["classified"]).toBe("${{ steps.diff.outputs.classified }}");
  expect(changes?.["timeout-minutes"]).toBeGreaterThan(5);
  const deadline = z.number().parse(Number(diff?.env?.["CLASSIFICATION_TIMEOUT_SECONDS"]));
  expect(deadline).toBeGreaterThan(0);
  expect(deadline).toBeLessThan(5 * 60);
  for (const id of runtime) {
    expect(jobs[id]?.if).toBe("needs.changes.outputs.code == 'true'");
  }
});
