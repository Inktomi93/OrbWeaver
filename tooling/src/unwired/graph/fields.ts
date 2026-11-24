// `pnpm unwired fields`: the graph's member rows (./judge.ts) as the dead-data report. A member production writes and
// never reads, reads and never writes (an optional member always at its default), or never names at all, with the
// rows a ruling, an acknowledgement or an outside receiver sorts out of the judged list. The rows are the member scan's
// own, so a fields row and a graph row of one key always agree.
//
// - The kind is a member bucket's name in the fields scan's words; a sent-only member is never read, and its sends name
//   where its value went.
// - A lost read (state.ts lostCauses) credits no row by its name. A product read off an `any` receiver that spells a
//   reported row's member, where the row has no read, is listed in `unresolved` for judgement. A write through `any`
//   is recorded nowhere, so a never-written row lists no candidate writer.
import type { SendDestination } from "../boundaries.ts";
import { isProduction } from "../worlds.ts";
import type { MemberBucket } from "./analyse.ts";
import { isMember } from "./analyse.ts";
import type { JudgedMembers, MemberRow } from "./judge.ts";
import type { GraphFacts, LostSlot } from "./state.ts";
import { productReader } from "./state.ts";

const ANY_RECEIVER: LostSlot = "any-receiver";

const FIELD_KINDS = ["never-read", "never-written", "unreferenced"] as const;
/** `never-read`: production writes or sends it and never reads it. `never-written`: an optional member production reads
 *  and never writes, so every branch on it sees the default. `unreferenced`: production neither reads nor writes it. */
type FieldKind = (typeof FIELD_KINDS)[number];

const KIND_OF: Readonly<Record<MemberBucket, FieldKind>> = {
  "member-write-only": "never-read",
  "member-sent-only": "never-read",
  "member-untouched": "unreferenced",
  "member-read-only": "never-written",
  "member-validated": "unreferenced",
};

// The kinds of a row with no product read: a lost read of its name could be the read it lacks.
const READLESS: ReadonlySet<FieldKind> = new Set<FieldKind>(["never-read", "unreferenced"]);

type FieldRow = MemberRow & { readonly kind: FieldKind };

export interface FieldsReport {
  /** The members the product declares: interface, type and class members, and zod schema keys. */
  readonly scanned: number;
  readonly unwired: readonly FieldRow[];
  readonly deliberate: readonly (FieldRow & { readonly reason: string })[];
  /** Rows a board item owns, with the item. */
  readonly judged: readonly (FieldRow & Pick<JudgedMembers["judged"][number], "item" | "tie">)[];
  /** Judged entries whose row no longer reports or whose item is no longer open. */
  readonly staleJudged: JudgedMembers["staleJudged"];
  /** Schema keys production neither writes nor reads: only a parse of input from outside the tree fills them. */
  readonly validated: readonly FieldRow[];
  /** Never-read members of a tRPC mutation's one-member output: the acknowledgement is the procedure's whole answer. */
  readonly acknowledged: readonly FieldRow[];
  /** Never-read members sent only to an observability sink, `sent` naming each: the operator reads them, no code does. */
  readonly observed: readonly FieldRow[];
  readonly received: JudgedMembers["received"];
  /** Product reads off an `any` receiver that spell a reported row's member where the row has no read,
   *  `file:line name slot -> Home.member`. */
  readonly unresolved: readonly string[];
  /** How many reported rows each send destination covers. */
  readonly sentBy: Readonly<Partial<Record<SendDestination, number>>>;
  /** The literal search over every dead row, or null for a root with no git index. */
  readonly literalStage: JudgedMembers["literalStage"];
  readonly limits: readonly string[];
}

