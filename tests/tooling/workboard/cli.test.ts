// The Project-1 operator CLI, driven end-to-end against a fake `gh` that speaks the real wire protocol
// (named GraphQL operations, typed -f/-F variables, the REST rate_limit probe). Relocated from
// tests/tooling/work-item-cli.test.ts at the #393 P5 move (Core-Tooling-Law.md §4.7 mirror).
//
// STATED DEVIATION from §5.1's runCli door: `drive` stays a SYNCHRONOUS spawn. runCli is async, and this
// suite drives ~40 sequential invocations whose ORDER carries the assertion (a state machine advanced by
// each call); converting it would make every one an await, where a single missed await passes silently.
// It does spawn the tool by its five-slot path via process.execPath — the tsx hop it used to take was
// launcher rot (tsx was shed 2026-08-03).
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { parseWorkCommand } from "../../../tooling/src/workboard/index.ts";
import { buildDodBlock, dodStamp } from "../../../tooling/src/workboard/lib/dod.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const ORIGINAL_PATH = execFileSync("printenv", ["PATH"], { encoding: "utf8" }).trim();
const TOOL_ERROR_EXIT = 2;
const MISUSE_EXIT = 3;
const EXECUTABLE_MODE = 0o755;
const TABLE_DRIVEN_TIMEOUT_MS = scaledBudget(15_000);
const TARGET_ISSUE = 11;
const FIRST_BLOCKER = 7;
const SECOND_BLOCKER = 8;
const STATUS_FIELD = "Status";
const EVIDENCE_FIELD = "Evidence";
const WAKE_CONDITION_FIELD = "Wake condition";
const DISPOSITION_FIELD = "Disposition";
const PRIORITY_FIELD = "Priority";
const KIND_FIELD = "Kind";
const AREA_FIELD = "Area";
const REVIEW_FIELD = "Review";
const CREATED_ISSUE = 12;
const FAKE_RESET_EPOCH = 1_786_764_000;
const defineTest = test;

interface FakeIssue {
  readonly id: string;
  readonly number: number;
  readonly url: string;
  state: "OPEN" | "CLOSED";
  body?: string;
  readonly blockers: number[];
  readonly comments: string[];
}

type FakeProjectItem = {
  readonly id: string;
  readonly content: { readonly number: number; readonly url: string };
} & Record<string, string | { readonly number: number; readonly url: string }>;

interface FakeState {
  readonly fields: readonly {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly options?: readonly { readonly id: string; readonly name: string }[];
  }[];
  readonly items: FakeProjectItem[];
  readonly issues: Record<string, FakeIssue> & { readonly "11": FakeIssue };
  readonly calls: string[][];
  failProject?: boolean;
  cacheDir?: string;
  listPageSize?: number;
  rateLimitAfter?: number;
  secondaryRateLimit?: boolean;
  failOptionAlways?: boolean;
  /** Overrides the per-DoD wall clock through the WORK_ITEM_DOD_TIMEOUT_MS seam (#923). */
  dodTimeoutMs?: number;
  /** Piped to the CLI's stdin — the `--body-file -` ingress (#923 P3). */
  stdinBody?: string;
}

// The fake gh speaks the CLI's quota-sane wire protocol: named GraphQL operations dispatched on the
// operation name inside `query=`, typed variables read from -f/-F pairs, and the REST rate_limit probe.
const fakeGh = String.raw`#!/usr/bin/env node
const { readFileSync, writeFileSync } = require("node:fs");
const statePath = process.env.WORK_ITEM_FAKE_GH_STATE;
const state = JSON.parse(readFileSync(statePath, "utf8"));
const args = process.argv.slice(2);
state.calls.push(args);
const save = () => writeFileSync(statePath, JSON.stringify(state));
const text = (payload) => { save(); process.stdout.write(JSON.stringify(payload)); };
const fail = (message) => { save(); process.stderr.write("GraphQL: " + message + "\n"); process.exit(1); };
const value = (prefix) => {
  const index = args.indexOf(prefix);
  return index === -1 ? args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) : args[index + 1];
};
let query = "";
const variables = {};
for (let index = 0; index < args.length; index += 1) {
  if (args[index] !== "-f" && args[index] !== "-F") continue;
  const pair = args[index + 1] ?? "";
  const eq = pair.indexOf("=");
  const key = pair.slice(0, eq);
  const raw = pair.slice(eq + 1);
  if (key === "query") query = raw;
  else variables[key] = args[index] === "-F" ? Number(raw) : raw;
}
const issueNumber = () => Number(args.find((arg) => /^\d+$/.test(arg)));
const issue = () => state.issues[String(issueNumber())];
const fieldValueNodes = (item) =>
  Object.entries(item)
    .filter(([key, val]) => key !== "id" && typeof val === "string")
    .map(([key, val]) => {
      const field = state.fields.find((candidate) => candidate.name === key);
      return field && field.type === "ProjectV2SingleSelectField" ? { name: val, field: { name: key } } : { text: val, field: { name: key } };
    });
const itemNode = (item) => ({ id: item.id, project: { id: "project-1", number: 1 }, fieldValues: { nodes: fieldValueNodes(item) } });
if (args[0] === "api" && args[1] === "rate_limit") {
  text({ resources: { graphql: { remaining: 0, reset: ${FAKE_RESET_EPOCH} } } });
} else if (args[0] === "api" && args[1] === "graphql") {
  if (typeof state.rateLimitAfter === "number" && state.calls.filter((call) => call[0] === "api" && call[1] === "graphql").length > state.rateLimitAfter) {
    if (state.secondaryRateLimit) fail("You have exceeded a secondary rate limit. Please wait a few minutes before you try again.");
    fail("API rate limit exceeded for user ID 999. (RATE_LIMITED)");
  }
  if (query.includes("WorkItemProject")) {
    if (state.failProject) fail("Injected Project failure");
    text({ data: { user: { projectV2: { id: "project-1", fields: { nodes: state.fields.map((field) => ({ __typename: field.type, id: field.id, name: field.name, options: field.options })) } } } } });
  } else if (query.includes("WorkItemContext") || query.includes("WorkItemBlockers") || query.includes("WorkItemIssueId")) {
    if (typeof variables.number !== "number" || Number.isNaN(variables.number)) fail('Variable "$number" of type "Int!" used in position expecting type "Int".');
    const target = state.issues[String(variables.number)];
    text({ data: { repository: { issue: {
      id: target.id,
      number: target.number,
      url: target.url,
      state: target.state,
      body: target.body || "",
      blockedBy: { nodes: target.blockers.map((number) => ({ number, state: (state.issues[String(number)] || {}).state || "OPEN" })) },
      comments: { nodes: target.comments.map((body) => ({ body })) },
      projectItems: { nodes: state.items.filter((item) => item.content.number === target.number).map(itemNode) },
    } } } });
  } else if (query.includes("WorkItemList")) {
    if (variables.project !== "project-1") {
      text({ data: { node: null } });
    } else {
      const pageSize = state.listPageSize ?? 100;
      const start = variables.cursor === undefined ? 0 : Number(variables.cursor);
      const nodes = state.items.slice(start, start + pageSize).map((item) => ({ content: item.content, fieldValues: { nodes: fieldValueNodes(item) } }));
      text({ data: { node: { items: { pageInfo: { hasNextPage: start + pageSize < state.items.length, endCursor: String(start + pageSize) }, nodes } } } });
    }
  } else if (query.includes("WorkItemAdd")) {
    if (variables.project !== "project-1") fail("Could not resolve to a node with the global id of '" + variables.project + "'");
    const target = Object.values(state.issues).find((candidate) => candidate.id === variables.content);
    if (!target) fail("Could not resolve to a node with the global id of '" + variables.content + "'");
    let current = state.items.find((candidate) => candidate.content.number === target.number);
    if (!current) {
      current = { id: "item-" + target.number, content: { number: target.number, url: target.url } };
      state.items.push(current);
    }
    text({ data: { addProjectV2ItemById: { item: { id: current.id } } } });
  } else if (query.includes("WorkItemFields") || query.includes("WorkItemStatus")) {
    if (variables.project !== "project-1") fail("Could not resolve to a node with the global id of '" + variables.project + "'");
    const item = state.items.find((candidate) => candidate.id === variables.item);
    if (!item) fail("Could not resolve to a node with the global id of '" + variables.item + "'");
    const operations = [...query.matchAll(/(updateProjectV2ItemFieldValue|clearProjectV2ItemFieldValue)\(input: \{ projectId: \$project, itemId: \$item, fieldId: \$(\w+)(?:, value: \{ (text|singleSelectOptionId): \$(\w+) \})? \}\)/g)];
    if (operations.length === 0) throw new Error("Unparsable field mutation: " + query);
    for (const [, kind, fieldVariable, valueKind, valueVariable] of operations) {
      const field = state.fields.find((candidate) => candidate.id === variables[fieldVariable]);
      if (!field) fail("Could not resolve to a node with the global id of '" + variables[fieldVariable] + "'");
      if (kind === "clearProjectV2ItemFieldValue") { delete item[field.name]; continue; }
      const raw = variables[valueVariable];
      if (valueKind === "singleSelectOptionId") {
        if (state.failOptionAlways) fail("The single select option does not belong to field '" + field.name + "'");
        const option = (field.options ?? []).find((candidate) => candidate.id === raw);
        if (!option) fail("The single select option does not belong to field '" + field.name + "'");
        item[field.name] = option.name;
      } else {
        // Measured against GitHub on #2336: this is a UTF-8 BYTE limit, not JS length.
        if (Buffer.byteLength(raw, "utf8") > 1024) fail("Column value must be a valid value for text column");
        item[field.name] = raw;
      }
    }
    text({ data: {} });
  } else if (query.includes("WorkItemDependency")) {
    const target = state.issues[String(variables.issueId).replace("issue-", "")];
    const blocker = Number(String(variables.blockingIssueId).replace("issue-", ""));
    if (query.includes("removeBlockedBy")) {
      const index = target.blockers.indexOf(blocker);
      if (index === -1) throw new Error("blocker relation is already absent");
      target.blockers.splice(index, 1);
    }
    if (query.includes("addBlockedBy")) {
      if (target.blockers.includes(blocker)) throw new Error("blocker relation already exists");
      target.blockers.push(blocker);
    }
    text({ data: {} });
  } else { throw new Error("Unhandled graphql query: " + query); }
} else if (args[0] === "issue" && args[1] === "create") {
  const number = ${CREATED_ISSUE};
  const url = "https://example.test/issues/" + number;
  const bodyFlag = args.indexOf("--body");
  state.issues[String(number)] = { id: "issue-" + number, number, url, state: "OPEN", blockers: [], comments: [], body: bodyFlag === -1 ? "" : args[bodyFlag + 1] };
  save();
  process.stdout.write(url);
} else if (args[0] === "issue" && args[1] === "comment") {
  issue().comments.push(value("--body"));
  text({});
} else if (args[0] === "issue" && args[1] === "close") {
  issue().state = "CLOSED";
  text({});
} else if (args[0] === "issue" && args[1] === "edit") {
  const bodyFlag = args.indexOf("--body");
  if (bodyFlag !== -1) issue().body = args[bodyFlag + 1];
  text({});
} else { throw new Error("Unhandled gh invocation: " + args.join(" ")); }
`;

