import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REPOSITORY = "Inktomi93/orbweaver";
const PROJECT_OWNER = "Inktomi93";
const PROJECT_NUMBER = "1";
const ISSUE_RE = /^\d+$/u;
const EXIT_TOOL = 2;
const EXIT_MISUSE = 3;
const LIFECYCLE_FIELDS = new Set(["status", "evidence", "lane", "wake condition", "disposition"]);

class WorkItemUsageError extends Error {}

interface Field {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly options?: readonly { readonly id: string; readonly name: string }[];
}

interface FieldValue {
  readonly field?: { readonly name?: string };
  readonly name?: string;
  readonly text?: string;
}

interface Project {
  readonly id: string;
}

interface ProjectItem {
  readonly id: string;
  readonly content?: { readonly number?: number; readonly url?: string };
  readonly fieldValues?: readonly FieldValue[];
}

interface Issue {
  readonly id: string;
  readonly number: number;
  readonly url: string;
  readonly state: "OPEN" | "CLOSED";
  readonly comments: readonly { readonly body: string }[];
}

interface WorkItemContext {
  readonly target: Issue;
  readonly item: ProjectItem;
  readonly project: Project;
  readonly fields: readonly Field[];
}

type LifecycleCommand =
  | { readonly kind: "claim"; readonly issue: number; readonly lane: string }
  | { readonly kind: "ready"; readonly issue: number }
  | { readonly kind: "set"; readonly issue: number; readonly field: string; readonly value: string }
  | { readonly kind: "verify" | "done"; readonly issue: number; readonly evidence: string }
  | { readonly kind: "park"; readonly issue: number; readonly wake: string }
  | { readonly kind: "block"; readonly issue: number; readonly blocker: number }
  | { readonly kind: "unblock"; readonly issue: number; readonly blocker: number };

export type WorkCommand = { readonly kind: "show"; readonly issue: number } | LifecycleCommand;

