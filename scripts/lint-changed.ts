// ESLint over exactly the files this checkout changes against main, so a lane's floor never rests on a file list
// assembled by hand. The set is every path that differs between the merge base and the working tree (committed,
// staged or not) plus untracked files git does not ignore; a deleted path is dropped. ESLint itself decides which
// of those it lints: `--no-warn-ignored` lets a changed Markdown or JSON file pass through without a warning.
// The run goes through `pnpm lint:eslint`, so the flags stay that script's.
import process from "node:process";
import { execGit } from "@orb/tooling/floor/git/git";
import { pnpmInvocation } from "@orb/tooling/floor/host/platform";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";

// The branch every lane is cut from and merges back into.
const LINT_CHANGED_BASE = "main";
const ESLINT_SCRIPT = "lint:eslint";
const NUL = "\0";

function nulList(output: string): string[] {
  return output.split(NUL).filter((path) => path !== "");
}

// Every path that differs between the merge base of `base` and HEAD and the working tree, plus untracked files, sorted.
function branchChangedFiles(root: string, base: string): readonly string[] {
  const mergeBase = execGit(root, ["merge-base", base, "HEAD"]).trim();
  const tracked = nulList(execGit(root, ["diff", "--name-only", "--no-renames", "--diff-filter=d", "-z", mergeBase]));
  const untracked = nulList(execGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]));
  return [...new Set([...tracked, ...untracked])].toSorted();
}

function main(): void {
  const root = execGit(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
  const files = branchChangedFiles(root, LINT_CHANGED_BASE);
  console.log(`lint-changed: ${files.length} file${files.length === 1 ? "" : "s"} changed against ${LINT_CHANGED_BASE}`);
  // ESLint given no path lints the whole tree; an unchanged branch has nothing to lint.
  if (files.length === 0) {
    return;
  }
  const invocation = pnpmInvocation({
    ambient: inheritedProcessEnv(),
    platform: process.platform,
    nodePath: process.execPath,
    args: [ESLINT_SCRIPT, "--no-warn-ignored", ...files],
  });
  if (invocation.kind === "refused") {
    throw new Error(invocation.reason);
  }
  const result = runNicedSync(invocation.command, invocation.args, { cwd: root, stdio: "inherit", supervised: true });
  process.exitCode = result.status ?? 1;
}

if (import.meta.main) {
  main();
}
