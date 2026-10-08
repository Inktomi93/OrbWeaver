// Split execution keeps native collection closed and event authority local to each component.
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { SEMANTIC_CORPUS_RESOURCE } from "@orb/tooling/_shared/test-kinds";
import { INSTRUMENT_EXECUTION_COMPONENT_ENV } from "../../../../tooling/src/verify/contract/instrument-affected.ts";
import { collectNodeShards } from "../../../../tooling/src/verify/ops/scoped-test.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CORPUS = ["tests/tooling/first.suite.corpus.int.test.ts", "tests/tooling/second.suite.corpus.int.test.ts"] as const;
const PLAIN = "tests/tooling/plain.test.ts";
const SOURCE = "tooling/src/verify/gates/focus.ts";
const CONFIG = `import { defineConfig } from "vitest/config";
export default defineConfig({test:{maxWorkers:1,fileParallelism:false,projects:[
{test:{name:"semantic-corpus",include:["tests/tooling/*.suite.corpus.int.test.ts"],maxWorkers:1}},
{test:{name:"unit",include:["tests/tooling/plain.test.ts"],maxWorkers:1}}
]}});`;

function linkNativeRunner(root: string, repoRoot: string): void {
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  mkdirSync(join(root, "scripts"));
  symlinkSync(join(repoRoot, "scripts/vitest-supervised.ts"), join(root, "scripts/vitest-supervised.ts"));
}

function git(root: string, args: readonly string[]): string {
  return execFixtureGit(root, ["-c", "user.name=Orb Test", "-c", "user.email=orb@example.invalid", ...args]).trim();
}

function fixtureSpec(name: string): string {
  return `import { test, expect } from "vitest";
import { appendFileSync } from "node:fs";
import "../../tooling/src/verify/gates/focus.ts";
test(${JSON.stringify(name)},()=>{
for(const key of ["ORB_VERIFY_BASE","ORB_VERIFY_HEAD","ORB_VERIFY_INSTRUMENT_COMPONENT"])expect(process.env[key]).toBeUndefined();
appendFileSync("executed.jsonl",JSON.stringify(${JSON.stringify(name)})+"\\n");
expect(process.env.FIXTURE_FAIL_FILE).not.toBe(${JSON.stringify(name)});
});`;
}

test("native configured shard views are disjoint, complete and never initialize test or global setup", { timeout: scaledBudget(90_000) }, async ({
  plantedTree,
  repoRoot,
}) => {
  const root = await plantedTree({
    "package.json": '{"type":"module"}',
    "vitest.runtime.config.ts": `import {defineConfig} from "vitest/config";import {BaseSequencer} from "vitest/node";import {appendFileSync} from "node:fs";
class Configured extends BaseSequencer {
async shard(files){appendFileSync("order.log","shard\\n");return files.toSorted((a,b)=>a.moduleId.localeCompare(b.moduleId)).filter((_,i)=>i+1===this.ctx.config.shard.index);}
async sort(files){appendFileSync("order.log","sort\\n");return files;}}
export default defineConfig({plugins:[{name:"dispose-control",closeBundle(){appendFileSync("closed.log","closed\\n");}}],test:{sequence:{sequencer:Configured},projects:[{test:{name:"semantic-corpus",include:["tests/tooling/*.suite.corpus.int.test.ts"],globalSetup:["./global.ts"]}}]}});`,
    "global.ts": 'throw new Error("global setup must not execute during collection");',
    [CORPUS[0]]: 'throw new Error("test module must not execute during collection");',
    [CORPUS[1]]: 'throw new Error("test module must not execute during collection");',
  });
  linkNativeRunner(root, repoRoot);
  const fixtureConfig = join(root, "vitest.runtime.config.ts");
  writeFileSync(
    fixtureConfig,
    readFileSync(fixtureConfig, "utf8")
      .replaceAll('"order.log"', JSON.stringify(join(root, "order.log")))
      .replaceAll('"closed.log"', JSON.stringify(join(root, "closed.log"))),
  );
  const result = await collectNodeShards(root, SEMANTIC_CORPUS_RESOURCE, 2);
  expect(result.files.toSorted()).toEqual([...CORPUS]);
  expect(result.shards).toEqual([[CORPUS[0]], [CORPUS[1]]]);
  expect(readFileSync(join(root, "order.log"), "utf8")).toBe("shard\nsort\nshard\nsort\n");
  expect(readFileSync(join(root, "closed.log"), "utf8").trim().split("\n")).toHaveLength(9);
  const config = readFileSync(join(root, "vitest.runtime.config.ts"), "utf8");
  for (const [replacement, message, closes] of [
    ["return files;", "overlap or omit", 9],
    ["return [];", "changed its shard population", 6],
    ['throw new Error("sequencer failed");', "sequencer failed", 6],
  ] as const) {
    writeFileSync(join(root, "closed.log"), "");
    writeFileSync(
      join(root, "vitest.runtime.config.ts"),
      config.replace("return files.toSorted((a,b)=>a.moduleId.localeCompare(b.moduleId)).filter((_,i)=>i+1===this.ctx.config.shard.index);", replacement),
    );
    await expect(collectNodeShards(root, SEMANTIC_CORPUS_RESOURCE, 2)).rejects.toThrow(message);
    expect(readFileSync(join(root, "closed.log"), "utf8").trim().split("\n")).toHaveLength(closes);
  }
  writeFileSync(join(root, "vitest.runtime.config.ts"), config);
  await expect(collectNodeShards(root, SEMANTIC_CORPUS_RESOURCE, 1)).rejects.toThrow("absent, duplicated or ambiguous");
  await expect(collectNodeShards(root, "foreign", 2)).rejects.toThrow();
});

