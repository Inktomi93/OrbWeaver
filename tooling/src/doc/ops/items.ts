// The work-item verbs: mint (`item`, `item --from`), transition and edit (`set`), land (`land`,
// `land --merged`). Every verb takes a list, validates only the FINAL shape of each item, writes the item
// files as whole-block rewrites and regenerates the indexes once. A refusal writes nothing — a batch is
// all-or-nothing so a half-landed list can never be mistaken for a landed one. Every write is judged by
// the docs check itself (shape, sections, caps, writing rules, references) before the first byte lands:
// a mint through `pendingDocProblems`, an edit through `introducedDocProblems`.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { DOC_TOOL_TREES } from "#doc-catalog";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { UsageError } from "../../_shared/run-tool.ts";
import type { DocEdit, GovernedDoc, ItemPatch, ItemState, NewItemInput, WorkItem } from "../contract/types.ts";
import { closesTrailer } from "../lib/drift.ts";
import { allItems } from "../lib/generated.ts";
import { DESIGN_FILE } from "../lib/indexes.ts";
import { applyPatch, nextItemId, parseItemBatch } from "../lib/items.ts";
import { folderOf, ID_WIDTH, numberedName, referencePatterns, slugify } from "../lib/names.ts";
import { itemTemplate } from "../lib/templates.ts";
import { introducedDocProblems, pendingDocProblems } from "./check.ts";
import { regenerateIndexes } from "./indexes.ts";
import {
  commitOnMain,
  commitPaths,
  formattedDoc,
  governedPaths,
  headCommit,
  isMainBranch,
  mergedCommits,
  readDoc,
  rewriteTextFiles,
  root,
  today,
  writeDoc,
} from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc <item|set|land>");

/** The outcome every write verb reports: what it wrote, or why it wrote nothing. A landing verb also
 *  names what it SKIPPED (an item already done), which is neither a write nor a refusal. */
export interface WriteOutcome {
  readonly written: readonly string[];
  readonly refusals: readonly string[];
  readonly skipped?: readonly string[];
}

interface LandOutcome extends WriteOutcome {
  readonly skipped: readonly string[];
}

export function loadItems(repoRoot = root): readonly WorkItem[] {
  return allItems(governedPaths(repoRoot).map((path) => readDoc(path, repoRoot)));
}

function planExists(slug: string, repoRoot: string): boolean {
  return existsSync(join(repoRoot, DOC_TOOL_TREES.plans, slug, DESIGN_FILE));
}

/** The refusals an input earns before it has a path: an unknown plan, an empty title, two states. */
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
    return { written: [], refusals: early };
  }
  const first = nextItemId(loadItems(repoRoot));
  const pending: readonly GovernedDoc[] = inputs.map((input, index) => ({
    path: `${DOC_TOOL_TREES.work}${numberedName(first + index, slugify(input.title))}`,
    source: itemSource(input, date),
  }));
  const refusals = pendingDocProblems(pending, repoRoot);
  if (refusals.length > 0) {
    return { written: [], refusals };
  }
  for (const doc of pending) {
    writeDoc(doc.path, doc.source, repoRoot);
  }
  return { written: [...pending.map((doc) => doc.path), ...regenerateIndexes(repoRoot)], refusals: [] };
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

/** Apply one patch to N items. Each item's final shape is judged against the tree AFTER the patch, so a
 *  `blocked on 12` naming an item that exists passes and one naming nothing refuses. A new title renames
 *  the file and rewrites every reference to the old name. */
export function setItems(ids: readonly number[], patch: ItemPatch, repoRoot = root, date = today()): WriteOutcome {
  const byId = new Map(loadItems(repoRoot).map((item) => [item.id, item] as const));
  const refusals = ids.filter((id) => !byId.has(id)).map((id) => `${String(id)}: no such item under ${DOC_TOOL_TREES.work} — pnpm doc overview lists them`);
  const edits: DocEdit[] = [];
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
    return { written: [], refusals };
  }
  const problems = introducedDocProblems(edits, repoRoot);
  if (problems.length > 0) {
    return { written: [], refusals: problems };
  }
  const written: string[] = [];
  for (const { from, doc } of edits) {
    writeDoc(doc.path, doc.source, repoRoot);
    written.push(doc.path);
    if (from !== doc.path) {
      rmSync(join(repoRoot, from));
      written.push(from, ...rewriteReferences(from, doc.path, repoRoot));
    }
  }
  return { written: [...new Set([...written, ...regenerateIndexes(repoRoot)])], refusals: [] };
}

const SHORT_SHA = 12;

/** `done` plus evidence, with the evidence proven reachable from `main` first. IDEMPOTENT: an item that
 *  is already done is skipped and keeps its original evidence, so a repeated trailer (a redo, a warm leg)
 *  never rewrites a landing or mints a second landing commit. */
export function landItems(ids: readonly number[], evidence: string, repoRoot = root, date = today()): LandOutcome {
  if (!commitOnMain(evidence, repoRoot)) {
    return { written: [], refusals: [`${evidence}: not a commit reachable from main — land names the merge or the landed commit itself`], skipped: [] };
  }
  const done = new Map(
    loadItems(repoRoot)
      .filter((item) => item.state === "done")
      .map((item) => [item.id, item] as const),
  );
  const skipped = ids.flatMap((id) => {
    const item = done.get(id);
    return item === undefined ? [] : [`${item.path}: already done at ${(item.evidence ?? "").slice(0, SHORT_SHA)}`];
  });
  const pending = ids.filter((id) => !done.has(id));
  if (pending.length === 0) {
    return { written: [], refusals: [], skipped };
  }
  return { ...setItems(pending, { state: "done", evidence }, repoRoot, date), skipped };
}

const HOOK_TRAILER = "Co-Authored-By: pnpm doc <doc-tool@orbweaver.invalid>";

/** The post-merge door. On `main`, read the `Closes:` trailers of the commits the merge brought in, land
 *  those ids with the merge commit as evidence, and commit the item files. Anywhere else, or with no
 *  trailer, it does nothing and says nothing. ALL-OR-NOTHING: an id no item carries refuses the whole
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
  const known = new Set(loadItems(repoRoot).map((item) => item.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    const byHand = ids.filter((id) => known.has(id));
    const fix = byHand.length === 0 ? "" : `, then pnpm doc land ${byHand.map(String).join(" ")} --evidence ${head}`;
    return {
      written: [],
      refusals: unknown.map(
        (id) => `${String(id)}: a merged commit closes it but no such item exists under ${DOC_TOOL_TREES.work} — fix the trailer's id${fix}`,
      ),
      skipped: [],
    };
  }
  const outcome = landItems(ids, head, repoRoot, date);
  if (outcome.refusals.length > 0 || outcome.written.length === 0) {
    return outcome;
  }
  const landed = ids.filter((id) => !outcome.skipped.some((line) => line.includes(`/${String(id).padStart(ID_WIDTH, "0")}-`)));
  const message = `chore(work): land ${landed.map(String).join(", ")}\n\n${HOOK_TRAILER}`;
  if (!commitPaths(outcome.written, message, repoRoot)) {
    return {
      ...outcome,
      refusals: [
        `the landing commit failed — the item files are written; commit them by hand: git commit -m "chore(work): land ${landed.map(String).join(", ")}" -- ${outcome.written.join(" ")}`,
      ],
    };
  }
  return outcome;
}
