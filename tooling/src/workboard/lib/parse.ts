// The argv → WorkCommand parser — PURE, and the ONLY place a command shape is invented. Every refusal
// is a UsageError so the cli maps it to exit 3 (misuse): a bad operator invocation is not a tool failure
// and must never read as one.
import { UsageError } from "../../_shared/run-tool.ts";
import type { CreateCommand, IssueClass, ListCommand, WorkCommand } from "../contract/types.ts";
import { CREATE_OPTION_COUNT, EVIDENCE_MAX_LENGTH, ISSUE_CLASSES, ISSUE_RE, LIFECYCLE_FIELDS } from "./vocab.ts";

export function issueNumber(raw: string | undefined): number {
  const number = Number(raw);
  if (raw === undefined || !ISSUE_RE.test(raw) || !Number.isSafeInteger(number) || number <= 0) {
    throw new UsageError("issue must be a positive numeric issue number");
  }
  return number;
}

function option(args: readonly string[], name: string): string {
  const [flag, value, ...extra] = args;
  if (flag !== name || value === undefined || value.startsWith("--") || value.trim() === "") {
    throw new UsageError(`${name} requires a value`);
  }
  if (extra.length > 0) {
    throw new UsageError(`${name} accepts exactly one value`);
  }
  return value;
}

/** `--evidence` is written to GitHub's Evidence text column, which server-side rejects anything past
 *  EVIDENCE_MAX_LENGTH chars — refuse it HERE (misuse, exit 3) so the message names the limit and the
 *  actual length, instead of letting it reach the network and come back as a generic tool error (exit
 *  2) indistinguishable from a lifecycle-state refusal. */
function evidenceOption(args: readonly string[]): string {
  const value = option(args, "--evidence");
  if (value.length > EVIDENCE_MAX_LENGTH) {
    throw new UsageError(
      `evidence is ${value.length} chars; cap is ${EVIDENCE_MAX_LENGTH} (GitHub's Project text-column limit) — post the full receipt as an issue comment and pass a short evidence string`,
    );
  }
  return value;
}

function parseSet(issue: number, args: readonly string[]): WorkCommand {
  const [fieldName, value, ...extra] = args;
  if (fieldName === undefined || value === undefined || extra.length > 0) {
    throw new UsageError("set requires exactly one field name and value");
  }
  if (LIFECYCLE_FIELDS.has(fieldName.toLowerCase())) {
    throw new UsageError(`set cannot modify lifecycle-controlled field ${fieldName}`);
  }
  return { kind: "set", issue, field: fieldName, value };
}

function issueClass(value: string | undefined): IssueClass {
  if (value !== undefined && value in ISSUE_CLASSES) {
    return value as IssueClass;
  }
  throw new UsageError("create kind must be work, bug, decision, program, or evidence");
}

function createOption(args: readonly string[], flag: string): string {
  const index = args.indexOf(flag);
  const value = args[index + 1];
  if (index === -1 || value === undefined || value.startsWith("--") || value.trim() === "") {
    throw new UsageError(`${flag} requires a value`);
  }
  return value;
}

function createOptions(args: readonly string[]): Pick<CreateCommand, "title" | "bodyFile"> {
  if (
    args.length !== CREATE_OPTION_COUNT ||
    args.filter((value) => value === "--title").length !== 1 ||
    args.filter((value) => value === "--body-file").length !== 1
  ) {
    throw new UsageError("create requires --title and --body-file");
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
      throw new UsageError(`${name} does not accept additional arguments`);
    }
    return { kind: name, issue };
  }
  if (name === "claim") {
    return { kind: name, issue, lane: option(rest, "--lane") };
  }
  if (name === "set") {
    return parseSet(issue, rest);
  }
  if (name === "verify" || name === "reverify" || name === "done" || name === "refute") {
    return { kind: name, issue, evidence: evidenceOption(rest) };
  }
  if (name === "park") {
    return { kind: name, issue, wake: option(rest, "--wake") };
  }
  if (name === "block" || name === "unblock") {
    return { kind: name, issue, blocker: issueNumber(option(rest, "--by")) };
  }
  throw new UsageError("command must be help, show, create, claim, ready, review, needs-owner, set, verify, reverify, done, refute, park, block, or unblock");
}

export function parseWorkCommand(argv: readonly string[]): WorkCommand {
  const [name, rawIssue, ...rest] = argv;
  if (name === "help" || name === "--help") {
    if (rawIssue !== undefined) {
      throw new UsageError(`${name} does not accept additional arguments`);
    }
    return { kind: "help" };
  }
  if (name === "create") {
    return { kind: name, issueClass: issueClass(rawIssue), ...createOptions(rest) };
  }
  if (name === "list") {
    return parseList(rawIssue === undefined ? rest : [rawIssue, ...rest]);
  }
  if (name === "overview") {
    if (rawIssue !== undefined || rest.length > 0) {
      throw new UsageError("overview does not accept arguments");
    }
    return { kind: "overview" };
  }
  return parseLifecycle(name, issueNumber(rawIssue), rest);
}
