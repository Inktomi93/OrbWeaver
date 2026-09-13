// BOARD-CITATION RECONCILIATION (#2156) — the judgment for every place the TREE names a BOARD ROW. Three
// classes, one board read, one verdict. The network door is `lib/workitem-board-reader.ts`; everything here
// is pure, so every outcome including the refusals is pinnable with no board.
//
// THE CLASSES, and what each one's grammar actually CLAIMS — which is the whole design, because two of the
// three claim less than #2156's body assumed and building the assumed rule would have shipped ~89 false
// positives on day one:
//
//   1. `policy-workitem` — a warning-tier policy's `workItem`. THIS ONE CLAIMS OPENNESS: guide §12.5 makes
//      unresolved debt "a warning tied to a positive `workItem`", and the policy flips to `hard`/`error`
//      when its own effective count reaches zero. A CLOSED row means the debt has no owner (#2070: the
//      pointer rotted three times — #626, then #2024, then #2184 one policy over). Derived from the real
//      loader, never a roster.
//
//   2. `ledger-closure` — the refutation ledger's state cells. THE `(board #N)` IS A TRACKING POINTER, NOT A
//      CLOSURE CLAIM, and the playbook says so in the sentence that MINTED the grammar: *"the orchestrator
//      flips in its reconcile edit, each cell naming the sha and `(board #NNNN)`; the barrier check on #2195
//      asserts every cited id EXISTS and every OWED id is later closed"*. The SHA carries the closure; the id
//      carries where the work is tracked, and one board row legitimately spans several ledger rows, so it
//      stays open while individual cells close (#2181 is `Running` with several CLOSED cells) and a cell can
//      stay OPEN after a narrower board closure (#2068). So the HARD arm here is RESOLUTION — a cited id
//      that names no row at all is a typo'd or invented citation, which is the crossed-citation defect
//      #2156 was filed for — and the state disagreement is an ADVISORY CENSUS: printed, never a verdict.
//      Measured when this landed: 326 of 515 state-bearing rows cite an id, 0 dangling, 62 state
//      disagreements under the rejected predicate.
//
//   3. `roster-reference` — `Core-Enforcement-Active-Gates.md` and `Core-Enforcement-Deferred-Dropped.md`.
//      THE OPENNESS HALF IS REFUSED, on the roster's own evidence (measured 2026-09-13, ruled by the
//      orchestrator the same day): all 292 citations across 149 distinct ids sit in the `Enforces` column
//      and name the issue the gate IMPLEMENTS — "issue #935 — the 41 Appearance schema leaves…" — which is
//      origin, not lifecycle. 70 of them point at not-Done rows and 40+ of those are the LIVE program epic
//      #1584, so "a roster citation must be closed" would red on the work in progress; the mirror rule
//      would red on every historical row. The roster header states no citation contract to enforce. The
//      deferred roster is the same shape: 20 trigger-cell citations, 19 of them the `#2008`/`#2217` rows
//      that MADE those cells correct. So this class is RESOLUTION ONLY, and it is green today.
//
// WHY RESOLUTION IS WORTH A STAGE EVEN WHERE IT IS GREEN. A number that names no row is wrong under every
// reading of the grammar. The advisory census is where the unadjudicable rest goes, on purpose: an
// instrument that turns a disagreement it cannot adjudicate into a red teaches its operator to bypass it.
//
// FOUR MORE ARMS LANDED 2026-09-13 ON CODEX'S INDEPENDENT REVIEW, because the first version of this module
// could report a clean zero while knowing nothing. Each one is fail-CLOSED where it used to be silent:
//
//   A. THE SUBJECT JOIN (`lib/citation-subject.ts`) — resolution alone is blind to #2156's founding defect.
//      #2153 crossed two ids that BOTH exist, so an `exists` check reports 0 on the very cell that filed
//      the row. A ledger citation whose target DECLARES a subject in the same wave and a different row is
//      now CROSSED. The 303 citations whose target declares nothing stay a counted residue — #2156 is NOT
//      closed by this module; see the residue note in `docs/reviews/gate-runtime/x-warning-barrier-2026-09-13.md`.
//   B. BOARD MEMBERSHIP — a citation names a BOARD row. An issue that is an item of no Project is not one.
//   C. SOURCE GRAMMAR (`assertLedgerSource`/`assertRosterSource`) — renaming the ledger's `state` column
//      used to erase the whole class and still exit 0, because the synthetic control document kept its own
//      header. A configured source that loses its fence, its state column, or its citations now THROWS.
//   D. JOIN NON-VACUITY (`assertSubjectJoinMeasured`) — zero matched subjects means the join stopped
//      reading, never that the tree is clean.

