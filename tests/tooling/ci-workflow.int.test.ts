// The CI workflow's budgets, partitions and setup action keep their promises, run as the scripts the workflow ships.
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { TranscriptResult } from "@orb/tooling/floor/process/proc";
import { spawnNiced, spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { LONG_TEST_TIMEOUT_BASE_MS } from "@orb/tooling/floor/testing/test-tags";
import { applicationPartitionKeys } from "@orb/tooling/verify";
import { parse } from "yaml";
import { z } from "zod";
import { INSTRUMENT_EXECUTION_COMPONENT_ENV } from "../../tooling/src/verify/contract/instrument-affected.ts";
import { CORPUS_PROJECT_CELLS } from "../e2e/support/modes.ts";
import { scaledBudget } from "./_load-budget.ts";
import { read, setupSteps, workflowJobs } from "./_workflow-support.ts";

const SELECT_DIAGNOSTIC_TIMEOUT =
  "${{ (inputs.select_cpu_diagnostic_context == 'ct-shard-4' || inputs.select_cpu_diagnostic_context == 'ct-shard-4-native') && 120 || 15 }}";

test("published-image scans cannot turn registry failure into a successful skip", async ({ repoRoot, fakeBin }) => {
  const image = workflowJobs(repoRoot, "security-scans")["image"];
  expect(image?.if).toBe("github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'");
  const steps = image?.steps ?? [];
  // The obsolete prelaunch probe swallowed every manifest error, including authentication/network errors.
  await fakeBin("docker", "process.exit(1);");
  const probe = steps.find((step) => step.id === "exists");
  const result = probe?.run === undefined ? undefined : await spawnNiced("bash", ["-euo", "pipefail", "-c", probe.run], { env: { ["IMAGE"]: "proof-image" } });
  expect(result?.code, "registry failure must not be reported as a successful skipped scan").not.toBe(0);
  expect(probe).toBeUndefined();
  const scan = steps.find((step) => step.uses?.startsWith("aquasecurity/trivy-action@") === true);
  const upload = steps.find((step) => step.uses?.startsWith("github/codeql-action/upload-sarif@") === true);
  expect(scan).toBeDefined();
  expect(scan?.if).toBeUndefined();
  expect(scan?.with).toMatchObject({ "image-ref": "${{ env.IMAGE }}", severity: "HIGH,CRITICAL", "ignore-unfixed": true, output: "trivy.sarif" });
  expect(upload).toBeDefined();
  expect(upload?.if).toBeUndefined();
  expect(upload?.with?.["sarif_file"]).toBe("trivy.sarif");
});

test("CI gives the static floor its full budget", ({ repoRoot }) => {
  const jobs = workflowJobs(repoRoot, "ci");
  expect(jobs["qualification"]?.["timeout-minutes"]).toBe(15);
  expect(jobs["static"]?.["timeout-minutes"]).toBe(60);
  expect(jobs["select-cpu-diagnostic"]).toBeUndefined();
  expect(workflowJobs(repoRoot, "diagnostics")["select-cpu-diagnostic"]?.["timeout-minutes"]).toBe(SELECT_DIAGNOSTIC_TIMEOUT);
});

test("weekly corpus passes its complete shard roster as shell data, not template source", async ({ repoRoot, scratch, fakeBin }) => {
  const corpus = workflowJobs(repoRoot, "ci")["weekly-tooling"];
  const shards = (typeof corpus?.strategy?.matrix === "object" ? corpus.strategy.matrix.include : undefined)
    ?.filter((row) => row.component === "corpus")
    .map(({ shard }) => shard);
  const proof = corpus?.steps.find((step) => step.id === "proof");
  const shardEnv = "CORPUS_SHARD";
  expect(shards).toEqual(["1/2", "2/2"]);
  expect(corpus?.env).toEqual({ [INSTRUMENT_EXECUTION_COMPONENT_ENV]: "${{ matrix.component }}", [shardEnv]: "${{ matrix.shard }}" });
  const script = z.string().parse(proof?.run);
  expect(script).not.toContain("${{");
  await fakeBin("pnpm", "import fs from 'node:fs';fs.writeFileSync('corpus-call.json',JSON.stringify(process.argv.slice(2)));");
  const literalShard = `literal shard with spaces; $${shardEnv}`;
  for (const shard of [...z.array(z.string()).parse(shards), literalShard]) {
    const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", script], {
      cwd: scratch,
      env: { [INSTRUMENT_EXECUTION_COMPONENT_ENV]: "corpus", [shardEnv]: shard },
    });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(read(scratch, "corpus-call.json"))).toEqual(["test:tooling", `--shard=${shard}`]);
  }
  const unsafeScript = script.replace('--shard="$CORPUS_SHARD"', "--shard=$CORPUS_SHARD");
  expect(unsafeScript).not.toBe(script);
  const unsafe = await spawnNiced("bash", ["-euo", "pipefail", "-c", unsafeScript], {
    cwd: scratch,
    env: { [INSTRUMENT_EXECUTION_COMPONENT_ENV]: "corpus", [shardEnv]: literalShard },
  });
  expect(unsafe.code, unsafe.stderr).toBe(0);
  expect(JSON.parse(read(scratch, "corpus-call.json"))).not.toEqual(["test:tooling", `--shard=${literalShard}`]);
});

