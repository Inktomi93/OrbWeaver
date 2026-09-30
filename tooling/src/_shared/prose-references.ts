// The one reference check every markdown checker shares: a relative markdown link, a backticked
// repository path and a backticked relative path must name something that exists. A link target and a
// relative span resolve against the file that holds them; a repository path resolves against the root.
// Filesystem-touching, so it sits beside the pure rules in `prose-rules.ts` rather than inside them; the
// instruction-layer walk and the docs walk are its two importers.
import { existsSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { GIT_READ_PREFIX, runGit } from "./git.ts";
import { backtickedRelativePaths, backtickedRepoPaths, markdownLinkTargets } from "./prose-rules.ts";

/** A missing repository path is ignored build output when its first missing segment sits under an existing
 *  directory and git ignores that segment. A fresh checkout has no build output, so the check cannot see
 *  it; a typo in any tracked segment above still fails, because that segment is not ignored. */
function isIgnoredBuildOutput(root: string, path: string): boolean {
  let existing = posix.dirname(path);
  let missing = path;
  while (existing !== "." && !existsSync(join(root, existing))) {
    missing = existing;
    existing = posix.dirname(existing);
  }
  // Both spellings, because git matches a `dir/` pattern against a path it cannot stat only with the slash.
  return runGit(root, [...GIT_READ_PREFIX, "check-ignore", "--", missing, `${missing}/`]).status === 0;
}

/** Every dead link target and dead backticked path (repository or relative) in one file, as `path:line: what` strings. */
export function referenceProblems(root: string, rel: string, source: string): readonly string[] {
  const problems: string[] = [];
  for (const { line, target } of markdownLinkTargets(source)) {
    if (target !== "" && !existsSync(join(root, dirname(rel), target))) {
      problems.push(`${rel}:${line}: link target does not exist: ${target}`);
    }
  }
  for (const { line, path } of backtickedRepoPaths(source)) {
    if (!(existsSync(join(root, path)) || isIgnoredBuildOutput(root, path))) {
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
