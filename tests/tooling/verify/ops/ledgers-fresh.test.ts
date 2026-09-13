// The PERMANENT PIN for the `ledgers:fresh` stage (#817). What it defends, and why each arm exists:
//
//   RED-FIRST, on the UNMODIFIED source: a stale committed ledger was invisible to `pnpm check`. At HEAD
//   the ONLY consumer of docs/reviews/caught-failure-ownership/population.json was
//   tests/tooling/verify/gates/caught-failure-ownership.repo.int.test.ts — a `.repo.int.test.ts`, i.e. the
//   `integration` vitest project, which `pnpm check` never runs (it is the STATIC tier). So main could sit
//   re-staled by a merge for hours with a green commit bar, three times in one night (2026-08-30).
//
//   The comparators are PURE (committed, derived) → LedgerFreshness, so these arms cost milliseconds and
//   the expensive halves are exercised where they belong: the census derivation keeps its bijection proof
//   in the int suite above (~19s of ts-morph), and the manifest derivation runs for real HERE (git
//   ls-files, milliseconds) as the real-tree green + the blindness control.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CaughtFailurePopulation, CaughtFailureRow } from "@orb/tooling/verify";
import {
  BASELINE_HELP,
  censusDrift,
  classRollupDrift,
  committedOtherClassCensus,
  deferredRosterDrift,
  deriveClassRollup,
  deriveReadFirstCosts,
  deriveSnapFlagsIndexMarkdown,
  LEDGER_CHECKS,
  ledgerReport,
  ledgerSectionDrift,
  ledgerSections,
  READ_FIRST_REL,
  REGISTRY,
  readFirstCostsDrift,
  resolveSelection,
  runBaseline,
  SNAP_FLAGS_INDEX_REL,
  snapFlagsIndexDrift,
  strayLedgerSections,
  typeConfigsDrift,
} from "@orb/tooling/verify";
import { expect, test } from "../../../support/tool-fixtures.ts";

const STAGE = "ledgers:fresh";

function row(overrides: Partial<CaughtFailureRow> = {}): CaughtFailureRow {
  return {
    siteId: "packages/server/src/x.ts::empty:catch::1",
    path: "packages/server/src/x.ts",
    line: 41,
    column: 3,
    grammar: "empty",
    position: "empty:catch",
    ordinal: 1,
    snippet: "} catch {",
    verdict: "unproven",
    reason: null,
    markerLine: null,
    ...overrides,
  };
}

function census(rows: readonly CaughtFailureRow[]): CaughtFailurePopulation {
  const byGrammar: Record<string, number> = {};
  for (const r of rows) {
    byGrammar[r.grammar] = (byGrammar[r.grammar] ?? 0) + 1;
  }
  return {
    gate: "caught-failure-ownership",
    generatedBy: "tooling/src/verify/ops/gen/caught-failure-population.ts",
    totals: {
      sites: rows.length,
      reported: rows.filter((r) => r.verdict === "unproven").length,
      byVerdict: { "deliberate-absorb": 0, unproven: rows.filter((r) => r.verdict === "unproven").length },
      byGrammar,
    },
    rows,
  };
}

test("a census row whose site MOVED reds, naming the row and both line numbers", () => {
  // The exact failure mode: a merge inserted five lines above the marker, so the site is the same site and
  // only `line` moved. A comparison by identity-set alone would call this "one gone, one new" and bury the
  // cause; the stage must say `line 41 → 46` on the row that moved.
  const result = censusDrift(census([row()]), census([row({ line: 46 })]));

  expect(result.drift).toHaveLength(1);
  expect(result.drift[0]).toContain("packages/server/src/x.ts::empty:catch::1");
  expect(result.drift[0]).toContain("line 41 → 46");
  expect(result.regen).toContain("baseline caught-failure-population");
});

test("a marker line shift reds too — markerLine is the other line-number-coupled field", () => {
  const committed = row({ verdict: "deliberate-absorb", reason: "the door", markerLine: 39 });
  const drift = censusDrift(census([committed]), census([{ ...committed, markerLine: 44 }])).drift;

  expect(drift.join("\n")).toContain("markerLine 39 → 44");
});

test("a site that appeared and a site that vanished are BOTH drift, and are distinguished", () => {
  const committed = census([row(), row({ siteId: "a::empty:catch::1", path: "a" })]);
  const derived = census([row(), row({ siteId: "b::empty:catch::1", path: "b" })]);

  const drift = censusDrift(committed, derived).drift.join("\n");
  expect(drift).toContain("gone   a::empty:catch::1");
  expect(drift).toContain("new    b::empty:catch::1");
});

test("an unchanged census is FRESH — the green arm cannot be a test that always passes", () => {
  expect(censusDrift(census([row()]), census([row()])).drift).toEqual([]);
});

test("a hand-edited TOTAL reds even when every row agrees (the census is derived, never declared)", () => {
  const derived = census([row()]);
  const handEdited: CaughtFailurePopulation = { ...derived, totals: { ...derived.totals, reported: 0 } };

  expect(censusDrift(handEdited, derived).drift.join("\n")).toContain("totals");
});