import type { BoardIssueRow } from "#workboard";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { GatePolicy } from "../contract/policy.ts";
import type { SubjectVerdict } from "./citation-subject.ts";
import { declaredSubjectKey, subjectKey, subjectVerdict } from "./citation-subject.ts";
import type { MarkdownTable } from "./markdown-tables.ts";
import { markdownTables } from "./markdown-tables.ts";
import type { BoardIssueState } from "./workitem-liveness.ts";
import { warningWorkItems } from "./workitem-liveness.ts";

/** One board snapshot: every issue the repository has, by number, with the evidence the three class
 *  contracts need (state · board membership · the row's own text). A number ABSENT from this map names no
 *  row — never "the read failed", which throws in the reader long before this map exists. */
export type BoardStates = ReadonlyMap<number, BoardIssueRow>;

export const CITATION_CLASSES = ["policy-workitem", "ledger-closure", "roster-reference"] as const;
export type CitationClass = (typeof CITATION_CLASSES)[number];

/** What a site's own grammar claims about the row it names — see the class table in the header. `open` is
 *  claimed by exactly one class; the other two claim only that the row EXISTS. */
export type CitationClaim = "open" | "exists";

export interface BoardCitation {
  readonly citationClass: CitationClass;
  /** `path:line` for a document site, the policy id for a descriptor site. */
  readonly site: string;
  readonly issue: number;
  readonly claim: CitationClaim;
  /** The authored text the citation was read out of, trimmed for the report. */
  readonly context: string;
  /** The citing row's OWN subject key — class 2 only, and only where the row's table carries a
   *  `wave`/`lane` column. Present means "join this against what the cited row declares". */
  readonly subjectKey?: string;
}

/** A citation whose claim the board contradicts — the exit-1 population. */
export interface CrossedCitation {
  readonly citation: BoardCitation;
  /** `undefined` when the board has no such row. */
  readonly state: BoardIssueState | undefined;
  readonly why: string;
}

/** A ledger cell whose verdict word and whose tracked row's state disagree. ADVISORY: printed, never a
 *  verdict, because the `(board #N)` pointer does not claim the row's state (header, class 2). */
export interface StateDisagreement {
  readonly site: string;
  readonly issue: number;
  readonly verdict: string;
  readonly state: BoardIssueState;
  readonly context: string;
}

/** A ledger citation whose subject the join could not turn into a verdict — a DIFFERENT wave's row (the
 *  legitimate "tracked on the earlier row of this defect family" pointer) or a key in an unknown spelling.
 *  ADVISORY: printed with its two keys so a reader can see why it is not a finding. */
export interface SubjectNote {
  readonly site: string;
  readonly issue: number;
  readonly verdict: SubjectVerdict;
  readonly cited: string | undefined;
  readonly declared: string | undefined;
}

export interface BoardCitationsOutcome {
  readonly boardRows: number;
  readonly citations: readonly BoardCitation[];
  readonly crossed: readonly CrossedCitation[];
  readonly advisory: readonly StateDisagreement[];
  /** Per subject verdict: how many class-2 citations landed there. `matched` is the join's denominator —
   *  zero means the join stopped reading (`assertSubjectJoinMeasured`). */
  readonly subject: Readonly<Record<SubjectVerdict, number>>;
  readonly subjectNotes: readonly SubjectNote[];
  /** Per class: how many citations were read, so a class that silently stopped matching is visible. */
  readonly perClass: Readonly<Record<CitationClass, number>>;
  /** Ledger cells whose verdict word asserts nothing about tracking (`SUPERSEDED`/`RETIRED`/`DROPPED`) —
   *  counted rather than dropped, so the denominators add up. */
  readonly verdictless: number;
}

