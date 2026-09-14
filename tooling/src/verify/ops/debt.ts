/**
 * `pnpm debt` → `cli.ts debt` — THE DEBT WALK (#546).
 *
 * A ratchet baseline is DECLARED DEBT, not absence: the single-pass says so in one line
 * (`single-pass: N finding(s) admitted by ratchet baselines (D debt · R ratified)`, lib/render.ts), and
 * that line is a COUNT nobody can triage. This lens enumerates the rows behind it, grouped by owning gate,
 * so "still a live population" becomes claimable board rows on a cadence.
 *
 * SPLIT BY CLASS (#569). Not every admitted row is backlog: a row whose budget a recorded ruling or a
 * documented tool false positive made PERMANENT is RATIFIED, and printing it inside the burnable listing is
 * what made this whole apparatus read as "a glut of backlog" (owner). Each section therefore prints BURNABLE
 * DEBT first — the rows a board row may claim — and lists the ratified rows separately underneath, with the
 * ruling and its cited sites. The class lives in the row itself (`_shared/ratchet-rows.ts`), never here.
 *
 * IT IS A LENS, NOT A GATE — no exit 1, ever. It reads and reports; the gates judge.
 *
 * TWO SOURCES, both read at their ONE home, never re-derived:
 *   • THE LEDGERS — each committed `*.baseline.json`, at the path CONSTANT its owning gate/stage exports.
 *     A rename therefore breaks the import (tsc) instead of silently printing a clean empty listing.
 *   • THE LIVE COUNTS — `reports/check-structure.json`'s `gates[].scan.admitted`, the exact field
 *     `render.ts`/`show.ts` sum for that single-pass line. Never a second gate pass: the doctrine is to
 *     READ the artifact. When it is missing or its run did not finish, this says so and prints NO number
 *     (a fabricated zero here would be the lying-instrument shape this repo keeps paying for).
 *
 * BLINDNESS TRIPWIRE (both directions, GATE-AUTHORING.md §4.4a). The declared table below is reconciled
 * against every `*.baseline.json` discovered under `tooling/src/`: a ledger on disk that this walk does
 * not know is a TOOL ERROR (a new ratchet would otherwise be silently under-reported forever), and a
 * declared row whose file is gone is a TOOL ERROR (the walk would print a short listing that reads clean).
 *
 * DECLARED LIMITS:
 *   • A ledger is a `*.baseline.json` under `tooling/src/`. The committed MANIFESTS are deliberately out
 *     of scope — `baseui-surface.manifest.json` and
 *     `packages/contracts/src/prose/prose-baseline.json` record what EXISTS, not what is ADMITTED.
 *   • A row's BUDGET is the committed allowance, which is what a triage listing wants. It is an upper
 *     bound on what a given run admits (a gate admits `min(budget, live)`); the per-gate LIVE line beside
 *     it is the run's actual admission.
 *   • The LIVE half is only as complete as the gates' own `ctx.scan({ admitted })` declarations, and the
 *     artifact defaults a missing declaration to 0. `liveLine` refuses to read that zero as clean — see it.
 *   • `--age` shells `git log -S<subject>` per row (opt-in because it is one git invocation per row).
 *     A row whose first-appearance commit cannot be resolved prints `age n/a`, never a guess.
 */
import { existsSync, readFileSync } from "node:fs";
import { print, reportsPath, reportsRelPath } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { warn } from "@orb/tooling/_shared/log";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import type { RatchetRow } from "@orb/tooling/_shared/ratchet-rows";
import { classOf, discoverBaselineFiles, formatSplit, readRatchetLedger } from "@orb/tooling/_shared/ratchet-rows";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { LiveAdmission } from "../contract/debt.ts";
import { STRUCTURE_REPORT_NAME } from "../contract/structure-report.ts";
import { BASELINE_REL as DOORS_BASELINE_REL } from "../gates/duplicate-action-doors.ts";
import { BASELINE_REL as CT_UNFED_BASELINE_REL } from "./ct-unfed-ratchet.ts";
import { BASELINE_REL as ORPHAN_BASELINE_REL } from "./orphan-export-ratchet.ts";

