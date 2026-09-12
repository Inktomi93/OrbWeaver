// Generator for the SIZE column of `docs/design/gate-runtime-read-first.md`'s read-list table (#2017).
//
// THE DEFECT IT RETIRES, with its number. That table is a BUDGET — its whole purpose is telling a cold or
// compacted session what the #1584 reading costs BEFORE it commits — and on 2026-09-12 **all eight of its
// sizes were stale**: the law 139→180, the runbook 78→116, the roster 281→356, the audit set 430→536, and
// the work queue by nearly SEVEN TIMES, 25 KB against an actual 172. Two of its row counts were wrong at
// the same time. The file that exists to prevent a context blowout was understating its own set, and it had
// already been hand-repaired once. Hand-measurement is not a fix for this; it is the defect on a timer.
//
// ONLY COLUMN 3 IS GENERATED, keyed by column 1's row id. The Read and Stop-rule columns are authored prose
// that changes for reasons no derivation knows about, and moving them into TypeScript would put the
// document's editorial half behind a regen command — which is how a doc stops being edited. So the
// generator owns exactly the numbers, the doc owns exactly the words, and the row id is the join.
//
// A MEMBER THAT IS GONE THROWS. `pathSetSize` does not treat a missing document as zero bytes, because a
// silently-zero row understates the budget in precisely the direction this whole row is about; the throw
// surfaces through `run-tool` as a TOOL ERROR, never as a freshness verdict.
//
// WHAT IS DERIVED AND WHAT IS NOT. Sizes and file counts, always. Row counts for the two rows whose cost is
// really a ROW COUNT — the work queue's defect rows and the roster's gate rows — because those are the
// figures a session budgets against and both were wrong. NOT derived: §2's corpus partition (`N final / M
// legacy`), which comes from `pnpm check:policy-conformance` and not from any document; it stays authored,
// carries its command, and is named here so the next reader does not assume this generator holds it.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { backtickedIdRows, kib, ledgerSections, pathSetSize, readDoc } from "../../lib/gate-program-docs.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts baseline read-first-costs");

export const READ_FIRST_REL = "docs/design/gate-runtime-read-first.md";

const REVIEWS = "docs/reviews/gate-runtime";
const CONTRACT_DIR = "tooling/src/verify/contract";
const LEDGER_REL = `${REVIEWS}/refutation-ledger-2026-09-12.md`;
const ROSTER_REL = "docs/architecture/core/Core-Enforcement-Active-Gates.md";

/** The FAMILY conversion records: every `…-1584*.md` review plus the three that predate the suffix. Derived
 *  rather than listed so a seventeenth family record prices itself the day it lands. */
function familyRecords(root: string): readonly string[] {
  const extras = new Set(["mixed-runtime-front-door.md", "simple-visitors-a-m.md", "simple-visitors-n-z.md"]);
  return readdirSync(join(root, REVIEWS))
    .filter((name) => (name.includes("-1584") && name.endsWith(".md")) || extras.has(name))
    .toSorted((a, b) => a.localeCompare(b))
    .map((name) => `${REVIEWS}/${name}`);
}

/** The audit waves — the one row the table tells you NOT to read, which is exactly why its price has to be
 *  honest: the number is the argument. */
function auditWaves(root: string): readonly string[] {
  return readdirSync(join(root, REVIEWS))
    .filter((name) => /^v-(audit-wave|exemplar-audit|gate-batch)/.test(name) && name.endsWith(".md"))
    .toSorted((a, b) => a.localeCompare(b))
    .map((name) => `${REVIEWS}/${name}`);
}

function contractModules(root: string): readonly string[] {
  return readdirSync(join(root, CONTRACT_DIR))
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts"))
    .toSorted((a, b) => a.localeCompare(b))
    .map((name) => `${CONTRACT_DIR}/${name}`);
}

/** One row's derivation: its path set, and the extra figure (if any) that IS its real cost. */
interface CostRow {
  readonly paths: (root: string) => readonly string[];
  readonly extra?: (root: string) => string;
}

