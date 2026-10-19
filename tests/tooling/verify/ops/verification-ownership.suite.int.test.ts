import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import YAML from "yaml";
import { z } from "zod";
import { applicationPartitionKeys } from "../../../../tooling/src/verify/lib/application-partitions.ts";

const STEP = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  if: z.string().optional(),
  uses: z.string().optional(),
  run: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  with: z.record(z.string(), z.json()).optional(),
  "timeout-minutes": z.number().optional(),
});
const WORKFLOW = z.object({
  env: z.record(z.string(), z.string()),
  on: z.object({ schedule: z.array(z.object({ cron: z.string() })), ["workflow_dispatch"]: z.object({ inputs: z.record(z.string(), z.json()) }) }),
  jobs: z.record(
    z.string(),
    z.object({
      name: z.string().optional(),
      needs: z.union([z.string(), z.array(z.string())]).optional(),
      if: z.string().optional(),
      "runs-on": z.string(),
      "timeout-minutes": z.union([z.number(), z.string()]),
      outputs: z.record(z.string(), z.string()).optional(),
      env: z.record(z.string(), z.string()).optional(),
      strategy: z
        .object({
          matrix: z.union([
            z.string(),
            z.object({ shard: z.array(z.number()).optional(), include: z.array(z.object({ component: z.string(), shard: z.string() })).optional() }),
          ]),
        })
        .optional(),
      steps: z.array(STEP),
    }),
  ),
});
function workflow(root: string): z.infer<typeof WORKFLOW> {
  return WORKFLOW.parse(YAML.parse(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8")));
}
function guard(expression: string, context: object): boolean {
  return Boolean(runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/gu, "").replace(/\.([a-z]+-[a-z-]+)/gu, '["$1"]'), context));
}

