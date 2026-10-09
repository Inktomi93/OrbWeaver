import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { testProcessEnv } from "@orb/tooling/_shared/process-env";
import { LONG_TEST_TIMEOUT_BASE_MS } from "@orb/tooling/_shared/test-tags";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const FILE_PLAN = z.object({
  files: z.array(z.string()),
  shards: z.array(z.array(z.string())),
  selected: z.array(z.string()),
  caseFiles: z.array(z.object({ id: z.string(), file: z.string() })).nullable(),
  caseIds: z.array(z.string()).nullable(),
  selectedCaseIds: z.array(z.string()).nullable(),
});
for (const [runner, count] of [
  ["node", 3],
  ["ct", 5],
] as const) {
  test(`weighted ${runner} native collection is complete, disjoint and selects exactly one nonempty shard`, {
    timeout: scaledBudget(LONG_TEST_TIMEOUT_BASE_MS),
  }, ({ repoRoot }) => {
    const result = runNicedSync(process.execPath, [join(repoRoot, "scripts/ci-shard.ts"), runner, `1/${count}`, "--list"], {
      cwd: repoRoot,
      env: testProcessEnv(),
      maxBuffer: 67_108_864,
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const plan = FILE_PLAN.parse(JSON.parse(readFileSync(join(repoRoot, "reports/ci-shard.json"), "utf8")));
    expect(plan.files.length).toBeGreaterThan(0);
    expect(plan.shards).toHaveLength(count);
    expect(plan.shards.every((shard) => shard.length > 0)).toBe(true);
    expect(plan.shards.flat().sort()).toEqual([...plan.files].sort());
    expect(new Set(plan.shards.flat()).size).toBe(plan.files.length);
    expect(plan.selected).toEqual(plan.shards[0]);
    expect(plan.caseIds === null).toBe(runner === "node");
    expect(plan.selectedCaseIds === null).toBe(runner === "node");
    expect((plan.caseIds ?? []).length).toBeGreaterThanOrEqual(runner === "ct" ? 1 : 0);
    expect(new Set(plan.caseIds ?? []).size).toBe((plan.caseIds ?? []).length);
    expect((plan.selectedCaseIds ?? []).length).toBeGreaterThanOrEqual(runner === "ct" ? 1 : 0);
    expect(plan.selectedCaseIds).toEqual(plan.caseFiles?.filter((row) => plan.selected.includes(row.file)).map((row) => row.id) ?? null);
  });
}
test("full non-live E2E mode partitions close the native case population without booting a stack", { timeout: scaledBudget(LONG_TEST_TIMEOUT_BASE_MS) }, ({
  repoRoot,
}) => {
  const result = runNicedSync(process.execPath, [join(repoRoot, "scripts/ci-shard.ts"), "e2e", "1/3", "--list"], {
    cwd: repoRoot,
    env: testProcessEnv(),
    maxBuffer: 67_108_864,
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const plan = z
    .object({
      projects: z.array(z.string()),
      selected: z.string(),
      cases: z.array(z.object({ id: z.string(), project: z.string() })),
      selectedCases: z.array(z.object({ id: z.string(), project: z.string() })),
    })
    .parse(JSON.parse(readFileSync(join(repoRoot, "reports/ci-shard.json"), "utf8")));
  expect(plan.projects).toEqual(["forward-header", "local", "single-user"]);
  expect(plan.cases.length).toBeGreaterThan(0);
  expect([...new Set(plan.cases.map((row) => row.project))].sort()).toEqual(plan.projects);
  expect(plan.selectedCases.map((row) => row.id)).toEqual(plan.cases.filter((row) => row.project === plan.selected).map((row) => row.id));
  expect(plan.selectedCases.every((row) => row.project === plan.selected)).toBe(true);
  expect(new Set(plan.cases.map((row) => row.id)).size).toBe(plan.cases.length);
});

for (const [runner, count, childExit, expectedExit] of [
  ["node", 3, 1, 1],
  ["ct", 5, 2, 2],
  ["e2e", 3, 137, 2],
] as const) {
  test(`${runner} execution forwards the natively collected shard to its real runner door and classifies failure and no-verdict exits`, {
    timeout: scaledBudget(LONG_TEST_TIMEOUT_BASE_MS),
  }, async ({ repoRoot, scratch, fakeBin }) => {
    const output = join(scratch, "execution.json");
    await fakeBin(
      "pnpm",
      "import fs from 'node:fs';fs.writeFileSync(process.env.FIXTURE_SHARD_CALLS,JSON.stringify({argv:process.argv.slice(2),live:process.env.E2E_LIVE,dev:process.env.E2E_ALLOW_DEV_TARGET}));process.exitCode=Number(process.env.FIXTURE_SHARD_EXIT);",
    );
    const result = runNicedSync(process.execPath, [join(repoRoot, "scripts/ci-shard.ts"), runner, `1/${count}`], {
      cwd: repoRoot,
      env: testProcessEnv({ ["FIXTURE_SHARD_CALLS"]: output, ["FIXTURE_SHARD_EXIT"]: String(childExit) }),
      maxBuffer: 67_108_864,
    });
    expect(result.status, result.stdout + result.stderr).toBe(expectedExit);
    const call = z
      .object({ argv: z.array(z.string()), live: z.string().optional(), dev: z.string().optional() })
      .parse(JSON.parse(readFileSync(output, "utf8")));
    const plan = z
      .object({ selected: z.union([z.string(), z.array(z.string())]) })
      .parse(JSON.parse(readFileSync(join(repoRoot, "reports/ci-shard.json"), "utf8")));
    const files = Array.isArray(plan.selected) ? plan.selected : [];
    const expected = {
      node: ["test:node", ...files],
      ct: ["test:ct", ...files.map((file) => `${RegExp.escape(file)}$`), "--config=playwright-ct.product.config.ts", "--retries=2"],
      e2e: ["e2e", `--project=${String(plan.selected)}`],
    };
    expect(call.argv).toEqual(expected[runner]);
    expect({ live: call.live, dev: call.dev }).toEqual(runner === "e2e" ? { live: "0", dev: "0" } : { live: undefined, dev: undefined });
  });
}