function gh(args: readonly string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function ghJson<T>(args: readonly string[]): T {
  return JSON.parse(gh(args)) as T;
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

export function parseWorkCommand(argv: readonly string[]): WorkCommand {
  const [name, rawIssue, ...rest] = argv;
  const issue = issueNumber(rawIssue);
  if (name === "show" || name === "ready") {
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
  throw new WorkItemUsageError("command must be show, claim, ready, set, verify, done, park, block, or unblock");
}

function loadIssue(number: number): Issue {
  return ghJson<Issue>(["issue", "view", String(number), "--repo", REPOSITORY, "--json", "id,number,url,state,comments"]);
}

function loadProject(): Project {
  return ghJson<Project>(["project", "view", PROJECT_NUMBER, "--owner", PROJECT_OWNER, "--format", "json"]);
}

function loadFields(): readonly Field[] {
  return ghJson<{ readonly fields: readonly Field[] }>(["project", "field-list", PROJECT_NUMBER, "--owner", PROJECT_OWNER, "--format", "json"]).fields;
}

function loadItems(): readonly ProjectItem[] {
  return ghJson<{ readonly items: readonly ProjectItem[] }>([
    "project",
    "item-list",
    PROJECT_NUMBER,
    "--owner",
    PROJECT_OWNER,
    "--limit",
    "1000",
    "--format",
    "json",
  ]).items;
}

function ensureItem(target: Issue): ProjectItem {
  return (
    loadItems().find((item) => item.content?.number === target.number) ??
    ghJson<ProjectItem>(["project", "item-add", PROJECT_NUMBER, "--owner", PROJECT_OWNER, "--url", target.url, "--format", "json"])
  );
}

function loadContext(issue: number): WorkItemContext {
  const target = loadIssue(issue);
  return { target, item: ensureItem(target), project: loadProject(), fields: loadFields() };
}

function currentValue(item: ProjectItem, name: string): string | undefined {
  const value = item.fieldValues?.find((candidate) => candidate.field?.name?.toLowerCase() === name.toLowerCase());
  return value?.name ?? value?.text;
}

function namedField(fields: readonly Field[], name: string): Field {
  const candidate = fields.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (candidate === undefined) {
    throw new Error(`Project 1 has no field named ${name}`);
  }
  return candidate;
}

function setField(work: WorkItemContext, name: string, value: string): void {
  if (currentValue(work.item, name)?.toLowerCase() === value.toLowerCase()) {
    return;
  }
  const target = namedField(work.fields, name);
  const args = ["project", "item-edit", "--id", work.item.id, "--project-id", work.project.id, "--field-id", target.id];
  if (target.type === "ProjectV2Field") {
    gh([...args, "--text", value]);
    return;
  }
  if (target.type !== "ProjectV2SingleSelectField") {
    throw new Error(`${target.name} is not a writable text or single-select field`);
  }
  const selected = target.options?.find((choice) => choice.name.toLowerCase() === value.toLowerCase());
  if (selected === undefined) {
    throw new Error(`${target.name} has no option named ${value}`);
  }
  gh([...args, "--single-select-option-id", selected.id]);
}

function clearField(work: WorkItemContext, name: string): void {
  if (currentValue(work.item, name) === undefined) {
    return;
  }
  const target = namedField(work.fields, name);
  gh(["project", "item-edit", "--id", work.item.id, "--project-id", work.project.id, "--field-id", target.id, "--clear"]);
}

function transitionToReady(work: WorkItemContext): void {
  clearField(work, "Wake condition");
  clearField(work, "Disposition");
  setField(work, "Status", "Ready");
}

function blockers(target: Issue): readonly number[] {
  const result = ghJson<{
    readonly data: { readonly repository: { readonly issue: { readonly blockedBy: { readonly nodes: readonly { readonly number: number }[] } } } };
  }>([
    "api",
    "graphql",
    "-f",
    "query=query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){issue(number:$number){blockedBy(first:100){nodes{number}}}}}",
    "-f",
    `owner=${PROJECT_OWNER}`,
    "-f",
    "repo=orbweaver",
    "-f",
    `number=${target.number}`,
  ]);
  return result.data.repository.issue.blockedBy.nodes.map((blocker) => blocker.number);
}

function requireStatus(work: WorkItemContext, allowed: readonly string[], message: string): void {
  const status = currentValue(work.item, "Status");
  if (status === undefined || !allowed.some((value) => value.toLowerCase() === status.toLowerCase())) {
    throw new Error(message);
  }
}

function requireUnblocked(target: Issue, message: string): void {
  if (blockers(target).length > 0) {
    throw new Error(message);
  }
}

function mutateDependency(target: Issue, blocker: Issue, remove: boolean): void {
  const mutation = remove ? "removeBlockedBy" : "addBlockedBy";
  gh([
    "api",
    "graphql",
    "-f",
    `query=mutation($issueId:ID!,$blockingIssueId:ID!){${mutation}(input:{issueId:$issueId,blockingIssueId:$blockingIssueId}){issue{id}}}`,
    "-f",
    `issueId=${target.id}`,
    "-f",
    `blockingIssueId=${blocker.id}`,
  ]);
}

function claim(work: WorkItemContext, command: Extract<WorkCommand, { readonly kind: "claim" }>): void {
  requireStatus(work, ["Ready"], "work item must be Ready before claim");
  requireUnblocked(work.target, "work item cannot be claimed while blocked");
  gh(["issue", "edit", String(work.target.number), "--repo", REPOSITORY, "--add-assignee", "@me"]);
  setField(work, "Lane", command.lane);
  setField(work, "Status", "Running");
}

function ready(work: WorkItemContext): void {
  requireStatus(work, ["Triage", "Needs owner", "Blocked", "Parked"], "work item must be Triage, Needs owner, Blocked, or Parked before Ready");
  requireUnblocked(work.target, "work item cannot become Ready while blocked");
  transitionToReady(work);
}

function verify(work: WorkItemContext, evidence: string): void {
  requireStatus(work, ["Running"], "work item must be Running before Verify");
  requireUnblocked(work.target, "work item cannot be verified while blocked");
  setField(work, "Evidence", evidence);
  setField(work, "Status", "Verify");
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
  setField(work, "Status", "Done");
  if (work.target.state !== "CLOSED") {
    gh(["issue", "close", String(work.target.number), "--repo", REPOSITORY, "--reason", "completed"]);
  }
}

function block(work: WorkItemContext, command: Extract<WorkCommand, { readonly kind: "block" }>): void {
  if (!blockers(work.target).includes(command.blocker)) {
    mutateDependency(work.target, loadIssue(command.blocker), false);
  }
  setField(work, "Status", "Blocked");
}

function unblock(work: WorkItemContext, command: Extract<WorkCommand, { readonly kind: "unblock" }>): void {
  if (blockers(work.target).includes(command.blocker)) {
    mutateDependency(work.target, loadIssue(command.blocker), true);
  }
  if (blockers(work.target).length === 0) {
    transitionToReady(work);
    return;
  }
  setField(work, "Status", "Blocked");
}

function show(issue: number): void {
  const item = loadItems().find((candidate) => candidate.content?.number === issue);
  if (item === undefined) {
    throw new Error(`#${issue} is not in Project ${PROJECT_NUMBER}`);
  }
  process.stdout.write(`${JSON.stringify(item, null, 2)}\n`);
}

function runLifecycle(command: LifecycleCommand): void {
  const work = loadContext(command.issue);
  if (work.target.state === "CLOSED" && command.kind !== "done") {
    throw new Error("cannot change a closed work item");
  }
  switch (command.kind) {
    case "claim":
      claim(work, command);
      break;
    case "ready":
      ready(work);
      break;
    case "set":
      setField(work, command.field, command.value);
      break;
    case "verify":
      verify(work, command.evidence);
      break;
    case "done":
      done(work, command.evidence);
      break;
    case "park":
      setField(work, "Wake condition", command.wake);
      setField(work, "Disposition", "Parked");
      setField(work, "Status", "Parked");
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
  if (command.kind === "show") {
    show(command.issue);
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
