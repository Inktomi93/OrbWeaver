// CLASS ROLLUP and ledger-section drift checkers, extracted from ledgers-fresh.ts.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import type { LedgerFreshness } from "../contract/scoped.ts";
import { ledgerSections, readDoc, reportLedgerRows, strayLedgerSections } from "../lib/gate-program-docs.ts";
import type { ClassRollupRow } from "../lib/gate-program-rollup.ts";
import { committedClassRollup, deriveClassRollup, otherCensusDrift, STATE_BINS } from "../lib/gate-program-rollup.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:ledgers-fresh");

const GATE_REVIEWS_DIR = "docs/reviews/gate-runtime";
const REFUTATION_LEDGER_REL = `${GATE_REVIEWS_DIR}/refutation-ledger-2026-09-12.md`;
const REGEN_CLASS_ROLLUP = "rebuild the `## CLASS ROLLUP` table from the body by the method printed under that heading";

/** ONE LINE PER DIFFERING CELL, both values — the shape `readFirstCostsDrift` uses and for the same
 *  reason: a bare "the rollup differs" makes regenerating on a copy the only way to learn WHICH cell moved.
 *  A bin the committed table has no column for is SKIPPED here and reported once as a schema defect. */
function rowDrift(own: ClassRollupRow | undefined, derived: ClassRollupRow, missingBins: readonly string[]): readonly string[] {
  if (own === undefined) {
    return [`row ${derived.klass}: the rollup has no such row; the body holds ${String(derived.rows)}`];
  }
  const drift = own.rows === derived.rows ? [] : [`cell ${derived.klass}.rows: ${String(own.rows)} → ${String(derived.rows)}`];
  for (const state of STATE_BINS) {
    const before = own.states[state] ?? 0;
    const after = derived.states[state] ?? 0;
    if (!missingBins.includes(state) && before !== after) {
      drift.push(`cell ${derived.klass}.${state}: ${String(before)} → ${String(after)}`);
    }
  }
  return drift;
}

export function classRollupDrift(root: string): LedgerFreshness {
  const text = readDoc(root, REFUTATION_LEDGER_REL);
  const derived = deriveClassRollup(text);
  const committed = committedClassRollup(text);
  const label =
    `${REFUTATION_LEDGER_REL} (CLASS ROLLUP: ${derived.tables} tables · ${derived.total.rows} rows · ` +
    `unbinned ${derived.unbinned.length} · per-table ${derived.perTable.join(",")})`;
  const drift: string[] = [];
  // A table the binner cannot read is the blindness this arm exists for, never a silent skip.
  for (const columns of derived.statelessTables) {
    drift.push(`unreadable  an in-fence table has no \`state\` column, so its rows bin nowhere: header \`${columns.join(" | ")}\``);
  }
  for (const cell of derived.unbinned) {
    drift.push(`unbinned  a state cell bins to none of ${STATE_BINS.join("/")}: ${JSON.stringify(cell)}`);
  }
  if (committed === undefined) {
    drift.push("missing  no `class`-headed rollup table under `## CLASS ROLLUP` — the summary this ledger documents is absent");
    return { ledger: label, regen: REGEN_CLASS_ROLLUP, derived: derived.total.rows, drift };
  }
  // A SHORT SCHEMA IS ITS OWN DEFECT, reported before any cell comparison: a bin with no column cannot
  // disagree with the body, it simply cannot see it, and calling that a cell mismatch would send the
  // reader to fix numbers that are not wrong.
  for (const bin of committed.missingBins) {
    drift.push(`schema  the rollup has no \`${bin}\` column, so every ${bin} row in the body is invisible to it rather than miscounted`);
  }
  const byClass = new Map(committed.rows.map((row) => [row.klass, row]));
  for (const row of [...derived.rows, derived.total]) {
    drift.push(...rowDrift(byClass.get(row.klass), row, committed.missingBins));
  }
  for (const own of committed.rows) {
    if (!(own.klass === "TOTAL" || derived.rows.some((row) => row.klass === own.klass))) {
      drift.push(`row ${own.klass}: the rollup carries a class the body no longer names`);
    }
  }
  drift.push(...otherCensusDrift(text, derived, REFUTATION_LEDGER_REL));
  return { ledger: label, regen: REGEN_CLASS_ROLLUP, derived: derived.total.rows, drift };
}

