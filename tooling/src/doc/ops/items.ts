// The work-item verbs: mint (`item`, `item --from`), transition (`set`), rewrite a section (`edit`) and
// read (`show`); landing is `ops/land.ts`. Every write verb takes a list, validates only the FINAL shape
// of each item, writes the item files as whole-block rewrites and regenerates the indexes once. A refusal
// writes nothing — a batch is all-or-nothing so a half-landed list can never be mistaken for a landed one.
// Every write is judged by the docs check itself (shape, sections, caps, writing rules, references) before
// the first byte lands: a mint through `pendingDocProblems`, an edit through `introducedDocProblems`.
// `runWrite` is the `--commit` step: it commits a verb's writes plus every other uncommitted change under
// docs/work/ and the generated files they feed, so a run of `set`s ends in one commit.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import type {
  CitingLine,
  DocEdit,
  GovernedDoc,
  ItemEditFlag,
  ItemPatch,
  ItemState,
  NewItemInput,
  RenamedItem,
  SectionContent,
  WorkItem,
  WrittenPaths,
} from "../contract/types.ts";
import { DOC_TOOL_TREES } from "../contract/vocab.ts";
import { sectionsOf, splitDocument, structuralHeadings, withFields, withSectionText } from "../lib/frontmatter-write.ts";
import { allItems } from "../lib/generated.ts";
import { DESIGN_FILE } from "../lib/indexes.ts";
import { applyPatch, isItemPath, itemEditCommand, nextItemId, parseItemBatch, workCommitMessage } from "../lib/items.ts";
import { basenameOf, folderOf, numberedName, parseNumberedName, referencePatterns, slugify } from "../lib/names.ts";
import { ITEM_SECTIONS, itemTemplate, templateItemFlags, unwrittenItemFlags } from "../lib/templates.ts";
import { introducedDocProblems, pendingDocProblems } from "./check.ts";
import { ROLLED_BACK, regenerateIndexes, rollBack } from "./indexes.ts";
import type { PriorFiles } from "./tree.ts";
import {
  changedPaths,
  commitPaths,
  formattedDoc,
  governedPaths,
  highestHistoricId,
  mergeInProgress,
  readDoc,
  rewriteTextFiles,
  root,
  stagedWorkDeletions,
  stagePaths,
  TOOL_TRAILER,
  textFiles,
  today,
  uncommittedBoardPaths,
  uncommittedDocSources,
  writeDoc,
} from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc <item|set|land>");

/** The outcome every write verb reports: what it wrote, or why it wrote nothing. A landing verb also
 *  names what it SKIPPED (an item already done), which is neither a write nor a refusal. A `--commit`
 *  verb names the commit it made. A retitling `set` names the files it moved, and the moves whose two halves
 *  it staged. A `status superseded` names the lines that still cite the superseded doc. Every verb declares
 *  the paths it created, which a failed commit removes. */
export interface WriteOutcome extends WrittenPaths {
  readonly refusals: readonly string[];
  readonly skipped?: readonly string[];
  readonly committed?: string;
  readonly renamed?: readonly RenamedItem[];
  readonly stagedRenames?: readonly RenamedItem[];
  readonly citers?: readonly CitingLine[];
}

export function loadItems(repoRoot = root): readonly WorkItem[] {
  return allItems(governedPaths(repoRoot).map((path) => readDoc(path, repoRoot)));
}

/** The ids of the item files among `paths`, ascending and unique. */
function itemIdsOf(paths: readonly string[]): readonly number[] {
  const ids = paths.flatMap((path) => {
    const name = isItemPath(path) ? parseNumberedName(basenameOf(path)) : null;
    return name === null ? [] : [name.id];
  });
  return [...new Set(ids)].toSorted((left, right) => left - right);
}

/** The staged deletions that are a landing: the id has no item file left. A staged retitle deletes the old name
 *  while the item lives on under its new one, and a board commit carries both halves. */
function stagedLandings(repoRoot: string): readonly string[] {
  const live = new Set(loadItems(repoRoot).map((item) => item.id));
  return stagedWorkDeletions(repoRoot).filter((path) => {
    const name = parseNumberedName(basenameOf(path));
    return name === null || !live.has(name.id);
  });
}

