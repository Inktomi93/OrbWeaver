import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { hasQualifiedMainPush, qualificationDecision, resolveCiQualification, selectAffectedInstrumentTests } from "@orb/tooling/verify";
import type { CiQualificationConfig } from "../../../../tooling/src/verify/contract/qualification.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("failed tool A followed by application B carries A's tool bytes into qualification", async ({ scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  execFixtureGit(scratch, ["init", "--initial-branch=main"]);
  execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
  execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
  writeFileSync(join(scratch, ".gitignore"), "fake-bin\nci-*\n");
  mkdirSync(join(scratch, ".github/workflows"), { recursive: true });
  writeFileSync(join(scratch, ".github/workflows/ci.yml"), "env: { ORB_CI_QUALIFICATION_GENERATION: current }\n");
  writeFileSync(join(scratch, "baseline.txt"), "baseline");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "baseline"]);
  const base = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  mkdirSync(join(scratch, "tests/tooling"), { recursive: true });
  writeFileSync(join(scratch, "tests/tooling/broken.test.ts"), "throw new Error('broken');");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "failed tool A"]);
  const eventBase = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  mkdirSync(join(scratch, "packages/client/src"), { recursive: true });
  writeFileSync(join(scratch, "packages/client/src/app.ts"), "export const app = true;");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "application B"]);
  const head = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  writeFileSync(
    join(scratch, "ci-api.json"),
    JSON.stringify({
      ...metadata(base),
      [`${API_ROOT}/workflows/7/runs?head_sha=${eventBase}&event=push&branch=main&per_page=100&page=1`]: {
        ["total_count"]: 1,
        ["workflow_runs"]: [{ ...goodRun(eventBase, 2), conclusion: "failure" }],
      },
    }),
  );
  const decision = resolveCiQualification(scratch, head, eventBase, {
    repository: REPOSITORY,
    generation: GENERATION,
    publication: base,
    hasCurrentGeneration: () => true,
  });
  expect(decision).toMatchObject({ base, head, eventBase, code: true, toolMode: "affected" });
  expect(decision.paths).toContain("tests/tooling/broken.test.ts");
  expect(selectAffectedInstrumentTests(scratch, decision.paths).specs).toEqual(["tests/tooling/broken.test.ts"]);
  expect(readFileSync(join(scratch, "tests/tooling/broken.test.ts"), "utf8")).toContain("broken");
});

const REPOSITORY = "Inktomi93/OrbWeaver";
const GENERATION = "Orbweaver qualification ancestor-v1";
const API_ROOT = `repos/${REPOSITORY}/actions`;
const SHA = "a".repeat(40);

const RUN_SAMPLE = {
  id: 1,
  ["workflow_id"]: 7,
  ["run_attempt"]: 2,
  ["head_sha"]: SHA,
  ["head_branch"]: "main",
  event: "push",
  status: "completed",
  conclusion: "success",
  repository: { ["full_name"]: REPOSITORY },
};

function goodRun(sha = SHA, id = 1): typeof RUN_SAMPLE {
  return { ...RUN_SAMPLE, id, ["head_sha"]: sha };
}

const JOB_SAMPLE = {
  id: 1,
  ["run_id"]: 1,
  ["head_sha"]: SHA,
  name: "static",
  status: "completed",
  conclusion: "success",
  steps: [{ name: GENERATION, status: "completed", conclusion: "success" }],
};

function goodJob(sha = SHA, id = 1): typeof JOB_SAMPLE {
  return { ...JOB_SAMPLE, id, ["head_sha"]: sha };
}

function metadata(sha = SHA): object {
  const run = goodRun(sha);
  return {
    [`${API_ROOT}/workflows/ci.yml`]: { id: 7, path: ".github/workflows/ci.yml" },
    [`${API_ROOT}/workflows/7/runs?head_sha=${sha}&event=push&branch=main&per_page=100&page=1`]: { ["total_count"]: 1, ["workflow_runs"]: [run] },
    [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: 1, jobs: [goodJob(sha)] },
    [`${API_ROOT}/runs/1`]: run,
  };
}

const API_FIXTURE = [
  "import fs from 'node:fs';const [command,endpoint]=process.argv.slice(2);",
  "fs.appendFileSync('ci-requests.jsonl',JSON.stringify([command,endpoint])+'\\n');",
  "const responses=JSON.parse(fs.readFileSync('ci-api.json','utf8'));",
  "if(command!=='api'||!(endpoint in responses))process.exit(74);",
  "process.stdout.write(JSON.stringify(responses[endpoint]));",
].join("\n");

