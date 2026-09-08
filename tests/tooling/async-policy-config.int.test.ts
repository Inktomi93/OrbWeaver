// The executed config proof for #730. This drives the real flat ESLint config through a real TS project
// service file; inspecting the option object alone would be a green that cannot prove the rule sees Promises.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { ESLint } from "eslint";
import { expect, test } from "../support/tool-fixtures.ts";

const FLOATING_RULE = "@typescript-eslint/no-floating-promises";

test("async policy: raw void cannot own a rejecting Promise while await/catch/supervision do", async ({ scratch }) => {
  const repoRoot = process.cwd();
  const fixtureRoot = join(scratch, "packages/server/src/foundation/async-policy");
  mkdirSync(fixtureRoot, { recursive: true });
  const fixtures = {
    raw: 'async function rejectingPromise(): Promise<void> { throw new Error("boom"); }\nexport function start(): void { void rejectingPromise(); }\n',
    awaited:
      'async function rejectingPromise(): Promise<void> { throw new Error("boom"); }\nexport async function start(): Promise<void> { await rejectingPromise(); }\n',
    caught:
      'async function rejectingPromise(): Promise<void> { throw new Error("boom"); }\nexport function start(): void { rejectingPromise().catch((_error: unknown) => undefined); }\n',
    supervised:
      'declare function superviseDetached(operation: () => Promise<void>): void;\nasync function rejectingPromise(): Promise<void> { throw new Error("boom"); }\nexport function start(): void { superviseDetached(rejectingPromise); }\n',
  } as const;
  for (const [name, source] of Object.entries(fixtures)) {
    writeFileSync(join(fixtureRoot, `${name}.ts`), source);
  }
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "nodenext", moduleResolution: "nodenext", noEmit: true, strict: true, target: "es2022" },
      include: ["packages/server/src/**/*.ts"],
    }),
  );
  const productionConfigUrl = pathToFileURL(join(repoRoot, "eslint.config.js")).href;
  writeFileSync(
    join(scratch, "eslint.config.mjs"),
    `import production from ${JSON.stringify(productionConfigUrl)};\nexport default [...production, { files: ["packages/server/src/**/*.ts"], languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: ${JSON.stringify(scratch)} } } }];\n`,
  );
  const eslint = new ESLint({ cwd: scratch, overrideConfigFile: join(scratch, "eslint.config.mjs") });
  const results = await eslint.lintFiles(Object.keys(fixtures).map((name) => join(fixtureRoot, `${name}.ts`)));
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