refuseDirectInvocation(import.meta.url, "pnpm debt");

/** ONE committed ratchet ledger. `rel` is IMPORTED from the module that owns the baseline — never
 *  re-spelled here, or a rename would leave this walk reading a path nothing writes. */
export interface Ledger {
  readonly owner: string;
  readonly rel: string;
  /** What one row's BUDGET counts, printed beside the number so a reader is never guessing units. */
  readonly unit: string;
  /** What the debt IS and what ends it — the triage context a board row needs. */
  readonly why: string;
}

export const LEDGERS: readonly Ledger[] = [
  // `density-tier` HAD a row here and no longer has a ledger: its per-file count ratchet was deleted with
  // the 2026-09-13 authority migration (#1939), which moved all 22 ratified rows to 44 exact reviewed
  // grants in `lib/reviewed-grants.ts` (57 `density-tier` rows in all, the other 13 being the two retired
  // gate-local path tables). Density debt is no longer a BUDGET this walk can total — an
  // ungranted `(file, act)` pair is a blocking finding with no door, so it shows up as a violation.
  {
    owner: "duplicate-action-doors",
    rel: DOORS_BASELINE_REL,
    unit: "door(s) on the plane",
    why: "one tRPC mutation reachable from N components inside ONE rail section (the §13 more-than-one-home IA class). Ends per pair when the section gets ONE component that owns the verb.",
  },
  // `suppressions` HAD a row here and no longer has a ledger: its per-file count ratchet was deleted with
  // the 2026-09-12 authority migration (#2063), which moved every ruled rule class to an exact reviewed
  // grant in `lib/reviewed-grants.ts`. Suppression debt is no longer a BUDGET this walk can total — an
  // un-granted rule class is a blocking finding with no door, so it shows up as a violation, never as debt.
  {
    owner: "orphan-export-ratchet (push tier)",
    rel: ORPHAN_BASELINE_REL,
    unit: "orphan export",
    why: "the 2026-08-03 export-rot sweep's UNDECIDED rows — the swept tree, NOT a permission slip. Ends per row when the export is consumed, `@public`-tagged, or deleted.",
  },
  {
    owner: "ct-unfed-reads (CT tier)",
    rel: CT_UNFED_BASELINE_REL,
    unit: "unfed (CT file, procedure) pair",
    why: "one CT mount that requests a tRPC procedure nobody stubbed, so the pipeline behind it runs INERT and a regression inside it is invisible to that file (#629/#637). Ends per row when the read is FED at every routeTrpc site in the file and the row is deleted — the ratchet REDs a row whose read is gone, so the shrink cannot be skipped.",
  },
];

interface GateScanView {
  readonly admitted?: number;
}
interface StructureReportView {
  readonly run?: {
    readonly runId: string;
    readonly complete: boolean;
    readonly incompleteReasons?: readonly string[];
    /** #2167 — absent in older artifacts, which predate the axis and are judged on `complete` alone. */
    readonly verdict?: "verdict" | "non-verdict";
    /** The run's OWN words for why it is not a verdict — printed verbatim rather than paraphrased (#2222). */
    readonly nonVerdictReason?: string | null;
  };
  readonly gates?: readonly { readonly name: string; readonly scan?: GateScanView }[];
}

/** The two-sided tripwire (GATE-AUTHORING.md §4.4a). Returns the operator lines for every disagreement
 *  between the declared table and the tree — empty means the walk can see every committed ledger. */
export function reconcileLedgers(declared: readonly Ledger[], discovered: readonly string[]): readonly string[] {
  const problems: string[] = [];
  const known = new Set(declared.map((l) => l.rel));
  for (const rel of discovered) {
    if (!known.has(rel)) {
      problems.push(
        `UNKNOWN LEDGER — ${rel} is a committed ratchet baseline this walk does not enumerate. Its rows are declared debt nobody can triage: add a LEDGERS row in tooling/src/verify/ops/debt.ts (importing the path constant from the module that owns it).`,
      );
    }
  }
  const present = new Set(discovered);
  for (const ledger of declared) {
    if (!present.has(ledger.rel)) {
      problems.push(
        `DEAD LEDGER ROW — ${ledger.owner} declares ${ledger.rel}, which is not on the tree (deleted, renamed or moved). The walk would print a SHORT listing that reads clean: re-point or delete the LEDGERS row in tooling/src/verify/ops/debt.ts.`,
      );
    }
  }
  return problems;
}