test("application static CI routes parallel duplication through the subject owner and scheduled jobs use checked-out setup", ({ repoRoot }) => {
  const parallelStep = z.object({ name: z.string().optional(), run: z.string().optional() });
  const step = parallelStep.extend({
    uses: z.string().optional(),
    with: z.record(z.string(), z.json()).optional(),
    parallel: z.array(parallelStep).optional(),
  });
  const workflow = z.object({ jobs: z.record(z.string(), z.object({ steps: z.array(step) })) }).parse(parse(read(repoRoot, ".github/workflows/ci.yml")));
  const staticSteps = workflow.jobs["static"]?.steps ?? [];
  const duplication = staticSteps.flatMap((row) => row.parallel ?? []).find((row) => row.name === "Copy-paste detection");
  expect(duplication?.run).toBe("pnpm exec node tooling/src/verify/cli.ts application-static cpd");
  for (const name of ["qualification", "qualification-partition", "weekly-tooling"]) {
    const steps = workflow.jobs[name]?.steps ?? [];
    const checkout = steps.findIndex((row) => row.uses?.startsWith("actions/checkout@") === true);
    const setup = steps.findIndex((row) => row.uses === "./.github/actions/setup");
    expect(checkout, name).toBeGreaterThanOrEqual(0);
    expect(setup, name).toBeGreaterThan(checkout);
    expect(steps[checkout]?.with?.["ref"], name).toBe("main");
    expect(
      steps.some((row) => row.uses === "$/.github/actions/setup"),
      name,
    ).toBe(false);
  }
  for (const name of ["static", "node", "ct", "e2e-smoke"]) {
    expect(
      workflow.jobs[name]?.steps.some((row) => row.uses === "$/.github/actions/setup"),
      name,
    ).toBe(true);
  }
});

