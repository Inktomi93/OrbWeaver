// Raw source bytes and candidate-index test modes are native repository contracts, not policy analysis.
import type { Dirent } from "node:fs";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import { AUTHORED_TREE_PATHS, NON_AUTHORED_DIRECTORIES } from "../contract/resource-tree.ts";
import { readApplicationSubjects } from "../lib/application-programs.ts";
import { populationIncludes } from "../lib/population-resolver.ts";
import { classifyExplicitPaths } from "../lib/repo-paths.ts";
import { loadTrackedFiles } from "./resource-tracked.ts";

refuseDirectInvocation(import.meta.url, "pnpm exec node tooling/src/verify/cli.ts git-text-safety");

const SOURCE_ROOTS = ["packages", "tooling", "tests", "scripts", "docs"] as const;
const SKIP_DIRS: ReadonlySet<string> = new Set([...NON_AUTHORED_DIRECTORIES, "coverage", ".turbo", "generated"]);
const TEXT_EXT_RE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|md|css|scss|sql|html|yml|yaml|txt|sh)$/u;
const NUL_MESSAGE = "raw NUL source byte (0x00); use the source escape \\u0000 so Git retains a reviewable text diff";
const EXECUTABLE_MESSAGE = "candidate-index Git mode 100755 on a test; use git update-index --chmod=-x -- <test-path>";

function requiredRoot(root: string, path: string): string {
  if (!lstatSync(join(root, path)).isDirectory()) {
    throw new Error(`git-text-safety: required source root is not a directory: ${path}`);
  }
  if (!readdirSync(join(root, path), { withFileTypes: true }).some((entry) => !(entry.isDirectory() && NON_AUTHORED_DIRECTORIES.has(entry.name)))) {
    throw new Error(`git-text-safety: required authored source root is empty: ${path}`);
  }
  return path;
}

function eligibleTextFile(entry: Dirent, path: string): boolean {
  if (entry.isSymbolicLink()) {
    throw new Error(`git-text-safety: authored source traverses a symbolic link: ${path}`);
  }
  if (entry.isDirectory() || !TEXT_EXT_RE.test(path)) {
    return false;
  }
  if (!entry.isFile()) {
    throw new Error(`git-text-safety: eligible source is not a regular file: ${path}`);
  }
  return true;
}

function sourceFiles(root: string): readonly string[] {
  const files: string[] = [];
  const pending = SOURCE_ROOTS.map((id) => requiredRoot(root, AUTHORED_TREE_PATHS[id]));
  for (let directory = pending.pop(); directory !== undefined; directory = pending.pop()) {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      const child = `${directory}/${entry.name}`;
      if (eligibleTextFile(entry, child)) {
        files.push(child);
      } else if (entry.isDirectory()) {
        pending.push(child);
      }
    }
  }
  return files.toSorted();
}

function reportNuls(path: string, bytes: Buffer): number {
  let findings = 0;
  let line = 1;
  let newline = bytes.indexOf(10);
  for (let at = bytes.indexOf(0); at !== -1; at = bytes.indexOf(0, at + 1)) {
    while (newline !== -1 && newline < at) {
      line += 1;
      newline = bytes.indexOf(10, newline + 1);
    }
    process.stdout.write(`${path}:${String(line)}:1 ${NUL_MESSAGE}\n`);
    findings += 1;
  }
  return findings;
}

/** Check complete native inputs while narrowing only the subjects reported by an explicit view. */
export async function runGitTextSafety(root: string, args: readonly string[] = []): Promise<number> {
  const flags = args.filter((arg) => arg.startsWith("-"));
  if (flags.some((flag) => flag !== "--application") || flags.length > 1) {
    throw new UsageError("git-text-safety accepts only --application or repo-relative subject paths");
  }
  const application = flags.length === 1;
  const paths = args.filter((arg) => arg !== "--application");
  if (application && paths.length > 0) {
    throw new UsageError("git-text-safety --application cannot be combined with subject paths");
  }
  const requested = paths.length === 0 ? undefined : classifyExplicitPaths(paths, root).paths.map((path) => path.split(sep).join("/"));
  const subjects = application ? new Set((await readApplicationSubjects(root)).subjects) : undefined;
  const includes = (path: string): boolean =>
    subjects === undefined
      ? requested === undefined || requested.some((prefix) => prefix === "" || path === prefix || path.startsWith(`${prefix.replace(/\/$/u, "")}/`))
      : subjects.has(path) || populationIncludes("@product", path);
  const index = loadTrackedFiles(root);
  if (index.status !== "ready") {
    throw new Error(`git-text-safety: candidate index is ${index.status}: ${index.reason}`);
  }
  const files = sourceFiles(root);
  let findings = 0;
  for (const path of files) {
    // Eligible inputs remain complete even when a requested/application view reports only a subset.
    const bytes = readFileSync(join(root, path));
    if (includes(path)) {
      findings += reportNuls(path, bytes);
    }
  }
  const tests = index.value.repoPaths.filter((path) => path.startsWith("tests/") && includes(path));
  for (const path of index.value.executablePaths.filter((candidate) => candidate.startsWith("tests/") && includes(candidate))) {
    process.stdout.write(`${path}:1:1 ${EXECUTABLE_MESSAGE}\n`);
    findings += 1;
  }
  process.stdout.write(`git-text-safety: read ${String(files.length)} text inputs; judged ${String(tests.length)} indexed test paths\n`);
  return findings === 0 ? EXIT.clean : EXIT.violations;
}
