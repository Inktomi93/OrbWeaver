// work-item — the Project 1 operator CLI: show/list/create plus the lifecycle verbs and their guards,
// resolving each issue via a targeted GraphQL walk with self-healing cached project/field ids.
// Lifecycle law: .claude/rules/orchestration.md §Work control quick path. Exit: 0 clean · 2 tool · 3 misuse.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PROJECT_OWNER = "Inktomi93";
const REPO_NAME = "orbweaver";
const REPOSITORY = `${PROJECT_OWNER}/${REPO_NAME}`;
const PROJECT_NUMBER = 1;
const ISSUE_RE = /^\d+$/u;
const ISSUE_URL_RE = /\/issues\/(\d+)$/u;
// Primary exhaustion (RATE_LIMITED type / remaining=0) reports the reset timestamp; secondary limits
// (403/429 with a "secondary rate limit" message per GitHub's REST-API troubleshooting docs) never honor
// that timestamp — GitHub does not expose Retry-After through `gh`'s text output, so the operator
// instruction is the documented fallback backoff (wait ≥1 minute, then exponential backoff on repeats).
const SECONDARY_RATE_LIMIT_RE = /secondary rate limit/iu;
const PRIMARY_RATE_LIMIT_RE = /rate limit|RATE_LIMITED/iu;
// "does not belong to" is GitHub's live wording for a stale cached single-select OPTION id
// (updateProjectV2ItemFieldValue rejects an option id that no longer belongs to its field).
const STALE_CONTEXT_RE = /could not resolve|no field named|no option named|does not belong to/iu;
const EXIT_TOOL = 2;
const EXIT_MISUSE = 3;
const CREATE_OPTION_COUNT = 4;
const MS_PER_SECOND = 1000;
const LIFECYCLE_FIELDS = new Set(["status", "evidence", "lane", "wake condition", "disposition"]);
const REQUIRED_READY_METADATA = ["Kind", "Priority", "Area", "Review"];
const TERMINAL_DISPOSITIONS = new Set(["killed", "already resolved"]);
const ISSUE_CLASSES = {
  work: { labels: ["kind:build", "triage"], projectKind: "Work", review: undefined, status: "Triage" },
  bug: { labels: ["bug", "triage"], projectKind: "Work", review: undefined, status: "Triage" },
  decision: { labels: ["kind:decision", "needs-owner", "triage"], projectKind: "Decision", review: "Owner", status: "Needs owner" },
  program: { labels: ["kind:design", "triage"], projectKind: "Program", review: undefined, status: "Triage" },
  evidence: { labels: ["kind:finding", "triage"], projectKind: "Evidence", review: undefined, status: "Triage" },
} as const;

// biome-ignore lint/style/noProcessEnv: WORK_ITEM_CACHE_DIR is the test seam for the project-context cache directory — harness plumbing, not app config.
const CACHE_DIR = process.env["WORK_ITEM_CACHE_DIR"] ?? join(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), ".claude", "cache");
const CACHE_FILE = join(CACHE_DIR, "work-item-project.json");

const FIELD_VALUE_FRAGMENTS = `
            ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
            ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }`;

const CONTEXT_QUERY = `query WorkItemContext($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      id number title url state
      comments(last: 100) { nodes { body } }
      blockedBy(first: 100) { nodes { number } }
      projectItems(first: 10) {
        nodes {
          id
          project { id number }
          fieldValues(first: 50) { nodes {${FIELD_VALUE_FRAGMENTS}
          } }
        }
      }
    }
  }
}`;

const PROJECT_QUERY = `query WorkItemProject($owner: String!, $number: Int!) {
  user(login: $owner) {
    projectV2(number: $number) {
      id
      fields(first: 50) {
        nodes {
          __typename
          ... on ProjectV2FieldCommon { id name }
          ... on ProjectV2SingleSelectField { options { id name } }
        }
      }
    }
  }
}`;

const LIST_QUERY = `query WorkItemList($project: ID!, $cursor: String) {
  node(id: $project) {
    ... on ProjectV2 {
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          content { ... on Issue { number title url } ... on PullRequest { number title url } ... on DraftIssue { title } }
          fieldValues(first: 50) { nodes {${FIELD_VALUE_FRAGMENTS}
          } }
        }
      }
    }
  }
}`;

