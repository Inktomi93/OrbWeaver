// The docs half of `pnpm check:agents`: the structural rules over the governed tree plus the writing
// charter (rules 1, 2, 4) and the reference check over every governed doc. `agent-sync` calls this
// through the front door; the exit code and the summary line are its. The minting verbs run the same
// composition over the files they are about to write (`pendingDocProblems`), so a mint refuses what the
// check would red.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { referenceProblems } from "../../_shared/prose-references.ts";
import { glossaryWords, proseFindings } from "../../_shared/prose-rules.ts";
import type { GovernedDoc } from "../contract/types.ts";
import { docProblems } from "../lib/rules.ts";
import { readDocTree, root } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:agents");

const ALWAYS_ON_FILE = "AGENTS.md";

/** The writing-rule and reference findings over `docs`. */
function textProblems(docs: readonly GovernedDoc[], repoRoot: string): readonly string[] {
  const glossary = join(repoRoot, ALWAYS_ON_FILE);
  const allowed = glossaryWords(existsSync(glossary) ? readFileSync(glossary, "utf8") : "");
  return docs.flatMap((doc) => [...proseFindings(doc.path, doc.source, allowed), ...referenceProblems(repoRoot, doc.path, doc.source)]);
}

/** Every finding over the governed docs tree, as operator-readable lines. Empty = clean. */
export function docLayerProblems(repoRoot = root): readonly string[] {
  const tree = readDocTree(repoRoot);
  return [...docProblems(tree), ...textProblems(tree.docs, repoRoot)];
}

/** The findings the check would report on `pending` once written: the tree judged as if the files were
 *  on it, so an `on <id>` blocker may name a sibling in the same batch. Only findings on the pending
 *  paths count — the indexes the write regenerates are stale until it does, and a finding elsewhere on
 *  the tree is not this write's to refuse. */
export function pendingDocProblems(pending: readonly GovernedDoc[], repoRoot = root): readonly string[] {
  const tree = readDocTree(repoRoot);
  const paths = new Set(pending.map((doc) => doc.path));
  const docs = [...tree.docs.filter((doc) => !paths.has(doc.path)), ...pending];
  const files = [...tree.files.filter((path) => !paths.has(path)), ...paths];
  const own = (line: string): boolean => pending.some((doc) => line.startsWith(`${doc.path}:`));
  return [...docProblems({ ...tree, docs, files }), ...textProblems(pending, repoRoot)].filter(own);
}

/** How many governed docs the check read, for the summary line. */
export function docFileCount(repoRoot = root): number {
  return readDocTree(repoRoot).docs.length;
}
