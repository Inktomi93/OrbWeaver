// Landing: `pnpm doc land <id…> --evidence <sha>` commits it, `land <id…> --stage` stages it for the
// caller's own commit, and `land --merged` lands a merge's `Closes:` ids. A landed item is DELETED, not
// kept (owner ruling: git keeps history; lasting knowledge lives in ADRs and law), and the landing record
// holds what the file held — each item's title, evidence and What text. An item another item or a parked
// plan waits on is released in the same landing: its `on <id>` blocker names a file that is about to be
// gone. An item a doc still refers to refuses, so a landing never leaves a dead link.
// All-or-nothing: any refusal writes, stages and commits nothing. A held index lock refuses before any write,
// and a staging or commit step that fails after the write puts every written file back.
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { DocEdit, WorkItem } from "../contract/types.ts";
import { DOC_TOOL_TREES, PARKED } from "../contract/vocab.ts";
import { closesTrailer } from "../lib/drift.ts";
import { sectionText, splitDocument, withFields } from "../lib/frontmatter-write.ts";
import { isGeneratedPath } from "../lib/indexes.ts";
import type { LandingRecord, StagedLanding } from "../lib/items.ts";
import { landingMessage, parseBlocker, stagedLanding } from "../lib/items.ts";
import { basenameOf, parseNumberedName } from "../lib/names.ts";
import { loadPlans } from "./board.ts";
import { introducedDocProblems } from "./check.ts";
import { regenerateIndexes } from "./indexes.ts";
import type { WriteOutcome } from "./items.ts";
import { loadItems } from "./items.ts";
import { textCiters } from "./remove.ts";
import {
  commitOnMain,
  commitPaths,
  formattedDoc,
  governedPaths,
  headCommit,
  heldIndexLock,
  isMainBranch,
  landedCommit,
  mergedCommits,
  readDoc,
  root,
  stagedWorkDeletions,
  stagePaths,
  TOOL_TRAILER,
  today,
  workFileNamesAt,
  writeDoc,
} from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc land <id…> --evidence <sha> | --stage");

export interface LandOutcome extends WriteOutcome {
  readonly skipped: readonly string[];
  /** Set by a successful `--stage`: the record and `Closes:` line for the caller's commit message. */
  readonly staged?: StagedLanding;
}

/** Each path a landing may write, with its bytes before the write; null for a path that did not exist. */
type PriorFiles = ReadonlyMap<string, string | null>;

interface WrittenLanding {
  readonly outcome: LandOutcome;
  /** One record per item the landing deleted; empty when nothing was written. */
  readonly records: readonly LandingRecord[];
  readonly prior: PriorFiles;
}

const SHORT_SHA = 12;
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

function record(item: WorkItem, evidence: string | null, repoRoot: string): LandingRecord {
  const { body } = splitDocument(readDoc(item.path, repoRoot).source);
  // An item that was already `done` keeps the evidence it landed with.
  return { id: item.id, title: item.title, what: sectionText(body, WHAT), evidence: item.state === "done" ? (item.evidence ?? evidence) : evidence };
}

/** The bytes of every path the landing can write: the item files, the released docs and the generated files.
 *  A generated file the regeneration creates is absent here, so putting it back deletes it. */
function priorFiles(paths: readonly string[], repoRoot: string): PriorFiles {
  const candidates = [...paths, ...governedPaths(repoRoot).filter(isGeneratedPath)];
  return new Map(candidates.map((path) => [path, readDoc(path, repoRoot).source] as const));
}

/** Put every path the landing wrote back to its bytes before the write. */
function putBack(written: readonly string[], prior: PriorFiles, repoRoot: string): void {
  for (const path of written) {
    const source = prior.get(path) ?? null;
    const abs = join(repoRoot, path);
    if (source !== null) {
      writeFileSync(abs, source);
    } else if (existsSync(abs)) {
      rmSync(abs);
    }
  }
}

/** The outcome of a landing whose stage or commit step failed after the write: nothing stays written. */
function unwound(landing: WrittenLanding, repoRoot: string, refusal: string): LandOutcome {
  putBack(landing.outcome.written, landing.prior, repoRoot);
  return { written: [], refusals: [`${refusal}. Nothing changed: the item files and indexes are as they were`], skipped: [] };
}