test("hosted full markers cannot reuse unversioned full evidence or change product cache identity", ({ repoRoot, scratch }) => {
  const ci = workflow(repoRoot);
  const prefix = ci.env["ORB_CI_FULL_CACHE_PREFIX"];
  expect(prefix).toBe("full-hosted-v1-verified");
  const head = ci.jobs["qualification-head"];
  expect(head?.outputs?.["cache-prefix"]).toBe("${{ steps.sha.outputs.cache-prefix }}");
  expect(head?.steps.find((step) => step.id === "seen")?.with?.["key"]).toBe("${{ steps.sha.outputs.cache-prefix }}-${{ steps.sha.outputs.sha }}");
  expect(ci.jobs["qualification"]?.steps.find((step) => step.uses?.startsWith("actions/cache/save@") === true)?.with?.["key"]).toBe(
    "${{ needs.qualification-head.outputs.cache-prefix }}-${{ needs.qualification-head.outputs.sha }}",
  );
  for (const tier of ["full", "product"]) {
    const output = join(scratch, `${tier}.txt`);
    const result = spawnSync("bash", ["-euo", "pipefail", "-c", head?.steps.find((step) => step.id === "sha")?.run ?? ""], {
      cwd: repoRoot,
      env: inheritedProcessEnv({ ["VERIFY_TIER"]: tier, ["ORB_CI_FULL_CACHE_PREFIX"]: prefix, ["GITHUB_OUTPUT"]: output }),
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(output, "utf8")).toContain(`cache-prefix=${tier === "full" ? prefix : "product-verified"}\n`);
  }
});

test.for(["true", "false"] as const)(
  "product authority requires real runtime success or exactly the inherited skips, independent of weekly: code=%s",
  (code, { repoRoot, scratch }) => {
    const ci = workflow(repoRoot);
    const gate = ci.jobs["ci-ok"];
    if (!Array.isArray(gate?.needs)) {
      throw new Error("missing product aggregate");
    }
    expect(gate.needs).toEqual(["changes", "static", "node", "node-legacy", "verb-coverage", "ct", "ct-legacy", "e2e-smoke", "e2e-corpus"]);
    const expected = code === "true" ? "success" : "skipped";
    for (const subject of gate.needs.slice(2)) {
      for (const result of ["success", "skipped", "cancelled", "failure", "missing"]) {
        const needs = Object.fromEntries(
          gate.needs.map((name) => [name, { result: name === "changes" || name === "static" ? "success" : expected, outputs: { code } }]),
        );
        if (result === "missing") {
          delete needs[subject];
        } else {
          needs[subject] = { result, outputs: { code } };
        }
        const run = spawnSync("bash", ["-e", "-c", gate.steps[0]?.run ?? ""], {
          cwd: scratch,
          env: inheritedProcessEnv({ ["NEEDS"]: JSON.stringify(needs), ["GITHUB_STEP_SUMMARY"]: join(scratch, "summary.md") }),
        });
        expect(run.status, `${code}/${subject}/${result}`).toBe(result === expected ? 0 : 1);
      }
    }
  },
);

test("docs-only native runtime jobs really skip while static remains required", ({ repoRoot }) => {
  const ci = workflow(repoRoot);
  expect(ci.jobs["static"]?.needs).toEqual(["changes"]);
  expect(ci.jobs["static"]?.if).toBeUndefined();
  expect(ci.jobs["static"]?.["timeout-minutes"]).toBe(60);
  for (const name of ["node", "node-legacy", "ct", "ct-legacy", "e2e-smoke", "e2e-corpus"]) {
    expect(ci.jobs[name]?.if).toBe("needs.changes.outputs.code == 'true'");
    expect(ci.jobs[name]?.needs).toBe("changes");
  }
});

test("full/product head freezes main once and all children share its exact-SHA seen decision", ({ repoRoot }) => {
  const ci = workflow(repoRoot);
  const head = ci.jobs["qualification-head"];
  const child = ci.jobs["qualification-partition"];
  expect(head?.steps[0]?.with).toEqual({ ref: "main", "persist-credentials": false });
  expect(head?.steps.find((step) => step.id === "seen")?.with).toMatchObject({
    key: "${{ steps.sha.outputs.cache-prefix }}-${{ steps.sha.outputs.sha }}",
    "lookup-only": true,
  });
  expect(child?.needs).toBe("qualification-head");
  expect(child?.if).toBe("needs.qualification-head.outputs.seen != 'true'");
  expect(child?.strategy?.matrix).toBe("${{ fromJSON(needs.qualification-head.outputs.matrix) }}");
  expect(head?.steps.find((step) => step.id === "plan")?.run).toBe('pnpm exec node scripts/ci-plan.ts "$VERIFY_TIER"');
  expect(applicationPartitionKeys("full")).toHaveLength(14);
  expect(applicationPartitionKeys("product")).toHaveLength(14);
  expect(child?.steps.find((step) => step.id === "source")?.env).toEqual({ ["FROZEN_MAIN_SHA"]: "${{ needs.qualification-head.outputs.sha }}" });
  expect(child?.steps.find((step) => step.id === "source")?.run).toContain('git merge-base --is-ancestor "$FROZEN_MAIN_SHA" refs/remotes/origin/main');
  expect(child?.steps.find((step) => step.id === "source")?.run).toContain('git checkout --detach "$FROZEN_MAIN_SHA"');
});

test("qualification cache cannot save skipped, failed, cancelled or no-verdict aggregates", ({ repoRoot }) => {
  const ci = workflow(repoRoot);
  const aggregate = ci.jobs["qualification"];
  const mark = aggregate?.steps.find((step) => step.id === "mark");
  if (mark?.if === undefined) {
    throw new Error("missing success marker guard");
  }
  expect(aggregate?.if).toBe("always() && needs.qualification-head.result == 'success'");
  expect(aggregate?.steps.find((step) => step.id === "verify")?.run).toBe('pnpm verify --"$VERIFY_TIER" --aggregate=reports/qualification-inputs');
  for (const outcome of ["success", "failure", "cancelled", "skipped"]) {
    for (const child of ["success", "failure", "cancelled", "skipped"]) {
      expect(guard(mark.if, { success: () => true, needs: { "qualification-partition": { result: child } }, steps: { verify: { outcome } } })).toBe(
        outcome === "success" && child === "success",
      );
    }
  }
  expect(aggregate?.steps.find((step) => step.uses?.startsWith("actions/cache/save@") === true)?.if).toBe("success() && steps.mark.outcome == 'success'");
  expect(ci.jobs["qualification-partition"]?.steps.some((step) => step.uses?.startsWith("actions/cache/save@") === true)).toBe(false);
});

test("nightly and independent weekly entry guards do not overlap or admit diagnostics", ({ repoRoot }) => {
  const ci = workflow(repoRoot);
  expect(ci.on.schedule).toEqual([{ cron: "37 9 * * *" }, { cron: "37 10 * * 0" }]);
  expect(ci.on.workflow_dispatch.inputs["select_cpu_diagnostic"]).toBeUndefined();
  expect(ci.jobs["select-cpu-diagnostic"]).toBeUndefined();
  expect(ci.jobs["e2e-startup-diagnostic"]).toBeUndefined();
  for (const [schedule, nightly, weekly] of [
    ["37 9 * * *", true, false],
    ["37 10 * * 0", false, true],
  ] as const) {
    const context = { github: { event: { schedule }, ["event_name"]: "schedule" }, inputs: {} };
    expect(guard(ci.jobs["qualification-head"]?.if ?? "false", context)).toBe(nightly);
    expect(guard(ci.jobs["weekly-head"]?.if ?? "false", context)).toBe(weekly);
  }
  expect(ci.jobs["weekly-tooling"]?.name).toBe("Weekly tooling proof");
  expect(ci.jobs["weekly-tooling"]?.steps.find((step) => step.id === "proof")?.name).toBe("Weekly tooling proof (${{ matrix.component }} ${{ matrix.shard }})");
  expect(ci.jobs["weekly-ok"]?.needs).toEqual(["weekly-head", "weekly-tooling"]);
  expect(ci.jobs["ci-ok"]?.needs).not.toContain("weekly-tooling");
  expect(ci.jobs["weekly-tooling"]?.steps.find((step) => step.id === "source")?.run).toContain('git checkout --detach "$FROZEN_MAIN_SHA"');
  expect(ci.jobs["weekly-tooling"]?.steps.some((step) => step.uses?.startsWith("actions/cache/save@") === true)).toBe(false);
});

test("native runtime jobs retain successful and failed reports and bounded canonical media prerequisites", ({ repoRoot }) => {
  const ci = workflow(repoRoot);
  for (const name of ["node", "node-legacy", "ct", "ct-legacy", "e2e-smoke", "e2e-corpus", "qualification-partition"]) {
    const job = ci.jobs[name];
    expect(job?.["runs-on"], name).toBe("ubuntu-24.04");
    expect(job?.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@") === true)?.if, name).toBe("${{ !cancelled() }}");
  }
  for (const name of ["node", "qualification-partition"]) {
    expect(ci.jobs[name]?.steps.find((step) => step.id === "media")).toMatchObject({ run: "bash scripts/ci/install-media.sh", "timeout-minutes": 15 });
  }
  expect(ci.jobs["node"]?.steps.some((step) => step.run === "pnpm exec node scripts/ci-shard.ts node ${{ matrix.shard }}/1")).toBe(true);
  expect(ci.jobs["ct"]?.steps.some((step) => step.run === "pnpm exec node scripts/ci-shard.ts ct ${{ matrix.shard }}/1")).toBe(true);
  expect(ci.jobs["node-legacy"]?.steps.some((step) => step.run === "pnpm exec node scripts/ci-shard.ts node ${{ matrix.shard }}/3 --population=legacy")).toBe(
    true,
  );
  expect(ci.jobs["ct-legacy"]?.steps.some((step) => step.run === "pnpm exec node scripts/ci-shard.ts ct ${{ matrix.shard }}/5 --population=legacy")).toBe(true);
});

test("partition shell forwards only data and preserves child failure exits", async ({ repoRoot, scratch, fakeBin }) => {
  const ci = workflow(repoRoot);
  const run = ci.jobs["qualification-partition"]?.steps.find((step) => step.id === "verify")?.run ?? "";
  await fakeBin(
    "pnpm",
    "import fs from 'node:fs';fs.writeFileSync('called.json',JSON.stringify(process.argv.slice(2)));process.exitCode=Number(process.env.FIXTURE_EXIT);",
  );
  for (const [partition, shard] of [
    ["static", ""],
    ["node", "1/3"],
    ["ct", "5/5"],
    ["e2e", "3/3"],
  ]) {
    for (const code of [0, 1, 2]) {
      const result = spawnSync("bash", ["-e", "-c", run], {
        cwd: scratch,
        env: inheritedProcessEnv({ ["VERIFY_TIER"]: "full", ["VERIFY_PARTITION"]: partition, ["VERIFY_SHARD"]: shard, ["FIXTURE_EXIT"]: String(code) }),
      });
      expect(result.status).toBe(code);
      expect(JSON.parse(readFileSync(join(scratch, "called.json"), "utf8"))).toEqual([
        "verify",
        "--full",
        `--partition=${partition}`,
        ...(shard === "" ? [] : [`--shard=${shard}`]),
      ]);
    }
  }
});

test("CI failure rendering reads all failed verify stages rather than requiring structure output", ({ repoRoot }) => {
  const ci = workflow(repoRoot);
  const partitionDisplay = ci.jobs["qualification-partition"]?.steps.find((step) => step.name === "Show what failed")?.run ?? "";
  expect(partitionDisplay).toContain("pnpm check:show --stages --limit 20 || echo");
  expect(partitionDisplay).toContain("::warning title=check:show::could not read the stage report; see the reports artifact");
  expect(partitionDisplay).not.toContain("|| true");
  const staticDisplay = ci.jobs["static"]?.steps.find((step) => step.name === "Show what failed")?.run ?? "";
  expect(staticDisplay).toContain("pnpm check:show --stages --limit 20");
  expect(staticDisplay).not.toContain("|| true");
});
