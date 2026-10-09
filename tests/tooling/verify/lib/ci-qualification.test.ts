import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { BOX_LOAD_ENV } from "@orb/tooling/_shared/load-budget";
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
    requiredJobs: REQUIRED_JOB_NAMES,
    runtimeJobs: RUNTIME_JOB_NAMES,
    hasCurrentGeneration: () => true,
  });
  expect(decision).toMatchObject({ base, head, eventBase, code: true });
  expect(decision.paths).toContain("tests/tooling/broken.test.ts");
  expect(selectAffectedInstrumentTests(scratch, decision.paths).specs).toEqual(["tests/tooling/broken.test.ts"]);
  expect(readFileSync(join(scratch, "tests/tooling/broken.test.ts"), "utf8")).toContain("broken");
});

const REPOSITORY = "Inktomi93/OrbWeaver";
const GENERATION = "Orbweaver qualification product-v3";
const SHA = "a".repeat(40);
const REQUIRED_JOB_NAMES = ["static", "ci-ok", "changes"] as const;
const RUNTIME_JOB_NAMES = ["node (1/3)", "node (2/3)", "node (3/3)", "ct (1/5)", "ct (2/5)", "ct (3/5)", "ct (4/5)", "ct (5/5)", "e2e-smoke"] as const;
const RUNTIME_JOB_GROUPS = [
  { name: "node (${{ matrix.shard }}/3)", jobs: ["node (1/3)", "node (2/3)", "node (3/3)"] },
  { name: "ct (${{ matrix.shard }}/5)", jobs: ["ct (1/5)", "ct (2/5)", "ct (3/5)", "ct (4/5)", "ct (5/5)"] },
  { name: "e2e-smoke", jobs: ["e2e-smoke"] },
] as const;
const GROUPED_CONFIG = {
  repository: REPOSITORY,
  generation: GENERATION,
  publication: SHA,
  requiredJobs: REQUIRED_JOB_NAMES,
  runtimeJobs: RUNTIME_JOB_NAMES,
  runtimeJobGroups: RUNTIME_JOB_GROUPS,
  hasCurrentGeneration: (): boolean => true,
};
const API_ROOT = `repos/${REPOSITORY}/actions`;

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
  ["run_attempt"]: 2,
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

function goodProductJobs(sha = SHA, inherited = false): readonly (typeof JOB_SAMPLE)[] {
  const runtime = inherited ? RUNTIME_JOB_GROUPS.map(({ name }) => name) : RUNTIME_JOB_NAMES;
  return ["ci-ok", "changes", ...runtime].map((name, index) => ({
    ...goodJob(sha, index + 2),
    name,
    conclusion: inherited && runtime.some((runtimeName) => runtimeName === name) ? "skipped" : "success",
    steps: name === "ci-ok" ? [{ name: `${GENERATION} (${inherited ? "inherited" : "runtime"})`, status: "completed", conclusion: "success" }] : [],
  }));
}

function metadata(sha = SHA): object {
  const run = goodRun(sha);
  return {
    [`${API_ROOT}/workflows/ci.yml`]: { id: 7, path: ".github/workflows/ci.yml" },
    [`${API_ROOT}/workflows/7/runs?head_sha=${sha}&event=push&branch=main&per_page=100&page=1`]: { ["total_count"]: 1, ["workflow_runs"]: [run] },
    [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: 12, jobs: [goodJob(sha), ...goodProductJobs(sha)] },
    [`${API_ROOT}/runs/1`]: run,
  };
}

