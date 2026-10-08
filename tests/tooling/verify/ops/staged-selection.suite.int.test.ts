// The commit gate's selection is the index, not the working tree: a staged change is checked with its deletion and
// rename semantics, and a tracked file edited but not staged, or an untracked file, never enters the commit's scope.
// The working-change selection over the same repo is the control that still sees both.
import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit, fixtureGitEnvironment } from "@orb/tooling/_shared/git-fixture";
import YAML from "yaml";
import { z } from "zod";
import { REGISTRY, resolveSelection, stagesForTier } from "../../../../tooling/src/verify/index.ts";
import { parseRequest } from "../../../../tooling/src/verify/lib/run-argv.ts";
import { planStage } from "../../../../tooling/src/verify/lib/stage-plan.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const FILES = {
  staged: "packages/client/src/staged.ts",
  unstaged: "packages/client/src/unstaged.ts",
  untracked: "packages/client/src/untracked.ts",
  deleted: "packages/client/src/deleted.ts",
  renameOld: "packages/client/src/rename-old.ts",
  renameNew: "packages/client/src/rename-new.ts",
} as const;

function plantRepo(repoRoot: string, scratch: string): void {
  writeFileSync(join(scratch, ".gitignore"), "node_modules\n");
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ name: "staged-selection-fixture", private: true }));
  mkdirSync(join(scratch, "scripts"), { recursive: true });
  writeFileSync(join(scratch, "scripts/ts7.ts"), readFileSync(join(repoRoot, "scripts/ts7.ts"), "utf8"));
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  writeFileSync(join(scratch, "tsconfig.base.json"), '{"compilerOptions":{"noEmit":true,"strict":true,"types":[]},"files":[]}\n');
  writeFileSync(join(scratch, "root-anchor.ts"), "export {};\n");
  writeFileSync(join(scratch, "tsconfig.json"), '{"extends":"./tsconfig.base.json","include":["root-anchor.ts"]}\n');
  mkdirSync(join(scratch, "packages/client/src"), { recursive: true });
  writeFileSync(join(scratch, "packages/client/tsconfig.json"), '{"extends":"../../tsconfig.base.json","include":["src"]}\n');
  for (const path of [FILES.staged, FILES.unstaged, FILES.deleted, FILES.renameOld]) {
    writeFileSync(join(scratch, path), `export const baseline = ${JSON.stringify(path)};\n`);
  }
  execFixtureGit(scratch, ["init"]);
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["-c", "user.name=Orb Test", "-c", "user.email=orb@example.invalid", "commit", "-m", "baseline"]);

  writeFileSync(join(scratch, FILES.staged), "export const staged = true;\n");
  rmSync(join(scratch, FILES.deleted));
  renameSync(join(scratch, FILES.renameOld), join(scratch, FILES.renameNew));
  execFixtureGit(scratch, ["add", "-A"]);
  writeFileSync(join(scratch, FILES.unstaged), "export const unstaged = true;\n");
  writeFileSync(join(scratch, FILES.untracked), "export const untracked = true;\n");
}

function biomeArgv(selection: ReturnType<typeof resolveSelection>): unknown {
  const stage = REGISTRY.find((candidate) => candidate.name === "lint:biome");
  if (stage?.scopedArgv === undefined) {
    throw new Error("lint:biome has no scoped argv");
  }
  return stage.scopedArgv(selection);
}

test("the staged selection is exactly what the commit records, deletions and the rename's old side included", ({ repoRoot, scratch }) => {
  plantRepo(repoRoot, scratch);
  const staged = resolveSelection({ kind: "staged" }, scratch);
  expect(staged.paths.toSorted()).toEqual([FILES.deleted, FILES.renameNew, FILES.renameOld, FILES.staged].toSorted());
  expect(staged.existingPaths.toSorted()).toEqual([FILES.renameNew, FILES.staged].toSorted());
  expect(biomeArgv(staged)).not.toEqual(expect.arrayContaining([FILES.unstaged]));
  expect(biomeArgv(staged)).not.toEqual(expect.arrayContaining([FILES.untracked]));
  expect(staged.checkScopeArgv).toEqual(expect.arrayContaining([FILES.deleted, FILES.renameOld]));
});

