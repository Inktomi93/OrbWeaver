// Project/issue resolution + the field-write seam. The quota discipline lives here: an issue resolves
// through a TARGETED walk (never a project enumeration), and the project's field/option ids are cached
// on disk — stable but not immortal, so any stale-looking failure earns exactly ONE refetch-and-retry.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type {
  BoardIssueRow,
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

/** The wire is UNTRUSTED INPUT. Every reader below names the field it refused, because a board read that
 *  half-answered is the one failure this whole census cannot survive silently. */
function wireObject(value: unknown, what: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${REPOSITORY} issue-state page: ${what} is not an object — the board read cannot be trusted`);
  }
  return value as Readonly<Record<string, unknown>>;
}

/** One page's validated nodes plus the cursor to follow, or `undefined` when the walk is genuinely over.
 *  `hasNextPage: true` with no usable `endCursor` is a TRUNCATED read and throws — it must never read as
 *  "the last page". */
function issueStatesPage(payload: unknown): { readonly nodes: readonly unknown[]; readonly nextCursor: string | undefined } {
  const repository = wireObject(payload, "the payload")["repository"];
  if (repository === null || repository === undefined) {
    throw new Error(`Could not resolve the issues of ${REPOSITORY}`);
  }
  const issues = wireObject(wireObject(repository, "repository")["issues"], "repository.issues");
  const nodes = issues["nodes"];
  if (!Array.isArray(nodes)) {
    throw new Error(`${REPOSITORY} issue-state page: nodes is not a list — the board read cannot be trusted`);
  }
  const pageInfo = wireObject(issues["pageInfo"], "repository.issues.pageInfo");
  const hasNextPage = pageInfo["hasNextPage"];
  if (typeof hasNextPage !== "boolean") {
    throw new Error(`${REPOSITORY} issue-state page: pageInfo.hasNextPage is not a boolean — the walk cannot know whether it is complete`);
  }
  if (!hasNextPage) {
    return { nodes, nextCursor: undefined };
  }
  const endCursor = pageInfo["endCursor"];
  if (typeof endCursor !== "string" || endCursor === "") {
    throw new Error(
      `${REPOSITORY} issue-state page: pageInfo says hasNextPage but carries no endCursor — the snapshot is TRUNCATED, which would report every id on the missing pages as a dangling citation`,
    );
  }
  return { nodes, nextCursor: endCursor };
}

/** One validated snapshot row. A cast is not a check: `state` is an exact two-member enum here because the
 *  citation judge rejects an openness claim on the literal `"CLOSED"` alone, so any third value silently
 *  SATISFIED the claim. */
function boardIssueRow(node: unknown, index: number): BoardIssueRow {
  const raw = wireObject(node, `node ${String(index)}`);
  const number = raw["number"];
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${REPOSITORY} issue-state page: node ${String(index)} has no positive integer issue number — the board read cannot be trusted`);
  }
  const state = raw["state"];
  if (state !== "OPEN" && state !== "CLOSED") {
    throw new Error(
      `${REPOSITORY} issue-state page: #${String(number)} reported state ${JSON.stringify(state)}, which is neither OPEN nor CLOSED — an unrecognised state satisfies an openness claim by accident`,
    );
  }
  const title = raw["title"];
  if (typeof title !== "string") {
    throw new Error(`${REPOSITORY} issue-state page: #${String(number)} has no string title — the citation subject join has nothing to read`);
  }
  const body = raw["body"];
  if (body !== null && body !== undefined && typeof body !== "string") {
    throw new Error(`${REPOSITORY} issue-state page: #${String(number)} has a non-string body — the citation subject join has nothing to read`);
  }
  return { number, state, title, body: body ?? "", onBoard: onBoard(raw["projectItems"], number) };
}

/** BOARD MEMBERSHIP, WITH ITS OWN TRUNCATION REFUSED (N4). `false` is a CLAIM — the judge turns it into a
 *  hard "this citation names no board row" finding — so it may only be returned when the wire actually
 *  enumerated every project this issue is on. A `projectItems` page that says `hasNextPage` without the
 *  match in its prefix is UNDECIDED, not off-board, and an undecided row is the exit-2 class.
 *
 *  WHAT THIS STILL CANNOT SEE, because nothing in the protocol distinguishes it: a wire that returns an
 *  HONEST-LOOKING empty list (`nodes: []`, `hasNextPage: false`) for an issue that IS on the board. That is
 *  successful-but-false data, it produces one false finding per row at exit 1 rather than a false clean,
 *  and it is recorded as a source-integrity assumption rather than papered over with a fraction threshold
 *  (an empty membership population is legitimate data on a repository that uses no project). */