/** THE REFUTATION LEDGER'S APPENDED SECTIONS versus the verifier reports they came from (#2017).
 *
 *  A verifier report declares its rows in its own `## LEDGER ROWS (N rows)` table and an agent appends that
 *  table into the ledger under a `###` section whose heading CITES the report. Nothing reconciled the two,
 *  so a row dropped in the transcription was silent — and the ledger is the program's work queue.
 *
 *  IT IS NOT A REGENERABLE LEDGER, deliberately, and that is why it has no `baseline` kind. Both sides are
 *  authored: the fix for a mismatch is to append the missing row (or correct the report), never to
 *  overwrite one text from the other — a generator here would let a transcription error rewrite the
 *  evidence it got wrong. `regen` therefore names the ACTION rather than a command, which is a stated
 *  deviation from this stage's other four rows.
 *
 *  THE UNRECONCILED COUNT IS REPORTED, never swallowed. Most ledger sections cite an AUDIT report that
 *  declares no rows of its own (the ten waves are distilled INTO the ledger by their reader), so a bare
 *  "fresh" over the handful that do reconcile would be the same clean-zero this row exists to end. */
export function ledgerSectionDrift(root: string): LedgerFreshness {
  const text = readDoc(root, REFUTATION_LEDGER_REL);
  const sections = ledgerSections(text);
  const drift: string[] = [];
  let reconciled = 0;
  // THE FENCE REPORTS WHAT IT EXCLUDES (#2166). Six real defect rows were appended below `## CLASS ROLLUP`
  // and every instrument that reads this file while sitting inside it was correct-and-blind: the reconciler
  // printed the SAME "11 of 24" before and after. A fence that cannot say what it stopped short of is the
  // false clean this whole row is about, so a ledger-shaped section outside it is now a finding.
  for (const stray of strayLedgerSections(text)) {
    drift.push(
      `stray  ${REFUTATION_LEDGER_REL}:${stray.line} \`### ${stray.heading}\` carries ${stray.rows} ledger row(s) but sits under \`${stray.enclosing}\`, OUTSIDE the \`## THE LEDGER\` fence — no reconciler, no rollup and no row count can see it. Move the section above \`## CLASS ROLLUP\`.`,
    );
  }
  for (const section of sections) {
    const report = section.report;
    if (report === undefined) {
      continue;
    }
    const reportRel = `${GATE_REVIEWS_DIR}/${report}`;
    // Membership is asked, never caught: an absent report is a VERDICT about the ledger (a section citing
    // evidence that is not on the tree), and swallowing the read error would file it as an unreadable
    // report instead — the one distinction this row exists to keep.
    if (!existsSync(join(root, reportRel))) {
      drift.push(`missing ${REFUTATION_LEDGER_REL}:${section.line} cites ${report}, which is not in ${GATE_REVIEWS_DIR}/`);
      continue;
    }
    const table = reportLedgerRows(readDoc(root, reportRel));
    if (table === undefined) {
      continue;
    }
    reconciled += 1;
    if (table.rows !== section.rows) {
      drift.push(
        `rows   ${REFUTATION_LEDGER_REL}:${section.line} carries ${section.rows} row(s); ${report}'s own LEDGER ROWS table declares ${table.rows} — append the missing row(s), or correct the report`,
      );
    }
    if (table.declared !== undefined && table.declared !== table.rows) {
      drift.push(`self   ${report}'s heading says (${table.declared} rows) and its table carries ${table.rows}`);
    }
  }
  return {
    ledger: `${REFUTATION_LEDGER_REL} sections vs their reports (${reconciled} of ${sections.length} IN-FENCE sections reconcilable; the rest cite an audit report that declares no rows)`,
    regen: "append the missing row(s) to the ledger section, or correct the source report — BOTH sides are authored and neither is generated",
    derived: reconciled,
    drift,
  };
}