test("control: the working-change selection over the same repo still sees the unstaged and the untracked file", ({ repoRoot, scratch }) => {
  plantRepo(repoRoot, scratch);
  const working = resolveSelection({ kind: "changed", paths: [] }, scratch);
  expect(working.existingPaths).toEqual(expect.arrayContaining([FILES.unstaged, FILES.untracked, FILES.staged]));
});

// D274: a commit runs only what narrows to its files. A staged selection that matches every near-identity trigger
// must still plan no stage's whole command; the working-change control plans them.
test("the commit gate defers every whole command its change triggers, and the working change runs them", { timeout: scaledBudget(20_000) }, ({
  repoRoot,
  scratch,
}) => {
  plantRepo(repoRoot, scratch);
  const staged = resolveSelection({ kind: "staged" }, scratch);
  const working = resolveSelection({ kind: "changed", paths: [] }, scratch);
  const wholeAt = (selection: typeof staged): readonly string[] =>
    stagesForTier("static")
      .filter((stage) => JSON.stringify(planStage(stage, selection, "static", scratch).argv) === JSON.stringify(stage.argv))
      .map((stage) => stage.name);
  expect(wholeAt(staged)).toEqual([]);
  expect(wholeAt(working)).toEqual(expect.arrayContaining(["types:testd", "ledgers:fresh", "types:ownership"]));
  const testd = stagesForTier("static").find((stage) => stage.name === "types:testd");
  expect(testd === undefined ? null : planStage(testd, staged, "static", scratch).mode).toBe("deferred");
});

interface HookConfig {
  readonly commands: Readonly<Record<string, { readonly run: string }>>;
}

function hooks(repoRoot: string): Readonly<Record<string, HookConfig>> {
  return YAML.parse(readFileSync(join(repoRoot, "lefthook.yml"), "utf8")) as Readonly<Record<string, HookConfig>>;
}

test("both live commit hooks keep staged tooling out of branch-wide recertification while ordinary verification retains it", ({ repoRoot, scratch }) => {
  plantRepo(repoRoot, scratch);
  const tool = "tooling/src/verify/lib/changed-tool.ts";
  mkdirSync(join(scratch, "tooling/src/verify/lib"), { recursive: true });
  writeFileSync(join(scratch, "tooling/tsconfig.json"), '{"extends":"../tsconfig.base.json","include":["src"]}\n');
  writeFileSync(join(scratch, tool), "export const changed = true;\n");
  execFixtureGit(scratch, ["add", tool]);
  const live = hooks(repoRoot);
  for (const hook of ["pre-commit", "pre-merge-commit"]) {
    const command = live[hook]?.commands["check"]?.run;
    expect(command).toBeDefined();
    const request = parseRequest((command ?? "").split(" ").slice(2));
    if ("error" in request || request.request === undefined) {
      throw new Error(`commit hook has no scoped request: ${command}`);
    }
    expect(request).toMatchObject({ tier: "static", request: { kind: "staged" } });
    const selection = resolveSelection(request.request, scratch);
    expect(selection.paths).toContain(tool);
    expect(selection.paths).not.toContain(FILES.unstaged);
    expect(selection.paths).not.toContain(FILES.untracked);
    const instrument = stagesForTier(request.tier).find((row) => row.name === "tests:instrument-affected");
    if (instrument === undefined) {
      throw new Error("static tier lost affected instrument recertification");
    }
    expect(planStage(instrument, selection, request.tier, scratch)).toMatchObject({ mode: "deferred", argv: null });
    const working = resolveSelection({ kind: "changed", paths: [] }, scratch);
    expect(planStage(instrument, working, "static", scratch)).toMatchObject({ mode: "scoped", argv: instrument.argv });
    expect(planStage(instrument, undefined, "static", scratch)).toMatchObject({ mode: "full", argv: instrument.argv });
    const lint = stagesForTier(request.tier).find((row) => row.name === "lint:biome");
    if (lint === undefined) {
      throw new Error("commit hook lost lint");
    }
    expect(planStage(lint, selection, request.tier, scratch).argv).toContain(tool);
  }
});