/** What makes a board commit unsafe, checked BEFORE the verb writes anything: a merge waiting for its commit
 *  (a plumbing commit would drop its second parent), a staged landing (it would commit with no record and
 *  no `Closes:` line), and an uncommitted hand-owned doc (the swept indexes describe it, so a commit without
 *  it fails the docs check at HEAD). */
function commitBlockers(repoRoot: string): readonly string[] {
  if (mergeInProgress(repoRoot)) {
    return ["--commit cannot run while a merge waits for its commit (MERGE_HEAD exists) — commit the merge first"];
  }
  const staged = stagedLandings(repoRoot);
  if (staged.length > 0) {
    return [`--commit would commit the staged deletion of ${staged.join(", ")} with no landing record and no Closes: line — commit it first`];
  }
  const sources = uncommittedDocSources(repoRoot);
  return sources.length === 0 ? [] : [`--commit needs these docs committed first, because the generated indexes describe them: ${sources.join(", ")}`];
}

/** Every text file a board write can touch, with its bytes: the governed docs and the tracked files a retitle
 *  rewrites references in. Read before the write, so a failed commit can put each one back. */
function priorTextFiles(repoRoot: string): PriorFiles {
  return new Map(textFiles(repoRoot).map((path) => [path, readFileSync(join(repoRoot, path), "utf8")] as const));
}

/** `--commit`: commit what the verb wrote plus every other uncommitted change under docs/work/ and the
 *  generated indexes and task lists they feed, so a run of `set`s ends in one commit that passes the docs
 *  check. `commitPaths` builds the commit from HEAD plus exactly these paths, so any other staged or
 *  unstaged file stays out. A refused write commits nothing, and a write that changed nothing makes no
 *  commit and says so. A commit git refuses puts back every file the verb wrote, so the tree is as it was
 *  before the run — except when the commit reached history and HEAD moved on, where HEAD holds the files. */
function commitWork(outcome: WriteOutcome, prior: PriorFiles, repoRoot: string): WriteOutcome {
  if (outcome.refusals.length > 0) {
    return outcome;
  }
  const paths = [...new Set([...outcome.written, ...uncommittedBoardPaths(repoRoot)])];
  if (changedPaths(paths, repoRoot).length === 0) {
    return { written: outcome.written, created: outcome.created, refusals: [], skipped: ["nothing to commit — the write changed nothing"] };
  }
  const commit = commitPaths(paths, workCommitMessage(itemIdsOf(paths), TOOL_TRAILER), repoRoot);
  if (commit.ok) {
    return { written: paths, created: outcome.created, refusals: [], committed: commit.sha };
  }
  if ("stranded" in commit) {
    return {
      written: paths,
      created: outcome.created,
      refusals: [`the work commit failed after it reached history — ${commit.reason}. Read git log and git status before writing again`],
    };
  }
  rollBack(outcome, prior, repoRoot);
  return { written: [], created: [], refusals: [`the work commit failed — ${commit.reason}. ${ROLLED_BACK}`] };
}

/** Run a write verb, committing its result when the caller asked. With `commit`, the blockers refuse
 *  before `write` runs, so a refusal leaves the tree untouched. */
export function runWrite(commit: boolean, repoRoot: string, write: () => WriteOutcome): WriteOutcome {
  if (!commit) {
    return write();
  }
  const blockers = commitBlockers(repoRoot);
  if (blockers.length > 0) {
    return { written: [], created: [], refusals: blockers };
  }
  const prior = priorTextFiles(repoRoot);
  return commitWork(write(), prior, repoRoot);
}

function planExists(slug: string, repoRoot: string): boolean {
  return existsSync(join(repoRoot, DOC_TOOL_TREES.plans, slug, DESIGN_FILE));
}

/** The refusals an input earns before it has a path: an unknown plan, an empty title, two states, an
 *  authored section left blank or at its prompt. */
function inputProblems(input: NewItemInput, repoRoot: string): readonly string[] {
  const problems: string[] = [];
  if (input.plan !== null && !planExists(input.plan, repoRoot)) {
    problems.push(`${DOC_TOOL_TREES.plans}${input.plan}/${DESIGN_FILE}: no such plan — mint it with pnpm doc new plan ${input.plan}`);
  }
  if (slugify(input.title) === "") {
    problems.push(`"${input.title}": a title needs at least one word`);
  }
  if (input.lane !== null && (input.blocked ?? null) !== null) {
    problems.push(`"${input.title}": a lane makes an item doing and a blocker makes it blocked — name one`);
  }
  for (const flag of unwrittenItemFlags(input.content)) {
    problems.push(`"${input.title}": --${flag} (key \`${flag}\` in an --from file) needs real text, not a blank or the template prompt`);
  }
  return problems;
}

