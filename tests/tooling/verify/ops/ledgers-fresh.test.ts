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
  deriveSnapFlagsIndexMarkdown,
  deriveTestBaselineManifest,
  LEDGER_CHECKS,
  ledgerReport,
  manifestDrift,
  REGISTRY,
  SNAP_FLAGS_INDEX_REL,
  snapFlagsIndexDrift,
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
