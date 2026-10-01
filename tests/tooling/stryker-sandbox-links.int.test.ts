// Sandbox dependency links must avoid original package-local paths while workspace imports stay instrumented.
import { spawnSync } from "node:child_process";
import { mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

interface SandboxLinker {
  workingDirectory: string;
  linkNodeModulesEntries: (basePath: string, realDir: string, sandboxDir: string) => Promise<void>;
}

const require = createRequire(import.meta.url);
const CHILD_TIMEOUT_BASE_MS = 10_000;
const STRYKER_CORE_ROOT = dirname(require.resolve("@stryker-mutator/core/package.json"));
const mod: Record<"Sandbox", { readonly prototype: SandboxLinker }> = await import(pathToFileURL(join(STRYKER_CORE_ROOT, "dist/src/sandbox/sandbox.js")).href);

test("package dependency links load under sandbox read grants and workspace imports stay inside the sandbox", async ({ scratch: root }) => {
  const sandbox = join(root, ".stryker-tmp", "sandbox");
  const store = join(root, "node_modules", ".pnpm", "dependency", "node_modules", "dependency");
  const packageModules = join(root, "packages", "kit", "node_modules");
  const scopedModules = join(packageModules, "@orb");
  const sandboxModules = join(sandbox, "packages", "kit", "node_modules");
  const workspace = join(root, "packages", "contracts");
  const sandboxWorkspace = join(sandbox, "packages", "contracts");
  await Promise.all([store, scopedModules, workspace, sandboxWorkspace].map((directory) => mkdir(directory, { recursive: true })));
  await writeFile(join(store, "index.mjs"), 'export default "dependency";');
  await writeFile(join(workspace, "index.mjs"), 'export default "original";');
  await writeFile(join(sandboxWorkspace, "index.mjs"), 'export default "instrumented";');
  await symlink(store, join(packageModules, "dependency"), "junction");
  await symlink(workspace, join(scopedModules, "contracts"), "junction");
  const linker = Object.create(mod.Sandbox.prototype) as SandboxLinker;
  linker.workingDirectory = sandbox;
  await linker.linkNodeModulesEntries(root, join(root, "node_modules"), join(sandbox, "node_modules"));
  await linker.linkNodeModulesEntries(root, packageModules, sandboxModules);

  const dependencyLink = join(sandboxModules, "dependency");
  expect(await realpath(dependencyLink)).toBe(await realpath(join(sandbox, "node_modules", ".pnpm", "dependency", "node_modules", "dependency")));
  expect(await realpath(join(sandboxModules, "@orb", "contracts"))).toBe(sandboxWorkspace);
  await writeFile(join(store, "index.mjs"), 'export default "changed original";');
  expect(await readFile(join(dependencyLink, "index.mjs"), "utf8")).toBe('export default "dependency";');
  const result = spawnSync(
    process.execPath,
    [
      "--permission",
      `--allow-fs-read=${join(sandbox, "packages")}`,
      `--allow-fs-read=${join(sandbox, "node_modules")}`,
      "--input-type=module",
      "--eval",
      `const dependency = await import(${JSON.stringify(pathToFileURL(join(dependencyLink, "index.mjs")).href)}); const workspace = await import(${JSON.stringify(pathToFileURL(join(sandboxModules, "@orb", "contracts", "index.mjs")).href)}); console.log(JSON.stringify([dependency.default, workspace.default]));`,
    ],
    { encoding: "utf8", env: {}, timeout: scaledBudget(CHILD_TIMEOUT_BASE_MS) },
  );
  expect({ status: result.status, stderr: result.stderr, error: result.error?.message }).toEqual({ status: 0, stderr: "", error: undefined });
  expect(JSON.parse(result.stdout)).toEqual(["dependency", "instrumented"]);
});

test("the copied pnpm store retains relative links and relocates absolute junctions", async ({ scratch: root }) => {
  const sandbox = join(root, "sandbox");
  const store = join(root, "node_modules", ".pnpm");
  const target = join(store, "target", "node_modules", "target");
  const parent = join(store, "dependent", "node_modules");
  await Promise.all([target, parent].map((directory) => mkdir(directory, { recursive: true })));
  await writeFile(join(target, "index.mjs"), 'export default "transitive";');
  await symlink(relative(parent, target), join(parent, "relative"), "junction");
  await symlink(target, join(parent, "absolute"), "junction");
  const linker = Object.create(mod.Sandbox.prototype) as SandboxLinker;
  linker.workingDirectory = sandbox;
  await linker.linkNodeModulesEntries(root, join(root, "node_modules"), join(sandbox, "node_modules"));
  const sandboxStore = join(sandbox, "node_modules", ".pnpm");
  const sandboxTarget = await realpath(join(sandboxStore, "target", "node_modules", "target"));
  for (const name of ["relative", "absolute"]) {
    expect(await realpath(join(sandboxStore, "dependent", "node_modules", name))).toBe(sandboxTarget);
  }
});