function mintedState(input: NewItemInput): ItemState {
  if ((input.blocked ?? null) !== null) {
    return "blocked";
  }
  return input.lane === null ? "open" : "doing";
}

function itemSource(input: NewItemInput, date: string): string {
  const blocked = input.blocked ?? null;
  const fields: Record<string, string> = { kind: input.kind, status: mintedState(input), updated: date };
  for (const [key, value] of [
    ["priority", input.priority],
    ["area", input.area],
    ["plan", input.plan],
    ["lane", input.lane],
    ["blocked", blocked],
  ] as const) {
    if (value !== null) {
      fields[key] = value;
    }
  }
  return formattedDoc(itemTemplate(fields, input.title, input.content));
}

/** Mint N items at consecutive ids, judged together and written together with one index regeneration. */
export function newItems(inputs: readonly NewItemInput[], repoRoot = root, date = today()): WriteOutcome {
  const early = inputs.flatMap((input) => inputProblems(input, repoRoot));
  if (early.length > 0) {
    return { written: [], created: [], refusals: early };
  }
  const first = nextItemId(loadItems(repoRoot), highestHistoricId("work", repoRoot));
  const pending: readonly GovernedDoc[] = inputs.map((input, index) => ({
    path: `${DOC_TOOL_TREES.work}${numberedName(first + index, slugify(input.title))}`,
    source: itemSource(input, date),
  }));
  const refusals = pendingDocProblems(pending, repoRoot);
  if (refusals.length > 0) {
    return { written: [], created: [], refusals };
  }
  for (const doc of pending) {
    writeDoc(doc.path, doc.source, repoRoot);
  }
  const minted = pending.map((doc) => doc.path);
  return { written: [...minted, ...regenerateIndexes(repoRoot)], created: minted, refusals: [] };
}

export function newItem(input: NewItemInput, repoRoot = root, date = today()): WriteOutcome {
  return newItems([input], repoRoot, date);
}

/** `item --from <file>`: the batch file is an argument, so an unreadable or malformed one is misuse (exit
 *  3); a relative path resolves from the repository root, where `pnpm doc` runs. */