function plantSyncRepo(repoRoot: string, scratch: string): string {
  writeFileSync(join(scratch, "package.json"), readFileSync(join(repoRoot, "package.json")));
  writeFileSync(join(scratch, "lefthook.yml"), readFileSync(join(repoRoot, "lefthook.yml")));
  mkdirSync(join(scratch, "scripts"), { recursive: true });
  writeFileSync(join(scratch, "scripts/github-sync.sh"), readFileSync(join(repoRoot, "scripts/github-sync.sh")));
  writeFileSync(join(scratch, "scripts/ci-qualification.ts"), readFileSync(join(repoRoot, "scripts/ci-qualification.ts")));
  mkdirSync(join(scratch, ".github/workflows"), { recursive: true });
  writeFileSync(join(scratch, ".github/workflows/ci.yml"), readFileSync(join(repoRoot, ".github/workflows/ci.yml")));
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  writeFileSync(join(scratch, ".gitignore"), "node_modules\nfake-bin\nci-*.json\n");
  execFixtureGit(scratch, ["init", "--initial-branch=main"]);
  execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
  execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["-c", "user.name=Orb Test", "-c", "user.email=orb@example.invalid", "commit", "-m", "baseline"]);
  const remote = join(scratch, "remote.git");
  mkdirSync(remote);
  execFixtureGit(remote, ["init", "--bare"]);
  execFixtureGit(scratch, ["remote", "add", "origin", remote]);
  execFixtureGit(scratch, ["push", "origin", "main"]);
  return remote;
}

test("the live pre-push hook accepts synchronized main without verification and still refuses missing release merges", async ({
  repoRoot,
  scratch,
  fakeBin,
}) => {
  await fakeBin("pnpm", "process.stderr.write('UNEXPECTED LOCAL VERIFY\\n');process.exitCode=77;");
  plantSyncRepo(repoRoot, scratch);
  const run = (): SpawnSyncReturns<string> =>
    spawnSync(join(repoRoot, "node_modules/.bin/lefthook"), ["run", "pre-push", "--force", "--no-tty"], {
      cwd: scratch,
      env: fixtureGitEnvironment(),
      encoding: "utf8",
      timeout: scaledBudget(20_000),
    });
  const clean = run();
  expect(clean.status, clean.stdout + clean.stderr).toBe(0);
  expect(clean.stdout + clean.stderr).not.toContain("UNEXPECTED LOCAL VERIFY");
  execFixtureGit(scratch, ["checkout", "-b", "release"]);
  writeFileSync(join(scratch, "release.txt"), "release merge\n");
  execFixtureGit(scratch, ["add", "release.txt"]);
  execFixtureGit(scratch, ["-c", "user.name=Orb Test", "-c", "user.email=orb@example.invalid", "commit", "-m", "release"]);
  execFixtureGit(scratch, ["push", "origin", "release"]);
  execFixtureGit(scratch, ["checkout", "main"]);
  const refused = run();
  expect(refused.status, refused.stdout + refused.stderr).not.toBe(0);
  expect(refused.stdout + refused.stderr).toContain("GitHub has merges on release that local main lacks");
  expect(refused.stdout + refused.stderr).not.toContain("UNEXPECTED LOCAL VERIFY");
});

