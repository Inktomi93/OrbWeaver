// The work-item verbs: mint (`item`, `item --from`), transition and edit (`set`); landing is
// `ops/land.ts`. Every verb takes a list, validates only the FINAL shape of each item, writes the item
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
import { allItems } from "../lib/generated.ts";
import { DESIGN_FILE } from "../lib/indexes.ts";
import { applyPatch, nextItemId, parseItemBatch } from "../lib/items.ts";
import { folderOf, numberedName, referencePatterns, slugify } from "../lib/names.ts";
import { itemTemplate } from "../lib/templates.ts";
import { introducedDocProblems, pendingDocProblems } from "./check.ts";
import { regenerateIndexes } from "./indexes.ts";
import { formattedDoc, governedPaths, readDoc, rewriteTextFiles, root, today, writeDoc } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc <item|set|land>");

/** The outcome every write verb reports: what it wrote, or why it wrote nothing. A landing verb also
 *  names what it SKIPPED (an item already done), which is neither a write nor a refusal. */
export interface WriteOutcome {
  readonly written: readonly string[];
  readonly refusals: readonly string[];
  readonly skipped?: readonly string[];
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
  if (patch.state === "done") {
    return { written: [], refusals: [`done is reached by landing, which deletes the item: pnpm doc land ${ids.map(String).join(" ")} --evidence <sha>`] };
  }
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
