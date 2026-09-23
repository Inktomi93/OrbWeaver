// Landing: `pnpm doc land <id…> --evidence <sha>` and the post-merge `land --merged`. A landed item is
// DELETED, not kept (owner ruling: git keeps history; lasting knowledge lives in ADRs and law), and the
// landing commit records what the file held — each item's title, evidence and What text. An item another
// item or a parked plan waits on is released in the same commit: its `on <id>` blocker names a file that
// is about to be gone. An item a doc still refers to refuses, so a landing never leaves a dead link.
// All-or-nothing: any refusal writes and commits nothing.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { DOC_TOOL_TREES } from "#doc-catalog";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { DocEdit, WorkItem } from "../contract/types.ts";
import { closesTrailer } from "../lib/drift.ts";
import { sectionText, splitDocument, withFields } from "../lib/frontmatter-write.ts";
import type { LandingRecord } from "../lib/items.ts";
import { landingMessage, parseBlocker } from "../lib/items.ts";
import { PARKED } from "../lib/rules.ts";
import { loadPlans } from "./board.ts";
import { introducedDocProblems } from "./check.ts";
import { regenerateIndexes } from "./indexes.ts";
import type { WriteOutcome } from "./items.ts";
import { loadItems } from "./items.ts";
import { textCiters } from "./remove.ts";
import { commitOnMain, commitPaths, formattedDoc, headCommit, isMainBranch, landedCommit, mergedCommits, readDoc, root, today, writeDoc } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc land <id…> --evidence <sha>");

interface LandOutcome extends WriteOutcome {
  readonly skipped: readonly string[];
}

const SHORT_SHA = 12;
const HOOK_TRAILER = "Co-Authored-By: pnpm doc <doc-tool@orbweaver.invalid>";
const WHAT = "What";

function waitsOn(blocked: string | null, ids: ReadonlySet<number>): boolean {
  const blocker = blocked === null ? null : parseBlocker(blocked);
  return blocker?.kind === "on" && ids.has(blocker.id);
}

/** The edits that release whatever waits on a landing item: a blocked item reopens, a parked plan goes
 *  active. */
function releases(ids: ReadonlySet<number>, items: readonly WorkItem[], repoRoot: string, date: string): readonly DocEdit[] {
  const edit = (path: string, patch: Readonly<Record<string, string | null>>): DocEdit => ({
    from: path,
    doc: { path, source: formattedDoc(withFields(readDoc(path, repoRoot).source, { ...patch, updated: date })) },
  });
  const openItems = items
    .filter((item) => !ids.has(item.id) && item.state === "blocked" && waitsOn(item.blocked, ids))
    .map((item) => edit(item.path, { status: "open", blocked: null }));
  const activePlans = loadPlans(repoRoot)
    .filter((plan) => plan.status === PARKED && waitsOn(plan.blocked, ids))
    .map((plan) => edit(plan.path, { status: "active", blocked: null }));
  return [...openItems, ...activePlans];
}

function record(item: WorkItem, evidence: string, repoRoot: string): LandingRecord {
  const { body } = splitDocument(readDoc(item.path, repoRoot).source);
  // An item that was already `done` keeps the evidence it landed with.
  return { id: item.id, title: item.title, what: sectionText(body, WHAT), evidence: item.state === "done" ? (item.evidence ?? evidence) : evidence };
}

/** Land items: prove the evidence is on `main`, delete the item files, release their dependents,
 *  regenerate the indexes and commit exactly those paths with the landing record. IDEMPOTENT: an id whose
 *  file git shows deleted is skipped with its landing commit, so a repeated trailer lands nothing twice. */
export function landItems(ids: readonly number[], evidence: string, repoRoot = root, date = today()): LandOutcome {
  if (!commitOnMain(evidence, repoRoot)) {
    return { written: [], refusals: [`${evidence}: not a commit reachable from main — land names the merge or the landed commit itself`], skipped: [] };
  }
  const items = loadItems(repoRoot);
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const targets: WorkItem[] = [];
  const skipped: string[] = [];
  const refusals: string[] = [];
  for (const id of new Set(ids)) {
    const item = byId.get(id);
    if (item !== undefined) {
      targets.push(item);
      continue;
    }
    const landed = landedCommit(id, repoRoot);
    if (landed === null) {
      refusals.push(`${String(id)}: no such item under ${DOC_TOOL_TREES.work}, and git shows no landing for it — check the id`);
    } else {
      skipped.push(`${String(id)}: already landed at ${landed.slice(0, SHORT_SHA)}`);
    }
  }
  const paths = targets.map((item) => item.path);
  refusals.push(...textCiters(paths, repoRoot));
  if (refusals.length > 0) {
    return { written: [], refusals, skipped: [] };
  }
  if (targets.length === 0) {
    return { written: [], refusals: [], skipped };
  }
  const released = releases(new Set(targets.map((item) => item.id)), items, repoRoot, date);
  const problems = introducedDocProblems(released, repoRoot);
  if (problems.length > 0) {
    return { written: [], refusals: problems, skipped: [] };
  }
  const records = targets.map((item) => record(item, evidence, repoRoot));
  for (const { doc } of released) {
    writeDoc(doc.path, doc.source, repoRoot);
  }
  for (const path of paths) {
    rmSync(join(repoRoot, path));
  }
  const written = [...paths, ...released.map(({ doc }) => doc.path), ...regenerateIndexes(repoRoot)];
  const message = landingMessage(records, HOOK_TRAILER);
  if (!commitPaths(written, message, repoRoot)) {
    return {
      written,
      refusals: [`the landing commit failed — the files are written; commit them by hand with this message:\n${message}`],
      skipped,
    };
  }
  return { written, refusals: [], skipped };
}

/** The post-merge door. On `main`, read the `Closes:` trailers of the commits the merge brought in and
 *  land those ids with the merge commit as evidence. Anywhere else, or with no trailer, it does nothing
 *  and says nothing. ALL-OR-NOTHING: an id that is neither on the tree nor landed in git refuses the whole
 *  trailer set before any write, and the refusal names the by-hand landing for the ids that do exist. */
export function landMerged(repoRoot = root, date = today()): LandOutcome {
  if (!isMainBranch(repoRoot)) {
    return { written: [], refusals: [], skipped: [] };
  }
  const ids = [...new Set(mergedCommits(repoRoot).flatMap((commit) => closesTrailer(commit.message)))];
  const head = headCommit(repoRoot);
  if (ids.length === 0 || head === null) {
    return { written: [], refusals: [], skipped: [] };
  }
  const onTree = new Set(loadItems(repoRoot).map((item) => item.id));
  const unknown = ids.filter((id) => !onTree.has(id) && landedCommit(id, repoRoot) === null);
  if (unknown.length > 0) {
    const byHand = ids.filter((id) => onTree.has(id));
    const fix = byHand.length === 0 ? "" : `, then pnpm doc land ${byHand.map(String).join(" ")} --evidence ${head}`;
    return {
      written: [],
      refusals: unknown.map(
        (id) => `${String(id)}: a merged commit closes it but no such item exists under ${DOC_TOOL_TREES.work} — fix the trailer's id${fix}`,
      ),
      skipped: [],
    };
  }
  return landItems(ids, head, repoRoot, date);
}