test("production release refuses absent, pending, failed, cancelled, stale and wrong-event CI, and admits exact successful push CI", {
  timeout: scaledBudget(30_000),
}, async ({ repoRoot, scratch, fakeBin }) => {
  const remote = plantSyncRepo(repoRoot, scratch);
  const sha = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  await fakeBin("gh", GH_RUN_FIXTURE);
  const run = (): SpawnSyncReturns<string> =>
    spawnSync("bash", ["scripts/github-sync.sh", "--release"], {
      cwd: scratch,
      env: fixtureGitEnvironment(),
      encoding: "utf8",
      timeout: scaledBudget(20_000),
    });
  for (const rows of [
    [],
    [{ sha, event: "push", status: "in_progress", conclusion: "null" }],
    [{ sha, event: "push", status: "completed", conclusion: "failure" }],
    [{ sha, event: "push", status: "completed", conclusion: "cancelled" }],
    [{ sha: "a".repeat(40), event: "push", status: "completed", conclusion: "success" }],
    [{ sha, event: "pull_request", status: "completed", conclusion: "success" }],
  ]) {
    writeFileSync(join(scratch, "ci-runs.json"), JSON.stringify(rows));
    const refused = run();
    expect(refused.status, refused.stdout + refused.stderr).toBe(1);
    expect(refused.stdout + refused.stderr).toMatch(/is not green/u);
    expect(existsSync(join(remote, "refs/heads/release"))).toBe(false);
    expect(execFixtureGit(remote, ["rev-parse", "refs/heads/main"]).trim()).toBe(sha);
    const requests = readFileSync(join(scratch, "ci-request.json"), "utf8");
    expect(requests).toContain(`head_sha=${sha}&event=push&branch=main`);
  }
  writeFileSync(join(scratch, "ci-runs.json"), JSON.stringify([{ sha, event: "push", status: "completed", conclusion: "success" }]));
  const success = run();
  expect(success.status, success.stdout + success.stderr).toBe(0);
  expect(execFixtureGit(remote, ["rev-parse", "refs/heads/release"]).trim()).toBe(sha);
});

const GH_RUN_FIXTURE = [
  "import fs from 'node:fs';",
  "const args=process.argv.slice(2);fs.appendFileSync('ci-request.json',JSON.stringify(args)+'\\n');",
  "const url=args[1];if(args[0]!=='api')process.exit(77);",
  "const rows=JSON.parse(fs.readFileSync('ci-runs.json','utf8'));",
  "const run=(row,index)=>({id:index+1,workflow_id:7,run_attempt:row.attempt??1,head_sha:row.sha,head_branch:row.branch??'main',event:row.event,status:row.status,conclusion:row.conclusion,repository:{full_name:row.repository??'Inktomi93/OrbWeaver'}});",
  "if(url.endsWith('/workflows/ci.yml'))process.stdout.write(JSON.stringify({id:7,path:'.github/workflows/ci.yml'}));",
  "else if(url.includes('/runs?')){const u=new URL('https://example.invalid/'+url);const runs=rows.map(run).filter(row=>row.head_sha===u.searchParams.get('head_sha')&&row.event==='push'&&row.head_branch==='main');process.stdout.write(JSON.stringify({total_count:runs.length,workflow_runs:runs}));}",
  "else if(url.includes('/jobs?')){const id=Number(url.split('/runs/')[1].split('/')[0]);const row=rows[id-1];const job={id:1,run_id:id,run_attempt:row.attempt??1,head_sha:row.sha,name:'static',status:'completed',conclusion:'success',steps:[{name:row.generation??'Orbweaver qualification corpus-v1',status:'completed',conclusion:row.marker??'success'}]};const corpus=['semantic-corpus (1/2)','semantic-corpus (2/2)'].map((name,index)=>({...job,id:index+2,name,run_attempt:row.corpusAttempt??row.attempt??1,steps:[{name:row.corpusGeneration??'Orbweaver qualification corpus-v1',status:'completed',conclusion:row.corpusMarker??'success'}]}));process.stdout.write(JSON.stringify({total_count:3,jobs:[job,...corpus]}));}",
  "else {const id=Number(url.split('/runs/')[1]);process.stdout.write(JSON.stringify(run(rows[id-1],id-1)));}",
].join("\n");

