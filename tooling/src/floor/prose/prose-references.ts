// The one reference check every markdown checker shares: a relative markdown link, a backticked
// repository path and a backticked relative path must name something that exists. A link target and a
// relative span resolve against the file that holds them; a repository path resolves against the root.
// Filesystem-touching, so it sits beside the pure rules in `prose-rules.ts` rather than inside them; the
// instruction-layer walk and the docs walk are its two importers.
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, posix, resolve, sep } from "node:path";
import { isWithinRoot } from "@orb/kit/path-containment";
import { GIT_READ_PREFIX, runGit } from "../git/git.ts";
import { backtickedRelativePaths, backtickedRepoPaths, markdownLinkTargets } from "./prose-rules.ts";

interface BuildOutputPrefixes {
  readonly existing?: string;
  readonly missing: string;
}

/** A missing repository path is ignored build output when its first missing segment sits under an existing
 *  directory and git ignores that segment. A fresh checkout has no build output, so the check cannot see
 *  it. A missing descendant of an existing ignored directory must exist; Git ignoring its ancestor is not evidence. */
function buildOutputPrefixes(root: string, path: string): BuildOutputPrefixes | undefined {
  if (path.includes("\0")) {
    throw new Error("Git ignore classification failed: repository path contains NUL");
  }
  if (!isWithinRoot(resolve(root), resolve(root, path), { sep })) {
    return undefined;
  }
  // A mint validates references before it creates the target tree.
  if (!existsSync(root)) {
    return undefined;
  }
  let existing = posix.dirname(path);
  let missing = path;
  while (existing !== "." && !existsSync(join(root, existing))) {
    missing = existing;
    existing = posix.dirname(existing);
  }
  if (!isWithinRoot(realpathSync(root), realpathSync(join(root, existing)), { sep })) {
    return undefined;
  }
  return { ...(existing === "." ? {} : { existing }), missing };
}

const IGNORE_RECORD_FIELDS = 4;

function ignoreFailure(prefixes: readonly string[], reason: string): Error {
  return new Error(`Git ignore classification failed (${reason}); repository prefixes: ${prefixes.map((path) => JSON.stringify(path)).join(", ")}`);
}

function ignoredRecord(fields: readonly string[], query: string): boolean {
  const [source, line, pattern, path] = fields;
  if (path !== query || source === undefined || line === undefined || pattern === undefined) {
    throw ignoreFailure([query], "misaligned records");
  }
  if (pattern === "" ? source !== "" || line !== "" : source === "" || !/^[1-9]\d*$/u.test(line)) {
    throw ignoreFailure([query], "malformed record");
  }
  return pattern !== "" && !pattern.startsWith("!");
}

function nativeIgnoreAnswers(root: string, prefixes: readonly string[], git: typeof runGit): ReadonlyMap<string, boolean> {
  // A directory-only ignore needs the slash when Git cannot stat the absent prefix.
  const queries = prefixes.flatMap((prefix) => [
    { prefix, path: prefix },
    { prefix, path: `${prefix}/` },
  ]);
  const answers = new Map<string, boolean>();
  if (queries.length === 0) {
    return answers;
  }
  const result = git(root, [...GIT_READ_PREFIX, "check-ignore", "--stdin", "-z", "-v", "-n"], { input: `${queries.map(({ path }) => path).join("\0")}\0` });
  if (result.errorCode !== undefined || (result.status !== 0 && result.status !== 1)) {
    throw ignoreFailure(prefixes, `exit ${String(result.status)}${result.errorCode === undefined ? "" : "; process failure"}`);
  }
  const fields = result.stdout.split("\0");
  if (fields.pop() !== "" || fields.length !== queries.length * IGNORE_RECORD_FIELDS) {
    throw ignoreFailure(prefixes, "incomplete records");
  }
  for (const [index, { prefix, path }] of queries.entries()) {
    const ignored = ignoredRecord(fields.slice(index * IGNORE_RECORD_FIELDS, (index + 1) * IGNORE_RECORD_FIELDS), path);
    answers.set(prefix, answers.get(prefix) === true || ignored);
  }
  return answers;
}

/** Classify the complete absent-path demand in one native Git batch; no answer survives this invocation.
 *  A failed or incomplete batch throws without publishing partial answers or Git's raw diagnostics. */
export function ignoredBuildOutputClassifier(root: string, paths: readonly string[], git: typeof runGit = runGit): ReadonlyMap<string, boolean> {
  const plans = new Map(paths.map((path) => [path, buildOutputPrefixes(root, path)]));
  const prefixes = [
    ...new Set([...plans.values()].flatMap((plan) => (plan === undefined ? [] : [...(plan.existing === undefined ? [] : [plan.existing]), plan.missing]))),
  ];
  const answers = nativeIgnoreAnswers(root, prefixes, git);
  return new Map(
    [...plans].map(([path, plan]) => [
      path,
      plan !== undefined && answers.get(plan.missing) === true && (plan.existing === undefined || answers.get(plan.existing) !== true),
    ]),
  );
}

/** Every dead link target and dead backticked path (repository or relative) in one file, as `path:line: what` strings. */
export function referenceProblems(root: string, rel: string, source: string, git: typeof runGit = runGit): readonly string[] {
  const problems: string[] = [];
  const repoPaths = backtickedRepoPaths(source);
  const ignoredBuildOutput = ignoredBuildOutputClassifier(
    root,
    repoPaths.filter(({ path }) => !existsSync(join(root, path))).map(({ path }) => path),
    git,
  );
  for (const { line, target } of markdownLinkTargets(source)) {
    if (target !== "" && !existsSync(join(root, dirname(rel), target))) {
      problems.push(`${rel}:${line}: link target does not exist: ${target}`);
    }
  }
  for (const { line, path } of repoPaths) {
    if (!(existsSync(join(root, path)) || ignoredBuildOutput.get(path) === true)) {
      problems.push(`${rel}:${line}: path does not exist: ${path}`);
    }
  }
  for (const { line, path } of backtickedRelativePaths(source)) {
    if (!existsSync(join(root, dirname(rel), path))) {
      problems.push(`${rel}:${line}: path does not exist: ${path}`);
    }
  }
  return problems;
}