test("weekly partitions execute one frozen main commit and refuse off-main or rewritten-history sources before setup", async ({ repoRoot, plantedTree }) => {
  const jobs = workflowJobs(repoRoot, "ci");
  const resolver = jobs["weekly-head"];
  const tooling = jobs["weekly-tooling"];
  const steps = tooling?.steps ?? [];
  const checkout = steps.findIndex((step) => step.uses?.startsWith("actions/checkout@") === true);
  const source = steps.findIndex((step) => step.id === "source");
  const setup = steps.findIndex((step) => step.uses === "./.github/actions/setup");
  const control = steps[source];
  const script = z.string().parse(control?.run);
  expect(tooling?.needs).toBe("weekly-head");
  expect(resolver?.if).toBe("${{ (github.event.schedule == '37 10 * * 0' || (github.event_name == 'workflow_dispatch' && inputs.tier == 'weekly')) }}");
  expect(resolver?.steps[0]?.with).toEqual({ ref: "main", "persist-credentials": false });
  expect(resolver?.outputs).toEqual({ sha: "${{ steps.sha.outputs.sha }}" });
  expect(resolver?.steps.find((step) => step.id === "sha")?.run).toBe('echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"');
  expect(steps[checkout]?.with).toEqual({ ref: "main", "fetch-depth": 0, "persist-credentials": false });
  expect(source).toBeGreaterThan(checkout);
  expect(source).toBeLessThan(setup);
  expect(control?.if).toBeUndefined();
  expect(control?.env).toEqual({ ["FROZEN_MAIN_SHA"]: "${{ needs.weekly-head.outputs.sha }}" });
  expect(script).not.toContain("${{");
  expect(jobs["weekly-ok"]?.needs).toEqual(["weekly-head", "weekly-tooling"]);
  expect(jobs["ci-ok"]?.needs).not.toContain("weekly-tooling");

  const tree = await plantedTree({ ".github/actions/setup/action.yml": "frozen setup\n" });
  execFixtureGit(tree, ["init", "--initial-branch=main"]);
  execFixtureGit(tree, ["config", "user.name", "Workflow proof"]);
  execFixtureGit(tree, ["config", "user.email", "proof@example.invalid"]);
  execFixtureGit(tree, ["add", "."]);
  execFixtureGit(tree, ["commit", "-m", "frozen main"]);
  const frozen = execFixtureGit(tree, ["rev-parse", "HEAD"]).trim();
  const nonCommit = execFixtureGit(tree, ["rev-parse", "HEAD^{tree}"]).trim();
  execFixtureGit(tree, ["tag", "-a", "frozen-tag", "-m", "annotated tag"]);
  const tagObject = execFixtureGit(tree, ["rev-parse", "frozen-tag"]).trim();
  execFixtureGit(tree, ["checkout", "-b", "untrusted"]);
  await writeFile(join(tree, ".github/actions/setup/action.yml"), "off-main setup\n");
  execFixtureGit(tree, ["commit", "-am", "off-main source"]);
  const offMain = execFixtureGit(tree, ["rev-parse", "HEAD"]).trim();
  execFixtureGit(tree, ["checkout", "main"]);
  await writeFile(join(tree, ".github/actions/setup/action.yml"), "advanced main setup\n");
  execFixtureGit(tree, ["commit", "-am", "advanced main"]);
  const advanced = execFixtureGit(tree, ["rev-parse", "HEAD"]).trim();
  execFixtureGit(tree, ["update-ref", "refs/remotes/origin/main", advanced]);
  const run = (candidate: string, command = script): Promise<TranscriptResult> =>
    spawnNicedTranscript("bash", ["-euo", "pipefail", "-c", command], {
      cwd: tree,
      env: { ["FROZEN_MAIN_SHA"]: candidate },
      timeoutMs: scaledBudget(LONG_TEST_TIMEOUT_BASE_MS),
    });
  for (const candidate of ["", "main", "refs/heads/main", "f".repeat(40), nonCommit, tagObject, offMain]) {
    const refused = await run(candidate);
    expect(refused.code, `${candidate}: ${refused.transcript}`).not.toBe(0);
    expect(execFixtureGit(tree, ["rev-parse", "HEAD"]).trim()).toBe(advanced);
    expect(read(tree, ".github/actions/setup/action.yml")).toBe("advanced main setup\n");
  }
  // A locally present commit removed by a main-history rewrite is no longer authorized.
  execFixtureGit(tree, ["update-ref", "refs/remotes/origin/main", offMain]);
  const rewritten = await run(advanced);
  expect(rewritten.code, rewritten.transcript).not.toBe(0);
  expect(execFixtureGit(tree, ["rev-parse", "HEAD"]).trim()).toBe(advanced);
  execFixtureGit(tree, ["update-ref", "refs/remotes/origin/main", advanced]);
  for (const partition of (typeof tooling?.strategy?.matrix === "object" ? tooling.strategy.matrix.include : undefined) ?? []) {
    execFixtureGit(tree, ["checkout", "--detach", advanced]);
    const accepted = await run(frozen);
    expect(accepted.code, `${partition.component}/${partition.shard}: ${accepted.transcript}`).toBe(0);
    expect(execFixtureGit(tree, ["rev-parse", "HEAD"]).trim()).toBe(frozen);
    expect(read(tree, ".github/actions/setup/action.yml")).toBe("frozen setup\n");
  }

  const unsafe = script.replace(/^\s*git merge-base --is-ancestor.*\n/mu, "");
  expect(unsafe).not.toBe(script);
  const exposed = await run(offMain, unsafe);
  expect(exposed.code, exposed.transcript).toBe(0);
  expect(read(tree, ".github/actions/setup/action.yml")).toBe("off-main setup\n");
});