test("sync-created merge HEAD needs its own successful push CI before release promotion", { timeout: scaledBudget(20_000) }, async ({
  repoRoot,
  scratch,
  fakeBin,
}) => {
  const remote = plantSyncRepo(repoRoot, scratch);
  await fakeBin("gh", GH_RUN_FIXTURE);
  execFixtureGit(scratch, ["checkout", "-b", "release"]);
  writeFileSync(join(scratch, "remote-release.txt"), "remote release\n");
  execFixtureGit(scratch, ["add", "remote-release.txt"]);
  execFixtureGit(scratch, ["commit", "-m", "remote release"]);
  const release = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  execFixtureGit(scratch, ["push", "origin", "release"]);
  execFixtureGit(scratch, ["checkout", "main"]);
  writeFileSync(join(scratch, "local-main.txt"), "local main\n");
  execFixtureGit(scratch, ["add", "local-main.txt"]);
  execFixtureGit(scratch, ["commit", "-m", "local main"]);
  const beforeSync = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  writeFileSync(join(scratch, "ci-runs.json"), JSON.stringify([{ sha: beforeSync, event: "push", status: "completed", conclusion: "success" }]));
  const run = (): SpawnSyncReturns<string> =>
    spawnSync("bash", ["scripts/github-sync.sh", "--release"], {
      cwd: scratch,
      env: fixtureGitEnvironment(),
      encoding: "utf8",
      timeout: scaledBudget(20_000),
    });
  const refused = run();
  expect(refused.status, refused.stdout + refused.stderr).toBe(1);
  const merged = execFixtureGit(scratch, ["rev-parse", "HEAD"]).trim();
  expect(merged).not.toBe(beforeSync);
  expect(merged).not.toBe(release);
  expect(execFixtureGit(remote, ["rev-parse", "refs/heads/release"]).trim()).toBe(release);
  expect(readFileSync(join(scratch, "ci-request.json"), "utf8")).toContain(`head_sha=${merged}&event=push&branch=main`);
  writeFileSync(join(scratch, "ci-runs.json"), JSON.stringify([{ sha: merged, event: "push", status: "completed", conclusion: "success" }]));
  expect(run().status).toBe(0);
  expect(execFixtureGit(remote, ["rev-parse", "refs/heads/release"]).trim()).toBe(merged);
});

const HOOK_OBSERVATION = z.strictObject({ args: z.array(z.string()), paths: z.array(z.string()), bytes: z.string() });

