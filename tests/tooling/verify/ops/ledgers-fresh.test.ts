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
import type { CaughtFailurePopulation, CaughtFailureRow, TestBaselineManifest } from "@orb/tooling/verify";
import {
  censusDrift,
  deferredRosterDrift,
  deriveReadFirstCosts,
  deriveSnapFlagsIndexMarkdown,
  deriveTestBaselineManifest,
  LEDGER_CHECKS,
  ledgerReport,
  ledgerSectionDrift,
  ledgerSections,
  manifestDrift,
  READ_FIRST_REL,
  REGISTRY,
  readFirstCostsDrift,
  SNAP_FLAGS_INDEX_REL,
  snapFlagsIndexDrift,
  strayLedgerSections,
  TEST_BASELINE_REL,
  typeConfigsDrift,
} from "@orb/tooling/verify";
import { expect, test } from "../../../support/tool-fixtures.ts";

const STAGE = "ledgers:fresh";
/** A real tree carries thousands of tracked specs; a handful means the derivation stopped reading. */
const MIN_TRACKED_SPECS = 1000;

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

test("a manifest missing a tracked spec reds, naming the path", () => {
  const committed: TestBaselineManifest = { testFiles: ["tests/a.test.ts"], deletions: {} };
  const derived: TestBaselineManifest = { testFiles: ["tests/a.test.ts", "tests/b.test.ts"], deletions: {} };

  const result = manifestDrift(committed, derived);
  expect(result.drift.join("\n")).toContain("new    tests/b.test.ts");
  expect(result.regen).toContain("baseline test-baseline-manifest");
});

test("a manifest listing a spec the tree no longer tracks reds as `gone`", () => {
  const drift = manifestDrift({ testFiles: ["tests/a.test.ts", "tests/dead.test.ts"], deletions: {} }, { testFiles: ["tests/a.test.ts"], deletions: {} }).drift;

  expect(drift.join("\n")).toContain("gone   tests/dead.test.ts");
});

test("a MISSING committed ledger is drift that names the derive command, never a silent pass", () => {
  const result = manifestDrift(undefined, { testFiles: ["tests/a.test.ts"], deletions: {} });
  expect(result.drift.join("\n")).toContain("does not exist");
});

// ── the real tree: the manifest half runs for real (git ls-files, milliseconds) ──

test("the committed manifest matches a fresh derivation of THIS tree", ({ repoRoot }) => {
  const derived = deriveTestBaselineManifest(repoRoot);
  // The blindness control: a derivation that came back tiny is not a clean ledger, it is a broken read.
  expect(derived.testFiles.length).toBeGreaterThan(MIN_TRACKED_SPECS);

  const committed = JSON.parse(execFileSync("git", ["show", `HEAD:${TEST_BASELINE_REL}`], { cwd: repoRoot, encoding: "utf8" })) as TestBaselineManifest;
  // Committed-at-HEAD vs derived-from-the-index: this file itself is new, so the honest assertion is that
  // the ONLY drift is this lane's own additions — never a `gone` row, which would mean the ledger rotted.
  const drift = manifestDrift(committed, derived).drift;
  expect(drift.filter((line) => line.startsWith("gone"))).toEqual([]);
});

test("a derivation that comes back EMPTY is a TOOL ERROR (exit 2), never a fresh ledger", () => {
  // Two empty sides would "agree" forever. The tripwire is the blindness class the house calls a lying
  // instrument: a bare zero means "I could not measure", never "there is nothing there".
  const root = mkdtempSync(join(tmpdir(), "orb-ledgers-fresh-"));
  try {
    mkdirSync(join(root, "docs", "test-baseline"), { recursive: true });
    writeFileSync(join(root, "docs", "test-baseline", "manifest.json"), JSON.stringify({ testFiles: [], deletions: {} }));
    execFileSync("git", ["init", "-q"], { cwd: root });

    const check = LEDGER_CHECKS["test-baseline-manifest"];
    expect(check).toBeDefined();
    expect(check?.(root)).toBe(2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── the registry contract: static tier, and WHOLE-ONLY by absence ──

test("the stage runs at every whole-tree tier and DEFERS at a scoped one", () => {
  const stage = REGISTRY.find((s) => s.name === STAGE);
  expect(stage, `${STAGE} must be a registry row — an unregistered script is a forgotten one`).toBeDefined();
  expect(stage?.tiers).toEqual(["static", "push", "full"]);
  expect(stage?.argv).toEqual(["pnpm", "check:ledgers-fresh"]);
  // NO scopedArgv is the scope self-guard: ops/run.ts `planStage` maps its ABSENCE to mode "deferred" with
  // the standard runs-at notice. A scoped fileset would derive a census of a different tree and call every
  // row it did not walk stale.
  expect(stage?.scopedArgv).toBeUndefined();
  expect(stage?.tiers).not.toContain("changed");
});

test("a stale ledger never suppresses its sibling's verdict from the same run", () => {
  // The regression this pins was LIVE on the stage's first run: `results.every(report)` short-circuits at
  // the first false, so the manifest's drift printed and the census was never reported at all — a run that
  // silently judged one of the two things it exists to judge.
  const lines = ledgerReport([
    manifestDrift({ testFiles: [], deletions: {} }, { testFiles: ["tests/b.test.ts"], deletions: {} }),
    censusDrift(census([row()]), census([row()])),
  ]).join("\n");

  expect(lines).toContain("STALE  docs/test-baseline/manifest.json");
  expect(lines).toContain("fresh  docs/reviews/caught-failure-ownership/population.json");
});

test("every generated ledger/config family carries a `baseline --check` arm", () => {
  expect(Object.keys(LEDGER_CHECKS).sort((a, b) => a.localeCompare(b))).toEqual([
    "caught-failure-population",
    "read-first-costs",
    "snap-flags-index",
    "test-baseline-manifest",
    "type-configs",
  ]);
});

test("generated type-config drift names the exact changed file and writer", ({ repoRoot }) => {
  const result = typeConfigsDrift(repoRoot);
  expect(result.drift).toEqual([]);
  expect(result.regen).toContain("baseline type-configs");
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

test("a section that LOST its `| - | - |` separator is not a table and counts ZERO — the shape that caught real damage", () => {
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
    const result = ledgerSectionDrift(root);
    // ZERO, and therefore LOUD. The RETIRED predicate also read this exact input as 0 (`\|` fails its
    // `startsWith("| ")`), so the real catch was owed to remark's ESCAPING rather than to the predicate —
    // which is why the sibling arm below, where the serialiser did NOT escape, is the discriminating one.
    expect(result.drift.join("\n")).toContain("carries 0 row(s)");
    expect(result.drift.join("\n")).toContain("declares 2");
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

test("a separator-less block with UNESCAPED pipes also counts zero — the case the shape rule actually closes", () => {
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
    expect(ledgerSectionDrift(root).drift.join("\n")).toContain("carries 0 row(s)");
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
