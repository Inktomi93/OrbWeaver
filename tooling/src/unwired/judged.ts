// Rows a board item owns: each reported row key maps to the docs/work item that fixes it, so a rerun reports
// those rows apart from the ones nobody has judged. An entry whose row no longer reports, or whose item is no
// longer open, is stale: `pnpm doc land` deletes a landed item's file, so an item is open while its file is in
// docs/work with a status other than done.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ItemState } from "../doc/index.ts";
import { parseItem } from "../doc/index.ts";

const JUDGED_TIES = ["member", "home"] as const;
/** What the evidence named: the row's member with its file or home, or its home as a unit with every row it had. */
type JudgedTie = (typeof JUDGED_TIES)[number];

/** One judged row: its report key, the item that owns its fix, and how the evidence tied the row to the item. */
export interface JudgedEntry {
  readonly key: string;
  readonly item: number;
  readonly tie: JudgedTie;
}

const STALE_REASONS = ["row-gone", "item-closed"] as const;
/** `row-gone`: no unexcused row carries the key. `item-closed`: the item landed or is done. */
type StaleReason = (typeof STALE_REASONS)[number];

/** A judged entry the list must drop or repoint. */
export interface StaleJudged extends JudgedEntry {
  readonly stale: StaleReason;
}

/** Every report's split of its unexcused rows: the ones nobody has judged, the judged ones with their item, and the
 *  entries that no longer hold. */
export interface JudgedSplit<Finding> {
  readonly unwired: readonly Finding[];
  readonly judged: readonly (Finding & { readonly item: number; readonly tie: JudgedTie })[];
  readonly staleJudged: readonly StaleJudged[];
}

const WORK_DIR = "docs/work";
const DONE: ItemState = "done";

/** The ids of the items in `root`'s docs/work that are still open. */
function openItems(root: string): ReadonlySet<number> {
  const dir = join(root, WORK_DIR);
  if (!existsSync(dir)) {
    return new Set();
  }
  const open = new Set<number>();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const item = name.endsWith(".md") ? parseItem(path, readFileSync(path, "utf8")) : null;
    if (item !== null && item.state !== DONE) {
      open.add(item.id);
    }
  }
  return open;
}

/** Split a report's unexcused `findings` by its judged list, reading which items are open from `root`'s docs/work. */
export function sortJudged<Finding extends { readonly key: string }>(
  findings: readonly Finding[],
  { root, judged: entries = [] }: { readonly root: string; readonly judged?: readonly JudgedEntry[] | undefined },
): JudgedSplit<Finding> {
  if (entries.length === 0) {
    return { unwired: findings, judged: [], staleJudged: [] };
  }
  const open = openItems(root);
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const reported = new Set(findings.map((finding) => finding.key));
  const unwired: Finding[] = [];
  const judged: (Finding & { readonly item: number; readonly tie: JudgedTie })[] = [];
  for (const finding of findings) {
    const entry = byKey.get(finding.key);
    if (entry !== undefined && open.has(entry.item)) {
      judged.push({ ...finding, item: entry.item, tie: entry.tie });
    } else {
      unwired.push(finding);
    }
  }
  const staleJudged = entries.flatMap((entry): StaleJudged[] => {
    if (!reported.has(entry.key)) {
      return [{ ...entry, stale: "row-gone" }];
    }
    return open.has(entry.item) ? [] : [{ ...entry, stale: "item-closed" }];
  });
  return { unwired, judged, staleJudged };
}
