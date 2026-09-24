#!/usr/bin/env node
// The root `prepare` script: install the lefthook git hooks inside a git checkout, skip cleanly without one
// (a source archive or the container build), and keep a real lefthook failure non-zero. Node, not a shell
// conditional, because pnpm runs lifecycle scripts through `sh` on POSIX and `cmd.exe` on Windows.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";

// pnpm runs `prepare` with the package root as cwd, and cwd is also where lefthook looks for the repository.
// `.git` is a directory in a clone and a file in a linked worktree or submodule; both count.
if (!existsSync(join(process.cwd(), ".git"))) {
  // Messages carry no "prepare:" prefix: pnpm already labels every lifecycle output line with the script name.
  console.log("no .git here (a source archive, not a clone), so there are no git hooks to install. Skipping lefthook.");
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