/** A document handed to the judge: its repo-relative path and its text. */
export interface CitedDocument {
  readonly rel: string;
  readonly text: string;
}

/** One ledger state-cell citation with the cell's verdict word — the reader's row shape. */
export interface LedgerCitation {
  readonly citation: BoardCitation;
  readonly verdict: string | undefined;
}

export interface BoardCitationsInput {
  readonly policies: readonly GatePolicy[];
  readonly ledgers: readonly CitedDocument[];
  readonly rosters: readonly CitedDocument[];
  readonly states: BoardStates;
}

const ISSUE_REF = /#(\d{2,5})/g;
/** The ledger's own verdict vocabulary, read as the FIRST such word in the cell. */
const LEDGER_VERDICT = /\b(CLOSED|FIXED|OPEN|PARTIAL|UNADJUDICATED|SUPERSEDED|RETIRED|DROPPED)\b/;
/** Verdicts that track a live-or-done position, so a disagreement is worth printing. The rest assert nothing. */
const TRACKING_VERDICTS = new Set(["CLOSED", "FIXED", "OPEN", "PARTIAL", "UNADJUDICATED"]);
const CLOSED_VERDICTS = new Set(["CLOSED", "FIXED"]);
/** Where the ledger's defect rows start. Sections after the enclosing `##` carry tables of their own (the
 *  class rollup, the ranked list) and are not defect rows — the same fence `lib/gate-program-docs.ts` uses. */
const LEDGER_FENCE = "## THE LEDGER";
/** The header of the column carrying a ledger row's own subject — authored as "wave · path:line", and
 *  "lane · …" in the sections a fix lane appended. Matched on the leading word so the trailing path:line
 *  spelling can drift without unhooking the join. */
const SUBJECT_COLUMN = /^(wave|lane)\b/iu;
const CONTEXT_MAX = 160;

function context(text: string): string {
  const flat = text.replaceAll(/\s+/gu, " ").trim();
  return flat.length > CONTEXT_MAX ? `${flat.slice(0, CONTEXT_MAX)}…` : flat;
}

function issuesIn(cell: string): readonly number[] {
  return [...cell.matchAll(ISSUE_REF)].map((match) => Number(match[1]));
}

/** Every `#N` in a ledger's STATE cells, under the ledger fence, with the cell's verdict word.
 *
 *  The state column is found BY NAME off each table's header (`markdownTables` reads columns by shape), so a
 *  section whose schema differs — and they do differ — contributes nothing rather than misreading column 4. */
export function ledgerCitations(doc: CitedDocument): readonly LedgerCitation[] {
  const lines = doc.text.split("\n");
  const fence = lines.findIndex((line) => line.startsWith(LEDGER_FENCE));
  return markdownTables(lines, 1).flatMap((table) => ledgerTableCitations(doc, table, fence));
}

/** One table's post-fence citations. The state column is found BY NAME off the header (`markdownTables`
 *  reads columns by shape), and the row's own SUBJECT lives in the `wave · path:line` column — spelled
 *  `lane · …` in the sections a fix lane appended. A table missing either contributes accordingly: no
 *  state column means no citations at all, no subject column means citations that carry no subject. */
function ledgerTableCitations(doc: CitedDocument, table: MarkdownTable, fence: number): readonly LedgerCitation[] {
  const column = table.columns.findIndex((name) => name.toLowerCase() === "state");
  if (column < 0) {
    return [];
  }
  const subjectColumn = table.columns.findIndex((name) => SUBJECT_COLUMN.test(name));
  const rows = table.rows.filter((row) => fence < 0 || row.line >= fence);
  return rows.flatMap((row) => {
    const cell = row.cells[column] ?? "";
    const verdict = LEDGER_VERDICT.exec(cell)?.[1];
    const key = subjectColumn < 0 ? undefined : subjectKey(row.cells[subjectColumn] ?? "");
    return issuesIn(cell).map((issue) => ({
      citation: {
        citationClass: "ledger-closure" as const,
        site: `${doc.rel}:${String(row.line)}`,
        issue,
        claim: "exists" as const,
        context: context(cell),
        ...(key === undefined ? {} : { subjectKey: key }),
      },
      verdict,
    }));
  });
}