/** What the fields query cannot see or does not fill, printed with every run. */
const FIELD_LIMITS: readonly string[] = [
  "Every row is a graph member row (tooling/src/unwired/graph/judge.ts), so the graph's own limits hold: docs/plans/unwired-code/design.md 'Limits of the fields scan' and the open classes under 'Member rows on the graph against the fields scan'.",
  "A computed key built from runtime strings or a runtime symbol types as string or symbol, so it reads or writes no named member.",
  "A type-position read (Registry[K] in a type) is no data read unless K can be the entry's key.",
  "A read inside a string (a JSON scenario file, a SQL fragment, a plugin template) is invisible; the literal stage lists such a spelling and moves a dead row to ask.",
  "A send's receiver outside the tree (an HTTP or wire reader, a file reader) is not followed: those rows sort as ask with the destination named. A provider send is received only where a doc names the member (field-sort.ts providerCite).",
  "A row sent only to an observability sink (a log line the checker resolves to the console or a logging library, a callee or receiver declared in the observability home, the dev bridge) is observed, not judged. A value that reaches such a sink only through a return or a generic helper's body is unclassified and stays reported.",
  "A plugin contract member the SDK publishes is received, never judged; the SDK surface is matched by home and member name or by slot path (tooling/src/unwired/plugin-surface.ts).",
  "unresolved lists only product reads off an any receiver (state.ts LOST_SLOTS 'any-receiver'), by name. A lost read in another slot is not listed, and the graph records no lost write, so a never-written row lists no candidate writer. No count of unplaced keys by reason is kept.",
  "No second engine audits a row: the query has no --cross-check and no disagreements list.",
  "The literal stage matches a dead row's searched word as a whole word in every tracked file and cannot tell two members of one name apart; gitignored and generated-but-untracked files are not searched.",
];

const kinded = <Row extends MemberRow>(row: Row): Row & { readonly kind: FieldKind } => ({ ...row, kind: KIND_OF[row.bucket] });

function sentCounts(rows: readonly MemberRow[]): FieldsReport["sentBy"] {
  const counts: Partial<Record<SendDestination, number>> = {};
  for (const row of rows) {
    for (const destination of new Set(row.sent.map((sent) => sent.split(" ")[0] as SendDestination))) {
      counts[destination] = (counts[destination] ?? 0) + 1;
    }
  }
  return counts;
}

// The product's reads off an `any` receiver that could be a reported row's missing read: such a read has no holder, so
// its name is all that ties it to a row. The name only picks what a person reads next; it credits nothing.
function deciding(facts: GraphFacts, rows: readonly FieldRow[]): readonly string[] {
  const byName = Map.groupBy(
    rows.filter(({ kind }) => READLESS.has(kind)),
    ({ member }) => member,
  );
  return facts.lostCauses.flatMap(({ read, where, slot }) => {
    const name = read.slice(read.lastIndexOf(" .") + 2);
    const file = where.slice(0, where.lastIndexOf(":"));
    const decided = slot === ANY_RECEIVER && productReader(file) ? (byName.get(name) ?? []) : [];
    return decided.length === 0 ? [] : [`${where} ${name} ${slot} -> ${decided.map((row) => `${row.home}.${row.member}`).join(",")}`];
  });
}

/** The fields report of a graph session's judged member rows. */
export function fieldsOf(facts: GraphFacts, members: JudgedMembers): FieldsReport {
  const unwired = members.unwired.map(kinded);
  const deliberate = members.deliberate.map(kinded);
  const judged = members.judged.map(kinded);
  const validated = members.validated.map(kinded);
  const acknowledged = members.acknowledged.map(kinded);
  const observed = members.observed.map(kinded);
  const reported = [...unwired, ...deliberate, ...judged, ...validated, ...acknowledged, ...observed];
  return {
    scanned: [...facts.decls.values()].filter((info) => isProduction(info.file) && isMember(info)).length,
    unwired,
    deliberate,
    judged,
    staleJudged: members.staleJudged,
    validated,
    acknowledged,
    observed,
    received: members.received,
    unresolved: deciding(facts, reported),
    sentBy: sentCounts(reported),
    literalStage: members.literalStage,
    limits: FIELD_LIMITS,
  };
}
