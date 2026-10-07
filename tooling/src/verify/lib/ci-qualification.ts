// Only current-generation main-push workflow success can authorize inherited qualification.
// Publication admits a version baseline, not old test success; it requires complete current proof.

import process from "node:process";
import { execGit, GIT_READ_PREFIX, runGit } from "@orb/tooling/_shared/git";
import { budget } from "@orb/tooling/_shared/load-budget";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { z } from "zod";
import type { CiQualificationConfig, QualificationDecision, QualificationMeasurement } from "../contract/qualification.ts";
import { VERIFY_BASE_ENV, VERIFY_HEAD_ENV } from "../contract/selection.ts";
import { resolveMeasurementBoundary } from "./repo-paths.ts";

const COMMIT_ID = z
  .string()
  .regex(/^[0-9a-f]{40,64}$/u)
  .refine((value) => !/^0+$/u.test(value));
const REPOSITORY = z.object({ ["full_name"]: z.string() });
const RUN = z.object({
  id: z.number().int().positive(),
  ["workflow_id"]: z.number().int().positive(),
  ["run_attempt"]: z.number().int().positive(),
  ["head_sha"]: COMMIT_ID,
  ["head_branch"]: z.string().nullable(),
  event: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  repository: REPOSITORY,
});
const RUN_PAGE = z.object({ ["total_count"]: z.number().int().nonnegative(), ["workflow_runs"]: z.array(RUN) });
const STEP = z.object({ name: z.string(), status: z.string(), conclusion: z.string().nullable() });
const JOB = z.object({
  id: z.number().int().positive(),
  ["run_id"]: z.number().int().positive(),
  ["head_sha"]: COMMIT_ID,
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  steps: z.array(STEP),
});
const JOB_PAGE = z.object({ ["total_count"]: z.number().int().nonnegative(), jobs: z.array(JOB) });
const WORKFLOW = z.object({ id: z.number().int().positive(), path: z.literal(".github/workflows/ci.yml") });
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const MAX_ANCESTORS = 40;
const API_TIMEOUT_BASE_MS = 10_000;
const METADATA_BUDGET_BASE_MS = 120_000;
const WORKFLOW_PATH = ".github/workflows/ci.yml";

function commitHasGeneration(root: string, commit: string, config: CiQualificationConfig): boolean {
  const entry = execGit(root, [...GIT_READ_PREFIX, "ls-tree", commit, "--", WORKFLOW_PATH]).trim();
  return entry !== "" && config.hasCurrentGeneration(execGit(root, [...GIT_READ_PREFIX, "show", `${commit}:${WORKFLOW_PATH}`]));
}

function currentGenerationAncestors(root: string, head: string, config: CiQualificationConfig, deadline: number): readonly string[] {
  const graph = execGit(root, [...GIT_READ_PREFIX, "rev-list", "--topo-order", "--parents", head])
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.split(" "));
  const revisions = new Set(
    execGit(root, [...GIT_READ_PREFIX, "log", "--full-history", "--format=%H", head, "--", WORKFLOW_PATH])
      .trim()
      .split(/\r?\n/u)
      .filter(Boolean),
  );
  const current = new Set<string>();
  const order: string[] = [];
  for (const [commit, ...parents] of graph.toReversed()) {
    if (commit === undefined) {
      throw new Error("qualified ancestry contains an incomplete Git commit row");
    }
    if (performance.now() >= deadline) {
      throw new Error("qualified-ancestor discovery exceeded its supported time bound");
    }
    order.push(commit);
    const inherited = parents.some((parent) => current.has(parent));
    // Unlisted commits inherit an unchanged parent workflow; mixed-generation merges require their own tree.
    const inspect = revisions.has(commit) || (inherited && parents.some((parent) => !current.has(parent)));
    if (inspect ? commitHasGeneration(root, commit, config) : inherited) {
      current.add(commit);
    }
  }
  return order.toReversed().filter((commit) => commit !== head && current.has(commit));
}

function latestMainPush(runs: readonly z.infer<typeof RUN>[], sha: string): z.infer<typeof RUN> | undefined {
  return runs.filter((row) => row.head_sha === sha && row.event === "push" && row.head_branch === "main").toSorted((a, b) => b.id - a.id)[0];
}

function api(root: string, endpoint: string, deadline: number): string {
  const remaining = Math.floor(deadline - performance.now());
  if (remaining < 1) {
    throw new Error("CI qualification metadata discovery exceeded its supported bound");
  }
  const result = runNicedSync("gh", ["api", endpoint], { cwd: root, timeout: Math.min(budget(API_TIMEOUT_BASE_MS), remaining) });
  if (result.status !== 0) {
    throw new Error(`CI qualification metadata unavailable for ${endpoint} (${String(result.status)})`);
  }
  return result.stdout;
}

function runPages(root: string, prefix: string, deadline: number): readonly z.infer<typeof RUN>[] {
  const rows: z.infer<typeof RUN>[] = [];
  let total: number | undefined;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const parsed = RUN_PAGE.parse(JSON.parse(api(root, `${prefix}&per_page=${PAGE_SIZE}&page=${page}`, deadline)));
    total ??= parsed.total_count;
    if (parsed.total_count !== total || (parsed.workflow_runs.length === 0 && rows.length < total)) {
      throw new Error("CI qualification run pagination is incomplete or changed during the read");
    }
    rows.push(...parsed.workflow_runs);
    if (rows.length === total && new Set(rows.map((run) => run.id)).size === rows.length) {
      return rows;
    }
  }
  throw new Error("CI qualification run pagination exceeds the supported bound");
}