test("the shared qualifier rejects false authority and partial reruns, and paginates the exact run attempt", async ({ scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  const config = { repository: REPOSITORY, generation: GENERATION, publication: SHA, hasCurrentGeneration: () => true };
  const check = (responses: object): boolean => {
    writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(responses));
    return hasQualifiedMainPush(scratch, SHA, config);
  };
  expect(check(metadata())).toBe(true);
  const runUrl = `${API_ROOT}/workflows/7/runs?head_sha=${SHA}&event=push&branch=main&per_page=100&page=1`;
  const jobsUrl = `${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`;
  for (const patch of [
    { status: "in_progress", conclusion: null },
    { conclusion: "failure" },
    { conclusion: "cancelled" },
    { ["head_sha"]: "b".repeat(40) },
    { event: "pull_request" },
    { event: "schedule" },
    { event: "workflow_dispatch" },
    { ["head_branch"]: "release" },
    { ["workflow_id"]: 8 },
    { repository: { ["full_name"]: "another/repository" } },
  ]) {
    expect(check({ ...metadata(), [runUrl]: { ["total_count"]: 1, ["workflow_runs"]: [{ ...goodRun(), ...patch }] } }), JSON.stringify(patch)).toBe(false);
  }
  for (const patch of [
    { steps: [{ name: "Orbweaver qualification old", status: "completed", conclusion: "success" }] },
    { steps: [{ name: GENERATION, status: "completed", conclusion: "skipped" }] },
    { steps: [] },
    { status: "completed", conclusion: "skipped" },
    { ["run_id"]: 2 },
    { ["head_sha"]: "b".repeat(40) },
  ]) {
    expect(check({ ...metadata(), [jobsUrl]: { ["total_count"]: 1, jobs: [{ ...goodJob(), ...patch }] } }), JSON.stringify(patch)).toBe(false);
  }
  expect(check({ ...metadata(), [runUrl]: { ["total_count"]: 2, ["workflow_runs"]: [goodRun(), { ...goodRun(SHA, 2), conclusion: "failure" }] } })).toBe(false);
  expect(check({ ...metadata(), [`${API_ROOT}/runs/1`]: { ...goodRun(), ["run_attempt"]: 3 } })).toBe(false);
  expect(check({ ...metadata(), [jobsUrl]: { ["total_count"]: 0, jobs: [] } })).toBe(false);
  expect(() => check({ ...metadata(), [jobsUrl]: { ["total_count"]: 1, jobs: [] } })).toThrow("incomplete");
  expect(() => check({ ...metadata(), [runUrl]: { ["total_count"]: 1, ["workflow_runs"]: [{ ...goodRun(), ["run_attempt"]: undefined }] } })).toThrow();
  expect(() => check({})).toThrow("metadata unavailable");
  const others = Array.from({ length: 100 }, (_, index) => ({ ...goodJob(SHA, index + 2), name: `other-${index}`, steps: [] }));
  expect(
    check({
      ...metadata(),
      [jobsUrl]: { ["total_count"]: 101, jobs: others },
      [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=2`]: { ["total_count"]: 101, jobs: [goodJob()] },
    }),
  ).toBe(true);
  expect(readFileSync(join(scratch, "ci-requests.jsonl"), "utf8")).toContain("/runs/1/attempts/2/jobs?per_page=100&page=2");
  expect(readFileSync(join(scratch, "ci-requests.jsonl"), "utf8")).not.toContain("/attempts/1/");
});

test("failed application A then docs B cannot skip runtime; a qualified ancestor permits a later docs-only skip", async ({ scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  writeFileSync(join(scratch, ".gitignore"), "fake-bin\nci-*\n");
  mkdirSync(join(scratch, ".github/workflows"), { recursive: true });
  writeFileSync(join(scratch, ".github/workflows/ci.yml"), "env: { ORB_CI_QUALIFICATION_GENERATION: current }\n");
  execFixtureGit(scratch, ["init", "--initial-branch=main"]);
  execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
  execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "qualified base"]);
  const base = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  const config: CiQualificationConfig = { repository: REPOSITORY, generation: GENERATION, publication: base, hasCurrentGeneration: () => true };
  writeFileSync(join(scratch, "app.ts"), "throw new Error('runtime defect');\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "failed application A"]);
  const failed = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  writeFileSync(join(scratch, "README.md"), "docs B\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "docs B"]);
  const head = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  const absent = { ["total_count"]: 0, ["workflow_runs"]: [] };
  const failedUrl = `${API_ROOT}/workflows/7/runs?head_sha=${failed}&event=push&branch=main&per_page=100&page=1`;
  writeFileSync(
    join(scratch, "ci-api.json"),
    JSON.stringify({ ...metadata(base), [failedUrl]: { ["total_count"]: 1, ["workflow_runs"]: [{ ...goodRun(failed, 2), conclusion: "failure" }] } }),
  );
  const decision = resolveCiQualification(scratch, head, failed, config);
  expect(decision).toMatchObject({ base, eventBase: failed, authority: "qualified", code: true });
  expect(decision.paths).toEqual(["README.md", "app.ts"]);
  const runtime = decision.code ? spawnSync(process.execPath, [join(scratch, "app.ts")], { encoding: "utf8" }) : null;
  expect(runtime?.status).toBe(1);
  expect(runtime?.stderr).toContain("runtime defect");
  writeFileSync(
    join(scratch, "ci-api.json"),
    JSON.stringify({ ...metadata(failed), [`${API_ROOT}/workflows/7/runs?head_sha=${base}&event=push&branch=main&per_page=100&page=1`]: absent }),
  );
  expect(resolveCiQualification(scratch, head, failed, config)).toMatchObject({ base: failed, code: false, toolMode: "affected" });
  writeFileSync(join(scratch, "ci-api.json"), "{}");
  expect(() => resolveCiQualification(scratch, head, "0".repeat(40), config)).toThrow("qualified ancestry is ambiguous");
  const emptyRuns = {
    ...metadata(base),
    [failedUrl]: absent,
    [`${API_ROOT}/workflows/7/runs?head_sha=${base}&event=push&branch=main&per_page=100&page=1`]: absent,
  };
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(emptyRuns));
  expect(resolveCiQualification(scratch, head, "0".repeat(40), config)).toMatchObject({ base, code: true, toolMode: "full", authority: "publication" });
  expect(() => resolveCiQualification(scratch, head, failed, { ...config, publication: SHA, hasCurrentGeneration: () => true })).toThrow(
    "admitted publication is not an ancestor",
  );
  expect(() => qualificationDecision(scratch, { head: base, eventBase: failed, base, authority: "qualified" })).toThrow();
  execFixtureGit(scratch, ["checkout", "-b", "other-history", base]);
  writeFileSync(join(scratch, "other.ts"), "export const other = true;\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "another history"]);
  const other = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify({ ...metadata(head), ...metadata(base) }));
  expect(resolveCiQualification(scratch, other, head, config)).toMatchObject({ base, head: other });
  execFixtureGit(scratch, ["checkout", "main"]);
  writeFileSync(join(scratch, "app.ts"), "fixed but uncommitted\n");
  expect(() => qualificationDecision(scratch, { head, eventBase: failed, base, authority: "qualified" })).toThrow("clean tested checkout");
});

test("the production producer derives workflow generation, records release-PR and missing event bases, and refuses a switched HEAD", {
  timeout: scaledBudget(20_000),
}, async ({ scratch, repoRoot, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  execFixtureGit(scratch, ["init", "--initial-branch=main"]);
  execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
  execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
  writeFileSync(join(scratch, ".gitignore"), "fake-bin\nci-*\n");
  mkdirSync(join(scratch, ".github/workflows"), { recursive: true });
  writeFileSync(join(scratch, ".github/workflows/ci.yml"), readFileSync(join(repoRoot, ".github/workflows/ci.yml")));
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "qualified main"]);
  const base = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  writeFileSync(join(scratch, "README.md"), "docs-only candidate\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "candidate"]);
  const head = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(metadata(base)));
  const script = join(repoRoot, "scripts/ci-qualification.ts");
  const run = (eventBase: string, testedHead = head): SpawnSyncReturns<string> =>
    spawnSync(process.execPath, [script, "baseline", testedHead, eventBase], {
      cwd: scratch,
      encoding: "utf8",
      env: inheritedProcessEnv({ ["ORB_CI_QUALIFICATION_GENERATION"]: "caller override", ["GITHUB_OUTPUT"]: join(scratch, "ci-output") }),
    });
  const releaseTarget = "b".repeat(40);
  const releasePr = run(releaseTarget);
  expect(releasePr.status, releasePr.stdout + releasePr.stderr).toBe(0);
  expect(releasePr.stdout).toContain(`base=${base}\nhead=${head}\nevent_base=${releaseTarget}\ncode=false\ntool_mode=affected\nauthority=qualified`);
  expect(readFileSync(join(scratch, "ci-output"), "utf8")).toBe(releasePr.stdout);
  expect(run("").status).toBe(0);
  expect(run("0".repeat(40)).status).toBe(0);
  expect(run(base, base).status).toBe(3);
  expect(run("malformed").status).toBe(3);
});

test("first-generation bootstrap positively excludes old workflow authority and requires full proof", async ({ scratch, repoRoot, fakeBin }) => {
  await fakeBin("gh", "process.stderr.write('unexpected metadata call');process.exitCode=91;");
  const root = join(scratch, "bootstrap");
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  execFixtureGit(root, ["init", "--initial-branch=main"]);
  execFixtureGit(root, ["config", "user.name", "Orb Test"]);
  execFixtureGit(root, ["config", "user.email", "orb@example.invalid"]);
  const workflowPath = join(root, ".github/workflows/ci.yml");
  writeFileSync(workflowPath, "env: { CI: 'true' }\n");
  execFixtureGit(root, ["add", "."]);
  execFixtureGit(root, ["commit", "-m", "admitted published source"]);
  const base = execFixtureGit(root, ["rev-parse", "HEAD"]).trim();
  const source = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8").replace("ac6cfc19ea9db59644426b37f6b8c842c33473ad", base);
  writeFileSync(workflowPath, source);
  execFixtureGit(root, ["add", "."]);
  execFixtureGit(root, ["commit", "-m", "first generation"]);
  const head = execFixtureGit(root, ["rev-parse", "HEAD"]).trim();
  const result = spawnSync(process.execPath, [join(repoRoot, "scripts/ci-qualification.ts"), "baseline", head, ""], { cwd: root, encoding: "utf8" });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toContain(`base=${base}\nhead=${head}\nevent_base=\ncode=true\ntool_mode=full\nauthority=publication`);
  expect(result.stderr).toContain("no current-generation qualified ancestor");
  expect(result.stderr).not.toContain("unexpected metadata call");
});

test("eligible search exhaustion refuses rather than forgetting a potentially newer qualified version", { timeout: scaledBudget(20_000) }, async ({
  scratch,
  fakeBin,
}) => {
  await fakeBin(
    "gh",
    [
      "import fs from 'node:fs';const endpoint=process.argv[3];fs.appendFileSync('ci-requests.jsonl',endpoint+'\\n');",
      "process.stdout.write(JSON.stringify(endpoint.endsWith('/workflows/ci.yml')?{id:7,path:'.github/workflows/ci.yml'}:{total_count:0,workflow_runs:[]}));",
    ].join("\n"),
  );
  execFixtureGit(scratch, ["init", "--initial-branch=main"]);
  execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
  execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
  writeFileSync(join(scratch, ".gitignore"), "fake-bin\nci-*\n");
  mkdirSync(join(scratch, ".github/workflows"), { recursive: true });
  writeFileSync(join(scratch, ".github/workflows/ci.yml"), "env: { ORB_CI_QUALIFICATION_GENERATION: current }\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "publication"]);
  const base = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  for (let index = 0; index < 42; index += 1) {
    execFixtureGit(scratch, ["commit", "--allow-empty", "-m", "candidate"]);
  }
  const head = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  expect(() =>
    resolveCiQualification(scratch, head, base, {
      repository: REPOSITORY,
      generation: GENERATION,
      publication: base,
      hasCurrentGeneration: () => true,
    }),
  ).toThrow("qualified ancestry is ambiguous");
  const queries = readFileSync(join(scratch, "ci-requests.jsonl"), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.includes("head_sha="));
  expect(queries).toHaveLength(40);
});

test("workflow-history exclusion follows a merged generation on the second parent", async ({ scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  execFixtureGit(scratch, ["init", "--initial-branch=main"]);
  execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
  execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
  writeFileSync(join(scratch, ".gitignore"), "fake-bin\nci-*\n");
  mkdirSync(join(scratch, ".github/workflows"), { recursive: true });
  const workflowPath = join(scratch, ".github/workflows/ci.yml");
  writeFileSync(workflowPath, "env: { generation: legacy }\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "published source"]);
  const publication = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  execFixtureGit(scratch, ["checkout", "-b", "generation"]);
  writeFileSync(workflowPath, "env: { generation: current }\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "qualified generation"]);
  const qualified = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  execFixtureGit(scratch, ["checkout", "main"]);
  writeFileSync(join(scratch, "README.md"), "candidate docs\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "candidate docs"]);
  const eventBase = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  execFixtureGit(scratch, ["merge", "--no-ff", "--no-edit", "generation"]);
  const head = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(metadata(qualified)));
  expect(
    resolveCiQualification(scratch, head, eventBase, {
      repository: REPOSITORY,
      generation: GENERATION,
      publication,
      hasCurrentGeneration: (source: string): boolean => source.includes("generation: current"),
    }),
  ).toMatchObject({ base: qualified, head, eventBase, authority: "qualified", code: false, toolMode: "affected" });
});
