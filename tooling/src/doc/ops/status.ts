// `pnpm doc status <status> <path…> [--by <path>] [--kind <k>]`: set a document's status (and, with
// `--kind`, its kind — a law doc filed under the wrong one) as a whole-block rewrite, and for
// `superseded --by` write both halves of the link (`superseded-by` on the old, `supersedes` on the new) in
// the same call, so the pair can never be half-written. The pre-write check judges every edited doc; a
// kind its path does not admit refuses there.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { DocEdit } from "../contract/types.ts";
import { splitDocument, withFields } from "../lib/frontmatter-write.ts";
import { KIND_RULES } from "../lib/rules.ts";
import { introducedDocProblems } from "./check.ts";
import { regenerateIndexes } from "./indexes.ts";
import type { WriteOutcome } from "./items.ts";
import { formattedDoc, readDoc, root, today, writeDoc } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc status <status> <path…>");

const SUPERSEDED = "superseded";

function statusRefusal(path: string, status: string, docKind: string | null, repoRoot: string): string | null {
  if (!existsSync(join(repoRoot, path))) {
    return `${path}: no such document`;
  }
  const kind = docKind ?? splitDocument(readDoc(path, repoRoot).source).fields?.["kind"] ?? "";
  const rule = KIND_RULES.get(kind);
  if (rule === undefined) {
    return `${path}: kind ${kind || "(none)"} has no status vocabulary — is it under a governed tree?`;
  }
  return rule.statuses.includes(status) ? null : `${path}: status ${status} is not one of ${rule.statuses.join(" | ")} for kind ${kind}`;
}

export interface StatusInput {
  readonly status: string;
  readonly paths: readonly string[];
  /** The successor, for `superseded` only. */
  readonly by: string | null;
  /** A new kind for every path; its status vocabulary judges `status`. */
  readonly docKind?: string | null;
}

export function setStatus({ status, paths, by, docKind = null }: StatusInput, repoRoot = root, date = today()): WriteOutcome {
  const refusals = paths.flatMap((path) => {
    const refusal = statusRefusal(path, status, docKind, repoRoot);
    return refusal === null ? [] : [refusal];
  });
  if (by !== null && status !== SUPERSEDED) {
    refusals.push(`--by names a successor and belongs to status ${SUPERSEDED} only`);
  }
  if (by !== null && !existsSync(join(repoRoot, by))) {
    refusals.push(`${by}: no such successor document`);
  }
  if (refusals.length > 0) {
    return { written: [], refusals };
  }
  const edit = (path: string, patch: Readonly<Record<string, string>>): DocEdit => ({
    from: path,
    doc: { path, source: formattedDoc(withFields(readDoc(path, repoRoot).source, patch)) },
  });
  const edits = paths.map((path) =>
    edit(path, { status, updated: date, ...(docKind === null ? {} : { kind: docKind }), ...(by === null ? {} : { ["superseded-by"]: by }) }),
  );
  if (by !== null) {
    edits.push(edit(by, { supersedes: paths.join(", "), updated: date }));
  }
  const problems = introducedDocProblems(edits, repoRoot);
  if (problems.length > 0) {
    return { written: [], refusals: problems };
  }
  for (const { doc } of edits) {
    writeDoc(doc.path, doc.source, repoRoot);
  }
  return { written: [...edits.map(({ doc }) => doc.path), ...regenerateIndexes(repoRoot)], refusals: [] };
}