test("failed independent tooling recertification cannot veto completed current product qualification", async ({ scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  const run = { ...goodRun(), conclusion: "failure" };
  const jobs = [goodJob(), ...goodProductJobs(), { ...goodJob(SHA, 20), name: "weekly-tooling", conclusion: "failure", steps: [] }];
  writeFileSync(
    join(scratch, "ci-api.json"),
    JSON.stringify({
      ...metadata(),
      [`${API_ROOT}/workflows/7/runs?head_sha=${SHA}&event=push&branch=main&per_page=100&page=1`]: { ["total_count"]: 1, ["workflow_runs"]: [run] },
      [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: jobs.length, jobs },
      [`${API_ROOT}/runs/1`]: run,
    }),
  );
  expect(
    hasQualifiedMainPush(scratch, SHA, {
      repository: REPOSITORY,
      generation: GENERATION,
      publication: SHA,
      requiredJobs: REQUIRED_JOB_NAMES,
      runtimeJobs: RUNTIME_JOB_NAMES,
      hasCurrentGeneration: () => true,
    }),
  ).toBe(true);
});

const API_FIXTURE = [
  "import fs from 'node:fs';const [command,endpoint]=process.argv.slice(2);",
  "fs.appendFileSync('ci-requests.jsonl',JSON.stringify([command,endpoint])+'\\n');",
  "const responses=JSON.parse(fs.readFileSync('ci-api.json','utf8'));",
  "if(command==='api'&&endpoint.includes('/workflows/7/runs?event=push&branch=main&')&&!(endpoint in responses)){",
  "const rows=Object.entries(responses).filter(([key])=>key.includes('/workflows/7/runs?head_sha=')&&key.endsWith('&page=1')).flatMap(([,value])=>value.workflow_runs);",
  "const page=Number(new URL('https://fixture.invalid/'+endpoint).searchParams.get('page'));responses[endpoint]={total_count:rows.length,workflow_runs:rows.slice((page-1)*100,page*100)};}",
  "if(endpoint.includes('/jobs?')&&!(endpoint in responses))responses[endpoint]={total_count:0,jobs:[]};",
  "if(command!=='api'||!(endpoint in responses))process.exit(74);",
  "process.stdout.write(JSON.stringify(responses[endpoint]));",
].join("\n");

test("tight fractional metadata deadlines reach the native process, and sub-millisecond deadlines refuse without spawning", {
  timeout: scaledBudget(20_000),
}, async ({ scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(metadata()));
  const config = {
    repository: REPOSITORY,
    generation: GENERATION,
    publication: SHA,
    requiredJobs: REQUIRED_JOB_NAMES,
    runtimeJobs: RUNTIME_JOB_NAMES,
    hasCurrentGeneration: () => true,
  };
  const windowMs = scaledBudget(5000);
  // @orb-waive test-determinism(performance.now): the subject is native conversion of a fractional remaining monotonic deadline, below the request cap; no clock injection exists, and completion headroom follows shared load scaling.
  expect(hasQualifiedMainPush(scratch, SHA, config, performance.now() + windowMs + 0.75)).toBe(true);
  const requests = readFileSync(join(scratch, "ci-requests.jsonl"), "utf8");
  expect(requests).toContain("/workflows/ci.yml");
  // @orb-waive test-determinism(performance.now): the subject is refusing a real remaining deadline below one millisecond without spawning; elapsed time can only strengthen refusal, and no clock injection exists.
  expect(() => hasQualifiedMainPush(scratch, SHA, config, performance.now() + 0.5)).toThrow("exceeded its supported bound");
  expect(readFileSync(join(scratch, "ci-requests.jsonl"), "utf8")).toBe(requests);
  // @orb-waive test-determinism(performance.now): the subject is refusing an already exhausted real monotonic deadline without spawning; elapsed time can only strengthen refusal, and no clock injection exists.
  expect(() => hasQualifiedMainPush(scratch, SHA, config, performance.now() - 1)).toThrow("exceeded its supported bound");
  expect(readFileSync(join(scratch, "ci-requests.jsonl"), "utf8")).toBe(requests);
});

test("native metadata timeout keeps its quiet ceiling and receives shared load headroom", { timeout: scaledBudget(60_000) }, async ({
  scratch,
  repoRoot,
  fakeBin,
}) => {
  const delayed = API_FIXTURE.replace(
    "process.stdout.write(JSON.stringify(responses[endpoint]));",
    "if(endpoint.endsWith('/workflows/ci.yml')&&!fs.existsSync('ci-delayed')){fs.writeFileSync('ci-delayed','yes');await new Promise(resolve=>setTimeout(resolve,11200));}process.stdout.write(JSON.stringify(responses[endpoint]));",
  );
  await fakeBin("gh", delayed);
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(metadata()));
  const probe = join(scratch, "qualification-probe.mjs");
  writeFileSync(
    probe,
    [
      `import { hasQualifiedMainPush } from ${JSON.stringify(join(repoRoot, "tooling/src/verify/lib/ci-qualification.ts"))};`,
      `try { if(!hasQualifiedMainPush(process.cwd(), ${JSON.stringify(SHA)}, ${JSON.stringify({ repository: REPOSITORY, generation: GENERATION, publication: SHA, requiredJobs: REQUIRED_JOB_NAMES, runtimeJobs: RUNTIME_JOB_NAMES })})) throw new Error('qualification refused'); process.stdout.write('qualified'); } catch(error) { process.stderr.write(error.message); process.exitCode=2; }`,
    ].join("\n"),
  );
  const quiet = spawnSync(process.execPath, [probe], { cwd: scratch, encoding: "utf8", env: inheritedProcessEnv({ [BOX_LOAD_ENV]: "0.2/1" }) });
  expect(quiet.status, quiet.stdout + quiet.stderr).toBe(2);
  expect(quiet.stderr).toContain("metadata unavailable");
  rmSync(join(scratch, "ci-delayed"));
  const loaded = spawnSync(process.execPath, [probe], { cwd: scratch, encoding: "utf8", env: inheritedProcessEnv({ [BOX_LOAD_ENV]: "2/1" }) });
  expect(loaded.status, loaded.stdout + loaded.stderr).toBe(0);
  expect(loaded.stdout).toBe("qualified");
});