const COST_ROWS: Readonly<Record<string, CostRow>> = {
  "1": { paths: () => ["docs/design/gate-runtime-standardization.md"] },
  "2": { paths: () => ["docs/design/gate-runtime-orchestrator-playbook.md"] },
  "3": {
    paths: () => [LEDGER_REL],
    extra: (root) => `${ledgerSections(readDoc(root, LEDGER_REL)).reduce((total, section) => total + section.rows, 0)} defect rows`,
  },
  "4": {
    paths: () => [
      `${REVIEWS}/resource-gate-access-patterns.md`,
      `${REVIEWS}/uncovered-gate-conversion-census.md`,
      `${REVIEWS}/exception-authority-census.md`,
      `${REVIEWS}/ordinary-waiver-source-migration.md`,
    ],
  },
  "5": { paths: () => [`${REVIEWS}/shared-semantic-readers.md`, `${REVIEWS}/checkpoint-2026-09-05.md`] },
  "5b": { paths: contractModules },
  "6": { paths: () => [ROSTER_REL], extra: (root) => `${backtickedIdRows(readDoc(root, ROSTER_REL))} rows` },
  "7": { paths: familyRecords },
  "—": { paths: auditWaves },
};

/** Every priced row id, in declaration order — the denominator the freshness arm reports, so a green there
 *  is a measurement over nine rows rather than a bare 1. */
export const READ_FIRST_COST_ROW_IDS: readonly string[] = Object.keys(COST_ROWS);

function sizeCell(root: string, row: CostRow): string {
  const paths = row.paths(root);
  const size = pathSetSize(root, paths);
  const extras = [...(size.files > 1 ? [`${size.files} files`] : []), ...(row.extra === undefined ? [] : [row.extra(root)])];
  return `**${kib(size.bytes)} KB**${extras.length === 0 ? "" : ` · ${extras.join(" · ")}`}`;
}

/** `| id | read | size | stop |` splits on unescaped pipes into `["", id, read, size, stop, ""]` — six
 *  parts, four authored cells. Any other arity is not this table's row and is left untouched. */
const TABLE_CELL_PARTS = 6;
const ID_CELL = 1;
const SIZE_CELL = 3;

/** Split a table row into its cells. Authored `\|` escapes stay inside their cell — the split is on an
 *  UNESCAPED pipe, which is the same rule the roster's own MERGE-BOMB warning is about. */
function cells(line: string): readonly string[] {
  return line.split(/(?<!\\)\|/);
}

/** One priced row, as COMMITTED and as MEASURED. The drift arm names rows rather than reporting a bare
 *  "the cells differ" (#2117): a regeneration on a backed-up copy was the only way to learn WHICH of the
 *  nine had moved, while every sibling row in the same stage names its drifting rows. */
export interface CostRowDrift {
  readonly id: string;
  readonly committed: string;
  readonly derived: string;
}

interface CostDerivation {
  readonly text: string;
  readonly drift: readonly CostRowDrift[];
}

/** The whole document with column 3 of every recognised row replaced, plus the per-row comparison. ONE
 *  producer for the writer and the freshness arm, so the committed file and the verdict cannot disagree
 *  about either the bytes or the reason. */
function deriveCosts(root: string): CostDerivation {
  const text = readFileSync(join(root, READ_FIRST_REL), "utf8");
  const drift: CostRowDrift[] = [];
  let rewritten = 0;
  const lines = text.split("\n").map((line) => {
    const parts = cells(line);
    if (parts.length !== TABLE_CELL_PARTS) {
      return line;
    }
    const id = parts[ID_CELL]?.trim() ?? "";
    const row = COST_ROWS[id];
    if (row === undefined) {
      return line;
    }
    rewritten += 1;
    const derived = ` ${sizeCell(root, row)} `;
    const committed = parts[SIZE_CELL] ?? "";
    if (committed !== derived) {
      drift.push({ id, committed: committed.trim(), derived: derived.trim() });
    }
    return parts.map((cell, index) => (index === SIZE_CELL ? derived : cell)).join("|");
  });
  if (rewritten !== Object.keys(COST_ROWS).length) {
    throw new Error(
      `read-first-costs: rewrote ${rewritten} of ${Object.keys(COST_ROWS).length} declared rows in ${READ_FIRST_REL} — a declared row id is no longer a table row, so the derivation is measuring a table that has moved.`,
    );
  }
  return { text: lines.join("\n"), drift };
}

/** The regenerated document. */
export function deriveReadFirstCosts(root: string): string {
  return deriveCosts(root).text;
}

/** Which priced rows moved, and to what. Empty when the committed table is fresh. */
export function readFirstCostRowDrift(root: string): readonly CostRowDrift[] {
  return deriveCosts(root).drift;
}

export function generateReadFirstCosts(root: string): number {
  writeFileSync(join(root, READ_FIRST_REL), deriveReadFirstCosts(root));
  process.stdout.write(`wrote ${READ_FIRST_REL}\n`);
  return EXIT.clean;
}
