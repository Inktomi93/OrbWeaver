// CI's diff classifier, run as the workflow ships it, against a planted git tree and a faked qualification API.
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, fixturePath, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { TranscriptResult } from "@orb/tooling/floor/process/proc";
import { spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv, withProcessEnv } from "@orb/tooling/floor/process/process-env";
import { LONG_TEST_TIMEOUT_BASE_MS } from "@orb/tooling/floor/testing/test-tags";
import { parse } from "yaml";
import { z } from "zod";
import { INSTRUMENT_EXECUTION_COMPONENT_ENV } from "../../tooling/src/verify/contract/instrument-affected.ts";
import { VERIFY_BASE_ENV, VERIFY_HEAD_ENV } from "../../tooling/src/verify/contract/selection.ts";
import { CORPUS_PROJECT_CELLS } from "../e2e/support/modes.ts";
import { scaledBudget } from "./_load-budget.ts";
import { read, workflowJobs } from "./_workflow-support.ts";

const QUALIFICATION_CONTEXT = [VERIFY_BASE_ENV, VERIFY_HEAD_ENV, INSTRUMENT_EXECUTION_COMPONENT_ENV] as const;
const ISOLATED_QUALIFICATION_ENV = {
  [VERIFY_BASE_ENV]: undefined,
  [VERIFY_HEAD_ENV]: undefined,
  [INSTRUMENT_EXECUTION_COMPONENT_ENV]: undefined,
};
const QUALIFIED_DIFF_API = [
  "import fs from 'node:fs';const [command,endpoint]=process.argv.slice(2);const proof=JSON.parse(fs.readFileSync('api-proof.json','utf8'));",
  `if(${JSON.stringify(QUALIFICATION_CONTEXT)}.some(key=>process.env[key]!==undefined)){process.stderr.write('inherited qualification context');process.exit(73);}`,
  "if(command!=='api'||!endpoint.startsWith('repos/'+proof.repository+'/actions/'))process.exit(74);",
  "const run={id:1,workflow_id:7,run_attempt:proof.attempt??1,head_sha:proof.base,head_branch:'main',event:'push',status:'completed',conclusion:'success',repository:{full_name:proof.repository}};",
  "let response;if(endpoint.endsWith('/workflows/ci.yml'))response={id:7,path:'.github/workflows/ci.yml'};",
  "else if(endpoint.includes('/workflows/7/runs?')){const sha=new URL('https://fixture.invalid/'+endpoint).searchParams.get('head_sha');const present=sha===null||sha===proof.base;response={total_count:present?1:0,workflow_runs:present?[run]:[]};}",
  "else if(endpoint.endsWith('/runs/1'))response=run;",
  "else if(endpoint.includes('/runs/1/attempts/'+run.run_attempt+'/jobs?')){const jobs=proof.jobs.map((name,index)=>({id:index+1,run_id:1,run_attempt:name==='static'?run.run_attempt:proof.productAttempt??run.run_attempt,head_sha:proof.base,name,status:'completed',conclusion:'success',steps:[{name:proof.generation+(name==='ci-ok'?' (runtime)':''),status:'completed',conclusion:'success'}]}));response={total_count:jobs.length,jobs};}",
  "else process.exit(74);process.stdout.write(JSON.stringify(response));",
].join("\n");

const CLASSIFIER_PATH_CASES = [
  [".claude/hooks/check.mjs", true],
  [".codex/config.toml", true],
  [".agents/hooks/check.py", true],
  ["docs/example.txt", false],
  [".claude/README.md", false],
  [".vscode/settings.json", false],
  [".github/ISSUE_TEMPLATE/bug.yml", false],
] as const;
const CLASSIFIER_EVENT_BASE_CASES = [null, "0".repeat(40), "b".repeat(40), ""] as const;
const CLASSIFIER_PROOF_REFUSALS = [
  { jobCount: 1, attempt: 1, productAttempt: 1 },
  { jobCount: 2, attempt: 1, productAttempt: 1 },
  { jobCount: null, attempt: 2, productAttempt: 1 },
] as const;
const CLASSIFIER_INVALID_EVENT_BASE_CASES = ["HEAD^"] as const;
const CLASSIFIER_SETUP_TIMEOUT_MS = scaledBudget(LONG_TEST_TIMEOUT_BASE_MS);
const CLASSIFIER_CHILD_TIMEOUT_MS = scaledBudget(LONG_TEST_TIMEOUT_BASE_MS);
// Every roster row executes a fresh native CLI; one shared test deadline must cover their sequential child ceilings plus preparation.
const CLASSIFIER_TIMEOUT_MS =
  CLASSIFIER_SETUP_TIMEOUT_MS +
  CLASSIFIER_CHILD_TIMEOUT_MS *
    (CLASSIFIER_PATH_CASES.length +
      CLASSIFIER_EVENT_BASE_CASES.length +
      QUALIFICATION_CONTEXT.length +
      CLASSIFIER_PROOF_REFUSALS.length +
      CLASSIFIER_INVALID_EVENT_BASE_CASES.length);

