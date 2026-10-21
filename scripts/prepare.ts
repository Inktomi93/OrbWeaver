#!/usr/bin/env node
// Prepare editor declarations from a source checkout; manifest-only Docker installs preserve the deps cache.
// Git hooks belong to the main checkout, while every source checkout needs its own declaration output.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const hasGit = existsSync(join(root, ".git"));
const routerConfig = join(root, "packages/server/tsconfig.router.json");
if (!(hasGit || existsSync(routerConfig))) {
  console.log("manifest-only install: no server compiler inputs or .git. Skipping declarations and lefthook.");
  process.exit(0);
}

const declarations = spawnSync(process.execPath, [join(root, "node_modules/@typescript/native/bin/tsc"), "--project", routerConfig], { stdio: "inherit" });
if (declarations.error !== undefined) {
  throw declarations.error;
}
if (declarations.signal !== null) {
  console.error(`router declaration compiler terminated by signal ${declarations.signal}`);
  process.exit(1);
}
if (declarations.status !== 0) {
  process.exit(declarations.status ?? 1);
}

// pnpm runs `prepare` with the package root as cwd, and cwd is also where lefthook looks for the repository.
// `.git` is a directory in a clone and a file in a linked worktree or submodule; both count.
if (!hasGit) {
  // Messages carry no "prepare:" prefix: pnpm already labels every lifecycle output line with the script name.
  console.log("no .git here (a source archive, not a clone), so there are no git hooks to install. Skipping lefthook.");
  process.exit(0);
}

// A linked worktree shares the main checkout's `.git/hooks`, and `lefthook install` bakes this checkout's
// absolute lefthook path into them, so a disposable lane would own every checkout's hooks until it is removed.
// The hooks already run a worktree's own lefthook.yml; only the main checkout installs them.
// Imported here, past the no-.git exit, so a source archive never loads the tooling tree.
const { runGit } = await import("../tooling/src/floor/git/git.ts");
const gitDirs = runGit(process.cwd(), ["rev-parse", "--git-dir", "--git-common-dir"]).stdout.trim().split(/\r?\n/u);
if (gitDirs.length === 2 && resolve(gitDirs[0] ?? "") !== resolve(gitDirs[1] ?? "")) {
  console.log("linked worktree: the main checkout owns the shared git hooks. Skipping lefthook install.");
  process.exit(0);
}

// lefthook's own JS entry under this node: no PATH lookup, and no `.cmd` shim that Windows cannot spawn shell-less.
const lefthookEntry = createRequire(import.meta.url).resolve("lefthook");
const result = spawnSync(process.execPath, [lefthookEntry, "install", "--force"], { stdio: "inherit" });
if (result.error !== undefined) {
  console.error(`failed to start lefthook: ${result.error.message}`);
  process.exit(1);
}
if (result.signal !== null) {
  console.error(`lefthook terminated by signal ${result.signal}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