export function newItemsFrom(from: string, repoRoot = root, date = today()): WriteOutcome {
  const abs = isAbsolute(from) ? from : join(repoRoot, from);
  if (!existsSync(abs)) {
    throw new UsageError(`item --from ${from}: no such file`);
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(abs, "utf8"));
  } catch (error) {
    throw new UsageError(`item --from ${from}: not JSON — ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  const batch = parseItemBatch(json);
  if ("error" in batch) {
    throw new UsageError(`item --from ${from}: not an item batch (a non-empty array of items)\n${batch.error}`);
  }
  return newItems(batch.items, repoRoot, date);
}

/** Point every reference to the doc at `from` at `to` instead: the folder-qualified name anywhere, the
 *  bare name inside the doc's own folder. Returns the files it changed. */
function rewriteReferences(from: string, to: string, repoRoot: string): readonly string[] {
  const { anywhere, sameFolder } = referencePatterns(from);
  const [toParent = "", toName = ""] = to.split("/").slice(-2);
  const folder = folderOf(from);
  return rewriteTextFiles((path, source) => {
    const qualified = source.replace(anywhere, () => `${toParent}/${toName}`);
    return path.startsWith(folder) && !path.slice(folder.length).includes("/") ? qualified.replace(sameFolder, () => toName) : qualified;
  }, repoRoot);
}

/** The edit one patch makes to one item: its patched text, at a new path when the title changes. */
function itemEdit(item: WorkItem, patch: ItemPatch, repoRoot: string, date: string): DocEdit | string {
  const source = formattedDoc(applyPatch(readDoc(item.path, repoRoot).source, item, patch, date));
  if (patch.title === undefined) {
    return { from: item.path, doc: { path: item.path, source } };
  }
  const slug = slugify(patch.title);
  if (slug === "") {
    return `"${patch.title}": a title needs at least one word`;
  }
  const path = `${folderOf(item.path)}${numberedName(item.id, slug)}`;
  if (path !== item.path && existsSync(join(repoRoot, path))) {
    return `${path}: exists`;
  }
  return { from: item.path, doc: { path, source } };
}

/** An item with no written What, Why and Done when carries no work a lane could take, so `doing` and
 *  `--lane` refuse it; `open` and `blocked` stay available, which keeps the board writable. */
function laneRefusals(items: readonly WorkItem[], patch: ItemPatch, repoRoot: string): readonly string[] {
  if (patch.state !== "doing" && typeof patch.lane !== "string") {
    return [];
  }
  return items.flatMap((item) => {
    const unwritten = templateItemFlags(splitDocument(readDoc(item.path, repoRoot).source).body);
    return unwritten.length === 0 ? [] : [`${String(item.id)}: still holds template text, so it cannot go to a lane — ${itemEditCommand(item.id, unwritten)}`];
  });
}

/** Apply one patch to N items. Each item's final shape is judged against the tree AFTER the patch, so a
 *  `blocked on 12` naming an item that exists passes and one naming nothing refuses. A new title renames
 *  the file and rewrites every reference to the old name. */
export function setItems(ids: readonly number[], patch: ItemPatch, repoRoot = root, date = today()): WriteOutcome {
  if (patch.state === "done") {
    return {
      written: [],
      created: [],
      refusals: [`done is reached by landing, which deletes the item: pnpm doc land ${ids.map(String).join(" ")} --evidence <sha>`],
    };
  }
  const byId = new Map(loadItems(repoRoot).map((item) => [item.id, item] as const));
  const refusals = ids.filter((id) => !byId.has(id)).map((id) => `${String(id)}: no such item under ${DOC_TOOL_TREES.work} — pnpm doc overview lists them`);
  const edits: DocEdit[] = [];
  refusals.push(
    ...laneRefusals(
      ids.flatMap((id) => byId.get(id) ?? []),
      patch,
      repoRoot,
    ),
  );
  for (const id of ids) {
    const item = byId.get(id);
    const edit = item === undefined ? null : itemEdit(item, patch, repoRoot, date);
    if (typeof edit === "string") {
      refusals.push(edit);
    } else if (edit !== null) {
      edits.push(edit);
    }
  }
  if (refusals.length > 0) {
    return { written: [], created: [], refusals };
  }
  const problems = introducedDocProblems(edits, repoRoot);
  if (problems.length > 0) {
    return { written: [], created: [], refusals: problems };
  }
  const written: string[] = [];
  const created: string[] = [];
  const renamed: RenamedItem[] = [];
  for (const { from, doc } of edits) {
    writeDoc(doc.path, doc.source, repoRoot);
    written.push(doc.path);
    if (from !== doc.path) {
      // `itemEdit` refuses a new name that exists, so the retitled file is this write's own.
      created.push(doc.path);
      rmSync(join(repoRoot, from));
      written.push(from, ...rewriteReferences(from, doc.path, repoRoot));
      renamed.push({ from, to: doc.path });
    }
  }
  return { written: [...new Set([...written, ...regenerateIndexes(repoRoot)])], created, refusals: [], renamed };
}

/** Stage both halves of every rename a retitling `set` made, in the checkout's real index, so the caller's own commit
 *  carries the old name's deletion and the new name's arrival together: committed apart, git history reads two items
 *  holding one id. Only the two item paths are staged. The references the retitle rewrote stay unstaged, because a
 *  file outside the board can hold a sibling's edits. A staging git refuses leaves the write in place and says so. */
export function stageRetitles(outcome: WriteOutcome, repoRoot = root): WriteOutcome {
  const renamed = outcome.renamed ?? [];
  if (renamed.length === 0) {
    return outcome;
  }
  const halves = renamed.flatMap(({ from, to }) => [from, to]);
  const staged = stagePaths(halves, repoRoot);
  return staged.ok
    ? { ...outcome, stagedRenames: renamed }
    : { ...outcome, skipped: [...(outcome.skipped ?? []), `staging the rename (${staged.reason}) — stage ${halves.join(" and ")} yourself, in one commit`] };
}

/** The section list of an item file, in order. */
function headingList(source: string): string {
  return structuralHeadings(splitDocument(source).body).join(" | ");
}

/** `source` with each given section body replaced, or the refusals: an item whose required sections do not
 *  all parse, or a text carrying a `#` or `##` heading. */
function replaceSections(
  path: string,
  source: string,
  sections: SectionContent<ItemEditFlag>,
): { readonly source: string } | { readonly refusals: readonly string[] } {
  const found = sectionsOf(splitDocument(source).body);
  const missing = ITEM_SECTIONS.filter((section) => !found.includes(section.name));
  if (missing.length > 0) {
    return { refusals: missing.map((section) => `${path}: has no ## ${section.name} section — every item carries one; restore it by hand`) };
  }
  let next = source;
  const refusals: string[] = [];
  const unwritten = unwrittenItemFlags(sections);
  for (const section of ITEM_SECTIONS) {
    const text = section.flag === null ? undefined : sections[section.flag];
    if (text === undefined) {
      continue;
    }
    if (unwritten.some((flag) => flag === section.flag)) {
      refusals.push(`${path}: the ${section.name} text is blank or the template prompt — --${section.flag} takes real text`);
      continue;
    }
    const headings = structuralHeadings(text);
    if (headings.length > 0) {
      refusals.push(`${path}: the ${section.name} text carries a heading line (${headings.join(", ")}) — a section body holds none; fence it or drop it`);
      continue;
    }
    next = withSectionText(next, section.name, text) ?? next;
  }
  return refusals.length > 0 ? { refusals } : { source: next };
}

/** Replace the body of the named sections of ONE item and judge the result like a `set`. The title, the
 *  fields except `updated` and the other sections keep their text; the final format pass may still
 *  normalise a sibling section that was not canonical. Every required section must parse first, so an unclosed
 *  fence that hides a sibling cannot delete it. The `#` and `##` headings must come out as they went in, read
 *  after the format pass so an indented or setext heading counts: new text with a heading, or text that opens a
 *  fence it never closes, refuses, because `introducedDocProblems` only subtracts findings the item already has and
 *  would let such an edit through on an item that is already red. */
export function editItem(id: number, sections: SectionContent<ItemEditFlag>, repoRoot = root, date = today()): WriteOutcome {
  const item = loadItems(repoRoot).find((candidate) => candidate.id === id);
  if (item === undefined) {
    return { written: [], created: [], refusals: [`${String(id)}: no such item under ${DOC_TOOL_TREES.work} — pnpm doc overview lists them`] };
  }
  const original = readDoc(item.path, repoRoot).source;
  const replaced = replaceSections(item.path, original, sections);
  if ("refusals" in replaced) {
    return { written: [], created: [], refusals: replaced.refusals };
  }
  const edit: DocEdit = { from: item.path, doc: { path: item.path, source: formattedDoc(withFields(replaced.source, { updated: date })) } };
  if (headingList(edit.doc.source) !== headingList(original)) {
    return {
      written: [],
      created: [],
      refusals: [
        `${item.path}: the edit would change its sections from [${headingList(original)}] to [${headingList(edit.doc.source)}] — check the text for an unclosed code fence`,
      ],
    };
  }
  const problems = introducedDocProblems([edit], repoRoot);
  if (problems.length > 0) {
    return { written: [], created: [], refusals: problems };
  }
  writeDoc(edit.doc.path, edit.doc.source, repoRoot);
  return { written: [item.path, ...regenerateIndexes(repoRoot)], created: [], refusals: [] };
}

/** What `show` found: the item files by id in the order given, and a refusal per id with no item. */
export interface ShownItems {
  readonly shown: readonly GovernedDoc[];
  readonly refusals: readonly string[];
}

/** Read items by id. Read-only; an unknown id refuses by name and the others still come back. */
export function showItems(ids: readonly number[], repoRoot = root): ShownItems {
  const byId = new Map(loadItems(repoRoot).map((item) => [item.id, item] as const));
  const shown: GovernedDoc[] = [];
  const refusals: string[] = [];
  for (const id of new Set(ids)) {
    const item = byId.get(id);
    if (item === undefined) {
      refusals.push(`${String(id)}: no such item under ${DOC_TOOL_TREES.work} — pnpm doc overview lists them`);
    } else {
      shown.push(readDoc(item.path, repoRoot));
    }
  }
  return { shown, refusals };
}