function createState(status: string, blockers: number[] = []): FakeState {
  return {
    fields: [
      {
        id: "status",
        name: "Status",
        type: "ProjectV2SingleSelectField",
        options: ["Triage", "Needs owner", "Ready", "Running", "Review", "Verify", "Blocked", "Parked", "Done"].map((name) => ({
          id: name.toLowerCase(),
          name,
        })),
      },
      { id: "evidence", name: "Evidence", type: "ProjectV2Field" },
      { id: "lane", name: "Lane", type: "ProjectV2Field" },
      { id: "wake", name: "Wake condition", type: "ProjectV2Field" },
      { id: "dod", name: "DoD", type: "ProjectV2Field" },
      {
        id: "disposition",
        name: "Disposition",
        type: "ProjectV2SingleSelectField",
        options: ["Untriaged", "Action", "Parked", "Killed", "Already resolved"].map((name) => ({ id: name.toLowerCase(), name })),
      },
      { id: "priority", name: "Priority", type: "ProjectV2SingleSelectField", options: [{ id: "high", name: "High" }] },
      { id: "area", name: "Area", type: "ProjectV2SingleSelectField", options: [{ id: "docs", name: "Docs" }] },
      { id: "review", name: "Review", type: "ProjectV2SingleSelectField", options: ["Technical", "Owner"].map((name) => ({ id: name.toLowerCase(), name })) },
      {
        id: "kind",
        name: "Kind",
        type: "ProjectV2SingleSelectField",
        options: ["Work", "Decision", "Program", "Evidence"].map((name) => ({ id: name.toLowerCase(), name })),
      },
    ],
    items: [
      {
        id: "item-11",
        content: { number: 11, url: "https://example.test/issues/11" },
        [STATUS_FIELD]: status,
        [DISPOSITION_FIELD]: "Untriaged",
        [KIND_FIELD]: "Work",
        [PRIORITY_FIELD]: "High",
        [AREA_FIELD]: "Docs",
        [REVIEW_FIELD]: "Technical",
      },
    ],
    issues: {
      "7": { id: "issue-7", number: 7, url: "https://example.test/issues/7", state: "OPEN", blockers: [], comments: [] },
      "8": { id: "issue-8", number: 8, url: "https://example.test/issues/8", state: "OPEN", blockers: [], comments: [] },
      "11": { id: "issue-11", number: 11, url: "https://example.test/issues/11", state: "OPEN", blockers, comments: [] },
    },
    calls: [],
  };
}

