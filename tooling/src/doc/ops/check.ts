// The docs check: the structural rules over the governed tree plus the writing charter (rules 1, 2, 4)
// and the reference check over every governed doc, and the writing charter alone over the instruction
// files. The minting verbs run the docs composition over the files they are about to write
// (`pendingDocProblems`), so a mint refuses what the check would red.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { referenceProblems } from "../../floor/prose/prose-references.ts";
import { glossaryWords, proseFindings } from "../../floor/prose/prose-rules.ts";
import type { DocEdit, GovernedDoc } from "../contract/types.ts";
import { allItems } from "../lib/generated.ts";
import { docProblems } from "../lib/rules.ts";
import { commitOnMain, historicForeignHolders, instructionPaths, readDoc, readDocTree, root } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc <verb>");

const ALWAYS_ON_FILE = "AGENTS.md";

function allowedWords(repoRoot: string): ReadonlySet<string> {
  const glossary = join(repoRoot, ALWAYS_ON_FILE);
  return glossaryWords(existsSync(glossary) ? readFileSync(glossary, "utf8") : "");
}

/** The writing-rule and reference findings over `docs`. */
function textProblems(docs: readonly GovernedDoc[], repoRoot: string): readonly string[] {
  const allowed = allowedWords(repoRoot);
  return docs.flatMap((doc) => [...proseFindings(doc.path, doc.source, allowed), ...referenceProblems(repoRoot, doc.path, doc.source)]);
}

/** The writing-rule findings over the instruction files. Their cited paths are
 *  `tests/tooling/doc/comment-path-citations.repo.int.test.ts`'s to resolve, so the reference check stays on `docs`. */
function instructionProblems(repoRoot: string): readonly string[] {
  const allowed = allowedWords(repoRoot);
  return instructionPaths(repoRoot).flatMap((path) => proseFindings(path, readDoc(path, repoRoot).source, allowed));
}

/** Every finding over the governed docs tree and the instruction files, as operator-readable lines. Empty = clean. */
export function docLayerProblems(repoRoot = root): readonly string[] {
  const tree = readDocTree(repoRoot);
  return [...docProblems(tree, historicForeignHolders(repoRoot)), ...textProblems(tree.docs, repoRoot), ...instructionProblems(repoRoot)];
}

/** The findings the check would report on `pending` once written (and `removed` once gone): the tree
 *  judged as if the write had happened, so an `on <id>` blocker may name a sibling in the same batch and
 *  a pending item's evidence is proven on `main` like a written one's. Only findings on the pending paths
 *  count — the indexes the write regenerates are stale until it does, and a finding elsewhere on the
 *  tree is not this write's to refuse. */
export function pendingDocProblems(pending: readonly GovernedDoc[], repoRoot = root, removed: readonly string[] = []): readonly string[] {
  const tree = readDocTree(repoRoot);
  const gone = new Set([...pending.map((doc) => doc.path), ...removed]);
  const docs = [...tree.docs.filter((doc) => !gone.has(doc.path)), ...pending];
  const files = [...tree.files.filter((path) => !gone.has(path)), ...pending.map((doc) => doc.path)];
  const evidence = allItems(pending).flatMap((item) =>
    item.state === "done" && item.evidence !== null && commitOnMain(item.evidence, repoRoot) ? [item.evidence] : [],
  );
  const evidenceOnMain = new Set([...tree.evidenceOnMain, ...evidence]);
  const own = (line: string): boolean => pending.some((doc) => line.startsWith(`${doc.path}:`));
  return [...docProblems({ ...tree, docs, files, evidenceOnMain }), ...textProblems(pending, repoRoot)].filter(own);
}

/** A finding keyed by the edit it belongs to and its message, without the path or line: a patched
 *  frontmatter block shifts every body line, and a rename changes the path, but neither is a new finding. */
function findingKeys(lines: readonly string[], paths: readonly string[]): Map<string, number> {
  const keys = new Map<string, number>();
  for (const line of lines) {
    const index = paths.findIndex((path) => line.startsWith(`${path}:`));
    const key = `${String(index)}|${line
      .slice((paths[index] ?? "").length + 1)
      .replace(/^\d+:/u, "")
      .trim()}`;
    keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  return keys;
}

/** The findings an EDIT introduces: what the check would report on the edited docs, minus what it reports
 *  on them today. An edit that leaves an old finding in place (a transition on an item whose prose
 *  predates a writing rule) is not refused for it; an edit that adds one is. */
export function introducedDocProblems(edits: readonly DocEdit[], repoRoot = root): readonly string[] {
  const renamed = edits.filter((edit) => edit.from !== edit.doc.path).map((edit) => edit.from);
  const after = pendingDocProblems(
    edits.map((edit) => edit.doc),
    repoRoot,
    renamed,
  );
  const fromPaths = edits.map((edit) => edit.from);
  const before = findingKeys(
    pendingDocProblems(
      fromPaths.map((path) => readDoc(path, repoRoot)),
      repoRoot,
    ),
    fromPaths,
  );
  const toPaths = edits.map((edit) => edit.doc.path);
  return after.filter((line) => {
    const [key] = findingKeys([line], toPaths).keys();
    const left = key === undefined ? 0 : (before.get(key) ?? 0);
    if (key !== undefined && left > 0) {
      before.set(key, left - 1);
      return false;
    }
    return true;
  });
}

/** How many governed docs the check read. */
export function docFileCount(repoRoot = root): number {
  return readDocTree(repoRoot).docs.length;
}
