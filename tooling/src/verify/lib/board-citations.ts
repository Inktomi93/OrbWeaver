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
// WHY RESOLUTION IS WORTH A STAGE EVEN WHERE IT IS GREEN. It is the only half a tree can hold two-sided: a
// number that names no row is wrong under every reading of the grammar, and the two founding examples
// (#2153's L5/L11) were exactly that shape — a real id belonging to a different defect is invisible here,
// but a number nobody minted is not. The advisory census is where the rest goes, on purpose: an instrument
// that turns a disagreement it cannot adjudicate into a red teaches its operator to bypass it.
import { EXIT } from "../../_shared/exit-contract.ts";
import type { GatePolicy } from "../contract/policy.ts";
import { markdownTables } from "./markdown-tables.ts";
import type { BoardIssueState } from "./workitem-liveness.ts";
import { warningWorkItems } from "./workitem-liveness.ts";

/** One board snapshot: every issue the repository has, by number. A number ABSENT from this map names no
 *  row — never "the read failed", which throws in the reader long before this map exists. */
export type BoardStates = ReadonlyMap<number, BoardIssueState>;

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

export interface BoardCitationsOutcome {
  readonly boardRows: number;
  readonly citations: readonly BoardCitation[];
  readonly crossed: readonly CrossedCitation[];
  readonly advisory: readonly StateDisagreement[];
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
export function ledgerCitations(doc: CitedDocument): readonly { citation: BoardCitation; verdict: string | undefined }[] {
  const lines = doc.text.split("\n");
  const fence = lines.findIndex((line) => line.startsWith(LEDGER_FENCE));
  const rows: { citation: BoardCitation; verdict: string | undefined }[] = [];
  for (const table of markdownTables(lines, 1)) {
    const column = table.columns.findIndex((name) => name.toLowerCase() === "state");
    if (column < 0) {
      continue;
    }
    for (const row of table.rows) {
      if (fence >= 0 && row.line < fence) {
        continue;
      }
      const cell = row.cells[column] ?? "";
      const verdict = LEDGER_VERDICT.exec(cell)?.[1];
      for (const issue of issuesIn(cell)) {
        rows.push({
          citation: { citationClass: "ledger-closure", site: `${doc.rel}:${String(row.line)}`, issue, claim: "exists", context: context(cell) },
          verdict,
        });
      }
    }
  }
  return rows;
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
  const state = states.get(citation.issue);
  if (state === undefined) {
    return [{ citation, state, why: "the board has no row with that number — a citation nobody minted" }];
  }
  if (citation.claim === "open" && state === "CLOSED") {
    return [{ citation, state, why: "the site claims this row is OPEN and owns the work; the board says CLOSED" }];
  }
  return [];
}

/** The crossed subset of any citation list — exported so a SAME-INVOCATION CONTROL can plant one citation
 *  and prove the arm fires without inventing a second judgement path. */
export function crossedCitations(citations: readonly BoardCitation[], states: BoardStates): readonly CrossedCitation[] {
  return citations.flatMap((citation) => crossings(citation, states));
}

/** Judge one run. Pure: the board is a MAP, so every arm — including a dangling citation and an empty
 *  board — is reachable without a network. Throws only on an empty board, which is the shape that would
 *  otherwise report every citation as dangling and read as a catastrophe rather than as a failed read. */
export function judgeBoardCitations(input: BoardCitationsInput): BoardCitationsOutcome {
  const { policies, ledgers, rosters, states } = input;
  if (states.size === 0) {
    throw new Error("board-citations: the board snapshot is EMPTY, so every citation would read as dangling — that is a failed read, not a verdict.");
  }
  const citations: BoardCitation[] = [...policyCitations(policies)];
  const advisory: StateDisagreement[] = [];
  let verdictless = 0;
  for (const doc of ledgers) {
    for (const { citation, verdict } of ledgerCitations(doc)) {
      citations.push(citation);
      if (verdict === undefined || !TRACKING_VERDICTS.has(verdict)) {
        verdictless += 1;
        continue;
      }
      const state = states.get(citation.issue);
      if (state === undefined) {
        continue;
      }
      if ((state === "CLOSED") !== CLOSED_VERDICTS.has(verdict)) {
        advisory.push({ site: citation.site, issue: citation.issue, verdict, state, context: citation.context });
      }
    }
  }
  for (const doc of rosters) {
    citations.push(...rosterCitations(doc));
  }
  const crossed = crossedCitations(citations, states);
  const perClass = {
    "policy-workitem": citations.filter((row) => row.citationClass === "policy-workitem").length,
    "ledger-closure": citations.filter((row) => row.citationClass === "ledger-closure").length,
    "roster-reference": citations.filter((row) => row.citationClass === "roster-reference").length,
  };
  return { boardRows: states.size, citations, crossed, advisory, perClass, verdictless };
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
