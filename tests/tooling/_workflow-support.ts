import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { INSTRUMENT_EXECUTION_COMPONENTS } from "../../tooling/src/verify/contract/instrument-affected.ts";

export function read(repoRoot: string, rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const setupStep = z.object({
  name: z.string().optional(),
  id: z.string().optional(),
  uses: z.string().optional(),
  run: z.string().optional(),
  if: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  with: z.record(z.string(), z.json()).optional(),
});

export function setupSteps(repoRoot: string): z.infer<typeof setupStep>[] {
  return z.object({ runs: z.object({ steps: z.array(setupStep) }) }).parse(parse(read(repoRoot, ".github/actions/setup/action.yml"))).runs.steps;
}

const workflowConfig = z.object({
  jobs: z.record(
    z.string(),
    z.object({
      name: z.string().optional(),
      needs: z.union([z.string(), z.array(z.string())]).optional(),
      if: z.string().optional(),
      env: z.record(z.string(), z.string()).optional(),
      outputs: z.record(z.string(), z.string()).optional(),
      strategy: z
        .object({
          matrix: z.union([
            z.string(),
            z.object({
              shard: z.array(z.number()).optional(),
              include: z.array(z.object({ component: z.enum(INSTRUMENT_EXECUTION_COMPONENTS).optional(), shard: z.string().optional() })).optional(),
            }),
          ]),
        })
        .optional(),
      "timeout-minutes": z.union([z.number(), z.string()]).optional(),
      steps: z.array(setupStep),
    }),
  ),
});

export function workflowJobs(repoRoot: string, name: string): z.infer<typeof workflowConfig>["jobs"] {
  return workflowConfig.parse(parse(read(repoRoot, `.github/workflows/${name}.yml`))).jobs;
}