/** REFUSE A CONFIGURED LEDGER THIS RUN CANNOT READ (codex review F2). Renaming the `state` column used to
 *  drop the whole class to zero and still exit 0 — `perClass` printed the zero and nothing enforced it,
 *  while the same-invocation controls kept firing against their own synthetic document, which proves the
 *  ALGORITHM and says nothing about whether the PRODUCTION source was admitted. Each clause names the
 *  thing that stopped being true; every one of them is the exit-2 class at the CLI. */
export function assertLedgerSource(doc: CitedDocument): number {
  const lines = doc.text.split("\n");
  if (!lines.some((line) => line.startsWith(LEDGER_FENCE))) {
    throw new Error(`board-citations: ${doc.rel} carries no \`${LEDGER_FENCE}\` fence, so every defect row would be read as pre-fence summary and skipped.`);
  }
  const fence = lines.findIndex((line) => line.startsWith(LEDGER_FENCE));
  const stated = markdownTables(lines, 1).filter(
    (table) => table.columns.some((name) => name.toLowerCase() === "state") && table.rows.some((row) => row.line >= fence),
  );
  if (stated.length === 0) {
    throw new Error(
      `board-citations: ${doc.rel} has no post-fence table with a \`state\` column. The class reads the state column BY NAME, so a renamed column is not a clean ledger — it is a ledger this run cannot read.`,
    );
  }
  const count = ledgerCitations(doc).length;
  if (count === 0) {
    throw new Error(
      `board-citations: ${doc.rel} yielded ZERO state-cell citations across ${String(stated.length)} state-bearing table(s). A configured ledger with no citations is a parser that stopped matching, not a ledger with nothing to check.`,
    );
  }
  return count;
}

/** The same source-specific non-vacuity for a configured roster: an existing but rewritten document whose
 *  citations no longer parse used to succeed with a printed zero. */
export function assertRosterSource(doc: CitedDocument): number {
  const count = rosterCitations(doc).length;
  if (count === 0) {
    throw new Error(
      `board-citations: ${doc.rel} yielded ZERO table-cell citations. A configured roster with no citations is a parser that stopped matching, not a roster with nothing to check.`,
    );
  }
  return count;
}

/** The join's own denominator (codex review F1's fail-closed half). Every declaring row spells its subject
 *  the same way; if not one citation MATCHED, the grammar moved and the hard subject arm is silently
 *  unreachable — which is the shape this whole module exists to refuse. */
export function assertSubjectJoinMeasured(outcome: BoardCitationsOutcome): void {
  if (outcome.subject.matched === 0) {
    throw new Error(
      "board-citations: the subject join matched ZERO citations. Either no cited row declares a `**Where:**` subject any more, or the ledger's wave column moved — a join that reads nothing cannot report a crossed citation, so this run is not a verdict.",
    );
  }
}

/** Every `#N` in a roster's table rows. Resolution only — the openness half is refused (header, class 3). */
export function rosterCitations(doc: CitedDocument): readonly BoardCitation[] {
  const citations: BoardCitation[] = [];
  for (const table of markdownTables(doc.text.split("\n"), 1)) {
    for (const row of table.rows) {
      for (const cell of row.cells) {
        for (const issue of issuesIn(cell)) {
          citations.push({ citationClass: "roster-reference", site: `${doc.rel}:${String(row.line)}`, issue, claim: "exists", context: context(cell) });
        }
      }
    }
  }
  return citations;
}

