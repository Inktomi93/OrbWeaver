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
}

const fakeGh = String.raw`#!/usr/bin/env node
const { readFileSync, writeFileSync } = require("node:fs");
const statePath = process.env.WORK_ITEM_FAKE_GH_STATE;
const state = JSON.parse(readFileSync(statePath, "utf8"));
const args = process.argv.slice(2);
state.calls.push(args);
const save = () => writeFileSync(statePath, JSON.stringify(state));
const value = (prefix) => {
  const index = args.indexOf(prefix);
  return index === -1 ? args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) : args[index + 1];
};
const hasTypedField = (name) => args.some((arg, index) => args[index - 1] === "-F" && arg.startsWith(name + "="));
const issueNumber = () => Number(args.find((arg) => /^\d+$/.test(arg)));
const issue = () => state.issues[String(issueNumber())];
const text = (payload) => { save(); process.stdout.write(JSON.stringify(payload)); };
if (args[0] === "issue" && args[1] === "view") {
  const current = issue();
  text({ id: current.id, number: current.number, url: current.url, state: current.state, comments: current.comments.map((body) => ({ body })) });
} else if (args[0] === "project" && args[1] === "view") {
  if (state.failProject) throw new Error("Injected Project failure");
  text({ id: "project-1" });
} else if (args[0] === "project" && args[1] === "field-list") {
  text({ fields: state.fields });
} else if (args[0] === "project" && args[1] === "item-list") {
  text({ items: state.items });
} else if (args[0] === "issue" && args[1] === "create") {
  const number = ${CREATED_ISSUE};
  const url = "https://example.test/issues/" + number;
  state.issues[String(number)] = { id: "issue-" + number, number, url, state: "OPEN", blockers: [], comments: [] };
  save();
  process.stdout.write(url);
} else if (args[0] === "project" && args[1] === "item-add") {
  const url = value("--url");
  const target = Object.values(state.issues).find((candidate) => candidate.url === url);
  if (!target) throw new Error("Project item content was not found");
  let current = state.items.find((candidate) => candidate.content.number === target.number);
  if (!current) {
    current = { id: "item-" + target.number, content: { number: target.number, url: target.url } };
    state.items.push(current);
  }
  text(current);
} else if (args[0] === "project" && args[1] === "item-edit") {
  const current = state.items.find((candidate) => candidate.id === value("--id"));
  const field = state.fields.find((candidate) => candidate.id === value("--field-id"));
  if (args.includes("--clear")) {
    delete current[field.name];
    text({});
    return;
  }
  const option = field.options?.find((candidate) => candidate.id === value("--single-select-option-id"));
  const next = option?.name ?? value("--text");
  current[field.name] = next;
  text({});
} else if (args[0] === "issue" && args[1] === "comment") {
  issue().comments.push(value("--body"));
  text({});
} else if (args[0] === "issue" && args[1] === "close") {
  issue().state = "CLOSED";
  text({});
} else if (args[0] === "issue" && args[1] === "edit") {
  text({});
} else if (args[0] === "api") {
  const query = value("query=");
  if (query.includes("blockedBy")) {
    if (!hasTypedField("number")) throw new Error('Variable "$number" of type "Int!" used in position expecting type "Int".');
    const target = state.issues[value("number=")];
    text({ data: { repository: { issue: { blockedBy: { nodes: target.blockers.map((number) => ({ number })) } } } } });
    return;
  }
  const target = state.issues[value("issueId=").replace("issue-", "")];
  const blocker = Number(value("blockingIssueId=").replace("issue-", ""));
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

defineTest("claim requires a lane and produces the mutation intent", () => {
  expect(parseWorkCommand(["claim", "11", "--lane", "docs-catalog"])).toEqual({ kind: "claim", issue: 11, lane: "docs-catalog" });
  expect(() => parseWorkCommand(["claim", "11"])).toThrow("--lane requires a value");
  expect(() => parseWorkCommand(["claim", "11", "--lane", "docs-catalog", "extra"])).toThrow("--lane accepts exactly one value");
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
  expect(result.stdout).toContain("Triage → Ready → Running → Review → Verify → Done");
  expect(result.stdout).toContain(".github/ISSUE_TEMPLATE/*.yml");
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
        expect(state.calls.filter((args) => args[0] === "project" && args[1] === "item-add")).toHaveLength(1);
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

defineTest("set compares flattened field names case-insensitively", () => {
  const state = createState("Running");
  expect(drive(state, "set", "11", "priority", "High").status).toBe(0);
  expect(state.calls.some((args) => args[0] === "project" && args[1] === "item-edit")).toBe(false);
});

defineTest("ready accepts live ingress and resume statuses but not review", () => {
  for (const status of ["Triage", "Needs owner", "Parked"]) {
    const state = createState(status);
    expect(drive(state, "ready", "11").status).toBe(0);
  }
  const review = drive(createState("Review"), "ready", "11");
  expect(review.status).toBe(TOOL_ERROR_EXIT);
  expect(review.stderr).toContain("must be Triage, Needs owner, Blocked, or Parked before Ready");
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
  expect(terminal.calls.some((args) => args[0] === "project" && args[1] === "item-edit")).toBe(false);
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
  expect(rawIssue.calls.filter((args) => args[0] === "project" && args[1] === "item-add")).toHaveLength(1);
  expect(rawIssue.calls.filter((args) => args.includes("--single-select-option-id") && args.includes("triage"))).toHaveLength(1);
  expect(drive(rawIssue, "ready", "11").status).toBe(TOOL_ERROR_EXIT);
  expect(rawIssue.calls.filter((args) => args[0] === "project" && args[1] === "item-add")).toHaveLength(1);

  const statusless = createState("Triage");
  delete statusless.items[0]?.[STATUS_FIELD];
  expect(drive(statusless, "ready", "11").status).toBe(0);
  expect(statusless.items).toHaveLength(1);
  expect(fieldValue(statusless, STATUS_FIELD)).toBe("Ready");
  expect(fieldValue(statusless, DISPOSITION_FIELD)).toBe("Action");
  expect(statusless.calls.filter((args) => args[0] === "project" && args[1] === "item-add")).toHaveLength(0);
  expect(statusless.calls.filter((args) => args.includes("--single-select-option-id") && args.includes("triage"))).toHaveLength(1);
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

defineTest("closed work items refuse lifecycle mutations", () => {
  const state = createState("Triage");
  targetIssue(state).state = "CLOSED";
  const result = drive(state, "review", "11");
  expect(result.status).toBe(TOOL_ERROR_EXIT);
  expect(result.stderr).toContain("cannot change a closed work item");
  expect(state.calls.some((args) => args[0] === "project")).toBe(false);
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
