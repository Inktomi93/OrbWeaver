// THE RUN RING'S RETENTION POLICY (#1341): which slots may be deleted, and the bounded ledger of the ones
// that were. Split out of ./artifacts.ts when that file passed the tooling line cap; the seam is real — this
// module decides POLICY over a directory of run ids and never learns what a run slot is, while artifacts.ts
// owns the slot machinery and hands the census in.
//
// THE DEFECT THIS EXISTS FOR. Retention used to be COUNT-ONLY: the ten newest slots per instrument, plus any
// slot a published pointer still resolved into. A `--no-shot` / `--eval` / `--text` run publishes NO
// pointer, so it was unreferenced and died the moment ten newer runs landed — while its end card had
// already printed `EVIDENCE <abs run.json>` as the receipt a review cites. Measured 2026-09-04 (cold-agent
// dogfood on /chats): side-eye cited `main-1723882-…T15-36-25-462Z` and `main-1726501-…T15-37-04-376Z` for a
// P1, and twenty minutes later neither directory existed — so the finding was unfalsifiable. 135 slots
// survived on disk that day: the ones carrying pointers.
//
// SO: AGE FIRST, COUNT SECOND, AND EVERY DELETION RECORDED. A citation that no longer resolves has to be
// answerable ("pruned, and when") rather than silent, which reads as "that run never existed".
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import { warn } from "../cli/log.ts";

/** Is this pid still running? `kill(pid, 0)` signals nothing and throws ESRCH when it is gone. Lives with
 *  retention because "may this slot go?" is first "is its owner still writing?" — and it is only ever asked
 *  about a marker from THIS box (a run slot's, a session row's daemon), so a pid from another machine can
 *  never be misread as live. */
export function pidAlive(pid: number): boolean {
  // @orb-waive caught-failure-ownership(catch): ESRCH is the answer, the pid is gone, and false is the dead answer every caller acts on (censusRow reports the slot abandoned; the stage keeper, session registry and niced-exec read it as a dead owner). Ends if a marker can come from another user, where EPERM would read as dead.
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Run slots retained per instrument PAST the age floor. */
const RETAINED_RUNS = 10;
/** THE AGE FLOOR. No slot is pruned before this, whatever the count cap says and whether or not any pointer
 *  names it. One working session is the unit, because that is the span over which a review is written, read
 *  and re-checked. */
const RETENTION_FLOOR_MS = 86_400_000; // 24h
/** The prune ledger beside the slots. Dot-prefixed like the other slot-family bookkeeping, so the run-dir
 *  census and the alias enumerator never mistake it for a run. */
const PRUNE_LEDGER = ".pruned.jsonl";
/** Rows kept in that ledger. It is bookkeeping ABOUT deletions, not evidence — bounded so it cannot grow
 *  without limit on a checkout that has been running instruments for months. */
const PRUNE_LEDGER_ROWS = 500;

/** A run this checkout's ring deleted. The ONE answer to "the path a review cited is not there". */
export interface PrunedRun {
  readonly runId: string;
  /** ISO instant the ring removed it. */
  readonly prunedAt: string;
  /** The slot's last-modified instant, ISO — when the run itself was last writing. */
  readonly ranAt: string;
}

/** A prunable slot: one this checkout may delete (nothing live, no pointer into it), with its mtime. */
export interface RetentionCandidate {
  readonly runId: string;
  readonly at: number;
}

/** WHICH candidates go, newest-first input, PURE. Everything younger than the floor stays — cited or not —
 *  and the count cap applies only to what is left. `keep` is the number of slots the caller has already
 *  committed to (the run publishing right now is one of them). */
export function selectPrunable(candidates: readonly RetentionCandidate[], now: number, keep = 1): readonly RetentionCandidate[] {
  const floor = now - RETENTION_FLOOR_MS;
  return [...candidates]
    .sort((a, b) => b.at - a.at)
    .slice(Math.max(0, RETAINED_RUNS - keep))
    .filter((row) => row.at <= floor);
}

type LedgerLine = { readonly row: PrunedRun } | { readonly error: string };

/** One row, or why it is unreadable: a killed append leaves a torn line, and it must cost only itself. */
function parseLedgerLine(line: string): LedgerLine {
  try {
    return { row: JSON.parse(line) as PrunedRun };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/** The ledger's rows. A missing ledger is the only empty answer: an unreadable file throws, and an
 *  unreadable row is skipped with one stderr line so a short history is never silent about why. */
export function readPrunedRuns(base: string): readonly PrunedRun[] {
  const path = join(base, PRUNE_LEDGER);
  if (!existsSync(path)) {
    return [];
  }
  const rows: PrunedRun[] = [];
  let unreadable = 0;
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/u)) {
    if (line === "") {
      continue;
    }
    const parsed = parseLedgerLine(line);
    if ("error" in parsed) {
      unreadable += 1;
    } else {
      rows.push(parsed.row);
    }
  }
  if (unreadable > 0) {
    warn(`PRUNE LEDGER  ${String(unreadable)} unreadable row(s) skipped in ${path}`);
  }
  return rows;
}

/** Record deletions in the instrument's bounded ledger. Append-first (one `writeFileSync` with `flag: "a"`,
 *  which POSIX keeps whole for a payload this size, so two racing publishers interleave ROWS rather than
 *  corrupt each other), then a bounded rewrite once the file passes its cap. A ledger write can never fail a
 *  run: the deletions already happened and the run's verdict is not the ring's to lose. */
export function recordPrunedRuns(base: string, rows: readonly PrunedRun[]): void {
  if (rows.length === 0) {
    return;
  }
  const path = join(base, PRUNE_LEDGER);
  // @orb-waive caught-failure-ownership(catch): bookkeeping ABOUT a deletion that already happened — the run's own verdict has been published and must not be lost to a ledger write, and the next publish re-appends its own rows. Ends if a reader starts requiring the ledger to be complete rather than best-effort.
  try {
    writeFileSync(path, rows.map((row) => `${JSON.stringify(row)}\n`).join(""), { flag: "a" });
    const kept = readPrunedRuns(base);
    if (kept.length > PRUNE_LEDGER_ROWS) {
      const tmp = `${path}.tmp.${process.pid}`;
      writeFileSync(
        tmp,
        kept
          .slice(-PRUNE_LEDGER_ROWS)
          .map((row) => `${JSON.stringify(row)}\n`)
          .join(""),
      );
      renameSync(tmp, path);
    }
  } catch {
    /* the deletions stand and the run's verdict is already published — a ledger write never fails a run */
  }
}