test("static tooling qualification provisions the pinned Chromium and retains cache-hit dependencies and failed-install refusal", async ({
  repoRoot,
  scratch,
  fakeBin,
}) => {
  const steps = workflowJobs(repoRoot, "ci")["static"]?.steps ?? [];
  const setup = steps.find((step) => step.uses === "$/.github/actions/setup");
  expect(setup?.with?.["browsers"]).toBe("true");
  const proof = steps.findIndex((step) => step.name === "${{ env.ORB_CI_QUALIFICATION_GENERATION }}");
  expect(proof).toBeGreaterThan(-1);
  expect(steps[proof]?.run).toBe("pnpm check --application --verbose");
  expect(steps.findIndex((step) => step.uses === "$/.github/actions/setup")).toBeLessThan(proof);
  const composite = setupSteps(repoRoot);
  const version = composite.find((step) => step.id === "playwright");
  expect(version?.run).toContain("pnpm exec playwright --version");
  const cold = composite.find((step) => step.run === "pnpm exec playwright install --with-deps chromium");
  const warm = composite.find((step) => step.run === "pnpm exec playwright install-deps chromium");
  expect(cold?.if).toBe("inputs.browsers == 'true' && steps.browser-cache.outputs.cache-hit != 'true'");
  expect(warm?.if).toBe("inputs.browsers == 'true' && steps.browser-cache.outputs.cache-hit == 'true'");
  await fakeBin(
    "pnpm",
    "import fs from 'node:fs';fs.writeFileSync('browser-call.json',JSON.stringify(process.argv.slice(2)));process.exitCode=Number(process.env.PROVISION_EXIT);",
  );
  for (const [cacheHit, exit] of [
    [false, 0],
    [true, 0],
    [false, 71],
    [true, 71],
  ] as const) {
    const selected = cacheHit ? warm : cold;
    const ready = join(scratch, "proof-ready");
    await writeFile(ready, "");
    const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", `${selected?.run ?? ""}\nprintf ready > proof-ready`], {
      cwd: scratch,
      env: { ["PROVISION_EXIT"]: String(exit) },
    });
    expect(result.code, result.stderr).toBe(exit);
    expect(JSON.parse(read(scratch, "browser-call.json"))).toEqual(
      cacheHit ? ["exec", "playwright", "install-deps", "chromium"] : ["exec", "playwright", "install", "--with-deps", "chromium"],
    );
    expect(readFileSync(ready, "utf8")).toBe(exit === 0 ? "ready" : "");
  }
});

test("CI preserves successful retry artifacts", ({ repoRoot }) => {
  const jobs = workflowJobs(repoRoot, "ci");
  for (const name of ["e2e-smoke", "e2e-corpus", "qualification", "qualification-partition"]) {
    const upload = jobs[name]?.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@") === true);
    expect(upload?.if, name).toBe(name === "qualification" ? "${{ !cancelled() && needs.qualification-head.outputs.seen != 'true' }}" : "${{ !cancelled() }}");
    expect(upload?.with?.["path"], name).toBe(name.startsWith("e2e-") ? "reports/\ntest-results/\n" : "reports/");
  }
});