const ADD_QUERY = `mutation WorkItemAdd($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
}`;

const BLOCKERS_QUERY = `query WorkItemBlockers($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) { issue(number: $number) { blockedBy(first: 100) { nodes { number } } } }
}`;

const ISSUE_ID_QUERY = `query WorkItemIssueId($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) { issue(number: $number) { id } }
}`;

type IssueClass = keyof typeof ISSUE_CLASSES;

class WorkItemUsageError extends Error {}

interface FieldOption {
  readonly id: string;
  readonly name: string;
}

interface Field {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly options?: readonly FieldOption[];
}

interface ProjectContext {
  readonly owner: string;
  readonly projectNumber: number;
  readonly projectId: string;
  readonly fields: readonly Field[];
}

interface Issue {
  readonly id: string;
  readonly number: number;
  readonly title?: string;
  readonly url: string;
  readonly state: "OPEN" | "CLOSED";
  readonly comments: readonly { readonly body: string }[];
  readonly blockers: readonly number[];
}

interface ItemState {
  readonly id: string;
  readonly projectId: string;
  readonly fields: Record<string, string>;
}

interface WorkItemContext {
  readonly target: Issue;
  readonly item: ItemState;
}

type LifecycleCommand =
  | { readonly kind: "claim"; readonly issue: number; readonly lane: string }
  | { readonly kind: "ready" | "review" | "needs-owner"; readonly issue: number }
  | { readonly kind: "set"; readonly issue: number; readonly field: string; readonly value: string }
  | { readonly kind: "verify" | "done"; readonly issue: number; readonly evidence: string }
  | { readonly kind: "park"; readonly issue: number; readonly wake: string }
  | { readonly kind: "block"; readonly issue: number; readonly blocker: number }
  | { readonly kind: "unblock"; readonly issue: number; readonly blocker: number };

interface CreateCommand {
  readonly kind: "create";
  readonly issueClass: IssueClass;
  readonly title: string;
  readonly bodyFile: string;
}

interface ListCommand {
  readonly kind: "list";
  readonly status?: string;
}

export type WorkCommand = { readonly kind: "help" } | { readonly kind: "show"; readonly issue: number } | ListCommand | CreateCommand | LifecycleCommand;

function execOutput(error: unknown, channel: "stdout" | "stderr"): string {
  if (typeof error !== "object" || error === null) {
    return "";
  }
  const value = (error as Record<string, unknown>)[channel];
  return typeof value === "string" ? value : "";
}

function graphqlResetTime(): string {
  // The REST rate_limit endpoint is free — probing it never spends the budget it reports.
  try {
    const payload = JSON.parse(execFileSync("gh", ["api", "rate_limit"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })) as {
      readonly resources?: { readonly graphql?: { readonly reset?: number } };
    };
    const reset = payload.resources?.graphql?.reset;
    return typeof reset === "number" ? new Date(reset * MS_PER_SECOND).toISOString() : "the top of the hour";
  } catch {
    return "the top of the hour";
  }
}

