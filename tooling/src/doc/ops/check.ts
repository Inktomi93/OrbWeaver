// The docs half of `pnpm check:agents`: the structural rules over the governed tree plus the writing
// charter (rules 1, 2, 4) and the reference check over every governed doc. `agent-sync` calls this
// through the front door; the exit code and the summary line are its.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { referenceProblems } from "../../_shared/prose-references.ts";
import { glossaryWords, proseFindings } from "../../_shared/prose-rules.ts";
import { docProblems } from "../lib/rules.ts";
import { readDocTree, root } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:agents");

const ALWAYS_ON_FILE = "AGENTS.md";

/** Every finding over the governed docs tree, as operator-readable lines. Empty = clean. */
export function docLayerProblems(repoRoot = root): readonly string[] {
  const tree = readDocTree(repoRoot);
  const glossary = join(repoRoot, ALWAYS_ON_FILE);
  const allowed = glossaryWords(existsSync(glossary) ? readFileSync(glossary, "utf8") : "");
  const prose = tree.docs.flatMap((doc) => [...proseFindings(doc.path, doc.source, allowed), ...referenceProblems(repoRoot, doc.path, doc.source)]);
  return [...docProblems(tree), ...prose];
}

/** How many governed docs the check read, for the summary line. */
export function docFileCount(repoRoot = root): number {
  return readDocTree(repoRoot).docs.length;
}