/** The warning-policy citations, class 1 — the ONE claim of openness on the tree. */
export function policyCitations(policies: readonly GatePolicy[]): readonly BoardCitation[] {
  return warningWorkItems(policies).map(({ policy, workItem }) => ({
    citationClass: "policy-workitem" as const,
    site: policy,
    issue: workItem,
    claim: "open" as const,
    context: `warning debt owned by #${String(workItem)}`,
  }));
}

/** ZERO OR ONE crossing, as a list rather than an optional: the caller flat-maps, so this module never
 *  writes `return undefined` — the shape `noUselessUndefined` and `noImplicitReturns` disagree about. */
function crossings(citation: BoardCitation, states: BoardStates): readonly CrossedCitation[] {
  const row = states.get(citation.issue);
  if (row === undefined) {
    return [{ citation, state: undefined, why: "the board has no row with that number — a citation nobody minted" }];
  }
  const state = row.state;
  if (!row.onBoard) {
    return [{ citation, state, why: "the issue exists but is an item of NO project — a citation names a BOARD row, and this one is not on the board" }];
  }
  if (citation.claim === "open" && state === "CLOSED") {
    return [{ citation, state, why: "the site claims this row is OPEN and owns the work; the board says CLOSED" }];
  }
  if (citation.subjectKey !== undefined && subjectVerdict(citation.subjectKey, row.body) === "crossed") {
    return [
      {
        citation,
        state,
        why:
          `the cited row declares subject \`${String(declaredSubjectKey(row.body))}\` — the SAME wave as this row's \`${citation.subjectKey}\`, a DIFFERENT row. ` +
          "That is the crossed citation #2156 was filed for (#2153): a real id belonging to a sibling defect",
      },
    ];
  }
  return [];
}

/** The crossed subset of any citation list — exported so a SAME-INVOCATION CONTROL can plant one citation
 *  and prove the arm fires without inventing a second judgement path. */
export function crossedCitations(citations: readonly BoardCitation[], states: BoardStates): readonly CrossedCitation[] {
  return citations.flatMap((citation) => crossings(citation, states));
}

/** Everything the LEDGER class contributes: its citations, the state-disagreement census, and the subject
 *  census. Split out of `judgeBoardCitations` so each stays inside the complexity cap; the two censuses are
 *  computed in one pass because both key off the same `(citation, board row)` pair. */
function ledgerCensus(
  ledgers: readonly CitedDocument[],
  states: BoardStates,
): {
  readonly citations: readonly BoardCitation[];
  readonly advisory: readonly StateDisagreement[];
  readonly subject: Readonly<Record<SubjectVerdict, number>>;
  readonly subjectNotes: readonly SubjectNote[];
  readonly verdictless: number;
} {
  const citations: BoardCitation[] = [];
  const advisory: StateDisagreement[] = [];
  const subjectNotes: SubjectNote[] = [];
  const subject: Record<SubjectVerdict, number> = { matched: 0, crossed: 0, "cross-family": 0, undeclared: 0, unkeyed: 0 };
  let verdictless = 0;
  for (const { citation, verdict } of ledgers.flatMap((doc) => ledgerCitations(doc))) {
    citations.push(citation);
    const row = states.get(citation.issue);
    if (row !== undefined) {
      const seen = subjectVerdict(citation.subjectKey, row.body);
      subject[seen] += 1;
      if (seen === "cross-family" || seen === "unkeyed") {
        subjectNotes.push({ site: citation.site, issue: citation.issue, verdict: seen, cited: citation.subjectKey, declared: declaredSubjectKey(row.body) });
      }
    }
    if (verdict === undefined || !TRACKING_VERDICTS.has(verdict)) {
      verdictless += 1;
    } else if (row !== undefined && (row.state === "CLOSED") !== CLOSED_VERDICTS.has(verdict)) {
      advisory.push({ site: citation.site, issue: citation.issue, verdict, state: row.state, context: citation.context });
    }
  }
  return { citations, advisory, subject, subjectNotes, verdictless };
}

