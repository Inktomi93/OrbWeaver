// @subject tooling/src/floor/compiler/semantic-inventory-worker-run.ts
// @subject tooling/src/floor/process/proc.ts
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { z } from "zod";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { inheritedProcessEnv } from "../../../../tooling/src/floor/process/process-env.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { copyNativeInventoryImplementation } from "./native-inventory-tree.ts";

const NODE_OPTIONS = "NODE_OPTIONS";
const timeout = scaledBudget(30_000);
const observation = z.object({ heap: z.number(), options: z.string(), controllerOptions: z.string(), argv: z.string().array() });

const cases = [
  { name: "floor", options: "", args: [], minimum: 16, maximum: 17, status: 0, stderr: [], fault: "" },
  { name: "explicit", options: "--max-old-space-size=512", args: [], minimum: 0, maximum: 1, status: 0, stderr: [], fault: "" },
  { name: "total-heap-env", options: "--max-heap-size=512", args: [], minimum: 0, maximum: 1, status: 0, stderr: [], fault: "" },
  { name: "total-heap-env-underscore", options: "--max_heap_size=512", args: [], minimum: 0, maximum: 1, status: 0, stderr: [], fault: "" },
  { name: "total-heap-argv", options: "", args: ["--max-heap-size=512"], minimum: 0, maximum: 1, status: 0, stderr: [], fault: "" },
  { name: "total-heap-argv-underscore", options: "", args: ["--max_heap_size=512"], minimum: 0, maximum: 1, status: 0, stderr: [], fault: "" },
  {
    name: "signal",
    options: "",
    args: [],
    minimum: 16,
    maximum: 17,
    status: 2,
    stderr: ["signal=SIGTERM", "status=null", "heap", "native signal evidence"],
    fault: "process.stderr.write('native signal evidence\\n');process.kill(process.pid,'SIGTERM');",
  },
  {
    name: "status",
    options: "",
    args: [],
    minimum: 16,
    maximum: 17,
    status: 2,
    stderr: ["status=7", "native status evidence"],
    fault: "process.stderr.write('native status evidence\\n');process.exitCode=7;",
  },
];
for (const mode of cases) {
  test(`native inventory worker retains startup and exit evidence: ${mode.name}`, { timeout }, ({ scratch, repoRoot }) => {
    const implementation = copyNativeInventoryImplementation(scratch, repoRoot);
    cpSync(join(repoRoot, "pnpm-workspace.yaml"), join(implementation, "pnpm-workspace.yaml"));
    const output = join(scratch, "worker.json");
    const entry = join(implementation, "controller.mjs");
    const worker = join(implementation, "tooling/src/floor/compiler/semantic-inventory-worker.ts");
    writeFileSync(
      worker,
      `import {writeFileSync,readFileSync} from 'node:fs';import {getHeapStatistics} from 'node:v8';
const request=JSON.parse(readFileSync(process.argv[2],'utf8'));writeFileSync(${JSON.stringify(output)},JSON.stringify({heap:getHeapStatistics().heap_size_limit,options:process.env.NODE_OPTIONS??'',controllerOptions:request.controllerImplementation.nodeOptions,argv:process.execArgv}));
${mode.fault}`,
    );
    writeFileSync(
      entry,
      `const {runInventoryPartitionWorker}=await import('./tooling/src/floor/compiler/semantic-inventory-worker-run.ts');try{runInventoryPartitionWorker({root:${JSON.stringify(implementation)},descriptor:{id:'bounded-worker'},destination:'unused'});}catch(error){process.stderr.write(String(error));process.exitCode=2;}`,
    );
    const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
    const result = runNicedSync(process.execPath, [...mode.args, "--import", bootstrap, entry], {
      cwd: implementation,
      env: inheritedProcessEnv({ [NODE_OPTIONS]: mode.options }),
      timeout,
    });
    expect(existsSync(output), result.stderr).toBe(true);
    const captured = observation.parse(JSON.parse(readFileSync(output, "utf8")));
    expect(captured.options).toBe(captured.controllerOptions);
    expect(captured.argv).toEqual([...mode.args, "--import", bootstrap]);
    expect(result.status, result.stderr).toBe(mode.status);
    for (const text of mode.stderr) {
      expect(result.stderr).toContain(text);
    }
    expect(captured.heap).toBeGreaterThan(mode.minimum * 1024 ** 3);
    expect(captured.heap).toBeLessThan(mode.maximum * 1024 ** 3);
    expect(captured.options).toContain(mode.options);
  });
}

test("sync process door preserves a real native signal and stderr", ({ repoRoot }) => {
  const result = runNicedSync(process.execPath, ["-e", "process.stderr.write('native-signal');process.kill(process.pid,'SIGTERM')"], { cwd: repoRoot });
  expect(result).toMatchObject({ status: null, signal: "SIGTERM", stderr: "native-signal" });
});

test("a bare direct inventory caller publishes a tiny native world with matching sealed runtimes", { timeout }, ({ scratch, repoRoot }) => {
  const implementation = copyNativeInventoryImplementation(scratch, repoRoot);
  cpSync(join(repoRoot, "pnpm-workspace.yaml"), join(implementation, "pnpm-workspace.yaml"));
  const subject = join(scratch, "subject");
  mkdirSync(subject);
  writeFileSync(join(subject, "tsconfig.json"), JSON.stringify({ files: ["tiny.ts"], compilerOptions: { noLib: true, types: [] } }));
  writeFileSync(join(subject, "tiny.ts"), "export const tiny=1;\n");
  writeFileSync(join(subject, ".gitignore"), ".cache/\n");
  execFixtureGit(subject, ["init", "-q"]);
  const entry = join(implementation, "tiny.mjs");
  const output = join(scratch, "tiny.json");
  writeFileSync(
    entry,
    `const {createSemanticInventory}=await import('./tooling/src/floor/code-facts/semantic-inventory.ts');
const {openInventoryDatabase,readInventoryGeneration}=await import('./tooling/src/floor/code-facts/semantic-inventory-database.ts');
const {readInventoryRuntime}=await import('./tooling/src/floor/code-facts/semantic-inventory-runtime-query.ts');
const {writeFileSync}=await import('node:fs');
using inventory=createSemanticInventory({root:${JSON.stringify(subject)},families:['exports']});
using db=openInventoryDatabase(${JSON.stringify(join(subject, ".cache/semantic-inventory.sqlite"))});
const partition=readInventoryGeneration(db,inventory.generation)[0];
const controller=readInventoryRuntime(db,partition.id,'controller');const worker=readInventoryRuntime(db,partition.id,'worker');
writeFileSync(${JSON.stringify(output)},JSON.stringify({files:inventory.sourceCorpus().getSourceFiles().map(file=>file.getBaseName()),options:worker.nodeOptions,controllerOptions:controller.nodeOptions,argv:worker.execArgv,controllerArgv:controller.execArgv}));`,
  );
  const result = runNicedSync(process.execPath, ["--import", join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts"), entry], {
    cwd: implementation,
    env: inheritedProcessEnv({ [NODE_OPTIONS]: "" }),
    timeout,
  });
  expect(result.status, result.stderr).toBe(0);
  const captured = z
    .object({
      files: z.string().array(),
      options: z.string().min(1),
      controllerOptions: z.string(),
      argv: z.string().array(),
      controllerArgv: z.string().array(),
    })
    .parse(JSON.parse(readFileSync(output, "utf8")));
  expect(captured.files).toEqual(["tiny.ts"]);
  expect(captured.options).toBe(captured.controllerOptions);
  expect(captured.argv).toEqual(captured.controllerArgv);
});
