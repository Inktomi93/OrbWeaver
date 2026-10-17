import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { qualificationDecision, resolveCiQualification, selectAffectedInstrumentTests } from "@orb/tooling/verify";
import type { CiQualificationConfig } from "../../../../tooling/src/verify/contract/qualification.ts";
import { scaledBudget } from "../../_load-budget.ts";
import {
  API_FIXTURE,
  API_ROOT,
  CORPUS_JOB_NAMES,
  GENERATION,
  goodJob,
  goodProductJobs,
  goodRun,
  metadata,
  REPOSITORY,
  REQUIRED_JOB_NAMES,
  RUNTIME_JOB_NAMES,
  SHA,
} from "./_ci-qualification-support.ts";

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

test.for(["current", "previous-generation", "missing-node-legacy", "missing-ct-legacy"] as const)(
  "the production release producer validates split legacy population: %s",
  async (scenario, { scratch, repoRoot, fakeBin }) => {
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
    const jobs = [goodJob(head), ...goodProductJobs(head, true)]
      .filter(
        ({ name }) =>
          !((scenario === "missing-node-legacy" && name.startsWith("node legacy")) || (scenario === "missing-ct-legacy" && name.startsWith("ct legacy"))),
      )
      .map((job) =>
        scenario === "previous-generation"
          ? { ...job, steps: job.steps.map((step) => ({ ...step, name: step.name.replace(GENERATION, "Orbweaver qualification product-v4") })) }
          : job,
      );
    writeFileSync(
      join(scratch, "ci-api.json"),
      JSON.stringify({ ...metadata(head), [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: jobs.length, jobs } }),
    );
    const result = spawnSync(process.execPath, [join(repoRoot, "scripts/ci-qualification.ts"), "release", head], {
      cwd: scratch,
      encoding: "utf8",
      env: inheritedProcessEnv(),
    });
    expect(result.status, result.stdout + result.stderr).toBe(scenario === "current" ? 0 : 1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(scenario === "current" ? "" : `release: CI for ${head} is not green under the current qualification generation\n`);
  },
);

test.for(["complete", "missing-cell", "duplicate-cell", "failed-cell", "unexpanded-runtime", "unknown-matrix", "numeric-matrix", "unexpanded-name"] as const)(
  "the production release producer requires the canonical corpus population: %s",
  async (scenario, { scratch, repoRoot, fakeBin }) => {
    await fakeBin("gh", API_FIXTURE);
    execFixtureGit(scratch, ["init", "--initial-branch=main"]);
    execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
    execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
    writeFileSync(join(scratch, ".gitignore"), "fake-bin\nci-*\n");
    mkdirSync(join(scratch, ".github/workflows"), { recursive: true });
    let source = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    if (scenario === "unknown-matrix") {
      source = source.replace("${{ fromJSON(needs.changes.outputs.corpus-matrix) }}", "${{ fromJSON(needs.untrusted.outputs.matrix) }}");
    } else if (scenario === "numeric-matrix") {
      source = source.replace("${{ fromJSON(needs.changes.outputs.corpus-matrix) }}", "{ shard: [1] }");
    } else if (scenario === "unexpanded-name") {
      source = source.replace("e2e corpus (${{ matrix.project }})", "e2e corpus (${{ matrix.unexpanded }})");
    }
    writeFileSync(join(scratch, ".github/workflows/ci.yml"), source);
    execFixtureGit(scratch, ["add", "."]);
    execFixtureGit(scratch, ["commit", "-m", "canonical corpus qualification"]);
    const head = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
    const cell = CORPUS_JOB_NAMES[0];
    if (cell === undefined) {
      throw new Error("canonical corpus qualification has no cells");
    }
    const complete = [goodJob(head), ...goodProductJobs(head)];
    let jobs = complete;
    if (scenario === "missing-cell") {
      jobs = complete.filter(({ name }) => name !== cell);
    } else if (scenario === "duplicate-cell") {
      jobs = [...complete, { ...goodJob(head, 1000), name: cell, steps: [] }];
    } else if (scenario === "failed-cell") {
      jobs = complete.map((job) => (job.name === cell ? { ...job, conclusion: "failure" } : job));
    } else if (scenario === "unexpanded-runtime") {
      jobs = [
        ...complete.filter(({ name }) => !CORPUS_JOB_NAMES.includes(name)),
        { ...goodJob(head, 1000), name: "e2e corpus (${{ matrix.project }})", steps: [] },
      ];
    }
    writeFileSync(
      join(scratch, "ci-api.json"),
      JSON.stringify({ ...metadata(head), [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: jobs.length, jobs } }),
    );
    const result = spawnSync(process.execPath, [join(repoRoot, "scripts/ci-qualification.ts"), "release", head], {
      cwd: scratch,
      encoding: "utf8",
      env: inheritedProcessEnv(),
    });
    const malformed = scenario === "unknown-matrix" || scenario === "numeric-matrix" || scenario === "unexpanded-name";
    const proofExit = scenario === "complete" ? 0 : 1;
    expect(result.status, result.stdout + result.stderr).toBe(malformed ? 2 : proofExit);
  },
);
