// `pnpm doc status <status> <path…> [--by <path>]`: set a document's status as a whole-block rewrite, and
// for `superseded --by` write both halves of the link (`superseded-by` on the old, `supersedes` on the
// new) in the same call, so the pair can never be half-written.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { splitDocument, withFields } from "../lib/frontmatter-write.ts";
import { KIND_RULES } from "../lib/rules.ts";
import { regenerateIndexes } from "./indexes.ts";
import type { WriteOutcome } from "./items.ts";
import { readDoc, root, today, writeDoc } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc status <status> <path…>");

const SUPERSEDED = "superseded";

function statusRefusal(path: string, status: string, repoRoot: string): string | null {
  if (!existsSync(join(repoRoot, path))) {
    return `${path}: no such document`;
  }
  const kind = splitDocument(readDoc(path, repoRoot).source).fields?.["kind"] ?? "";
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
}

export function setStatus({ status, paths, by }: StatusInput, repoRoot = root, date = today()): WriteOutcome {
  const refusals = paths.flatMap((path) => {
    const refusal = statusRefusal(path, status, repoRoot);
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
  const written: string[] = [];
  for (const path of paths) {
    const patch: Record<string, string> = { status, updated: date };
    if (by !== null) {
      patch["superseded-by"] = by;
    }
    writeDoc(path, withFields(readDoc(path, repoRoot).source, patch), repoRoot);
    written.push(path);
  }
  if (by !== null) {
    writeDoc(by, withFields(readDoc(by, repoRoot).source, { supersedes: paths.join(", "), updated: date }), repoRoot);
    written.push(by);
  }
  return { written: [...written, ...regenerateIndexes(repoRoot)], refusals: [] };
}