test("native Git commit and merge topology keeps the staged hooks and partial-file bytes intact", async ({ repoRoot, scratch, fakeBin }) => {
  await fakeBin(
    "pnpm",
    [
      "import fs from 'node:fs';import {execFileSync} from 'node:child_process';",
      "const paths=execFileSync('git',['diff','--cached','--name-only'],{encoding:'utf8'}).trim().split('\\n').filter(Boolean);",
      "fs.appendFileSync('hook-checks.jsonl',JSON.stringify({args:process.argv.slice(2),paths,bytes:fs.readFileSync('probe.ts','utf8')})+'\\n');",
    ].join("\n"),
  );
  writeFileSync(join(scratch, "lefthook.yml"), readFileSync(join(repoRoot, "lefthook.yml")));
  writeFileSync(join(scratch, ".gitignore"), "node_modules\nhook-checks.jsonl\n");
  writeFileSync(join(scratch, "probe.ts"), "export const value = 0;\n");
  mkdirSync(join(scratch, "scripts"));
  writeFileSync(join(scratch, "scripts/commit-msg-check.sh"), readFileSync(join(repoRoot, "scripts/commit-msg-check.sh")));
  mkdirSync(join(scratch, "tooling/src/doc"), { recursive: true });
  writeFileSync(join(scratch, "tooling/src/doc/cli.ts"), "process.exitCode = 0;\n");
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  execFixtureGit(scratch, ["init", "--initial-branch=lane"]);
  execFixtureGit(scratch, ["config", "user.name", "Orb Test"]);
  execFixtureGit(scratch, ["config", "user.email", "orb@example.invalid"]);
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["commit", "-m", "baseline"]);
  const installed = spawnSync(join(repoRoot, "node_modules/.bin/lefthook"), ["install", "--force"], {
    cwd: scratch,
    env: fixtureGitEnvironment(),
    encoding: "utf8",
  });
  expect(installed.status, installed.stdout + installed.stderr).toBe(0);
  const native = (args: readonly string[]): SpawnSyncReturns<string> =>
    spawnSync("git", [...args], {
      cwd: scratch,
      env: fixtureGitEnvironment(),
      encoding: "utf8",
      timeout: scaledBudget(20_000),
    });
  const message = ["-m", "chore(fixture): exercise hooks", "-m", "Co-Authored-By: Test <test@example.invalid>"];
  const clear = (): void => writeFileSync(join(scratch, "hook-checks.jsonl"), "");
  const checks = (): readonly { readonly args: readonly string[]; readonly paths: readonly string[]; readonly bytes: string }[] =>
    readFileSync(join(scratch, "hook-checks.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => HOOK_OBSERVATION.parse(JSON.parse(line)));
  writeFileSync(join(scratch, "probe.ts"), "export const value = 1;\n");
  execFixtureGit(scratch, ["add", "probe.ts"]);
  writeFileSync(join(scratch, "probe.ts"), "export const value = 2;\n");
  clear();
  const committed = native(["commit", ...message]);
  expect(committed.status, committed.stdout + committed.stderr).toBe(0);
  expect(checks()).toEqual([{ args: ["verify", "--static", "--changed", "staged"], paths: ["probe.ts"], bytes: "export const value = 1;\n" }]);
  expect(readFileSync(join(scratch, "probe.ts"), "utf8")).toBe("export const value = 2;\n");
  execFixtureGit(scratch, ["add", "probe.ts"]);
  execFixtureGit(scratch, ["commit", "-m", "prepare"]);
  execFixtureGit(scratch, ["checkout", "-b", "incoming"]);
  writeFileSync(join(scratch, "incoming.ts"), "export {};\n");
  execFixtureGit(scratch, ["add", "incoming.ts"]);
  execFixtureGit(scratch, ["commit", "-m", "incoming"]);
  execFixtureGit(scratch, ["checkout", "lane"]);
  clear();
  const merged = native(["merge", "--no-ff", "--no-edit", "incoming"]);
  expect(merged.status, merged.stdout + merged.stderr).toBe(0);
  expect(checks()).toEqual([{ args: ["verify", "--static", "--changed", "staged"], paths: ["incoming.ts"], bytes: "export const value = 2;\n" }]);
  execFixtureGit(scratch, ["checkout", "incoming"]);
  writeFileSync(join(scratch, "probe.ts"), "export const value = 3;\n");
  execFixtureGit(scratch, ["add", "probe.ts"]);
  execFixtureGit(scratch, ["commit", "-m", "incoming conflict"]);
  execFixtureGit(scratch, ["checkout", "lane"]);
  writeFileSync(join(scratch, "probe.ts"), "export const value = 4;\n");
  execFixtureGit(scratch, ["add", "probe.ts"]);
  execFixtureGit(scratch, ["commit", "-m", "local conflict"]);
  clear();
  expect(native(["merge", "--no-edit", "incoming"]).status).toBe(1);
  expect(checks()).toEqual([]);
  writeFileSync(join(scratch, "probe.ts"), "export const value = 5;\n");
  execFixtureGit(scratch, ["add", "probe.ts"]);
  const resolved = native(["commit", ...message]);
  expect(resolved.status, resolved.stdout + resolved.stderr).toBe(0);
  expect(checks()).toEqual([{ args: ["verify", "--static", "--changed", "staged"], paths: ["probe.ts"], bytes: "export const value = 5;\n" }]);
  execFixtureGit(scratch, ["checkout", "-b", "fast-forward"]);
  writeFileSync(join(scratch, "ff.ts"), "export {};\n");
  execFixtureGit(scratch, ["add", "ff.ts"]);
  execFixtureGit(scratch, ["commit", "-m", "fast-forward"]);
  execFixtureGit(scratch, ["checkout", "lane"]);
  clear();
  expect(native(["merge", "--ff-only", "fast-forward"]).status).toBe(0);
  expect(checks(), "fast-forward has no commit hook; composed train verification remains an orchestrator obligation").toEqual([]);
});
