import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONCURRENCY_PROFILE_PATH, readConcurrencyProfile, stageBudgetsFor } from "@orb/tooling/_shared/concurrency-profile";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import YAML from "yaml";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

interface WorkflowStep {
  readonly id?: string;
  readonly run?: string;
  readonly if?: string;
  readonly uses?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly "timeout-minutes"?: number;
  readonly with?: { readonly path?: string; readonly key?: string; readonly "artifact-ids"?: string; readonly "digest-mismatch"?: string };
}
interface QualificationJob {
  readonly "timeout-minutes": number;
  readonly env: Readonly<Record<string, string>>;
  readonly steps: readonly WorkflowStep[];
}
interface Workflow {
  readonly env: Readonly<Record<string, string>>;
  readonly jobs: {
    readonly qualification: QualificationJob;
    readonly node: {
      readonly needs: readonly string[];
      readonly "runs-on": string;
      readonly strategy: { readonly matrix: { readonly shard: readonly number[] } };
      readonly steps: readonly WorkflowStep[];
    };
    readonly media: {
      readonly if: string;
      readonly "runs-on": string;
      readonly outputs: Readonly<Record<string, string>>;
      readonly steps: readonly WorkflowStep[];
    };
    readonly changes: {
      readonly permissions: Readonly<Record<string, string>>;
      readonly steps: readonly (WorkflowStep & { readonly env?: Readonly<Record<string, string>> })[];
    };
    readonly static: {
      readonly "timeout-minutes": number;
      readonly env: Readonly<Record<string, string>>;
      readonly steps: readonly (WorkflowStep & { readonly name?: string })[];
    };
    readonly "ci-ok": { readonly if: string; readonly needs: readonly string[]; readonly steps: readonly WorkflowStep[] };
  };
}

function workflow(repoRoot: string): Workflow {
  return YAML.parse(readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8")) as Workflow;
}

function step(job: QualificationJob, id: string): WorkflowStep {
  const found = job.steps.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`missing qualification step ${id}`);
  }
  return found;
}

const MEDIA_TOOLS = ["ffmpeg", "ffprobe"] as const;
const MEDIA_TOOL_FIXTURE = "import fs from 'node:fs';process.exitCode=fs.existsSync('media-ready')?0:1;";
const APT_FIXTURE = [
  "import fs from 'node:fs';const args=process.argv.slice(2);fs.appendFileSync('apt.jsonl',JSON.stringify(args)+'\\n');",
  "if(args.includes(process.env.FIXTURE_APT_FAILURE))process.exit(71);",
  "if(args.includes('install')&&args.includes('ffmpeg')&&process.env.FIXTURE_MEDIA_BROKEN!=='1')fs.writeFileSync('media-ready','yes');",
].join("\n");

