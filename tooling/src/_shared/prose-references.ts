// The one reference check every markdown checker shares: a relative markdown link and a backticked
// repository path must name something that exists under the tree root. Filesystem-touching, so it sits
// beside the pure rules in `prose-rules.ts` rather than inside them; the instruction-layer walk and the
// docs walk are its two importers.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { backtickedRepoPaths, markdownLinkTargets } from "./prose-rules.ts";

/** Every dead link target and dead backticked path in one file, as `path:line: what` strings. */
export function referenceProblems(root: string, rel: string, source: string): readonly string[] {
  const problems: string[] = [];
  for (const { line, target } of markdownLinkTargets(source)) {
    if (target !== "" && !existsSync(join(root, dirname(rel), target))) {
      problems.push(`${rel}:${line}: link target does not exist: ${target}`);
    }
  }
  for (const { line, path } of backtickedRepoPaths(source)) {
    if (!existsSync(join(root, path))) {
      problems.push(`${rel}:${line}: path does not exist: ${path}`);
    }
  }
  return problems;
}
