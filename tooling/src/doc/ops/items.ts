// The work-item verbs: mint (`item`), transition (`set`), land (`land`, `land --merged`). Every verb takes
// a list, validates only the FINAL shape of each item, writes the item files as whole-block rewrites and
// regenerates the indexes. A refusal writes nothing — a batch is all-or-nothing so a half-landed list can
// never be mistaken for a landed one.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DOC_TOOL_TREES } from "#doc-catalog";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ItemKind, ItemPatch, WorkItem } from "../contract/types.ts";
import { closesTrailer } from "../lib/drift.ts";
import { allItems } from "../lib/generated.ts";
import { DESIGN_FILE } from "../lib/indexes.ts";
import { applyPatch, itemShapeProblems, nextItemId, parseItem } from "../lib/items.ts";
import { ID_WIDTH, numberedName, slugify } from "../lib/names.ts";
import { itemTemplate } from "../lib/templates.ts";
import { regenerateIndexes } from "./indexes.ts";
import { commitOnMain, commitPaths, governedPaths, headCommit, isMainBranch, mergedCommits, readDoc, root, today, writeDoc } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc <item|set|land>");

/** The outcome every write verb reports: what it wrote, or why it wrote nothing. A landing verb also
 *  names what it SKIPPED (an item already done), which is neither a write nor a refusal. */
export interface WriteOutcome {
  readonly written: readonly string[];
  readonly refusals: readonly string[];
  readonly skipped?: readonly string[];
}

export interface LandOutcome extends WriteOutcome {
  readonly skipped: readonly string[];
}

export function loadItems(repoRoot = root): readonly WorkItem[] {
  return allItems(governedPaths(repoRoot).map((path) => readDoc(path, repoRoot)));
}

function planExists(slug: string, repoRoot: string): boolean {
  return existsSync(join(repoRoot, DOC_TOOL_TREES.plans, slug, DESIGN_FILE));
}

export interface NewItemInput {
  readonly title: string;
  readonly kind: ItemKind;
  readonly priority: string | null;
  readonly area: string | null;
  readonly plan: string | null;
  readonly lane: string | null;
}

export function newItem(input: NewItemInput, repoRoot = root, date = today()): WriteOutcome {
  if (input.plan !== null && !planExists(input.plan, repoRoot)) {
    return { written: [], refusals: [`${DOC_TOOL_TREES.plans}${input.plan}/${DESIGN_FILE}: no such plan — mint it with pnpm doc new plan ${input.plan}`] };
  }
  const slug = slugify(input.title);
  if (slug === "") {
    return { written: [], refusals: [`"${input.title}": a title needs at least one word`] };
  }
  const id = nextItemId(loadItems(repoRoot));
  const path = `${DOC_TOOL_TREES.work}${numberedName(id, slug)}`;
  const fields: Record<string, string> = { kind: input.kind, status: input.lane === null ? "open" : "doing", updated: date };
  for (const [key, value] of [
    ["priority", input.priority],
    ["area", input.area],
    ["plan", input.plan],
    ["lane", input.lane],
  ] as const) {
    if (value !== null) {
      fields[key] = value;
    }
  }
  const source = itemTemplate(fields, input.title);
  const item = parseItem(path, source);
  const problems = item === null ? [`${path}: the minted item did not parse`] : itemShapeProblems(item, new Set());
  if (problems.length > 0) {
    return { written: [], refusals: problems };
  }
  writeDoc(path, source, repoRoot);
  return { written: [path, ...regenerateIndexes(repoRoot)], refusals: [] };
}

/** Apply one patch to N items. Each item's final shape is judged against the tree AFTER the patch, so a
 *  `blocked on 12` naming an item that exists passes and one naming nothing refuses. */
export function setItems(ids: readonly number[], patch: ItemPatch, repoRoot = root, date = today()): WriteOutcome {
  const items = loadItems(repoRoot);
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const known = new Set(items.map((item) => item.id));
  const refusals = ids.filter((id) => !byId.has(id)).map((id) => `${String(id)}: no such item under ${DOC_TOOL_TREES.work} — pnpm doc overview lists them`);
  const writes: { readonly path: string; readonly source: string }[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item === undefined) {
      continue;
    }
    const source = applyPatch(readDoc(item.path, repoRoot).source, item, patch, date);
    const next = parseItem(item.path, source);
    refusals.push(...(next === null ? [`${item.path}: the patched item did not parse`] : itemShapeProblems(next, known)));
    writes.push({ path: item.path, source });
  }
  if (refusals.length > 0) {
    return { written: [], refusals };
  }
  for (const write of writes) {
    writeDoc(write.path, write.source, repoRoot);
  }
  return { written: [...writes.map((write) => write.path), ...regenerateIndexes(repoRoot)], refusals: [] };
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
