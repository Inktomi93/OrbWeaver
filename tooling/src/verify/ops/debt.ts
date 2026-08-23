/**
 * `pnpm debt` → `cli.ts debt` — THE DEBT WALK (#546).
 *
 * A ratchet baseline is DECLARED DEBT, not absence: the single-pass says so in one line
 * (`single-pass: N finding(s) admitted by ratchet baselines — declared debt, still a live population`,
 * lib/render.ts), and that line is a COUNT nobody can triage. This lens enumerates the rows behind it,
 * grouped by owning gate, so "still a live population" becomes claimable board rows on a cadence.
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
 *     of scope — `docs/test-baseline/manifest.json`, `baseui-surface.manifest.json` and
 *     `packages/contracts/src/prose/prose-baseline.json` record what EXISTS, not what is ADMITTED.
 *   • A row's BUDGET is the committed allowance, which is what a triage listing wants. It is an upper
 *     bound on what a given run admits (a gate admits `min(budget, live)`); the per-gate LIVE line beside
 *     it is the run's actual admission.
 *   • The LIVE half is only as complete as the gates' own `ctx.scan({ admitted })` declarations, and the
 *     artifact defaults a missing declaration to 0. `liveLine` refuses to read that zero as clean — see it.
 *   • `--age` shells `git log -S<subject>` per row (opt-in because it is one git invocation per row).
 *     A row whose first-appearance commit cannot be resolved prints `age n/a`, never a guess.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { print, reportsPath } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { warn } from "@orb/tooling/_shared/log";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import { BASELINE_REL as DENSITY_BASELINE_REL } from "../gates/density-tier.ts";
import { BASELINE_REL as DOORS_BASELINE_REL } from "../gates/duplicate-action-doors.ts";
import { BASELINE_REL as MODEL_PROSE_BASELINE_REL } from "../gates/no-hardcoded-model-prose.ts";
import { BASELINE_REL as FABRICATION_BASELINE_REL } from "../gates/no-test-fabrication.ts";
import { BASELINE_REL as SUPPRESSIONS_BASELINE_REL } from "../gates/suppressions.ts";
import { BASELINE_REL as ORPHAN_BASELINE_REL } from "./orphan-export-ratchet.ts";

refuseDirectInvocation(import.meta.url, "pnpm debt");

/** How a ledger file spells its rows. `budget-map` = subject → allowed count; `entries-map` = the
 *  orphan ratchet's `{ note, entries: { subject: reason } }` envelope. A Record dispatch, so a third
 *  shape is a row tsc forces every reader to handle (GATE-AUTHORING.md §7). */
type LedgerShape = "budget-map" | "entries-map";

/** ONE admitted row: what it names, the committed allowance (null when the ledger budgets nothing but
 *  membership), and the row's own reason where the ledger carries one. */
interface DebtRow {
  readonly subject: string;
  readonly budget: number | null;
  readonly note: string | null;
}

/** ONE committed ratchet ledger. `rel` is IMPORTED from the module that owns the baseline — never
 *  re-spelled here, or a rename would leave this walk reading a path nothing writes. */
export interface Ledger {
  readonly owner: string;
  readonly rel: string;
  readonly shape: LedgerShape;
  /** What one row's BUDGET counts, printed beside the number so a reader is never guessing units. */
  readonly unit: string;
  /** What the debt IS and what ends it — the triage context a board row needs. */
  readonly why: string;
}

