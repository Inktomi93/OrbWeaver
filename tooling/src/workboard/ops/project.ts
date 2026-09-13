// Project/issue resolution + the field-write seam. The quota discipline lives here: an issue resolves
// through a TARGETED walk (never a project enumeration), and the project's field/option ids are cached
// on disk — stable but not immortal, so any stale-looking failure earns exactly ONE refetch-and-retry.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type {
  EncodedWrite,
  Field,
  FieldChange,
  GraphqlVariables,
  Issue,
  IssueContext,
  ItemState,
  ProjectContext,
  RawFieldNode,
  RawIssueNode,
} from "../contract/types.ts";
import { ADD_QUERY, BLOCKERS_QUERY, CONTEXT_QUERY, dependencyMutation, ISSUE_ID_QUERY, ISSUE_STATES_QUERY, PROJECT_QUERY } from "../lib/queries.ts";
import { CACHE_DIR, CACHE_FILE, PROJECT_NUMBER, PROJECT_OWNER, REPO_NAME, REPOSITORY, STALE_CONTEXT_RE } from "../lib/vocab.ts";
import { applyLocally, buildFieldMutation, currentValue, encodeWrite, itemFields, pendingChange } from "../lib/writes.ts";
import { graphql } from "./gh.ts";

refuseDirectInvocation(import.meta.url, "pnpm work:item <command>");

function fetchProjectContext(): ProjectContext {
  const data = graphql<{
    readonly user?: { readonly projectV2?: { readonly id: string; readonly fields: { readonly nodes: readonly RawFieldNode[] } } | null } | null;
  }>(PROJECT_QUERY, { owner: PROJECT_OWNER, number: PROJECT_NUMBER });
  const project = data.user?.projectV2;
  if (project === undefined || project === null) {
    throw new Error(`Project ${PROJECT_NUMBER} was not found for ${PROJECT_OWNER}`);
  }
  const fields: Field[] = [];
  for (const node of project.fields.nodes) {
    if (node.id === undefined || node.name === undefined) {
      continue;
    }
    fields.push(
      node.options === undefined
        ? { id: node.id, name: node.name, type: node.__typename }
        : { id: node.id, name: node.name, type: node.__typename, options: node.options },
    );
  }
  const context: ProjectContext = { owner: PROJECT_OWNER, projectNumber: PROJECT_NUMBER, projectId: project.id, fields };
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(context));
  return context;
}

function projectContext(fresh: boolean): ProjectContext {
  if (!fresh) {
    // @orb-waive caught-failure-ownership(catch): the comment states the intent directly — a missing or corrupt cache file falls through to fetchProjectContext() below, which is the real source of truth; the cache is purely an optimization. Ends if this stops falling through to the cold fetch.
    try {
      const cached = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as ProjectContext;
      if (cached.owner === PROJECT_OWNER && cached.projectNumber === PROJECT_NUMBER && typeof cached.projectId === "string" && Array.isArray(cached.fields)) {
        return cached;
      }
    } catch {
      // an absent or unreadable cache falls through to the cold fetch
    }
  }
  return fetchProjectContext();
}

/** One refetch-and-retry on any stale-looking failure, then the error is real. */
export function withProjectContext<T>(operation: (context: ProjectContext) => T): T {
  const context = projectContext(false);
  try {
    return operation(context);
  } catch (error) {
    if (error instanceof Error && STALE_CONTEXT_RE.test(error.message)) {
      return operation(projectContext(true));
    }
    throw error;
  }
}

export function fetchIssueContext(number: number): IssueContext {
  const data = graphql<{ readonly repository?: { readonly issue?: RawIssueNode | null } | null }>(CONTEXT_QUERY, {
    owner: PROJECT_OWNER,
    repo: REPO_NAME,
    number,
  });
  const issue = data.repository?.issue;
  if (issue === undefined || issue === null) {
    throw new Error(`#${number} was not found in ${REPOSITORY}`);
  }
  const target: Issue = {
    id: issue.id,
    number: issue.number,
    ...(issue.title === undefined ? {} : { title: issue.title }),
    url: issue.url,
    state: issue.state,
    body: issue.body ?? "",
    comments: issue.comments.nodes,
    // GitHub does NOT remove a blockedBy edge when the blocking issue closes — the edge is a durable
    // relation, not a live-blocker signal — so a closed blocker must be filtered here or every reader
    // of `blockers` (the lifecycle guard, reports) inherits the lie that the row is still blocked.
    blockers: issue.blockedBy.nodes.filter((blocked) => blocked.state !== "CLOSED").map((blocked) => blocked.number),
  };
  const node = issue.projectItems.nodes.find((candidate) => candidate.project.number === PROJECT_NUMBER);
  if (node === undefined) {
    return { target };
  }
  return { target, item: { id: node.id, projectId: node.project.id, fields: itemFields(node.fieldValues.nodes) } };
}

export function writeFields(item: ItemState, changes: readonly FieldChange[], operationName: string): void {
  const pending = changes.filter((change) => pendingChange(item, change));
  if (pending.length === 0) {
    return;
  }
  const writes: readonly EncodedWrite[] = withProjectContext((context) => {
    const encoded = pending.map((change) => encodeWrite(context.fields, change));
    const request = buildFieldMutation(operationName, item, encoded);
    graphql(request.query, request.variables);
    return encoded;
  });
  for (const write of writes) {
    applyLocally(item, write);
  }
}