test("standalone exhaustive qualification has bounded noninteractive media setup that skips healthy tools and exposes setup failures", {
  timeout: scaledBudget(20_000),
}, async ({ repoRoot, scratch, fakeBin }) => {
  const ci = workflow(repoRoot);
  const media = step(ci.jobs.qualification, "media");
  expect(media["timeout-minutes"]).toBe(15);
  await fakeBin("sudo", APT_FIXTURE);
  for (const tool of MEDIA_TOOLS) {
    await fakeBin(tool, MEDIA_TOOL_FIXTURE);
  }
  for (const [scenario, expectedExit, expectedCalls] of [
    ["healthy", 0, 0],
    ["missing", 0, 2],
    ["update", 71, 1],
    ["install", 71, 2],
    ["broken", 1, 2],
  ] as const) {
    rmSync(join(scratch, "media-ready"), { force: true });
    writeFileSync(join(scratch, "apt.jsonl"), "");
    if (scenario === "healthy") {
      writeFileSync(join(scratch, "media-ready"), "yes");
    }
    const result = spawnSync("bash", ["-e", "-c", media.run ?? ""], {
      cwd: scratch,
      env: inheritedProcessEnv({ ["FIXTURE_APT_FAILURE"]: scenario, ["FIXTURE_MEDIA_BROKEN"]: scenario === "broken" ? "1" : "0" }),
      encoding: "utf8",
      timeout: scaledBudget(10_000),
    });
    expect(result.status, `${scenario}: ${result.stdout}${result.stderr}`).toBe(expectedExit);
    const calls = readFileSync(join(scratch, "apt.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((row) => JSON.parse(row) as readonly string[]);
    expect(calls).toHaveLength(expectedCalls);
    for (const args of calls) {
      expect(args).toEqual(expect.arrayContaining(["-n", "Acquire::Retries=3", "Acquire::http::Timeout=30", "Acquire::https::Timeout=30"]));
    }
  }
});

test("one same-run media producer feeds all node shards and its failure cannot become a green skipped-node aggregate", ({ repoRoot, scratch }) => {
  const ci = workflow(repoRoot);
  expect(ci.jobs.node.strategy.matrix.shard).toEqual([1, 2, 3]);
  expect(ci.jobs.node.needs).toEqual(["changes", "media"]);
  expect(ci.jobs.media.if).toBe("needs.changes.outputs.code == 'true'");
  expect(ci.jobs.media["runs-on"]).toBe("ubuntu-24.04");
  expect(ci.jobs.node["runs-on"]).toBe(ci.jobs.media["runs-on"]);
  const download = ci.jobs.node.steps.find((candidate) => candidate.id === "media-download");
  const reference = ci.jobs.node.steps.find((candidate) => candidate.id === "media-reference");
  expect(ci.jobs.node.steps.findIndex((candidate) => candidate.id === "media-reference")).toBeLessThan(
    ci.jobs.node.steps.findIndex((candidate) => candidate.id === "media-download"),
  );
  expect(reference?.env?.["MEDIA_PRODUCER_ATTEMPT"]).toBe("${{ needs.media.outputs.producer_attempt }}");
  expect(ci.jobs.media.outputs["producer_attempt"]).toBe("${{ steps.prepare.outputs.producer_attempt }}");
  for (const [id, digest, attempt, exit] of [
    ["", "a".repeat(64), "1", 1],
    ["foreign", "a".repeat(64), "1", 1],
    ["0", "a".repeat(64), "1", 1],
    ["123", "", "1", 1],
    ["123", "a".repeat(64), "", 1],
    ["123", "a".repeat(64), "0", 1],
    ["123", "a".repeat(64), "1", 0],
  ] as const) {
    const result = spawnSync("bash", ["-e", "-c", reference?.run ?? ""], {
      env: inheritedProcessEnv({ ["MEDIA_ARTIFACT_ID"]: id, ["MEDIA_SHA256"]: digest, ["MEDIA_PRODUCER_ATTEMPT"]: attempt }),
      encoding: "utf8",
    });
    expect(result.status, id + digest).toBe(exit);
  }
  expect(download?.uses).toBe("actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333");
  expect(download?.with?.["artifact-ids"]).toBe("${{ needs.media.outputs.artifact_id }}");
  expect(download?.with?.["digest-mismatch"]).toBe("error");
  const gate = ci.jobs["ci-ok"];
  expect(gate.needs).toContain("media");
  for (const result of ["success", "skipped", "failure", "cancelled"]) {
    const needs = Object.fromEntries(gate.needs.map((job) => [job, { result: "success" }]));
    needs["media"] = { result };
    needs["node"] = { result: "skipped" };
    const verdict = spawnSync("bash", ["-e", "-c", gate.steps[0]?.run ?? ""], {
      cwd: scratch,
      env: inheritedProcessEnv({ ["NEEDS"]: JSON.stringify(needs), ["GITHUB_STEP_SUMMARY"]: join(scratch, "summary.md") }),
      encoding: "utf8",
    });
    expect(verdict.status, result).toBe(result === "success" || result === "skipped" ? 0 : 1);
  }
});

test("signed media preparation starts with empty installed state and cannot publish success after update, download or empty-closure failure", {
  timeout: scaledBudget(20_000),
}, async ({ repoRoot, scratch, fakeBin }) => {
  const prepare = workflow(repoRoot).jobs.media.steps.find((candidate) => candidate.id === "prepare");
  expect(prepare?.["timeout-minutes"]).toBe(15);
  await fakeBin("dpkg", "process.stdout.write('amd64');");
  await fakeBin(
    "sudo",
    [
      "import fs from 'node:fs';const args=process.argv.slice(2);fs.appendFileSync('apt.jsonl',JSON.stringify(args)+'\\n');",
      "if(args.includes(process.env.FIXTURE_APT_FAILURE))process.exit(71);",
      "if(args.includes('install')&&process.env.FIXTURE_APT_FAILURE==='ready')fs.writeFileSync(process.env.RUNNER_TEMP+'/media-apt/archives/ffmpeg.deb','fixture package');",
    ].join("\n"),
  );
  for (const [scenario, status, count] of [
    ["update", 71, 1],
    ["install", 71, 2],
    ["empty", 1, 2],
    ["ready", 0, 2],
  ] as const) {
    rmSync(join(scratch, "media-apt"), { recursive: true, force: true });
    rmSync(join(scratch, "output"), { force: true });
    writeFileSync(join(scratch, "apt.jsonl"), "");
    const result = spawnSync("bash", ["-e", "-c", (prepare?.run ?? "").replace(". /etc/os-release", "ID=ubuntu;VERSION_ID=24.04")], {
      cwd: scratch,
      env: inheritedProcessEnv({
        ["RUNNER_TEMP"]: scratch,
        ["GITHUB_OUTPUT"]: join(scratch, "output"),
        ["GITHUB_RUN_ID"]: "123",
        ["GITHUB_RUN_ATTEMPT"]: "1",
        ["GITHUB_SHA"]: "tested",
        ["FIXTURE_APT_FAILURE"]: scenario,
      }),
      encoding: "utf8",
      timeout: scaledBudget(10_000),
    });
    expect(result.status, scenario + result.stdout + result.stderr).toBe(status);
    expect(existsSync(join(scratch, "output"))).toBe(scenario === "ready");
    expect(readFileSync(join(scratch, "media-apt/status"), "utf8")).toBe("");
    const calls = readFileSync(join(scratch, "apt.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((row) => JSON.parse(row) as readonly string[]);
    expect(calls).toHaveLength(count);
    for (const args of calls) {
      expect(args).toEqual(
        expect.arrayContaining([
          "-n",
          "Acquire::Retries=3",
          "Acquire::http::Timeout=30",
          "Acquire::https::Timeout=30",
          "Acquire::AllowInsecureRepositories=false",
          "APT::Get::AllowUnauthenticated=false",
          `Dir::State::status=${scratch}/media-apt/status`,
        ]),
      );
    }
  }
  expect(readFileSync(join(scratch, "output"), "utf8")).toContain("producer_attempt=1\n");
  const payload = spawnSync("tar", ["-tf", "payload.tar"], { cwd: join(scratch, "media-apt"), encoding: "utf8" });
  expect(payload.status, payload.stderr).toBe(0);
  expect(payload.stdout.split("\n")).toEqual(expect.arrayContaining(["identity", "sources.list", "lists/", "archives/ffmpeg.deb"]));
});

test("media consumers reject absent, changed, foreign-run and incompatible payloads before offline installation and surface install failures", {
  timeout: scaledBudget(30_000),
}, async ({ repoRoot, scratch, fakeBin }) => {
  const run = workflow(repoRoot).jobs.node.steps.find((candidate) => candidate.id === "media")?.run ?? "";
  const directory = join(scratch, "media-apt");
  mkdirSync(join(directory, "archives"), { recursive: true });
  mkdirSync(join(directory, "lists"), { recursive: true });
  writeFileSync(join(directory, "sources.list"), "fixture signed Ubuntu source\n");
  await fakeBin("dpkg", "process.stdout.write('amd64');");
  await fakeBin("sudo", "import fs from 'node:fs';fs.appendFileSync('install.jsonl',JSON.stringify(process.argv.slice(2))+'\\n');process.exitCode=71;");
  // The OS identity is fixture input; the installation command and checks remain the workflow's native script.
  const fixtureRun = run.replace(". /etc/os-release", "ID=ubuntu;VERSION_ID=24.04");
  for (const [scenario, status, producerAttempt] of [
    ["missing", 1, "1"],
    ["changed", 1, "1"],
    ["broken", 2, "1"],
    ["run", 1, "1"],
    ["attempt", 1, "1"],
    ["producer-attempt", 1, "2"],
    ["sha", 1, "1"],
    ["os", 1, "1"],
    ["empty", 1, "1"],
    ["rerun", 71, "1"],
  ] as const) {
    rmSync(join(directory, "payload.tar"), { force: true });
    rmSync(join(directory, "archives/ffmpeg.deb"), { force: true });
    writeFileSync(join(scratch, "install.jsonl"), "");
    const identity = ["ubuntu:24.04:amd64", "123", "1", "tested"];
    const mismatch = ["os", "run", "attempt", "sha"].indexOf(scenario);
    if (mismatch >= 0) {
      identity[mismatch] = "foreign";
    }
    writeFileSync(join(directory, "identity"), `${identity.join("\n")}\n`);
    if (scenario !== "empty") {
      writeFileSync(join(directory, "archives/ffmpeg.deb"), "fixture package");
    }
    const archive = spawnSync("tar", ["-cf", "payload.tar", "identity", "sources.list", "lists", "archives"], { cwd: directory, encoding: "utf8" });
    expect(archive.status, archive.stderr).toBe(0);
    const digest = createHash("sha256")
      .update(scenario === "broken" ? "altered" : readFileSync(join(directory, "payload.tar")))
      .digest("hex");
    if (scenario === "missing") {
      rmSync(join(directory, "payload.tar"));
    }
    if (scenario === "changed" || scenario === "broken") {
      writeFileSync(join(directory, "payload.tar"), "altered");
    }
    const result = spawnSync("bash", ["-e", "-c", fixtureRun], {
      cwd: scratch,
      env: inheritedProcessEnv({
        ["RUNNER_TEMP"]: scratch,
        ["MEDIA_SHA256"]: digest,
        ["GITHUB_RUN_ID"]: "123",
        ["GITHUB_RUN_ATTEMPT"]: "2",
        ["MEDIA_PRODUCER_ATTEMPT"]: producerAttempt,
        ["GITHUB_SHA"]: "tested",
      }),
      encoding: "utf8",
      timeout: scaledBudget(10_000),
    });
    expect(result.status, scenario + result.stdout + result.stderr).toBe(status);
    const calls = readFileSync(join(scratch, "install.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((call) => JSON.parse(call) as readonly string[]);
    expect(calls).toEqual(
      scenario === "rerun"
        ? [
            expect.arrayContaining([
              "--no-download",
              "--no-remove",
              `Dir::Etc::sourcelist=${directory}/sources.list`,
              "Dir::Etc::sourceparts=-",
              `Dir::State::lists=${directory}/lists`,
              "install",
              "ffmpeg",
            ]),
          ]
        : [],
    );
    expect(calls.map((args) => args.slice(args.indexOf("install")))).toEqual(calls.map(() => ["install", "ffmpeg"]));
  }
});

test("required CI includes smoke and refuses its failures or cancellation while allowing docs-only skips", ({ repoRoot, scratch }) => {
  const gate = workflow(repoRoot).jobs["ci-ok"];
  expect(gate.needs).toContain("e2e-smoke");
  expect(gate.if).toContain("always()");
  const run = gate.steps[0]?.run;
  if (run === undefined) {
    throw new Error("missing required CI verdict command");
  }
  for (const result of ["success", "skipped", "failure", "cancelled"]) {
    const needs = Object.fromEntries(gate.needs.map((job) => [job, { result: job === "e2e-smoke" ? result : "success" }]));
    const verdict = spawnSync("bash", ["-e", "-c", run], {
      cwd: scratch,
      env: inheritedProcessEnv({ ["NEEDS"]: JSON.stringify(needs), ["GITHUB_STEP_SUMMARY"]: join(scratch, "summary.md") }),
      encoding: "utf8",
    });
    expect(verdict.status, `${result}: ${verdict.stdout}${verdict.stderr}`).toBe(result === "success" || result === "skipped" ? 0 : 1);
    expect(readFileSync(join(scratch, "summary.md"), "utf8")).toContain(`| e2e-smoke | ${result} |`);
  }
});

test("nightly full uses a distinct exact-SHA cache, and red/no-verdict native verification cannot create its success marker", async ({
  repoRoot,
  scratch,
  fakeBin,
}) => {
  const job = workflow(repoRoot).jobs.qualification;
  expect(job.env["VERIFY_TIER"]).toBe("${{ github.event_name == 'schedule' && 'full' || inputs.tier }}");
  const seen = step(job, "seen");
  const verify = step(job, "verify");
  const mark = step(job, "mark");
  const save = job.steps.find((candidate) => candidate.uses?.startsWith("actions/cache/save@") === true);
  expect(mark.if).toBe("success() && steps.verify.outcome == 'success'");
  expect(save?.if).toBe("success() && steps.mark.outcome == 'success'");
  const sha = "a".repeat(40);
  const keyFor = (tier: string): string => (seen.with?.key ?? "").replaceAll("${{ env.VERIFY_TIER }}", tier).replaceAll("${{ steps.sha.outputs.sha }}", sha);
  const cached = new Set([keyFor("product")]);
  expect(cached.has(keyFor("full")), "an old product success must not skip exhaustive proof").toBe(false);
  cached.add(keyFor("full"));
  expect(cached.has(keyFor("full"))).toBe(true);
  expect(keyFor("full")).not.toBe(keyFor("full").replace(sha, "b".repeat(40)));
  expect(save?.with).toEqual(seen.with === undefined ? undefined : { path: seen.with.path, key: seen.with.key });
  await fakeBin(
    "pnpm",
    "import fs from 'node:fs';fs.writeFileSync('called.json',JSON.stringify(process.argv.slice(2)));process.exitCode=Number(process.env.FIXTURE_VERIFY_EXIT);",
  );
  writeFileSync(join(scratch, ".product-verified"), sha);
  for (const code of [1, 2, 3, 0]) {
    const result = spawnSync("bash", ["-e", "-c", `${verify.run ?? ""}\n${mark.run ?? ""}`], {
      cwd: scratch,
      env: inheritedProcessEnv({ ["VERIFY_TIER"]: "full", ["VERIFIED_SHA"]: sha, ["FIXTURE_VERIFY_EXIT"]: String(code) }),
      encoding: "utf8",
    });
    expect(result.status, result.stdout + result.stderr).toBe(code);
    expect(JSON.parse(readFileSync(join(scratch, "called.json"), "utf8"))).toEqual(["verify", "--full"]);
    expect(existsSync(join(scratch, ".full-verified"))).toBe(code === 0);
  }
  expect(readFileSync(join(scratch, ".full-verified"), "utf8").trim()).toBe(sha);
});

test("CI event qualification passes the actual target/before and tested SHA, not a remote-main or single-parent shortcut", ({ repoRoot }) => {
  const ci = workflow(repoRoot);
  const environment = ci.jobs.static.env;
  expect(environment["ORB_VERIFY_BASE"]).toBe("${{ needs.changes.outputs.base }}");
  expect(environment["ORB_VERIFY_HEAD"]).toBe("${{ needs.changes.outputs.head }}");
  expect(environment["ORB_VERIFY_TOOL_MODE"]).toBe("${{ needs.changes.outputs.tool_mode }}");
  const producer = ci.jobs.changes.steps.find((candidate) => candidate.id === "diff");
  expect(producer?.run).toBe('pnpm exec node scripts/ci-qualification.ts baseline "$GITHUB_SHA" "$BEFORE"');
  expect(producer?.env?.["BEFORE"]).toBe(
    "${{ github.event_name == 'pull_request' && github.event.pull_request.base.sha || github.event_name == 'push' && github.event.before || inputs.base }}",
  );
  expect(ci.jobs.changes.permissions).toEqual({ contents: "read", actions: "read" });
  expect(ci.jobs.static.steps.find((candidate) => candidate.run === "pnpm check --verbose")?.name).toBe("${{ env.ORB_CI_QUALIFICATION_GENERATION }}");
  expect(ci.env["ORB_CI_QUALIFICATION_GENERATION"]).toBe("Orbweaver qualification ancestor-v1");
  expect(ci.env["ORB_CI_PUBLICATION_BOOTSTRAP_SHA"]).toBe("ac6cfc19ea9db59644426b37f6b8c842c33473ad");
  expect(ci.env["ORB_CI_REPOSITORY"]).toBe("Inktomi93/OrbWeaver");
});

test("qualification enters through the pinned runtime in CI and release promotion and loads its native module graph", {
  timeout: scaledBudget(20_000),
}, ({ repoRoot }) => {
  const producer = workflow(repoRoot).jobs.changes.steps.find((candidate) => candidate.id === "diff");
  const command = producer?.run;
  expect(command).toBe('pnpm exec node scripts/ci-qualification.ts baseline "$GITHUB_SHA" "$BEFORE"');
  expect(readFileSync(join(repoRoot, "scripts/github-sync.sh"), "utf8")).toContain('pnpm exec node scripts/ci-qualification.ts release "$sha"');
  if (command === undefined) {
    throw new Error("missing CI qualification invocation");
  }
  const result = spawnSync("bash", ["-e", "-c", command], {
    cwd: repoRoot,
    env: inheritedProcessEnv({ ["GITHUB_SHA"]: "invalid-head", ["BEFORE"]: "" }),
    encoding: "utf8",
    timeout: scaledBudget(15_000),
  });
  expect(result.status, result.stdout + result.stderr).toBe(3);
  expect(result.stderr).toContain("CI qualification head differs from the tested HEAD");
  expect(result.stderr).not.toContain("SyntaxError");
});

test("uncached nightly and manual qualification provision media and showcase artifacts before full or product verification", async ({
  repoRoot,
  scratch,
  fakeBin,
}) => {
  const job = workflow(repoRoot).jobs.qualification;
  const media = step(job, "media");
  const showcase = step(job, "showcase");
  const verify = step(job, "verify");
  expect(media.if).toBe(verify.if);
  expect(showcase.if).toBe(verify.if);
  expect(job.steps.indexOf(media)).toBeLessThan(job.steps.indexOf(verify));
  expect(job.steps.indexOf(showcase)).toBeLessThan(job.steps.indexOf(verify));
  await fakeBin("sudo", APT_FIXTURE);
  for (const tool of MEDIA_TOOLS) {
    await fakeBin(tool, MEDIA_TOOL_FIXTURE);
  }
  await fakeBin(
    "pnpm",
    [
      "import fs from 'node:fs';const args=process.argv.slice(2);fs.appendFileSync('pnpm.jsonl',JSON.stringify(args)+'\\n');",
      "const artifact='packages/showcase-plugins/dist/bundles/pocket-arcade.zip';",
      "if(args[0]==='--filter'&&args[1]==='@orb/showcase-plugins'&&args[2]==='build'){fs.mkdirSync('packages/showcase-plugins/dist/bundles',{recursive:true});fs.writeFileSync(artifact,'fixture bundle');}",
      "else {if(!fs.existsSync('media-ready'))throw new Error('media prerequisite absent');if(fs.readFileSync(artifact).length===0)throw new Error('showcase prerequisite absent');fs.writeFileSync('called.json',JSON.stringify(args));}",
    ].join("\n"),
  );
  for (const tier of ["full", "product"]) {
    rmSync(join(scratch, "media-ready"), { force: true });
    const result = spawnSync("bash", ["-e", "-c", `${media.run ?? ""}\n${showcase.run ?? ""}\n${verify.run ?? ""}`], {
      cwd: scratch,
      env: inheritedProcessEnv({ ["VERIFY_TIER"]: tier }),
      encoding: "utf8",
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(scratch, "called.json"), "utf8"))).toEqual(["verify", `--${tier}`]);
  }
  expect(
    readFileSync(join(scratch, "apt.jsonl"), "utf8")
      .trim()
      .split(/\r?\n/u)
      .map((row) => JSON.parse(row)),
  ).toEqual([
    ["-n", "apt-get", "-o", "Acquire::Retries=3", "-o", "Acquire::http::Timeout=30", "-o", "Acquire::https::Timeout=30", "update", "--error-on=any"],
    [
      "-n",
      "DEBIAN_FRONTEND=noninteractive",
      "apt-get",
      "-o",
      "Acquire::Retries=3",
      "-o",
      "Acquire::http::Timeout=30",
      "-o",
      "Acquire::https::Timeout=30",
      "install",
      "-y",
      "--no-install-recommends",
      "ffmpeg",
    ],
    ["-n", "apt-get", "-o", "Acquire::Retries=3", "-o", "Acquire::http::Timeout=30", "-o", "Acquire::https::Timeout=30", "update", "--error-on=any"],
    [
      "-n",
      "DEBIAN_FRONTEND=noninteractive",
      "apt-get",
      "-o",
      "Acquire::Retries=3",
      "-o",
      "Acquire::http::Timeout=30",
      "-o",
      "Acquire::https::Timeout=30",
      "install",
      "-y",
      "--no-install-recommends",
      "ffmpeg",
    ],
  ]);
  expect(
    readFileSync(join(scratch, "pnpm.jsonl"), "utf8")
      .trim()
      .split(/\r?\n/u)
      .map((row) => JSON.parse(row)),
  ).toEqual([
    ["--filter", "@orb/showcase-plugins", "build"],
    ["verify", "--full"],
    ["--filter", "@orb/showcase-plugins", "build"],
    ["verify", "--product"],
  ]);
});

test("static qualification admits full tooling within the shared bounded hosted allowance", ({ repoRoot }) => {
  const ci = workflow(repoRoot);
  const stageBudgets = stageBudgetsFor({ ...readConcurrencyProfile(), vitestMaxWorkers: 1 }, readFileSync(CONCURRENCY_PROFILE_PATH, "utf8"));
  expect(ci.jobs.static["timeout-minutes"]).toBe(ci.jobs.qualification["timeout-minutes"]);
  expect(ci.jobs.static["timeout-minutes"] * 60_000).toBeGreaterThanOrEqual(stageBudgets.toolingSuiteMs + stageBudgets.defaultMs);
  expect(ci.jobs["ci-ok"].needs).toContain("static");
});

test("the generation-marked static command forwards live output mode and preserves failure exits", async ({ repoRoot, scratch, fakeBin }) => {
  const generationSteps = workflow(repoRoot).jobs.static.steps.filter((candidate) => candidate.name === "${{ env.ORB_CI_QUALIFICATION_GENERATION }}");
  expect(generationSteps).toHaveLength(1);
  const generation = generationSteps[0];
  expect(generation?.if).toBeUndefined();
  await fakeBin(
    "pnpm",
    "import fs from 'node:fs';fs.writeFileSync('called.json',JSON.stringify(process.argv.slice(2)));process.stdout.write('fixture child progress\\n');process.exitCode=Number(process.env.FIXTURE_VERIFY_EXIT);",
  );
  for (const code of [0, 1, 2]) {
    const result = spawnSync("bash", ["-e", "-c", generation?.run ?? ""], {
      cwd: scratch,
      env: inheritedProcessEnv({ ["FIXTURE_VERIFY_EXIT"]: String(code) }),
      encoding: "utf8",
    });
    expect(result.status, result.stdout + result.stderr).toBe(code);
    expect(JSON.parse(readFileSync(join(scratch, "called.json"), "utf8"))).toEqual(["check", "--verbose"]);
    expect(result.stdout).toContain("fixture child progress");
  }
});
