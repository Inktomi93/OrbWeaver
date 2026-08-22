// The read/ingress verbs: show (one item, one request), list (the only enumeration, cursor-paginated),
// create (issue → labels → Project item → class metadata), and the help text that IS the operator
// cookbook `.claude/rules/orchestration.md` points at.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { print } from "../../_shared/artifacts.ts";
import type { CreateCommand, GraphqlVariables, ListRow, RawListPage } from "../contract/types.ts";
import { issueNumber } from "../lib/parse.ts";
import { LIST_QUERY } from "../lib/queries.ts";
import { ISSUE_CLASSES, ISSUE_URL_RE, PROJECT_NUMBER, REPOSITORY } from "../lib/vocab.ts";
import { fieldOf, itemFields } from "../lib/writes.ts";
import { gh, graphql } from "./gh.ts";
import { ensureItem, fetchIssueContext, setField, withProjectContext, writeFields } from "./project.ts";

export function show(issue: number): void {
  const context = fetchIssueContext(issue);
  if (context.item === undefined) {
    throw new Error(`#${issue} is not in Project ${PROJECT_NUMBER}`);
  }
  print(
    JSON.stringify(
      {
        id: context.item.id,
        content: { number: context.target.number, title: context.target.title, url: context.target.url },
        ...context.item.fields,
      },
      null,
      2,
    ),
  );
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

export function list(status?: string): void {
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
  print(JSON.stringify({ items }, null, 2));
}

/** The whole board on one screen, numbers guaranteed — the orchestrator's board-read ritual verb.
 *  Every status is shown (a queue the reader forgot exists is exactly the blindness this verb kills,
 *  2026-08-22); Done is count-only, every other status lists `#N [prio] title (lane|wake)`. */
export function overview(): void {
  const rows = withProjectContext((context) => listItems(context.projectId));
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
  // Working-queue statuses first, in lifecycle order; anything unexpected still prints (never hidden).
  const order = ["Triage", "Ready", "Running", "Review", "Verify", "Needs owner", "Blocked", "Parked", "Done"];
  const names = [...byStatus.keys()].toSorted((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
  });
  for (const status of names) {
    const bucket = byStatus.get(status) ?? [];
    print(`${status} (${bucket.length})`);
    if (status === "Done") {
      continue;
    }
    const sorted = bucket.toSorted((l, r) => (l.content?.number ?? Number.MAX_SAFE_INTEGER) - (r.content?.number ?? Number.MAX_SAFE_INTEGER));
    for (const row of sorted) {
      const n = row.content?.number === undefined ? "draft" : `#${row.content.number}`;
      const priority = fieldOf(row.fields, "Priority");
      const tail = status === "Parked" ? fieldOf(row.fields, "Wake condition") : fieldOf(row.fields, "Lane");
      const title = (row.content?.title ?? fieldOf(row.fields, "Title") ?? "").slice(0, 90);
      print(`  ${n}${priority === undefined ? "" : ` [${priority}]`} ${title}${tail === undefined ? "" : ` (${tail})`}`);
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

/** The issue is created FIRST and its URL printed IMMEDIATELY: if Project setup then fails, the operator
 *  holds a resumable receipt instead of an orphaned issue they cannot name. */
export function create(command: CreateCommand): void {
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
  print(`created #${number} ${output}`);
  const context = fetchIssueContext(number);
  const item = ensureItem(context.target, context.item);
  const changes = [{ name: "Kind", value: issueConfig.projectKind }];
  if (issueConfig.review !== undefined) {
    changes.push({ name: "Review", value: issueConfig.review });
  }
  writeFields(item, changes, "WorkItemFields");
  setField(item, "Status", issueConfig.status);
  const next = command.issueClass === "decision" ? "set Priority, Area, and resolve the owner decision before ready" : "set Priority, Area, Review, then ready";
  print(`work-item — #${context.target.number} Project metadata initialized; ${next}`);
}

export function help(): void {
  print(`work:item — Project 1 operator path
show <issue>
overview  (the whole board: every status, counts + numbered rows — the board-read ritual verb)
list [--status <status>]
create <work|bug|decision|program|evidence> --title <title> --body-file <file>
ready <issue> | claim <issue> --lane <lane> | review <issue> | needs-owner <issue> | set <issue> <field> <value>
block <issue> --by <blocker> | unblock <issue> --by <blocker> | park <issue> --wake <condition>
verify <issue> --evidence <receipt> | reverify <issue> --evidence <replacement-receipt> | done <issue> --evidence <same-receipt>

Lifecycle: Triage → Ready → Running → Review → Verify → Done. Set Kind, Priority, Area, and Review before Ready. Decisions enter Needs owner. Interrupted transitions are safe to rerun. Use .github/ISSUE_TEMPLATE/*.yml for canonical issue bodies; Project holds mutable lifecycle state.`);
}
