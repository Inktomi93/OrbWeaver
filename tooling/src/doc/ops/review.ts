// The freshness verbs. `review <path|glob…>` marks N docs reviewed in one write (their `updated` becomes
// today). `due [glob…]` is the SOFT tier: docs whose cited code changed after their review date, one
// line each with the fixing command, exit 0 always — a warning, never a verdict.
import { globSync } from "node:fs";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { DueDoc } from "../lib/due.ts";
import { changesFromLog, describedDoc, dueDocs, earliestUpdated } from "../lib/due.ts";
import { withFields } from "../lib/frontmatter-write.ts";
import { isGeneratedPath } from "../lib/indexes.ts";
import type { WriteOutcome } from "./items.ts";
import { changesSince, governedPaths, readDoc, root, today, writeDoc } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc <review|due>");

const GLOB_RE = /[*?[\]{}]/u;

/** Governed paths selected by exact paths or globs; empty patterns select every governed doc. */
export function selectDocs(patterns: readonly string[], repoRoot = root): readonly string[] {
  const governed = new Set(governedPaths(repoRoot).filter((path) => !isGeneratedPath(path)));
  if (patterns.length === 0) {
    return [...governed];
  }
  const selected = new Set<string>();
  for (const pattern of patterns) {
    const matches = GLOB_RE.test(pattern) ? globSync(pattern, { cwd: repoRoot }) : [pattern];
    for (const match of matches) {
      if (governed.has(match)) {
        selected.add(match);
      }
    }
  }
  return [...selected].toSorted();
}

export function review(patterns: readonly string[], repoRoot = root, date = today()): WriteOutcome {
  const paths = selectDocs(patterns, repoRoot);
  if (paths.length === 0) {
    return { written: [], refusals: [`${patterns.join(" ")}: selects no governed document`] };
  }
  for (const path of paths) {
    writeDoc(path, withFields(readDoc(path, repoRoot).source, { updated: date }), repoRoot);
  }
  return { written: paths, refusals: [] };
}

export function due(patterns: readonly string[], repoRoot = root): readonly DueDoc[] {
  const docs = selectDocs(patterns, repoRoot).flatMap((path) => {
    const described = describedDoc(readDoc(path, repoRoot));
    return described === null ? [] : [described];
  });
  const since = earliestUpdated(docs);
  if (since === null) {
    return [];
  }
  return dueDocs(docs, changesFromLog(changesSince(since, repoRoot)));
}
