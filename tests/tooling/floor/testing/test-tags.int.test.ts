import { existsSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { testTagFilters } from "../../../../vitest.config.ts";

const TEST_FILE = "tagged.test.js";
function writeHarness(root: string, repoRoot: string, tag = "slow"): void {
  const registry = pathToFileURL(join(repoRoot, "tooling/src/floor/testing/test-tags.ts")).href;
  writeFileSync(join(root, "package.json"), '{"name":"vitest-tag-control","private":true,"type":"module"}\n');
  writeFileSync(
    join(root, "vitest.config.ts"),
    `import { TEST_TAGS } from ${JSON.stringify(registry)};\nexport default { test: { include: [${JSON.stringify(TEST_FILE)}], testTimeout: 5, reporters: [], tags: [...TEST_TAGS], strictTags: true } };\n`,
  );
  writeFileSync(
    join(root, TEST_FILE),
    `import { writeFileSync } from "node:fs";\nimport { join } from "node:path";\nimport { test } from "vitest";\ntest("slow", { tags: ${JSON.stringify(tag)} }, async () => { await new Promise((resolve) => setTimeout(resolve, 30)); writeFileSync(join(import.meta.dirname, "slow-ran"), "yes"); });\ntest("normal", () => { writeFileSync(join(import.meta.dirname, "normal-ran"), "yes"); });\n`,
  );
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
}

function run(root: string, ...args: readonly string[]): ReturnType<typeof runNicedSync> {
  return runNicedSync("pnpm", ["exec", "vitest", "run", "--config", "vitest.config.ts", ...args], { cwd: root });
}

test("the native runner applies the configured slow timeout and positive tag filter", ({ repoRoot, scratch }) => {
  writeHarness(scratch, repoRoot);
  const result = run(scratch, "--tagsFilter=slow");
  expect(result.status).toBe(0);
  expect(existsSync(join(scratch, "slow-ran"))).toBe(true);
  expect(existsSync(join(scratch, "normal-ran"))).toBe(false);
});

test("the native runner supports negative tag filtering", ({ repoRoot, scratch }) => {
  writeHarness(scratch, repoRoot);
  const result = run(scratch, "--tagsFilter=!slow");
  expect(result.status).toBe(0);
  expect(existsSync(join(scratch, "slow-ran"))).toBe(false);
  expect(existsSync(join(scratch, "normal-ran"))).toBe(true);
});

test("strictTags refuses an unknown runtime tag", ({ repoRoot, scratch }) => {
  writeHarness(scratch, repoRoot, "slwo");
  const result = run(scratch, "--reporter=default");
  expect(result.status).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toContain("slwo");
});

test("existing opt-in flags remove only their corresponding default tag exclusion", () => {
  const flags = (...entries: ReadonlyArray<readonly [string, string]>): NodeJS.ProcessEnv => Object.fromEntries(entries);
  expect(testTagFilters({})).toEqual(["!live", "!local-model-cache"]);
  expect(testTagFilters(flags(["E2E_LIVE", "1"]))).toEqual(["!local-model-cache"]);
  expect(testTagFilters(flags(["ORB_LOCAL_LIGHT_E2E", "1"]))).toEqual(["!live"]);
  expect(testTagFilters(flags(["E2E_LIVE", "1"], ["ORB_LOCAL_LIGHT_E2E", "1"]))).toEqual([]);
});

test("the native thread runner skips a process.chdir module while executing an ordinary module", ({ repoRoot, scratch }) => {
  const registry = pathToFileURL(join(repoRoot, "tooling/src/floor/testing/test-tags.ts")).href;
  writeFileSync(join(scratch, "package.json"), '{"name":"vitest-module-tag-control","private":true,"type":"module"}\n');
  writeFileSync(
    join(scratch, "vitest.config.ts"),
    `import { TEST_TAGS } from ${JSON.stringify(registry)};\nexport default { test: { include: ["*.test.js"], pool: "threads", reporters: [], tags: [...TEST_TAGS], strictTags: true, tagsFilter: ["!requires-process-chdir"] } };\n`,
  );
  writeFileSync(
    join(scratch, "chdir.test.js"),
    '/**\n * @module-tag requires-process-chdir\n */\nimport { writeFileSync } from "node:fs";\nimport { join } from "node:path";\nimport process from "node:process";\nimport { test } from "vitest";\ntest("moves cwd", () => { writeFileSync(join(import.meta.dirname, "chdir-ran"), "yes"); process.chdir(import.meta.dirname); });\n',
  );
  writeFileSync(
    join(scratch, "ordinary.test.js"),
    'import { writeFileSync } from "node:fs";\nimport { join } from "node:path";\nimport { test } from "vitest";\ntest("runs", () => writeFileSync(join(import.meta.dirname, "ordinary-ran"), "yes"));\n',
  );
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");

  const result = run(scratch);
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(existsSync(join(scratch, "chdir-ran"))).toBe(false);
  expect(existsSync(join(scratch, "ordinary-ran"))).toBe(true);
});