/** ONE ledger's rows, biggest budget first (the triage order — the fattest admission is the first row a
 *  burn-down claims). A malformed ledger THROWS via the shared parser: an unparseable debt file must never
 *  read as zero rows. */
export function readLedgerRows(root: string, ledger: Ledger): readonly RatchetRow[] {
  return [...readRatchetLedger(root, ledger.rel).rows].sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject));
}

/** The manifest's own reasons this artifact cannot be read as a live reading, in the order a reader cares
 *  about: DIED, did not reconcile, is not about the real tree. Null when the run may be consumed. Split out
 *  of `liveAdmitted` because three refusals plus two I/O failures is one branch over the complexity cap —
 *  and because these three are the manifest's question while the other two are the file's. */
function manifestRefusal(run: NonNullable<StructureReportView["run"]>): string | null {
  if (!run.complete) {
    // #410: an unfinished run is not a verdict at any exit code.
    return `run ${run.runId} NEVER FINISHED — this is the in-flight stub (#410); it was killed, OOM-aborted or timed out. Re-run \`pnpm check:structure\`.`;
  }
  if ((run.incompleteReasons ?? []).length > 0) {
    return `run ${run.runId} did NOT RECONCILE (#410) — ${(run.incompleteReasons ?? []).join("; ")}`;
  }
  if (run.verdict === "non-verdict") {
    // #2167: a fixture-mode, contaminated or tombstoned run FINISHED — its admitted counts are real numbers
    // about a tree that is not this one. Read as live debt they would silently retarget a burn-down.
    return `run ${run.runId} is a NON-VERDICT (#2167) — ${run.nonVerdictReason ?? "no reason recorded"}`;
  }
  return null;
}

export function liveAdmitted(root: string): LiveAdmission {
  const path = reportsPath(root, STRUCTURE_REPORT_NAME);
  if (!existsSync(path)) {
    return {
      ok: false,
      why: `no ${reportsRelPath(STRUCTURE_REPORT_NAME)} — nothing has published a structure verdict in this checkout. Run \`pnpm check:structure\`.`,
    };
  }
  let report: StructureReportView;
  // The parse failure is the answer this reader returns: `{ ok: false }` carries the unreadable-artifact reason, printed verbatim beside every ledger.
  try {
    report = JSON.parse(readFileSync(path, "utf8")) as StructureReportView;
  } catch (error) {
    return {
      ok: false,
      why: `${reportsRelPath(STRUCTURE_REPORT_NAME)} is UNPARSEABLE — ${error instanceof Error ? error.message : String(error)}. Re-run \`pnpm check:structure\`.`,
    };
  }
  const run = report.run;
  const refusal = run === undefined ? null : manifestRefusal(run);
  if (refusal !== null) {
    return { ok: false, why: refusal };
  }
  const byOwner = new Map<string, number>();
  for (const gate of report.gates ?? []) {
    byOwner.set(gate.name, gate.scan?.admitted ?? 0);
  }
  return { ok: true, runId: run?.runId ?? "(pre-#410 artifact)", byOwner };
}

/** The commit date a row's subject first appeared in its ledger (`git log -S`, oldest match), or null
 *  when git cannot answer — a repo without history, a subject the pickaxe never matched. */
function firstSeen(root: string, ledger: Ledger, subject: string): string | null {
  const res = runNicedSync("git", ["log", "--format=%as", `-S${subject}`, "--", ledger.rel], { cwd: root });
  if (res.status !== 0) {
    return null;
  }
  const lines = res.stdout.split("\n").filter((l) => l.trim() !== "");
  return lines.at(-1) ?? null;
}

interface DebtArgv {
  readonly gate: string | null;
  readonly age: boolean;
}

