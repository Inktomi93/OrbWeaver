// The exit-honesty runner's behavioral pins — each arm spawns a REAL node child over a scratch main:
// the crash-collision control (bare node crash exits 1 — the verdict collision runTool exists to kill),
// crash→toolError(2), UsageError→misuse(3), verdict passthrough, and never-downgrade (a set verdict
// survives a later crash as 2, not 1).
import process from "node:process";
import { pathToFileURL } from "node:url";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { expect, test } from "../../support/tool-fixtures.ts";

const RUN_TOOL_URL = pathToFileURL(new URL("../../../tooling/src/_shared/run-tool.ts", import.meta.url).pathname).href;

function script(body: string): string {
  return `import { runTool, UsageError } from ${JSON.stringify(RUN_TOOL_URL)};\n${body}\n`;
}

async function runScratch(plantedTree: (files: Record<string, string>) => Promise<string>, body: string): Promise<{ code: number | null; stderr: string }> {
  const root = await plantedTree({ "main.ts": body });
  const res = await spawnNiced(process.execPath, [`${root}/main.ts`]);
  return { code: res.code, stderr: res.stderr };
}

test("CONTROL: a bare node crash exits 1 — indistinguishable from a violations verdict (the collision)", async ({ plantedTree }) => {
  const res = await runScratch(plantedTree, 'throw new Error("boom");');
  expect(res.code).toBe(1);
});

test("a crash under runTool exits toolError (2), never a verdict", async ({ plantedTree }) => {
  const res = await runScratch(plantedTree, script('await runTool(() => { throw new Error("boom"); });'));
  expect(res.code).toBe(EXIT.toolError);
  expect(res.stderr).toContain("TOOL ERROR");
});

test("an async crash (unhandled rejection) under runTool exits toolError (2)", async ({ plantedTree }) => {
  const res = await runScratch(
    plantedTree,
    script('await runTool(async () => { void Promise.reject(new Error("late")); await new Promise((r) => setTimeout(r, 50)); return 0; });'),
  );
  expect(res.code).toBe(EXIT.toolError);
});

test("UsageError maps to misuse (3) with the message on stderr", async ({ plantedTree }) => {
  const res = await runScratch(plantedTree, script('await runTool(() => { throw new UsageError("--frob requires a value"); });'));
  expect(res.code).toBe(EXIT.misuse);
  expect(res.stderr).toContain("--frob requires a value");
});

test("a returned verdict passes through and the loop drains (no hard exit on the verdict path)", async ({ plantedTree }) => {
  const res = await runScratch(plantedTree, script("await runTool(() => 1);"));
  expect(res.code).toBe(EXIT.violations);
});

test("NEVER-DOWNGRADE: a violations verdict already set survives a late crash as toolError, not clean", async ({ plantedTree }) => {
  const res = await runScratch(plantedTree, script('await runTool(() => { process.exitCode = 1; throw new Error("epilogue blew up"); });'));
  expect(res.code).toBe(EXIT.toolError);
});