function onBoard(raw: unknown, number: number): boolean {
  const items = wireObject(raw, `#${String(number)} projectItems`);
  const nodes = items["nodes"];
  if (!Array.isArray(nodes)) {
    throw new Error(`${REPOSITORY} issue-state page: #${String(number)} projectItems.nodes is not a list — board membership is unmeasured, not absent`);
  }
  if (nodes.some((item) => wireObject(wireObject(item, `#${String(number)} project item`)["project"], "project")["number"] === PROJECT_NUMBER)) {
    return true;
  }
  const truncated = wireObject(items["pageInfo"], `#${String(number)} projectItems.pageInfo`)["hasNextPage"];
  if (typeof truncated !== "boolean") {
    throw new Error(
      `${REPOSITORY} issue-state page: #${String(number)} projectItems.pageInfo.hasNextPage is not a boolean — this run cannot tell a truncated membership list from a complete one`,
    );
  }
  if (truncated) {
    throw new Error(
      `${REPOSITORY} issue-state page: #${String(number)} is on MORE projects than the query asked for and Project ${String(PROJECT_NUMBER)} was not in the page. ` +
        "Its membership is UNDECIDED, and reading that as off-board would make every citation of it a hard finding. Raise the projectItems page size in lib/queries.ts.",
    );
  }
  return false;
}

/** One raw page. The stdout ceiling is a PARAMETER so its overflow refusal is plantable; production passes
 *  nothing and takes the door's declared default (`ops/gh.ts#GH_MAX_BUFFER_BYTES`). */
function fetchStatesPage(cursor: string | undefined, maxBuffer: number | undefined): unknown {
  const base = { owner: PROJECT_OWNER, repo: REPO_NAME };
  const variables: GraphqlVariables = cursor === undefined ? base : { ...base, cursor };
  return maxBuffer === undefined ? graphql<unknown>(ISSUE_STATES_QUERY, variables) : graphql<unknown>(ISSUE_STATES_QUERY, variables, maxBuffer);
}

/** EVERY issue in the repository, number → row, in ONE paged walk (#2156's bulk door).
 *
 *  WHY IT IS BULK AND NOT A LOOP OVER `fetchIssueContext`. The board-citation census asks about hundreds of
 *  numbers per run — the refutation ledger alone cites 362 — and the targeted walk pulls a body, 100
 *  comments and every project item per call. This selection is five thin fields, so the whole repository
 *  fits in ~24 pages. It REFUSES an empty first page rather than returning an empty map: a map with nothing
 *  in it answers "OPEN? unknown" for every citation, which reads to a caller exactly like a clean board.
 *
 *  IT ANSWERS THE ISSUE'S OWN FIELD, never the Project `Status`. The two disagree on the live tree (a row
 *  whose work landed can still sit `Running` until a lane transitions it), and a citation's claim is about
 *  the ISSUE. `list`'s Status stays the lifecycle view; this is the state view.
 *
 *  EVERY PAGE IS VALIDATED AT THIS DOOR, and every refusal is the caller's exit-2 class (codex review F3/F4,
 *  2026-09-13). The GraphQL payload used to be CAST to its expected type, which is not a check: a wire
 *  `state` of `"STALE"` landed in the map and satisfied an openness claim, and a page announcing
 *  `hasNextPage: true` with a null `endCursor` silently TERMINATED the walk — a truncated snapshot then
 *  reports every id in the missing suffix as a dangling citation (a flood of false exit-1 findings) or,
 *  when the prefix happens to hold them all, exits 0 while knowing nothing. Both are unmeasurable runs, so
 *  both throw here rather than becoming a verdict downstream. */
export function fetchIssueStates(maxBuffer?: number): ReadonlyMap<number, BoardIssueRow> {
  const rows = new Map<number, BoardIssueRow>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = issueStatesPage(fetchStatesPage(cursor, maxBuffer));
    for (const [index, node] of page.nodes.entries()) {
      const row = boardIssueRow(node, index);
      if (rows.has(row.number)) {
        throw new Error(
          `${REPOSITORY} issue-state walk returned #${String(row.number)} TWICE — the pages do not describe one coherent snapshot, so this is a read to distrust, not a board`,
        );
      }
      rows.set(row.number, row);
    }
    cursor = page.nextCursor;
    if (cursor !== undefined) {
      if (seenCursors.has(cursor)) {
        throw new Error(`${REPOSITORY} issue-state walk was handed the cursor it already followed — a malformed response, not a page`);
      }
      seenCursors.add(cursor);
    }
  } while (cursor !== undefined);
  if (rows.size === 0) {
    throw new Error(`${REPOSITORY} reported ZERO issues — an empty state map answers every citation "unknown", which is not a verdict`);
  }
  if (![...rows.values()].some((row) => row.onBoard)) {
    throw new Error(
      `${REPOSITORY} reported ${String(rows.size)} issue(s) and NOT ONE is an item of Project ${String(PROJECT_NUMBER)} — the membership selection answered nothing, so every citation would read as off-board`,
    );
  }
  return rows;
}
