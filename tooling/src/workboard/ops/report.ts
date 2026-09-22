// The read/ingress verbs: show (one item, one request), list (the only enumeration, cursor-paginated),
// create (issue → labels → Project item → class metadata), and the help text that IS the operator
// cookbook.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { CreateCommand, FileCommand, GraphqlVariables, IssueClass, ListRow, RawListPage } from "../contract/types.ts";
import { appendDodBlock, dodStamp } from "../lib/dod.ts";
import { issueNumber } from "../lib/parse.ts";
import { LIST_QUERY } from "../lib/queries.ts";
import { DOD_FIELD, DOD_TIMEOUT_MS, EVIDENCE_MAX_LENGTH, ISSUE_CLASSES, ISSUE_URL_RE, PROJECT_NUMBER, REPOSITORY } from "../lib/vocab.ts";
import { encodeWrite, fieldOf, itemFields } from "../lib/writes.ts";
import { requireRedDodAtMint, withDodFieldHint } from "./dod.ts";
import { gh, graphql } from "./gh.ts";
import { runLifecycle } from "./lifecycle.ts";
import { ensureItem, fetchIssueContext, setField, withProjectContext, writeFields } from "./project.ts";

refuseDirectInvocation(import.meta.url, "pnpm work:item <command>");

function showRow(issue: number): Record<string, unknown> {
  const context = fetchIssueContext(issue);
  if (context.item === undefined) {
    throw new Error(`#${issue} is not in Project ${PROJECT_NUMBER}`);
  }
  return {
    id: context.item.id,
    content: { number: context.target.number, title: context.target.title, url: context.target.url },
    ...context.item.fields,
  };
}

/** BATCHED (#870): `show 1003 1004 1005` reads N rows in ONE tool call. A single id keeps the exact
 *  object it always printed — the batching is the saving, and a caller (or a test) parsing one row must
 *  not have to learn a new shape for it; N ids print the same rows inside `{ items: [...] }`. */
