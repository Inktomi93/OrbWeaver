// The native corpus worker must deliver completed work before a synchronous test returns.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { testProcessEnv } from "@orb/tooling/_shared/process-env";
import { SEMANTIC_CORPUS_RESOURCE } from "@orb/tooling/_shared/test-kinds";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

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