/** The shared half of every landing: resolve the ids, refuse what must not land, then write the releases,
 *  delete the item files and regenerate the indexes. `evidence` is null when the caller stages and has no
 *  commit yet. Commits and stages nothing — that is the caller's step; `prior` lets it put the files back. */
function writeLanding(ids: readonly number[], evidence: string | null, repoRoot: string, date: string): WrittenLanding {
  const nothing = new Map<string, string | null>();
  const lock = heldIndexLock(repoRoot);
  if (lock !== null) {
    return {
      outcome: { written: [], refusals: [`git's index is locked (${lock} exists) — another git process holds it; nothing was written`], skipped: [] },
      records: [],
      prior: nothing,
    };
  }
  const items = loadItems(repoRoot);
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const stagedDeletions = stagedWorkDeletions(repoRoot);
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
    if (landed === null && stagedDeletions.some((path) => parseNumberedName(basenameOf(path))?.id === id)) {
      refusals.push(`${String(id)}: its landing is already staged — commit it with its Closes: ${String(id)} line, or unstage it`);
    } else if (landed === null) {
      refusals.push(`${String(id)}: no such item under ${DOC_TOOL_TREES.work}, and git shows no landing for it — check the id`);
    } else {
      skipped.push(`${String(id)}: already landed at ${landed.slice(0, SHORT_SHA)}`);
    }
  }
  const paths = targets.map((item) => item.path);
  refusals.push(...textCiters(paths, repoRoot));
  if (refusals.length > 0) {
    return { outcome: { written: [], refusals, skipped: [] }, records: [], prior: nothing };
  }
  if (targets.length === 0) {
    return { outcome: { written: [], refusals: [], skipped }, records: [], prior: nothing };
  }
  const released = releases(new Set(targets.map((item) => item.id)), items, repoRoot, date);
  const problems = introducedDocProblems(released, repoRoot);
  if (problems.length > 0) {
    return { outcome: { written: [], refusals: problems, skipped: [] }, records: [], prior: nothing };
  }
  const records = targets.map((item) => record(item, evidence, repoRoot));
  const prior = priorFiles([...paths, ...released.map(({ doc }) => doc.path)], repoRoot);
  for (const { doc } of released) {
    writeDoc(doc.path, doc.source, repoRoot);
  }
  for (const path of paths) {
    rmSync(join(repoRoot, path));
  }
  const written = [...paths, ...released.map(({ doc }) => doc.path), ...regenerateIndexes(repoRoot)];
  return { outcome: { written, refusals: [], skipped }, records, prior };
}

/** Land items: prove the evidence is on `main`, delete the item files, release their dependents,
 *  regenerate the indexes and commit exactly those paths with the landing record. IDEMPOTENT: an id whose
 *  file git shows deleted is skipped with its landing commit, so a repeated trailer lands nothing twice. */
export function landItems(ids: readonly number[], evidence: string, repoRoot = root, date = today()): LandOutcome {
  if (!commitOnMain(evidence, repoRoot)) {
    return { written: [], refusals: [`${evidence}: not a commit reachable from main — land names the merge or the landed commit itself`], skipped: [] };
  }
  const landing = writeLanding(ids, evidence, repoRoot, date);
  if (landing.records.length === 0) {
    return landing.outcome;
  }
  const commit = commitPaths(landing.outcome.written, landingMessage(landing.records, TOOL_TRAILER), repoRoot);
  if (commit.ok) {
    return landing.outcome;
  }
  // HEAD holds the landing under someone else's commit: putting the files back would stage their re-add.
  if ("stranded" in commit) {
    return {
      ...landing.outcome,
      refusals: [`the landing commit failed after it reached history — ${commit.reason}. Read git log and git status before landing again`],
    };
  }
  return unwound(landing, repoRoot, `the landing commit failed — ${commit.reason}`);
}

