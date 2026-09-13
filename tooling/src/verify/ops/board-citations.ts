// The `structure:board-citations` verb (#2156, folding #2070) — the BARRIER reconciliation of every place
// the tree names a board row against the board itself. The judgement, its three classes and the reason
// each one claims what it claims live in `lib/board-citations.ts`; this module is the I/O half: which
// documents, which corpus, the one network read, the same-invocation controls, and the exit.
//
// MANUAL BY NATURE, NOT BY COST — the `structure:ledger-claims` precedent. It needs the network and `gh`
// auth, and the commit bar must stay offline-capable: a stage that cannot answer without GitHub turns
// every offline `pnpm check` into an exit-2. The owner-approved forge ruling on #2070 puts it "at the
// quiet barrier beside `ledgers:fresh`", which is an act an operator performs, never a tier.
//
// THE CONTROLS RUN IN THE SAME INVOCATION AS THE VERDICT, one per class, and a control that does not fire
// THROWS (exit 2) instead of letting the run report a clean zero. That is the whole reason #2070 exists:
// every way a board reader breaks yields "OPEN"/"unknown" for everything, which is byte-identical to a
// clean bar. The fourth control — the board being unreachable — cannot be self-inflicted here (the reader
// either answers or throws); it is pinned in `tests/tooling/verify/ops/board-citations.test.ts` by handing
// the judge a reader that throws, and the throw is what the runner turns into exit 2.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import type { BoardCitation, BoardStates, CitedDocument } from "../lib/board-citations.ts";
import { boardCitationsExit, boardCitationsReport, crossedCitations, judgeBoardCitations } from "../lib/board-citations.ts";
import { loadMixedGateCorpus } from "../lib/loader.ts";
import { boardStates } from "../lib/workitem-board-reader.ts";
import { CLOSED_CONTROL_ISSUE } from "../lib/workitem-liveness.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:board-citations");

/** The ledger whose state cells carry `(board #N)` tracking pointers — the work queue `gate-runtime-read-first.md`
 *  row 3 names, and the only document written under that grammar today. A second one joins this tuple; it is
 *  never discovered by glob, because a glob over `docs/reviews/**` would silently start judging prose. */
const LEDGERS = ["docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md"] as const;
/** Both enforcement rosters. Resolution only — the openness half is refused, and the refusal's evidence is
 *  in `lib/board-citations.ts`'s class table. */
const ROSTERS = ["docs/architecture/core/Core-Enforcement-Active-Gates.md", "docs/architecture/core/Core-Enforcement-Deferred-Dropped.md"] as const;

function read(root: string, rel: string): CitedDocument {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    // A RENAMED DOCUMENT IS THE BLINDNESS SHAPE: it contributes zero citations, the totals still print, and
    // the run reads clean. Naming the path is the only honest answer.
    throw new Error(
      `board-citations: ${rel} is not on the tree, so its citations would silently count as zero. Re-point the constant in ops/board-citations.ts.`,
    );
  }
  return { rel, text: readFileSync(abs, "utf8") };
}

/** One control and what it proved, printed with the verdict so a reader can see the run could still fail. */
export interface ControlReceipt {
  readonly control: string;
  readonly proved: string;
}

const PLANTED_LEDGER_REL = "<planted control>/ledger.md";
const PLANTED_ROSTER_REL = "<planted control>/roster.md";

/** A number no row can have: one past the highest the board reported. */
function absentIssue(states: BoardStates): number {
  return Math.max(...states.keys()) + 1;
}

/** The lowest OPEN row the board reported — a REAL open id, so the advisory control exercises the same
 *  comparison the census does rather than a hand-made state. */
function anOpenIssue(states: BoardStates): number {
  const open = [...states.entries()].filter(([, state]) => state === "OPEN").map(([issue]) => issue);
  if (open.length === 0) {
    throw new Error(
      "board-citations: the board reported no OPEN row at all, so the advisory control cannot be planted — that is a board read to distrust, not a clean run.",
    );
  }
  return Math.min(...open);
}

