// Only current-generation main-push product evidence can authorize inherited qualification.
// Publication admits a version baseline, not old tests; unrelated weekly proof never grants or vetoes authority.

import process from "node:process";
import { execGit, GIT_READ_PREFIX, runGit } from "@orb/tooling/_shared/git";
import { budget } from "@orb/tooling/_shared/load-budget";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { z } from "zod";
import type { CiQualificationConfig, QUALIFICATION_AUTHORITIES, QualificationDecision, QualificationMeasurement } from "../contract/qualification.ts";
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
const RUN_PAGE_PROJECTION = `{total_count,workflow_runs:[.workflow_runs[]|{${RUN.keyof()
  .options.map((key) => (key === "repository" ? `repository:(.repository|{${REPOSITORY.keyof().options.join(",")}})` : JSON.stringify(key)))
  .join(",")}}]}`;
const STEP = z.object({ name: z.string(), status: z.string(), conclusion: z.string().nullable() });
const JOB = z.object({
  id: z.number().int().positive(),
  ["run_attempt"]: z.number().int().positive(),
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
const MAX_RUN_BACKED_ANCESTORS = 40;
const API_TIMEOUT_BASE_MS = 10_000;
const METADATA_BUDGET_BASE_MS = 120_000;
const WORKFLOW_PATH = ".github/workflows/ci.yml";
const QUALIFICATION_REQUIREMENTS = {
  qualified: { code: false },
  publication: { code: true },
} as const satisfies Record<(typeof QUALIFICATION_AUTHORITIES)[number], Pick<QualificationDecision, "code">>;

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

function api(root: string, endpoint: string, deadline: number, projection?: string): string {
  const remaining = Math.floor(deadline - performance.now());
  if (remaining < 1) {
    throw new Error("CI qualification metadata discovery exceeded its supported bound");
  }
  const result = runNicedSync("gh", ["api", endpoint, ...(projection === undefined ? [] : ["--jq", projection])], {
    cwd: root,
    timeout: Math.min(budget(API_TIMEOUT_BASE_MS), remaining),
  });
  if (result.status !== 0) {
    throw new Error(`CI qualification metadata unavailable for ${endpoint} (${result.errorCode ?? String(result.status)})`);
  }
  return result.stdout;
}

function runPages(root: string, prefix: string, deadline: number): readonly z.infer<typeof RUN>[] {
  const rows: z.infer<typeof RUN>[] = [];
  let total: number | undefined;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const parsed = RUN_PAGE.parse(JSON.parse(api(root, `${prefix}&per_page=${PAGE_SIZE}&page=${page}`, deadline, RUN_PAGE_PROJECTION)));
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

function mainPushInventory(root: string, config: CiQualificationConfig, workflow: z.infer<typeof WORKFLOW>, deadline: number): readonly z.infer<typeof RUN>[] {
  const rows = runPages(root, `repos/${config.repository}/actions/workflows/${workflow.id}/runs?event=push&branch=main`, deadline);
  // GitHub caps filtered run searches; a saturated inventory cannot prove that omitted ancestors have no run.
  if (rows.length === PAGE_SIZE * MAX_PAGES) {
    throw new Error("CI qualification main-push inventory saturated the API search bound");
  }
  if (
    rows.some((row) => row.workflow_id !== workflow.id || row.repository.full_name !== config.repository || row.event !== "push" || row.head_branch !== "main")
  ) {
    throw new Error("CI qualification main-push inventory has inconsistent provenance");
  }
  return rows;
}

function inventoryIdentity(rows: readonly z.infer<typeof RUN>[]): string {
  return JSON.stringify(rows.toSorted((a, b) => a.id - b.id));
}

function generationStepSucceeded(steps: readonly z.infer<typeof STEP>[], generation: string): boolean {
  const matching = steps.filter((step) => step.name === generation);
  return matching.length === 1 && matching[0]?.status === "completed" && matching[0].conclusion === "success";
}

function proofJobsSucceeded(jobs: readonly z.infer<typeof JOB>[], run: z.infer<typeof RUN>, sha: string, config: CiQualificationConfig): boolean {
  const required = [...config.requiredJobs, ...config.runtimeJobs];
  if (
    required.length === 0 ||
    new Set(required).size !== required.length ||
    jobs.some((job) => job.run_id !== run.id || job.head_sha !== sha || job.run_attempt !== run.run_attempt)
  ) {
    return false;
  }
  const aggregate = jobs.find((job) => job.name === "ci-ok");
  const runtimeMarkers =
    aggregate?.steps.filter((step) => step.name === `${config.generation} (runtime)` || step.name === `${config.generation} (inherited)`) ?? [];
  const marker = runtimeMarkers[0];
  if (runtimeMarkers.length !== 1 || marker?.status !== "completed" || marker.conclusion !== "success") {
    return false;
  }
  const runtimeRequired = marker.name === `${config.generation} (runtime)`;
  for (const name of required) {
    const matching = jobs.filter((job) => job.name === name);
    const marked = matching[0];
    const expected = config.runtimeJobs.includes(name) && !runtimeRequired ? "skipped" : "success";
    if (matching.length !== 1 || marked === undefined || marked.status !== "completed" || marked.conclusion !== expected) {
      return false;
    }
    if (name === "static" && !generationStepSucceeded(marked.steps, config.generation)) {
      return false;
    }
  }
  return true;
}

function qualifiedMainPush(
  root: string,
  sha: string,
  config: CiQualificationConfig,
  { workflow, deadline, discovered }: { readonly workflow: z.infer<typeof WORKFLOW>; readonly deadline: number; readonly discovered?: z.infer<typeof RUN> },
): boolean {
  const runQuery = `repos/${config.repository}/actions/workflows/${workflow.id}/runs?head_sha=${sha}&event=push&branch=main`;
  const run = latestMainPush(runPages(root, runQuery, deadline), sha);
  if (discovered !== undefined && JSON.stringify(run) !== JSON.stringify(discovered)) {
    throw new Error("CI qualification main-push inventory changed before exact-SHA validation");
  }
  if (
    run === undefined ||
    run.workflow_id !== workflow.id ||
    run.repository.full_name !== config.repository ||
    run.status !== "completed" ||
    run.conclusion === null
  ) {
    return false;
  }
  const jobs = jobsForAttempt(root, config.repository, run, deadline);
  if (!proofJobsSucceeded(jobs, run, sha, config)) {
    return false;
  }
  // A partial rerun must not mix successful metadata from the previous attempt with the current aggregate.
  const current = RUN.parse(JSON.parse(api(root, `repos/${config.repository}/actions/runs/${run.id}`, deadline)));
  const latest = latestMainPush(runPages(root, runQuery, deadline), sha);
  return (
    latest?.id === run.id &&
    latest.run_attempt === run.run_attempt &&
    latest.status === "completed" &&
    latest.conclusion === run.conclusion &&
    current.id === run.id &&
    current.workflow_id === workflow.id &&
    current.repository.full_name === config.repository &&
    current.head_sha === sha &&
    current.head_branch === "main" &&
    current.event === "push" &&
    current.run_attempt === run.run_attempt &&
    current.status === "completed" &&
    current.conclusion === run.conclusion
  );
}

/** Check the latest run for this exact SHA, including every required product job and the same attempt's real generation-marked steps. */
export function hasQualifiedMainPush(
  root: string,
  sha: string,
  config: CiQualificationConfig,
  deadline = performance.now() + budget(METADATA_BUDGET_BASE_MS),
): boolean {
  COMMIT_ID.parse(sha);
  const workflow = WORKFLOW.parse(JSON.parse(api(root, `repos/${config.repository}/actions/workflows/ci.yml`, deadline)));
  return qualifiedMainPush(root, sha, config, { workflow, deadline });
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
  const requirement = QUALIFICATION_REQUIREMENTS[authority];
  const code = requirement.code || paths.some((path) => !/^(?:docs\/|\.vscode\/|\.github\/ISSUE_TEMPLATE\/)|\.md$/u.test(path));
  return { ...boundary, eventBase, authority, paths, code };
}

function nearestQualifiedAncestor(root: string, head: string, config: CiQualificationConfig, deadline: number): string | undefined {
  let candidates = 0;
  const candidatesToInspect = currentGenerationAncestors(root, head, config, deadline);
  if (candidatesToInspect.length === 0) {
    return;
  }
  const workflow = WORKFLOW.parse(JSON.parse(api(root, `repos/${config.repository}/actions/workflows/ci.yml`, deadline)));
  const inventory = mainPushInventory(root, config, workflow, deadline);
  const runBacked = candidatesToInspect.flatMap((commit) => {
    const run = latestMainPush(inventory, commit);
    return run === undefined ? [] : [run];
  });
  let qualified: string | undefined;
  // Complete run metadata proves absence for unpublished Git ancestors without spending a candidate on each lane commit.
  for (const discovered of runBacked) {
    if (performance.now() >= deadline) {
      throw new Error("qualified-ancestor discovery exceeded its supported time bound");
    }
    candidates += 1;
    if (candidates > MAX_RUN_BACKED_ANCESTORS) {
      throw new Error("qualified-ancestor discovery exceeded its supported candidate bound");
    }
    if (qualifiedMainPush(root, discovered.head_sha, config, { workflow, deadline, discovered })) {
      qualified = discovered.head_sha;
      break;
    }
  }
  if (inventoryIdentity(mainPushInventory(root, config, workflow, deadline)) !== inventoryIdentity(inventory)) {
    throw new Error("CI qualification main-push inventory changed during discovery");
  }
  return qualified;
}

/** Select the nearest qualified ancestor by Git topology, never the newest unrelated successful run. */
export function resolveCiQualification(root: string, head: string, eventBase: string, config: CiQualificationConfig): QualificationDecision {
  COMMIT_ID.parse(head);
  const deadline = performance.now() + budget(METADATA_BUDGET_BASE_MS);
  try {
    const qualified = nearestQualifiedAncestor(root, head, config, deadline);
    if (qualified !== undefined) {
      return qualificationDecision(root, { head, eventBase, base: qualified, authority: "qualified" });
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
  process.stderr.write("CI qualification: no current-generation qualified ancestor; publication bootstrap requires complete application proof\n");
  return qualificationDecision(root, { head, eventBase, base: config.publication, authority: "publication" });
}
