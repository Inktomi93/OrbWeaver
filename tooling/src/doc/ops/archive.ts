// `pnpm doc archive <plan-slug|item-id…>`: move a finished plan to `docs/plans/archive/<today>-<slug>/`
// with its done items, set it `archived`, and rewrite the old folder path in every tracked text file so
// no link or citation dangles. A done item with no plan is deleted when named; git keeps it. A plan with
// unfinished items refuses — archiving is not a way to lose work.
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DOC_TOOL_TREES } from "#doc-catalog";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { withFields } from "../lib/frontmatter-write.ts";
import { DESIGN_FILE, PLAN_ARCHIVE_DIR } from "../lib/indexes.ts";
import { basenameOf } from "../lib/names.ts";
import { regenerateIndexes } from "./indexes.ts";
import type { WriteOutcome } from "./items.ts";
import { loadItems } from "./items.ts";
import { readDoc, rewriteTextFiles, root, today, writeDoc } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc archive <plan-slug|item-id…>");

const ID_RE = /^\d+$/u;

/** Replace every occurrence of `from` with `to` in the text files that carry it. */
function rewritePaths(from: string, to: string, repoRoot: string): readonly string[] {
  return rewriteTextFiles((_path, source) => source.replaceAll(from, to), repoRoot);
}

function archivePlan(slug: string, repoRoot: string, date: string): WriteOutcome {
  const fromDir = `${DOC_TOOL_TREES.plans}${slug}/`;
  if (!existsSync(join(repoRoot, fromDir, DESIGN_FILE))) {
    return { written: [], refusals: [`${fromDir}: no such plan`] };
  }
  const items = loadItems(repoRoot).filter((item) => item.plan === slug);
  const open = items.filter((item) => item.state !== "done");
  if (open.length > 0) {
    return { written: [], refusals: open.map((item) => `${item.path}: ${item.state}, and a plan archives only when every item is done`) };
  }
  const toDir = `${PLAN_ARCHIVE_DIR}${date}-${slug}/`;
  if (existsSync(join(repoRoot, toDir))) {
    return { written: [], refusals: [`${toDir}: exists`] };
  }
  mkdirSync(join(repoRoot, PLAN_ARCHIVE_DIR), { recursive: true });
  renameSync(join(repoRoot, fromDir), join(repoRoot, toDir));
  const written = [toDir];
  for (const item of items) {
    const target = `${toDir}${basenameOf(item.path)}`;
    renameSync(join(repoRoot, item.path), join(repoRoot, target));
    written.push(...rewritePaths(item.path, target, repoRoot));
  }
  const design = `${toDir}${DESIGN_FILE}`;
  writeDoc(design, withFields(readDoc(design, repoRoot).source, { status: "archived", updated: date }), repoRoot);
  written.push(...rewritePaths(fromDir, toDir, repoRoot));
  return { written: [...new Set([...written, ...regenerateIndexes(repoRoot)])], refusals: [] };
}

function archiveItem(id: number, repoRoot: string): WriteOutcome {
  const item = loadItems(repoRoot).find((candidate) => candidate.id === id);
  if (item === undefined) {
    return { written: [], refusals: [`${String(id)}: no such item`] };
  }
  if (item.state !== "done") {
    return { written: [], refusals: [`${item.path}: ${item.state}, and only a done item archives`] };
  }
  if (item.plan !== null) {
    return { written: [], refusals: [`${item.path}: belongs to plan ${item.plan} and moves with it — pnpm doc archive ${item.plan}`] };
  }
  rmSync(join(repoRoot, item.path));
  return { written: [item.path, ...regenerateIndexes(repoRoot)], refusals: [] };
}

export function archive(targets: readonly string[], repoRoot = root, date = today()): WriteOutcome {
  const written: string[] = [];
  const refusals: string[] = [];
  for (const target of targets) {
    const outcome = ID_RE.test(target) ? archiveItem(Number(target), repoRoot) : archivePlan(target, repoRoot, date);
    written.push(...outcome.written);
    refusals.push(...outcome.refusals);
  }
  return { written, refusals };
}