/** Judge one run. Pure: the board is a MAP, so every arm — including a dangling citation and an empty
 *  board — is reachable without a network. Throws only on an empty board, which is the shape that would
 *  otherwise report every citation as dangling and read as a catastrophe rather than as a failed read. */
export function judgeBoardCitations(input: BoardCitationsInput): BoardCitationsOutcome {
  const { policies, ledgers, rosters, states } = input;
  if (states.size === 0) {
    throw new Error("board-citations: the board snapshot is EMPTY, so every citation would read as dangling — that is a failed read, not a verdict.");
  }
  const census = ledgerCensus(ledgers, states);
  const citations: BoardCitation[] = [...policyCitations(policies), ...census.citations];
  const { advisory, subject, subjectNotes, verdictless } = census;
  for (const doc of rosters) {
    citations.push(...rosterCitations(doc));
  }
  const crossed = crossedCitations(citations, states);
  const perClass = {
    "policy-workitem": citations.filter((row) => row.citationClass === "policy-workitem").length,
    "ledger-closure": citations.filter((row) => row.citationClass === "ledger-closure").length,
    "roster-reference": citations.filter((row) => row.citationClass === "roster-reference").length,
  };
  return { boardRows: states.size, citations, crossed, advisory, subject, subjectNotes, perClass, verdictless };
}

/** The report: denominators first (a reader must be able to tell "nothing crossed" from "nothing read"),
 *  then the findings, then the advisory census under its own heading so nobody mistakes it for a verdict. */
export function boardCitationsReport(outcome: BoardCitationsOutcome): readonly string[] {
  const lines = [
    `board-citations — ${String(outcome.citations.length)} citation(s) over ${String(outcome.boardRows)} board row(s): ` +
      CITATION_CLASSES.map((name) => `${name} ${String(outcome.perClass[name])}`).join(" · ") +
      ` · ${String(outcome.crossed.length)} crossed · ${String(outcome.advisory.length)} advisory disagreement(s) · ${String(outcome.verdictless)} cell(s) whose verdict claims nothing`,
  ];
  for (const row of outcome.crossed) {
    lines.push(
      `  [${row.citation.citationClass}] ${row.citation.site} cites #${String(row.citation.issue)} — ${row.why}` +
        `${row.state === undefined ? "" : ` (board: ${row.state})`}\n      ${row.citation.context}`,
    );
  }
  lines.push(
    `  subject join (class 2) — matched ${String(outcome.subject.matched)} · crossed ${String(outcome.subject.crossed)} · ` +
      `cross-family ${String(outcome.subject["cross-family"])} · unkeyed ${String(outcome.subject.unkeyed)} · ` +
      `undeclared ${String(outcome.subject.undeclared)} (the cited row makes no subject claim — a counted residue, never a verdict; #2156 stays OPEN on it)`,
  );
  for (const note of outcome.subjectNotes) {
    lines.push(
      `    [${note.verdict}] ${note.site} cites #${String(note.issue)}: this row is \`${String(note.cited)}\`, the cited row declares \`${String(note.declared)}\`` +
        `${note.verdict === "cross-family" ? " — a different wave, so it reads as the earlier board row of the same defect family" : " — a key this grammar does not parse"}`,
    );
  }
  if (outcome.advisory.length > 0) {
    lines.push(
      `  ADVISORY — ${String(outcome.advisory.length)} ledger cell(s) whose verdict word and whose tracked row's state disagree. NOT a verdict: the ` +
        "`(board #N)` pointer names where the work is TRACKED, and the SHA beside it carries the closure, so one row spans several cells " +
        "and legitimately outlives them. Reconcile these as a ledger/board pass:",
    );
    for (const row of outcome.advisory) {
      lines.push(`    ${row.site} [${row.verdict}] #${String(row.issue)} is ${row.state} on the board\n        ${row.context}`);
    }
  }
  return lines;
}

/** 0 or 1 only — the exit-2 class is always a throw, from the reader or from a control. */
export function boardCitationsExit(outcome: BoardCitationsOutcome): number {
  return outcome.crossed.length > 0 ? EXIT.violations : EXIT.clean;
}