export const LEDGERS: readonly Ledger[] = [
  {
    owner: "density-tier",
    rel: DENSITY_BASELINE_REL,
    shape: "budget-map",
    unit: "density finding(s)",
    why: "per-file density findings admitted at landing. Ends per file when the surface is re-tiered and the row is regenerated to a shrink.",
  },
  {
    owner: "duplicate-action-doors",
    rel: DOORS_BASELINE_REL,
    shape: "budget-map",
    unit: "door(s) on the plane",
    why: "one tRPC mutation reachable from N components inside ONE rail section (the §13 more-than-one-home IA class). Ends per pair when the section gets ONE component that owns the verb.",
  },
  {
    owner: "no-hardcoded-model-prose",
    rel: MODEL_PROSE_BASELINE_REL,
    shape: "budget-map",
    unit: "hardcoded prose site(s)",
    why: "model-facing prose spelled in code instead of the prose slots. Ends per file when the strings move to their slot home.",
  },
  {
    owner: "no-test-fabrication",
    rel: FABRICATION_BASELINE_REL,
    shape: "budget-map",
    unit: "fabricated value(s)",
    why: "test-side fabrication admitted at landing. Ends per test file when the fabricated values become factory/fixture-derived.",
  },
  {
    owner: "suppressions",
    rel: SUPPRESSIONS_BASELINE_REL,
    shape: "budget-map",
    unit: "suppression marker(s)",
    why: "committed lint/gate suppressions per file. Ends per file when the underlying diagnostic is fixed and the shrink is regenerated.",
  },
  {
    owner: "orphan-export-ratchet (push tier)",
    rel: ORPHAN_BASELINE_REL,
    shape: "entries-map",
    unit: "orphan export",
    why: "the 2026-08-03 export-rot sweep's UNDECIDED rows — the swept tree, NOT a permission slip. Ends per row when the export is consumed, `@public`-tagged, or deleted.",
  },
];

const BASELINE_SUFFIX = ".baseline.json";
const TOOLING_SRC = "tooling/src";
const SKIP_DIRS = new Set(["node_modules", "dist"]);
/** The artifact the single-pass writes — the ONE source of the LIVE admitted counts (never a re-run). */
const STRUCTURE_REPORT = "check-structure.json";

interface GateScanView {
  readonly admitted?: number;
}
interface StructureReportView {
  readonly run?: { readonly runId: string; readonly complete: boolean; readonly incompleteReasons?: readonly string[] };
  readonly gates?: readonly { readonly name: string; readonly scan?: GateScanView }[];
}

/** Every `*.baseline.json` actually on disk under `tooling/src/`, repo-relative — the reconciliation's
 *  right-hand side. Derived from the filesystem on purpose: a table can only report what it was told. */
export function discoverBaselineFiles(root: string): readonly string[] {
  const out: string[] = [];
  if (!existsSync(join(root, TOOLING_SRC))) {
    // Not a repo root. Returning [] rather than throwing keeps the verdict where it belongs: every
    // declared ledger then reads as DEAD in `reconcileLedgers`, which refuses the run loudly.
    return out;
  }
  const walk = (rel: string): void => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) {
          walk(`${rel}/${e.name}`);
        }
        continue;
      }
      if (e.name.endsWith(BASELINE_SUFFIX)) {
        out.push(`${rel}/${e.name}`);
      }
    }
  };
  walk(TOOLING_SRC);
  return out.sort((a, b) => a.localeCompare(b));
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

const ROW_READERS: Readonly<Record<LedgerShape, (raw: unknown) => readonly DebtRow[]>> = {
  "budget-map": (raw) => Object.entries(raw as Readonly<Record<string, number>>).map(([subject, budget]) => ({ subject, budget, note: null })),
  "entries-map": (raw) =>
    Object.entries((raw as { readonly entries?: Readonly<Record<string, string>> }).entries ?? {}).map(([subject, note]) => ({
      subject,
      budget: null,
      note,
    })),
};

/** ONE ledger's rows, biggest budget first (the triage order — the fattest admission is the first row a
 *  burn-down claims). A malformed ledger THROWS: an unparseable debt file must never read as zero rows. */
export function readLedgerRows(root: string, ledger: Ledger): readonly DebtRow[] {
  const path = join(root, ledger.rel);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new Error(`debt: ${ledger.rel} is unreadable or malformed — a debt ledger that cannot be parsed must never report zero rows`, { cause });
  }
  const rows = ROW_READERS[ledger.shape](parsed);
  return [...rows].sort((a, b) => (b.budget ?? 0) - (a.budget ?? 0) || a.subject.localeCompare(b.subject));
}

/** The per-gate LIVE admission from the single-pass artifact, or null when there is no consumable one.
 *  Null is printed as "unavailable" WITH its reason — never as zeros. */
