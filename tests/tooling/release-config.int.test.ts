// The stable release automation's couplings that no single file shows: release-please must write the tag the
// version reader looks for (or every stable build reads as `main`), and the release workflow must publish the
// image the default compose file pulls, built from the tag so its stamp derives the stable channel.

import { readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { releaseTagRef } from "@orb/kit/version-identity";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import type { SpawnNicedOptions, TranscriptResult } from "@orb/tooling/_shared/proc";
import { spawnNiced, spawnNicedTranscript } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv, withProcessEnv } from "@orb/tooling/_shared/process-env";
import { SEMANTIC_CORPUS_RESOURCE } from "@orb/tooling/_shared/test-kinds";
import { parse } from "yaml";
import { z } from "zod";
import { INSTRUMENT_EXECUTION_COMPONENT_ENV } from "../../tooling/src/verify/contract/instrument-affected.ts";
import { VERIFY_TOOL_MODE_ENV } from "../../tooling/src/verify/contract/qualification.ts";
import { VERIFY_BASE_ENV, VERIFY_HEAD_ENV } from "../../tooling/src/verify/contract/selection.ts";
import { expect, fixturePath, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

function read(repoRoot: string, rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const releaseConfig = z.object({
  packages: z.object({
    ".": z.object({
      "include-v-in-tag": z.boolean().optional(),
      "include-component-in-tag": z.boolean().optional(),
      "initial-version": z.string(),
      "bump-minor-pre-major": z.boolean().optional(),
      "bump-patch-for-minor-pre-major": z.boolean().optional(),
    }),
  }),
});

const releaseWorkflow = z.object({
  on: z.object({ push: z.object({ branches: z.array(z.string()) }) }),
  jobs: z.object({
    image: z.object({
      if: z.string(),
      env: z.record(z.string(), z.string()),
      steps: z.array(z.object({ name: z.string().optional(), uses: z.string().optional(), with: z.record(z.string(), z.json()).optional() })),
    }),
  }),
});

test("release-please tags a release exactly as the version reader looks for it", ({ repoRoot }) => {
  const root = releaseConfig.parse(JSON.parse(read(repoRoot, "release-please-config.json"))).packages["."];
  // release-please's defaults: a `v` prefix unless turned off, a component prefix unless turned off.
  const prefix = root["include-v-in-tag"] === false ? "" : "v";
  expect(root["include-component-in-tag"]).toBe(false);
  expect(`refs/tags/${prefix}${root["initial-version"]}`).toBe(releaseTagRef(root["initial-version"]));
});

test("the first release is v0.1.0 and the version stays below 1.0: feat bumps the minor, fix the patch", ({ repoRoot }) => {
  const root = releaseConfig.parse(JSON.parse(read(repoRoot, "release-please-config.json"))).packages["."];
  expect(root["initial-version"]).toBe("0.1.0");
  // A breaking change bumps the minor instead of jumping to 1.0.0; a feature keeps its minor bump.
  expect(root["bump-minor-pre-major"]).toBe(true);
  expect(root["bump-patch-for-minor-pre-major"]).not.toBe(true);
});

test("the release workflow runs on the stable branch and publishes, from the tag, the image compose pulls", ({ repoRoot }) => {
  const workflow = releaseWorkflow.parse(parse(read(repoRoot, ".github/workflows/release.yml")));
  expect(workflow.on.push.branches).toEqual(["release"]);
  expect(workflow.jobs.image.if).toContain("release_created == 'true'");
  const checkout = workflow.jobs.image.steps.find((step) => step.uses?.startsWith("actions/checkout@") === true);
  expect(checkout?.with?.["ref"]).toBe("refs/tags/${{ needs.release-please.outputs.tag_name }}");

  const compose = z
    .object({ services: z.object({ orbweaver: z.object({ image: z.string(), build: z.unknown().optional() }) }) })
    .parse(parse(read(repoRoot, "docker-compose.yaml")));
  expect(compose.services.orbweaver.image).toBe(`\${ORB_IMAGE:-${workflow.jobs.image.env["IMAGE"] ?? "no IMAGE env"}:latest}`);
  // The base file never builds: a source build has its own overlay and its own local image name.
  expect(compose.services.orbweaver.build).toBeUndefined();
});

test("development publication selects an exact source commit and cannot overwrite stable image tags", ({ repoRoot }) => {
  const workflow = z
    .object({
      on: z.object({ push: z.object({ branches: z.array(z.string()) }) }).loose(),
      permissions: z.object({}).strict(),
      jobs: z.object({
        image: z.object({
          permissions: z.object({ contents: z.literal("read"), packages: z.literal("write") }).strict(),
          env: z.record(z.string(), z.string()),
          steps: z.array(
            z.object({
              name: z.string().optional(),
              uses: z.string().optional(),
              run: z.string().optional(),
              with: z.record(z.string(), z.unknown()).optional(),
            }),
          ),
        }),
      }),
    })
    .parse(parse(read(repoRoot, ".github/workflows/development-image.yml")));
  const image = workflow.jobs.image;
  expect(image.env["IMAGE"]).toBe("ghcr.io/inktomi93/orbweaver");
  const checkout = image.steps.find((step) => step.uses?.startsWith("actions/checkout@") === true);
  expect(workflow.on.push.branches).toEqual(["codex/launch-packages"]);
  expect(workflow.on).toHaveProperty("workflow_dispatch", null);
  expect(checkout?.with?.["ref"]).toBe("${{ github.sha }}");
  expect(checkout?.with?.["persist-credentials"]).toBe(false);
  expect(checkout?.with?.["fetch-tags"]).toBe(false);
  const build = image.steps.find((step) => step.uses?.startsWith("docker/build-push-action@") === true);
  expect(build?.with?.["tags"]).toBe("${{ env.IMAGE }}:sha-${{ github.sha }}\n");
  expect(build?.with?.["push"]).not.toBe(true);
  const stamp = image.steps.find((step) => step.name === "Prove development identity");
  expect(stamp?.run).toContain('.commit == $sha and .channel == "main"');
  const boot = image.steps.find((step) => step.name === "Prove fresh runtime boot");
  expect(boot?.run).toContain("http://127.0.0.1:18788/healthz");
  expect(boot?.run).toContain('.version.commit == $sha and .version.channel == "main"');
  const publish = image.steps.findIndex((step) => step.name === "Push development tags");
  expect(publish).toBeGreaterThan(image.steps.findIndex((step) => step.name === "Prove development identity"));
  expect(publish).toBeGreaterThan(image.steps.findIndex((step) => step.name === "Prove fresh runtime boot"));
  expect(image.steps[publish]?.run).toContain('"$IMAGE:development"');
  expect(image.steps[publish]?.run).not.toMatch(/:latest|:stable/u);
  const anonymous = image.steps.find((step) => step.name === "Prove anonymous digest pull");
  expect(anonymous?.run).toContain("--src-no-creds --preserve-digests");
  expect(anonymous?.run).toContain("oci:/proof/image:published");
});

const pluginAuthoring = z.object({
  component: z.string(),
  "include-component-in-tag": z.literal(true),
  "include-v-in-tag": z.boolean().optional(),
  "version-file": z.string(),
  "extra-files": z.array(z.object({ type: z.literal("json"), path: z.string(), jsonpath: z.literal("$.version") })),
  "exclude-paths": z.array(z.string()),
  prerelease: z.boolean(),
  draft: z.boolean(),
  "force-tag-creation": z.boolean(),
});
const AUTHORING_PACKAGES = ["plugin-sdk", "plugin-toolchain"];

for (const [workflowName, cacheTag, publishName, proofName] of [
  ["release", "buildcache-release", "Push both tags", "Prove the image is this stable release"],
  ["development-image", "buildcache-development", "Push development tags", "Prove fresh runtime boot"],
] as const) {
  test(`${workflowName} exports intermediate build cache without publishing an unverified runtime image`, ({ repoRoot }) => {
    const workflow = z
      .object({
        on: z.object({ push: z.object({ branches: z.array(z.string()) }), ["workflow_dispatch"]: z.null().optional() }).strict(),
        jobs: z.object({
          image: z.object({
            permissions: z.object({ packages: z.literal("write") }),
            env: z.record(z.string(), z.string()),
            steps: z.array(
              z.object({
                name: z.string().optional(),
                uses: z.string().optional(),
                run: z.string().optional(),
                with: z.record(z.string(), z.json()).optional(),
              }),
            ),
          }),
        }),
      })
      .parse(parse(read(repoRoot, `.github/workflows/${workflowName}.yml`)));
    const { env, steps } = workflow.jobs.image;
    const buildIndex = steps.findIndex((step) => step.uses?.startsWith("docker/build-push-action@") === true);
    const loginIndex = steps.findIndex((step) => step.uses?.startsWith("docker/login-action@") === true);
    expect(buildIndex).toBeGreaterThan(-1);
    expect(loginIndex).toBeGreaterThan(-1);
    expect(loginIndex).toBeLessThan(buildIndex);
    expect(steps[loginIndex]?.with).toEqual({ registry: "ghcr.io", username: "${{ github.actor }}", password: "${{ secrets.GITHUB_TOKEN }}" });
    const build = steps[buildIndex]?.with;
    const exportIndex = steps.findIndex((step) => step.with?.["outputs"] === "type=cacheonly");
    const cacheExport = steps[exportIndex]?.with;
    expect(build?.["cache-from"]).toBe("type=registry,ref=${{ env.BUILD_CACHE }}");
    expect(build?.["cache-to"]).toBeUndefined();
    expect(cacheExport?.["cache-to"]).toBe("type=registry,ref=${{ env.BUILD_CACHE }},mode=max,ignore-error=true");
    expect(env["BUILD_CACHE"]).toBe(`${env["IMAGE"]}:${cacheTag}`);
    expect(build?.["tags"]).not.toContain(env["BUILD_CACHE"]);
    expect(build?.["load"]).toBe(true);
    expect(build?.["builder"]).toBe("${{ steps.builder.outputs.name }}");
    expect(build?.["push"]).not.toBe(true);
    expect(cacheExport?.["load"]).not.toBe(true);
    expect(cacheExport?.["push"]).not.toBe(true);
    expect(steps[exportIndex]?.uses).toBe(steps[buildIndex]?.uses);
    for (const key of ["context", "target", "platforms", "build-args", "builder"]) {
      expect(cacheExport?.[key], key).toBe(build?.[key]);
    }
    const publishIndex = steps.findIndex((step) => step.name === publishName);
    const proofIndex = steps.findIndex((step) => step.name === proofName);
    expect(proofIndex).toBeGreaterThan(buildIndex);
    expect(exportIndex).toBeGreaterThan(proofIndex);
    expect(publishIndex).toBeGreaterThan(exportIndex);
    expect(publishIndex).toBeGreaterThan(proofIndex);
    expect(
      steps
        .slice(0, publishIndex)
        .map((step) => step.run ?? "")
        .join("\n"),
    ).not.toMatch(/\bdocker push\b/u);
  });
}

test("registry cache authentication does not move runtime publication ahead of the critical vulnerability gate", ({ repoRoot }) => {
  const { steps } = releaseWorkflow.parse(parse(read(repoRoot, ".github/workflows/release.yml"))).jobs.image;
  const buildIndex = steps.findIndex((step) => step.uses?.startsWith("docker/build-push-action@") === true);
  const scanIndex = steps.findIndex((step) => step.name === "Refuse critical fixable vulnerabilities");
  const publishIndex = steps.findIndex((step) => step.name === "Push both tags");
  const exportIndex = steps.findIndex((step) => step.with?.["outputs"] === "type=cacheonly");
  expect(scanIndex).toBeGreaterThan(buildIndex);
  expect(exportIndex).toBeGreaterThan(scanIndex);
  expect(publishIndex).toBeGreaterThan(exportIndex);
  expect(steps[scanIndex]?.with).toMatchObject({ severity: "CRITICAL", "ignore-unfixed": true, "exit-code": "1" });
});

const setupStep = z.object({
  name: z.string().optional(),
  id: z.string().optional(),
  uses: z.string().optional(),
  run: z.string().optional(),
  if: z.string().optional(),
  with: z.record(z.string(), z.json()).optional(),
});

function setupSteps(repoRoot: string): z.infer<typeof setupStep>[] {
  return z.object({ runs: z.object({ steps: z.array(setupStep) }) }).parse(parse(read(repoRoot, ".github/actions/setup/action.yml"))).runs.steps;
}

const workflowConfig = z.object({
  jobs: z.record(
    z.string(),
    z.object({
      name: z.string().optional(),
      if: z.string().optional(),
      env: z.record(z.string(), z.string()).optional(),
      strategy: z.object({ matrix: z.object({ shard: z.array(z.number()).optional() }) }).optional(),
      "timeout-minutes": z.number().optional(),
      steps: z.array(setupStep),
    }),
  ),
});

function workflowJobs(repoRoot: string, name: string): z.infer<typeof workflowConfig>["jobs"] {
  return workflowConfig.parse(parse(read(repoRoot, `.github/workflows/${name}.yml`))).jobs;
}

test("published-image scans cannot turn registry failure into a successful skip", async ({ repoRoot, fakeBin }) => {
  const image = workflowJobs(repoRoot, "security-scans")["image"];
  expect(image?.if).toBe("github.event_name != 'push'");
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
  expect(jobs["qualification"]?.["timeout-minutes"]).toBe(330);
  expect(jobs["static"]?.["timeout-minutes"]).toBe(jobs["qualification"]?.["timeout-minutes"]);
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
  expect(steps[proof]?.run).toBe("pnpm check --verbose");
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
  for (const name of ["e2e-smoke", "qualification"]) {
    const upload = jobs[name]?.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@") === true);
    expect(upload?.if, name).toBe("always()");
    expect(upload?.with?.["path"], name).toBe("reports/\ntest-results/\n");
  }
});

const QUALIFICATION_CONTEXT = [VERIFY_BASE_ENV, VERIFY_HEAD_ENV, VERIFY_TOOL_MODE_ENV, INSTRUMENT_EXECUTION_COMPONENT_ENV] as const;
const ISOLATED_QUALIFICATION_ENV = {
  [VERIFY_BASE_ENV]: undefined,
  [VERIFY_HEAD_ENV]: undefined,
  [VERIFY_TOOL_MODE_ENV]: undefined,
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
  "else if(endpoint.includes('/runs/1/attempts/'+run.run_attempt+'/jobs?')){const jobs=proof.jobs.map((name,index)=>({id:index+1,run_id:1,run_attempt:name==='static'?run.run_attempt:proof.corpusAttempt??run.run_attempt,head_sha:proof.base,name,status:'completed',conclusion:'success',steps:[{name:proof.generation,status:'completed',conclusion:'success'}]}));response={total_count:jobs.length,jobs};}",
  "else process.exit(74);process.stdout.write(JSON.stringify(response));",
].join("\n");

test("CI's actual diff classifier treats agent hooks and configs as code, not documentation", {
  timeout: scaledBudget(60_000),
}, async ({ repoRoot, scratch, plantedTree, fakeBin }) => {
  const invocation = z.string().parse(workflowJobs(repoRoot, "ci")["changes"]?.steps.find((step) => step.id === "diff")?.run);
  const script = invocation.replace("scripts/ci-qualification.ts", JSON.stringify(join(repoRoot, "scripts/ci-qualification.ts")));
  const workflow = read(repoRoot, ".github/workflows/ci.yml");
  const environment = z.object({ env: z.record(z.string(), z.string()) }).parse(parse(workflow)).env;
  const corpus = workflowJobs(repoRoot, "ci")[SEMANTIC_CORPUS_RESOURCE];
  const corpusName = z.string().parse(corpus?.name);
  const shards = z.array(z.number()).parse(corpus?.strategy?.matrix.shard);
  const proofJobs = [
    "static",
    ...shards.map((shard) => corpusName.replace("${{ matrix.shard }}", String(shard)).replace("${{ strategy.job-total }}", String(shards.length))),
  ];
  const runtime = z.object({ devEngines: z.json(), packageManager: z.string() }).parse(JSON.parse(read(repoRoot, "package.json")));
  const tree = await plantedTree({
    "README.md": "base\n",
    ".gitignore": "api-proof.json\n",
    ".github/workflows/ci.yml": workflow,
    "package.json": JSON.stringify(runtime),
  });
  await fakeBin("gh", QUALIFIED_DIFF_API);
  execFixtureGit(tree, ["init", "--initial-branch=main"]);
  execFixtureGit(tree, ["config", "user.name", "Workflow proof"]);
  execFixtureGit(tree, ["config", "user.email", "proof@example.invalid"]);
  const prepared = await spawnNiced("pnpm", ["install", "--lockfile-only", "--ignore-scripts"], { cwd: tree });
  expect(prepared.code, prepared.stderr).toBe(0);
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
      timeoutMs: scaledBudget(60_000),
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
  for (const [path, expected] of [
    [".claude/hooks/check.mjs", true],
    [".codex/config.toml", true],
    [".agents/hooks/check.py", true],
    ["docs/example.txt", false],
    [".claude/README.md", false],
    [".vscode/settings.json", false],
    [".github/ISSUE_TEMPLATE/bug.yml", false],
  ] as const) {
    await mkdir(join(tree, path, ".."), { recursive: true });
    await writeFile(fixturePath(tree, path), "proof\n");
    const head = commit();
    expect(await run(previous, previous, head), path).toBe(
      `base=${previous}\nhead=${head}\nevent_base=${previous}\ncode=${expected}\ntool_mode=affected\nauthority=qualified\n`,
    );
    previous = head;
  }
  for (const before of [base, "0".repeat(40), "b".repeat(40), ""]) {
    expect(await run(base, before, previous)).toBe(
      `base=${base}\nhead=${previous}\nevent_base=${before}\ncode=true\ntool_mode=affected\nauthority=qualified\n`,
    );
  }
  for (const key of QUALIFICATION_CONTEXT) {
    await withProcessEnv(key, "hosted-context", async () => {
      expect(await run(base, base, previous)).toContain("authority=qualified\n");
    });
  }
  for (const proof of [
    { jobs: proofJobs.slice(0, 1), attempt: 1, corpusAttempt: 1 },
    { jobs: proofJobs.slice(0, 2), attempt: 1, corpusAttempt: 1 },
    { jobs: proofJobs, attempt: 2, corpusAttempt: 1 },
  ]) {
    await writeFile(
      join(tree, "api-proof.json"),
      JSON.stringify({ base, repository: environment["ORB_CI_REPOSITORY"], generation: environment["ORB_CI_QUALIFICATION_GENERATION"], ...proof }),
    );
    await writeFile(output, "");
    const refused = await classify(base, previous);
    expect(refused.code, refused.transcript).toBe(2);
    expect(refused.transcript).toContain("admitted publication is not an ancestor");
    expect(readFileSync(output, "utf8")).toBe("");
  }
  const malformed = await classify("HEAD^", previous);
  expect(malformed.code).toBe(3);
  expect(malformed.transcript).toContain("CI event base must be empty or a commit ID");
});

test("stable publication rejects a wrong source stamp or OCI revision before scanning and publishing", async ({ repoRoot, fakeBin }) => {
  const image = workflowJobs(repoRoot, "release")["image"];
  const script = z.string().parse(image?.steps.find((step) => step.name === "Prove the image is this stable release")?.run);
  await fakeBin(
    "docker",
    `
    const args = process.argv.slice(2);
    if (args[0] === "run") console.log(JSON.stringify({ version: "0.1.3", channel: "stable", commit: process.env.STAMP_SHA }));
    else if (args[0] === "image" && args[1] === "inspect") console.log(process.env.LABEL_SHA);
    else process.exit(1);
  `,
  );
  const sha = "a".repeat(40);
  for (const [stamp, label, accepted] of [
    [sha, sha, true],
    ["b".repeat(40), sha, false],
    [sha, "b".repeat(40), false],
  ] as const) {
    const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", script], {
      env: { ["IMAGE"]: "proof-image", ["VERSION"]: "0.1.3", ["SOURCE_SHA"]: sha, ["STAMP_SHA"]: stamp, ["LABEL_SHA"]: label },
    });
    expect(result.code === 0, `${stamp}/${label}: ${result.stderr}`).toBe(accepted);
  }
  expect(image?.env?.["SOURCE_SHA"]).toBe("${{ needs.release-please.outputs.sha }}");
  const steps = image?.steps ?? [];
  const proof = steps.findIndex((step) => step.name === "Prove the image is this stable release");
  for (const boundary of ["Refuse critical fixable vulnerabilities", "Export the verified build cache", "Push both tags"]) {
    expect(
      steps.findIndex((step) => step.name === boundary),
      boundary,
    ).toBeGreaterThan(proof);
  }
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
  const installIndex = steps.findIndex((step) => step.run === "pnpm install --frozen-lockfile");
  expect(installIndex).toBeGreaterThan(steps.findIndex((step) => step.id === "pnpm-cache"));
  for (const [index, restore] of restores.entries()) {
    const save = saves[index];
    expect(save?.with?.["path"]).toBe(restore.with?.["path"]);
    expect(save?.with?.["key"]).toBe(`\${{ steps.${restore.id}.outputs.cache-primary-key }}`);
    const browserOnly = restore.id === "browser-cache" ? "inputs.browsers == 'true' && " : "";
    expect(save?.if).toBe(`${browserOnly}steps.pnpm.outputs.save == 'true' && steps.${restore.id}.outputs.cache-hit != 'true'`);
    expect(steps.findIndex((step) => step === save)).toBeGreaterThan(installIndex);
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

test("version-keyed patches cannot be invalidated by automatic dependency updates", ({ repoRoot }) => {
  const workspace = z.object({ patchedDependencies: z.record(z.string(), z.string()) }).parse(parse(read(repoRoot, "pnpm-workspace.yaml")));
  const dependabot = z
    .object({
      updates: z.array(
        z.object({
          "package-ecosystem": z.string(),
          ignore: z.array(z.object({ "dependency-name": z.string(), "update-types": z.array(z.string()).optional() })).optional(),
        }),
      ),
    })
    .parse(parse(read(repoRoot, ".github/dependabot.yml")));
  const ignored = dependabot.updates.find((entry) => entry["package-ecosystem"] === "npm")?.ignore ?? [];
  const names = [
    ...Object.keys(workspace.patchedDependencies).map((key) => key.slice(0, key.lastIndexOf("@"))),
    "@stryker-mutator/api",
    "@stryker-mutator/vitest-runner",
  ];
  for (const name of names) {
    const held = ignored.find(
      (entry) => entry["dependency-name"] === name || (entry["dependency-name"].endsWith("/*") && name.startsWith(entry["dependency-name"].slice(0, -1))),
    );
    expect(held, name).toBeDefined();
    expect(held?.["update-types"], name).toBeUndefined();
  }
});

test("release-please JSON version bumps remain formatted without relaxing whitespace checks", async ({ repoRoot, plantedTree }) => {
  const paths = pluginAuthoringConfig(repoRoot)["extra-files"].map((file) => `packages/${file.path}`);
  const config = z.object({ overrides: z.array(z.record(z.string(), z.json())) }).parse(JSON.parse(read(repoRoot, "biome.json")));
  const override = config.overrides.find((entry) => JSON.stringify(entry["includes"]) === JSON.stringify(paths));
  expect(override).toEqual({ includes: paths, json: { formatter: { expand: "always" } } });
  const generated = paths.map((path) => {
    const data = z.record(z.string(), z.json()).parse(JSON.parse(read(repoRoot, path)));
    data["version"] = "9.8.7";
    // GenericJson serializes the entire document with the detected two-space indent.
    return [path, `${JSON.stringify(data, null, 2)}\n`] as const;
  });
  const tree = await plantedTree(Object.fromEntries([...generated, ["biome.json", read(repoRoot, "biome.json")]]));
  const args = ["format", ...paths, "--diagnostic-level=error", "--vcs-enabled=false"];
  const biome = join(repoRoot, "node_modules/.bin/biome");
  const clean = await spawnNiced(biome, args, { cwd: tree });
  expect(clean.code, clean.stderr).toBe(0);
  expect(clean.stdout).toContain(`Checked ${paths.length} files`);
  for (const [path, content] of generated) {
    expect(read(tree, path)).toBe(content);
    expect(z.object({ version: z.string() }).parse(JSON.parse(content)).version).toBe("9.8.7");
  }
  for (const path of paths) {
    await writeFile(fixturePath(tree, path), read(tree, path).replace('  "version":', '    "version":'));
  }
  const malformed = await spawnNiced(biome, args, { cwd: tree });
  expect(malformed.code, malformed.stderr).toBe(1);
  expect(malformed.stderr).toContain("format");
});

function pluginAuthoringConfig(repoRoot: string): z.infer<typeof pluginAuthoring> {
  const config = z.object({ packages: z.record(z.string(), z.unknown()) }).parse(JSON.parse(read(repoRoot, "release-please-config.json")));
  return pluginAuthoring.parse(config.packages["packages"]);
}

test("the plugin authoring release counts commits from the SDK and toolchain and from no other package", ({ repoRoot }) => {
  const config = pluginAuthoringConfig(repoRoot);
  // A new package that is not excluded would cut an SDK release for every change to it.
  const others = readdirSync(join(repoRoot, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !AUTHORING_PACKAGES.includes(entry.name))
    .map((entry) => `packages/${entry.name}`)
    .sort();
  expect([...config["exclude-paths"]].sort()).toEqual(others);
  expect(config["extra-files"].map((file) => file.path).sort()).toEqual(AUTHORING_PACKAGES.map((name) => `${name}/package.json`));
});

test("the plugin authoring tag, manifest, version file and both package versions agree", ({ repoRoot }) => {
  const config = pluginAuthoringConfig(repoRoot);
  const manifest = z.object({ packages: z.string() }).parse(JSON.parse(read(repoRoot, ".release-please-manifest.json")));
  const version = manifest.packages;
  expect(read(repoRoot, join("packages", config["version-file"])).trim()).toBe(version);
  for (const name of AUTHORING_PACKAGES) {
    expect(z.object({ version: z.string() }).parse(JSON.parse(read(repoRoot, `packages/${name}/package.json`))).version).toBe(version);
  }
  // The template repositories and the README link this tag spelling.
  expect(`${config.component}-${config["include-v-in-tag"] === false ? "" : "v"}${version}`).toBe(`plugin-authoring-v${version}`);
});

test("plugin authoring releases stay out of latest and publish only after their tarballs are attached", ({ repoRoot }) => {
  const config = pluginAuthoringConfig(repoRoot);
  // The app's stable update check reads releases/latest, which skips pre-releases.
  expect(config.prerelease).toBe(true);
  // Immutable releases refuse new assets once published, so the release starts as a draft with its tag.
  expect(config.draft).toBe(true);
  expect(config["force-tag-creation"]).toBe(true);
  const workflow = z
    .object({ jobs: z.object({ "plugin-authoring": z.object({ if: z.string(), steps: z.array(z.object({ run: z.string().optional() })) }) }) })
    .parse(parse(read(repoRoot, ".github/workflows/release.yml")));
  const job = workflow.jobs["plugin-authoring"];
  expect(job.if).toContain("plugin_authoring_created == 'true'");
  const script = job.steps.map((step) => step.run ?? "").join("\n");
  expect(script).toContain("pnpm plugin:author-release");
  expect(script.indexOf("gh release upload")).toBeGreaterThan(-1);
  expect(script.indexOf("gh release edit")).toBeGreaterThan(script.indexOf("gh release upload"));
  expect(script).toContain("--draft=false --prerelease");
});

function developmentStep(repoRoot: string, name: string): string {
  const workflow = z
    .object({ jobs: z.object({ image: z.object({ steps: z.array(z.object({ name: z.string().optional(), run: z.string().optional() })) }) }) })
    .parse(parse(read(repoRoot, ".github/workflows/development-image.yml")));
  const script = workflow.jobs.image.steps.find((step) => step.name === name)?.run;
  if (script === undefined) {
    throw new Error(`Missing workflow step: ${name}`);
  }
  return script;
}

function publicationEnv(scratch: string): NonNullable<SpawnNicedOptions["env"]> {
  return Object.fromEntries([
    ["RUNNER_TEMP", scratch],
    ["IMAGE", "proof-image"],
    ["SOURCE_SHA", "a".repeat(40)],
    ["GITHUB_STEP_SUMMARY", join(scratch, "summary.md")],
  ]);
}

test("the boot proof works when host health omits operator identity", async ({ repoRoot, scratch, fakeBin }) => {
  const sha = "a".repeat(40);
  await fakeBin("curl", 'console.log(JSON.stringify({ status: "ok", harness: false }));');
  await fakeBin(
    "docker",
    `
    const args = process.argv.slice(2);
    if (args[0] === "run") console.log("proof-container");
    else if (args[0] === "inspect") console.log("true");
    else if (args[0] === "exec" && args[2] === "node" && args[4].includes("http://127.0.0.1:8788/healthz"))
      console.log(JSON.stringify({ status: "ok", version: { commit: ${JSON.stringify(sha)}, channel: "main" } }));
    else if (!["logs", "rm"].includes(args[0])) process.exit(1);
  `,
  );
  const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", developmentStep(repoRoot, "Prove fresh runtime boot")], {
    env: publicationEnv(scratch),
  });
  expect(result.code, result.stderr).toBe(0);
});

test("the anonymous proof requires independently downloaded bytes, not builder cache", async ({ repoRoot, scratch, fakeBin }) => {
  const summary = join(scratch, "summary.md");
  const fixture = join(scratch, "download");
  await mkdir(fixture);
  const generated = await spawnNiced("python3", [
    "-c",
    `
import hashlib, io, json, pathlib, tarfile, sys
root = pathlib.Path(sys.argv[1]); blobs = root / "blobs" / "sha256"; blobs.mkdir(parents=True)
def blob(data):
 value = hashlib.sha256(data).hexdigest(); (blobs / value).write_bytes(data)
 return {"digest": "sha256:" + value, "size": len(data)}
sha = "a" * 40
payload = json.dumps({"commit": sha, "channel": "main"}).encode()
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode="w") as archive:
 member = tarfile.TarInfo("app/version.json"); member.size = len(payload); archive.addfile(member, io.BytesIO(payload))
layer = blob(buffer.getvalue())
config = blob(json.dumps({"config": {"Labels": {"org.opencontainers.image.revision": sha}}}).encode())
manifest = blob(json.dumps({"config": config, "layers": [layer]}).encode())
(root / "index.json").write_text(json.dumps({"manifests": [manifest]}))
print(manifest["digest"])
`,
    fixture,
  ]);
  expect(generated.code, generated.stderr).toBe(0);
  const digest = generated.stdout.trim();
  await fakeBin(
    "docker",
    `
    import { cpSync, readFileSync, writeFileSync } from "node:fs";
    import { join } from "node:path";
    const args = process.argv.slice(2);
    if (args[0] === "inspect") console.log("proof-image@" + ${JSON.stringify(digest)});
    else if (args[0] === "pull") console.log("cached image already present");
    else if (args[0] === "run" && args.includes("--entrypoint"))
      console.log(JSON.stringify({ commit: process.env.SOURCE_SHA, channel: "main" }));
    else if (args[0] === "run" && args.includes("copy")) {
      if (!args.includes("--src-no-creds") || !args.includes("--preserve-digests") || args.some((arg) => arg.includes("docker.sock"))) process.exit(1);
      const mount = args[args.indexOf("-v") + 1].split(":")[0];
      cpSync(${JSON.stringify(fixture)}, join(mount, "image"), { recursive: true });
      if (process.env.PUBLISH_PROOF_CORRUPT === "yes") {
        const root = join(mount, "image");
        const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8"));
        const path = (digest) => join(root, "blobs", "sha256", digest.split(":")[1]);
        const manifest = JSON.parse(readFileSync(path(index.manifests[0].digest), "utf8"));
        writeFileSync(path(manifest.layers[0].digest), "corrupt anonymous layer");
      }
    } else process.exit(1);
  `,
  );
  await writeFile(summary, "");
  const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", developmentStep(repoRoot, "Prove anonymous digest pull")], {
    env: publicationEnv(scratch),
  });
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toContain('"downloadedLayers": 1');
  await writeFile(summary, "");
  const corrupt = await spawnNiced("bash", ["-euo", "pipefail", "-c", developmentStep(repoRoot, "Prove anonymous digest pull")], {
    env: { ...publicationEnv(scratch), ...Object.fromEntries([["PUBLISH_PROOF_CORRUPT", "yes"]]) },
  });
  expect(corrupt.code).not.toBe(0);
  expect(readFileSync(summary, "utf8")).toBe("");
});
