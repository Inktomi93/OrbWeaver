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

class WorkItemUsageError extends Error {}

type Field = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly options?: readonly { readonly id: string; readonly name: string }[];
};

type Project = { readonly id: string };
type ProjectItem = { readonly id: string; readonly content?: { readonly number?: number; readonly url?: string } };
type ItemList = { readonly items: readonly ProjectItem[] };
type FieldList = { readonly fields: readonly Field[] };
type Issue = { readonly id: string; readonly number: number; readonly url: string };

export type WorkCommand =
  | { readonly kind: "show"; readonly issue: number }
  | { readonly kind: "claim"; readonly issue: number; readonly lane: string }
  | { readonly kind: "ready"; readonly issue: number }
  | { readonly kind: "set"; readonly issue: number; readonly field: string; readonly value: string }
  | { readonly kind: "verify" | "done"; readonly issue: number; readonly evidence: string }
  | { readonly kind: "park"; readonly issue: number; readonly wake: string }
  | { readonly kind: "block" | "unblock"; readonly issue: number; readonly blocker: number };

function gh(args: readonly string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function ghJson<T>(args: readonly string[]): T {
  return JSON.parse(gh(args)) as T;
}

function issueNumber(raw: string | undefined): number {
  if (raw === undefined || !ISSUE_RE.test(raw)) {
    throw new WorkItemUsageError("issue must be a positive numeric issue number");
  }
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new WorkItemUsageError("issue must be a positive numeric issue number");
  }
  return number;
}

function option(args: readonly string[], name: string): string {
  const [flag, value, ...extra] = args;
  if (flag !== name || value === undefined || value.startsWith("--")) {
    throw new WorkItemUsageError(`${name} requires a value`);
  }
  if (extra.length > 0) {
    throw new WorkItemUsageError(`${name} accepts exactly one value`);
  }
  return value;
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
    const [field, value, ...extra] = rest;
    if (field === undefined || value === undefined || extra.length > 0) {
      throw new WorkItemUsageError("set requires exactly one field name and value");
    }
    return { kind: name, issue, field, value };
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
  return ghJson<Issue>(["issue", "view", String(number), "--repo", REPOSITORY, "--json", "id,number,url"]);
}

function project(): Project {
  return ghJson<Project>(["project", "view", PROJECT_NUMBER, "--owner", PROJECT_OWNER, "--format", "json"]);
}

function fields(): readonly Field[] {
  return ghJson<FieldList>(["project", "field-list", PROJECT_NUMBER, "--owner", PROJECT_OWNER, "--format", "json"]).fields;
}

function projectItems(): readonly ProjectItem[] {
  return ghJson<ItemList>(["project", "item-list", PROJECT_NUMBER, "--owner", PROJECT_OWNER, "--limit", "1000", "--format", "json"]).items;
}

function ensureItem(target: Issue): ProjectItem {
  const existing = projectItems().find((item) => item.content?.number === target.number);
  if (existing !== undefined) {
    return existing;
  }
  return ghJson<ProjectItem>(["project", "item-add", PROJECT_NUMBER, "--owner", PROJECT_OWNER, "--url", target.url, "--format", "json"]);
}

function namedField(name: string): Field {
  const field = fields().find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
  if (field === undefined) {
    throw new Error(`Project 1 has no field named ${name}`);
  }
  return field;
}

function setField(item: ProjectItem, name: string, value: string): void {
  const targetProject = project();
  const field = namedField(name);
  const args = ["project", "item-edit", "--id", item.id, "--project-id", targetProject.id, "--field-id", field.id];
  if (field.type === "ProjectV2SingleSelectField") {
    const selected = field.options?.find((candidate) => candidate.name.toLowerCase() === value.toLowerCase());
    if (selected === undefined) {
      throw new Error(`${field.name} has no option named ${value}`);
    }
    gh([...args, "--single-select-option-id", selected.id]);
    return;
  }
  if (field.type !== "ProjectV2Field") {
    throw new Error(`${field.name} is not a writable text or single-select field`);
  }
  gh([...args, "--text", value]);
}

function setStatus(item: ProjectItem, status: string): void {
  setField(item, "Status", status);
}

function dependency(target: Issue, blocker: Issue, remove: boolean): void {
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

function run(command: WorkCommand): void {
  const target = loadIssue(command.issue);
  if (command.kind === "show") {
    const item = projectItems().find((candidate) => candidate.content?.number === target.number);
    if (item === undefined) {
      throw new Error(`#${target.number} is not in Project ${PROJECT_NUMBER}`);
    }
    process.stdout.write(`${JSON.stringify(item, null, 2)}\n`);
    return;
  }
  const item = ensureItem(target);
  if (command.kind === "claim") {
    gh(["issue", "edit", String(target.number), "--repo", REPOSITORY, "--add-assignee", "@me"]);
    setField(item, "Lane", command.lane);
    setStatus(item, "Running");
  } else if (command.kind === "ready") {
    setStatus(item, "Ready");
  } else if (command.kind === "set") {
    setField(item, command.field, command.value);
  } else if (command.kind === "verify") {
    setField(item, "Evidence", command.evidence);
    setStatus(item, "Verify");
  } else if (command.kind === "park") {
    setField(item, "Wake condition", command.wake);
    setField(item, "Disposition", "Parked");
    setStatus(item, "Parked");
  } else if (command.kind === "block" || command.kind === "unblock") {
    dependency(target, loadIssue(command.blocker), command.kind === "unblock");
    setStatus(item, command.kind === "block" ? "Blocked" : "Ready");
  } else if (command.kind === "done") {
    setField(item, "Evidence", command.evidence);
    gh(["issue", "comment", String(target.number), "--repo", REPOSITORY, "--body", `Verification evidence: ${command.evidence}`]);
    setStatus(item, "Done");
    gh(["issue", "close", String(target.number), "--repo", REPOSITORY, "--reason", "completed"]);
  }
  process.stdout.write(`work-item — #${target.number} ${command.kind}\n`);
}

function main(): void {
  let command: WorkCommand;
  try {
    command = parseWorkCommand(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = EXIT_MISUSE;
    return;
  }
  try {
    run(command);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = error instanceof WorkItemUsageError ? EXIT_MISUSE : EXIT_TOOL;
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.cwd(), process.argv[1])) {
  main();
}