function liveAdmitted(root: string): { readonly runId: string; readonly byOwner: ReadonlyMap<string, number> } | null {
  const path = reportsPath(root, STRUCTURE_REPORT);
  if (!existsSync(path)) {
    return null;
  }
  let report: StructureReportView;
  try {
    report = JSON.parse(readFileSync(path, "utf8")) as StructureReportView;
  } catch {
    return null;
  }
  const run = report.run;
  if (run !== undefined && (!run.complete || (run.incompleteReasons ?? []).length > 0)) {
    return null; // #410: an unfinished run is not a verdict at any exit code
  }
  const byOwner = new Map<string, number>();
  for (const gate of report.gates ?? []) {
    byOwner.set(gate.name, gate.scan?.admitted ?? 0);
  }
  return { runId: run?.runId ?? "(pre-#410 artifact)", byOwner };
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

function rowLine(root: string, ledger: Ledger, row: DebtRow, argv: DebtArgv): string {
  const budget = row.budget === null ? "admitted" : `budget ${row.budget} ${ledger.unit}`;
  const age = argv.age ? `  ·  first seen ${firstSeen(root, ledger, row.subject) ?? "n/a"}` : "";
  const note = row.note === null ? "" : `\n      why: ${row.note}`;
  return `    ${row.subject}  ·  ${budget}${age}${note}`;
}

/** The LIVE half of one ledger's header — and the one place this walk must not read a zero as clean.
 *
 * `gates[].scan.admitted` DEFAULTS to 0 (pass.ts), so a ratchet gate that never calls `ctx.scan({ admitted })`
 * is indistinguishable in the artifact from one that admitted nothing. Measured 2026-08-23: three of the
 * seven committed ratchets (suppressions, no-test-fabrication, no-hardcoded-model-prose — 523 budgeted
 * findings between them) declare nothing, so the single-pass's own "N admitted by ratchet baselines" line
 * counts only the three that do. A `live: 0` beside a ledger that still HAS rows is therefore AMBIGUOUS,
 * and this says so with both readings instead of printing the reassuring one.
 */
function liveLine(ledger: Ledger, rowCount: number, live: ReturnType<typeof liveAdmitted>): string {
  if (live === null) {
    return "unavailable — no consumable reports/check-structure.json (run `pnpm check:structure`)";
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

/** ONE ledger's section. Returns its row count + budgeted total so the walk's own totals are summed from
 *  exactly what it printed, never re-derived. */
function printLedger(root: string, ledger: Ledger, argv: DebtArgv, live: ReturnType<typeof liveAdmitted>): { rows: number; budgeted: number } {
  const rows = readLedgerRows(root, ledger);
  const budgeted = rows.reduce((n, r) => n + (r.budget ?? 1), 0);
  print("");
  print(`── ${ledger.owner}  ·  ${rows.length} row(s)  ·  ${budgeted} ${ledger.unit} budgeted`);
  print(`   ledger: ${ledger.rel}`);
  print(`   ends:   ${ledger.why}`);
  print(`   live:   ${liveLine(ledger, rows.length, live)}`);
  if (rows.length === 0) {
    print("    (no rows — this ledger is at its terminal state)");
  }
  for (const row of rows) {
    print(rowLine(root, ledger, row, argv));
  }
  return { rows: rows.length, budgeted };
}

/** The `debt` verb — the ratchet-debt triage listing. Exit 0 (a lens) or 2 (the walk is blind). */
export function runDebtWalk(root: string, argv: readonly string[]): number {
  const parsed = parseArgv(argv);
  if (parsed === "help") {
    print(USAGE);
    return EXIT.clean;
  }
  const problems = reconcileLedgers(LEDGERS, discoverBaselineFiles(root));
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
  print("DEBT WALK — every committed ratchet baseline's ADMITTED rows (declared debt, still a live population)");
  print(
    live === null
      ? "live admission: UNAVAILABLE — no consumable reports/check-structure.json (missing, malformed, or from a run that did not finish). Budgets below are the COMMITTED allowance; run `pnpm check:structure` for the live half."
      : `live admission: reports/check-structure.json, run ${live.runId}`,
  );
  let rows = 0;
  let budgeted = 0;
  for (const ledger of selected) {
    const section = printLedger(root, ledger, parsed, live);
    rows += section.rows;
    budgeted += section.budgeted;
  }
  print("");
  print(`TOTAL: ${selected.length} ledger(s)  ·  ${rows} admitted row(s)  ·  ${budgeted} finding(s) budgeted`);
  return EXIT.clean;
}