test("the shared qualifier rejects false authority and partial reruns, and paginates the exact run attempt", async ({ scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  const config = {
    repository: REPOSITORY,
    generation: GENERATION,
    publication: SHA,
    requiredJobs: REQUIRED_JOB_NAMES,
    runtimeJobs: RUNTIME_JOB_NAMES,
    hasCurrentGeneration: () => true,
  };
  const check = (responses: object): boolean => {
    writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(responses));
    return hasQualifiedMainPush(scratch, SHA, config);
  };
  expect(check(metadata())).toBe(true);
  const runUrl = `${API_ROOT}/workflows/7/runs?head_sha=${SHA}&event=push&branch=main&per_page=100&page=1`;
  const jobsUrl = `${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`;
  for (const patch of [
    { status: "in_progress", conclusion: null },
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
    { conclusion: "failure" },
    { conclusion: "cancelled" },
    { status: "completed", conclusion: "skipped" },
    { ["run_id"]: 2 },
    { ["head_sha"]: "b".repeat(40) },
  ]) {
    expect(check({ ...metadata(), [jobsUrl]: { ["total_count"]: 12, jobs: [{ ...goodJob(), ...patch }, ...goodProductJobs()] } }), JSON.stringify(patch)).toBe(
      false,
    );
  }
  expect(check({ ...metadata(), [runUrl]: { ["total_count"]: 2, ["workflow_runs"]: [goodRun(), { ...goodRun(SHA, 2), conclusion: "failure" }] } })).toBe(false);
  expect(check({ ...metadata(), [`${API_ROOT}/runs/1`]: { ...goodRun(), ["run_attempt"]: 3 } })).toBe(false);
  expect(check({ ...metadata(), [jobsUrl]: { ["total_count"]: 0, jobs: [] } })).toBe(false);
  expect(() => check({ ...metadata(), [jobsUrl]: { ["total_count"]: 1, jobs: [] } })).toThrow("incomplete");
  expect(() => check({ ...metadata(), [runUrl]: { ["total_count"]: 1, ["workflow_runs"]: [{ ...goodRun(), ["run_attempt"]: undefined }] } })).toThrow();
  expect(() => check({})).toThrow("metadata unavailable");
  const others = Array.from({ length: 100 }, (_, index) => ({ ...goodJob(SHA, index + 13), name: `other-${index}`, steps: [] }));
  expect(
    check({
      ...metadata(),
      [jobsUrl]: { ["total_count"]: 112, jobs: others },
      [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=2`]: { ["total_count"]: 112, jobs: [goodJob(), ...goodProductJobs()] },
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
  const config: CiQualificationConfig = {
    repository: REPOSITORY,
    generation: GENERATION,
    publication: base,
    requiredJobs: REQUIRED_JOB_NAMES,
    runtimeJobs: RUNTIME_JOB_NAMES,
    hasCurrentGeneration: () => true,
  };
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
  expect(resolveCiQualification(scratch, head, failed, config)).toMatchObject({ base: failed, code: false });
  writeFileSync(join(scratch, "ci-api.json"), "{}");
  expect(() => resolveCiQualification(scratch, head, "0".repeat(40), config)).toThrow("qualified ancestry is ambiguous");
  const emptyRuns = {
    ...metadata(base),
    [failedUrl]: absent,
    [`${API_ROOT}/workflows/7/runs?head_sha=${base}&event=push&branch=main&per_page=100&page=1`]: absent,
  };
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(emptyRuns));
  expect(resolveCiQualification(scratch, head, "0".repeat(40), config)).toMatchObject({ base, code: true, authority: "publication" });
  expect(() =>
    resolveCiQualification(scratch, head, failed, {
      ...config,
      publication: SHA,
      requiredJobs: REQUIRED_JOB_NAMES,
      runtimeJobs: RUNTIME_JOB_NAMES,
      hasCurrentGeneration: () => true,
    }),
  ).toThrow("admitted publication is not an ancestor");
  expect(() => qualificationDecision(scratch, { head: base, eventBase: failed, base, authority: "qualified" })).toThrow();
  execFixtureGit(scratch, ["checkout", "-b", "other-history", base]);
  writeFileSync(join(scratch, "other.ts"), "export const other = true;\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "another history"]);
  const other = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  writeFileSync(
    join(scratch, "ci-api.json"),
    JSON.stringify({
      ...metadata(base),
      [`${API_ROOT}/workflows/7/runs?event=push&branch=main&per_page=100&page=1`]: { ["total_count"]: 2, ["workflow_runs"]: [goodRun(head, 2), goodRun(base)] },
    }),
  );
  expect(resolveCiQualification(scratch, other, head, config)).toMatchObject({ base, head: other });
  execFixtureGit(scratch, ["checkout", "main"]);
  writeFileSync(join(scratch, "app.ts"), "fixed but uncommitted\n");
  expect(() => qualificationDecision(scratch, { head, eventBase: failed, base, authority: "qualified" })).toThrow("clean tested checkout");
});

test.for(["release-pr", "missing-event-base", "zero-event-base", "switched-head", "malformed-event-base"] as const)(
  "the production producer derives workflow generation and enforces the %s event boundary",
  { timeout: scaledBudget(20_000) },
  async (scenario, { scratch, repoRoot, fakeBin }) => {
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
    const run = (boundary: string, testedHead = head): SpawnSyncReturns<string> =>
      spawnSync(process.execPath, [script, "baseline", testedHead, boundary], {
        cwd: scratch,
        encoding: "utf8",
        env: inheritedProcessEnv({ ["ORB_CI_QUALIFICATION_GENERATION"]: "caller override", ["GITHUB_OUTPUT"]: join(scratch, "ci-output") }),
      });
    const eventBases = {
      "release-pr": "b".repeat(40),
      "missing-event-base": "",
      "zero-event-base": "0".repeat(40),
      "switched-head": base,
      "malformed-event-base": "malformed",
    };
    const eventBase = eventBases[scenario];
    const result = run(eventBase, scenario === "switched-head" ? base : head);
    const refused = scenario === "switched-head" || scenario === "malformed-event-base";
    const output = refused ? "" : `base=${base}\nhead=${head}\nevent_base=${eventBase}\ncode=false\nauthority=qualified\n`;
    const errors = {
      "release-pr": /^$/u,
      "missing-event-base": /^$/u,
      "zero-event-base": /^$/u,
      "switched-head": /head differs from the tested HEAD/u,
      "malformed-event-base": /event base must be empty or a commit ID/u,
    };
    const outputPath = join(scratch, "ci-output");
    const receipt = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : null;
    expect(result.status, result.stdout + result.stderr).toBe(refused ? 3 : 0);
    expect(result.stderr).toMatch(errors[scenario]);
    expect(result.stdout).toBe(output);
    expect(receipt).toBe(refused ? null : output);
  },
);

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
  expect(result.stdout).toContain(`base=${base}\nhead=${head}\nevent_base=\ncode=true\nauthority=publication`);
  expect(result.stderr).toContain("no current-generation qualified ancestor");
  expect(result.stderr).not.toContain("unexpected metadata call");
});

test("eligible search exhaustion refuses rather than forgetting a potentially newer qualified version", { timeout: scaledBudget(20_000) }, async ({
  scratch,
  fakeBin,
}) => {
  await fakeBin("gh", API_FIXTURE);
  execFixtureGit(scratch, ["init", "--initial-branch=main"]);
  execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
  execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
  writeFileSync(join(scratch, ".gitignore"), "fake-bin\nci-*\n");
  mkdirSync(join(scratch, ".github/workflows"), { recursive: true });
  writeFileSync(join(scratch, ".github/workflows/ci.yml"), "env: { ORB_CI_QUALIFICATION_GENERATION: current }\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "publication"]);
  const base = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  const candidates: string[] = [base];
  for (let index = 0; index < 42; index += 1) {
    execFixtureGit(scratch, ["commit", "--allow-empty", "-m", "candidate"]);
    candidates.push(execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim());
  }
  const head = candidates.pop();
  if (head === undefined) {
    throw new Error("the fixture has no head");
  }
  writeFileSync(
    join(scratch, "ci-api.json"),
    JSON.stringify({
      ...metadata(base),
      ...Object.fromEntries(
        candidates.map((sha, index) => [
          `${API_ROOT}/workflows/7/runs?head_sha=${sha}&event=push&branch=main&per_page=100&page=1`,
          { ["total_count"]: 1, ["workflow_runs"]: [{ ...goodRun(sha, index + 1), conclusion: "failure" }] },
        ]),
      ),
    }),
  );
  expect(() =>
    resolveCiQualification(scratch, head, base, {
      repository: REPOSITORY,
      generation: GENERATION,
      publication: base,
      requiredJobs: REQUIRED_JOB_NAMES,
      runtimeJobs: RUNTIME_JOB_NAMES,
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
      requiredJobs: REQUIRED_JOB_NAMES,
      runtimeJobs: RUNTIME_JOB_NAMES,
      hasCurrentGeneration: (source: string): boolean => source.includes("generation: current"),
    }),
  ).toMatchObject({ base: qualified, head, eventBase, authority: "qualified", code: false });
});

test("unqualified current-generation ancestry enumerates workflow boundaries rather than reading each legacy tree", { timeout: scaledBudget(60_000) }, async ({
  scratch,
  fakeBin,
}) => {
  execFixtureGit(scratch, ["init", "--initial-branch=main"]);
  execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
  execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
  writeFileSync(join(scratch, ".gitignore"), "fake-bin\nci-*\n");
  mkdirSync(join(scratch, ".github/workflows"), { recursive: true });
  const workflowPath = join(scratch, ".github/workflows/ci.yml");
  writeFileSync(workflowPath, "env: { generation: legacy }\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "publication"]);
  const publication = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  for (let index = 0; index < 150; index += 1) {
    execFixtureGit(scratch, ["commit", "--allow-empty", "-m", "legacy"]);
  }
  writeFileSync(workflowPath, "env: { generation: current }\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "unqualified generation"]);
  const current = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  execFixtureGit(scratch, ["commit", "--allow-empty", "-m", "candidate"]);
  const head = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  await fakeBin(
    "gh",
    [
      "import fs from 'node:fs';const endpoint=process.argv[3];fs.appendFileSync('ci-requests.jsonl',endpoint+'\\n');",
      "process.stdout.write(JSON.stringify(endpoint.endsWith('/workflows/ci.yml')?{id:7,path:'.github/workflows/ci.yml'}:{total_count:0,workflow_runs:[]}));",
    ].join("\n"),
  );
  await fakeBin(
    "git",
    [
      "import fs from 'node:fs';import {delimiter} from 'node:path';import {execFileSync} from 'node:child_process';",
      "const args=process.argv.slice(2);fs.appendFileSync('ci-git.jsonl',JSON.stringify(args)+'\\n');",
      "const env={...process.env,PATH:process.env.PATH.split(delimiter).filter(part=>part!==import.meta.dirname).join(delimiter)};",
      "try{process.stdout.write(execFileSync('git',args,{env,encoding:'utf8'}));}catch(error){process.stderr.write(String(error.stderr??error.message));process.exitCode=error.status??1;}",
    ].join("\n"),
  );
  const config = {
    repository: REPOSITORY,
    generation: GENERATION,
    publication,
    requiredJobs: REQUIRED_JOB_NAMES,
    runtimeJobs: RUNTIME_JOB_NAMES,
    hasCurrentGeneration: (source: string): boolean => source.includes("generation: current"),
  };
  expect(resolveCiQualification(scratch, head, current, config)).toMatchObject({ base: publication, authority: "publication", code: true });
  const reads = readFileSync(join(scratch, "ci-git.jsonl"), "utf8")
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line) as string[]);
  expect(reads.filter((args) => args.includes("ls-tree") || args.includes("show")).length).toBeLessThanOrEqual(4);
  expect(
    readFileSync(join(scratch, "ci-requests.jsonl"), "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.includes("head_sha=")),
  ).toEqual([]);
  expect(
    readFileSync(join(scratch, "ci-requests.jsonl"), "utf8")
      .split(/\r?\n/u)
      .filter((line) => line.includes("runs?event=push&branch=main")),
  ).toHaveLength(2);
});

test("generation reverts and merges retaining a legacy workflow preserve older qualified second-parent authority", async ({ scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  execFixtureGit(scratch, ["init", "--initial-branch=main"]);
  execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
  execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
  writeFileSync(join(scratch, ".gitignore"), "fake-bin\nci-*\n");
  mkdirSync(join(scratch, ".github/workflows"), { recursive: true });
  const workflowPath = join(scratch, ".github/workflows/ci.yml");
  writeFileSync(workflowPath, "env: { generation: legacy }\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "publication"]);
  const publication = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  execFixtureGit(scratch, ["checkout", "-b", "generation"]);
  writeFileSync(workflowPath, "env: { generation: current }\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "qualified generation"]);
  const qualified = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  writeFileSync(workflowPath, "env: { generation: legacy }\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "generation revert"]);
  execFixtureGit(scratch, ["checkout", "main"]);
  execFixtureGit(scratch, ["commit", "--allow-empty", "-m", "legacy main"]);
  execFixtureGit(scratch, ["merge", "--no-ff", "--no-edit", "-s", "ours", qualified]);
  const legacyMerge = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  execFixtureGit(scratch, ["merge", "--no-ff", "--no-edit", "generation"]);
  const revertedMerge = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  writeFileSync(workflowPath, "env: { generation: current }\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "current candidate"]);
  const head = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(metadata(qualified)));
  const result = resolveCiQualification(scratch, head, revertedMerge, {
    repository: REPOSITORY,
    generation: GENERATION,
    publication,
    requiredJobs: REQUIRED_JOB_NAMES,
    runtimeJobs: RUNTIME_JOB_NAMES,
    hasCurrentGeneration: (source: string): boolean => source.includes("generation: current"),
  });
  expect(result).toMatchObject({ base: qualified, head, authority: "qualified" });
  const requests = readFileSync(join(scratch, "ci-requests.jsonl"), "utf8");
  expect(requests).not.toContain(`head_sha=${legacyMerge}`);
  expect(requests).not.toContain(`head_sha=${revertedMerge}`);
});

test("unpublished merge-train commits do not exhaust run-backed discovery or forget older qualified authority", { timeout: scaledBudget(60_000) }, async ({
  scratch,
  fakeBin,
}) => {
  await fakeBin("gh", API_FIXTURE);
  execFixtureGit(scratch, ["init", "--initial-branch=main"]);
  execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
  execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
  writeFileSync(join(scratch, ".gitignore"), "fake-bin\nci-*\n");
  mkdirSync(join(scratch, ".github/workflows"), { recursive: true });
  writeFileSync(join(scratch, ".github/workflows/ci.yml"), "env: { generation: current }\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "publication"]);
  const publication = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  const ancestors: string[] = [publication];
  for (let index = 1; index < 49; index += 1) {
    execFixtureGit(scratch, ["commit", "--allow-empty", "-m", "unpublished lane"]);
    ancestors.push(execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim());
  }
  writeFileSync(join(scratch, "app.ts"), "throw new Error('inherited application defect');\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "candidate"]);
  const head = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  const failedRuns = [12, 30, 31].map((position, index) => ({
    ...goodRun(ancestors[49 - position], index + 2),
    conclusion: index === 0 ? "cancelled" : "failure",
  }));
  const responses = {
    ...metadata(publication),
    ...Object.fromEntries(
      ancestors.map((sha) => [
        `${API_ROOT}/workflows/7/runs?head_sha=${sha}&event=push&branch=main&per_page=100&page=1`,
        { ["total_count"]: 0, ["workflow_runs"]: [] },
      ]),
    ),
    ...Object.fromEntries(
      failedRuns.map((run) => [
        `${API_ROOT}/workflows/7/runs?head_sha=${run.head_sha}&event=push&branch=main&per_page=100&page=1`,
        { ["total_count"]: 1, ["workflow_runs"]: [run] },
      ]),
    ),
  };
  const config = {
    repository: REPOSITORY,
    generation: GENERATION,
    publication,
    requiredJobs: REQUIRED_JOB_NAMES,
    runtimeJobs: RUNTIME_JOB_NAMES,
    hasCurrentGeneration: () => true,
  };
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(responses));
  expect(resolveCiQualification(scratch, head, publication, config)).toMatchObject({
    base: publication,
    authority: "publication",
    code: true,
  });
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify({ ...responses, ...metadata(publication) }));
  expect(resolveCiQualification(scratch, head, publication, config)).toMatchObject({
    base: publication,
    authority: "qualified",
    code: true,
    paths: ["app.ts"],
  });
});

test("discovery inventory preserves pagination, provenance, stable absence and exact-SHA revalidation", { timeout: scaledBudget(60_000) }, async ({
  scratch,
  fakeBin,
}) => {
  await fakeBin("gh", API_FIXTURE);
  execFixtureGit(scratch, ["init", "--initial-branch=main"]);
  execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
  execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
  writeFileSync(join(scratch, ".gitignore"), "fake-bin\nci-*\n");
  mkdirSync(join(scratch, ".github/workflows"), { recursive: true });
  writeFileSync(join(scratch, ".github/workflows/ci.yml"), "env: { generation: current }\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "qualified base"]);
  const base = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  writeFileSync(join(scratch, "README.md"), "docs candidate\n");
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "candidate"]);
  const head = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  const config = {
    repository: REPOSITORY,
    generation: GENERATION,
    publication: base,
    requiredJobs: REQUIRED_JOB_NAMES,
    runtimeJobs: RUNTIME_JOB_NAMES,
    hasCurrentGeneration: () => true,
  };
  const check = (responses: object): ReturnType<typeof resolveCiQualification> => {
    writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(responses));
    return resolveCiQualification(scratch, head, base, config);
  };
  const inventoryUrl = `${API_ROOT}/workflows/7/runs?event=push&branch=main&per_page=100&page=1`;
  const secondPage = `${API_ROOT}/workflows/7/runs?event=push&branch=main&per_page=100&page=2`;
  const otherRuns = Array.from({ length: 100 }, (_, index) => goodRun("b".repeat(40), index + 2));
  const paginated = {
    ...metadata(base),
    [inventoryUrl]: { ["total_count"]: 101, ["workflow_runs"]: otherRuns },
    [secondPage]: { ["total_count"]: 101, ["workflow_runs"]: [goodRun(base)] },
  };
  expect(check(paginated)).toMatchObject({ base, authority: "qualified", code: false });
  expect(readFileSync(join(scratch, "ci-requests.jsonl"), "utf8")).toContain(secondPage);
  for (const page of [
    { ["total_count"]: 101, ["workflow_runs"]: [] },
    { ["total_count"]: 102, ["workflow_runs"]: [goodRun(base)] },
    { ["total_count"]: 101, ["workflow_runs"]: [otherRuns[0]] },
  ]) {
    expect(() => check({ ...paginated, [secondPage]: page }), JSON.stringify(page)).toThrow("qualified ancestry is ambiguous");
  }
  for (const patch of [
    { repository: { ["full_name"]: "another/repository" } },
    { ["workflow_id"]: 8 },
    { ["head_branch"]: "release" },
    { event: "workflow_dispatch" },
    { event: "pull_request" },
    { event: "schedule" },
  ]) {
    expect(
      () => check({ ...metadata(base), [inventoryUrl]: { ["total_count"]: 1, ["workflow_runs"]: [{ ...goodRun("b".repeat(40), 2), ...patch }] } }),
      JSON.stringify(patch),
    ).toThrow("inconsistent provenance");
  }
  expect(() =>
    check({ ...metadata(base), [inventoryUrl]: { ["total_count"]: 1, ["workflow_runs"]: [{ ...goodRun(base), ["run_attempt"]: undefined }] } }),
  ).toThrow("qualified ancestry is ambiguous");
  expect(() => check({ ...metadata(base), [inventoryUrl]: { ["total_count"]: 1, ["workflow_runs"]: [] } })).toThrow("incomplete");
  expect(() =>
    check({
      ...metadata(base),
      [inventoryUrl]: { ["total_count"]: 1, ["workflow_runs"]: [goodRun(base)] },
      [`${API_ROOT}/workflows/7/runs?head_sha=${base}&event=push&branch=main&per_page=100&page=1`]: { ["total_count"]: 0, ["workflow_runs"]: [] },
    }),
  ).toThrow("changed before exact-SHA validation");
  const exhaustedPages = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [
      `${API_ROOT}/workflows/7/runs?event=push&branch=main&per_page=100&page=${index + 1}`,
      { ["total_count"]: 1001, ["workflow_runs"]: Array.from({ length: 100 }, (_unusedRow, row) => goodRun(base, index * 100 + row + 1)) },
    ]),
  );
  expect(() => check({ ...metadata(base), ...exhaustedPages })).toThrow("pagination exceeds the supported bound");
  const saturatedPages = Object.fromEntries(Object.entries(exhaustedPages).map(([endpoint, page]) => [endpoint, { ...page, ["total_count"]: 1000 }]));
  expect(() => check({ ...metadata(base), ...saturatedPages })).toThrow("inventory saturated the API search bound");
  expect(() => check({})).toThrow("metadata unavailable");
  expect(check({ ...metadata(base), [inventoryUrl]: { ["total_count"]: 0, ["workflow_runs"]: [] } })).toMatchObject({
    base,
    authority: "publication",
    code: true,
  });
  for (const conclusion of ["failure", "cancelled", "stale"]) {
    expect(
      check({
        ...metadata(base),
        [`${API_ROOT}/workflows/7/runs?head_sha=${base}&event=push&branch=main&per_page=100&page=1`]: {
          ["total_count"]: 1,
          ["workflow_runs"]: [{ ...goodRun(base), conclusion }],
        },
      }),
    ).toMatchObject({ authority: "publication", code: true });
  }
  const changing = API_FIXTURE.replace(
    "process.stdout.write(JSON.stringify(responses[endpoint]));",
    "if(endpoint.includes('/runs?event=push&branch=main&')){const file='ci-inventory-read';const prior=fs.existsSync(file);fs.writeFileSync(file,'read');if(prior)responses[endpoint]={total_count:1,workflow_runs:[{...responses[endpoint].workflow_runs[0],run_attempt:3}]};}process.stdout.write(JSON.stringify(responses[endpoint]));",
  );
  await fakeBin("gh", changing);
  expect(() => check(metadata(base))).toThrow("inventory changed during discovery");
  rmSync(join(scratch, "ci-inventory-read"));
  expect(() => check({ ...metadata(base), [inventoryUrl]: { ["total_count"]: 0, ["workflow_runs"]: [] } })).toThrow("qualified ancestry is ambiguous");
});

test("native inherited matrices qualify only with their complete canonical runtime partition", async ({ scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  const jobs = [goodJob(), ...goodProductJobs(SHA, true), { ...goodJob(SHA, 99), name: "Weekly tooling proof", conclusion: "failure", steps: [] }];
  writeFileSync(
    join(scratch, "ci-api.json"),
    JSON.stringify({ ...metadata(), [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: jobs.length, jobs } }),
  );
  expect(hasQualifiedMainPush(scratch, SHA, GROUPED_CONFIG)).toBe(true);
  const { runtimeJobGroups: _groups, ...unconfigured } = GROUPED_CONFIG;
  expect(hasQualifiedMainPush(scratch, SHA, unconfigured)).toBe(false);
});

test.for([
  "missing-mode",
  "stale-mode",
  "mixed-mode",
  "stale-static",
  "skipped-static",
  "partial-rerun",
  "changed-sha",
  "changed-run",
] as const)("native inherited authority still refuses %s provenance", async (scenario, { scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  const jobs = [goodJob(), ...goodProductJobs(SHA, true)].map((job) => {
    if (job.name === "ci-ok") {
      const modes = {
        "missing-mode": [],
        "stale-mode": [{ name: "Orbweaver qualification previous (inherited)", status: "completed", conclusion: "success" }],
        "mixed-mode": [...job.steps, { name: `${GENERATION} (runtime)`, status: "completed", conclusion: "success" }],
      };
      if (scenario === "missing-mode" || scenario === "stale-mode" || scenario === "mixed-mode") {
        return { ...job, steps: modes[scenario] };
      }
    }
    if (job.name === "static" && scenario === "stale-static") {
      return { ...job, steps: [{ name: "Orbweaver qualification previous", status: "completed", conclusion: "success" }] };
    }
    return job.name === "static" && scenario === "skipped-static" ? { ...job, conclusion: "skipped" } : job;
  });
  const current = {
    ...goodRun(),
    ...(scenario === "partial-rerun" ? { ["run_attempt"]: 3 } : {}),
    ...(scenario === "changed-sha" ? { ["head_sha"]: "b".repeat(40) } : {}),
    ...(scenario === "changed-run" ? { id: 2 } : {}),
  };
  writeFileSync(
    join(scratch, "ci-api.json"),
    JSON.stringify({
      ...metadata(),
      [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: jobs.length, jobs },
      [`${API_ROOT}/runs/1`]: current,
    }),
  );
  expect(hasQualifiedMainPush(scratch, SHA, GROUPED_CONFIG)).toBe(false);
});

for (const group of RUNTIME_JOB_GROUPS.filter(({ jobs }) => jobs.length > 1)) {
  test.for([
    "missing",
    "duplicate",
    "mixed",
    "wrong-label",
    "wrong-count",
    "queued",
    "running",
    "success",
    "failure",
    "cancelled",
    "wrong-sha",
    "wrong-run",
    "wrong-attempt",
  ] as const)(`native inherited ${group.name} refuses %s records`, async (scenario, { scratch, fakeBin }) => {
    await fakeBin("gh", API_FIXTURE);
    const complete = [goodJob(), ...goodProductJobs(SHA, true)];
    const patches = {
      "wrong-label": { name: `${group.name} unexpected` },
      "wrong-count": { name: group.name.replace(/\/\d/u, "/99") },
      queued: { status: "queued" },
      running: { status: "in_progress" },
      success: { conclusion: "success" },
      failure: { conclusion: "failure" },
      cancelled: { conclusion: "cancelled" },
      "wrong-sha": { ["head_sha"]: "b".repeat(40) },
      "wrong-run": { ["run_id"]: 2 },
      "wrong-attempt": { ["run_attempt"]: 1 },
    } satisfies Record<Exclude<typeof scenario, "missing" | "duplicate" | "mixed">, Partial<typeof JOB_SAMPLE>>;
    let jobs = complete;
    if (scenario === "missing") {
      jobs = complete.filter(({ name }) => name !== group.name);
    } else if (scenario === "duplicate") {
      jobs = [...complete, { ...goodJob(SHA, 99), name: group.name, conclusion: "skipped", steps: [] }];
    } else if (scenario === "mixed") {
      jobs = [...complete, ...group.jobs.map((name, index) => ({ ...goodJob(SHA, index + 99), name, conclusion: "skipped", steps: [] }))];
    } else {
      jobs = complete.map((job) => (job.name === group.name ? { ...job, ...patches[scenario] } : job));
    }
    writeFileSync(
      join(scratch, "ci-api.json"),
      JSON.stringify({ ...metadata(), [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: jobs.length, jobs } }),
    );
    expect(hasQualifiedMainPush(scratch, SHA, GROUPED_CONFIG)).toBe(false);
  });

  test(`runtime qualification rejects the extra collapsed ${group.name} even with every successful shard`, async ({ scratch, fakeBin }) => {
    await fakeBin("gh", API_FIXTURE);
    const jobs = [goodJob(), ...goodProductJobs(), { ...goodJob(SHA, 99), name: group.name, conclusion: "skipped", steps: [] }];
    writeFileSync(
      join(scratch, "ci-api.json"),
      JSON.stringify({ ...metadata(), [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: jobs.length, jobs } }),
    );
    expect(hasQualifiedMainPush(scratch, SHA, GROUPED_CONFIG)).toBe(false);
  });
}

test.for([
  "missing-member",
  "duplicate-member",
  "foreign-member",
  "empty-group",
  "duplicate-name",
  "renamed-singleton",
] as const)("runtime qualification refuses an invalid configured partition: %s", async (scenario, { scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(metadata()));
  const groups = RUNTIME_JOB_GROUPS.map((group) => ({ name: group.name, jobs: [...group.jobs] }));
  const runtimeJobGroups = groups.map((group) => {
    if (scenario === "renamed-singleton") {
      return group.jobs.length === 1 ? { ...group, name: "unconfigured-singleton" } : group;
    }
    if (!group.name.startsWith("node")) {
      return group;
    }
    const patches = {
      "missing-member": { jobs: group.jobs.slice(0, 2) },
      "duplicate-member": { jobs: ["node (1/3)", "node (1/3)", "node (3/3)"] },
      "foreign-member": { jobs: ["node (1/3)", "node (2/3)", "unconfigured"] },
      "empty-group": { jobs: [] },
      "duplicate-name": { name: "e2e-smoke" },
    };
    return { ...group, ...patches[scenario] };
  });
  expect(hasQualifiedMainPush(scratch, SHA, { ...GROUPED_CONFIG, runtimeJobGroups })).toBe(false);
});

test("the production release producer derives native collapsed names from its canonical workflow", async ({ scratch, repoRoot, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  execFixtureGit(scratch, ["init", "--initial-branch=main"]);
  execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
  execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
  writeFileSync(join(scratch, ".gitignore"), "fake-bin\nci-*\n");
  mkdirSync(join(scratch, ".github/workflows"), { recursive: true });
  writeFileSync(join(scratch, ".github/workflows/ci.yml"), readFileSync(join(repoRoot, ".github/workflows/ci.yml")));
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "native inherited qualification"]);
  const head = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  const jobs = [goodJob(head), ...goodProductJobs(head, true)];
  writeFileSync(
    join(scratch, "ci-api.json"),
    JSON.stringify({ ...metadata(head), [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: jobs.length, jobs } }),
  );
  const result = spawnSync(process.execPath, [join(repoRoot, "scripts/ci-qualification.ts"), "release", head], {
    cwd: scratch,
    encoding: "utf8",
    env: inheritedProcessEnv(),
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("");
});

test("product authority requires every current-attempt job and distinguishes legitimate inherited skips", { timeout: scaledBudget(30_000) }, async ({
  scratch,
  fakeBin,
}) => {
  await fakeBin("gh", API_FIXTURE);
  const config = {
    repository: REPOSITORY,
    generation: GENERATION,
    publication: SHA,
    requiredJobs: REQUIRED_JOB_NAMES,
    runtimeJobs: RUNTIME_JOB_NAMES,
    hasCurrentGeneration: () => true,
  };
  const jobsUrl = `${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`;
  const complete = [goodJob(), ...goodProductJobs()];
  const check = (jobs: readonly object[]): boolean => {
    writeFileSync(join(scratch, "ci-api.json"), JSON.stringify({ ...metadata(), [jobsUrl]: { ["total_count"]: jobs.length, jobs } }));
    return hasQualifiedMainPush(scratch, SHA, config);
  };
  expect(check(complete)).toBe(true);
  for (const subject of [...REQUIRED_JOB_NAMES, ...RUNTIME_JOB_NAMES]) {
    expect(check(complete.filter((job) => job.name !== subject)), subject).toBe(false);
    for (const patch of [
      { status: "queued", conclusion: null },
      { conclusion: "skipped" },
      { conclusion: "failure" },
      { conclusion: "cancelled" },
      { ["head_sha"]: "b".repeat(40) },
      { ["run_id"]: 2 },
      { ["run_attempt"]: 1 },
    ]) {
      expect(check(complete.map((job) => (job.name === subject ? { ...job, ...patch } : job))), subject + JSON.stringify(patch)).toBe(false);
    }
  }
  for (const subject of ["static", "ci-ok"]) {
    for (const steps of [[], [{ name: "Orbweaver qualification previous", status: "completed", conclusion: "success" }]]) {
      expect(check(complete.map((job) => (job.name === subject ? { ...job, steps } : job)))).toBe(false);
    }
  }
  expect(check([...complete, { ...goodJob(), id: 99 }])).toBe(false);
  const inherited = complete.map((job) => {
    if (job.name === "ci-ok") {
      return { ...job, steps: [{ name: `${GENERATION} (inherited)`, status: "completed", conclusion: "success" }] };
    }
    return RUNTIME_JOB_NAMES.some((name) => name === job.name) ? { ...job, conclusion: "skipped" } : job;
  });
  expect(check(inherited)).toBe(true);
  expect(check(inherited.map((job) => (job.name === "e2e-smoke" ? { ...job, conclusion: "failure" } : job)))).toBe(false);
});
