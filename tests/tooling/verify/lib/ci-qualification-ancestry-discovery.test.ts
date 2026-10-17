import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { resolveCiQualification } from "@orb/tooling/verify";
import { scaledBudget } from "../../_load-budget.ts";
import { API_FIXTURE, API_ROOT, GENERATION, goodRun, metadata, REPOSITORY, REQUIRED_JOB_NAMES, RUNTIME_JOB_NAMES } from "./_ci-qualification-support.ts";

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
