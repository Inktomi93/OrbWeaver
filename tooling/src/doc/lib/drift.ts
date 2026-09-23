// The orchestrator's drift nag as a pure rule over resolved git facts (`ops/tree.ts` gathers them). Four
// checks, each line carrying the exact fixing command; an empty result means the item state and the
// tree agree, and the SessionStart hook then prints nothing at all.
import type { Blocker, DriftFacts, WorkItem } from "../contract/types.ts";
import { parseBlocker } from "./items.ts";

/** A lane is its EXACT branch name (`.claude/rules/docs.md`): live when a worktree is on that branch
 *  or the branch is not yet merged. A substring match read every `codex/*` corpse as a live lane. */
function laneIsLive(item: WorkItem, facts: DriftFacts): boolean {
  const lane = item.lane;
  if (lane === null) {
    return false;
  }
  return facts.worktreeBranches.includes(lane) || facts.unmergedBranches.includes(lane);
}

function staleDoing(facts: DriftFacts): readonly string[] {
  return facts.items
    .filter((item) => item.state === "doing" && !laneIsLive(item, facts))
    .map(
      (item) =>
        `${String(item.id)} is doing under lane ${item.lane ?? "(none)"} with no live worktree and no unmerged branch — pnpm doc set ${String(item.id)} open`,
    );
}

/** A `main` commit whose trailer names an item that is not done. The common cause is named in the line:
 *  git runs no `post-merge` hook when a conflicted merge is concluded by `git commit`, so the auto-land
 *  never fired and the orchestrator lands by hand. */
function unlanded(facts: DriftFacts): readonly string[] {
  const byId = new Map(facts.items.map((item) => [item.id, item] as const));
  const seen = new Set<number>();
  const lines: string[] = [];
  for (const commit of facts.closedOnMain) {
    const pending = commit.ids.filter((id) => !seen.has(id) && byId.get(id)?.state !== "done");
    for (const id of pending) {
      seen.add(id);
    }
    if (pending.length > 0) {
      lines.push(
        `main commit ${commit.sha} closes ${pending.map(String).join(", ")} but the item is not done (a conflict-resolved merge runs no post-merge hook) — pnpm doc land ${pending.map(String).join(" ")} --evidence ${commit.sha}`,
      );
    }
  }
  return lines;
}

function blockerDone(facts: DriftFacts): readonly string[] {
  const byId = new Map(facts.items.map((item) => [item.id, item] as const));
  const lines: string[] = [];
  for (const item of facts.items) {
    const blocker = item.state === "blocked" && item.blocked !== null ? parseBlocker(item.blocked) : null;
    if (blocker?.kind === "on" && byId.get(blocker.id)?.state === "done") {
      lines.push(`${String(item.id)} is blocked on ${String(blocker.id)}, which is done — pnpm doc set ${String(item.id)} open`);
    }
  }
  return lines;
}

function woken(facts: DriftFacts): readonly string[] {
  return facts.items
    .filter((item) => item.state === "blocked" && facts.wokenItems.has(item.id))
    .map((item) => `${String(item.id)} has a met wake condition (${item.blocked ?? ""}) — pnpm doc set ${String(item.id)} open`);
}

/** Every drift line, in check order. Empty = consistent. */
export function driftLines(facts: DriftFacts): readonly string[] {
  return [...staleDoing(facts), ...unlanded(facts), ...blockerDone(facts), ...woken(facts)];
}

/** The wake conditions of the blocked items, keyed by item id — resolved against the TREE by the
 *  caller (a path exists or is gone), never by running anything. */
export function wakeConditions(items: readonly WorkItem[]): ReadonlyMap<number, Extract<Blocker, { readonly kind: "wake" }>> {
  const conditions = new Map<number, Extract<Blocker, { readonly kind: "wake" }>>();
  for (const item of items) {
    const blocker = item.state === "blocked" && item.blocked !== null ? parseBlocker(item.blocked) : null;
    if (blocker?.kind === "wake") {
      conditions.set(item.id, blocker);
    }
  }
  return conditions;
}

/** The `Closes: 12, 14` trailer of one commit message, as ids. Absent = empty. */
export function closesTrailer(message: string): readonly number[] {
  const ids: number[] = [];
  for (const line of message.split("\n")) {
    const match = /^Closes:\s*(.+?)\s*$/u.exec(line);
    if (match !== null) {
      ids.push(
        ...(match[1] ?? "")
          .split(",")
          .map((part) => Number(part.trim()))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      );
    }
  }
  return ids;
}
