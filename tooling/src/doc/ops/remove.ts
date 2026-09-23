// `pnpm doc remove <id…>`: delete work items filed by mistake. A mistaken item has no history worth
// keeping, so only an item nothing depends on goes: a done item is a landing record (`archive` retires
// it), and an item another doc links to or another item is blocked on refuses, naming each dependent.
// All-or-nothing, then the indexes regenerate.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DOC_TOOL_TREES } from "#doc-catalog";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { WorkItem } from "../contract/types.ts";
import { isGeneratedPath } from "../lib/indexes.ts";
import { parseBlocker } from "../lib/items.ts";
import { folderOf, referencePatterns } from "../lib/names.ts";
import { regenerateIndexes } from "./indexes.ts";
import type { WriteOutcome } from "./items.ts";
import { loadItems } from "./items.ts";
import { root, textFiles } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc remove <id…>");

/** True when `source` (the text of the file at `path`) refers to the doc at `target`. */
function refersTo(path: string, source: string, target: string): boolean {
  const { anywhere, sameFolder } = referencePatterns(target);
  const folder = folderOf(target);
  const inFolder = path.startsWith(folder) && !path.slice(folder.length).includes("/");
  return anywhere.test(source) || (inFolder && sameFolder.test(source));
}

function dependents(targets: readonly WorkItem[], items: readonly WorkItem[], repoRoot: string): readonly string[] {
  const removing = new Set(targets.map((item) => item.path));
  const ids = new Set(targets.map((item) => item.id));
  const refusals: string[] = [];
  for (const item of items) {
    const blocker = item.blocked === null ? null : parseBlocker(item.blocked);
    if (!removing.has(item.path) && blocker?.kind === "on" && ids.has(blocker.id)) {
      refusals.push(`${item.path}: blocked on ${String(blocker.id)} — change its blocker first: pnpm doc set ${String(item.id)} open`);
    }
  }
  for (const path of textFiles(repoRoot)) {
    if (removing.has(path) || isGeneratedPath(path)) {
      continue;
    }
    const source = readFileSync(join(repoRoot, path), "utf8");
    for (const target of targets) {
      if (refersTo(path, source, target.path)) {
        refusals.push(`${path}: refers to ${target.path} — remove the reference first`);
      }
    }
  }
  return refusals;
}

export function removeItems(ids: readonly number[], repoRoot = root): WriteOutcome {
  const items = loadItems(repoRoot);
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const refusals = ids.flatMap((id) => {
    const item = byId.get(id);
    if (item === undefined) {
      return [`${String(id)}: no such item under ${DOC_TOOL_TREES.work} — pnpm doc overview lists them`];
    }
    return item.state === "done" ? [`${item.path}: done, and a landing is a record — pnpm doc archive ${String(id)} retires it`] : [];
  });
  if (refusals.length > 0) {
    return { written: [], refusals };
  }
  const targets = ids.flatMap((id) => {
    const item = byId.get(id);
    return item === undefined ? [] : [item];
  });
  const blocked = dependents(targets, items, repoRoot);
  if (blocked.length > 0) {
    return { written: [], refusals: blocked };
  }
  for (const target of targets) {
    rmSync(join(repoRoot, target.path));
  }
  return { written: [...targets.map((target) => target.path), ...regenerateIndexes(repoRoot)], refusals: [] };
}