function jobsForAttempt(root: string, repository: string, run: z.infer<typeof RUN>, deadline: number): readonly z.infer<typeof JOB>[] {
  const jobs: z.infer<typeof JOB>[] = [];
  let total: number | undefined;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const parsed = JOB_PAGE.parse(
      JSON.parse(api(root, `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=${PAGE_SIZE}&page=${page}`, deadline)),
    );
    total ??= parsed.total_count;
    if (parsed.total_count !== total || (parsed.jobs.length === 0 && jobs.length < total)) {
      throw new Error("CI qualification job pagination is incomplete or changed during the read");
    }
    jobs.push(...parsed.jobs);
    if (jobs.length === total && new Set(jobs.map((job) => job.id)).size === jobs.length) {
      return jobs;
    }
  }
  throw new Error("CI qualification job pagination exceeds the supported bound");
}

/** Check the latest run for this exact SHA, including smoke via whole-workflow success and one attempt's real static step. */
export function hasQualifiedMainPush(
  root: string,
  sha: string,
  config: CiQualificationConfig,
  deadline = performance.now() + budget(METADATA_BUDGET_BASE_MS),
): boolean {
  COMMIT_ID.parse(sha);
  const workflow = WORKFLOW.parse(JSON.parse(api(root, `repos/${config.repository}/actions/workflows/ci.yml`, deadline)));
  const runQuery = `repos/${config.repository}/actions/workflows/${workflow.id}/runs?head_sha=${sha}&event=push&branch=main`;
  const run = latestMainPush(runPages(root, runQuery, deadline), sha);
  if (
    run === undefined ||
    run.workflow_id !== workflow.id ||
    run.repository.full_name !== config.repository ||
    run.status !== "completed" ||
    run.conclusion !== "success"
  ) {
    return false;
  }
  const jobs = jobsForAttempt(root, config.repository, run, deadline);
  const staticJobs = jobs.filter((job) => job.name === "static");
  const marked = staticJobs[0];
  if (
    staticJobs.length !== 1 ||
    marked === undefined ||
    jobs.some((job) => job.run_id !== run.id || job.head_sha !== sha) ||
    marked.status !== "completed" ||
    marked.conclusion !== "success"
  ) {
    return false;
  }
  const steps = marked.steps.filter((step) => step.name === config.generation);
  if (steps.length !== 1 || steps[0]?.status !== "completed" || steps[0].conclusion !== "success") {
    return false;
  }
  // A partial rerun must not mix successful metadata from the previous attempt with the current aggregate.
  const current = RUN.parse(JSON.parse(api(root, `repos/${config.repository}/actions/runs/${run.id}`, deadline)));
  const latest = latestMainPush(runPages(root, runQuery, deadline), sha);
  return (
    latest?.id === run.id &&
    latest.run_attempt === run.run_attempt &&
    latest.status === "completed" &&
    latest.conclusion === "success" &&
    current.id === run.id &&
    current.workflow_id === workflow.id &&
    current.repository.full_name === config.repository &&
    current.head_sha === sha &&
    current.head_branch === "main" &&
    current.event === "push" &&
    current.run_attempt === run.run_attempt &&
    current.status === "completed" &&
    current.conclusion === "success"
  );
}

/** Validate immutable measurement inputs before using the cumulative qualified or admitted publication delta. */
export function qualificationDecision(root: string, { head, eventBase, base, authority }: QualificationMeasurement): QualificationDecision {
  const boundary = resolveMeasurementBoundary(root, { [VERIFY_BASE_ENV]: base, [VERIFY_HEAD_ENV]: head });
  if (boundary === null) {
    throw new Error("CI qualification requires a measurement boundary");
  }
  const paths = execGit(root, [...GIT_READ_PREFIX, "diff", "--name-only", "--no-renames", "-z", base, head])
    .split("\0")
    .filter(Boolean);
  const code = authority === "publication" || paths.some((path) => !/^(?:docs\/|\.vscode\/|\.github\/ISSUE_TEMPLATE\/)|\.md$/u.test(path));
  return { ...boundary, eventBase, authority, paths, code, toolMode: authority === "publication" ? "full" : "affected" };
}

/** Select the nearest qualified ancestor by Git topology, never the newest unrelated successful run. */
export function resolveCiQualification(root: string, head: string, eventBase: string, config: CiQualificationConfig): QualificationDecision {
  COMMIT_ID.parse(head);
  const deadline = performance.now() + budget(METADATA_BUDGET_BASE_MS);
  let candidates = 0;
  try {
    const candidatesToInspect = currentGenerationAncestors(root, head, config, deadline);
    for (const ancestor of candidatesToInspect) {
      if (performance.now() >= deadline) {
        throw new Error("qualified-ancestor discovery exceeded its supported time bound");
      }
      candidates += 1;
      if (candidates > MAX_ANCESTORS) {
        throw new Error("qualified-ancestor discovery exceeded its supported candidate bound");
      }
      if (hasQualifiedMainPush(root, ancestor, config, deadline)) {
        return qualificationDecision(root, { head, eventBase, base: ancestor, authority: "qualified" });
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `CI qualification refused: qualified ancestry is ambiguous (${reason}); restore metadata or resolve the discovery limit before qualification`,
      {
        cause: error,
      },
    );
  }
  COMMIT_ID.parse(config.publication);
  if (runGit(root, [...GIT_READ_PREFIX, "merge-base", "--is-ancestor", config.publication, head]).status !== 0) {
    throw new Error("CI qualification refused: no current-generation qualified ancestor; admitted publication is not an ancestor of tested HEAD");
  }
  process.stderr.write("CI qualification: no current-generation qualified ancestor; publication bootstrap requires complete tools and application proof\n");
  return qualificationDecision(root, { head, eventBase, base: config.publication, authority: "publication" });
}
