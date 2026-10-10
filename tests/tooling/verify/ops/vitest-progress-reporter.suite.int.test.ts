// The native corpus worker must deliver completed work before a synchronous test returns.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { spawnNicedTranscript } from "@orb/tooling/_shared/proc";
import { testProcessEnv } from "@orb/tooling/_shared/process-env";
import { SEMANTIC_CORPUS_RESOURCE } from "@orb/tooling/_shared/test-kinds";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const NATIVE_FIXTURE_TIMEOUT_BASE_MS = 60_000;
const NATIVE_FIXTURE_HARD_CEILING_MS = 120_000;

const PROGRESS = "liveness batch completed before synchronous continuation";
const WAIT_FOR_RELEASE = `import {existsSync,watch} from "node:fs";
const timeout=setTimeout(()=>process.exit(1),2000);
const watcher=watch(".",()=>{if(existsSync("release")){clearTimeout(timeout);watcher.close();}});
if(existsSync("release")){clearTimeout(timeout);watcher.close();}`;

test("the native reporter refuses direct invocation instead of returning a false clean verdict", ({ repoRoot }) => {
  const result = spawnSync(process.execPath, [join(repoRoot, "tooling/src/verify/ops/vitest-progress-reporter.ts")], {
    cwd: repoRoot,
    env: testProcessEnv(),
    encoding: "utf8",
  });
  expect(result.status, result.stdout + result.stderr).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("direct invocation");
  expect(result.stderr).toContain("pnpm test:tooling");
});

test("native corpus console progress escapes the synchronous batch before its continuation can finish", { timeout: scaledBudget(30_000) }, async ({
  scratch,
  repoRoot,
}) => {
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  writeFileSync(join(scratch, "package.json"), '{"type":"module"}');
  const config = pathToFileURL(join(repoRoot, "vitest.config.ts")).href;
  writeFileSync(
    join(scratch, "vitest.config.ts"),
    `import {vitestConfig} from ${JSON.stringify(config)};
const {projects,globalSetup,...defaults}=vitestConfig(true).test;
const corpus=projects.find(project=>project.test?.name===${JSON.stringify(SEMANTIC_CORPUS_RESOURCE)});
export default {test:{...defaults,...corpus.test,globalSetup:[],include:["fixture.test.ts"],maxWorkers:1}};`,
  );
  writeFileSync(
    join(scratch, "fixture.test.ts"),
    `import {spawnSync} from "node:child_process";import {expect,test} from "vitest";
test("synchronous native batch",()=>{
console.log(${JSON.stringify(PROGRESS)});
const continuation=spawnSync(process.execPath,["--input-type=module","-e",${JSON.stringify(WAIT_FOR_RELEASE)}]);
expect(continuation.status,"progress must reach the parent while this callback is blocked").toBe(0);
});`,
  );
  mkdirSync(join(scratch, "reports"));
  const report = join(scratch, "reports/result.json");
  let output = "";
  const code = await new Promise<number | null>((resolve) => {
    const child = spawn(
      process.execPath,
      [
        join(repoRoot, "scripts/vitest-supervised.ts"),
        "run",
        "--reporter=default",
        "--reporter=json",
        `--reporter=${join(repoRoot, "tooling/src/verify/ops/vitest-progress-reporter.ts")}`,
        `--outputFile.json=${report}`,
      ],
      {
        cwd: scratch,
        env: testProcessEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const receive = (chunk: Buffer): void => {
      output += chunk.toString();
      if (output.includes(PROGRESS)) {
        writeFileSync(join(scratch, "release"), "observed actual batch progress");
      }
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    child.on("close", resolve);
  });
  expect(code, output).toBe(0);
  expect(output).toContain("queued; importing test module");
  expect(output).toContain(": collected");
  expect(output).toContain(": test passed: synchronous native batch");
  expect(JSON.parse(readFileSync(report, "utf8"))).toMatchObject({ success: true, numPassedTests: 1, numFailedTests: 0 });
});

test("native Stryker related dry run retains selection and per-file lifecycle in TRACE", { timeout: scaledBudget(120_000) }, async ({ scratch, repoRoot }) => {
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  writeFileSync(join(scratch, "package.json"), '{"type":"module"}');
  writeFileSync(join(scratch, "subject.js"), "export function answer(){return 42;}");
  writeFileSync(
    join(scratch, "fixture.test.js"),
    'import {expect,test} from "vitest";import {answer} from "./subject.js";test("answer",()=>expect(answer()).toBe(42));',
  );
  writeFileSync(join(scratch, "unrelated.test.js"), 'import {test} from "vitest";test("unrelated",()=>{throw Error("must not select");});');
  writeFileSync(
    join(scratch, "vitest.config.js"),
    `export default {test:{projects:[{test:{name:"unit",include:["*.test.js"]}}],reporters:["default",[${JSON.stringify(join(repoRoot, "tooling/src/verify/ops/vitest-progress-reporter.ts"))},{mutation:true}]]}};`,
  );
  writeFileSync(
    join(scratch, "stryker.config.json"),
    JSON.stringify({
      mutate: ["subject.js"],
      testRunner: "vitest",
      vitest: { configFile: "vitest.config.js", related: true },
      plugins: ["@stryker-mutator/vitest-runner"],
      reporters: ["clear-text"],
      fileLogLevel: "trace",
      dryRunOnly: true,
      dryRunTimeoutMinutes: 1,
      concurrency: 1,
      coverageAnalysis: "perTest",
      ignorePatterns: ["node_modules/**"],
    }),
  );
  const result = await spawnNicedTranscript(join(repoRoot, "node_modules/.bin/stryker"), ["run", "stryker.config.json"], {
    cwd: scratch,
    env: testProcessEnv(),
    timeoutMs: Math.min(scaledBudget(NATIVE_FIXTURE_TIMEOUT_BASE_MS), NATIVE_FIXTURE_HARD_CEILING_MS),
  });
  expect(result.code, result.transcript).toBe(0);
  const trace = readFileSync(join(scratch, "stryker.log"), "utf8");
  const selecting = trace.indexOf("[mutation-progress] selecting related test modules");
  const selected = trace.indexOf("[mutation-progress] selected 1 test modules");
  const queued = trace.indexOf("fixture.test.js: queued; importing test module");
  const collected = trace.indexOf("fixture.test.js: collected");
  const started = trace.indexOf("fixture.test.js: execution started");
  const ended = trace.indexOf("fixture.test.js: module passed");
  expect(selecting, trace).toBeGreaterThan(-1);
  expect(selected, trace).toBeGreaterThan(selecting);
  expect(trace).toContain("vitest final config:");
  expect(trace).toContain("[Circular");
  expect(queued).toBeGreaterThan(selected);
  expect(collected).toBeGreaterThan(queued);
  expect(started).toBeGreaterThan(collected);
  expect(ended).toBeGreaterThan(started);
  expect(trace).not.toContain("unrelated.test.js: queued");
});
