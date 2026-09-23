// The orchestrator's drift nag as a pure rule over resolved git facts (`ops/tree.ts` gathers them). Four
// checks, each line carrying the exact fixing command; an empty result means the item state and the
// tree agree, and the SessionStart hook then prints nothing at all.
import type { DriftFacts, WorkItem } from "../contract/types.ts";
import { parseBlocker } from "./items.ts";

function laneIsLive(item: WorkItem, facts: DriftFacts): boolean {
  const lane = item.lane;
  if (lane === null) {
    return false;
  }
  return facts.worktreeBranches.some((branch) => branch.includes(lane)) || facts.unmergedBranches.some((branch) => branch.includes(lane));
}

function staleDoing(facts: DriftFacts): readonly string[] {
  return facts.items
    .filter((item) => item.state === "doing" && !laneIsLive(item, facts))
    .map(
      (item) =>
        `${String(item.id)} is doing under lane ${item.lane ?? "(none)"} with no live worktree and no unmerged branch — pnpm doc set ${String(item.id)} open`,
    );
}

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
        `main commit ${commit.sha} closes ${pending.map(String).join(", ")} but the item is not done — pnpm doc land ${pending.map(String).join(" ")} --evidence ${commit.sha}`,
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

/** The wake commands to run, keyed by item id — the one impure step, resolved by the caller. */
export function wakeCommands(items: readonly WorkItem[]): ReadonlyMap<number, string> {
  const commands = new Map<number, string>();
  for (const item of items) {
    const blocker = item.state === "blocked" && item.blocked !== null ? parseBlocker(item.blocked) : null;
    if (blocker?.kind === "wake") {
      commands.set(item.id, blocker.command);
    }
  }
  return commands;
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
