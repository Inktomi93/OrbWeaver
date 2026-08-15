import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { parseWorkCommand } from "../../scripts/github/work-item.ts";
import { expect, test } from "../support/fixtures.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const ORIGINAL_PATH = execFileSync("printenv", ["PATH"], { encoding: "utf8" }).trim();
const TOOL_ERROR_EXIT = 2;
const MISUSE_EXIT = 3;
const EXECUTABLE_MODE = 0o755;
const TABLE_DRIVEN_TIMEOUT_MS = 15_000;
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
      blockedBy: { nodes: target.blockers.map((number) => ({ number })) },
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
        const option = (field.options ?? []).find((candidate) => candidate.id === raw);
        if (!option) fail("The single select option does not belong to field '" + field.name + "'");
        item[field.name] = option.name;
      } else {
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
  state.issues[String(number)] = { id: "issue-" + number, number, url, state: "OPEN", blockers: [], comments: [] };
  save();
  process.stdout.write(url);
} else if (args[0] === "issue" && args[1] === "comment") {
  issue().comments.push(value("--body"));
  text({});
} else if (args[0] === "issue" && args[1] === "close") {
  issue().state = "CLOSED";
  text({});
} else if (args[0] === "issue" && args[1] === "edit") {
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
    const result = spawnSync(
      "env",
      [
        `PATH=${directory}:${ORIGINAL_PATH}`,
        `WORK_ITEM_FAKE_GH_STATE=${statePath}`,
        `WORK_ITEM_CACHE_DIR=${state.cacheDir ?? join(directory, "cache")}`,
        process.execPath,
        "node_modules/tsx/dist/cli.mjs",
        "scripts/github/work-item.ts",
        ...args,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
      },
    );
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
  expect(parseWorkCommand(["claim", "11", "--lane", "docs-catalog"])).toEqual({ kind: "claim", issue: 11, lane: "docs-catalog" });
  expect(() => parseWorkCommand(["claim", "11"])).toThrow("--lane requires a value");
  expect(() => parseWorkCommand(["claim", "11", "--lane", "docs-catalog", "extra"])).toThrow("--lane accepts exactly one value");
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

defineTest("interrupted and uncertain lifecycle transitions converge when retried", () => {
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
});

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
