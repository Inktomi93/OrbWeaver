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
//   3. `roster-reference` — `Core-Enforcement-Active-Gates.md` and `docs/law/Core-Enforcement-Deferred-Dropped.md`.
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
//   C. SOURCE GRAMMAR (`assertLedgerSource`/`assertRosterSource`, now in `lib/citation-sources.ts`) —
//      renaming the ledger's `state` column used to erase the whole class and still exit 0, because the
//      synthetic control document kept its own header. A configured source that loses its fence, its
//      schema, or its citations now THROWS.
//   D. JOIN NON-VACUITY (`assertSubjectJoinMeasured`) — zero matched subjects means the join stopped
//      reading, never that the tree is clean.
//
// THE DOCUMENT READERS LIVE IN `lib/citation-sources.ts` (split out 2026-09-13 at the 450-line cap, with
// the security review's N1/N2 repairs). That module owns the citation SHAPE, the ledger fence as a SPAN
// (`## THE LEDGER` → the next `##`, which is what stopped the class rollup entering the population) and
// SCHEMA-driven admission (`defect` + `state`, so a partial column rename refuses instead of quietly
// halving the class). This module owns the judgment: what a citation CLAIMS, what contradicts it, and how
// the run reports and exits.

import type { BoardIssueRow } from "#workboard";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { GatePolicy } from "../contract/policy.ts";
import type { BoardCitation, CitationClass, CitedDocument } from "./citation-sources.ts";
import { CITATION_CLASSES, ledgerCitations, rosterCitations } from "./citation-sources.ts";
import type { SubjectVerdict } from "./citation-subject.ts";
import { declaredSubjectKey, subjectVerdict } from "./citation-subject.ts";
import type { BoardIssueState } from "./workitem-liveness.ts";
import { warningWorkItems } from "./workitem-liveness.ts";

/** One board snapshot: every issue the repository has, by number, with the evidence the three class
 *  contracts need (state · board membership · the row's own text). A number ABSENT from this map names no
 *  row — never "the read failed", which throws in the reader long before this map exists. */
// @orb-waive no-inline-types(BoardStates): consumed within lib/ and ops/ (board-citations family only); not a cross-domain shape; ends when a gate imports it
export type BoardStates = ReadonlyMap<number, BoardIssueRow>;

/** A citation whose claim the board contradicts — the exit-1 population. */
export interface CrossedCitation {
  readonly citation: BoardCitation;
  /** `undefined` when the board has no such row. */
  readonly state: BoardIssueState | undefined;
  readonly why: string;
}

/** A ledger cell whose verdict word and whose tracked row's state disagree. ADVISORY: printed, never a
 *  verdict, because the `(board #N)` pointer does not claim the row's state (header, class 2). */
interface StateDisagreement {
  readonly site: string;
  readonly issue: number;
  readonly verdict: string;
  readonly state: BoardIssueState;
  readonly context: string;
}

/** A ledger citation whose subject the join could not turn into a verdict — a DIFFERENT wave's row (the
 *  legitimate "tracked on the earlier row of this defect family" pointer) or a key in an unknown spelling.
 *  ADVISORY: printed with its two keys so a reader can see why it is not a finding. */
interface SubjectNote {
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

export interface BoardCitationsInput {
  readonly policies: readonly GatePolicy[];
  readonly ledgers: readonly CitedDocument[];
  readonly rosters: readonly CitedDocument[];
  readonly states: BoardStates;
}

/** Verdicts that track a live-or-done position, so a disagreement is worth printing. The rest assert nothing. */
const TRACKING_VERDICTS = new Set(["CLOSED", "FIXED", "OPEN", "PARTIAL", "UNADJUDICATED"]);
const CLOSED_VERDICTS = new Set(["CLOSED", "FIXED"]);

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

/** The warning-policy citations, class 1 — the ONE claim of openness on the tree. */
function policyCitations(policies: readonly GatePolicy[]): readonly BoardCitation[] {
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