const USAGE = [
  "usage: pnpm debt [--gate <substr>] [--age]",
  "",
  "THE DEBT WALK — every committed ratchet baseline's ADMITTED rows, grouped by owning gate.",
  "A ratchet baseline is declared debt, not absence: the single-pass prints the COUNT, this prints",
  "the rows behind it so they can become claimable board rows. A LENS — it never exits 1.",
  "",
  "  --gate <substr>   only ledgers whose owner name contains <substr>",
  "  --age             resolve each row's first-appearance commit date (one `git log -S` per row)",
  "  --help, -h        this message",
].join("\n");

function parseArgv(argv: readonly string[]): DebtArgv | "help" {
  if (argv.includes("--help") || argv.includes("-h")) {
    return "help";
  }
  let gate: string | null = null;
  let age = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? "";
    if (token === "--age") {
      age = true;
      continue;
    }
    if (token === "--gate") {
      gate = argv[i + 1] ?? null;
      if (gate === null) {
        throw new UsageError("debt: --gate needs a substring argument");
      }
      i += 1;
      continue;
    }
    throw new UsageError(`debt: unknown argument ${JSON.stringify(token)}\n${USAGE}`);
  }
  return { gate, age };
}

function rowLine(root: string, ledger: Ledger, row: RatchetRow, argv: DebtArgv): string {
  const split = classOf(row) === "mixed" ? ` ${formatSplit(row.debt, row.ratified)}` : "";
  const budget = `[${classOf(row)}] budget ${row.count} ${ledger.unit}${split}`;
  const age = argv.age ? `  ·  first seen ${firstSeen(root, ledger, row.subject) ?? "n/a"}` : "";
  const note = row.why === null ? "" : `\n      why: ${row.why}`;
  const cites = row.cite.length === 0 ? "" : `\n      cites: ${row.cite.join(", ")}`;
  return `    ${row.subject}  ·  ${budget}${age}${note}${cites}`;
}

/** The LIVE half of one ledger's header — and the one place this walk must not read a zero as clean.
 *
 * `gates[].scan.admitted` DEFAULTS to 0 (pass.ts), so a ratchet gate that never calls `ctx.scan({ admitted })`
 * is indistinguishable in the artifact from one that admitted nothing. Measured 2026-08-23: one of the
 * (then seven, now four — `no-hardcoded-model-prose` and `no-test-fabrication` reached terminal `{}` and
 * were DELETED, #578/#590) committed ratchets (suppressions) declares nothing, so the single-pass's own "N
 * admitted by ratchet baselines" line counts only the ones that do. A `live: 0` beside a ledger that still
 * HAS rows is therefore AMBIGUOUS, and this says so with both readings instead of printing the reassuring one.
 */
function liveLine(ledger: Ledger, rowCount: number, live: LiveAdmission): string {
  if (!live.ok) {
    return `unavailable — ${live.why}`;
  }
  const admitted = live.byOwner.get(ledger.owner);
  if (admitted === undefined) {
    return `not in the single-pass artifact — \`${ledger.owner}\` is not a gate the structure run reports (a push-tier stage judges it), so its live admission has no single-pass number`;
  }
  if (admitted === 0 && rowCount > 0) {
    return `0 reported (run ${live.runId}) — AMBIGUOUS, because this ledger still carries ${rowCount} row(s): either the tree stopped earning them (regenerate the shrink) or this gate declares no \`ctx.scan({ admitted })\` and its debt is missing from the single-pass total (GATE-AUTHORING.md §1)`;
  }
  return `${admitted} finding(s) admitted by this ratchet on the last single-pass (run ${live.runId})`;
}

/** What one ledger contributed, summed from exactly what the section PRINTED (never re-derived). */
interface LedgerTotals {
  readonly rows: number;
  readonly debt: number;
  readonly ratified: number;
}

/** ONE ledger's section, SPLIT BY CLASS (#569). The BURNABLE listing comes first — those are the rows a
 *  board row can claim — and the RATIFIED rows are listed separately below it, under a header that says
 *  they are not backlog. A ratified row printed inside the burnable list is the exact misreading the
 *  classification exists to end ("a glut of backlog"), so the two lists never merge. */
