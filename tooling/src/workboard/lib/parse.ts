// The argv → WorkCommand parser — PURE, and the ONLY place a command shape is invented. Every refusal
// is a UsageError so the cli maps it to exit 3 (misuse): a bad operator invocation is not a tool failure
// and must never read as one.
//
// #870 — THE CALL COUNT IS THE COST. A transcript census over two accounts measured 2,700 board calls
// re-billing 1.03B cache-read tokens (7.3% of the orchestrator's tool-turn context), at a MEDIAN of 3
// separate calls to walk ONE row through its lifecycle. Two composite verbs (`file`, `land`) and a
// LEADING RUN of issue ids on every lifecycle verb collapse that sequence without inventing a second
// lifecycle: both composites call the SAME guarded verbs, in the same order, and a list of ids is a
// fan-out over the same per-issue path.
import { UsageError } from "../../_shared/run-tool.ts";
import type { CreateCommand, FileCommand, IssueClass, ListCommand, WorkCommand } from "../contract/types.ts";
import { CREATE_OPTION_COUNT, EVIDENCE_MAX_LENGTH, ISSUE_CLASSES, ISSUE_RE, LIFECYCLE_FIELDS } from "./vocab.ts";

export function issueNumber(raw: string | undefined): number {
  const number = Number(raw);
  if (raw === undefined || !ISSUE_RE.test(raw) || !Number.isSafeInteger(number) || number <= 0) {
    throw new UsageError("issue must be a positive numeric issue number");
  }
  return number;
}

/** The STRICT single-option form: the verb's whole tail must be exactly `<flag> <value>`. Kept for the
 *  verbs that take one option, so `claim 11 --lane a b` still refuses instead of silently ignoring `b`. */
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

/** The POSITIONAL-INDEPENDENT reader the multi-option verbs (create/file/land) use. Absent = null; present
 *  but valueless is still a refusal, never a silently dropped flag. */
function flagValue(args: readonly string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--") || value.trim() === "") {
    throw new UsageError(`${flag} requires a value`);
  }
  return value;
}

function requiredFlagValue(args: readonly string[], flag: string): string {
  const value = flagValue(args, flag);
  if (value === null) {
    throw new UsageError(`${flag} requires a value`);
  }
  return value;
}

/** `--evidence` is written to GitHub's Evidence text column, which server-side rejects anything past
 *  EVIDENCE_MAX_LENGTH chars — refuse it HERE (misuse, exit 3) so the message names the limit and the
 *  actual length, instead of letting it reach the network and come back as a generic tool error (exit
 *  2) indistinguishable from a lifecycle-state refusal. */
function capEvidence(value: string): string {
  if (value.length > EVIDENCE_MAX_LENGTH) {
    throw new UsageError(
      `evidence is ${value.length} chars; cap is ${EVIDENCE_MAX_LENGTH} (GitHub's Project text-column limit) — post the full receipt as an issue comment and pass a short evidence string`,
    );
  }
  return value;
}

function parseSet(issues: readonly number[], args: readonly string[]): WorkCommand {
  const [fieldName, value, ...extra] = args;
  if (fieldName === undefined || value === undefined || extra.length > 0) {
    throw new UsageError("set requires exactly one field name and value");
  }
  if (LIFECYCLE_FIELDS.has(fieldName.toLowerCase())) {
    throw new UsageError(`set cannot modify lifecycle-controlled field ${fieldName}`);
  }
  return { kind: "set", issues, field: fieldName, value };
}

function issueClass(value: string | undefined): IssueClass {
  if (value !== undefined && value in ISSUE_CLASSES) {
    return value as IssueClass;
  }
  throw new UsageError("create kind must be work, bug, decision, program, or evidence");
}

function createOptions(args: readonly string[]): Pick<CreateCommand, "title" | "bodyFile"> {
  if (
    args.length !== CREATE_OPTION_COUNT ||
    args.filter((value) => value === "--title").length !== 1 ||
    args.filter((value) => value === "--body-file").length !== 1
  ) {
    throw new UsageError("create requires --title and --body-file");
  }
  return { title: requiredFlagValue(args, "--title").trim(), bodyFile: requiredFlagValue(args, "--body-file") };
}

