// @subject tooling/src/verify/cli.ts
// @subject tooling/src/floor/process/node-heap.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { z } from "zod";
import { runNicedSync } from "../../../tooling/src/floor/process/proc.ts";
import { inheritedProcessEnv } from "../../../tooling/src/floor/process/process-env.ts";
import { scaledBudget } from "../_load-budget.ts";

const NODE_OPTIONS = "NODE_OPTIONS";
const timeout = scaledBudget(30_000);
const record = z.object({ heap: z.number(), options: z.string(), argv: z.string().array(), pid: z.number() });

test.for(["ast", "codemod"] as const)("%s applies the heap default before importing its operations", { timeout }, (tool, { scratch, repoRoot }) => {
  const output = join(scratch, "heap.json");
  const preload = join(scratch, "observe.mjs");
  const cli = join(repoRoot, `tooling/src/${tool}/cli.ts`);
  writeFileSync(
    preload,
    `import {registerHooks} from 'node:module';import {writeFileSync} from 'node:fs';import {getHeapStatistics} from 'node:v8';
registerHooks({resolve(specifier,context,next){if(context.parentURL===${JSON.stringify(pathToFileURL(cli).href)}&&specifier==='./index.ts')writeFileSync(${JSON.stringify(output)},JSON.stringify({heap:getHeapStatistics().heap_size_limit,options:process.env.NODE_OPTIONS??'',argv:process.argv,pid:process.pid}));return next(specifier,context);}});`,
  );
  const result = runNicedSync(process.execPath, ["--import", preload, cli, "--help"], {
    cwd: repoRoot,
    env: inheritedProcessEnv({ [NODE_OPTIONS]: "" }),
    timeout,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(record.parse(JSON.parse(readFileSync(output, "utf8"))).heap).toBeGreaterThan(16 * 1024 ** 3);
});

const owners = [
  { name: "bare", options: "", args: [], boots: 2, minimum: 16, maximum: 17 },
  { name: "unrelated", options: "--conditions=heap-control", args: [], boots: 2, minimum: 16, maximum: 17 },
  { name: "environment", options: "--max_old_space_size=512", args: [], boots: 1, minimum: 0, maximum: 1 },
  { name: "argv", options: "", args: ["--max-old-space-size=768"], boots: 1, minimum: 0, maximum: 1 },
  { name: "total-heap-env", options: "--max-heap-size=512", args: [], boots: 1, minimum: 0, maximum: 1 },
  { name: "total-heap-env-underscore", options: "--max_heap_size=512", args: [], boots: 1, minimum: 0, maximum: 1 },
  { name: "total-heap-argv", options: "", args: ["--max-heap-size=512"], boots: 1, minimum: 0, maximum: 1 },
  { name: "total-heap-argv-underscore", options: "", args: ["--max_heap_size=512"], boots: 1, minimum: 0, maximum: 1 },
  { name: "quoted-title", options: '--title="contains --max-old-space-size=512"', args: [], boots: 2, minimum: 16, maximum: 17 },
];
for (const owner of owners) {
  test(`verify preserves its native startup heap: ${owner.name}`, { timeout }, ({ scratch, repoRoot }) => {
    const output = join(scratch, "heap.json");
    const preload = join(scratch, "observe.mjs");
    const boots = join(scratch, "boots.jsonl");
    const cli = join(repoRoot, "tooling/src/verify/cli.ts");
    writeFileSync(
      preload,
      `import {registerHooks} from 'node:module';import {writeFileSync,appendFileSync} from 'node:fs';import {getHeapStatistics} from 'node:v8';
appendFileSync(${JSON.stringify(boots)},JSON.stringify(process.pid)+'\\n');
registerHooks({resolve(specifier,context,next){if(context.parentURL===${JSON.stringify(pathToFileURL(cli).href)}&&specifier==='./index.ts')writeFileSync(${JSON.stringify(output)},JSON.stringify({heap:getHeapStatistics().heap_size_limit,options:process.env.NODE_OPTIONS??'',argv:process.argv,pid:process.pid}));return next(specifier,context);}});`,
    );
    const result = runNicedSync(process.execPath, [...owner.args, "--import", preload, cli, "structure", "--help"], {
      cwd: repoRoot,
      env: inheritedProcessEnv({ [NODE_OPTIONS]: owner.options }),
      timeout,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("structure");
    const captured = record.parse(JSON.parse(readFileSync(output, "utf8")));
    const starts = readFileSync(boots, "utf8")
      .trim()
      .split("\n")
      .map((line) => z.number().parse(JSON.parse(line)));
    expect(new Set(starts)).toEqual(new Set([captured.pid]));
    expect(starts).toHaveLength(owner.boots);
    expect(captured.argv.slice(1)).toEqual([cli, "structure", "--help"]);
    expect(captured.heap).toBeGreaterThan(owner.minimum * 1024 ** 3);
    expect(captured.heap).toBeLessThan(owner.maximum * 1024 ** 3);
    expect(captured.options).toContain(owner.options);
  });
}

test("a missing-heap verify reexec preserves native termination", { timeout }, ({ scratch, repoRoot }) => {
  const preload = join(scratch, "terminate.mjs");
  const cli = join(repoRoot, "tooling/src/verify/cli.ts");
  writeFileSync(
    preload,
    `import {registerHooks} from 'node:module';import {getHeapStatistics} from 'node:v8';registerHooks({resolve(specifier,context,next){if(context.parentURL===${JSON.stringify(pathToFileURL(cli).href)}&&specifier==='./index.ts'){process.stderr.write('effective heap='+getHeapStatistics().heap_size_limit);process.kill(process.pid,'SIGTERM');}return next(specifier,context);}});`,
  );
  const result = runNicedSync(process.execPath, ["--import", preload, cli, "structure", "--help"], {
    cwd: repoRoot,
    env: inheritedProcessEnv({ [NODE_OPTIONS]: "" }),
    timeout,
  });
  expect(result.status).toBeNull();
  expect(result).toMatchObject({ signal: "SIGTERM" });
  const effective = Number(/effective heap=(\d+)/u.exec(result.stderr)?.[1]);
  expect(effective).toBeGreaterThan(16 * 1024 ** 3);
});

test("missing native execve refuses only a missing heap", { timeout }, ({ scratch, repoRoot }) => {
  const preload = join(scratch, "unsupported.mjs");
  writeFileSync(preload, "process.execve=undefined;");
  for (const [options, status, error] of [
    ["", 2, "NODE_OPTIONS"],
    ["--max-old-space-size=512", 0, ""],
  ] as const) {
    const result = runNicedSync(process.execPath, ["--import", preload, join(repoRoot, "tooling/src/verify/cli.ts"), "structure", "--help"], {
      cwd: repoRoot,
      env: inheritedProcessEnv({ [NODE_OPTIONS]: options }),
      timeout,
    });
    expect(result.status, result.stderr).toBe(status);
    expect(result.stderr).toContain(error);
  }
});
