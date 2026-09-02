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
import { validateDodCommand } from "./dod.ts";
import { capEvidenceHard } from "./evidence.ts";
import { CREATE_OPTION_COUNT, ISSUE_CLASSES, ISSUE_RE, LIFECYCLE_FIELDS } from "./vocab.ts";

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

/** The multi-option verbs used to IGNORE a flag they did not read — a typo'd `--prioirty` filed a row
 *  missing its Priority and a typo'd `--dod` would mint no bar at all, both silently. Flag values never
 *  begin with `--` (flagValue refuses them), so every `--token` is a flag position and checkable. */
function refuseUnknownFlags(args: readonly string[], allowed: readonly string[], verb: string): void {
  const unknown = args.find((token) => token.startsWith("--") && !allowed.includes(token));
  if (unknown !== undefined) {
    throw new UsageError(`${verb} does not recognize ${unknown} — flags: ${allowed.join(" ")}`);
  }
}

/** `--force-close --reason "<text>"` — the LOUD override (#923): never a silent skip, never absent.
 *  Returns the tail with the override tokens stripped so the verb's own strict parse still applies. */
function splitOverride(rest: readonly string[]): { readonly rest: readonly string[]; readonly override: string | null } {
  if (!rest.includes("--force-close")) {
    if (rest.includes("--reason")) {
      throw new UsageError("--reason requires --force-close");
    }
    return { rest, override: null };
  }
  const override = requiredFlagValue(rest, "--reason");
  const forceIndex = rest.indexOf("--force-close");
  const reasonIndex = rest.indexOf("--reason");
  return { rest: rest.filter((_, index) => index !== forceIndex && index !== reasonIndex && index !== reasonIndex + 1), override };
}

/** PAIRS, not one field (#923 P1): `set 11 Priority High Area Client` is one batched write. Every name
 *  is guarded before anything is accepted, so a lifecycle field anywhere in the list refuses whole. */
function parseSet(issues: readonly number[], args: readonly string[]): WorkCommand {
  if (args.length === 0 || args.length % 2 !== 0) {
    throw new UsageError("set requires field name and value pairs");
  }
  const assignments: { readonly name: string; readonly value: string }[] = [];
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index] as string;
    if (LIFECYCLE_FIELDS.has(name.toLowerCase())) {
      throw new UsageError(`set cannot modify lifecycle-controlled field ${name}`);
    }
    assignments.push({ name, value: args[index + 1] as string });
  }
  return { kind: "set", issues, assignments };
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

/** The `file` verb — create + the metadata writes + ready + claim in ONE invocation (6-7 calls today);
 *  usage: `file "<title>" --kind <class> [--priority P] [--area A] [--review R] [--body-file f] [--ready] [--claim <lane>]`.
 *  `--body-file` is optional: with none, the body IS the title, which is the one-line row this verb
 *  exists for. A `decision` refuses --ready/--claim rather than walking past the owner gate the class
 *  itself declares (its create status is Needs owner). */
function parseFile(args: readonly string[]): FileCommand {
  refuseUnknownFlags(args, ["--title", "--kind", "--priority", "--area", "--review", "--body-file", "--ready", "--claim", "--dod"], "file");
  const title = requiredFlagValue(args, "--title").trim();
  const dod = flagValue(args, "--dod");
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
    dod: dod === null ? null : validateDodCommand(dod),
  };
  if (command.issueClass === "decision" && command.ready) {
    throw new UsageError("a decision enters Needs owner — resolve the owner decision, then ready it separately");
  }
  // The DoD fit table (#923): a decision closes on an owner ruling and a program on its child rows —
  // neither is machine-checkable, so a bar on one is a category error, refused at parse.
  if (command.dod !== null && (command.issueClass === "decision" || command.issueClass === "program")) {
    throw new UsageError(
      command.issueClass === "decision"
        ? "a decision closes on an owner ruling — a DoD does not apply"
        : "a program closes on its child rows — a DoD does not apply",
    );
  }
  return command;
}

/** `land <n…> --evidence <receipt> [--lane <x>] [--comment-file <f>] [--force-close --reason <text>]`.
 *  `--lane` is optional because a row already Running needs no claim; the claim guard is what refuses a
 *  Ready row that arrives without one. */
function parseLand(issues: readonly number[], rest: readonly string[]): WorkCommand {
  refuseUnknownFlags(rest, ["--lane", "--evidence", "--comment-file", "--force-close", "--reason"], "land");
  const { rest: tail, override } = splitOverride(rest);
  return {
    kind: "land",
    issues,
    lane: flagValue(tail, "--lane"),
    evidence: capEvidenceHard(requiredFlagValue(tail, "--evidence")),
    commentFile: flagValue(tail, "--comment-file"),
    override,
  };
}

/** The receipt-carrying verbs. `done` takes the loud override; `refute` can mint the failing command as
 *  the row's DoD in the same call (#923); `dod` re-mints a bar red-first. verify/reverify keep the strict
 *  single-option tail they always had. */
function parseReceiptVerb(name: "verify" | "reverify" | "done" | "refute" | "dod", issues: readonly number[], rest: readonly string[]): WorkCommand {
  if (name === "verify" || name === "reverify") {
    return { kind: name, issues, evidence: capEvidenceHard(option(rest, "--evidence")) };
  }
  if (name === "done") {
    refuseUnknownFlags(rest, ["--evidence", "--force-close", "--reason"], "done");
    const { rest: tail, override } = splitOverride(rest);
    return { kind: name, issues, evidence: capEvidenceHard(option(tail, "--evidence")), override };
  }
  if (name === "refute") {
    refuseUnknownFlags(rest, ["--evidence", "--dod"], "refute");
    const dod = flagValue(rest, "--dod");
    return { kind: name, issues, evidence: capEvidenceHard(requiredFlagValue(rest, "--evidence")), dod: dod === null ? null : validateDodCommand(dod) };
  }
  // Bare `dod <n…>` = ADOPT the body's existing block (#923 P5, the issue-form ingress) — the command
  // is only known after the per-row context fetch, so the red-first run happens there, before any write.
  if (rest.length === 0) {
    return { kind: name, issues, command: null };
  }
  return { kind: name, issues, command: validateDodCommand(option(rest, "--cmd")) };
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
  if (name === "verify" || name === "reverify" || name === "done" || name === "refute" || name === "dod") {
    return parseReceiptVerb(name, issues, rest);
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
    "command must be help, show, create, file, claim, ready, review, needs-owner, set, verify, reverify, done, refute, dod, land, park, block, or unblock",
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
