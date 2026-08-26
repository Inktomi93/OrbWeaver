// The executed config proof for #730. This drives the real flat ESLint config through a real TS project
// service file; inspecting the option object alone would be a green that cannot prove the rule sees Promises.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { ESLint } from "eslint";
import { expect, test } from "../support/tool-fixtures.ts";

const FLOATING_RULE = "@typescript-eslint/no-floating-promises";

test("async policy: raw void cannot own a rejecting Promise while await/catch/supervision do", async () => {
  const repoRoot = process.cwd();
  const scratch = mkdtempSync(join(repoRoot, "packages/server/src/async-policy-fixture-"));
  const fixtures = {
    raw: 'async function rejectingPromise(): Promise<void> { throw new Error("boom"); }\nexport function start(): void { void rejectingPromise(); }\n',
    awaited:
      'async function rejectingPromise(): Promise<void> { throw new Error("boom"); }\nexport async function start(): Promise<void> { await rejectingPromise(); }\n',
    caught:
      'async function rejectingPromise(): Promise<void> { throw new Error("boom"); }\nexport function start(): void { rejectingPromise().catch((_error: unknown) => undefined); }\n',
    supervised:
      'declare function superviseDetached(operation: () => Promise<void>): void;\nasync function rejectingPromise(): Promise<void> { throw new Error("boom"); }\nexport function start(): void { superviseDetached(rejectingPromise); }\n',
  } as const;
  try {
    for (const [name, source] of Object.entries(fixtures)) {
      writeFileSync(join(scratch, `${name}.ts`), source);
    }
    const eslint = new ESLint({ overrideConfigFile: join(repoRoot, "eslint.config.js") });
    const results = await eslint.lintFiles(Object.keys(fixtures).map((name) => join(scratch, `${name}.ts`)));
    const byName = new Map(
      results.map((result) => [
        result.filePath.slice(result.filePath.lastIndexOf("/") + 1, -3),
        result.messages.filter((message) => message.ruleId === FLOATING_RULE),
      ]),
    );

    expect(byName.get("raw")).toHaveLength(1);
    expect(byName.get("awaited")).toHaveLength(0);
    expect(byName.get("caught")).toHaveLength(0);
    expect(byName.get("supervised")).toHaveLength(0);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}, 15_000);

test("syntax policy: Biome does not pressure unsafe async, runner-status, or regex rewrites", () => {
  const repoRoot = process.cwd();
  const biome = JSON.parse(readFileSync(join(repoRoot, "biome.json"), "utf8")) as {
    readonly linter?: {
      readonly rules?: {
        readonly performance?: { readonly noAwaitInLoops?: string; readonly useTopLevelRegex?: string };
        readonly suspicious?: { readonly noFocusedTests?: string; readonly noSkippedTests?: string };
      };
    };
  };
  expect(biome.linter?.rules?.performance?.noAwaitInLoops).toBe("off");
  expect(biome.linter?.rules?.performance?.useTopLevelRegex).toBe("off");
  expect(biome.linter?.rules?.suspicious?.noSkippedTests).toBe("off");
  expect(biome.linter?.rules?.suspicious?.noFocusedTests).toBe("error");
});