function plantedLedger(issue: number, absent: number): CitedDocument {
  return {
    rel: PLANTED_LEDGER_REL,
    text: [
      "## THE LEDGER",
      "",
      "| module | defect | state |",
      "| - | - | - |",
      `| control-advisory | the advisory arm | **CLOSED** — \`0000000\` (board #${String(issue)}) |`,
      `| control-dangling | the resolution arm | **OPEN** (board #${String(absent)}) |`,
      "",
    ].join("\n"),
  };
}

function plantedRoster(absent: number): CitedDocument {
  return {
    rel: PLANTED_ROSTER_REL,
    text: ["| Gate | Enforces |", "| - | - |", `| control-gate | issue #${String(absent)} — a number nobody minted |`, ""].join("\n"),
  };
}

/** Run every class's control against the REAL board snapshot, in this invocation. Throws the moment one
 *  does not fire: a control that stopped firing is the instrument going blind, not a clean tree. */
export function runControls(states: BoardStates): readonly ControlReceipt[] {
  const absent = absentIssue(states);
  const open = anOpenIssue(states);

  const policyControl: BoardCitation = {
    citationClass: "policy-workitem",
    site: "<planted control>/policy",
    issue: CLOSED_CONTROL_ISSUE,
    claim: "open",
    context: "a warning policy whose workItem names the permanently-closed control row",
  };
  const policyCrossed = crossedCitations([policyControl], states);
  if (policyCrossed.length !== 1) {
    throw new Error(
      `board-citations: the policy-workitem control did not fire — #${String(CLOSED_CONTROL_ISSUE)} came back ${String(states.get(CLOSED_CONTROL_ISSUE))}, not CLOSED. ` +
        "Either the control row was reopened (move CLOSED_CONTROL_ISSUE to another permanently-closed row and say why) or this board read cannot tell OPEN from CLOSED; the run is not a verdict either way.",
    );
  }

  const planted = judgeBoardCitations({ policies: [], ledgers: [plantedLedger(open, absent)], rosters: [plantedRoster(absent)], states });
  const ledgerDangling = planted.crossed.filter((row) => row.citation.citationClass === "ledger-closure");
  const rosterDangling = planted.crossed.filter((row) => row.citation.citationClass === "roster-reference");
  if (planted.advisory.length !== 1) {
    throw new Error(
      `board-citations: the ledger ADVISORY control did not fire — a CLOSED cell tracking OPEN #${String(open)} produced ${String(planted.advisory.length)} disagreement(s), expected 1.`,
    );
  }
  if (ledgerDangling.length !== 1 || rosterDangling.length !== 1) {
    throw new Error(
      `board-citations: a RESOLUTION control did not fire — a citation of #${String(absent)} (no such row) produced ` +
        `${String(ledgerDangling.length)} ledger and ${String(rosterDangling.length)} roster finding(s), expected 1 each.`,
    );
  }

  return [
    { control: "policy-workitem", proved: `#${String(CLOSED_CONTROL_ISSUE)} reported CLOSED, so this run can tell a closed row from an open one` },
    {
      control: "ledger-closure",
      proved: `a planted CLOSED cell tracking OPEN #${String(open)} was censused, and a citation of absent #${String(absent)} was reported`,
    },
    { control: "roster-reference", proved: `a planted citation of absent #${String(absent)} was reported` },
  ];
}

/** The `board-citations` verb. 0 = every citation resolves and every openness claim holds · 1 = a crossed
 *  citation is named · 2 = the run could not measure (thrown: the board read, an absent document, an empty
 *  snapshot, or a control that did not fire). */
export async function runBoardCitations(root: string): Promise<number> {
  const corpus = await loadMixedGateCorpus(root);
  const states = boardStates();
  for (const receipt of runControls(states)) {
    process.stdout.write(`  control [${receipt.control}] ${receipt.proved}\n`);
  }
  const outcome = judgeBoardCitations({
    policies: corpus.final,
    ledgers: LEDGERS.map((rel) => read(root, rel)),
    rosters: ROSTERS.map((rel) => read(root, rel)),
    states,
  });
  for (const line of boardCitationsReport(outcome)) {
    process.stdout.write(`${line}\n`);
  }
  return boardCitationsExit(outcome);
}
