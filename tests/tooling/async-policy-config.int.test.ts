// The executed config proof for #730. This drives the real flat ESLint config through a real TS project
// service file; inspecting the option object alone would be a green that cannot prove the rule sees Promises.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { ESLint } from "eslint";
import { expect, test } from "../support/tool-fixtures.ts";

const FLOATING_RULE = "@typescript-eslint/no-floating-promises";

test("async policy: raw void cannot own a rejecting Promise while await/catch/supervision do", async () => {
  const repoRoot = process.cwd();
  // A FIXED, PERSISTENT directory — never mkdtemp, never removed. The fixtures must live under
  // `packages/server/src/**` for the type-aware rule to reach them at all (eslint.config.js's
  // TSDOC_SURFACE), but a directory that is CREATED AND REMOVED there kills every concurrent whole-tree
  // ts-morph load: `addSourceFilesAtPaths` walks descendants, and a dir that vanishes mid-walk throws
  // "Directory not found". Measured on a full `verify --push`, that one race produced two unrelated-looking
  // reds — the in-process census in `_shared/entrypoint.int.test.ts` and the spawned `pnpm ast` child in
  // `ast/cli.repo.int.test.ts`, whose empty stdout then read as a lens that found nothing.
  //
  // Churn harness, same rate, three arms: vanishing DIRECTORY 16 fail/19; a `!…/async-policy-fixture-*/**`
  // glob exclusion 14 fail/18 (ts-morph enumerates directories BEFORE applying negative patterns, so an
  // exclusion cannot help); stable directory with only the FILES coming and going 19 ok/0 fail. Hence this
  // shape. It sits inside a tier dir because `server-layout` admits only the 6 tiers + index.ts at the src
  // root; an empty dir here is invisible to git (empty dirs are untracked) and passes all 232 gates.
  const scratch = join(repoRoot, "packages/server/src/foundation/__async-policy-fixture__");
  mkdirSync(scratch, { recursive: true });
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
    // The FILES go; the DIRECTORY stays. Removing the directory is the race documented above.
    for (const name of Object.keys(fixtures)) {
      rmSync(join(scratch, `${name}.ts`), { force: true });
    }
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
