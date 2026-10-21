// @subject tooling/src/floor/process/node-heap.ts
// @subject scripts/ts7.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { z } from "zod";
import { WORKSPACE_HEAP_FLOOR_MB } from "../../../../tooling/src/codemod/lib/heap-floor.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { inheritedProcessEnv } from "../../../../tooling/src/floor/process/process-env.ts";
import { scaledBudget } from "../../_load-budget.ts";

const timeout = scaledBudget(30_000);
const NODE_OPTIONS = "NODE_OPTIONS";
const PNPM_NODE_OPTIONS = "PNPM_CONFIG_NODE_OPTIONS";
const observedHeap = z.object({ heapMiB: z.number(), options: z.string() });
const cases = [
  { name: "default", options: "", config: "", argv: [], heapMiB: WORKSPACE_HEAP_FLOOR_MB },
  { name: "environment override", options: "--max-old-space-size=512", config: "", argv: [], heapMiB: 512 },
  { name: "argv override", options: "--max-old-space-size=768", config: "", argv: ["--max_old_space_size=512"], heapMiB: 512 },
  { name: "pnpm config override", options: "", config: "--max-old-space-size=512", argv: [], heapMiB: 512 },
] as const;

for (const owner of ["tool entry", "compiler child"] as const) {
  test.for(cases)(`${owner} uses the shared heap policy: $name`, { timeout }, (control, { scratch, repoRoot }) => {
    const output = join(scratch, "observed.json");
    const observe = `writeFileSync(${JSON.stringify(output)},JSON.stringify({heapMiB:getHeapStatistics().heap_size_limit/1048576,options:process.env.NODE_OPTIONS??""}));`;
    const options: string[] = [control.options, "--conditions=heap-policy-control"];
    let entry: string;
    let args: readonly string[];
    if (owner === "tool entry") {
      entry = join(scratch, "entry.mjs");
      writeFileSync(
        entry,
        `import {writeFileSync} from "node:fs";import {getHeapStatistics} from "node:v8";
import {runTool} from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/floor/cli/run-tool.ts")).href)};
await runTool(()=>{${observe}return 0;});`,
      );
      args = [];
    } else {
      entry = join(repoRoot, "scripts/ts7.ts");
      args = ["--version"];
      const preload = join(scratch, "observe.cjs");
      writeFileSync(
        preload,
        `const {writeFileSync}=require("node:fs");const {getHeapStatistics}=require("node:v8");
if(process.argv[1]===${JSON.stringify(join(repoRoot, "node_modules/ts7/bin/tsc"))}){${observe}}`,
      );
      options.push(`--require=${JSON.stringify(preload)}`);
    }
    const result = runNicedSync(process.execPath, [...control.argv, entry, ...args], {
      cwd: repoRoot,
      env: inheritedProcessEnv({ [NODE_OPTIONS]: options.filter(Boolean).join(" "), [PNPM_NODE_OPTIONS]: control.config }),
      timeout,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(owner === "compiler child" ? /Version \d/u : /^$/u);
    const observed = observedHeap.parse(JSON.parse(readFileSync(output, "utf8")));
    expect(observed.heapMiB).toBeGreaterThanOrEqual(control.heapMiB);
    expect(observed.heapMiB).toBeLessThan(control.heapMiB + 128);
    expect(observed.options).toContain("--conditions=heap-policy-control");
  });
}
