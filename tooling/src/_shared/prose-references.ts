// The one reference check every markdown checker shares: a relative markdown link, a backticked
// repository path and a backticked relative path must name something that exists. A link target and a
// relative span resolve against the file that holds them; a repository path resolves against the root.
// Filesystem-touching, so it sits beside the pure rules in `prose-rules.ts` rather than inside them; the
// instruction-layer walk and the docs walk are its two importers.
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import { GIT_READ_PREFIX, runGit } from "./git.ts";
import { backtickedRelativePaths, backtickedRepoPaths, markdownLinkTargets } from "./prose-rules.ts";

/** A missing repository path is ignored build output when its first missing segment sits under an existing
 *  directory and git ignores that segment. A fresh checkout has no build output, so the check cannot see
 *  it. A missing descendant of an existing ignored directory must exist; Git ignoring its ancestor is not evidence. */
function isIgnoredBuildOutput(root: string, path: string, ignored: (path: string) => boolean): boolean {
  let existing = posix.dirname(path);
  let missing = path;
  while (existing !== "." && !existsSync(join(root, existing))) {
    missing = existing;
    existing = posix.dirname(existing);
  }
  const ancestor = relative(realpathSync(root), realpathSync(join(root, existing)));
  if (ancestor === ".." || ancestor.startsWith(`..${sep}`) || isAbsolute(ancestor)) {
    return false;
  }
  if (existing !== "." && ignored(existing)) {
    return false;
  }
  return ignored(missing);
}

/** Cache Git answers for shared prefixes within one immutable document or resource-load invocation. */
export function ignoredBuildOutputClassifier(root: string): (path: string) => boolean {
  const answers = new Map<string, boolean>();
  const ignored = (path: string): boolean => {
    const cached = answers.get(path);
    if (cached !== undefined) {
      return cached;
    }
    // A directory-only ignore needs the slash when Git cannot stat the absent prefix.
    const answer = runGit(root, [...GIT_READ_PREFIX, "check-ignore", "--", path, `${path}/`]).status === 0;
    answers.set(path, answer);
    return answer;
  };
  return (path) => isIgnoredBuildOutput(root, path, ignored);
}

/** Every dead link target and dead backticked path (repository or relative) in one file, as `path:line: what` strings. */
export function referenceProblems(root: string, rel: string, source: string): readonly string[] {
  const problems: string[] = [];
  const ignoredBuildOutput = ignoredBuildOutputClassifier(root);
  for (const { line, target } of markdownLinkTargets(source)) {
    if (target !== "" && !existsSync(join(root, dirname(rel), target))) {
      problems.push(`${rel}:${line}: link target does not exist: ${target}`);
    }
  }
  for (const { line, path } of backtickedRepoPaths(source)) {
    if (!(existsSync(join(root, path)) || ignoredBuildOutput(path))) {
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
