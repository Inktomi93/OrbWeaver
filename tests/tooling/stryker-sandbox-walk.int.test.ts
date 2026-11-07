// Pins the installed core patch: Stryker's node_modules walk consults no option but `tempDirName`, so unfenced it links
// a sibling worktree's modules into the run, and a worktree swept mid-walk kills node before the first mutant.
// Retires when the walk honors `basePath`.
import fs, { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { vi } from "vitest";

type FindNodeModulesList = (basePath: string, tempDirName?: string) => Promise<string[]>;

const require = createRequire(import.meta.url);
const STRYKER_CORE_ROOT = dirname(require.resolve("@stryker-mutator/core/package.json"));
const FILE_UTILS = join(STRYKER_CORE_ROOT, "dist", "src", "utils", "file-utils.js");

const mod = (await import(pathToFileURL(FILE_UTILS).href)) as { readonly fileUtils: { readonly findNodeModulesList: FindNodeModulesList } };
const { findNodeModulesList } = mod.fileUtils;

function plantWorkspace(root: string): void {
  // The shape the fence exists for: a lane worktree with a full node_modules, inside the repo root.
  mkdirSync(join(root, ".claude", "worktrees", "agent-deadbeef", "node_modules", "left-pad"), { recursive: true });
  mkdirSync(join(root, ".claude", "worktrees", "agent-deadbeef", "packages", "kit", "node_modules"), { recursive: true });
  // The trees the sandbox needs, so "found nothing" cannot pass as fenced.
  mkdirSync(join(root, "node_modules", ".pnpm"), { recursive: true });
  mkdirSync(join(root, "packages", "kit", "node_modules"), { recursive: true });
}

function failReaddirOf(path: string, code: string): void {
  const real = fs.promises.readdir.bind(fs.promises) as (...args: readonly unknown[]) => Promise<unknown>;
  vi.spyOn(fs.promises, "readdir").mockImplementation(((target: string, options: unknown) =>
    target === path ? Promise.reject(Object.assign(new Error(code), { code })) : real(target, options)) as typeof fs.promises.readdir);
}

test("the walk skips agent worktrees and still finds real workspace node_modules", async ({ scratch }) => {
  plantWorkspace(scratch);
  const found = await findNodeModulesList(scratch, ".stryker-tmp");
  expect(found.toSorted()).toEqual(["node_modules", join("packages", "kit", "node_modules")].toSorted());
});

test("a directory swept mid-walk is skipped, and the rest of the walk still lands", async ({ scratch }) => {
  plantWorkspace(scratch);
  mkdirSync(join(scratch, "swept"));
  failReaddirOf(join(scratch, "swept"), "ENOENT");
  expect(await findNodeModulesList(scratch, ".stryker-tmp")).toContain("node_modules");
});

test("any other readdir failure still throws", async ({ scratch }) => {
  plantWorkspace(scratch);
  mkdirSync(join(scratch, "locked"));
  failReaddirOf(join(scratch, "locked"), "EACCES");
  await expect(findNodeModulesList(scratch, ".stryker-tmp")).rejects.toThrow("EACCES");
});