test("CI's actual diff classifier treats agent hooks and configs as code, not documentation", {
  timeout: CLASSIFIER_TIMEOUT_MS,
}, async ({ repoRoot, scratch, plantedTree, fakeBin }) => {
  const invocation = z.string().parse(workflowJobs(repoRoot, "ci")["changes"]?.steps.find((step) => step.id === "diff")?.run);
  const script = invocation.replace("scripts/ci-qualification.ts", JSON.stringify(join(repoRoot, "scripts/ci-qualification.ts")));
  const workflow = read(repoRoot, ".github/workflows/ci.yml");
  const environment = z.object({ env: z.record(z.string(), z.string()) }).parse(parse(workflow)).env;
  const jobs = workflowJobs(repoRoot, "ci");
  const needs = z.array(z.string()).parse(jobs["ci-ok"]?.needs);
  const proofJobs = [
    "ci-ok",
    ...needs.flatMap((id) => {
      const job = jobs[id];
      const matrix = job?.strategy?.matrix;
      if (id === "e2e-corpus") {
        return CORPUS_PROJECT_CELLS.map(({ name }) => z.string().parse(job?.name).replace("${{ matrix.project }}", name));
      }
      const shards = typeof matrix === "object" ? matrix.shard : undefined;
      return shards === undefined
        ? [id]
        : z
            .array(z.number())
            .parse(shards)
            .map((shard) =>
              z
                .string()
                .parse(job?.name)
                .replace("${{ matrix.shard }}", String(shard))
                .replace("${{ strategy.job-total }}", String(z.array(z.number()).parse(shards).length)),
            );
    }),
  ];
  const runtime = z.object({ devEngines: z.json(), packageManager: z.string() }).parse(JSON.parse(read(repoRoot, "package.json")));
  const tree = await plantedTree({
    "README.md": "base\n",
    ".gitignore": "api-proof.json\n",
    ".github/workflows/ci.yml": workflow,
    "package.json": JSON.stringify(runtime),
    "pnpm-lock.yaml": read(repoRoot, "pnpm-lock.yaml"),
  });
  await fakeBin("gh", QUALIFIED_DIFF_API);
  execFixtureGit(tree, ["init", "--initial-branch=main"]);
  execFixtureGit(tree, ["config", "user.name", "Workflow proof"]);
  execFixtureGit(tree, ["config", "user.email", "proof@example.invalid"]);
  const commit = (): string => {
    execFixtureGit(tree, ["add", "."]);
    execFixtureGit(tree, ["commit", "-m", "fixture"]);
    return execFixtureGit(tree, ["rev-parse", "HEAD"]).trim();
  };
  const base = commit();
  let previous = base;
  const output = join(scratch, "diff-output");
  const classify = (before: string, head: string): Promise<TranscriptResult> =>
    spawnNicedTranscript("bash", ["-euo", "pipefail", "-c", script], {
      cwd: tree,
      env: inheritedProcessEnv({ ...ISOLATED_QUALIFICATION_ENV, ["BEFORE"]: before, ["GITHUB_SHA"]: head, ["GITHUB_OUTPUT"]: output }),
      timeoutMs: CLASSIFIER_CHILD_TIMEOUT_MS,
    });
  const run = async (qualified: string, before: string, head: string): Promise<string> => {
    await writeFile(
      join(tree, "api-proof.json"),
      JSON.stringify({
        base: qualified,
        repository: environment["ORB_CI_REPOSITORY"],
        generation: environment["ORB_CI_QUALIFICATION_GENERATION"],
        jobs: proofJobs,
      }),
    );
    await writeFile(output, "");
    const result = await classify(before, head);
    expect(result.code, `${result.transcript}\n${execFixtureGit(tree, ["status", "--porcelain=v1", "--untracked-files=all"])}`).toBe(0);
    return readFileSync(output, "utf8");
  };
  for (const [path, expected] of CLASSIFIER_PATH_CASES) {
    await mkdir(join(tree, path, ".."), { recursive: true });
    await writeFile(fixturePath(tree, path), "proof\n");
    const head = commit();
    expect(await run(previous, previous, head), path).toBe(`base=${previous}\nhead=${head}\nevent_base=${previous}\ncode=${expected}\nauthority=qualified\n`);
    previous = head;
  }
  for (const eventBase of CLASSIFIER_EVENT_BASE_CASES) {
    const before = eventBase ?? base;
    expect(await run(base, before, previous)).toBe(`base=${base}\nhead=${previous}\nevent_base=${before}\ncode=true\nauthority=qualified\n`);
  }
  for (const key of QUALIFICATION_CONTEXT) {
    await withProcessEnv(key, "hosted-context", async () => {
      expect(await run(base, base, previous)).toContain("authority=qualified\n");
    });
  }
  for (const { jobCount, attempt, productAttempt } of CLASSIFIER_PROOF_REFUSALS) {
    await writeFile(
      join(tree, "api-proof.json"),
      JSON.stringify({
        base,
        repository: environment["ORB_CI_REPOSITORY"],
        generation: environment["ORB_CI_QUALIFICATION_GENERATION"],
        jobs: jobCount === null ? proofJobs : proofJobs.slice(0, jobCount),
        attempt,
        productAttempt,
      }),
    );
    await writeFile(output, "");
    const refused = await classify(base, previous);
    expect(refused.code, refused.transcript).toBe(2);
    expect(refused.transcript).toContain("admitted publication is not an ancestor");
    expect(readFileSync(output, "utf8")).toBe("");
  }
  for (const before of CLASSIFIER_INVALID_EVENT_BASE_CASES) {
    const malformed = await classify(before, previous);
    expect(malformed.code).toBe(3);
    expect(malformed.transcript).toContain("CI event base must be empty or a commit ID");
  }
});