test("a derivation that comes back EMPTY is a TOOL ERROR (exit 2), never a fresh ledger", () => {
  // Two empty sides would "agree" forever. The tripwire is the blindness class the house calls a lying
  // instrument: a bare zero means "I could not measure", never "there is nothing there".
  const root = mkdtempSync(join(tmpdir(), "orb-ledgers-fresh-"));
  try {
    mkdirSync(join(root, "docs", "reviews", "caught-failure-ownership"), { recursive: true });
    writeFileSync(
      join(root, "docs", "reviews", "caught-failure-ownership", "population.json"),
      JSON.stringify({ gate: "x", generatedBy: "x", totals: {}, rows: [] }),
    );
    execFileSync("git", ["init", "-q"], { cwd: root });

    const check = LEDGER_CHECKS["caught-failure-population"];
    expect(check).toBeDefined();
    expect(check?.(root)).toBe(2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── the registry contract: complete populations at whole tiers and selected-path triggers ──

test("the stage runs at every whole-tree tier and uses its complete argv for selected paths", () => {
  const stage = REGISTRY.find((entry) => entry.name === STAGE);
  expect(stage, `${STAGE} must be registered`).toBeDefined();
  expect(stage?.tiers).toEqual(["changed", "static", "push", "full"]);
  expect(stage?.argv).toEqual(["pnpm", "check:ledgers-fresh"]);
  // #2304's identity trigger changes when the stage runs, never the population it derives.
  const selection = resolveSelection({ kind: "file", paths: ["README.md"] });
  expect(stage?.scopedArgv?.(selection)).toEqual(stage?.argv);
});

test("a stale ledger never suppresses its sibling's verdict from the same run", () => {
  // The regression this pins was LIVE on the stage's first run: `results.every(report)` short-circuits at
  // the first false, so the manifest's drift printed and the census was never reported at all — a run that
  // silently judged one of the two things it exists to judge.
  const lines = ledgerReport([
    { ledger: "docs/a-stale-ledger.json", regen: "regenerate it", derived: 1, drift: ["new    something"] },
    censusDrift(census([row()]), census([row()])),
  ]).join("\n");

  expect(lines).toContain("STALE  docs/a-stale-ledger.json");
  expect(lines).toContain("fresh  docs/reviews/caught-failure-ownership/population.json");
});

test("baseline help derives every available freshness kind from the dispatch registry", () => {
  for (const kind of Object.keys(LEDGER_CHECKS)) {
    expect(BASELINE_HELP).toContain(kind);
  }
});

test("generated type-config drift names the exact changed file and writer", async ({ repoRoot }) => {
  const result = typeConfigsDrift(repoRoot);
  expect(result.drift).toEqual([]);
  expect(result.regen).toContain("baseline type-configs");
  expect(await runBaseline(repoRoot, ["type-configs", "--check"])).toBe(0);
  expect(result.derived).toBeGreaterThan(10);
});

// ── the third ledger: the generated snap flag index (#1329) ──

test("a MISSING generated flag index is drift that names the regen command", () => {
  const result = snapFlagsIndexDrift("/nonexistent-orb-ledgers-fresh-root");
  expect(result.ledger).toBe(SNAP_FLAGS_INDEX_REL);
  expect(result.drift.join("\n")).toContain("baseline snap-flags-index");
});

test("the committed flag index matches a fresh derivation of THIS tree", ({ repoRoot }) => {
  // On-disk, not `git show HEAD:` — the same freshness question `snapFlagsIndexDrift` asks (it reads the
  // working tree via `existsSync`/`readFileSync`), and a lane's own regen has not been committed yet when
  // this pin first runs (this file is itself part of that commit).
  const derived = deriveSnapFlagsIndexMarkdown();
  const committed = readFileSync(join(repoRoot, SNAP_FLAGS_INDEX_REL), "utf8");
  expect(committed).toBe(derived);
});

test("a planted stale flag index reds naming the regen command", () => {
  const root = mkdtempSync(join(tmpdir(), "orb-ledgers-fresh-snap-flags-"));
  try {
    mkdirSync(join(root, ".claude", "skills", "snap-driving", "reference"), { recursive: true });
    writeFileSync(join(root, SNAP_FLAGS_INDEX_REL), "stale content, not a fresh derivation\n");
    const result = snapFlagsIndexDrift(root);
    expect(result.drift).not.toEqual([]);
    expect(result.regen).toBe("pnpm exec node tooling/src/verify/cli.ts baseline snap-flags-index");
    const check = LEDGER_CHECKS["snap-flags-index"];
    expect(check?.(root)).toBe(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ─── #2017: the two rows that hold a #1584 PROGRAM DOC's derivable numbers ───────────────────────────
//
// Both were added because a hand-authored number in a law doc is wrong between re-measurements. The
// read-first cost table had ALL EIGHT sizes stale at once (the work queue by 7x), and nothing at all
// reconciled a refutation-ledger section against the verifier report its rows were transcribed from.
//
// EVERY ARM BELOW IS A PLANTED CONTROL IN A TEMP ROOT. Neither derivation may be exercised by writing into
// the real tree: `check:structure` reads the working tree while a planting suite writes it, and an
// overlapped structure run is a NON-VERDICT that looks exactly like a real number (#2069, 2026-09-12).

/** A temp repo carrying every path the cost table prices, at KNOWN sizes, so a derived cell is a
 *  MEASUREMENT rather than an echo. `filler(n)` is exactly n bytes. */
function costTableRoot(): { root: string; expected: Record<string, number> } {
  const root = mkdtempSync(join(tmpdir(), "orb-read-first-costs-"));
  const filler = (bytes: number): string => "x".repeat(bytes);
  const write = (rel: string, bytes: number): void => {
    mkdirSync(join(root, rel.slice(0, rel.lastIndexOf("/"))), { recursive: true });
    writeFileSync(join(root, rel), filler(bytes));
  };
  const Kib = 1024;
  write("docs/design/gate-runtime-standardization.md", 4 * Kib);
  write("docs/design/gate-runtime-orchestrator-playbook.md", 2 * Kib);
  write("docs/reviews/gate-runtime/resource-gate-access-patterns.md", Kib);
  write("docs/reviews/gate-runtime/uncovered-gate-conversion-census.md", Kib);
  write("docs/reviews/gate-runtime/exception-authority-census.md", Kib);
  write("docs/reviews/gate-runtime/ordinary-waiver-source-migration.md", Kib);
  write("docs/reviews/gate-runtime/shared-semantic-readers.md", Kib);
  write("docs/reviews/gate-runtime/checkpoint-2026-09-05.md", Kib);
  write("docs/reviews/gate-runtime/bus-family-1584.md", 3 * Kib);
  write("docs/reviews/gate-runtime/mixed-runtime-front-door.md", 3 * Kib);
  write("docs/reviews/gate-runtime/v-audit-wave2-2026-09-12.md", 5 * Kib);
  write("docs/reviews/gate-runtime/v-gate-batch-2026-09-12.md", 5 * Kib);
  write("tooling/src/verify/contract/policy.ts", 8 * Kib);
  mkdirSync(join(root, "docs/architecture/core"), { recursive: true });
  writeFileSync(
    join(root, "docs/architecture/core/Core-Enforcement-Active-Gates.md"),
    ["| Gate | Enforces |", "| - | - |", "| `alpha-gate` | does a thing |", "| `beta-gate` | does another |", ""].join("\n"),
  );
  writeFileSync(
    join(root, "docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md"),
    ["## THE LEDGER", "", "### Wave 1 (`v-audit-wave2-2026-09-12.md`)", "", "| module | defect |", "| - | - |", "| `a` | x |", ""].join("\n"),
  );
  return { root, expected: { "1": 4, "2": 2, "4": 4, "5": 2, "6": 8 } };
}

const READ_FIRST_ROWS = [
  "| # | Read | Size | Stop rule |",
  "| -: | - | -: | - |",
  "| 1 | the LAW | **999 KB** | in full |",
  "| 2 | the runbook | **999 KB** | in full |",
  "| 3 | the queue | **999 KB** | in full |",
  "| 4 | the four | **999 KB** | in full |",
  "| 5 | the pair | **999 KB** | in full |",
  "| 5b | the headers | **999 KB** | read them |",
  "| 6 | the roster | **999 KB** | by row |",
  "| 7 | the families | **999 KB** | the one |",
  "| — | the waves | **999 KB** | do not read |",
  "",
];

test("the cost table's SIZE cells are MEASURED — planted bytes come back as the printed KB", () => {
  const { root, expected } = costTableRoot();
  try {
    mkdirSync(join(root, "docs/design"), { recursive: true });
    writeFileSync(join(root, READ_FIRST_REL), READ_FIRST_ROWS.join("\n"));
    const derived = deriveReadFirstCosts(root).split("\n");
    // Row 1 prices one 4 KiB file; row 4 prices four 1 KiB files and must SAY so; row 6 carries the
    // roster's own derived ROW COUNT, which is the figure that was wrong in the real table.
    expect(derived[2]).toContain(`**${expected["1"]} KB**`);
    expect(derived[5]).toContain(`**${expected["4"]} KB** · 4 files`);
    expect(derived[8]).toContain("· 2 rows");
    // Row 3 carries the ledger's derived DEFECT-ROW count, the other figure that was wrong.
    expect(derived[4]).toContain("· 1 defect rows");
    // Every 999 placeholder is gone: a row the derivation failed to reach would still read 999.
    expect(derived.join("\n")).not.toContain("999 KB");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a declared cost row that is no longer a table row REFUSES rather than pricing what is left", () => {
  const { root } = costTableRoot();
  try {
    writeFileSync(join(root, READ_FIRST_REL), READ_FIRST_ROWS.filter((line) => !line.startsWith("| 5b |")).join("\n"));
    // A tool error, never a freshness verdict: the table moved, so every number this run produced is
    // about a document shape the derivation no longer understands.
    expect(() => deriveReadFirstCosts(root)).toThrow(/rewrote 8 of 9 declared rows/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stale SIZE cell reds through the per-ledger door", () => {
  const { root } = costTableRoot();
  try {
    writeFileSync(join(root, READ_FIRST_REL), READ_FIRST_ROWS.join("\n"));
    expect(readFirstCostsDrift(root).drift).not.toEqual([]);
    expect(LEDGER_CHECKS["read-first-costs"]?.(root)).toBe(1);
    writeFileSync(join(root, READ_FIRST_REL), deriveReadFirstCosts(root));
    expect(readFirstCostsDrift(root).drift).toEqual([]);
    expect(LEDGER_CHECKS["read-first-costs"]?.(root)).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** A temp repo whose ledger carries three sections: one reconciling, one short by a row, and one citing an
 *  AUDIT report that declares no rows of its own. */
function ledgerSectionRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "orb-ledger-sections-"));
  const dir = join(root, "docs/reviews/gate-runtime");
  mkdirSync(dir, { recursive: true });
  const table = (count: number): readonly string[] => ["| module | defect |", "| - | - |", ...Array.from({ length: count }, (_v, i) => `| \`m${i}\` | x |`)];
  writeFileSync(join(dir, "v-good-2026-09-12.md"), ["## LEDGER ROWS (2 rows)", "", ...table(2), ""].join("\n"));
  writeFileSync(join(dir, "v-short-2026-09-12.md"), ["## LEDGER ROWS", "", ...table(3), ""].join("\n"));
  writeFileSync(join(dir, "v-audit-wave9-2026-09-12.md"), ["## FINDINGS", "", ...table(4), ""].join("\n"));
  writeFileSync(
    join(dir, "refutation-ledger-2026-09-12.md"),
    [
      "## THE LEDGER",
      "",
      "### good (`v-good-2026-09-12.md`)",
      "",
      ...table(2),
      "",
      "### short (`v-short-2026-09-12.md`)",
      "",
      ...table(2),
      "",
      "### wave (`v-audit-wave9-2026-09-12.md`)",
      "",
      ...table(4),
      "",
      "## CLASS ROLLUP",
      "",
      ...table(7),
      "",
    ].join("\n"),
  );
  return root;
}

test("a ledger section short of its report's own LEDGER ROWS table is named, with both counts", () => {
  const root = ledgerSectionRoot();
  try {
    const result = ledgerSectionDrift(root);
    expect(result.drift).toHaveLength(1);
    expect(result.drift[0]).toContain("carries 2 row(s)");
    expect(result.drift[0]).toContain("declares 3");
    // The rollup table AFTER `## THE LEDGER` must not be counted as a section's defect rows, and the audit
    // section must be reported as UNRECONCILABLE rather than silently passing: 2 of 3.
    expect(result.derived).toBe(2);
    expect(result.ledger).toContain("2 of 3 IN-FENCE sections reconcilable");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a report whose heading count disagrees with its own table is named separately", () => {
  const root = ledgerSectionRoot();
  try {
    const dir = join(root, "docs/reviews/gate-runtime");
    writeFileSync(
      join(dir, "v-good-2026-09-12.md"),
      ["## LEDGER ROWS (9 rows)", "", "| module | defect |", "| - | - |", "| `m0` | x |", "| `m1` | x |", ""].join("\n"),
    );
    const result = ledgerSectionDrift(root);
    expect(result.drift.join("\n")).toContain("heading says (9 rows) and its table carries 2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a ledger section citing a report that is not on the tree is drift, never a silent skip", () => {
  const root = ledgerSectionRoot();
  try {
    rmSync(join(root, "docs/reviews/gate-runtime/v-short-2026-09-12.md"));
    expect(ledgerSectionDrift(root).drift.join("\n")).toContain("which is not in docs/reviews/gate-runtime/");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed refutation ledger agrees with every report that declares its own rows", ({ repoRoot }) => {
  const result = ledgerSectionDrift(repoRoot);
  expect(result.drift).toEqual([]);
  // A derivation that reconciled NOTHING would print the same empty drift; the count is what makes the
  // green a measurement.
  expect(result.derived).toBeGreaterThan(0);
});

/** A temp repo whose deferred roster carries one landed-but-unmarked row, one landed-and-marked row, and
 *  one genuinely-waiting row — plus a DROPPED table below it whose rows have the identical shape. */
function deferredRosterRoot(landedMarked: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "orb-deferred-roster-"));
  mkdirSync(join(root, "docs/architecture/core"), { recursive: true });
  mkdirSync(join(root, "tooling/src/verify/gates"), { recursive: true });
  writeFileSync(join(root, "tooling/src/verify/gates/landed-gate.ts"), "export const gate = 1;\n");
  writeFileSync(join(root, "tooling/src/verify/gates/marked-gate.ts"), "export const gate = 1;\n");
  writeFileSync(
    join(root, "docs/architecture/core/Core-Enforcement-Deferred-Dropped.md"),
    [
      "## Deferred backlog — neo gates not yet ported, with activation trigger",
      "",
      "| Gate | What it does | Activates when |",
      "| - | - | - |",
      `| \`landed-gate\` | a thing | ${landedMarked ? "PROMOTED — it landed" : "the domain is built"} |`,
      "| `marked-gate` | another | PROMOTED — it landed |",
      "| `waiting-gate` | a third | the domain is built |",
      "",
      "### Dropped (do not port)",
      "",
      "| neo gate | Why N/A |",
      "| - | - |",
      "| `landed-gate` | a row of the SAME shape, outside the deferred table |",
      "",
    ].join("\n"),
  );
  return root;
}

test("a deferred row whose gate has LANDED is named — the one-sided half made two-sided (#2008)", () => {
  const root = deferredRosterRoot(false);
  try {
    const result = deferredRosterDrift(root);
    expect(result.drift).toHaveLength(1);
    expect(result.drift[0]).toContain("`landed-gate` reads as not-yet-ported");
    // THE DENOMINATOR IS THE DEFERRED TABLE, not the file: the DROPPED table below carries a row of the
    // same shape and the same id, and counting it would inflate the census that justifies the green.
    expect(result.derived).toBe(3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a deferred row that already says PROMOTED is not re-accused", () => {
  const root = deferredRosterRoot(true);
  try {
    expect(deferredRosterDrift(root).drift).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the committed deferred roster has no row whose gate has quietly landed", ({ repoRoot }) => {
  const result = deferredRosterDrift(repoRoot);
  expect(result.drift).toEqual([]);
  // Five rows were stale when this arm was written; a zero denominator would print the same clean green.
  expect(result.derived).toBeGreaterThan(20);
});

// ─── #2075: the header is excluded by SHAPE, and the two readers share ONE predicate ────────────────
//
// Both readers previously excluded the header by the literal `| module |`, so the ONE ledger section whose
// schema is `| subject | … |` counted its own header as a defect row. The count rode a GENERATED column and
// was knowingly shipped once because the alternative was a stale column. These arms pin the fix in both
// directions: a foreign schema counts correctly, and a block that is NOT a table counts ZERO.

/** A ledger whose section header is `subject`, not `module` — the real `p-suite-honesty` schema. */
function foreignSchemaLedgerRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "orb-foreign-schema-"));
  const dir = join(root, "docs/reviews/gate-runtime");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "v-foreign-2026-09-12.md"),
    ["## LEDGER ROWS (2 rows)", "", "| subject | defect |", "| - | - |", "| `a` | x |", "| `b` | y |", ""].join("\n"),
  );
  writeFileSync(
    join(dir, "refutation-ledger-2026-09-12.md"),
    ["## THE LEDGER", "", "### foreign (`v-foreign-2026-09-12.md`)", "", "| subject | defect |", "| - | - |", "| `a` | x |", "| `b` | y |", ""].join("\n"),
  );
  return root;
}

test("a section whose header is NOT `module` counts its header as a HEADER, on both sides (#2075)", () => {
  const root = foreignSchemaLedgerRoot();
  try {
    const result = ledgerSectionDrift(root);
    // Under the retired literal predicate BOTH sides read 3 and still agreed, so a count comparison alone
    // could never have caught this — the defect surfaced in the GENERATED cost cell, one consumer over.
    // The section total is what that cell prices, so the assertion is the count itself.
    expect(result.drift).toEqual([]);
    expect(ledgerSections(readFileSync(join(root, "docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md"), "utf8"))[0]).toMatchObject({
      rows: 2,
      columns: ["subject", "defect"],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a section that LOST its `| - | - |` separator REFUSES beside healthy admitted rows", () => {
  const root = mkdtempSync(join(tmpdir(), "orb-escaped-pipes-"));
  try {
    const dir = join(root, "docs/reviews/gate-runtime");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "v-drop-2026-09-12.md"),
      ["## LEDGER ROWS (2 rows)", "", "| module | defect |", "| - | - |", "| `a` | x |", "| `b` | y |", ""].join("\n"),
    );
    // EXACTLY what remark produced on 2026-09-12 when an append dropped the separator: with no alignment
    // rule the block is not a table, so it serialised as a PARAGRAPH and every leading pipe was escaped.
    writeFileSync(
      join(dir, "refutation-ledger-2026-09-12.md"),
      ["## THE LEDGER", "", "### dropped (`v-drop-2026-09-12.md`)", "", "\\| module | defect |", "\\| `a` | x |", "\\| `b` | y |", ""].join("\n"),
    );
    // A healthy table elsewhere in the same fence must not let this malformed section become a partial
    // freshness verdict. Both production consumers share the same admission refusal.
    const ledgerPath = join(dir, "refutation-ledger-2026-09-12.md");
    writeFileSync(
      ledgerPath,
      `${readFileSync(ledgerPath, "utf8")}\n### healthy\n\n| module | defect | class | state |\n| - | - | - | - |\n| ok | held | other | OPEN |\n`,
    );
    expect(() => ledgerSectionDrift(root)).toThrow(/table-like row is a Markdown paragraph/);
    expect(() => classRollupDrift(root)).toThrow(/table-like row is a Markdown paragraph/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stale SIZE cell names the ROW and both cells, never a bare difference count (#2117)", () => {
  const { root } = costTableRoot();
  try {
    writeFileSync(join(root, READ_FIRST_REL), READ_FIRST_ROWS.join("\n"));
    const result = readFirstCostsDrift(root);
    // Nine placeholder rows all differ, and each names itself — the regeneration-on-a-backed-up-copy that
    // was previously the only way to learn WHICH row moved is no longer needed.
    expect(result.drift).toHaveLength(9);
    expect(result.drift[0]).toBe('row 1: "**999 KB**" → "**4 KB**"');
    // The denominator is the priced-row count, so a green is a measurement over nine rows rather than a 1.
    expect(result.derived).toBe(9);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a separator-less block with UNESCAPED pipes refuses rather than silently shrinking the population", () => {
  const root = mkdtempSync(join(tmpdir(), "orb-no-separator-"));
  try {
    const dir = join(root, "docs/reviews/gate-runtime");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "v-nosep-2026-09-12.md"),
      ["## LEDGER ROWS (2 rows)", "", "| module | defect |", "| - | - |", "| `a` | x |", "| `b` | y |", ""].join("\n"),
    );
    // No alignment rule and no escaping. The RETIRED literal predicate reads TWO rows here, the section
    // matches its report exactly, and the run passes silently over a block Markdown does not render as a
    // table at all. Measured differential: retired 2, shipped 0.
    writeFileSync(
      join(dir, "refutation-ledger-2026-09-12.md"),
      ["## THE LEDGER", "", "### nosep (`v-nosep-2026-09-12.md`)", "", "| module | defect |", "| `a` | x |", "| `b` | y |", ""].join("\n"),
    );
    expect(() => ledgerSectionDrift(root)).toThrow(/table-like row is a Markdown paragraph/);
    expect(() => classRollupDrift(root)).toThrow(/table-like row is a Markdown paragraph/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ─── #2166: the fence REPORTS what it excludes ──────────────────────────────────────────────────────
//
// Six real defect rows were appended below `## CLASS ROLLUP` and every instrument that reads this file
// while sitting inside it was correct-and-blind: the reconciler printed the SAME "11 of 24 reconcilable"
// before and after the append. A fence that cannot say what it stopped short of is a false clean.
//
// The control is a TEMP ROOT, deliberately, and not a probe on the real ledger: that file is shared and
// the orchestrator appends to it in the same window, which is the one hazard this lane is not allowed to
// create. A committed fixture is also the stronger receipt — it reds forever, where a probe reds once.

/** A ledger whose rows were appended BELOW `## CLASS ROLLUP` — the `6c983149e` shape exactly. */
function strayLedgerRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "orb-stray-section-"));
  const dir = join(root, "docs/reviews/gate-runtime");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "v-stray-2026-09-12.md"),
    ["## LEDGER ROWS (2 rows)", "", "| module | defect |", "| - | - |", "| `a` | x |", "| `b` | y |", ""].join("\n"),
  );
  writeFileSync(
    join(dir, "refutation-ledger-2026-09-12.md"),
    [
      "## THE LEDGER",
      "",
      "### in-fence (`v-stray-2026-09-12.md`)",
      "",
      "| module | defect | class | state | receipt |",
      "| - | - | - | - | - |",
      "| `a` | x | c | **OPEN** | r |",
      "| `b` | y | c | **OPEN** | r |",
      "",
      "## CLASS ROLLUP",
      "",
      // The rollup's OWN table carries `state` but no `defect` — it must never be mistaken for a ledger row
      // table, which is why the predicate keys on BOTH columns.
      "| class | modules affected | state |",
      "| - | - | - |",
      "| §4.1 | 3 | open |",
      "",
      "### cb-v-fix-wave-1 (`v-stray-2026-09-12.md`)",
      "",
      "| module | defect | class | state | receipt |",
      "| - | - | - | - | - |",
      "| `c` | z | c | **OPEN** | r |",
      "",
    ].join("\n"),
  );
  return root;
}

test("a ledger-shaped section BELOW the rollup is a REFUSAL naming the heading and the fence (#2166)", () => {
  const root = strayLedgerRoot();
  try {
    const result = ledgerSectionDrift(root);
    const joined = result.drift.join("\n");
    expect(joined).toContain("`### cb-v-fix-wave-1 (`v-stray-2026-09-12.md`)` carries 1 ledger row(s)");
    expect(joined).toContain("sits under `## CLASS ROLLUP`");
    expect(joined).toContain("OUTSIDE the `## THE LEDGER` fence");
    // The in-fence section still reconciles, so the stray is an ADDITION to the verdict rather than a
    // replacement of it — the old behaviour reported the in-fence count and nothing else.
    expect(result.derived).toBe(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the rollup's own tables are NOT ledger rows — `state` without `defect` is a different schema", () => {
  const root = strayLedgerRoot();
  try {
    const ledger = readFileSync(join(root, "docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md"), "utf8");
    // Exactly one stray: the appended section. The `| class | modules affected | state |` rollup table sits
    // outside the fence too and must not be counted, or the refusal would fire on every correct ledger.
    expect(strayLedgerSections(ledger).map((stray) => stray.heading)).toEqual(["cb-v-fix-wave-1 (`v-stray-2026-09-12.md`)"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the COMMITTED ledger has no stray section, and the green is a measurement", ({ repoRoot }) => {
  const ledger = readFileSync(join(repoRoot, "docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md"), "utf8");
  expect(strayLedgerSections(ledger)).toEqual([]);
  // A zero-denominator green would print the same empty list: measured 2026-09-12, all 25 in-fence sections
  // carry a ledger-shaped table across SIX different column schemas, and no out-of-fence table does.
  expect(ledgerSections(ledger).length).toBeGreaterThan(20);
});

// ─── #2207: the CLASS ROLLUP is a DERIVED table, and nothing re-derived it ───────────────────────────
//
// THE CONTROL IS TWO-DIRECTIONAL BECAUSE ONE-DIRECTIONAL IS HOW THE TABLE GOT HERE. A summary that only
// ever agrees with itself drifts silently: this one did it twice, reading `91 rows` against a body of 99
// and then `100 rows` against a body of 303. Both times a human caught it. So the added-row arm must RED
// and name the cell, AND the matching pair must stay GREEN — an arm that reds on everything would have
// "caught" both incidents while being useless, and an arm that greens on everything is the status quo.
//
// The fixtures are SYNTHETIC and tiny on purpose: the real ledger is 300+ rows and fenced to another
// owner, and a pin that reads it would re-red on every legitimate append. The real file is exercised by
// the stage itself — `pnpm check:ledgers-fresh` prints its per-table counts on every run.

/** A minimal ledger: one in-fence section with `rows` data rows, then the rollup the fixture declares. */
function ledgerFixture(input: { readonly rows: readonly (readonly [string, string])[]; readonly rollup: readonly string[] }): string {
  const body = input.rows.map(([klass, state]) => `| mod | wave | defect | ${klass} | ${state} |`).join("\n");
  return [
    "## THE LEDGER",
    "",
    "### `p-probe` — a synthetic section",
    "",
    "| module | wave | defect | class | state |",
    "| - | - | - | - | - |",
    body,
    "",
    "## CLASS ROLLUP",
    "",
    "| class | rows | CLOSED | OPEN | SUPERSEDED | DISSOLVED | UNADJUDICATED | N/A | FIXED |",
    "| - | -: | -: | -: | -: | -: | -: | -: | -: |",
    ...input.rollup,
    "",
  ].join("\n");
}

function rollupRoot(text: string): string {
  const root = mkdtempSync(join(tmpdir(), "orb-class-rollup-"));
  mkdirSync(join(root, "docs/reviews/gate-runtime"), { recursive: true });
  writeFileSync(join(root, "docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md"), text);
  return root;
}

// The rollup a two-row body (one §4.1 CLOSED, one free-text OPEN) honestly summarises.
const MATCHING_ROLLUP = [
  "| **§4.1** | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |",
  "| **§4.2** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |",
  "| **§4.5** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |",
  "| **§4.6** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |",
  "| **§5b.1** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |",
  "| **§5b.2** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |",
  "| **§5b.3** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |",
  "| **§5b.5** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |",
  "| **§5b.7** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |",
  "| **§12.3** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |",
  "| **roster** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |",
  "| **other** | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |",
  "| **TOTAL** | **2** | **1** | **1** | **0** | **0** | **0** | **0** | **0** |",
];
const TWO_ROWS = [
  ["§4.1", "**CLOSED** at `abc1234`"],
  ["instrument", "OPEN — still live"],
] as const;

test("#2207 GREEN — a rollup that matches its body is fresh, and the label prints per-table counts", () => {
  const root = rollupRoot(ledgerFixture({ rows: TWO_ROWS, rollup: MATCHING_ROLLUP }));
  try {
    const result = classRollupDrift(root);
    expect(result.drift).toEqual([]);
    expect(result.derived).toBe(2);
    // The counting paragraph requires these PRINTED on every run: "the three defects above were all
    // invisible to a run that printed only the totals".
    expect(result.ledger).toContain("1 tables · 2 rows · unbinned 0 · per-table 2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#2207 RED — a body row added without a rollup update reds, naming the differing cells", () => {
  // The exact incident: a section is appended, the summary is not rebuilt. One §4.1 CLOSED row arrives.
  const root = rollupRoot(ledgerFixture({ rows: [...TWO_ROWS, ["§4.1", "**CLOSED** at `def5678`"]], rollup: MATCHING_ROLLUP }));
  try {
    const result = classRollupDrift(root);
    expect(result.drift).toEqual(["cell §4.1.rows: 1 → 2", "cell §4.1.CLOSED: 1 → 2", "cell TOTAL.rows: 2 → 3", "cell TOTAL.CLOSED: 1 → 2"]);
    expect(result.regen).toContain("rebuild the `## CLASS ROLLUP` table");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#2207 — an UNBOLDED state cell bins by its first word, and a cell binning to nothing is reported", () => {
  // Rule 3, both halves. 56 of the real file's 303 state cells carry no bold at all, and the literal
  // "first bolded word" reading reported every one of them UNBINNED while running CLOSED short by 12.
  const root = rollupRoot(
    ledgerFixture({
      rows: [
        ["§4.1", "CLOSED at `abc1234`"],
        ["instrument", "premise dead on today's tree"],
      ],
      rollup: MATCHING_ROLLUP,
    }),
  );
  try {
    const result = classRollupDrift(root);
    // The unbolded CLOSED bins as CLOSED — it lands in the §4.1 row the fixture already declares…
    expect(result.drift.filter((line) => line.startsWith("cell §4.1"))).toEqual([]);
    // …and the cell that names no known state is REPORTED verbatim, never silently dropped.
    expect(result.drift).toContain(
      'unbinned  a state cell bins to none of CLOSED/OPEN/SUPERSEDED/DISSOLVED/UNADJUDICATED/N/A/FIXED: "premise dead on today\'s tree"',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#2207 — an in-fence table with no `state` column is REPORTED, never silently skipped", () => {
  // Rule 2's failure mode from the other side: the binner cannot read the table at all. A skip here is the
  // blindness the arm exists for — the old method's `≥6 cells` filter dropped a whole 12-row section.
  const text = [
    "## THE LEDGER",
    "",
    "### `p-probe` — a section whose schema carries no state",
    "",
    "| module | defect |",
    "| - | - |",
    "| mod | a defect with nowhere to bin |",
    "",
    "## CLASS ROLLUP",
    "",
    "| class | rows | CLOSED | OPEN | SUPERSEDED | DISSOLVED | UNADJUDICATED | N/A | FIXED |",
    "| - | -: | -: | -: | -: | -: | -: | -: | -: |",
    "| **TOTAL** | **0** | **0** | **0** | **0** | **0** | **0** | **0** | **0** |",
    "",
  ].join("\n");
  const root = rollupRoot(text);
  try {
    expect(classRollupDrift(root).drift).toContain("unreadable  an in-fence table has no `state` column, so its rows bin nowhere: header `module | defect`");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("#2207 — a rollup MISSING a state COLUMN is a schema defect, not a cell mismatch", () => {
  // THE HISTORICAL DEFECT, replayed as a fixture. The table that stood until 2026-09-12 carried six state
  // columns and no `FIXED`, and 11 of one section's 12 rows said exactly FIXED — so they were invisible to
  // the summary rather than miscounted in it. Reporting that as a cell mismatch would send the reader to
  // fix numbers that are not wrong; the missing COLUMN is the defect. Found by replaying the real file at
  // `06da8c80d` through this arm, which is also why the arm reports it at all.
  const text = [
    "## THE LEDGER",
    "",
    "### `p-probe` — a section whose only row is FIXED",
    "",
    "| module | wave | defect | class | state |",
    "| - | - | - | - | - |",
    "| mod | wave | defect | instrument | **FIXED** in this commit |",
    "",
    "## CLASS ROLLUP",
    "",
    "| class | rows | CLOSED | OPEN | SUPERSEDED | DISSOLVED | UNADJUDICATED | N/A |",
    "| - | -: | -: | -: | -: | -: | -: | -: |",
    "| **other** | 1 | 0 | 0 | 0 | 0 | 0 | 0 |",
    "",
  ].join("\n");
  const root = rollupRoot(text);
  try {
    const { drift } = classRollupDrift(root);
    expect(drift).toContain("schema  the rollup has no `FIXED` column, so every FIXED row in the body is invisible to it rather than miscounted");
    // And NO phantom cell line for a bin the table cannot hold.
    expect(drift.filter((line) => line.includes(".FIXED:"))).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ─── #2224: THE RECONCILER'S FOUR SIBLING BLIND SPOTS, AND THE FIFTH TABLE ───────────────────────────
//
// #2166 taught the fence to REPORT what it excludes, and the arms above prove it on the shape that bit:
// a `### ` section appended below `## CLASS ROLLUP`. Measured 2026-09-12 by `cb-v-instruments-2`, FOUR
// sibling shapes were still silent — each planted, each producing no finding at all — because the scanner
// modelled the CONTAINER as "an h3 with a lowercase-exact schema" rather than "any heading, any case":
//
//   1. a bare `## ` section      — `## ` reset `enclosing` and never opened a candidate
//   2. a table with NO heading   — rows appended straight under a `##`, so nothing was ever open
//   3. a `#### ` heading         — `"#### x".startsWith("### ")` is FALSE
//   4. `| Defect | State |`      — the schema match was case-sensitive, so a capitalised header bound nothing
//
// ALL FOUR ARE LATENT ON THE COMMITTED LEDGER (measured 2026-09-13: below the rollup there are 4 `##` and
// 1 `###` heading and three tables, none ledger-shaped), so the committed-file green above is NOT evidence
// that the widening works — which is exactly why each shape is planted here. A fence proved only by the
// absence of findings is a fence proved by nothing.

/** One synthetic ledger whose rows sit below the rollup in whatever container `below` spells. The in-fence
 *  section is identical in every variant, so the ONLY difference between a run that finds a stray and one
 *  that does not is the container the author used. */
function strayShapeLedger(below: readonly string[]): string {
  return [
    "## THE LEDGER",
    "",
    "### in-fence (`v-stray-2026-09-12.md`)",
    "",
    "| module | defect | class | state | receipt |",
    "| - | - | - | - | - |",
    "| `a` | x | c | **OPEN** | r |",
    "",
    "## CLASS ROLLUP",
    "",
    ...below,
    "",
  ].join("\n");
}

const LEDGER_ROWS_BLOCK = ["| module | defect | class | state | receipt |", "| - | - | - | - | - |", "| `c` | z | c | **OPEN** | r |"];

test("#2224 — a stray section is caught under a bare `##`, under NO heading, and under a `####`", () => {
  // SHAPE 1 — a bare `## ` container. The author opened a new top-level section and pasted the rows in.
  const bare = strayLedgerSections(strayShapeLedger(["## cb-v-stray-two", "", ...LEDGER_ROWS_BLOCK]));
  expect(bare.map((stray) => stray.heading)).toStrictEqual(["cb-v-stray-two"]);
  expect(bare[0]?.rows).toBe(1);

  // SHAPE 2 — NO heading at all: the rows land directly in `## CLASS ROLLUP`'s own body. The container is
  // the `##` itself, which is why a `##` now encloses itself rather than only naming what sits under it.
  const headingless = strayLedgerSections(strayShapeLedger(LEDGER_ROWS_BLOCK));
  expect(headingless.map((stray) => stray.heading)).toStrictEqual(["CLASS ROLLUP"]);
  expect(headingless[0]?.enclosing).toBe("## CLASS ROLLUP");

  // SHAPE 3 — a `#### ` subheading. One extra `#` and the old `startsWith("### ")` was false.
  const deep = strayLedgerSections(strayShapeLedger(["#### cb-v-stray-four", "", ...LEDGER_ROWS_BLOCK]));
  expect(deep.map((stray) => stray.heading)).toStrictEqual(["cb-v-stray-four"]);
  expect(deep[0]?.enclosing, "it still names the `##` the author must move the section out of").toBe("## CLASS ROLLUP");
});

test("#2224 — a CAPITALISED `| Defect | State |` header is the same schema, and binds", () => {
  const shouty = strayLedgerSections(
    strayShapeLedger(["### cb-v-stray-caps", "", "| Module | Defect | Class | State | Receipt |", "| - | - | - | - | - |", "| `c` | z | c | **OPEN** | r |"]),
  );
  expect(shouty.map((stray) => stray.heading)).toStrictEqual(["cb-v-stray-caps"]);
});

test("#2224 NEGATIVE CONTROL — the widening does NOT make every heading below the rollup a stray", () => {
  // Without this, all four arms above would pass against a scanner that reported every `##` it met. The
  // rollup's own tables carry `state` WITHOUT `defect`, a two-column census carries neither, and a prose
  // section carries no table at all; all three must stay silent, or the refusal fires on every correct
  // ledger and the instrument is worse than the blindness it replaced.
  const clean = strayShapeLedger([
    "| class | modules affected | state |",
    "| - | - | - |",
    "| §4.1 | 3 | open |",
    "",
    "## THE FIVE HIGHEST-VALUE OPEN DEFECTS",
    "",
    "Ranked by blast radius. No table here at all.",
    "",
    "#### a sub-point",
    "",
    "| free-text class in `other`, as written | rows |",
    "| - | -: |",
    "| instrument | 11 |",
  ]);
  expect(strayLedgerSections(clean)).toStrictEqual([]);
});

test("table-shaped code and blockquotes are not section, rollup, or stray ledger data", () => {
  const exampleRows = ["| module | defect | class | state | receipt |", "| - | - | - | - | - |", "| example | not data | other | OPEN | none |"];
  const text = strayShapeLedger(["```md", ...exampleRows, "```", "", ...exampleRows.map((line) => `> ${line}`)]).replace(
    "## CLASS ROLLUP",
    ["```md", ...exampleRows, "```", "", "## CLASS ROLLUP"].join("\n"),
  );
  expect(ledgerSections(text)).toHaveLength(1);
  expect(deriveClassRollup(text).total.rows).toBe(1);
  expect(strayLedgerSections(text)).toStrictEqual([]);
});

test("table-like headings inside code and quotes cannot move the ledger or rollup fence", () => {
  const text = ledgerFixture({ rows: TWO_ROWS, rollup: MATCHING_ROLLUP }).replace(
    "### `p-probe` — a synthetic section",
    ["```md", "## CLASS ROLLUP", "### fake", "```", "", "> ## CLASS ROLLUP", "", "### `p-probe` — a synthetic section"].join("\n"),
  );
  expect(ledgerSections(text)).toHaveLength(1);
  expect(deriveClassRollup(text).total.rows).toBe(2);
});

// ─── #2224 fifth shape: the `other`-bin sub-table below the rollup ───────────────────────────────────
//
// The rollup's `other` row is broken down by a SECOND table (*"free-text class in `other`, as written"*)
// which declares its own **`other` TOTAL** — and nothing re-derived that either. Measured at the
// 2026-09-12 barrier: 176 against an `other` of 197. Re-measured 2026-09-13 on the committed file: still
// 176, `other` now 241. Two tables, one body, one reconciler, and the reconciler could see one of them.
//
// THE TWO SIDES COUNT THE SAME QUANTITY, and that was CHECKED rather than assumed (2026-09-13, after the
// ledger's owner read them as "per-MODULE classes vs per-ROW bin membership" — an equality arm over two
// different quantities would fire on a correctly-maintained ledger forever, which is a lying instrument in
// the other direction). Three receipts, all from the committed file:
//   · the sub-table's own column header is `| free-text class in \`other\`, as written | rows |` — the
//     second column is literally `rows`, and its last row is labelled `**\`other\` TOTAL**`;
//   · the prose under it says the breakdown "counts what those CELLS actually say, binned by the cell's
//     first named phrase" — the cells being the CLASS cells of the body's rows, i.e. per-ROW membership of
//     the same `other` bin `deriveClassRollup` tallies;
//   · its rows sum EXACTLY to 176 (16+14+11+11+11+7+4+3+3+3+2×10+73), a partition of a row count.
// The PER-MODULE table is the NEXT section — `### The cross-cutting classes, counted PER MODULE rather
// than per row`, header `| class | modules affected | state |` — three columns with no `rows` column, so
// `committedOtherClassCensus`'s shape predicate (exactly two columns, second named `rows`, carrying a
// TOTAL row) cannot reach it. Same quantity; the ledger is genuinely stale.
//
// THE PER-PHRASE BUCKETS ARE NOT RE-DERIVED and that limit is deliberate (stated at
// `committedOtherClassCensus`): the committed buckets are hand-chosen truncations of the class cells with
// an explicit *1-offs* bucket folding every singleton, so no mechanical normalisation reproduces them. The
// TOTAL is two-sided and the table's own arithmetic is self-checking; both are held exactly.

/** Every rollup class at zero except `other` — the shape `classRollupDrift` needs so the census arms are
 *  the only thing that can speak. */
function zeroRollupExceptOther(otherRows: number): readonly string[] {
  const classes = ["§4.1", "§4.2", "§4.5", "§4.6", "§5b.1", "§5b.2", "§5b.3", "§5b.5", "§5b.7", "§12.3", "roster"];
  return [
    ...classes.map((klass) => `| **${klass}** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |`),
    `| **other** | ${String(otherRows)} | 0 | ${String(otherRows)} | 0 | 0 | 0 | 0 | 0 |`,
    `| **TOTAL** | **${String(otherRows)}** | **0** | **${String(otherRows)}** | **0** | **0** | **0** | **0** | **0** |`,
  ];
}

/** A ledger with `otherRows` free-text body rows, the matching rollup, and an `other` sub-table declaring
 *  `breakdown.total` over `breakdown.rows`. Pass `undefined` for a rollup that carries no sub-table. */
function otherCensusLedger(
  otherRows: number,
  breakdown: { readonly rows: readonly (readonly [string, number])[]; readonly total: number } | undefined,
): string {
  return [
    "## THE LEDGER",
    "",
    "### in-fence (`v-stray-2026-09-12.md`)",
    "",
    "| module | defect | class | state | receipt |",
    "| - | - | - | - | - |",
    ...Array.from({ length: otherRows }, (_unused, index) => `| \`m${String(index)}\` | x | free text | OPEN | r |`),
    "",
    "## CLASS ROLLUP",
    "",
    "| class | rows | CLOSED | OPEN | SUPERSEDED | DISSOLVED | UNADJUDICATED | N/A | FIXED |",
    "| - | -: | -: | -: | -: | -: | -: | -: | -: |",
    ...zeroRollupExceptOther(otherRows),
    "",
    ...(breakdown === undefined
      ? []
      : [
          "| free-text class in `other`, as written | rows |",
          "| - | -: |",
          ...breakdown.rows.map(([phrase, count]) => `| ${phrase} | ${String(count)} |`),
          `| **\`other\` TOTAL** | **${String(breakdown.total)}** |`,
        ]),
    "",
  ].join("\n");
}

/** `classRollupDrift` over a synthetic ledger in its own temp root. */
function censusDriftOf(text: string): readonly string[] {
  const root = rollupRoot(text);
  try {
    return classRollupDrift(root).drift;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("#2224 — the `other` sub-table is READ, and its TOTAL is held against the bin it breaks down", () => {
  // GREEN FIRST. Three free-text rows, an `other` bin of 3, a sub-table summing to 3 and declaring 3.
  // Without this arm the two reds below would pass against a reconciler that reported drift on everything.
  const agreeing = otherCensusLedger(3, {
    rows: [
      ["instrument", 2],
      ["doc", 1],
    ],
    total: 3,
  });
  expect(committedOtherClassCensus(agreeing)?.declaredTotal).toBe(3);
  expect(censusDriftOf(agreeing)).toStrictEqual([]);

  // RED (a) — THE LIVE SHAPE, reduced: the body grew and the sub-table did not.
  const stale = otherCensusLedger(5, {
    rows: [
      ["instrument", 2],
      ["doc", 1],
    ],
    total: 3,
  });
  expect(censusDriftOf(stale).join("\n")).toContain("the `other` sub-table declares 3 but the body's `other` bin holds 5");

  // RED (b) — the table disagrees with ITSELF: rows summing to 3 under a TOTAL cell reading 5. This arm
  // needs no re-derivation of the phrase buckets at all, which is why it can be held exactly.
  const selfInconsistent = otherCensusLedger(5, {
    rows: [
      ["instrument", 2],
      ["doc", 1],
    ],
    total: 5,
  });
  expect(censusDriftOf(selfInconsistent).join("\n")).toContain("own rows sum to 3 and its TOTAL cell says 5");
});

test("#2224 — the DATED HAND CENSUS banner waives the equality arm, and ONLY that arm", () => {
  // THE INSTRUMENT'S OWN SECOND REMEDY, HONOURED IN CODE. The drift message offers "re-census, OR mark the
  // table a DATED hand census with the date it was taken" — a re-census of ~180 free-text phrases is
  // barrier work, and an instrument that offers a remedy it then refuses to accept is lying in the
  // courteous direction.
  const stale = otherCensusLedger(5, {
    rows: [
      ["instrument", 2],
      ["doc", 1],
    ],
    total: 3,
  });
  expect(censusDriftOf(stale).join("\n"), "control: without the banner the equality arm fires").toContain("but the body's `other` bin holds 5");

  const bannered = stale.replace("## CLASS ROLLUP", "## CLASS ROLLUP\n\n**DATED HAND CENSUS, taken 2026-09-12 — re-census owed at a quiet barrier.**");
  expect(censusDriftOf(bannered), "the banner waives it").toStrictEqual([]);

  // …AND ONLY THAT ARM. A banner is a statement about the table's AGE, never a licence for the table to
  // disagree with itself — so the internal-sum arm still binds under it. Without this the waiver would be
  // a blanket suppression wearing a date.
  const banneredAndBroken = otherCensusLedger(5, {
    rows: [
      ["instrument", 2],
      ["doc", 1],
    ],
    total: 5,
  }).replace("## CLASS ROLLUP", "## CLASS ROLLUP\n\n**DATED HAND CENSUS, taken 2026-09-12.**");
  expect(censusDriftOf(banneredAndBroken).join("\n")).toContain("own rows sum to 3 and its TOTAL cell says 5");

  // THE DATE IS THE LOAD-BEARING HALF. "It is a hand census" with no date is a permanent excuse — the
  // refusal-that-outlives-its-blocker shape — so an undated banner waives nothing.
  const undated = stale.replace("## CLASS ROLLUP", "## CLASS ROLLUP\n\n**This is a dated hand census.**");
  expect(censusDriftOf(undated).join("\n"), "no date, no waiver").toContain("but the body's `other` bin holds 5");

  // AND IT IS SCOPED TO THE ROLLUP SECTION: a banner further down the document is about something else.
  const elsewhere = `${stale}\n## SOMETHING ELSE\n\n**DATED HAND CENSUS 2026-09-12**\n`;
  expect(censusDriftOf(elsewhere).join("\n"), "a banner outside the section waives nothing").toContain("but the body's `other` bin holds 5");
});

test("#2224 — a rollup with NO `other` sub-table is not a finding, and the absence is a real answer", () => {
  // The ledger is free not to carry the breakdown. `undefined` is the honest answer — distinct from a
  // census that reconciled — and it must not manufacture drift out of a table that is not there.
  const none = otherCensusLedger(1, undefined);
  expect(committedOtherClassCensus(none)).toBeUndefined();
  expect(censusDriftOf(none)).toStrictEqual([]);
});
