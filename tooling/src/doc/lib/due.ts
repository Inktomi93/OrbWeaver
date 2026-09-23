// The SOFT freshness tier (`pnpm doc due`) as a pure rule: a doc is due for review when a repository
// path its body cites changed after the doc's `updated` date. The paths are the body's own backticked
// citations, so nothing is committed for this beyond the date every doc already carries. A warning
// tier only — it never enters `pnpm check`.
import { backtickedRepoPaths } from "../../_shared/prose-rules.ts";
import type { DescribedDoc, GovernedDoc } from "../contract/types.ts";
import { splitDocument } from "./frontmatter-write.ts";

export interface DueDoc {
  readonly path: string;
  readonly updated: string;
  readonly changed: readonly { readonly path: string; readonly date: string }[];
}

export function describedDoc(doc: GovernedDoc): DescribedDoc | null {
  const { fields, body } = splitDocument(doc.source);
  const updated = fields?.["updated"];
  if (updated === undefined) {
    return null;
  }
  return { path: doc.path, updated, describes: [...new Set(backtickedRepoPaths(body).map((cite) => cite.path))] };
}

/** `changes` maps a changed repository path to its latest commit date (YYYY-MM-DD). A cited directory
 *  matches every changed path below it. Dates compare as strings, which is exact for ISO dates. */
export function dueDocs(docs: readonly DescribedDoc[], changes: ReadonlyMap<string, string>): readonly DueDoc[] {
  const due: DueDoc[] = [];
  for (const doc of docs) {
    const changed: { path: string; date: string }[] = [];
    for (const cited of doc.describes) {
      for (const [path, date] of changes) {
        if ((path === cited || path.startsWith(`${cited}/`)) && date > doc.updated) {
          changed.push({ path, date });
        }
      }
    }
    if (changed.length > 0) {
      due.push({ path: doc.path, updated: doc.updated, changed: changed.toSorted((left, right) => left.path.localeCompare(right.path)) });
    }
  }
  return due.toSorted((left, right) => left.path.localeCompare(right.path));
}

/** The earliest `updated` across the docs — the `--since` floor for the one git log pass. */
export function earliestUpdated(docs: readonly DescribedDoc[]): string | null {
  return docs.reduce<string | null>((earliest, doc) => (earliest === null || doc.updated < earliest ? doc.updated : earliest), null);
}

/** `git log --since=<date> --name-only --format=%cs` output → path → latest date. The format prints one
 *  date line per commit followed by its paths; a blank line separates commits. */
export function changesFromLog(log: string): ReadonlyMap<string, string> {
  const latest = new Map<string, string>();
  let date = "";
  for (const line of log.split("\n")) {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(line)) {
      date = line;
      continue;
    }
    if (line === "" || date === "") {
      continue;
    }
    const seen = latest.get(line);
    if (seen === undefined || seen < date) {
      latest.set(line, date);
    }
  }
  return latest;
}
