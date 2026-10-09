// CI baseline selection and release promotion share one metadata predicate and workflow-owned generation.
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { execGit, GIT_READ_PREFIX } from "@orb/tooling/_shared/git";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { runTool, UsageError } from "@orb/tooling/_shared/run-tool";
import { hasQualifiedMainPush, resolveCiQualification } from "@orb/tooling/verify";
import YAML from "yaml";
import { z } from "zod";
import type { CiQualificationConfig, CiQualificationJobGroup } from "../tooling/src/verify/contract/qualification.ts";

const RUNTIME_CONDITION = "needs.changes.outputs.code == 'true'";
const JOB = z.object({
  name: z.string().optional(),
  needs: z.union([z.string(), z.array(z.string())]).optional(),
  if: z.string().optional(),
  strategy: z.object({ matrix: z.union([z.string(), z.object({ shard: z.array(z.number().int().positive()).optional() })]) }).optional(),
});
const WORKFLOW = z.object({
  jobs: z.record(z.string(), JOB),
  env: z.object({
    ORB_CI_REPOSITORY: z.literal("Inktomi93/OrbWeaver"),
    ORB_CI_QUALIFICATION_GENERATION: z.string().regex(/^Orbweaver qualification [a-z0-9-]+$/u),
    ORB_CI_PUBLICATION_BOOTSTRAP_SHA: z.string().regex(/^[0-9a-f]{40}$/u),
  }),
});

function jobNames(id: string, job: z.infer<typeof JOB>): readonly string[] {
  const matrix = job.strategy?.matrix;
  if (typeof matrix === "string") {
    throw new Error(`unexpanded dynamic product qualification population ${id}`);
  }
  const shards = matrix?.shard;
  const names =
    shards === undefined
      ? [job.name ?? id]
      : shards.map((shard) => (job.name ?? id).replace("${{ matrix.shard }}", String(shard)).replace("${{ strategy.job-total }}", String(shards.length)));
  if (names.length === 0 || names.some((name) => name.includes("${{")) || new Set(names).size !== names.length) {
    throw new Error(`ambiguous product qualification population ${id}`);
  }
  return names;
}

function productJobs(jobs: z.infer<typeof WORKFLOW>["jobs"]): Pick<CiQualificationConfig, "requiredJobs" | "runtimeJobs" | "runtimeJobGroups"> {
  const requiredJobs = ["ci-ok"];
  const runtimeJobs: string[] = [];
  const runtimeJobGroups: CiQualificationJobGroup[] = [];
  const needs = jobs["ci-ok"]?.needs;
  if (!(Array.isArray(needs) && ["changes", "static", "node", "ct", "e2e-smoke"].every((id) => needs.includes(id)))) {
    throw new Error("product qualification requires the closed changes/static/runtime/smoke aggregate");
  }
  if (jobs["static"]?.if !== undefined || JSON.stringify(jobs["static"]?.needs) !== JSON.stringify(["changes"])) {
    throw new Error("static product qualification must depend only on changes and cannot be conditional");
  }
  for (const id of needs) {
    const job = jobs[id];
    if (job === undefined || (id !== "changes" && job.if !== undefined && job.if !== RUNTIME_CONDITION)) {
      throw new Error(`unsupported product qualification job ${id}`);
    }
    const names = jobNames(id, job);
    if (job.if === RUNTIME_CONDITION) {
      runtimeJobs.push(...names);
      runtimeJobGroups.push({ name: job.name ?? id, jobs: names });
    } else {
      requiredJobs.push(...names);
    }
  }
  return { requiredJobs, runtimeJobs, runtimeJobGroups };
}
const HISTORICAL_GENERATION = z.object({ env: z.object({ ORB_CI_QUALIFICATION_GENERATION: z.string().optional() }).optional() });

await runTool(() => {
  const [mode, head, eventBase = ""] = process.argv.slice(2);
  if ((mode !== "baseline" && mode !== "release") || head === undefined) {
    throw new UsageError("ci-qualification requires baseline|release <tested-sha> [event-base]");
  }
  const root = process.cwd();
  if (eventBase !== "" && !/^[0-9a-f]{40,64}$/u.test(eventBase)) {
    throw new UsageError("CI event base must be empty or a commit ID");
  }
  if (head !== execGit(root, [...GIT_READ_PREFIX, "rev-parse", "HEAD"]).trim()) {
    throw new UsageError("CI qualification head differs from the tested HEAD");
  }
  const { env, jobs } = WORKFLOW.parse(YAML.parse(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8")));
  const config = {
    repository: env.ORB_CI_REPOSITORY,
    generation: env.ORB_CI_QUALIFICATION_GENERATION,
    publication: env.ORB_CI_PUBLICATION_BOOTSTRAP_SHA,
    ...productJobs(jobs),
    hasCurrentGeneration: (source: string): boolean =>
      HISTORICAL_GENERATION.parse(YAML.parse(source)).env?.ORB_CI_QUALIFICATION_GENERATION === env.ORB_CI_QUALIFICATION_GENERATION,
  };
  if (mode === "release") {
    if (!hasQualifiedMainPush(root, head, config)) {
      process.stderr.write(`release: CI for ${head} is not green under the current qualification generation\n`);
      return 1;
    }
    return 0;
  }
  const decision = resolveCiQualification(root, head, eventBase, config);
  const output = [
    `base=${decision.base}`,
    `head=${decision.head}`,
    `event_base=${eventBase}`,
    `code=${String(decision.code)}`,
    `authority=${decision.authority}`,
  ].join("\n");
  process.stdout.write(`${output}\n`);
  const destination = inheritedProcessEnv()["GITHUB_OUTPUT"];
  if (destination !== undefined) {
    appendFileSync(destination, `${output}\n`);
  }
  return 0;
});