test("weekly-owned components execute exactly the native shard or non-corpus population and preserve red exits", { timeout: scaledBudget(180_000) }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree({
    ".gitignore": "node_modules\nreports\nscripts\nexecuted.jsonl\n",
    "package.json": '{"type":"module"}',
    "vitest.runtime.config.ts": CONFIG,
    "tooling/tsconfig.json": JSON.stringify({
      compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", noEmit: true },
      include: ["src", "../tests"],
    }),
    [SOURCE]: 'export const gate = {id:"focus"};export const value=1;',
    [PLAIN]: fixtureSpec(PLAIN),
    [CORPUS[0]]: fixtureSpec(CORPUS[0]),
    [CORPUS[1]]: fixtureSpec(CORPUS[1]),
  });
  linkNativeRunner(root, repoRoot);
  git(root, ["init", "--quiet", "--initial-branch=main"]);
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "baseline"]);
  writeFileSync(join(root, SOURCE), 'export const gate = {id:"focus"};export const value=2;');
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "event"]);
  const head = git(root, ["rev-parse", "HEAD"]);
  const boundary = { ["ORB_VERIFY_BASE"]: "invalid", ["ORB_VERIFY_HEAD"]: "invalid" };
  const collected = await collectNodeShards(root, SEMANTIC_CORPUS_RESOURCE, 2);
  for (const [component, shard, expected] of [
    ["all", undefined, [PLAIN, ...CORPUS]],
    ["non-corpus", undefined, [PLAIN]],
    ["corpus", "1/2", collected.shards[0]],
    ["corpus", "2/2", collected.shards[1]],
  ] as const) {
    writeFileSync(join(root, "executed.jsonl"), "");
    const result = await runCli("verify", ["instrument-affected", "--weekly", ...(shard === undefined ? [] : [`--shard=${shard}`])], {
      cwd: root,
      env: { ...boundary, [INSTRUMENT_EXECUTION_COMPONENT_ENV]: component },
    });
    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(
      readFileSync(join(root, "executed.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((row) => JSON.parse(row))
        .toSorted(),
    ).toEqual(expected?.toSorted());
    const failing = expected?.[0];
    if (failing === undefined) {
      throw new Error("native partition lost its population");
    }
    const red = await runCli("verify", ["instrument-affected", "--weekly", ...(shard === undefined ? [] : [`--shard=${shard}`])], {
      cwd: root,
      env: { ...boundary, [INSTRUMENT_EXECUTION_COMPONENT_ENV]: component, ["FIXTURE_FAIL_FILE"]: failing },
    });
    expect(red.code, red.stdout + red.stderr).toBe(1);
  }
  for (const [component, args] of [
    ["corpus", []],
    ["corpus", ["--shard=3/2"]],
    ["corpus", ["--shard=0/2"]],
    ["non-corpus", ["--shard=1/2"]],
    ["invalid", []],
    ["all", [PLAIN]],
    ["all", ["--project=unit"]],
  ] as const) {
    const refused = await runCli("verify", ["instrument-affected", "--weekly", ...args], {
      cwd: root,
      env: { ...boundary, [INSTRUMENT_EXECUTION_COMPONENT_ENV]: component },
    });
    expect(refused.code, refused.stdout + refused.stderr).toBe(3);
  }
  const unbounded = await runCli("verify", ["instrument-affected"], { cwd: root, env: { [INSTRUMENT_EXECUTION_COMPONENT_ENV]: "non-corpus" } });
  expect(unbounded.code, unbounded.stdout + unbounded.stderr).toBe(3);
  mkdirSync(join(root, "packages/client/src"), { recursive: true });
  writeFileSync(join(root, "packages/client/src/application.ts"), "export const value=1;");
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "product event"]);
  const productHead = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(root, "executed.jsonl"), "");
  for (const component of ["non-corpus", "corpus"]) {
    const noop = await runCli("verify", ["instrument-affected", "--weekly", "--affected", ...(component === "corpus" ? ["--shard=2/2"] : [])], {
      cwd: root,
      env: {
        ["ORB_VERIFY_BASE"]: head,
        ["ORB_VERIFY_HEAD"]: productHead,
        [INSTRUMENT_EXECUTION_COMPONENT_ENV]: component,
      },
    });
    expect(noop.code, noop.stdout + noop.stderr).toBe(0);
    expect(noop.stdout).toContain("no affected native tooling inputs in measured");
  }
  expect(readFileSync(join(root, "executed.jsonl"), "utf8")).toBe("");
  expect(existsSync(join(root, "reports/test-report-tooling.json"))).toBe(true);
});
