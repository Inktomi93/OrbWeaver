// What a doc write test observes of a fixture checkout: what git sees, the bytes on disk and the file times.
// A write that failed and put its files back must read the same as before it ran.

import { existsSync, readFileSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit } from "../../../tooling/src/floor/git/git-fixture.ts";

const LONG_AGO = new Date("2001-01-01T00:00:00Z");

function git(root: string, ...args: readonly string[]): string {
  return execFixtureGit(root, args).trim();
}

/** Every tracked or untracked file that exists on disk, ignored files left out. */
function checkoutFiles(root: string): readonly string[] {
  return execFixtureGit(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    .split("\0")
    .filter((path) => path !== "" && existsSync(join(root, path)));
}

/** HEAD, the staged and unstaged state, and the bytes of every file in the checkout. */
export function checkoutState(root: string): string {
  const bytes = checkoutFiles(root).map((path) => `${path}\n${readFileSync(join(root, path), "utf8")}`);
  return [
    git(root, "rev-parse", "HEAD"),
    git(root, "status", "--porcelain", "--untracked-files=all"),
    git(root, "diff", "--cached", "--name-status"),
    ...bytes,
  ].join("\n---\n");
}

/** Set every file's modification time far in the past, so any later write moves it. */
export function pinFileTimes(root: string): void {
  for (const path of checkoutFiles(root)) {
    utimesSync(join(root, path), LONG_AGO, LONG_AGO);
  }
}

/** The modification time of every file in the checkout: unchanged exactly when nothing was written. */
export function fileTimes(root: string): string {
  return checkoutFiles(root)
    .map((path) => `${path} ${String(statSync(join(root, path)).mtimeMs)}`)
    .join("\n");
}