test("CI plans every canonical corpus cell and forwards one exact project per isolated runner", { timeout: scaledBudget(20_000) }, async ({
  repoRoot,
  scratch,
  fakeBin,
}) => {
  const jobs = workflowJobs(repoRoot, "ci");
  const corpus = jobs["e2e-corpus"];
  const plan = jobs["changes"]?.steps.find((step) => step.id === "corpus");
  expect(plan?.run).toBe("pnpm exec node scripts/ci-plan.ts corpus");
  expect(jobs["changes"]?.outputs?.["corpus-matrix"]).toBe("${{ steps.corpus.outputs.matrix }}");
  expect(corpus?.strategy?.matrix).toBe("${{ fromJSON(needs.changes.outputs.corpus-matrix) }}");
  expect(corpus?.name).toBe("e2e corpus (${{ matrix.project }})");
  expect(corpus?.env).toEqual({ ["CORPUS_PROJECT"]: "${{ matrix.project }}" });
  const output = join(scratch, "plan-output");
  const planned = await spawnNiced(process.execPath, [join(repoRoot, "scripts/ci-plan.ts"), "corpus"], { cwd: repoRoot, env: { ["GITHUB_OUTPUT"]: output } });
  expect(planned.code, planned.stderr).toBe(0);
  const expected = { include: CORPUS_PROJECT_CELLS.map(({ name }) => ({ project: name })) };
  expect(JSON.parse(planned.stdout)).toEqual(expected);
  expect(readFileSync(output, "utf8")).toBe(`matrix=${JSON.stringify(expected)}\n`);
  expect(new Set(expected.include.map(({ project }) => project)).size).toBe(expected.include.length);
  const command = z.string().parse(corpus?.steps.find((step) => step.run?.startsWith("pnpm e2e:corpus:matrix") === true)?.run);
  expect(command).not.toContain("${{");
  await fakeBin(
    "pnpm",
    "import fs from 'node:fs';fs.writeFileSync('corpus-call.json',JSON.stringify(process.argv.slice(2)));process.exitCode=Number(process.env.FIXTURE_EXIT);",
  );
  for (const { name } of CORPUS_PROJECT_CELLS) {
    const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", command], { cwd: scratch, env: { ["CORPUS_PROJECT"]: name, ["FIXTURE_EXIT"]: "0" } });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(read(scratch, "corpus-call.json"))).toEqual(["e2e:corpus:matrix", `--project=${name}`]);
  }
  const failed = await spawnNiced("bash", ["-euo", "pipefail", "-c", command], {
    cwd: scratch,
    env: { ["CORPUS_PROJECT"]: CORPUS_PROJECT_CELLS[0]?.name ?? "", ["FIXTURE_EXIT"]: "19" },
  });
  expect(failed.code).toBe(19);
  expect(jobs["e2e-smoke"]?.steps.filter((step) => step.run?.startsWith("pnpm e2e") === true).map((step) => step.run)).toEqual(["pnpm e2e:smoke"]);
});

test.for(["full", "product"] as const)("CI preserves %s application partition planning", { timeout: scaledBudget(10_000) }, async (tier, { repoRoot }) => {
  const result = await spawnNiced(process.execPath, [join(repoRoot, "scripts/ci-plan.ts"), tier], { cwd: repoRoot });
  expect(result.code, result.stderr).toBe(0);
  const matrix = z.object({ include: z.array(z.object({ partition: z.string(), shard: z.string(), key: z.string() })) }).parse(JSON.parse(result.stdout));
  expect(matrix.include.map(({ partition, shard }) => (shard === "" ? partition : `${partition}:${shard}`))).toEqual(applicationPartitionKeys(tier));
});

