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
import { existsSync, readFileSync } from "node:fs";
import { print, reportsPath } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { warn } from "@orb/tooling/_shared/log";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import type { RatchetRow } from "@orb/tooling/_shared/ratchet-rows";
import { classOf, discoverBaselineFiles, formatSplit, readRatchetLedger } from "@orb/tooling/_shared/ratchet-rows";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import { BASELINE_REL as DENSITY_BASELINE_REL } from "../gates/density-tier.ts";
import { BASELINE_REL as DOORS_BASELINE_REL } from "../gates/duplicate-action-doors.ts";
import { BASELINE_REL as PLATE_BASELINE_REL } from "../gates/over-art-plate-arm.ts";
import { BASELINE_REL as SUPPRESSIONS_BASELINE_REL } from "../gates/suppressions.ts";
import { BASELINE_REL as TEST_PRESENCE_BASELINE_REL } from "../gates/test-presence.ts";
import { BASELINE_REL as VARIANT_AXES_BASELINE_REL } from "../gates/ui-variant-axes-stamped.ts";
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
  {
    owner: "density-tier",
    rel: DENSITY_BASELINE_REL,
    unit: "density finding(s)",
    why: "per-file density findings admitted at landing. Ends per file when the surface is re-tiered and the row is regenerated to a shrink.",
  },
  {
    owner: "duplicate-action-doors",
    rel: DOORS_BASELINE_REL,
    unit: "door(s) on the plane",
    why: "one tRPC mutation reachable from N components inside ONE rail section (the §13 more-than-one-home IA class). Ends per pair when the section gets ONE component that owns the verb.",
  },
  {
    owner: "over-art-plate-arm",
    rel: PLATE_BASELINE_REL,
    unit: "unpaired over-art surface(s)",
    why: "a translucent `html[data-blur-*]` surface mixed over `transparent` with no `light-dark()` reading-plate arm (D144(b)). Ends per surface when it takes the plate on the light arm (#237/#623 are the worked fixes) and the row is regenerated to a shrink. TWO of the five at mint are MEASURED failures; three are STRUCTURAL findings pending a framebuffer measurement — each row says which.",
  },
  {
    owner: "test-presence",
    rel: TEST_PRESENCE_BASELINE_REL,
    unit: "untested domain-logic file",
    why: "a domain file with runtime logic (substrate/, a named subsystem, guard.ts, a contract/ file carrying real logic) that the #767 demand-by-default widening newly demands and the tree does not yet test. Burn-down is board row 772, one family at a time; ends per file when its mirror .test/.int.test lands and the shrink is regenerated.",
  },
  {
    owner: "ui-variant-axes-stamped",
    rel: VARIANT_AXES_BASELINE_REL,
    unit: "unstamped @orb/ui recipe",
    why: "a `tv()` recipe declaring a stamped axis (variant/size/intent/tone) whose element does not yet emit it, so the ui-audit walker cannot tell two of its authored arms apart (#1080 F8). Tranche 1 landed the seam + four pilots; the package-wide sweep is tranche 2. Ends per recipe when it routes through `variantProps`/`variantAttrs` and the shrink is regenerated.",
  },
  {
    owner: "suppressions",
    rel: SUPPRESSIONS_BASELINE_REL,
    unit: "suppression marker(s)",
    why: "committed lint/type suppressions per file, source AND tests (#962). Ends per file when the underlying diagnostic is fixed and the shrink is regenerated; a test row under a rule RATIFIED_TEST_RULES does not list is the burnable half.",
  },
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

/** The artifact the single-pass writes — the ONE source of the LIVE admitted counts (never a re-run). */
const STRUCTURE_REPORT = "check-structure.json";

interface GateScanView {
  readonly admitted?: number;
}
interface StructureReportView {
  readonly run?: { readonly runId: string; readonly complete: boolean; readonly incompleteReasons?: readonly string[] };
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

/** The per-gate LIVE admission from the single-pass artifact, or null when there is no consumable one.
 *  Null is printed as "unavailable" WITH its reason — never as zeros. */
function liveAdmitted(root: string): { readonly runId: string; readonly byOwner: ReadonlyMap<string, number> } | null {
  const path = reportsPath(root, STRUCTURE_REPORT);
  if (!existsSync(path)) {
    return null;
  }
  let report: StructureReportView;
  // @orb-waive caught-failure-ownership(catch): returns null, which the doc comment above says is printed as "unavailable" WITH its reason — never as zeros. Ends if a caller starts treating null as zero admissions.
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
function printLedger(root: string, ledger: Ledger, argv: DebtArgv, live: ReturnType<typeof liveAdmitted>): LedgerTotals {
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
    live === null
      ? "live admission: UNAVAILABLE — no consumable reports/check-structure.json (missing, malformed, or from a run that did not finish). Budgets below are the COMMITTED allowance; run `pnpm check:structure` for the live half."
      : `live admission: reports/check-structure.json, run ${live.runId}`,
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