export function setField(item: ItemState, name: string, value: string): void {
  writeFields(item, [{ name, value }], name.toLowerCase() === "status" ? "WorkItemStatus" : "WorkItemFields");
}

export function transitionStatusLast(item: ItemState, status: string, changes: readonly FieldChange[]): void {
  // Status is the commit marker; an interrupted command remains safe to rerun from its source state.
  writeFields(item, changes, "WorkItemFields");
  setField(item, "Status", status);
}

export function transitionToReady(item: ItemState): void {
  transitionStatusLast(item, "Ready", [{ name: "Wake condition" }, { name: "Disposition", value: "Action" }]);
}

function addItem(target: Issue): ItemState {
  return withProjectContext((context) => {
    const data = graphql<{ readonly addProjectV2ItemById?: { readonly item?: { readonly id: string } } }>(ADD_QUERY, {
      project: context.projectId,
      content: target.id,
    });
    const id = data.addProjectV2ItemById?.item?.id;
    if (id === undefined) {
      throw new Error(`Project ${PROJECT_NUMBER} did not accept #${target.number}`);
    }
    return { id, projectId: context.projectId, fields: {} };
  });
}

/** Adopt raw ingress: an issue with no Project item, or one missing Status/Disposition, is normalised to
 *  Triage/Untriaged before any lifecycle guard reads it. */
export function ensureItem(target: Issue, existing: ItemState | undefined): ItemState {
  const item = existing ?? addItem(target);
  if (currentValue(item, "Status") !== undefined && currentValue(item, "Disposition") !== undefined) {
    return item;
  }
  transitionStatusLast(item, "Triage", [{ name: "Disposition", value: "Untriaged" }]);
  return item;
}

export function fetchBlockers(number: number): readonly number[] {
  const data = graphql<{
    readonly repository?: {
      readonly issue?: { readonly blockedBy: { readonly nodes: readonly { readonly number: number; readonly state: "OPEN" | "CLOSED" }[] } } | null;
    } | null;
  }>(BLOCKERS_QUERY, { owner: PROJECT_OWNER, repo: REPO_NAME, number });
  // Same closed-edge filter as fetchIssueContext — GitHub keeps a blockedBy edge after the blocker closes.
  return (data.repository?.issue?.blockedBy.nodes ?? []).filter((node) => node.state !== "CLOSED").map((node) => node.number);
}

export function blockerIssueId(number: number): string {
  const data = graphql<{ readonly repository?: { readonly issue?: { readonly id: string } | null } | null }>(ISSUE_ID_QUERY, {
    owner: PROJECT_OWNER,
    repo: REPO_NAME,
    number,
  });
  const id = data.repository?.issue?.id;
  if (id === undefined) {
    throw new Error(`#${number} was not found in ${REPOSITORY}`);
  }
  return id;
}

export function mutateDependency(issueId: string, blockingIssueId: string, remove: boolean): void {
  graphql(dependencyMutation(remove), { issueId, blockingIssueId });
}

/** EVERY issue in the repository, number → state, in ONE paged walk (#2156's bulk door).
 *
 *  WHY IT IS BULK AND NOT A LOOP OVER `fetchIssueContext`. The board-citation census asks about hundreds of
 *  numbers per run — the refutation ledger alone cites 326 — and the targeted walk pulls a body, 100
 *  comments and every project item per call. This selection is two scalar fields, so the whole repository
 *  fits in ~24 pages. It REFUSES an empty first page rather than returning an empty map: a map with nothing
 *  in it answers "OPEN? unknown" for every citation, which reads to a caller exactly like a clean board.
 *
 *  IT ANSWERS THE ISSUE'S OWN FIELD, never the Project `Status`. The two disagree on the live tree (a row
 *  whose work landed can still sit `Running` until a lane transitions it), and a citation's claim is about
 *  the ISSUE. `list`'s Status stays the lifecycle view; this is the state view. */
export function fetchIssueStates(): ReadonlyMap<number, "OPEN" | "CLOSED"> {
  const states = new Map<number, "OPEN" | "CLOSED">();
  let cursor: string | undefined;
  do {
    const base = { owner: PROJECT_OWNER, repo: REPO_NAME };
    const variables: GraphqlVariables = cursor === undefined ? base : { ...base, cursor };
    const page = graphql<{
      readonly repository?: {
        readonly issues: {
          readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
          readonly nodes: readonly { readonly number: number; readonly state: "OPEN" | "CLOSED" }[];
        };
      } | null;
    }>(ISSUE_STATES_QUERY, variables).repository?.issues;
    if (page === undefined) {
      throw new Error(`Could not resolve the issues of ${REPOSITORY}`);
    }
    for (const node of page.nodes) {
      states.set(node.number, node.state);
    }
    cursor = page.pageInfo.hasNextPage && typeof page.pageInfo.endCursor === "string" ? page.pageInfo.endCursor : undefined;
  } while (cursor !== undefined);
  if (states.size === 0) {
    throw new Error(`${REPOSITORY} reported ZERO issues — an empty state map answers every citation "unknown", which is not a verdict`);
  }
  return states;
}