function ghFailure(error: unknown, args: readonly string[]): Error {
  const detail = `${execOutput(error, "stderr")}\n${execOutput(error, "stdout")}`.trim();
  if (args[0] === "api" && args[1] === "graphql" && SECONDARY_RATE_LIMIT_RE.test(detail)) {
    return new Error(
      "GitHub GraphQL secondary rate limit hit; GitHub does not expose Retry-After through this tool, so back off per its documented guidance — wait at least one minute, then retry with exponential backoff if it fails again. Rerun this exact command after backing off.",
    );
  }
  if (args[0] === "api" && args[1] === "graphql" && PRIMARY_RATE_LIMIT_RE.test(detail)) {
    return new Error(`GitHub GraphQL rate limit exhausted; it resets at ${graphqlResetTime()}. Rerun this exact command after the reset.`);
  }
  if (detail !== "") {
    return new Error(detail);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function gh(args: readonly string[]): string {
  try {
    return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    throw ghFailure(error, args);
  }
}

type GraphqlVariables = Readonly<Record<string, string | number>>;

function graphql<T>(query: string, variables: GraphqlVariables): T {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [name, value] of Object.entries(variables)) {
    args.push(typeof value === "number" ? "-F" : "-f", `${name}=${value}`);
  }
  const payload = JSON.parse(gh(args)) as { readonly data?: T };
  if (payload.data === undefined) {
    throw new Error("GitHub GraphQL returned no data");
  }
  return payload.data;
}

function issueNumber(raw: string | undefined): number {
  const number = Number(raw);
  if (raw === undefined || !ISSUE_RE.test(raw) || !Number.isSafeInteger(number) || number <= 0) {
    throw new WorkItemUsageError("issue must be a positive numeric issue number");
  }
  return number;
}

function option(args: readonly string[], name: string): string {
  const [flag, value, ...extra] = args;
  if (flag !== name || value === undefined || value.startsWith("--") || value.trim() === "") {
    throw new WorkItemUsageError(`${name} requires a value`);
  }
  if (extra.length > 0) {
    throw new WorkItemUsageError(`${name} accepts exactly one value`);
  }
  return value;
}

function parseSet(issue: number, args: readonly string[]): WorkCommand {
  const [fieldName, value, ...extra] = args;
  if (fieldName === undefined || value === undefined || extra.length > 0) {
    throw new WorkItemUsageError("set requires exactly one field name and value");
  }
  if (LIFECYCLE_FIELDS.has(fieldName.toLowerCase())) {
    throw new WorkItemUsageError(`set cannot modify lifecycle-controlled field ${fieldName}`);
  }
  return { kind: "set", issue, field: fieldName, value };
}

function issueClass(value: string | undefined): IssueClass {
  if (value !== undefined && value in ISSUE_CLASSES) {
    return value as IssueClass;
  }
  throw new WorkItemUsageError("create kind must be work, bug, decision, program, or evidence");
}

function createOption(args: readonly string[], flag: string): string {
  const index = args.indexOf(flag);
  const value = args[index + 1];
  if (index === -1 || value === undefined || value.startsWith("--") || value.trim() === "") {
    throw new WorkItemUsageError(`${flag} requires a value`);
  }
  return value;
}

function createOptions(args: readonly string[]): Pick<CreateCommand, "title" | "bodyFile"> {
  if (
    args.length !== CREATE_OPTION_COUNT ||
    args.filter((value) => value === "--title").length !== 1 ||
    args.filter((value) => value === "--body-file").length !== 1
  ) {
    throw new WorkItemUsageError("create requires --title and --body-file");
  }
  return { title: createOption(args, "--title").trim(), bodyFile: createOption(args, "--body-file") };
}

function parseList(args: readonly string[]): ListCommand {
  if (args.length === 0) {
    return { kind: "list" };
  }
  return { kind: "list", status: option(args, "--status") };
}

function parseLifecycle(name: string | undefined, issue: number, rest: readonly string[]): WorkCommand {
  if (name === "show" || name === "ready" || name === "review" || name === "needs-owner") {
    if (rest.length > 0) {
      throw new WorkItemUsageError(`${name} does not accept additional arguments`);
    }
    return { kind: name, issue };
  }
  if (name === "claim") {
    return { kind: name, issue, lane: option(rest, "--lane") };
  }
  if (name === "set") {
    return parseSet(issue, rest);
  }
  if (name === "verify" || name === "done") {
    return { kind: name, issue, evidence: option(rest, "--evidence") };
  }
  if (name === "park") {
    return { kind: name, issue, wake: option(rest, "--wake") };
  }
  if (name === "block" || name === "unblock") {
    return { kind: name, issue, blocker: issueNumber(option(rest, "--by")) };
  }
  throw new WorkItemUsageError("command must be help, show, create, claim, ready, review, needs-owner, set, verify, done, park, block, or unblock");
}

export function parseWorkCommand(argv: readonly string[]): WorkCommand {
  const [name, rawIssue, ...rest] = argv;
  if (name === "help" || name === "--help") {
    if (rawIssue !== undefined) {
      throw new WorkItemUsageError(`${name} does not accept additional arguments`);
    }
    return { kind: "help" };
  }
  if (name === "create") {
    return { kind: name, issueClass: issueClass(rawIssue), ...createOptions(rest) };
  }
  if (name === "list") {
    return parseList(rawIssue === undefined ? rest : [rawIssue, ...rest]);
  }
  return parseLifecycle(name, issueNumber(rawIssue), rest);
}

interface RawFieldNode {
  readonly __typename: string;
  readonly id?: string;
  readonly name?: string;
  readonly options?: readonly FieldOption[];
}

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

// The cached project/field/option ids are stable but not immortal: one refetch-and-retry on any
// stale-looking failure, then the error is real.
function withProjectContext<T>(operation: (context: ProjectContext) => T): T {
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

interface FieldValueNode {
  readonly text?: string;
  readonly name?: string;
  readonly field?: { readonly name?: string };
}

function itemFields(nodes: readonly FieldValueNode[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const node of nodes) {
    const name = node.field?.name;
    const value = node.text ?? node.name;
    if (name !== undefined && typeof value === "string") {
      fields[name] = value;
    }
  }
  return fields;
}

interface IssueContext {
  readonly target: Issue;
  readonly item?: ItemState;
}

interface RawItemNode {
  readonly id: string;
  readonly project: { readonly id: string; readonly number: number };
  readonly fieldValues: { readonly nodes: readonly FieldValueNode[] };
}

interface RawIssueNode {
  readonly id: string;
  readonly number: number;
  readonly title?: string;
  readonly url: string;
  readonly state: "OPEN" | "CLOSED";
  readonly comments: { readonly nodes: readonly { readonly body: string }[] };
  readonly blockedBy: { readonly nodes: readonly { readonly number: number }[] };
  readonly projectItems: { readonly nodes: readonly RawItemNode[] };
}

function fetchIssueContext(number: number): IssueContext {
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
    comments: issue.comments.nodes,
    blockers: issue.blockedBy.nodes.map((blocked) => blocked.number),
  };
  const node = issue.projectItems.nodes.find((candidate) => candidate.project.number === PROJECT_NUMBER);
  if (node === undefined) {
    return { target };
  }
  return { target, item: { id: node.id, projectId: node.project.id, fields: itemFields(node.fieldValues.nodes) } };
}

function fieldOf(fields: Readonly<Record<string, string>>, name: string): string | undefined {
  return Object.entries(fields).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

function currentValue(item: ItemState, name: string): string | undefined {
  return fieldOf(item.fields, name);
}

function namedField(fields: readonly Field[], name: string): Field {
  const candidate = fields.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (candidate === undefined) {
    throw new Error(`Project ${PROJECT_NUMBER} has no field named ${name}`);
  }
  return candidate;
}

interface FieldChange {
  readonly name: string;
  readonly value?: string;
}

type EncodedWrite =
  | { readonly kind: "text" | "option"; readonly fieldId: string; readonly fieldName: string; readonly value: string; readonly local: string }
  | { readonly kind: "clear"; readonly fieldId: string; readonly fieldName: string };

function encodeWrite(fields: readonly Field[], change: FieldChange): EncodedWrite {
  const field = namedField(fields, change.name);
  if (change.value === undefined) {
    return { kind: "clear", fieldId: field.id, fieldName: field.name };
  }
  const value = change.value;
  if (field.type === "ProjectV2Field") {
    return { kind: "text", fieldId: field.id, fieldName: field.name, value, local: value };
  }
  if (field.type !== "ProjectV2SingleSelectField") {
    throw new Error(`${field.name} is not a writable text or single-select field`);
  }
  const selected = field.options?.find((choice) => choice.name.toLowerCase() === value.toLowerCase());
  if (selected === undefined) {
    throw new Error(`${field.name} has no option named ${value}`);
  }
  return { kind: "option", fieldId: field.id, fieldName: field.name, value: selected.id, local: selected.name };
}

function buildFieldMutation(
  operationName: string,
  item: ItemState,
  writes: readonly EncodedWrite[],
): { readonly query: string; readonly variables: GraphqlVariables } {
  const declarations = ["$project: ID!", "$item: ID!"];
  const operations: string[] = [];
  const variables: Record<string, string | number> = { project: item.projectId, item: item.id };
  for (const [index, write] of writes.entries()) {
    const fieldVariable = `f${index}`;
    declarations.push(`$${fieldVariable}: ID!`);
    variables[fieldVariable] = write.fieldId;
    if (write.kind === "clear") {
      operations.push(
        `  m${index}: clearProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $${fieldVariable} }) { clientMutationId }`,
      );
      continue;
    }
    const valueVariable = `v${index}`;
    declarations.push(`$${valueVariable}: String!`);
    variables[valueVariable] = write.value;
    const valueKind = write.kind === "text" ? "text" : "singleSelectOptionId";
    operations.push(
      `  m${index}: updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $${fieldVariable}, value: { ${valueKind}: $${valueVariable} } }) { clientMutationId }`,
    );
  }
  return { query: `mutation ${operationName}(${declarations.join(", ")}) {\n${operations.join("\n")}\n}`, variables };
}

function applyLocally(item: ItemState, write: EncodedWrite): void {
  const key = Object.keys(item.fields).find((candidate) => candidate.toLowerCase() === write.fieldName.toLowerCase()) ?? write.fieldName;
  if (write.kind === "clear") {
    Reflect.deleteProperty(item.fields, key);
    return;
  }
  item.fields[key] = write.local;
}

function pendingChange(item: ItemState, change: FieldChange): boolean {
  if (change.value === undefined) {
    return currentValue(item, change.name) !== undefined;
  }
  return currentValue(item, change.name)?.toLowerCase() !== change.value.toLowerCase();
}

function writeFields(item: ItemState, changes: readonly FieldChange[], operationName: string): void {
  const pending = changes.filter((change) => pendingChange(item, change));
  if (pending.length === 0) {
    return;
  }
  const writes = withProjectContext((context) => {
    const encoded = pending.map((change) => encodeWrite(context.fields, change));
    const request = buildFieldMutation(operationName, item, encoded);
    graphql(request.query, request.variables);
    return encoded;
  });
  for (const write of writes) {
    applyLocally(item, write);
  }
}

function setField(item: ItemState, name: string, value: string): void {
  writeFields(item, [{ name, value }], name.toLowerCase() === "status" ? "WorkItemStatus" : "WorkItemFields");
}

function transitionStatusLast(item: ItemState, status: string, changes: readonly FieldChange[]): void {
  // Status is the commit marker; an interrupted command remains safe to rerun from its source state.
  writeFields(item, changes, "WorkItemFields");
  setField(item, "Status", status);
}

function transitionToReady(item: ItemState): void {
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

function ensureItem(target: Issue, existing: ItemState | undefined): ItemState {
  const item = existing ?? addItem(target);
  if (currentValue(item, "Status") !== undefined && currentValue(item, "Disposition") !== undefined) {
    return item;
  }
  transitionStatusLast(item, "Triage", [{ name: "Disposition", value: "Untriaged" }]);
  return item;
}

function fetchBlockers(number: number): readonly number[] {
  const data = graphql<{
    readonly repository?: { readonly issue?: { readonly blockedBy: { readonly nodes: readonly { readonly number: number }[] } } | null } | null;
  }>(BLOCKERS_QUERY, { owner: PROJECT_OWNER, repo: REPO_NAME, number });
  return (data.repository?.issue?.blockedBy.nodes ?? []).map((node) => node.number);
}

function blockerIssueId(number: number): string {
  const data = graphql<{ readonly repository?: { readonly issue?: { readonly id: string } | null } | null }>(ISSUE_ID_QUERY, {
    owner: PROJECT_OWNER,
    repo: REPO_NAME,
    number,
  });
  const id = data.repository?.issue?.id;
  if (id === undefined || id === null) {
    throw new Error(`#${number} was not found in ${REPOSITORY}`);
  }
  return id;
}

function mutateDependency(issueId: string, blockingIssueId: string, remove: boolean): void {
  const mutation = remove ? "removeBlockedBy" : "addBlockedBy";
  graphql(
    `mutation WorkItemDependency($issueId: ID!, $blockingIssueId: ID!) { ${mutation}(input: { issueId: $issueId, blockingIssueId: $blockingIssueId }) { issue { id } } }`,
    {
      issueId,
      blockingIssueId,
    },
  );
}

function requireStatus(work: WorkItemContext, allowed: readonly string[], message: string): void {
  const status = currentValue(work.item, "Status");
  if (status === undefined || !allowed.some((value) => value.toLowerCase() === status.toLowerCase())) {
    throw new Error(message);
  }
}

function requireReadyMetadata(work: WorkItemContext, action: string): void {
  const missing = REQUIRED_READY_METADATA.filter((field) => (currentValue(work.item, field)?.trim() ?? "") === "");
  if (missing.length > 0) {
    throw new Error(`work item must set ${missing.join(", ")} before ${action}`);
  }
}

function requireUnblocked(target: Issue, message: string): void {
  if (target.blockers.length > 0) {
    throw new Error(message);
  }
}

function claim(work: WorkItemContext, command: Extract<WorkCommand, { readonly kind: "claim" }>): void {
  requireStatus(work, ["Ready", "Running"], "work item must be Ready before claim");
  requireUnblocked(work.target, "work item cannot be claimed while blocked");
  requireReadyMetadata(work, "claim");
  const currentLane = currentValue(work.item, "Lane");
  if (currentValue(work.item, "Status")?.toLowerCase() === "running" && currentLane !== undefined && currentLane !== command.lane) {
    throw new Error(`work item is already Running in lane ${currentLane}`);
  }
  gh(["issue", "edit", String(work.target.number), "--repo", REPOSITORY, "--add-assignee", "@me"]);
  transitionStatusLast(work.item, "Running", [{ name: "Lane", value: command.lane }]);
}

function ready(work: WorkItemContext): void {
  requireStatus(work, ["Triage", "Needs owner", "Blocked", "Parked", "Ready"], "work item must be Triage, Needs owner, Blocked, Parked, or Ready before Ready");
  requireUnblocked(work.target, "work item cannot become Ready while blocked");
  requireReadyMetadata(work, "Ready");
  transitionToReady(work.item);
}

function needsOwner(work: WorkItemContext): void {
  requireStatus(
    work,
    ["Triage", "Ready", "Running", "Blocked", "Needs owner"],
    "work item must be Triage, Ready, Running, Blocked, or Needs owner before Needs owner",
  );
  if (TERMINAL_DISPOSITIONS.has(currentValue(work.item, "Disposition")?.toLowerCase() ?? "")) {
    throw new Error("work item with a terminal Disposition cannot enter Needs owner");
  }
  transitionStatusLast(work.item, "Needs owner", [
    { name: "Review", value: "Owner" },
    { name: "Lane" },
    { name: "Wake condition" },
    { name: "Disposition", value: "Untriaged" },
  ]);
}

function review(work: WorkItemContext): void {
  requireStatus(work, ["Running", "Review"], "work item must be Running before Review");
  requireUnblocked(work.target, "work item cannot enter Review while blocked");
  transitionStatusLast(work.item, "Review", []);
}

function verify(work: WorkItemContext, evidence: string): void {
  requireStatus(work, ["Review", "Verify"], "work item must be Review before Verify");
  requireUnblocked(work.target, "work item cannot be verified while blocked");
  const currentEvidence = currentValue(work.item, "Evidence");
  if (currentValue(work.item, "Status")?.toLowerCase() === "verify" && currentEvidence !== undefined && currentEvidence !== evidence) {
    throw new Error("work item is already Verify with different Evidence");
  }
  transitionStatusLast(work.item, "Verify", [{ name: "Evidence", value: evidence }]);
}

function done(work: WorkItemContext, evidence: string): void {
  requireStatus(work, ["Verify", "Done"], "work item must be Verify before Done");
  requireUnblocked(work.target, "work item cannot be Done while blocked");
  if (currentValue(work.item, "Evidence")?.trim() !== evidence) {
    throw new Error("work item Evidence must match --evidence before Done");
  }
  const comment = `Verification evidence: ${evidence}`;
  if (!work.target.comments.some((item) => item.body === comment)) {
    gh(["issue", "comment", String(work.target.number), "--repo", REPOSITORY, "--body", comment]);
  }
  setField(work.item, "Status", "Done");
  if (work.target.state !== "CLOSED") {
    gh(["issue", "close", String(work.target.number), "--repo", REPOSITORY, "--reason", "completed"]);
  }
}

function block(work: WorkItemContext, command: Extract<WorkCommand, { readonly kind: "block" }>): void {
  if (!work.target.blockers.includes(command.blocker)) {
    mutateDependency(work.target.id, blockerIssueId(command.blocker), false);
  }
  setField(work.item, "Status", "Blocked");
}

function unblock(work: WorkItemContext, command: Extract<WorkCommand, { readonly kind: "unblock" }>): void {
  let remaining = work.target.blockers;
  if (remaining.includes(command.blocker)) {
    mutateDependency(work.target.id, blockerIssueId(command.blocker), true);
    remaining = fetchBlockers(work.target.number);
  }
  if (remaining.length === 0) {
    transitionToReady(work.item);
    return;
  }
  setField(work.item, "Status", "Blocked");
}

function show(issue: number): void {
  const context = fetchIssueContext(issue);
  if (context.item === undefined) {
    throw new Error(`#${issue} is not in Project ${PROJECT_NUMBER}`);
  }
  const payload = {
    id: context.item.id,
    content: { number: context.target.number, title: context.target.title, url: context.target.url },
    ...context.item.fields,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

interface ListRow {
  readonly content?: { readonly number?: number; readonly title?: string; readonly url?: string };
  readonly fields: Readonly<Record<string, string>>;
}

interface RawListPage {
  readonly node?: {
    readonly items?: {
      readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor?: string | null };
      readonly nodes: readonly {
        readonly content?: { readonly number?: number; readonly title?: string; readonly url?: string } | null;
        readonly fieldValues: { readonly nodes: readonly FieldValueNode[] };
      }[];
    };
  } | null;
}

function listItems(projectId: string): readonly ListRow[] {
  const rows: ListRow[] = [];
  let cursor: string | undefined;
  do {
    const variables: GraphqlVariables = cursor === undefined ? { project: projectId } : { project: projectId, cursor };
    const page = graphql<RawListPage>(LIST_QUERY, variables).node?.items;
    if (page === undefined) {
      throw new Error(`Could not resolve Project ${PROJECT_NUMBER} from the cached project id`);
    }
    for (const node of page.nodes) {
      const fields = itemFields(node.fieldValues.nodes);
      rows.push(node.content === undefined || node.content === null ? { fields } : { content: node.content, fields });
    }
    cursor = page.pageInfo.hasNextPage && typeof page.pageInfo.endCursor === "string" ? page.pageInfo.endCursor : undefined;
  } while (cursor !== undefined);
  return rows;
}

function list(status?: string): void {
  const rows = withProjectContext((context) => listItems(context.projectId));
  const items = rows
    .filter((row) => status === undefined || fieldOf(row.fields, "Status")?.toLowerCase() === status.toLowerCase())
    .toSorted((left, right) => (left.content?.number ?? Number.MAX_SAFE_INTEGER) - (right.content?.number ?? Number.MAX_SAFE_INTEGER))
    .map((row) => ({
      issue: row.content?.number,
      title: row.content?.title ?? fieldOf(row.fields, "Title"),
      status: fieldOf(row.fields, "Status"),
      kind: fieldOf(row.fields, "Kind"),
      priority: fieldOf(row.fields, "Priority"),
      area: fieldOf(row.fields, "Area"),
      review: fieldOf(row.fields, "Review"),
      disposition: fieldOf(row.fields, "Disposition"),
      lane: fieldOf(row.fields, "Lane"),
      evidence: fieldOf(row.fields, "Evidence"),
      wakeCondition: fieldOf(row.fields, "Wake condition"),
      url: row.content?.url,
    }));
  process.stdout.write(`${JSON.stringify({ items }, null, 2)}\n`);
}

function createdIssueNumber(output: string): number {
  const number = ISSUE_URL_RE.exec(output)?.[1];
  if (number === undefined) {
    throw new Error("gh issue create did not return an issue URL");
  }
  return issueNumber(number);
}

function create(command: CreateCommand): void {
  const bodyFile = resolve(command.bodyFile);
  if (readFileSync(bodyFile, "utf8").trim() === "") {
    throw new Error("body file must not be empty");
  }
  const issueConfig = ISSUE_CLASSES[command.issueClass];
  const output = gh([
    "issue",
    "create",
    "--repo",
    REPOSITORY,
    "--title",
    command.title,
    "--body-file",
    bodyFile,
    ...issueConfig.labels.flatMap((label) => ["--label", label]),
  ]);
  const number = createdIssueNumber(output);
  process.stdout.write(`created #${number} ${output}\n`);
  const context = fetchIssueContext(number);
  const item = ensureItem(context.target, context.item);
  const changes: FieldChange[] = [{ name: "Kind", value: issueConfig.projectKind }];
  if (issueConfig.review !== undefined) {
    changes.push({ name: "Review", value: issueConfig.review });
  }
  writeFields(item, changes, "WorkItemFields");
  setField(item, "Status", issueConfig.status);
  const next = command.issueClass === "decision" ? "set Priority, Area, and resolve the owner decision before ready" : "set Priority, Area, Review, then ready";
  process.stdout.write(`work-item — #${context.target.number} Project metadata initialized; ${next}\n`);
}

function help(): void {
  process.stdout.write(`work:item — Project 1 operator path
show <issue>
list [--status <status>]
create <work|bug|decision|program|evidence> --title <title> --body-file <file>
ready <issue> | claim <issue> --lane <lane> | review <issue> | needs-owner <issue> | set <issue> <field> <value>
block <issue> --by <blocker> | unblock <issue> --by <blocker> | park <issue> --wake <condition>
verify <issue> --evidence <receipt> | done <issue> --evidence <same-receipt>

Lifecycle: Triage → Ready → Running → Review → Verify → Done. Set Priority, Area, and Review before Ready. Decisions enter Needs owner. Interrupted transitions are safe to rerun. Use .github/ISSUE_TEMPLATE/*.yml for canonical issue bodies; Project holds mutable lifecycle state.\n`);
}

function runLifecycle(command: LifecycleCommand): void {
  const context = fetchIssueContext(command.issue);
  if (context.target.state === "CLOSED" && command.kind !== "done") {
    throw new Error("cannot change a closed work item");
  }
  const work: WorkItemContext = { target: context.target, item: ensureItem(context.target, context.item) };
  switch (command.kind) {
    case "claim":
      claim(work, command);
      break;
    case "ready":
      ready(work);
      break;
    case "review":
      review(work);
      break;
    case "needs-owner":
      needsOwner(work);
      break;
    case "set":
      setField(work.item, command.field, command.value);
      break;
    case "verify":
      verify(work, command.evidence);
      break;
    case "done":
      done(work, command.evidence);
      break;
    case "park":
      transitionStatusLast(work.item, "Parked", [
        { name: "Wake condition", value: command.wake },
        { name: "Disposition", value: "Parked" },
      ]);
      break;
    case "block":
      block(work, command);
      break;
    case "unblock":
      unblock(work, command);
      break;
  }
  process.stdout.write(`work-item — #${work.target.number} ${command.kind}\n`);
}

function run(command: WorkCommand): void {
  if (command.kind === "help") {
    help();
    return;
  }
  if (command.kind === "show") {
    show(command.issue);
    return;
  }
  if (command.kind === "list") {
    list(command.status);
    return;
  }
  if (command.kind === "create") {
    create(command);
    return;
  }
  runLifecycle(command);
}

function main(): void {
  try {
    run(parseWorkCommand(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = error instanceof WorkItemUsageError ? EXIT_MISUSE : EXIT_TOOL;
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.cwd(), process.argv[1])) {
  main();
}
