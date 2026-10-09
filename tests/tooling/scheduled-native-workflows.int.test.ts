import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

const stepSchema = z.object({
  id: z.string().optional(),
  if: z.string().optional(),
  run: z.string().optional(),
  uses: z.string().optional(),
  with: z.record(z.string(), z.json()).optional(),
});
const workflowSchema = z.object({
  on: z.object({ schedule: z.array(z.object({ cron: z.string() })) }).loose(),
  jobs: z.record(z.string(), z.object({ needs: z.union([z.string(), z.array(z.string())]).optional(), steps: z.array(stepSchema) })),
});

for (const [name, cron, proofJobs] of [
  ["install", "23 10 * * *", ["source", "docker"]],
  ["contributor", "53 10 * * 0", ["contributor"]],
] as const) {
  test(`${name} schedules freeze main and only cache completed exact-SHA native proof`, ({ repoRoot }) => {
    const workflow = workflowSchema.parse(parse(readFileSync(join(repoRoot, `.github/workflows/${name}.yml`), "utf8")));
    expect(workflow.on.schedule).toEqual([{ cron }]);
    const selector = z.string().parse(workflow.jobs["head"]?.steps[0]?.with?.["ref"]);
    const expression = selector.replace(/^\$\{\{\s*|\s*\}\}$/gu, "");
    for (const event of ["schedule", "workflow_dispatch"]) {
      expect(runInNewContext(expression, { github: { ["event_name"]: event, sha: "selected-sha" } })).toBe(event === "schedule" ? "main" : "selected-sha");
    }
    for (const jobName of proofJobs) {
      const job = workflow.jobs[jobName];
      expect(job?.needs).toContain("head");
      const steps = job?.steps ?? [];
      const seen = steps.find((step) => step.id === "seen");
      expect(seen?.if).toBe("github.event_name == 'schedule'");
      expect(seen?.with?.["lookup-only"]).toBe(true);
      expect(seen?.with?.["restore-keys"]).toBeUndefined();
      expect(seen?.with?.["key"]).toContain("needs.head.outputs.sha");
      const mark = steps.find((step) => step.id === "mark");
      const save = steps.find((step) => step.uses?.startsWith("actions/cache/save@") === true);
      expect(save?.if).toBe("success() && steps.mark.outcome == 'success'");
      expect(save?.with?.["key"]).toBe(seen?.with?.["key"]);
      for (const [success, event, hit, accepted] of [
        [true, "schedule", "false", true],
        [false, "schedule", "false", false],
        [true, "workflow_dispatch", "false", false],
        [true, "schedule", "true", false],
      ] as const) {
        expect(
          runInNewContext((mark?.if ?? "false").replaceAll(".outputs.cache-hit", '.outputs["cache-hit"]'), {
            success: () => success,
            github: { ["event_name"]: event },
            steps: { seen: { outputs: { "cache-hit": hit } } },
          }),
        ).toBe(accepted);
      }
    }
  });
}

test("Docker install checks out the immutable published release source and runs a pinned image", ({ repoRoot }) => {
  const workflow = workflowSchema.parse(parse(readFileSync(join(repoRoot, ".github/workflows/install.yml"), "utf8")));
  const docker = workflow.jobs["docker"];
  expect(docker?.steps[0]?.with?.["ref"]).toBe("${{ needs.head.outputs.release_tag }}");
  const proof = docker?.steps.find((step) => step.id === "image");
  expect(proof?.run).toContain("git rev-parse HEAD");
  expect(proof?.run).toContain('.commit == $sha and .channel == "stable"');
  expect(proof?.run).toContain("ORB_IMAGE=$image@$digest");
  expect(readFileSync(join(repoRoot, ".github/workflows/install.yml"), "utf8")).not.toContain("windows_proof_repetitions");
});