/** `file "<title>" --kind <class> [--priority P] [--area A] [--review R] [--body-file f] [--ready]
 *  [--claim <lane>]` — create + the metadata writes + ready + claim in ONE invocation (6-7 calls today).
 *  `--body-file` is optional: with none, the body IS the title, which is the one-line row this verb
 *  exists for. A `decision` refuses --ready/--claim rather than walking past the owner gate the class
 *  itself declares (its create status is Needs owner). */
function parseFile(args: readonly string[]): FileCommand {
  const title = requiredFlagValue(args, "--title").trim();
  const command: FileCommand = {
    kind: "file",
    issueClass: issueClass(requiredFlagValue(args, "--kind")),
    title,
    bodyFile: flagValue(args, "--body-file"),
    priority: flagValue(args, "--priority"),
    area: flagValue(args, "--area"),
    review: flagValue(args, "--review"),
    ready: args.includes("--ready") || args.includes("--claim"),
    lane: flagValue(args, "--claim"),
  };
  if (command.issueClass === "decision" && command.ready) {
    throw new UsageError("a decision enters Needs owner — resolve the owner decision, then ready it separately");
  }
  return command;
}

/** `land <n…> --evidence <receipt> [--lane <x>] [--comment-file <f>]`. `--lane` is optional because a row
 *  already Running needs no claim; the claim guard is what refuses a Ready row that arrives without one. */
function parseLand(issues: readonly number[], rest: readonly string[]): WorkCommand {
  return {
    kind: "land",
    issues,
    lane: flagValue(rest, "--lane"),
    evidence: capEvidence(requiredFlagValue(rest, "--evidence")),
    commentFile: flagValue(rest, "--comment-file"),
  };
}

function parseList(args: readonly string[]): ListCommand {
  if (args.length === 0) {
    return { kind: "list" };
  }
  return { kind: "list", status: option(args, "--status") };
}

function parseLifecycle(name: string | undefined, issues: readonly number[], rest: readonly string[]): WorkCommand {
  if (name === "show" || name === "ready" || name === "review" || name === "needs-owner") {
    if (rest.length > 0) {
      throw new UsageError(`${name} does not accept additional arguments`);
    }
    return { kind: name, issues };
  }
  if (name === "claim") {
    return { kind: name, issues, lane: option(rest, "--lane") };
  }
  if (name === "set") {
    return parseSet(issues, rest);
  }
  if (name === "verify" || name === "reverify" || name === "done" || name === "refute") {
    return { kind: name, issues, evidence: capEvidence(option(rest, "--evidence")) };
  }
  if (name === "land") {
    return parseLand(issues, rest);
  }
  if (name === "park") {
    return { kind: name, issues, wake: option(rest, "--wake") };
  }
  if (name === "block" || name === "unblock") {
    return { kind: name, issues, blocker: issueNumber(option(rest, "--by")) };
  }
  throw new UsageError(
    "command must be help, show, create, file, claim, ready, review, needs-owner, set, verify, reverify, done, refute, land, park, block, or unblock",
  );
}

/** Every lifecycle verb takes a LEADING RUN of issue numbers. The run stops at the first non-numeric
 *  token, so `set 11 12 Priority High` is two rows while `set 11 Priority High` is one — a field name is
 *  never mistaken for an id — and a verb given no id at all still produces the SAME refusal it always did. */
function leadingIssues(argv: readonly string[]): { readonly issues: readonly number[]; readonly rest: readonly string[] } {
  let index = 0;
  while (index < argv.length && ISSUE_RE.test(argv[index] as string)) {
    index += 1;
  }
  if (index === 0) {
    return { issues: [issueNumber(argv[0])], rest: argv.slice(1) };
  }
  return { issues: argv.slice(0, index).map((raw) => issueNumber(raw)), rest: argv.slice(index) };
}

export function parseWorkCommand(argv: readonly string[]): WorkCommand {
  const [name, ...tail] = argv;
  if (name === "help" || name === "--help") {
    if (tail.length > 0) {
      throw new UsageError(`${name} does not accept additional arguments`);
    }
    return { kind: "help" };
  }
  if (name === "create") {
    return { kind: name, issueClass: issueClass(tail[0]), ...createOptions(tail.slice(1)) };
  }
  if (name === "file") {
    return parseFile(tail);
  }
  if (name === "list") {
    return parseList(tail);
  }
  if (name === "overview") {
    if (tail.length > 0) {
      throw new UsageError("overview does not accept arguments");
    }
    return { kind: "overview" };
  }
  const { issues, rest } = leadingIssues(tail);
  return parseLifecycle(name, issues, rest);
}
