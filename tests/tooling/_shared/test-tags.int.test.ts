import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { classifyTestFilename, runtimeForTestFamily, TEST_KIND_DEFINITIONS } from "@orb/tooling/_shared/test-kinds";
import { descendantsOfKind, getWorkspace } from "@orb/tooling/_shared/ts-workspace";
import { TYPE_CONFIG_EXCLUDES } from "@orb/tooling/_shared/type-config-intent";
import type { SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { testTagFilters } from "../../../vitest.config.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const TEST_FILE = "tagged.test.js";
const VITEST_RUNTIME_KINDS = TEST_KIND_DEFINITIONS.filter(({ family }) => runtimeForTestFamily(family) === "vitest");

function vitestRuntimeGlobs(root: string): readonly string[] {
  return [...VITEST_RUNTIME_KINDS.map(({ suffix }) => `${root}/tests/**/*${suffix}`), ...TYPE_CONFIG_EXCLUDES.map((pattern) => `!${root}/${pattern}`)];
}

function isVitestRuntimeModule(sourceFile: SourceFile): boolean {
  const classified = classifyTestFilename(sourceFile.getBaseName());
  return classified !== undefined && runtimeForTestFamily(classified.definition.family) === "vitest";
}

function writeHarness(root: string, repoRoot: string, tag = "slow"): void {
  const registry = pathToFileURL(join(repoRoot, "tooling/src/_shared/test-tags.ts")).href;
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

function processChdirCalls(sourceFile: SourceFile): number {
  const processNames = new Set(["process"]);
  const chdirNames = new Set<string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== "node:process") {
      continue;
    }
    const defaultImport = declaration.getDefaultImport();
    const namespaceImport = declaration.getNamespaceImport();
    if (defaultImport !== undefined) {
      processNames.add(defaultImport.getText());
    }
    if (namespaceImport !== undefined) {
      processNames.add(namespaceImport.getText());
    }
    for (const namedImport of declaration.getNamedImports()) {
      if (namedImport.getName() === "chdir") {
        chdirNames.add(namedImport.getAliasNode()?.getText() ?? "chdir");
      }
    }
  }

  return descendantsOfKind(sourceFile, SyntaxKind.CallExpression).filter((call) => {
    const expression = call.getExpression();
    if (Node.isIdentifier(expression)) {
      return chdirNames.has(expression.getText());
    }
    if (Node.isPropertyAccessExpression(expression)) {
      return expression.getName() === "chdir" && Node.isIdentifier(expression.getExpression()) && processNames.has(expression.getExpression().getText());
    }
    if (!(Node.isElementAccessExpression(expression) && Node.isIdentifier(expression.getExpression()))) {
      return false;
    }
    const argument = expression.getArgumentExpression();
    return processNames.has(expression.getExpression().getText()) && Node.isStringLiteral(argument) && argument.getLiteralText() === "chdir";
  }).length;
}

function hasModuleTag(sourceFile: SourceFile, tag: string): boolean {
  const source = sourceFile.getFullText();
  const end = source.startsWith("/**") ? source.indexOf("*/") : -1;
  return end >= 0 && new RegExp(`^\\s*\\*\\s*@module-tag\\s+${tag}\\s*$`, "mu").test(source.slice(0, end));
}

function directProcessChdirModules(sourceFiles: readonly SourceFile[]): readonly SourceFile[] {
  return sourceFiles.filter((sourceFile) => isVitestRuntimeModule(sourceFile) && processChdirCalls(sourceFile) > 0);
}

function unregisteredProcessChdirModules(directModules: readonly SourceFile[]): readonly string[] {
  return directModules
    .filter((sourceFile) => !hasModuleTag(sourceFile, "requires-process-chdir"))
    .map((sourceFile) => sourceFile.getFilePath())
    .toSorted();
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
  const result = run(scratch);
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

test("every test module that directly invokes process.chdir registers the worker-thread capability", ({ repoRoot }) => {
  const sourceFiles = getWorkspace({ root: repoRoot, globs: vitestRuntimeGlobs(repoRoot) }).getSourceFiles();
  const directModules = directProcessChdirModules(sourceFiles);

  expect(directModules.length).toBeGreaterThan(0);
  expect(unregisteredProcessChdirModules(directModules)).toEqual([]);
});

// The `__g_*` transient-namespace exclusion retired at #2176 Phase F (2026-09-14,
// type-config-intent.ts:80-86): its only producer was the LEGACY gate self-test materializing `__g_`
// files inside the real tree for the length of its own child run, and that planter retired with the
// legacy runtime. A `__g_`-prefixed module under tests/ is now an ORDINARY module with no special
// census treatment — this pins that both a plain module and a `__g_`-prefixed one register alike.
test("the runtime census includes both an ordinary and a __g_-prefixed module — the transient namespace has no producer anymore", ({ scratch }) => {
  const dir = join(scratch, "tests", "tooling");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "new.test.ts"), 'process.chdir("/tmp");\n');
  writeFileSync(join(dir, "__g_transient.test.ts"), 'process.chdir("/tmp");\n');

  const sourceFiles = getWorkspace({ root: scratch, globs: vitestRuntimeGlobs(scratch) }).getSourceFiles();
  expect(sourceFiles.map((sourceFile) => sourceFile.getBaseName()).toSorted()).toEqual(["__g_transient.test.ts", "new.test.ts"]);
  expect(unregisteredProcessChdirModules(directProcessChdirModules(sourceFiles)).toSorted()).toEqual(
    [join(dir, "__g_transient.test.ts"), join(dir, "new.test.ts")].toSorted(),
  );
});

test("the process.chdir census rejects an unregistered direct call, including an aliased node:process import", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const missing = project.createSourceFile(
    "/missing.test.ts",
    'import runtimeProcess from "node:process";\ntest("moves", () => runtimeProcess.chdir("/tmp"));\n',
  );
  const registered = project.createSourceFile(
    "/registered.test.ts",
    '/**\n * @module-tag requires-process-chdir\n */\nimport process from "node:process";\ntest("moves", () => process.chdir("/tmp"));\n',
  );
  const tooling = project.createSourceFile("/tests/tooling/untagged.test.ts", 'process.chdir("/tmp");\n');
  const repository = project.createSourceFile("/tests/tooling/untagged.repo.int.test.ts", 'process.chdir("/tmp");\n');
  const component = project.createSourceFile("/nonapplicable.ct.tsx", 'process.chdir("/tmp");\n');
  const typeOnly = project.createSourceFile("/nonapplicable.test-d.ts", 'process.chdir("/tmp");\n');

  expect(unregisteredProcessChdirModules(directProcessChdirModules([missing, registered, tooling, repository, component, typeOnly]))).toEqual([
    "/missing.test.ts",
    "/tests/tooling/untagged.repo.int.test.ts",
    "/tests/tooling/untagged.test.ts",
  ]);
});

test("the native thread runner skips a process.chdir module while executing an ordinary module", ({ repoRoot, scratch }) => {
  const registry = pathToFileURL(join(repoRoot, "tooling/src/_shared/test-tags.ts")).href;
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