test("setup has one cache owner and only saves successful misses from trusted triggers", ({ repoRoot }) => {
  const steps = setupSteps(repoRoot);
  const pnpm = steps.find((step) => step.uses?.startsWith("pnpm/action-setup@") === true);
  expect(pnpm?.with?.["cache"]).toBe(false);
  expect(steps.filter((step) => step.uses?.startsWith("actions/cache@") === true)).toEqual([]);
  const restores = steps.filter((step) => step.uses?.startsWith("actions/cache/restore@") === true);
  const saves = steps.filter((step) => step.uses?.startsWith("actions/cache/save@") === true);
  expect(restores.map((step) => step.id)).toEqual(["pnpm-cache", "browser-cache"]);
  expect(saves).toHaveLength(restores.length);
  const installIndex = steps.findIndex((step) => step.name === "pnpm install");
  expect(installIndex).toBeGreaterThan(steps.findIndex((step) => step.id === "pnpm-cache"));
  for (const [index, restore] of restores.entries()) {
    const save = saves[index];
    if (save === undefined) {
      throw new Error("Missing setup cache save");
    }
    expect(save.with?.["path"]).toBe(restore.with?.["path"]);
    expect(save.with?.["key"]).toBe(`\${{ steps.${restore.id}.outputs.cache-primary-key }}`);
    const browserOnly = restore.id === "browser-cache" ? "inputs.browsers == 'true' && " : "";
    expect(save.if).toBe(`${browserOnly}steps.pnpm.outputs.save == 'true' && steps.${restore.id}.outputs.cache-hit != 'true'`);
    expect(steps.indexOf(save)).toBeGreaterThan(installIndex);
  }
  expect(restores[0]?.with?.["path"]).toBe("${{ steps.pnpm.outputs.paths }}");
  expect(restores[0]?.with?.["key"]).toBe("pnpm-${{ runner.os }}-${{ runner.arch }}-${{ steps.pnpm.outputs.version }}-${{ hashFiles('pnpm-lock.yaml') }}");
  expect(restores[0]?.with?.["restore-keys"]).toBe("pnpm-${{ runner.os }}-${{ runner.arch }}-${{ steps.pnpm.outputs.version }}-\n");
  expect(restores[1]?.with?.["key"]).toBe("playwright-${{ runner.os }}-${{ runner.arch }}-${{ steps.playwright.outputs.version }}");
  expect(restores[1]?.with?.["restore-keys"]).toBeUndefined();
});

test("setup derives cache paths from pnpm and denies cache writes to every untrusted event", async ({ repoRoot, scratch, fakeBin }) => {
  const script = z.string().parse(setupSteps(repoRoot).find((step) => step.id === "pnpm")?.run);
  await fakeBin(
    "pnpm",
    `
    const args = process.argv.slice(2);
    if (args[0] === "--version") console.log("12.6.0");
    else if (args.join(" ") === "store path --silent") console.log("/resolved pnpm/store/v11");
    else if (args.join(" ") === "cache path --silent") console.log("/resolved pnpm/cache");
    else process.exit(1);
  `,
  );
  const output = join(scratch, "cache-output");
  for (const event of ["push", "workflow_dispatch", "schedule", "pull_request", "pull_request_target", "workflow_run", "issue_comment"]) {
    await writeFile(output, "");
    const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", script], {
      env: Object.fromEntries([
        ["GITHUB_EVENT_NAME", event],
        ["GITHUB_OUTPUT", output],
      ]),
    });
    expect(result.code, result.stderr).toBe(0);
    const values = readFileSync(output, "utf8");
    expect(values).toContain("version=12.6.0\n");
    expect(values).toContain("paths<<EOF\n/resolved pnpm/store/v11\n/resolved pnpm/cache\nEOF\n");
    expect(values).toContain(`save=${["push", "workflow_dispatch", "schedule"].includes(event)}\n`);
  }
});