function printLedger(root: string, ledger: Ledger, argv: DebtArgv, live: LiveAdmission): LedgerTotals {
  const rows = readLedgerRows(root, ledger);
  const debt = rows.reduce((n, r) => n + r.debt, 0);
  const ratified = rows.reduce((n, r) => n + r.ratified, 0);
  const burnable = rows.filter((r) => r.debt > 0);
  const ruled = rows.filter((r) => r.ratified > 0);
  print("");
  print(`── ${ledger.owner}  ·  ${rows.length} row(s)  ·  ${debt + ratified} ${ledger.unit} budgeted ${formatSplit(debt, ratified)}`);
  print(`   ledger: ${ledger.rel}`);
  print(`   ends:   ${ledger.why}`);
  print(`   live:   ${liveLine(ledger, rows.length, live)}`);
  if (rows.length === 0) {
    print("    (no rows — this ledger is at its terminal state)");
  }
  print(`   BURNABLE DEBT — ${burnable.length} row(s), ${debt} ${ledger.unit}:${burnable.length === 0 ? "  (none — nothing here is claimable backlog)" : ""}`);
  for (const row of burnable) {
    print(rowLine(root, ledger, row, argv));
  }
  if (ruled.length > 0) {
    print(
      `   RATIFIED — ${ruled.length} row(s), ${ratified} ${ledger.unit}: PERMANENT by a recorded ruling / documented tool-FP. NOT backlog; do not claim these.`,
    );
    for (const row of ruled) {
      print(rowLine(root, ledger, row, argv));
    }
  }
  return { rows: rows.length, debt, ratified };
}

/** The `debt` verb — the ratchet-debt triage listing. Exit 0 (a lens) or 2 (the walk is blind). */
export function runDebtWalk(root: string, argv: readonly string[]): number {
  const parsed = parseArgv(argv);
  if (parsed === "help") {
    print(USAGE);
    return EXIT.clean;
  }
  // `__g_` ledgers are a CONCURRENT TEST's transient fixtures (the probe-artifact convention report.ts
  // already honours for findings) — reconciling against one would make this lens exit 2 because another
  // process is mid-run. The `ratchet-row-integrity` gate deliberately DOES judge them: that is its fixture.
  const problems = reconcileLedgers(
    LEDGERS,
    discoverBaselineFiles(root).filter((rel) => !(rel.split("/").at(-1) ?? "").startsWith("__g_")),
  );
  if (problems.length > 0) {
    for (const p of problems) {
      warn(`debt: ${p}`);
    }
    warn("debt: THIS RUN IS NOT A LISTING — the declared ledgers and the tree disagree, so an enumeration here would under-report declared debt.");
    return EXIT.toolError;
  }
  const selected = LEDGERS.filter((l) => parsed.gate === null || l.owner.includes(parsed.gate));
  if (selected.length === 0) {
    throw new UsageError(`debt: --gate ${JSON.stringify(parsed.gate)} matched none of: ${LEDGERS.map((l) => l.owner).join(", ")}`);
  }
  const live = liveAdmitted(root);
  print("DEBT WALK — every committed ratchet baseline's ADMITTED rows, SPLIT into burnable DEBT and ruled-permanent RATIFIED (#569)");
  print(
    live.ok
      ? `live admission: ${reportsRelPath(STRUCTURE_REPORT_NAME)}, run ${live.runId}`
      : `live admission: UNAVAILABLE — ${live.why} Budgets below are the COMMITTED allowance, never a live reading.`,
  );
  let rows = 0;
  let debt = 0;
  let ratified = 0;
  for (const ledger of selected) {
    const section = printLedger(root, ledger, parsed, live);
    rows += section.rows;
    debt += section.debt;
    ratified += section.ratified;
  }
  print("");
  print(
    `TOTAL: ${selected.length} ledger(s)  ·  ${rows} admitted row(s)  ·  ${debt + ratified} finding(s) budgeted ${formatSplit(debt, ratified)} — the DEBT half is the burn-down queue; the RATIFIED half is ruled permanent and is not backlog`,
  );
  return EXIT.clean;
}
