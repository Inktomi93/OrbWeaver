import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { execPath } from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { COMPOSED_ENV_REFUSAL } from "../../scripts/probes/_composed-env.ts";
import { scaledBudget } from "./_load-budget.ts";

const ENV_KEY = "ORB_ENV_NO_FILE";
const GUARD = "scripts/probes/_composed-env.ts";
const PROBES = "scripts/probes";
const COMPOSE_ROOT = "@orb/server/entry/compose";
const CACHING_ENTRY = "scripts/probes/caching/run.ts";
const FUNDING_ENTRY = "scripts/probes/composed-chat-funding.ts";
const CHILD_BASE_MS = 90_000;
const CHILD_TIMEOUT_MS = scaledBudget(CHILD_BASE_MS);

/** Run node in `cwd` whose `.env` declares the key, with the key unset in the child's own environment. */
function runBesideEnvFile(cwd: string, args: readonly string[]): SpawnSyncReturns<string> {
  writeFileSync(join(cwd, ".env"), `${ENV_KEY}=1\n`);
  return spawnSync("env", ["-u", ENV_KEY, execPath, ...args], { cwd, encoding: "utf8", timeout: CHILD_TIMEOUT_MS });
}

test("a .env that declares ORB_ENV_NO_FILE does not admit a composed probe", { timeout: CHILD_TIMEOUT_MS * 3 }, ({ scratch, repoRoot }) => {
  const caching = runBesideEnvFile(scratch, [join(repoRoot, CACHING_ENTRY), "--report"]);
  expect(caching.stderr).toContain(COMPOSED_ENV_REFUSAL);
  expect(caching.status).not.toBe(0);

  const funding = pathToFileURL(join(repoRoot, FUNDING_ENTRY)).href;
  const imported = runBesideEnvFile(scratch, ["--input-type=module", "--eval", `await import(${JSON.stringify(funding)});`]);
  expect(imported.stderr).toContain(COMPOSED_ENV_REFUSAL);
  expect(imported.status).not.toBe(0);
});

/** A relative specifier as a repo path; a package or builtin specifier as written. */
function loadedPath(repoRoot: string, fromDir: string, specifier: string): string {
  return specifier.startsWith(".") ? relative(repoRoot, resolve(fromDir, specifier)) : specifier;
}

/** What a probe module loads when it runs: value imports, re-exports and literal dynamic imports. */
function runtimeImports(file: SourceFile, repoRoot: string): readonly string[] {
  const dynamic = file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => call.getExpression().getKind() === SyntaxKind.ImportKeyword)
    .map((call) => call.getArguments()[0])
    .filter((arg) => Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg))
    .map((arg) => arg.getLiteralValue());
  const specifiers = [
    ...file.getImportDeclarations().flatMap((declaration) => (declaration.isTypeOnly() ? [] : [declaration.getModuleSpecifierValue()])),
    ...file.getExportDeclarations().flatMap((declaration) => declaration.getModuleSpecifierValue() ?? []),
    ...dynamic,
  ];
  return specifiers.map((specifier) => loadedPath(repoRoot, dirname(file.getFilePath()), specifier));
}

/** The probes that compose the server graph and can run first: each module that loads the compose root, and each probe no
 *  other probe imports that reaches one through its imports. A module another probe imports runs after that importer's guard. */
function composedEntries(repoRoot: string): readonly string[] {
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  const files = project.addSourceFilesAtPaths(join(repoRoot, PROBES, "**/*.ts"));
  const imports = new Map(files.map((file) => [relative(repoRoot, file.getFilePath()), runtimeImports(file, repoRoot)]));
  const composers = new Set([...imports].filter(([, loaded]) => loaded.includes(COMPOSE_ROOT)).map(([path]) => path));
  const reaching = new Set(composers);
  for (let grew = true; grew; ) {
    const added = [...imports].filter(([path, loaded]) => !reaching.has(path) && loaded.some((target) => reaching.has(target))).map(([path]) => path);
    for (const path of added) {
      reaching.add(path);
    }
    grew = added.length > 0;
  }
  const imported = new Set([...imports.values()].flat());
  return [...reaching].filter((path) => composers.has(path) || !imported.has(path)).sort();
}

// Modules evaluate in import order, so only a first import runs before the server env loader can.
test("every composed probe entry imports the process-env guard first", ({ repoRoot }) => {
  const entries = composedEntries(repoRoot);
  expect(entries).toEqual(expect.arrayContaining([CACHING_ENTRY, FUNDING_ENTRY]));
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });
  const first = entries.map((entry) => {
    const specifier = project.addSourceFileAtPath(join(repoRoot, entry)).getImportDeclarations()[0]?.getModuleSpecifierValue() ?? "";
    return [entry, loadedPath(repoRoot, join(repoRoot, dirname(entry)), specifier)];
  });
  expect(first).toEqual(entries.map((entry) => [entry, GUARD]));
});
