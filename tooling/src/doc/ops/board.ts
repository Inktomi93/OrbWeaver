// The read verbs over the items: `overview` (the column view, every state named with its count so an
// empty column is a fact and not an omission) and `drift` (the orchestrator nag over resolved git facts).
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { DriftFacts, WorkItem } from "../contract/types.ts";
import { closesTrailer, driftLines, wakeCommands } from "../lib/drift.ts";
import { padId } from "../lib/names.ts";
import { loadItems } from "./items.ts";
import { recentMainCommits, root, unmergedBranches, wakeMet, worktreeBranches } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc <overview|drift>");

const STATES: readonly WorkItem["state"][] = ["open", "doing", "blocked", "done"];

function tail(item: WorkItem): string {
  if (item.state === "doing") {
    return item.lane ?? "";
  }
  if (item.state === "blocked") {
    return item.blocked ?? "";
  }
  return item.area ?? "";
}

/** Open items sort triage (no priority) first, then by priority, then by id; the rest by id. */
function ordered(items: readonly WorkItem[]): readonly WorkItem[] {
  return items.toSorted((left, right) => {
    if (left.state === "open" && right.state === "open" && (left.priority === null) !== (right.priority === null)) {
      return left.priority === null ? -1 : 1;
    }
    return (left.priority ?? "").localeCompare(right.priority ?? "") || left.id - right.id;
  });
}

export function overviewLines(items: readonly WorkItem[]): readonly string[] {
  const lines: string[] = [];
  for (const state of STATES) {
    const bucket = ordered(items.filter((item) => item.state === state));
    lines.push(`${state} (${String(bucket.length)})`);
    if (state === "done") {
      continue;
    }
    for (const item of bucket) {
      const extra = tail(item);
      lines.push(
        `  ${padId(item.id)} [${item.priority ?? "triage"}] ${item.title}${item.plan === null ? "" : ` {${item.plan}}`}${extra === "" ? "" : ` (${extra})`}`,
      );
    }
  }
  return lines;
}

export function overview(repoRoot = root): readonly string[] {
  return overviewLines(loadItems(repoRoot));
}

export function driftFacts(repoRoot = root): DriftFacts {
  const items = loadItems(repoRoot);
  const woken = new Set<number>();
  for (const [id, command] of wakeCommands(items)) {
    if (wakeMet(command, repoRoot)) {
      woken.add(id);
    }
  }
  return {
    items,
    worktreeBranches: worktreeBranches(repoRoot),
    unmergedBranches: unmergedBranches(repoRoot),
    closedOnMain: recentMainCommits(repoRoot).map((commit) => ({ sha: commit.sha, ids: closesTrailer(commit.message) })),
    wokenItems: woken,
  };
}

export function drift(repoRoot = root): readonly string[] {
  return driftLines(driftFacts(repoRoot));
}