function drive(state: FakeState, ...args: string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const directory = mkdtempSync(join(tmpdir(), "work-item-cli-"));
  const statePath = join(directory, "state.json");
  const ghPath = join(directory, "gh");
  writeFileSync(statePath, JSON.stringify(state));
  writeFileSync(ghPath, fakeGh);
  chmodSync(ghPath, EXECUTABLE_MODE);
  try {
    // Keys are assigned by subscript, not object literal: SCREAMING_SNAKE env names are correct here and
    // an object literal would trip useNamingConvention on the harness's own vocabulary.
    // biome-ignore lint/style/noProcessEnv: the child needs the ambient env (HOME, NODE_OPTIONS) with PATH shadowed by the fake gh — that IS this harness.
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    childEnv["PATH"] = `${directory}:${ORIGINAL_PATH}`;
    childEnv["WORK_ITEM_FAKE_GH_STATE"] = statePath;
    childEnv["WORK_ITEM_CACHE_DIR"] = state.cacheDir ?? join(directory, "cache");
    if (state.dodTimeoutMs !== undefined) {
      childEnv["WORK_ITEM_DOD_TIMEOUT_MS"] = String(state.dodTimeoutMs);
    }
    const result = spawnSync(process.execPath, [join(ROOT, "tooling", "src", "workboard", "cli.ts"), ...args], {
      cwd: ROOT,
      encoding: "utf8",
      env: childEnv,
      ...(state.stdinBody === undefined ? {} : { input: state.stdinBody }),
    });
    Object.assign(state, JSON.parse(readFileSync(statePath, "utf8")) as FakeState);
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function targetIssue(state: FakeState): FakeIssue {
  return state.issues["11"];
}

function withBody(body: string, callback: (bodyFile: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "work-item-body-"));
  const bodyFile = join(directory, "issue.md");
  writeFileSync(bodyFile, body);
  try {
    callback(bodyFile);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function addParkedMetadata(state: FakeState): void {
  const item = state.items[0];
  if (item !== undefined) {
    item[WAKE_CONDITION_FIELD] = "await owner decision";
    item[DISPOSITION_FIELD] = "Parked";
  }
}

function fieldValue(state: FakeState, name: string): string | undefined {
  return itemFieldValue(state, TARGET_ISSUE, name);
}

function itemFieldValue(state: FakeState, issue: number, name: string): string | undefined {
  const item = state.items.find((candidate) => candidate.content.number === issue);
  const value = Object.entries(item ?? {}).find(([field]) => field.toLowerCase() === name.toLowerCase())?.[1];
  return typeof value === "string" ? value : undefined;
}

function setRequiredMetadata(state: FakeState, issue: number): void {
  const item = state.items.find((candidate) => candidate.content.number === issue);
  if (item === undefined) {
    throw new Error("created Project item is missing");
  }
  item[KIND_FIELD] = "Work";
  item[PRIORITY_FIELD] = "High";
  item[AREA_FIELD] = "Docs";
  item[REVIEW_FIELD] = "Technical";
}

function graphqlCalls(state: FakeState): readonly (readonly string[])[] {
  return state.calls.filter((call) => call[0] === "api" && call[1] === "graphql");
}

function queryOf(call: readonly string[]): string {
  return call.find((arg) => arg.startsWith("query="))?.slice("query=".length) ?? "";
}

function operationCalls(state: FakeState, operation: string): readonly (readonly string[])[] {
  return graphqlCalls(state).filter((call) => queryOf(call).includes(operation));
}

function mutationCalls(state: FakeState): readonly (readonly string[])[] {
  return graphqlCalls(state).filter((call) => queryOf(call).startsWith("mutation"));
}

defineTest("claim requires a lane and produces the mutation intent", () => {
  expect(parseWorkCommand(["claim", "11", "--lane", "docs-catalog"])).toEqual({ kind: "claim", issues: [11], lane: "docs-catalog" });
  expect(() => parseWorkCommand(["claim", "11"])).toThrow("--lane requires a value");
  expect(() => parseWorkCommand(["claim", "11", "--lane", "docs-catalog", "extra"])).toThrow("--lane accepts exactly one value");
});

defineTest("reverify requires replacement evidence", () => {
  expect(parseWorkCommand(["reverify", "11", "--evidence", "replacement receipt"])).toEqual({
    kind: "reverify",
    issues: [11],
    evidence: "replacement receipt",
  });
  expect(() => parseWorkCommand(["reverify", "11"])).toThrow("--evidence requires a value");
});

defineTest("list accepts an optional status filter", () => {
  expect(parseWorkCommand(["list"])).toEqual({ kind: "list" });
  expect(parseWorkCommand(["list", "--status", "Needs owner"])).toEqual({ kind: "list", status: "Needs owner" });
  expect(() => parseWorkCommand(["list", "--status"])).toThrow("--status requires a value");
});

defineTest("parser errors become misuse exits at the CLI boundary", () => {
  const result = drive(createState("Triage"), "ready", "not-an-issue");
  expect(result.status).toBe(MISUSE_EXIT);
  expect(result.stderr).toContain("issue must be a positive numeric issue number");
});

defineTest("help prints the complete Project operator path", () => {
  const result = drive(createState("Triage"), "--help");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("create <work|bug|decision|program|evidence>");
  expect(result.stdout).toContain("list [--status <status>]");
  expect(result.stdout).toContain("Triage → Ready → Running → Review → Verify → Done");
  expect(result.stdout).toContain("Interrupted transitions are safe to rerun");
  expect(result.stdout).toContain(".github/ISSUE_TEMPLATE/*.yml");
  expect(result.stdout).toContain("--evidence over 1024 UTF-8 bytes auto-splits");
});

defineTest("list returns a stable filtered Project snapshot without mutation", () => {
  const state = createState("Running");
  state.items.push({
    id: "item-8",
    content: { number: 8, url: "https://example.test/issues/8" },
    [STATUS_FIELD]: "Ready",
    [DISPOSITION_FIELD]: "Action",
  });
  const result = drive(state, "list", "--status", "ready");
  expect(result.status).toBe(0);
  const listed = JSON.parse(result.stdout) as { readonly items: readonly { readonly issue: number; readonly status: string }[] };
  expect(listed.items).toHaveLength(1);
  expect(listed.items[0]).toEqual(expect.objectContaining({ issue: 8, status: "Ready" }));
  expect(mutationCalls(state)).toHaveLength(0);
});

defineTest("list --status refuses an unknown status loudly instead of silent-zeroing", () => {
  const state = createState("Running");
  const result = drive(state, "list", "--status", "Bogus");
  expect(result.status).toBe(TOOL_ERROR_EXIT);
  expect(result.stderr).toContain("Status has no option named Bogus");
  expect(result.stderr).toContain("Triage");
  expect(mutationCalls(state)).toHaveLength(0);
});

defineTest("overview prints every canonical queue, empty ones as (0) lines", () => {
  const state = createState("Running");
  const result = drive(state, "overview");
  expect(result.status).toBe(0);
  for (const line of ["Triage (0)", "Ready (0)", "Verify (0)", "Needs owner (0)", "Running (1)"]) {
    expect(result.stdout).toContain(line);
  }
  expect(mutationCalls(state)).toHaveLength(0);
});

defineTest(
  "create maps each canonical class to its labels, Project Kind, and Triage",
  () => {
    const cases = [
      { issueClass: "work", labels: ["kind:build", "triage"], projectKind: "Work", status: "Triage" },
      { issueClass: "bug", labels: ["bug", "triage"], projectKind: "Work", status: "Triage" },
      { issueClass: "decision", labels: ["kind:decision", "needs-owner", "triage"], projectKind: "Decision", status: "Needs owner" },
      { issueClass: "program", labels: ["kind:design", "triage"], projectKind: "Program", status: "Triage" },
      { issueClass: "evidence", labels: ["kind:finding", "triage"], projectKind: "Evidence", status: "Triage" },
    ] as const;
    for (const itemCase of cases) {
      withBody("# current evidence", (bodyFile) => {
        const state = createState("Triage");
        const result = drive(state, "create", itemCase.issueClass, "--title", "Current finding", "--body-file", bodyFile);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain(`#${CREATED_ISSUE} https://example.test/issues/${CREATED_ISSUE}`);
        expect(result.stdout).toContain(
          itemCase.issueClass === "decision" ? "set Priority, Area, and resolve the owner decision before ready" : "set Priority, Area, Review, then ready",
        );
        expect(itemFieldValue(state, CREATED_ISSUE, STATUS_FIELD)).toBe(itemCase.status);
        expect(itemFieldValue(state, CREATED_ISSUE, DISPOSITION_FIELD)).toBe("Untriaged");
        expect(itemFieldValue(state, CREATED_ISSUE, KIND_FIELD)).toBe(itemCase.projectKind);
        expect(itemFieldValue(state, CREATED_ISSUE, REVIEW_FIELD)).toBe(itemCase.issueClass === "decision" ? "Owner" : undefined);
        expect(state.items.filter((item) => item.content.number === CREATED_ISSUE)).toHaveLength(1);
        const createCall = state.calls.find((args) => args[0] === "issue" && args[1] === "create");
        expect(createCall).toEqual(expect.arrayContaining(itemCase.labels.flatMap((label) => ["--label", label])));
        setRequiredMetadata(state, CREATED_ISSUE);
        expect(drive(state, "ready", String(CREATED_ISSUE)).status).toBe(0);
        expect(operationCalls(state, "WorkItemAdd")).toHaveLength(1);
      });
    }
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

defineTest("create rejects malformed kinds, titles, and body files before Project mutation", () => {
  expect(() => parseWorkCommand(["create", "wrong", "--title", "Current finding", "--body-file", "issue.md"])).toThrow("create kind must be");
  expect(() => parseWorkCommand(["create", "work", "--title", " ", "--body-file", "issue.md"])).toThrow("--title requires a value");
  withBody("  ", (bodyFile) => {
    const state = createState("Triage");
    const result = drive(state, "create", "work", "--title", "Current finding", "--body-file", bodyFile);
    expect(result.status).toBe(TOOL_ERROR_EXIT);
    expect(result.stderr).toContain("body file must not be empty");
    expect(state.calls.some((args) => args[0] === "issue" && args[1] === "create")).toBe(false);
  });
  const unreadable = drive(createState("Triage"), "create", "work", "--title", "Current finding", "--body-file", "/missing/issue.md");
  expect(unreadable.status).toBe(TOOL_ERROR_EXIT);
  expect(unreadable.stderr).toContain("ENOENT");
});

defineTest("create prints a resumable issue receipt before Project setup", () => {
  withBody("# current evidence", (bodyFile) => {
    const state = createState("Triage");
    state.failProject = true;
    const result = drive(state, "create", "work", "--title", "Current finding", "--body-file", bodyFile);
    expect(result.status).toBe(TOOL_ERROR_EXIT);
    expect(result.stdout).toContain(`created #${CREATED_ISSUE} https://example.test/issues/${CREATED_ISSUE}`);
    expect(state.issues[String(CREATED_ISSUE)]?.url).toBe(`https://example.test/issues/${CREATED_ISSUE}`);
    expect(state.items.some((item) => item.content.number === CREATED_ISSUE)).toBe(false);
  });
});

defineTest("unblock keeps an item blocked until every blocker relation is gone", () => {
  const state = createState("Blocked", [FIRST_BLOCKER, SECOND_BLOCKER]);
  expect(drive(state, "unblock", String(TARGET_ISSUE), "--by", String(FIRST_BLOCKER)).status).toBe(0);
  expect(fieldValue(state, STATUS_FIELD)).toBe("Blocked");
  expect(state.issues[String(TARGET_ISSUE)]?.blockers).toEqual([SECOND_BLOCKER]);
});

defineTest("lifecycle commands reject invalid current status and unresolved blockers", () => {
  const blocked = createState("Blocked", [FIRST_BLOCKER]);
  const ready = drive(blocked, "ready", "11");
  expect(ready.status).toBe(TOOL_ERROR_EXIT);
  expect(ready.stderr).toContain("cannot become Ready while blocked");

  const running = createState("Running");
  const done = drive(running, "done", "11", "--evidence", "all tests passed");
  expect(done.status).toBe(TOOL_ERROR_EXIT);
  expect(done.stderr).toContain("must be Verify before Done");
});

defineTest("review gates verification and rejects blocked work", () => {
  const running = createState("Running");
  const prematureVerify = drive(running, "verify", "11", "--evidence", "all tests passed");
  expect(prematureVerify.status).toBe(TOOL_ERROR_EXIT);
  expect(prematureVerify.stderr).toContain("must be Review before Verify");
  expect(drive(running, "review", "11").status).toBe(0);
  expect(fieldValue(running, STATUS_FIELD)).toBe("Review");
  expect(drive(running, "verify", "11", "--evidence", "all tests passed").status).toBe(0);
  expect(fieldValue(running, EVIDENCE_FIELD)).toBe("all tests passed");
  expect(fieldValue(running, STATUS_FIELD)).toBe("Verify");

  const blocked = createState("Running", [FIRST_BLOCKER]);
  const review = drive(blocked, "review", "11");
  expect(review.status).toBe(TOOL_ERROR_EXIT);
  expect(review.stderr).toContain("cannot enter Review while blocked");
});

defineTest(
  "over-column evidence auto-splits (#923 P2): the field gets a head + pointer, the comment gets the full text, and done still matches",
  () => {
    // GitHub's ProjectV2 text column rejects anything past 1024 UTF-8 bytes (#1920; live probe #2336).
    // The old shape REFUSED over-cap evidence; owner-approved P2 replaces the refusal with the split —
    // the transform is pure and identical on verify and done, so the same-receipt rule holds.
    const overCap = `head-${"x".repeat(1500)}`;
    const reviewed = createState("Review");
    const inFlight = drive(reviewed, "verify", "11", "--evidence", overCap);
    expect(inFlight.status).toBe(0);
    const field = fieldValue(reviewed, EVIDENCE_FIELD) ?? "";
    expect(Buffer.byteLength(field, "utf8")).toBeLessThanOrEqual(1024);
    expect(field).toContain("full receipt in issue comment");
    const overflow = targetIssue(reviewed).comments.find((body) => body.includes("Full verification receipt"));
    expect(overflow).toContain(overCap);
    // done recomputes the identical transform from the identical --evidence and closes.
    expect(drive(reviewed, "done", "11", "--evidence", overCap).status).toBe(0);
    expect(targetIssue(reviewed).state).toBe("CLOSED");

    // At the column cap the transform is the identity — no pointer, no comment.
    const atCap = "x".repeat(1024);
    const identity = createState("Review");
    expect(drive(identity, "verify", "11", "--evidence", atCap).status).toBe(0);
    expect(fieldValue(identity, EVIDENCE_FIELD)).toBe(atCap);
    expect(targetIssue(identity).comments).toHaveLength(0);

    // The HARD cap (GitHub's comment-body limit) still refuses as misuse, before any network call.
    const absurd = drive(createState("Review"), "verify", "11", "--evidence", "x".repeat(60_001));
    expect(absurd.status).toBe(MISUSE_EXIT);
    expect(absurd.stderr).toContain("hard cap is 60000");

    // The same verb's genuine lifecycle-state refusal still exits 2, unchanged and distinguishable.
    const prematureVerify = drive(createState("Running"), "verify", "11", "--evidence", "short receipt");
    expect(prematureVerify.status).toBe(TOOL_ERROR_EXIT);
    expect(prematureVerify.stderr).toContain("must be Review before Verify");
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

defineTest(
  "multibyte evidence splits below 1024 code units and retries without duplicate comments",
  () => {
    const receipt = "é🙂".repeat(200);
    const state = createState("Review");
    expect(receipt.length).toBeLessThan(1024);
    expect(drive(state, "verify", "11", "--evidence", receipt).status).toBe(0);
    const field = fieldValue(state, EVIDENCE_FIELD) ?? "";
    expect(Buffer.byteLength(field, "utf8")).toBeLessThanOrEqual(1024);
    expect(field.isWellFormed()).toBe(true);
    expect(targetIssue(state).comments).toHaveLength(1);
    expect(targetIssue(state).comments[0]).toContain(receipt);
    expect(drive(state, "verify", "11", "--evidence", receipt).status).toBe(0);
    expect(targetIssue(state).comments).toHaveLength(1);
    expect(drive(state, "land", "11", "--evidence", receipt).status).toBe(0);
    expect(fieldValue(state, EVIDENCE_FIELD)).toBe(field);
    expect(targetIssue(state).state).toBe("CLOSED");
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

defineTest("reverify repairs stale Verify evidence without weakening the normal verify guard", () => {
  const state = createState("Verify");
  const item = state.items[0];
  if (item !== undefined) {
    item[EVIDENCE_FIELD] = "stale receipt";
  }

  const guarded = drive(state, "verify", "11", "--evidence", "replacement receipt");
  expect(guarded.status).toBe(TOOL_ERROR_EXIT);
  expect(fieldValue(state, EVIDENCE_FIELD)).toBe("stale receipt");

  expect(drive(state, "reverify", "11", "--evidence", "replacement receipt").status).toBe(0);
  expect(fieldValue(state, EVIDENCE_FIELD)).toBe("replacement receipt");
  expect(fieldValue(state, STATUS_FIELD)).toBe("Verify");
  expect(drive(state, "done", "11", "--evidence", "replacement receipt").status).toBe(0);

  const review = drive(createState("Review"), "reverify", "11", "--evidence", "too early");
  expect(review.status).toBe(TOOL_ERROR_EXIT);
  expect(review.stderr).toContain("must already be Verify");
});

defineTest("refute returns a failed verification to Ready and replaces Evidence, but refuses any other source status", () => {
  const state = createState("Verify");
  const item = state.items[0];
  if (item !== undefined) {
    item[EVIDENCE_FIELD] = "passing receipt";
  }

  expect(drive(state, "refute", "11", "--evidence", "failed under load").status).toBe(0);
  expect(fieldValue(state, STATUS_FIELD)).toBe("Ready");
  expect(fieldValue(state, EVIDENCE_FIELD)).toBe("failed under load");

  const running = createState("Running");
  const wrongStatus = drive(running, "refute", "11", "--evidence", "irrelevant");
  expect(wrongStatus.status).toBe(TOOL_ERROR_EXIT);
  expect(wrongStatus.stderr).toContain("must be Verify before refute");

  const review = createState("Review");
  const fromReview = drive(review, "refute", "11", "--evidence", "irrelevant");
  expect(fromReview.status).toBe(TOOL_ERROR_EXIT);
  expect(fromReview.stderr).toContain("must be Verify before refute");
});

defineTest("refute requires evidence", () => {
  expect(() => parseWorkCommand(["refute", "11"])).toThrow("--evidence requires a value");
  const state = createState("Verify");
  const missingEvidence = drive(state, "refute", "11");
  expect(missingEvidence.status).toBe(MISUSE_EXIT);
});

defineTest("set compares field names case-insensitively before writing", () => {
  const state = createState("Running");
  expect(drive(state, "set", "11", "priority", "High").status).toBe(0);
  expect(mutationCalls(state)).toHaveLength(0);
});

defineTest("ready accepts live ingress and resume statuses but not review", () => {
  for (const status of ["Triage", "Needs owner", "Parked"]) {
    const state = createState(status);
    expect(drive(state, "ready", "11").status).toBe(0);
  }
  const review = drive(createState("Review"), "ready", "11");
  expect(review.status).toBe(TOOL_ERROR_EXIT);
  expect(review.stderr).toContain("must be Triage, Needs owner, Blocked, Parked, or Ready before Ready");
});

defineTest("ready requires complete metadata and changes disposition to Action", () => {
  const state = createState("Triage");
  const item = state.items[0];
  if (item !== undefined) {
    delete item[AREA_FIELD];
  }
  const missing = drive(state, "ready", "11");
  expect(missing.status).toBe(TOOL_ERROR_EXIT);
  expect(missing.stderr).toContain("must set Area before Ready");
  const restored = state.items[0];
  if (restored !== undefined) {
    restored[AREA_FIELD] = " ";
  }
  const empty = drive(state, "ready", "11");
  expect(empty.status).toBe(TOOL_ERROR_EXIT);
  expect(empty.stderr).toContain("must set Area before Ready");
  const completed = state.items[0];
  if (completed !== undefined) {
    completed[AREA_FIELD] = "Docs";
  }
  expect(drive(state, "ready", "11").status).toBe(0);
  expect(fieldValue(state, DISPOSITION_FIELD)).toBe("Action");

  const ready = createState("Ready");
  delete ready.items[0]?.[REVIEW_FIELD];
  const claim = drive(ready, "claim", "11", "--lane", "metadata-proof");
  expect(claim.status).toBe(TOOL_ERROR_EXIT);
  expect(claim.stderr).toContain("must set Review before claim");
});

defineTest("needs-owner routes raw decision ingress and refuses terminal disposition", () => {
  const state = createState("Running");
  const item = state.items[0];
  if (item !== undefined) {
    item["Lane"] = "active-lane";
    item[WAKE_CONDITION_FIELD] = "await owner";
    item[DISPOSITION_FIELD] = "Action";
  }
  expect(drive(state, "needs-owner", "11").status).toBe(0);
  expect(fieldValue(state, STATUS_FIELD)).toBe("Needs owner");
  expect(fieldValue(state, REVIEW_FIELD)).toBe("Owner");
  expect(fieldValue(state, "Lane")).toBeUndefined();
  expect(fieldValue(state, WAKE_CONDITION_FIELD)).toBeUndefined();
  expect(fieldValue(state, DISPOSITION_FIELD)).toBe("Untriaged");

  const terminal = createState("Blocked");
  const terminalItem = terminal.items[0];
  if (terminalItem !== undefined) {
    terminalItem[DISPOSITION_FIELD] = "Killed";
  }
  const result = drive(terminal, "needs-owner", "11");
  expect(result.status).toBe(TOOL_ERROR_EXIT);
  expect(result.stderr).toContain("terminal Disposition cannot enter Needs owner");
  expect(fieldValue(terminal, DISPOSITION_FIELD)).toBe("Killed");
  expect(mutationCalls(terminal)).toHaveLength(0);
});

defineTest("ready initializes raw and statusless Project ingress without duplicate items", () => {
  const rawIssue = createState("Triage");
  rawIssue.items.splice(0, 1);
  const missing = drive(rawIssue, "ready", "11");
  expect(missing.status).toBe(TOOL_ERROR_EXIT);
  expect(missing.stderr).toContain("must set Kind, Priority, Area, Review before Ready");
  setRequiredMetadata(rawIssue, TARGET_ISSUE);
  expect(drive(rawIssue, "ready", "11").status).toBe(0);
  expect(rawIssue.items).toHaveLength(1);
  expect(fieldValue(rawIssue, STATUS_FIELD)).toBe("Ready");
  expect(fieldValue(rawIssue, DISPOSITION_FIELD)).toBe("Action");
  expect(operationCalls(rawIssue, "WorkItemAdd")).toHaveLength(1);
  expect(rawIssue.calls.filter((call) => call.includes("v0=triage"))).toHaveLength(1);
  expect(drive(rawIssue, "ready", "11").status).toBe(0);
  expect(operationCalls(rawIssue, "WorkItemAdd")).toHaveLength(1);

  const statusless = createState("Triage");
  delete statusless.items[0]?.[STATUS_FIELD];
  expect(drive(statusless, "ready", "11").status).toBe(0);
  expect(statusless.items).toHaveLength(1);
  expect(fieldValue(statusless, STATUS_FIELD)).toBe("Ready");
  expect(fieldValue(statusless, DISPOSITION_FIELD)).toBe("Action");
  expect(operationCalls(statusless, "WorkItemAdd")).toHaveLength(0);
  expect(statusless.calls.filter((call) => call.includes("v0=triage"))).toHaveLength(1);
});

defineTest("ready and unblock clear parked metadata before becoming Ready", () => {
  const parked = createState("Parked");
  addParkedMetadata(parked);
  expect(drive(parked, "ready", "11").status).toBe(0);
  expect(fieldValue(parked, "Wake condition")).toBeUndefined();
  expect(fieldValue(parked, "Disposition")).toBe("Action");

  const unblocked = createState("Blocked");
  addParkedMetadata(unblocked);
  expect(drive(unblocked, "unblock", "11", "--by", String(FIRST_BLOCKER)).status).toBe(0);
  expect(fieldValue(unblocked, "Wake condition")).toBeUndefined();
  expect(fieldValue(unblocked, "Disposition")).toBe("Action");
});

// EIGHT sequential `drive` spawns, each a full CLI process over the fake `gh` — a SPAWN-COUNT budget, not
// a compute one, so it scales with load rather than with this box. MEASURED 2026-09-02: 1,393ms alone and
// 1,294ms beside three co-running suites at --maxWorkers=4 (~170ms per spawn); it timed out at the file's
// default 5,000ms under a drain battery, which is only ~3.5x that per-spawn cost. Takes the same explicit
// budget as the other spawn-heavy cases here — `TABLE_DRIVEN_TIMEOUT_MS` is the file's one spawn budget,
// table-driven or not (the `land` case above already rides it for the same reason).
defineTest(
  "interrupted and uncertain lifecycle transitions converge when retried",
  () => {
    const partialNeedsOwner = createState("Running");
    const partialItem = partialNeedsOwner.items[0];
    if (partialItem !== undefined) {
      partialItem[REVIEW_FIELD] = "Owner";
      Reflect.deleteProperty(partialItem, "Lane");
      partialItem[WAKE_CONDITION_FIELD] = "stale wake";
      partialItem[DISPOSITION_FIELD] = "Action";
    }
    expect(drive(partialNeedsOwner, "needs-owner", "11").status).toBe(0);
    expect(fieldValue(partialNeedsOwner, STATUS_FIELD)).toBe("Needs owner");
    expect(fieldValue(partialNeedsOwner, WAKE_CONDITION_FIELD)).toBeUndefined();
    expect(fieldValue(partialNeedsOwner, DISPOSITION_FIELD)).toBe("Untriaged");
    expect(drive(partialNeedsOwner, "needs-owner", "11").status).toBe(0);

    const uncertainReady = createState("Ready");
    addParkedMetadata(uncertainReady);
    expect(drive(uncertainReady, "ready", "11").status).toBe(0);
    expect(fieldValue(uncertainReady, WAKE_CONDITION_FIELD)).toBeUndefined();
    expect(fieldValue(uncertainReady, DISPOSITION_FIELD)).toBe("Action");

    const uncertainClaim = createState("Running");
    const runningItem = uncertainClaim.items[0];
    if (runningItem !== undefined) {
      runningItem["Lane"] = "same-lane";
    }
    expect(drive(uncertainClaim, "claim", "11", "--lane", "same-lane").status).toBe(0);
    const wrongLane = drive(uncertainClaim, "claim", "11", "--lane", "other-lane");
    expect(wrongLane.status).toBe(TOOL_ERROR_EXIT);
    expect(wrongLane.stderr).toContain("already Running in lane same-lane");

    const uncertainVerify = createState("Verify");
    const verifyItem = uncertainVerify.items[0];
    if (verifyItem !== undefined) {
      verifyItem[EVIDENCE_FIELD] = "receipt-a";
    }
    expect(drive(uncertainVerify, "verify", "11", "--evidence", "receipt-a").status).toBe(0);
    const wrongEvidence = drive(uncertainVerify, "verify", "11", "--evidence", "receipt-b");
    expect(wrongEvidence.status).toBe(TOOL_ERROR_EXIT);
    expect(wrongEvidence.stderr).toContain("already Verify with different Evidence");
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

defineTest("closed work items refuse lifecycle mutations", () => {
  const state = createState("Triage");
  targetIssue(state).state = "CLOSED";
  const result = drive(state, "review", "11");
  expect(result.status).toBe(TOOL_ERROR_EXIT);
  expect(result.stderr).toContain("cannot change a closed work item");
  expect(mutationCalls(state)).toHaveLength(0);
});

defineTest("block and unblock retries reconcile without repeating relations", () => {
  const blocked = createState("Blocked", [FIRST_BLOCKER]);
  expect(drive(blocked, "block", "11", "--by", String(FIRST_BLOCKER)).status).toBe(0);
  expect(targetIssue(blocked).blockers).toEqual([FIRST_BLOCKER]);
  const unblocked = createState("Blocked");
  expect(drive(unblocked, "unblock", "11", "--by", String(FIRST_BLOCKER)).status).toBe(0);
  expect(targetIssue(unblocked).blockers).toEqual([]);
  expect(fieldValue(unblocked, STATUS_FIELD)).toBe("Ready");
});

defineTest("a CLOSED blocker is dropped from the live block list — GitHub keeps the edge after close", () => {
  // #632's real-world manifestation: Blocked on #627, and #627 closed without the edge disappearing.
  // requireUnblocked (lifecycle.ts) trusts `target.blockers` verbatim, so the filter has to happen at
  // the derivation (fetchIssueContext/fetchBlockers) or every reader inherits the stale edge.
  const state = createState("Blocked", [FIRST_BLOCKER]);
  const blocker = state.issues[String(FIRST_BLOCKER)];
  if (blocker !== undefined) {
    blocker.state = "CLOSED";
  }
  expect(drive(state, "ready", "11").status).toBe(0);
  expect(fieldValue(state, STATUS_FIELD)).toBe("Ready");
});

defineTest("one OPEN blocker still refuses ready/claim", () => {
  const state = createState("Blocked", [FIRST_BLOCKER]);
  const ready = drive(state, "ready", "11");
  expect(ready.status).toBe(TOOL_ERROR_EXIT);
  expect(ready.stderr).toContain("cannot become Ready while blocked");
});

defineTest("one open blocker plus one closed blocker still refuses — only ALL-closed clears it", () => {
  const state = createState("Blocked", [FIRST_BLOCKER, SECOND_BLOCKER]);
  const blocker = state.issues[String(SECOND_BLOCKER)];
  if (blocker !== undefined) {
    blocker.state = "CLOSED";
  }
  const ready = drive(state, "ready", "11");
  expect(ready.status).toBe(TOOL_ERROR_EXIT);
  expect(ready.stderr).toContain("cannot become Ready while blocked");
});

defineTest("unblock --by a number that was never a current blocker is a documented no-op, not state corruption", () => {
  // Reproduces the live #632 confusion (`unblock 632 --by 24` printed success when the only real
  // blocker was #627): the row stays exactly as blocked as it truly is — Status unchanged, the real
  // blocker list unchanged — it never fabricates an unblock that didn't happen. This mirrors block()'s
  // own idempotent-when-already-present symmetry (lifecycle.ts) and is WAI per the file's rerunnable
  // doctrine, not the same defect class as the closed-blocker read bug above.
  const state = createState("Blocked", [FIRST_BLOCKER]);
  const result = drive(state, "unblock", "11", "--by", String(SECOND_BLOCKER));
  expect(result.status).toBe(0);
  expect(fieldValue(state, STATUS_FIELD)).toBe("Blocked");
  expect(targetIssue(state).blockers).toEqual([FIRST_BLOCKER]);
});

defineTest("block sends the blocker-query issue number as a typed GraphQL input", () => {
  const state = createState("Running");
  expect(drive(state, "block", "11", "--by", String(FIRST_BLOCKER)).status).toBe(0);
  const blockerQuery = state.calls.find((args) => args[0] === "api" && args[1] === "graphql" && args.some((arg) => arg.includes("blockedBy")));
  expect(blockerQuery).toEqual(expect.arrayContaining(["-F", `number=${TARGET_ISSUE}`]));
  expect(blockerQuery?.find((arg, index) => blockerQuery[index - 1] === "-F" && arg.startsWith("number="))).toBe(`number=${TARGET_ISSUE}`);
});

defineTest("done is reconcilable after a partial failure and posts evidence once", () => {
  const state = createState("Verify");
  const item = state.items[0];
  if (item !== undefined) {
    item[EVIDENCE_FIELD] = "all tests passed";
  }
  targetIssue(state).comments.push("Verification evidence: all tests passed");
  expect(drive(state, "done", "11", "--evidence", "all tests passed").status).toBe(0);
  expect(targetIssue(state).comments).toEqual(["Verification evidence: all tests passed"]);
  expect(targetIssue(state).state).toBe("CLOSED");
});

defineTest("set cannot write lifecycle-controlled fields", () => {
  const result = drive(createState("Triage"), "set", "11", "Status", "Done");
  expect(result.status).toBe(MISUSE_EXIT);
  expect(result.stderr).toContain("set cannot modify lifecycle-controlled field Status");
});

defineTest("transitions batch field writes into one aliased request and commit Status last in its own request", () => {
  const state = createState("Running");
  const item = state.items[0];
  if (item !== undefined) {
    item["Lane"] = "active-lane";
    item[WAKE_CONDITION_FIELD] = "await owner";
    item[DISPOSITION_FIELD] = "Action";
  }
  expect(drive(state, "needs-owner", "11").status).toBe(0);
  const mutations = mutationCalls(state);
  expect(mutations).toHaveLength(2);
  const batch = queryOf(mutations[0] ?? []);
  expect(batch).toContain("WorkItemFields");
  // Review + Disposition set, Lane + Wake condition cleared — four aliased operations, one request.
  expect(batch.match(/ProjectV2ItemFieldValue/gu) ?? []).toHaveLength(4);
  expect(queryOf(mutations[1] ?? [])).toContain("WorkItemStatus");
});

defineTest("lifecycle commands resolve the item through the issue and never enumerate the project", () => {
  const state = createState("Ready");
  expect(drive(state, "claim", "11", "--lane", "quota-lane").status).toBe(0);
  expect(state.calls.some((call) => call[0] === "project")).toBe(false);
  expect(operationCalls(state, "WorkItemList")).toHaveLength(0);
  // context + cold project-context fetch + Lane batch + Status — the whole claim in four requests.
  expect(graphqlCalls(state)).toHaveLength(4);
  expect(state.calls.some((call) => call[0] === "issue" && call[1] === "edit")).toBe(true);
});

defineTest("project context caches across invocations and self-heals a stale cache", () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "work-item-cache-"));
  try {
    const state = createState("Ready");
    state.cacheDir = cacheDir;
    expect(drive(state, "claim", "11", "--lane", "warm-lane").status).toBe(0);
    expect(operationCalls(state, "WorkItemProject")).toHaveLength(1);
    expect(drive(state, "review", "11").status).toBe(0);
    // Cumulative count is still one: the second invocation ran entirely on the cached context.
    expect(operationCalls(state, "WorkItemProject")).toHaveLength(1);

    const cachePath = join(cacheDir, "work-item-project.json");
    const cached = JSON.parse(readFileSync(cachePath, "utf8")) as { readonly fields: readonly { readonly id: string }[] };
    writeFileSync(cachePath, JSON.stringify({ ...cached, fields: cached.fields.map((field) => ({ ...field, id: `stale-${field.id}` })) }));
    expect(drive(state, "verify", "11", "--evidence", "receipt-1").status).toBe(0);
    expect(operationCalls(state, "WorkItemProject")).toHaveLength(2);
    expect(fieldValue(state, EVIDENCE_FIELD)).toBe("receipt-1");
    const healed = JSON.parse(readFileSync(cachePath, "utf8")) as { readonly fields: readonly { readonly id: string }[] };
    expect(healed.fields[0]?.id).not.toContain("stale-");
  } finally {
    rmSync(cacheDir, { force: true, recursive: true });
  }
});

defineTest("rate-limit exhaustion exits 2 with the reset timestamp instead of a raw failure", () => {
  const state = createState("Running");
  state.rateLimitAfter = 0;
  const result = drive(state, "review", "11");
  expect(result.status).toBe(TOOL_ERROR_EXIT);
  expect(result.stderr).toContain("GitHub GraphQL rate limit exhausted");
  expect(result.stderr).toContain(new Date(FAKE_RESET_EPOCH * 1000).toISOString());
  expect(state.calls.some((call) => call[0] === "api" && call[1] === "rate_limit")).toBe(true);
});

defineTest("list paginates with cursors until the last page", () => {
  const state = createState("Running");
  state.items.push({
    id: "item-8",
    content: { number: 8, url: "https://example.test/issues/8" },
    [STATUS_FIELD]: "Ready",
    [DISPOSITION_FIELD]: "Action",
  });
  state.listPageSize = 1;
  const result = drive(state, "list");
  expect(result.status).toBe(0);
  const listed = JSON.parse(result.stdout) as { readonly items: readonly { readonly issue: number }[] };
  expect(listed.items.map((row) => row.issue)).toEqual([8, 11]);
  expect(operationCalls(state, "WorkItemList")).toHaveLength(2);
  const second = operationCalls(state, "WorkItemList")[1];
  expect(second ?? []).toEqual(expect.arrayContaining(["-f", "cursor=1"]));
  expect(mutationCalls(state)).toHaveLength(0);
});

defineTest("show prints the targeted item without enumerating the project", () => {
  const state = createState("Running");
  const result = drive(state, "show", "11");
  expect(result.status).toBe(0);
  const shown = JSON.parse(result.stdout) as Record<string, unknown>;
  expect(shown["id"]).toBe("item-11");
  expect(shown["content"]).toEqual({ number: 11, url: "https://example.test/issues/11" });
  expect(shown["Status"]).toBe("Running");
  expect(operationCalls(state, "WorkItemList")).toHaveLength(0);
  expect(graphqlCalls(state)).toHaveLength(1);

  const absent = drive(createState("Running"), "show", "7");
  expect(absent.status).toBe(TOOL_ERROR_EXIT);
  expect(absent.stderr).toContain("#7 is not in Project 1");
});

defineTest("a stale cached single-select OPTION id self-heals through one refetch-and-retry", () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "work-item-cache-"));
  try {
    const state = createState("Ready");
    state.cacheDir = cacheDir;
    expect(drive(state, "list").status).toBe(0);
    expect(operationCalls(state, "WorkItemProject")).toHaveLength(1);

    const cachePath = join(cacheDir, "work-item-project.json");
    const cached = JSON.parse(readFileSync(cachePath, "utf8")) as {
      readonly fields: readonly { readonly name: string; readonly options?: readonly { readonly id: string; readonly name: string }[] }[];
    };
    writeFileSync(
      cachePath,
      JSON.stringify({
        ...cached,
        fields: cached.fields.map((field) =>
          field.name === DISPOSITION_FIELD ? { ...field, options: field.options?.map((choice) => ({ ...choice, id: `stale-${choice.id}` })) } : field,
        ),
      }),
    );

    const result = drive(state, "ready", "11");
    expect(result.status).toBe(0);
    expect(operationCalls(state, "WorkItemProject")).toHaveLength(2);
    expect(fieldValue(state, DISPOSITION_FIELD)).toBe("Action");
  } finally {
    rmSync(cacheDir, { force: true, recursive: true });
  }
});

defineTest("a persistently rejected option surfaces the real error after the second failure", () => {
  const state = createState("Ready");
  state.failOptionAlways = true;
  const result = drive(state, "ready", "11");
  expect(result.status).toBe(TOOL_ERROR_EXIT);
  expect(result.stderr).toContain("does not belong to field");
  expect(operationCalls(state, "WorkItemProject")).toHaveLength(2);
  expect(fieldValue(state, DISPOSITION_FIELD)).toBe("Untriaged");
});

defineTest("secondary rate limits report GitHub's documented backoff, not the primary reset time", () => {
  const state = createState("Running");
  state.rateLimitAfter = 0;
  state.secondaryRateLimit = true;
  const result = drive(state, "review", "11");
  expect(result.status).toBe(TOOL_ERROR_EXIT);
  expect(result.stderr).toContain("secondary rate limit");
  expect(result.stderr).not.toContain(new Date(FAKE_RESET_EPOCH * 1000).toISOString());
  expect(result.stderr).not.toContain("GraphQL:");
  expect(state.calls.some((call) => call[0] === "api" && call[1] === "rate_limit")).toBe(false);
});

// ── #870: the call count IS the cost ────────────────────────────────────────────────────────────────
// A transcript census measured a MEDIAN of 3 separate board calls to walk one row, re-billing the
// caller's whole context each time. These four pins are about CALLS, not new lifecycle semantics: every
// composite below must be provably identical to the sequence it replaces, or it is a second lifecycle.

defineTest("every lifecycle verb takes a LIST of issues, and one refusal stops the run at that row", () => {
  const state = createState("Triage");
  state.items.push({
    id: "item-8",
    content: { number: 8, url: "https://example.test/issues/8" },
    [STATUS_FIELD]: "Triage",
    [DISPOSITION_FIELD]: "Untriaged",
    [KIND_FIELD]: "Work",
    [PRIORITY_FIELD]: "High",
    [AREA_FIELD]: "Docs",
    [REVIEW_FIELD]: "Technical",
  });
  const result = drive(state, "ready", "8", "11");
  expect(result.status).toBe(0);
  // The receipt names every row that moved — a batched call is not vaguer than a single one.
  expect(result.stdout).toContain("#8 #11 ready");
  expect(itemFieldValue(state, 8, STATUS_FIELD)).toBe("Ready");
  expect(fieldValue(state, STATUS_FIELD)).toBe("Ready");

  // A field name is never swallowed as an id: the run of numbers stops at the first non-numeric token.
  expect(parseWorkCommand(["set", "11", "12", "Priority", "High"])).toEqual({
    kind: "set",
    issues: [11, 12],
    assignments: [{ name: "Priority", value: "High" }],
  });
  expect(parseWorkCommand(["set", "11", "Priority", "High"])).toEqual({ kind: "set", issues: [11], assignments: [{ name: "Priority", value: "High" }] });

  // A refusal mid-list stops there. #8 is already Ready (a no-op rerun); #11 is Review and refuses.
  const partial = createState("Review");
  partial.items.push({
    id: "item-8",
    content: { number: 8, url: "https://example.test/issues/8" },
    [STATUS_FIELD]: "Triage",
    [DISPOSITION_FIELD]: "Untriaged",
    [KIND_FIELD]: "Work",
    [PRIORITY_FIELD]: "High",
    [AREA_FIELD]: "Docs",
    [REVIEW_FIELD]: "Technical",
  });
  const stopped = drive(partial, "ready", "8", "11");
  expect(stopped.status).toBe(TOOL_ERROR_EXIT);
  expect(stopped.stderr).toContain("must be Triage, Needs owner, Blocked, Parked, or Ready before Ready");
  // The row BEFORE the refusal keeps its transition — each row is committed by its own Status write.
  expect(itemFieldValue(partial, 8, STATUS_FIELD)).toBe("Ready");
});

defineTest("show batches N rows into ONE call and leaves the single-row shape byte-identical", () => {
  const state = createState("Running");
  state.items.push({
    id: "item-8",
    content: { number: 8, url: "https://example.test/issues/8" },
    [STATUS_FIELD]: "Ready",
    [DISPOSITION_FIELD]: "Action",
  });
  const result = drive(state, "show", "8", "11");
  expect(result.status).toBe(0);
  const shown = JSON.parse(result.stdout) as { readonly items: readonly Record<string, unknown>[] };
  expect(shown.items).toHaveLength(2);
  expect(shown.items[0]?.["Status"]).toBe("Ready");
  expect(shown.items[1]?.["Status"]).toBe("Running");
  // Still never an enumeration: one targeted context query per row, no WorkItemList.
  expect(operationCalls(state, "WorkItemList")).toHaveLength(0);
});

defineTest(
  "file creates, writes the four metadata fields, readies and claims in ONE invocation",
  () => {
    const state = createState("Triage");
    const result = drive(
      state,
      "file",
      "--title",
      "One-call row",
      "--kind",
      "work",
      "--priority",
      "High",
      "--area",
      "Docs",
      "--review",
      "Technical",
      "--claim",
      "p-snap-board",
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`created #${CREATED_ISSUE}`);
    expect(result.stdout).toContain("claimed by p-snap-board");
    expect(itemFieldValue(state, CREATED_ISSUE, KIND_FIELD)).toBe("Work");
    expect(itemFieldValue(state, CREATED_ISSUE, PRIORITY_FIELD)).toBe("High");
    expect(itemFieldValue(state, CREATED_ISSUE, AREA_FIELD)).toBe("Docs");
    expect(itemFieldValue(state, CREATED_ISSUE, REVIEW_FIELD)).toBe("Technical");
    expect(itemFieldValue(state, CREATED_ISSUE, STATUS_FIELD)).toBe("Running");
    expect(itemFieldValue(state, CREATED_ISSUE, "Lane")).toBe("p-snap-board");
    // With no --body-file the body IS the title — the one-line row this verb exists for.
    const createCall = state.calls.find((args) => args[0] === "issue" && args[1] === "create");
    expect(createCall).toEqual(expect.arrayContaining(["--body", "One-call row"]));

    // A decision enters Needs owner: --ready is refused rather than walking past the owner gate.
    expect(() => parseWorkCommand(["file", "--title", "A fork", "--kind", "decision", "--ready"])).toThrow("resolve the owner decision");
    // ready's OWN metadata guard is what refuses an incomplete row — the rule is not re-spelled in file.
    const thin = drive(createState("Triage"), "file", "--title", "Thin row", "--kind", "work", "--ready");
    expect(thin.status).toBe(TOOL_ERROR_EXIT);
    expect(thin.stderr).toContain("must set Priority, Area, Review before Ready");
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

// One `land` spawn walks four transitions, so this file's default 5s budget is the wrong unit for it —
// the same reason the create table above carries an explicit one.
defineTest(
  "land walks claim → review → verify → done on one receipt, and resumes from wherever a row is",
  () => {
    const ready = createState("Ready");
    const landed = drive(ready, "land", "11", "--lane", "p-snap-board", "--evidence", "abc1234");
    expect(landed.status).toBe(0);
    expect(fieldValue(ready, STATUS_FIELD)).toBe("Done");
    expect(fieldValue(ready, EVIDENCE_FIELD)).toBe("abc1234");
    expect(fieldValue(ready, "Lane")).toBe("p-snap-board");
    expect(targetIssue(ready).state).toBe("CLOSED");
    // The same-receipt rule survives: done's evidence comment is posted exactly once, from the one string.
    expect(targetIssue(ready).comments).toEqual(["Verification evidence: abc1234"]);

    // RESUMABLE: a row already at Verify skips the earlier steps instead of refusing at review.
    const midway = createState("Verify");
    const verifyItem = midway.items[0];
    if (verifyItem !== undefined) {
      verifyItem[EVIDENCE_FIELD] = "abc1234";
    }
    expect(drive(midway, "land", "11", "--evidence", "abc1234").status).toBe(0);
    expect(fieldValue(midway, STATUS_FIELD)).toBe("Done");

    // A Ready row with no --lane refuses: land never invents a claim the caller did not make.
    const unclaimed = drive(createState("Ready"), "land", "11", "--evidence", "abc1234");
    expect(unclaimed.status).toBe(TOOL_ERROR_EXIT);
    expect(unclaimed.stderr).toContain("requires --lane");

    // A row that has not reached Ready refuses loudly rather than silently doing nothing.
    const early = drive(createState("Triage"), "land", "11", "--lane", "p-snap-board", "--evidence", "abc1234");
    expect(early.status).toBe(TOOL_ERROR_EXIT);
    expect(early.stderr).toContain("must be Ready or later before land");

    // An over-COLUMN receipt walks the whole close via the split (#923 P2) — field head+pointer,
    // full text as a comment; only the HARD cap still refuses, as misuse, before any write.
    const overColumn = createState("Ready");
    const split = drive(overColumn, "land", "11", "--lane", "x", "--evidence", "x".repeat(1025));
    expect(split.status).toBe(0);
    expect(targetIssue(overColumn).state).toBe("CLOSED");
    expect(Buffer.byteLength(fieldValue(overColumn, EVIDENCE_FIELD) ?? "", "utf8")).toBeLessThanOrEqual(1024);
    expect(targetIssue(overColumn).comments.some((body) => body.includes("Full verification receipt"))).toBe(true);
    const absurd = drive(createState("Ready"), "land", "11", "--lane", "x", "--evidence", "x".repeat(60_001));
    expect(absurd.status).toBe(MISUSE_EXIT);
    expect(absurd.stderr).toContain("hard cap is 60000");
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

defineTest("primary and secondary rate-limit failures produce two distinct operator messages", () => {
  const primary = createState("Running");
  primary.rateLimitAfter = 0;
  const primaryResult = drive(primary, "review", "11");
  const secondary = createState("Running");
  secondary.rateLimitAfter = 0;
  secondary.secondaryRateLimit = true;
  const secondaryResult = drive(secondary, "review", "11");
  expect(primaryResult.status).toBe(TOOL_ERROR_EXIT);
  expect(secondaryResult.status).toBe(TOOL_ERROR_EXIT);
  expect(primaryResult.stderr).not.toBe(secondaryResult.stderr);
  expect(primaryResult.stderr).not.toContain("GraphQL:");
  expect(secondaryResult.stderr).not.toContain("GraphQL:");
});

// ── #923: the Definition of Done — RED at file time, a gate at the close ────────────────────────────
// The bar lives in two paired places: the command in a ```dod body block (edit history = the trace) and
// a sha256 stamp in the Project's DoD field, written only by the red-first mint paths. These pins prove
// both directions of every clause in the issue's own Receipt section, against the fake board.

const DOD_FIELD = "DoD";

/** Hand a Verify-shaped row a MINTED bar: the body block plus its matching stamp. */
function withDod(state: FakeState, command: string): void {
  targetIssue(state).body = `row body\n\n${buildDodBlock(command)}`;
  const item = state.items[0];
  if (item !== undefined) {
    item[DOD_FIELD] = dodStamp(command);
  }
}

function withVerifyEvidence(state: FakeState, evidence: string): void {
  const item = state.items[0];
  if (item !== undefined) {
    item[EVIDENCE_FIELD] = evidence;
  }
}

defineTest(
  "file --dod runs the bar BEFORE any board call and refuses a green or unfinishable one",
  () => {
    const green = createState("Triage");
    const refused = drive(green, "file", "--title", "Ghost bug", "--kind", "bug", "--dod", "exit 0");
    expect(refused.status).toBe(TOOL_ERROR_EXIT);
    expect(refused.stderr).toContain("already green at mint");
    expect(refused.stderr).toContain("exit 0");
    // Zero board cost: not one gh invocation of any kind reached the fake.
    expect(green.calls).toHaveLength(0);

    const hung = createState("Triage");
    hung.dodTimeoutMs = 400;
    const timedOut = drive(hung, "file", "--title", "Slow bar", "--kind", "bug", "--dod", "sleep 5");
    expect(timedOut.status).toBe(TOOL_ERROR_EXIT);
    expect(timedOut.stderr).toContain("did not complete within 400ms");
    expect(hung.calls).toHaveLength(0);
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

defineTest(
  "a red DoD files: the block lands in the created body, the stamp in the DoD field; bug rows without one get the nudge",
  () => {
    const state = createState("Triage");
    const result = drive(
      state,
      "file",
      "--title",
      "Real bug",
      "--kind",
      "bug",
      "--priority",
      "High",
      "--area",
      "Docs",
      "--review",
      "Technical",
      "--dod",
      "exit 1",
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("DoD red at mint (exit 1)");
    const createCall = state.calls.find((args) => args[0] === "issue" && args[1] === "create") ?? [];
    expect(createCall[createCall.indexOf("--body") + 1]).toContain("```dod\nexit 1\n```");
    expect(itemFieldValue(state, CREATED_ISSUE, DOD_FIELD)).toBe(dodStamp("exit 1"));
    expect(result.stdout).not.toContain("no --dod");

    const bare = drive(createState("Triage"), "file", "--title", "Bar-less bug", "--kind", "bug");
    expect(bare.status).toBe(0);
    expect(bare.stdout).toContain("no --dod");
    const work = drive(createState("Triage"), "file", "--title", "Feature row", "--kind", "work");
    expect(work.status).toBe(0);
    expect(work.stdout).not.toContain("no --dod");
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

// #1117's workboard half. The row's premise — "the per-verb tails accept unrecognised tokens" — is
// REFUTED here for this tool: `parseWorkCommand` was already strict on every verb (`option` for the
// single-option tails, `refuseUnknownFlags` for the composites, an explicit refusal for the tails that
// take none). What was missing is the other side of the acceptance bar: nothing pinned that the spellings
// the two orchestrators drive HOURLY still parse. A refused working spelling at a merge fold is a P1, so
// the sweep is the floor. Every row below is a spelling live in `.claude/rules/orchestration.md`
// §Work control, `.claude/skills/orchestrator-runbook/SKILL.md`, or `.claude/hooks/session-onboard.sh` —
// parse-only (a pure function), so no board write can escape.
const LIVE_SPELLINGS: readonly (readonly string[])[] = [
  ["overview"], // session-onboard.sh + "before EVERY refill decision"
  ["--help"], // orchestration.md §Work control
  ["list", "--status", "Needs owner"], // runbook §42
  ["show", "11", "12"], // runbook §43 — the id LIST form
  ["create", "work", "--title", "A finding", "--body-file", "issue.md"], // runbook §47
  ["file", "--title", "A finding", "--kind", "work", "--priority", "P2", "--area", "Client", "--review", "side-eye", "--claim", "p-argv-tail"],
  ["file", "--title", "A finding", "--kind", "bug", "--priority", "P1", "--area", "Tooling", "--review", "verifier", "--body-file", "b.md", "--ready"],
  ["land", "11", "12", "--evidence", "abc1234", "--lane", "p-argv-tail"], // orchestration.md #870
  ["land", "11", "--evidence", "abc1234", "--comment-file", "c.md"],
  ["claim", "11", "--lane", "p-argv-tail"],
  ["ready", "11", "12"],
  ["review", "11"],
  ["needs-owner", "11"],
  ["set", "11", "Priority", "High", "Area", "Client"],
  ["verify", "11", "--evidence", "green"],
  ["reverify", "11", "--evidence", "green"],
  ["done", "11", "--evidence", "abc1234"],
  ["refute", "11", "--evidence", "red"],
  ["dod", "11", "--cmd", "exit 1"],
  ["park", "11", "--wake", "when the owner rules"],
  ["block", "11", "--by", "7"],
  ["unblock", "11", "--by", "7"],
];

defineTest("every LIVE work:item spelling still parses — byte-stability is the acceptance bar (#1117)", () => {
  for (const argv of LIVE_SPELLINGS) {
    expect(() => parseWorkCommand(argv), `live spelling refused: work:item ${argv.join(" ")}`).not.toThrow();
  }
  // The planted control for the sweep itself: a table that could not fail would prove nothing. One typo'd
  // flag inside an otherwise-live spelling must still refuse.
  expect(() => parseWorkCommand(["land", "11", "--evidnce", "abc1234"])).toThrow("land does not recognize --evidnce");
});

defineTest("the DoD parse guards: class fit, spelling, unknown flags, dangling override, set refusal", () => {
  expect(() => parseWorkCommand(["file", "--title", "Fork", "--kind", "decision", "--dod", "exit 1"])).toThrow("a decision closes on an owner ruling");
  expect(() => parseWorkCommand(["file", "--title", "Sprint", "--kind", "program", "--dod", "exit 1"])).toThrow("a program closes on its child rows");
  expect(() => parseWorkCommand(["file", "--title", "x", "--kind", "bug", "--dod", "npx vitest run t.test.ts"])).toThrow("must not invoke npx");
  // The #1043-adjacent silent-typo class: an unknown flag refuses instead of silently dropping.
  expect(() => parseWorkCommand(["file", "--title", "x", "--kind", "work", "--prioirty", "High"])).toThrow("file does not recognize --prioirty");
  expect(() => parseWorkCommand(["set", "11", "DoD", "sha256:abc"])).toThrow("set cannot modify lifecycle-controlled field DoD");
  expect(() => parseWorkCommand(["done", "11", "--evidence", "r", "--force-close"])).toThrow("--reason requires a value");
  expect(() => parseWorkCommand(["land", "11", "--evidence", "r", "--reason", "text"])).toThrow("--reason requires --force-close");
  expect(parseWorkCommand(["dod", "11", "--cmd", "exit 1"])).toEqual({ kind: "dod", issues: [11], command: "exit 1" });
  expect(parseWorkCommand(["refute", "11", "--evidence", "failed", "--dod", "exit 1"])).toEqual({
    kind: "refute",
    issues: [11],
    evidence: "failed",
    dod: "exit 1",
  });
});

defineTest(
  "done/land run the DoD at close and refuse a red one printing what ran; a green one (CRLF body included) closes",
  () => {
    const red = createState("Verify");
    withVerifyEvidence(red, "abc1234");
    withDod(red, "echo boom; exit 7");
    const refused = drive(red, "land", "11", "--evidence", "abc1234");
    expect(refused.status).toBe(TOOL_ERROR_EXIT);
    expect(refused.stderr).toContain("DoD is red — refusing to close #11");
    expect(refused.stderr).toContain("echo boom; exit 7");
    expect(refused.stderr).toContain("exit: 7");
    expect(refused.stderr).toContain("boom");
    expect(targetIssue(red).state).toBe("OPEN");
    expect(fieldValue(red, STATUS_FIELD)).toBe("Verify");

    // The primitive spelling hits the same gate — done() is the one close door.
    const alsoDone = drive(red, "done", "11", "--evidence", "abc1234");
    expect(alsoDone.status).toBe(TOOL_ERROR_EXIT);
    expect(alsoDone.stderr).toContain("DoD is red");

    // Green closes — through a \r\n body, GitHub's real wire shape for issue bodies.
    const green = createState("Verify");
    withVerifyEvidence(green, "abc1234");
    withDod(green, "exit 0");
    targetIssue(green).body = (targetIssue(green).body ?? "").replaceAll("\n", "\r\n");
    expect(drive(green, "land", "11", "--evidence", "abc1234").status).toBe(0);
    expect(targetIssue(green).state).toBe("CLOSED");
    expect(fieldValue(green, STATUS_FIELD)).toBe("Done");
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

defineTest("a per-DoD timeout bounds the close — a sleeping bar refuses instead of hanging a batched land", () => {
  const state = createState("Verify");
  withVerifyEvidence(state, "abc1234");
  withDod(state, "sleep 5");
  state.dodTimeoutMs = 400;
  const result = drive(state, "land", "11", "--evidence", "abc1234");
  expect(result.status).toBe(TOOL_ERROR_EXIT);
  expect(result.stderr).toContain("did not complete within 400ms");
  expect(targetIssue(state).state).toBe("OPEN");
});

defineTest("the pairing is two-sided: an unminted block, an edited block, and a deleted block refuse BY NAME, never run", () => {
  // Every bar below is `exit 0` — if any of these paths EXECUTED it, the close would succeed; the
  // refusal is therefore also the proof that nothing ran.
  const unminted = createState("Verify");
  withVerifyEvidence(unminted, "r");
  targetIssue(unminted).body = buildDodBlock("exit 0");
  const u = drive(unminted, "land", "11", "--evidence", "r");
  expect(u.status).toBe(TOOL_ERROR_EXIT);
  expect(u.stderr).toContain("never minted through work:item");

  const edited = createState("Verify");
  withVerifyEvidence(edited, "r");
  withDod(edited, "exit 1");
  targetIssue(edited).body = `row body\n\n${buildDodBlock("exit 0")}`;
  const e = drive(edited, "land", "11", "--evidence", "r");
  expect(e.status).toBe(TOOL_ERROR_EXIT);
  expect(e.stderr).toContain("edited without re-minting");

  const deleted = createState("Verify");
  withVerifyEvidence(deleted, "r");
  withDod(deleted, "exit 0");
  targetIssue(deleted).body = "the bar was removed from this body";
  const d = drive(deleted, "land", "11", "--evidence", "r");
  expect(d.status).toBe(TOOL_ERROR_EXIT);
  expect(d.stderr).toContain("the bar was deleted");
});

defineTest(
  "--force-close --reason closes red, records the override on the issue, and provably does NOT run the bar",
  () => {
    const directory = mkdtempSync(join(tmpdir(), "work-item-dod-witness-"));
    try {
      const witness = join(directory, "ran");
      const state = createState("Verify");
      withVerifyEvidence(state, "abc1234");
      const command = `touch ${witness}; exit 1`;
      withDod(state, command);
      const result = drive(state, "land", "11", "--evidence", "abc1234", "--force-close", "--reason", "bar rotted; receipts in comment");
      expect(result.status).toBe(0);
      expect(targetIssue(state).state).toBe("CLOSED");
      const override = targetIssue(state).comments.find((body) => body.includes("DoD override"));
      expect(override).toContain("bar rotted; receipts in comment");
      expect(override).toContain(command);
      // The planted witness: the overridden bar was never executed.
      expect(existsSync(witness)).toBe(false);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }

    // Two-sided: a row with NO bar refuses the override — there is nothing to record.
    const bare = createState("Verify");
    withVerifyEvidence(bare, "r");
    const refused = drive(bare, "land", "11", "--evidence", "r", "--force-close", "--reason", "nothing to override");
    expect(refused.status).toBe(TOOL_ERROR_EXIT);
    expect(refused.stderr).toContain("has no DoD");
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

defineTest("an interrupted close reruns convergently: a row already at Done never re-executes its bar", () => {
  const directory = mkdtempSync(join(tmpdir(), "work-item-dod-rerun-"));
  try {
    const witness = join(directory, "ran");
    const state = createState("Done");
    withVerifyEvidence(state, "abc1234");
    withDod(state, `touch ${witness}; exit 1`);
    targetIssue(state).comments.push("Verification evidence: abc1234");
    const result = drive(state, "done", "11", "--evidence", "abc1234");
    expect(result.status).toBe(0);
    expect(targetIssue(state).state).toBe("CLOSED");
    expect(existsSync(witness)).toBe(false);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

defineTest(
  "dod re-mints red-first: refuses a green bar at zero board cost, replaces the block, restamps; decision rows refuse",
  () => {
    const green = createState("Running");
    const refused = drive(green, "dod", "11", "--cmd", "exit 0");
    expect(refused.status).toBe(TOOL_ERROR_EXIT);
    expect(refused.stderr).toContain("already green at mint");
    expect(green.calls).toHaveLength(0);

    const state = createState("Running");
    withDod(state, "exit 5");
    const result = drive(state, "dod", "11", "--cmd", "exit 1");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("#11 dod");
    expect(targetIssue(state).body).toContain("```dod\nexit 1\n```");
    // Replacement, not accumulation — exactly one fence remains after a re-mint.
    expect((targetIssue(state).body ?? "").match(/```dod/gu) ?? []).toHaveLength(1);
    expect(fieldValue(state, DOD_FIELD)).toBe(dodStamp("exit 1"));

    const decision = createState("Running");
    const decisionItem = decision.items[0];
    if (decisionItem !== undefined) {
      decisionItem[KIND_FIELD] = "Decision";
    }
    const categorical = drive(decision, "dod", "11", "--cmd", "exit 1");
    expect(categorical.status).toBe(TOOL_ERROR_EXIT);
    expect(categorical.stderr).toContain("a decision closes on an owner ruling");
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

defineTest("refute --dod mints the failing command as the returned row's bar in the same call", () => {
  const state = createState("Verify");
  withVerifyEvidence(state, "old receipt");
  const result = drive(state, "refute", "11", "--evidence", "failed under load", "--dod", "exit 1");
  expect(result.status).toBe(0);
  expect(fieldValue(state, STATUS_FIELD)).toBe("Ready");
  expect(fieldValue(state, EVIDENCE_FIELD)).toBe("failed under load");
  expect(targetIssue(state).body).toContain("```dod\nexit 1\n```");
  expect(fieldValue(state, DOD_FIELD)).toBe(dodStamp("exit 1"));

  const green = createState("Verify");
  withVerifyEvidence(green, "old receipt");
  const refused = drive(green, "refute", "11", "--evidence", "failed", "--dod", "exit 0");
  expect(refused.status).toBe(TOOL_ERROR_EXIT);
  expect(refused.stderr).toContain("already green at mint");
  expect(fieldValue(green, STATUS_FIELD)).toBe("Verify");
});

defineTest("a multi-id refusal names the refusing row, the transitioned rows, and the not-attempted rows", () => {
  const state = createState("Verify");
  withVerifyEvidence(state, "abc1234");
  withDod(state, "exit 9");
  state.items.push({
    id: "item-8",
    content: { number: 8, url: "https://example.test/issues/8" },
    [STATUS_FIELD]: "Verify",
    [DISPOSITION_FIELD]: "Action",
    [KIND_FIELD]: "Work",
    [PRIORITY_FIELD]: "High",
    [AREA_FIELD]: "Docs",
    [REVIEW_FIELD]: "Technical",
    [EVIDENCE_FIELD]: "abc1234",
  });
  const result = drive(state, "land", "8", "11", "7", "--evidence", "abc1234");
  expect(result.status).toBe(TOOL_ERROR_EXIT);
  expect(result.stderr).toContain("#11: DoD is red");
  expect(result.stderr).toContain("already transitioned: #8");
  expect(result.stderr).toContain("not attempted: #7");
  // The row before the refusal keeps its close — the fan-out semantics are unchanged.
  expect(state.issues["8"]?.state).toBe("CLOSED");
});

defineTest(
  "a sweep-shaped DoD: red while the needle exists, green after the sweep, and the close follows the bar",
  () => {
    const directory = mkdtempSync(join(tmpdir(), "work-item-dod-sweep-"));
    try {
      const needleFile = join(directory, "stale.txt");
      writeFileSync(needleFile, "the-old-name");
      const command = `rg -F the-old-name ${directory} --files-with-matches; test $? -eq 1`;
      const state = createState("Triage");
      const filed = drive(
        state,
        "file",
        "--title",
        "Rename sweep",
        "--kind",
        "work",
        "--priority",
        "High",
        "--area",
        "Docs",
        "--review",
        "Technical",
        "--claim",
        "cb-dod-forge",
        "--dod",
        command,
      );
      // RED at mint: the needle still exists on disk.
      expect(filed.status).toBe(0);
      expect(itemFieldValue(state, CREATED_ISSUE, DOD_FIELD)).toBe(dodStamp(command));
      // The sweep happens; the bar flips green; the close now passes its own gate.
      rmSync(needleFile);
      const created = state.items.find((item) => item.content.number === CREATED_ISSUE);
      if (created !== undefined) {
        created[STATUS_FIELD] = "Verify";
        created[EVIDENCE_FIELD] = "sweep receipt";
      }
      const landed = drive(state, "land", String(CREATED_ISSUE), "--evidence", "sweep receipt");
      expect(landed.status).toBe(0);
      expect(state.issues[String(CREATED_ISSUE)]?.state).toBe("CLOSED");
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

defineTest("file fails ATOMICALLY on a bad enum: nothing is created, and the refusal names the valid options (#1043)", () => {
  const state = createState("Triage");
  const result = drive(state, "file", "--title", "Half-fielded row", "--kind", "bug", "--priority", "High", "--area", "Docs", "--review", "Design", "--ready");
  expect(result.status).toBe(TOOL_ERROR_EXIT);
  expect(result.stderr).toContain("Review has no option named Design");
  expect(result.stderr).toContain("Technical | Owner");
  expect(state.calls.some((args) => args[0] === "issue" && args[1] === "create")).toBe(false);
  expect(state.items.some((item) => item.content.number === CREATED_ISSUE)).toBe(false);

  // The other direction: valid enums still file-and-ready exactly as before.
  const good = createState("Triage");
  expect(drive(good, "file", "--title", "Valid row", "--kind", "work", "--priority", "High", "--area", "Docs", "--review", "Technical", "--ready").status).toBe(
    0,
  );
  expect(itemFieldValue(good, CREATED_ISSUE, STATUS_FIELD)).toBe("Ready");
});

defineTest("help documents the DoD surface", () => {
  const result = drive(createState("Triage"), "--help");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("--dod '<cmd>'");
  expect(result.stdout).toContain("--force-close --reason");
  expect(result.stdout).toContain("dod <issue…> [--cmd '<command>']");
  expect(result.stdout).toContain("never npx");
});

// ── #923 P1/P3/P5 (owner-approved 2026-09-01): multi-field set, stdin bodies, form-block adoption ───

defineTest("set takes PAIRS: N fields land as ONE batched mutation, and a lifecycle field anywhere refuses whole", () => {
  // Values DIFFER from the fixture's (Kind Work, Review Technical) — an unchanged value is filtered by
  // pendingChange and would fake a "batched" pin over zero writes.
  const state = createState("Running");
  const result = drive(state, "set", "11", "Kind", "Decision", "Review", "Owner");
  expect(result.status).toBe(0);
  const mutations = mutationCalls(state);
  expect(mutations).toHaveLength(1);
  // Two aliased operations inside the one request — the writeFields batch, not two calls.
  expect(queryOf(mutations[0] ?? []).match(/updateProjectV2ItemFieldValue/gu) ?? []).toHaveLength(2);
  expect(fieldValue(state, KIND_FIELD)).toBe("Decision");
  expect(fieldValue(state, REVIEW_FIELD)).toBe("Owner");

  expect(() => parseWorkCommand(["set", "11", "Priority"])).toThrow("set requires field name and value pairs");
  expect(() => parseWorkCommand(["set", "11", "Priority", "High", "DoD", "x"])).toThrow("set cannot modify lifecycle-controlled field DoD");
});

defineTest("--body-file - reads the body from stdin, composes with --dod, and refuses empty stdin", () => {
  const state = createState("Triage");
  state.stdinBody = "line one\n\nline two";
  const result = drive(state, "file", "--title", "Stdin row", "--kind", "work", "--body-file", "-");
  expect(result.status).toBe(0);
  expect(state.issues[String(CREATED_ISSUE)]?.body).toContain("line one\n\nline two");

  const withBar = createState("Triage");
  withBar.stdinBody = "reported behavior";
  const barred = drive(withBar, "file", "--title", "Stdin bug", "--kind", "bug", "--body-file", "-", "--dod", "exit 1");
  expect(barred.status).toBe(0);
  expect(withBar.issues[String(CREATED_ISSUE)]?.body).toContain("reported behavior");
  expect(withBar.issues[String(CREATED_ISSUE)]?.body).toContain("```dod\nexit 1\n```");

  const empty = createState("Triage");
  empty.stdinBody = "   ";
  const refused = drive(empty, "file", "--title", "Empty stdin", "--kind", "work", "--body-file", "-");
  expect(refused.status).toBe(TOOL_ERROR_EXIT);
  expect(refused.stderr).toContain("body must not be empty");
  expect(empty.calls.some((args) => args[0] === "issue" && args[1] === "create")).toBe(false);
});

defineTest(
  "bare dod adopts the body's unminted block red-first — and refuses a green, npx-spelled, or absent one",
  () => {
    const state = createState("Running");
    targetIssue(state).body = `form-filed row\n\n${buildDodBlock("exit 1")}`;
    const result = drive(state, "dod", "11");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("DoD red at mint (exit 1)");
    expect(fieldValue(state, DOD_FIELD)).toBe(dodStamp("exit 1"));
    // Adoption stamps WITHOUT rewriting the body — the block is already the visible bar.
    expect(state.calls.some((args) => args[0] === "issue" && args[1] === "edit" && args.includes("--body"))).toBe(false);

    const green = createState("Running");
    targetIssue(green).body = buildDodBlock("exit 0");
    const refusedGreen = drive(green, "dod", "11");
    expect(refusedGreen.status).toBe(TOOL_ERROR_EXIT);
    expect(refusedGreen.stderr).toContain("already green at mint");
    expect(fieldValue(green, DOD_FIELD)).toBeUndefined();

    const npx = createState("Running");
    targetIssue(npx).body = buildDodBlock("npx vitest run t.test.ts");
    const refusedNpx = drive(npx, "dod", "11");
    expect(refusedNpx.status).toBe(TOOL_ERROR_EXIT);
    expect(refusedNpx.stderr).toContain("not adoptable");

    const bare = createState("Running");
    const refusedBare = drive(bare, "dod", "11");
    expect(refusedBare.status).toBe(TOOL_ERROR_EXIT);
    expect(refusedBare.stderr).toContain("no ```dod block to adopt");
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

defineTest(
  "land pre-flights the bar BEFORE any board write: red leaves a Ready row untouched; green executes EXACTLY once; direct done stays authoritative",
  () => {
    const directory = mkdtempSync(join(tmpdir(), "work-item-dod-preflight-"));
    try {
      // (a) Red + Ready: the same command+exit+output refusal, with ZERO board mutations — the row is
      // exactly as it was (no Lane, still Ready, still OPEN). The single graphql call is the context
      // READ that learns the row's bar; the amendment's zero is the WRITE count (argv-borne `file --dod`
      // can refuse at a true zero; a row-borne bar structurally cannot be known without one read).
      const red = createState("Ready");
      withDod(red, "exit 9");
      const refused = drive(red, "land", "11", "--lane", "x", "--evidence", "r");
      expect(refused.status).toBe(TOOL_ERROR_EXIT);
      expect(refused.stderr).toContain("DoD is red");
      expect(refused.stderr).toContain("exit: 9");
      expect(mutationCalls(red)).toHaveLength(0);
      expect(graphqlCalls(red)).toHaveLength(1);
      expect(red.calls.some((args) => args[0] === "issue")).toBe(false);
      expect(fieldValue(red, STATUS_FIELD)).toBe("Ready");
      expect(fieldValue(red, "Lane")).toBeUndefined();
      expect(targetIssue(red).state).toBe("OPEN");

      // (b) Green: the bar executes EXACTLY once across the whole claim→done walk — a witness-file
      // COUNTER, not an assumption (without the memo, done's gate would run it a second time).
      const witness = join(directory, "runs");
      const green = createState("Ready");
      withDod(green, `echo run >> ${witness}; exit 0`);
      expect(drive(green, "land", "11", "--lane", "x", "--evidence", "r").status).toBe(0);
      expect(targetIssue(green).state).toBe("CLOSED");
      expect(readFileSync(witness, "utf8").trim().split("\n")).toHaveLength(1);

      // (c) Direct `done` carries no memo — ITS gate runs the bar, exactly once.
      const directWitness = join(directory, "direct-runs");
      const direct = createState("Verify");
      withVerifyEvidence(direct, "r");
      withDod(direct, `echo run >> ${directWitness}; exit 0`);
      expect(drive(direct, "done", "11", "--evidence", "r").status).toBe(0);
      expect(targetIssue(direct).state).toBe("CLOSED");
      expect(readFileSync(directWitness, "utf8").trim().split("\n")).toHaveLength(1);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  },
  TABLE_DRIVEN_TIMEOUT_MS,
);

defineTest("a form-emitted `_No response_` dod fence reads as ABSENT: the close proceeds and adopt refuses", () => {
  // GitHub renders an empty optional textarea as `_No response_`; with `render: dod` that could land
  // INSIDE the fence. Treating it as a real bar would make every form-filed row with an empty DoD
  // field unclosable (unminted-block refusal) — so extraction reads it as no bar at all.
  const state = createState("Verify");
  withVerifyEvidence(state, "r");
  targetIssue(state).body = "### Definition of Done (optional command)\n\n```dod\n_No response_\n```";
  expect(drive(state, "land", "11", "--evidence", "r").status).toBe(0);
  expect(targetIssue(state).state).toBe("CLOSED");

  const adopt = createState("Running");
  targetIssue(adopt).body = "```dod\n_No response_\n```";
  const refused = drive(adopt, "dod", "11");
  expect(refused.status).toBe(TOOL_ERROR_EXIT);
  expect(refused.stderr).toContain("no ```dod block to adopt");
});