export function show(issues: readonly number[]): void {
  const rows = issues.map((issue) => showRow(issue));
  print(JSON.stringify(rows.length === 1 ? rows[0] : { items: rows }, null, 2));
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

// Working-queue statuses first, in lifecycle order; anything unexpected still prints (never hidden).
// Also the list --status vocabulary: an unknown value REFUSES instead of silent-zeroing (#586 — an
// empty result must mean the queue is empty, never that the filter matched nothing it recognizes).
const OVERVIEW_STATUS_ORDER = ["Triage", "Ready", "Running", "Review", "Verify", "Needs owner", "Blocked", "Parked", "Done"];

export function list(status?: string): void {
  const canonical = status === undefined ? undefined : OVERVIEW_STATUS_ORDER.find((value) => value.toLowerCase() === status.toLowerCase());
  if (status !== undefined && canonical === undefined) {
    throw new Error(`Status has no option named ${status} — valid: ${OVERVIEW_STATUS_ORDER.join(" | ")}`);
  }
  const rows = withProjectContext((context) => listItems(context.projectId));
  const items = rows
    .filter((row) => canonical === undefined || fieldOf(row.fields, "Status")?.toLowerCase() === canonical.toLowerCase())
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
  print(JSON.stringify({ items }, null, 2));
}

const OVERVIEW_TITLE_MAX = 90;

function overviewStatusRank(status: string): number {
  const index = OVERVIEW_STATUS_ORDER.indexOf(status);
  return index === -1 ? OVERVIEW_STATUS_ORDER.length : index;
}

function groupRowsByStatus(rows: readonly ListRow[]): Map<string, ListRow[]> {
  const byStatus = new Map<string, ListRow[]>();
  for (const row of rows) {
    const status = fieldOf(row.fields, "Status") ?? "(no status)";
    const bucket = byStatus.get(status);
    if (bucket === undefined) {
      byStatus.set(status, [row]);
    } else {
      bucket.push(row);
    }
  }
  return byStatus;
}

function overviewRowLine(row: ListRow, status: string): string {
  const issue = row.content?.number === undefined ? "draft" : `#${row.content.number}`;
  const priority = fieldOf(row.fields, "Priority");
  const tail = status === "Parked" ? fieldOf(row.fields, "Wake condition") : fieldOf(row.fields, "Lane");
  const title = (row.content?.title ?? fieldOf(row.fields, "Title") ?? "").slice(0, OVERVIEW_TITLE_MAX);
  return `  ${issue}${priority === undefined ? "" : ` [${priority}]`} ${title}${tail === undefined ? "" : ` (${tail})`}`;
}

/** The whole board on one screen, numbers guaranteed — the orchestrator's board-read ritual verb.
 *  Every status is shown (a queue the reader forgot exists is exactly the blindness this verb kills,
 *  2026-08-22) — INCLUDING empty canonical queues as explicit `(0)` lines (#586: an omitted queue is
 *  unverifiable absence); Done is count-only, every other status lists `#N [prio] title (lane|wake)`. */
export function overview(): void {
  const byStatus = groupRowsByStatus(withProjectContext((context) => listItems(context.projectId)));
  const names = [...new Set([...OVERVIEW_STATUS_ORDER, ...byStatus.keys()])].toSorted((a, b) => overviewStatusRank(a) - overviewStatusRank(b));
  for (const status of names) {
    const bucket = byStatus.get(status) ?? [];
    print(`${status} (${bucket.length})`);
    if (status === "Done") {
      continue;
    }
    const sorted = bucket.toSorted((l, r) => (l.content?.number ?? Number.MAX_SAFE_INTEGER) - (r.content?.number ?? Number.MAX_SAFE_INTEGER));
    for (const row of sorted) {
      print(overviewRowLine(row, status));
    }
  }
}

function createdIssueNumber(output: string): number {
  const number = ISSUE_URL_RE.exec(output)?.[1];
  if (number === undefined) {
    throw new Error("gh issue create did not return an issue URL");
  }
  return issueNumber(number);
}

/** `--body-file -` reads STDIN (#923 P3) — a multi-line body without the scratch-file-per-row ritual. */
function bodyContent(path: string): string {
  const content = path === "-" ? readFileSync(0, "utf8").trim() : readFileSync(resolveNonEmptyBodyFile(path), "utf8").trim();
  if (content === "") {
    throw new Error("body must not be empty");
  }
  return content;
}

/** With a DoD the block is APPENDED to the body at creation — the mint and the issue are one write, so
 *  there is never a filed row whose bar exists only in Project state. */
function issueBody(command: { readonly title: string; readonly bodyFile: string | null; readonly dod: string | null }): readonly string[] {
  if (command.dod === null && command.bodyFile !== null && command.bodyFile !== "-") {
    return ["--body-file", resolveNonEmptyBodyFile(command.bodyFile)];
  }
  const base = command.bodyFile === null ? command.title : bodyContent(command.bodyFile);
  return ["--body", command.dod === null ? base : appendDodBlock(base, command.dod)];
}

/** The ingress write shared by `create` and `file`: the issue is created FIRST and its URL printed
 *  IMMEDIATELY, so if Project setup then fails the operator holds a resumable receipt instead of an
 *  orphaned issue they cannot name. `bodyFile` null (the `file` one-liner) makes the TITLE the body. */
function createIssue(command: {
  readonly issueClass: IssueClass;
  readonly title: string;
  readonly bodyFile: string | null;
  readonly dod: string | null;
}): number {
  const issueConfig = ISSUE_CLASSES[command.issueClass];
  const body = issueBody(command);
  const output = gh(["issue", "create", "--repo", REPOSITORY, "--title", command.title, ...body, ...issueConfig.labels.flatMap((label) => ["--label", label])]);
  const number = createdIssueNumber(output);
  print(`created #${number} ${output}`);
  const context = fetchIssueContext(number);
  const item = ensureItem(context.target, context.item);
  const changes = [{ name: "Kind", value: issueConfig.projectKind }];
  if (issueConfig.review !== undefined) {
    changes.push({ name: "Review", value: issueConfig.review });
  }
  writeFields(item, changes, "WorkItemFields");
  setField(item, "Status", issueConfig.status);
  return context.target.number;
}

function resolveNonEmptyBodyFile(path: string): string {
  const bodyFile = resolve(path);
  if (readFileSync(bodyFile, "utf8").trim() === "") {
    throw new Error("body file must not be empty");
  }
  return bodyFile;
}

export function create(command: CreateCommand): void {
  const number = createIssue({ issueClass: command.issueClass, title: command.title, bodyFile: command.bodyFile, dod: null });
  const next = command.issueClass === "decision" ? "set Priority, Area, and resolve the owner decision before ready" : "set Priority, Area, Review, then ready";
  print(`work-item — #${number} Project metadata initialized; ${next}`);
}

/** `file` (#870): create → Kind/Priority/Area/Review → ready → claim, in ONE invocation instead of the
 *  six-to-seven the census measured. It COMPOSES create and the lifecycle verbs — the metadata is one
 *  batched field write, and `ready`/`claim` are the same guarded functions, so an incomplete row is
 *  refused by ready's own metadata guard rather than by a second copy of that rule living here. */
export function file(command: FileCommand): void {
  // RED-FIRST (#923): the DoD runs before ANY GitHub call — a green reproduction refuses the row at
  // zero board cost (no bug, or the wrong bar; both worth knowing before the row exists).
  if (command.dod !== null) {
    requireRedDodAtMint(command.dod);
  }
  const changes = [
    { name: "Priority", value: command.priority },
    { name: "Area", value: command.area },
    { name: "Review", value: command.review },
    { name: DOD_FIELD, value: command.dod === null ? null : dodStamp(command.dod) },
  ].flatMap((change) => (change.value === null ? [] : [{ name: change.name, value: change.value }]));
  // ATOMIC on a bad enum (the #1043 specimen: an invalid --review created the issue, then aborted the
  // batch — a half-fielded row). Encode the operator's metadata against the cached project context
  // BEFORE the issue exists; withProjectContext's stale-cache retry keeps a cold/stale cache honest,
  // and encodeWrite's refusal names the valid options.
  withDodFieldHint(() => withProjectContext((project) => changes.map((change) => encodeWrite(project.fields, change))));
  const number = createIssue(command);
  const context = fetchIssueContext(number);
  const item = ensureItem(context.target, context.item);
  writeFields(item, changes, "WorkItemFields");
  const nudge =
    command.issueClass === "bug" && command.dod === null ? " — no --dod; a bug row closes strongest with a red-first reproduction (--dod '<cmd>')" : "";
  if (!command.ready) {
    print(`work-item — #${number} filed; ready it when Kind, Priority, Area and Review are set${nudge}`);
    return;
  }
  runLifecycle({ kind: "ready", issues: [number] });
  if (command.lane !== null) {
    runLifecycle({ kind: "claim", issues: [number], lane: command.lane });
  }
  print(`work-item — #${number} filed and ${command.lane === null ? "Ready" : `claimed by ${command.lane}`}${nudge}`);
}

export function help(): void {
  print(`work:item — Project 1 operator path

ONE CALL PER ROW, NOT SIX. Every lifecycle verb takes a LIST of issues, and the two composite verbs
cover the whole opening and closing sequence. Reach for these first — a lone board call is the cost:
file --title <title> --kind <work|bug|decision|program|evidence> [--priority P] [--area A] [--review R]
     [--body-file <file|->] [--ready] [--claim <lane>] [--dod '<cmd>']
       create + the metadata writes + ready + claim in ONE call. With no --body-file the body IS the
       title (the one-line row); --body-file - reads the body from stdin. A decision enters Needs owner
       and refuses --ready/--claim.
land <issue…> --evidence <receipt> [--lane <lane>] [--comment-file <file>] [--force-close --reason <text>]
       claim-if-needed → review → verify → done in ONE call, per row, with ONE receipt. Resumes from
       wherever each row already is; --lane is required only for a row still Ready.

DEFINITION OF DONE (#923): --dod '<cmd>' runs the command at FILE time and refuses a row whose bar is
already green (red-first — the reproduction and the acceptance test are one command). done/land re-run
it and refuse a red close, printing what ran and its output. --force-close --reason '<text>' is the loud
recorded override (a comment lands on the issue). dod <issue…> --cmd '<cmd>' re-mints a bar (red-first
again; the body block and its stamp must match or the close refuses); bare dod <issue…> ADOPTS a block
already in the body (the issue-form ingress), red-first. refute … --dod '<cmd>' mints the failing
command as the returned row's bar. Each run is capped at ${DOD_TIMEOUT_MS}ms; spell commands with pnpm
scripts or pnpm exec, never npx (refused at mint).

show <issue…>   (batched — one call reads N rows)
overview  (the whole board: every status, counts + numbered rows — the board-read ritual verb)
list [--status <status>]
create <work|bug|decision|program|evidence> --title <title> --body-file <file>
ready <issue…> | claim <issue…> --lane <lane> | review <issue…> | needs-owner <issue…> | set <issue…> <field> <value> [<field> <value>…]
block <issue…> --by <blocker> | unblock <issue…> --by <blocker> | park <issue…> --wake <condition>
verify <issue…> --evidence <receipt> | reverify <issue…> --evidence <replacement-receipt> | done <issue…> --evidence <same-receipt> [--force-close --reason <text>]
refute <issue…> --evidence <refutation-receipt> [--dod '<cmd>'] — Verify only; returns the row to Ready with Evidence replaced (outcome stands, rework is claimable)
dod <issue…> [--cmd '<command>'] — mint or re-mint a row's Definition of Done (red-first; set DoD is refused); bare form adopts the body's block
--evidence over ${EVIDENCE_MAX_LENGTH} UTF-8 bytes auto-splits: the full receipt lands as an issue comment and the Evidence column gets a head + pointer (same transform on verify and done, so the same-receipt rule holds)

Lifecycle: Triage → Ready → Running → Review → Verify → Done. Set Kind, Priority, Area, and Review before Ready. Decisions enter Needs owner. Interrupted transitions are safe to rerun — including a composite verb, which resumes at the row's current status. Use .github/ISSUE_TEMPLATE/*.yml for canonical issue bodies; Project holds mutable lifecycle state.`);
}
