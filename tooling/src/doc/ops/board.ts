// The read verbs over the items: `overview` (the column view, every state named with its count so an
// empty column is a fact and not an omission) and `drift` (the orchestrator nag over resolved git facts,
// the plans' lifecycle included).
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { DriftFacts, OverviewFilter, PlanState, WorkItem } from "../contract/types.ts";
import { PLAN_KIND } from "../contract/vocab.ts";
import { closesTrailer, driftLines, planWakeConditions, wakeConditions } from "../lib/drift.ts";
import { splitDocument } from "../lib/frontmatter-write.ts";
import { planSlugOf } from "../lib/indexes.ts";
import { basenameOf, padId } from "../lib/names.ts";
import { loadItems } from "./items.ts";
import { closingCommits, governedPaths, pathExists, readDoc, root, unmergedBranches, workFileNamesAt, worktreeBranches } from "./tree.ts";

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

const UNFILTERED: OverviewFilter = { states: [], area: null };

function overviewLines(items: readonly WorkItem[], filter: OverviewFilter): readonly string[] {
  const lines: string[] = [];
  const states = filter.states.length === 0 ? STATES : STATES.filter((state) => filter.states.some((named) => named === state));
  const inArea = filter.area === null ? items : items.filter((item) => item.area === filter.area);
  for (const state of states) {
    const bucket = ordered(inArea.filter((item) => item.state === state));
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

export function overview(repoRoot = root, filter = UNFILTERED): readonly string[] {
  return overviewLines(loadItems(repoRoot), filter);
}

/** Every plan design on the tree with the fields its lifecycle reads. */
export function loadPlans(repoRoot = root): readonly PlanState[] {
  return governedPaths(repoRoot).flatMap((path) => {
    const slug = planSlugOf(path);
    const fields = slug === null ? null : splitDocument(readDoc(path, repoRoot).source).fields;
    if (slug === null || fields?.["kind"] !== PLAN_KIND) {
      return [];
    }
    return [{ path, slug, status: fields["status"] ?? "", blocked: fields["blocked"] ?? null }];
  });
}

/** A `Closes: N` counts against today's item N only when the closer's parent held that same file (id and
 *  slug). A renumbering, such as a merge that renumbered another checkout's items, reuses N for a
 *  different item, and that item was never closed. Only ids still open on the tree pay for the git read. */
function closedOnMain(items: readonly WorkItem[], repoRoot: string): DriftFacts["closedOnMain"] {
  const open = new Map(items.flatMap((item) => (item.state === "done" ? [] : [[item.id, item] as const])));
  return closingCommits(repoRoot).map((commit) => {
    const ids = closesTrailer(commit.message);
    if (!ids.some((id) => open.has(id))) {
      return { sha: commit.sha, ids };
    }
    const atParent = new Set(workFileNamesAt(`${commit.sha}^`, repoRoot));
    return {
      sha: commit.sha,
      ids: ids.filter((id) => {
        const item = open.get(id);
        return item === undefined || atParent.has(basenameOf(item.path));
      }),
    };
  });
}

export function driftFacts(repoRoot = root): DriftFacts {
  const items = loadItems(repoRoot);
  const plans = loadPlans(repoRoot);
  // A wake condition is a tree fact (a path present or gone), never something to run.
  const met = (condition: { readonly presence: "path" | "gone"; readonly path: string }): boolean =>
    pathExists(condition.path, repoRoot) === (condition.presence === "path");
  const woken = new Set([...wakeConditions(items)].flatMap(([id, condition]) => (met(condition) ? [id] : [])));
  const wokenPlans = new Set([...planWakeConditions(plans)].flatMap(([slug, condition]) => (met(condition) ? [slug] : [])));
  return {
    items,
    plans,
    wokenPlans,
    worktreeBranches: worktreeBranches(repoRoot),
    unmergedBranches: unmergedBranches(repoRoot),
    closedOnMain: closedOnMain(items, repoRoot),
    wokenItems: woken,
  };
}

export function drift(repoRoot = root): readonly string[] {
  return driftLines(driftFacts(repoRoot));
}
