// `pnpm doc status <status> <path…> [--by <path>] [--kind <k>] [--blocked <reason>]`: set a document's
// status (and, with `--kind`, its kind — a law doc filed under the wrong one) as a whole-block rewrite. For
// `superseded --by` write both halves of the link (`superseded-by` on the old, `supersedes` on the new) in
// the same call, so the pair can never be half-written. A plan is `parked` with its wake condition in
// `--blocked`; any other plan status clears it. The pre-write check judges every edited doc; a kind its
// path does not admit, or a parked plan without a reason, refuses there.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PLAN_KIND } from "#doc-catalog";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { DocEdit } from "../contract/types.ts";
import { splitDocument, withFields } from "../lib/frontmatter-write.ts";
import { KIND_RULES, PARKED } from "../lib/rules.ts";
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
  /** A parked plan's wake condition, in the item blocker grammar. */
  readonly blocked?: string | null;
}

function kindOf(path: string, repoRoot: string): string {
  return splitDocument(readDoc(path, repoRoot).source).fields?.["kind"] ?? "";
}

export function setStatus({ status, paths, by, docKind = null, blocked = null }: StatusInput, repoRoot = root, date = today()): WriteOutcome {
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
  if (blocked !== null && status !== PARKED) {
    refusals.push(`--blocked is a parked plan's wake condition and belongs to status ${PARKED} only`);
  }
  if (refusals.length > 0) {
    return { written: [], refusals };
  }
  const edit = (path: string, patch: Readonly<Record<string, string | null>>): DocEdit => ({
    from: path,
    doc: { path, source: formattedDoc(withFields(readDoc(path, repoRoot).source, patch)) },
  });
  const planFields = (path: string): Readonly<Record<string, string | null>> =>
    (docKind ?? kindOf(path, repoRoot)) === PLAN_KIND ? { blocked: status === PARKED ? blocked : null } : {};
  const edits = paths.map((path) =>
    edit(path, {
      status,
      updated: date,
      ...(docKind === null ? {} : { kind: docKind }),
      ...(by === null ? {} : { ["superseded-by"]: by }),
      ...planFields(path),
    }),
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