/** Land items without a commit: the same resolution, refusals, releases and deletions as {@link landItems},
 *  but no evidence check, and exactly the written paths are staged in the checkout's real index — every
 *  other staged or unstaged path is left alone. The caller's own `git commit` carries the deletion with its
 *  final files, and `staged` holds the record and `Closes:` line for that commit's message. Works on any
 *  branch and during an in-progress merge. */
export function landStaged(ids: readonly number[], repoRoot = root, date = today()): LandOutcome {
  const landing = writeLanding(ids, null, repoRoot, date);
  if (landing.records.length === 0) {
    return landing.outcome;
  }
  // One update-index call: git writes the whole index or none of it, so a failure leaves the index as it was.
  const staged = stagePaths(landing.outcome.written, repoRoot);
  return staged.ok ? { ...landing.outcome, staged: stagedLanding(landing.records) } : unwound(landing, repoRoot, `staging failed — ${staged.reason}`);
}

/** The refusals for ids whose every closing commit's own tree lacks today's file for the id. */
function staleTrailers(
  commits: readonly { readonly sha: string; readonly message: string }[],
  byId: ReadonlyMap<number, WorkItem>,
  head: string,
  repoRoot: string,
): readonly string[] {
  const bound = new Set<number>();
  const stale = new Map<number, string>();
  for (const commit of commits) {
    const closed = closesTrailer(commit.message).flatMap((id) => {
      const item = byId.get(id);
      return item === undefined ? [] : [{ id, name: basenameOf(item.path) }];
    });
    if (closed.length === 0) {
      continue;
    }
    const names = workFileNamesAt(commit.sha, repoRoot);
    for (const { id, name } of closed) {
      if (names.includes(name)) {
        bound.add(id);
      } else if (!stale.has(id)) {
        stale.set(
          id,
          `${String(id)}: commit ${commit.sha.slice(0, SHORT_SHA)} closes it but its tree holds no ${name} — the trailer names another item; if it is right, pnpm doc land ${String(id)} --evidence ${head}`,
        );
      }
    }
  }
  return [...stale].filter(([id]) => !bound.has(id)).map(([, refusal]) => refusal);
}

/** The merge-time door; the repository installs no git hook for it, so the orchestrator runs it by hand
 *  after a merge. On `main`, read the `Closes:` trailers of the commits the merge brought in and land those
 *  ids with the merge commit as evidence. Anywhere else, or with no trailer, it does nothing and says
 *  nothing. An id a `land --stage` commit already deleted is skipped as already landed. `headMerge` picks
 *  the range by which kind of merge ended, never by HEAD's shape (`mergedCommits`,
 *  tooling/src/doc/ops/tree.ts): a git post-merge hook would pass `false` (`ORIG_HEAD..HEAD`) and a
 *  post-commit hook `true` (`HEAD^1..HEAD`) — a fast-forward onto a branch whose tip is
 *  already a merge commit still fires post-merge, and reading `HEAD^1..HEAD` there would drop every id on
 *  the first-parent side. ALL-OR-NOTHING: an id that is neither on the tree nor landed in git refuses the
 *  whole trailer set before any write, and the refusal names the by-hand landing for the ids that do
 *  exist. A trailer binds to an item only when its commit's own tree holds today's file for the id; a
 *  trailer whose tree holds none, or another slug, refuses the set the same way (the id was reused). */
export function landMerged(repoRoot = root, date = today(), headMerge = false): LandOutcome {
  if (!isMainBranch(repoRoot)) {
    return { written: [], refusals: [], skipped: [] };
  }
  const commits = mergedCommits(repoRoot, headMerge);
  const ids = [...new Set(commits.flatMap((commit) => closesTrailer(commit.message)))];
  const head = headCommit(repoRoot);
  if (ids.length === 0 || head === null) {
    return { written: [], refusals: [], skipped: [] };
  }
  const byId = new Map(loadItems(repoRoot).map((item) => [item.id, item] as const));
  const onTree = new Set(byId.keys());
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
  const refusals = staleTrailers(commits, byId, head, repoRoot);
  if (refusals.length > 0) {
    return { written: [], refusals, skipped: [] };
  }
  return landItems(ids, head, repoRoot, date);
}
