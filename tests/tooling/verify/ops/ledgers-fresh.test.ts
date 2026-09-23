// The PERMANENT PIN for the `ledgers:fresh` stage (#817). What it defends, and why each arm exists:
//
//   RED-FIRST, on the UNMODIFIED source: a stale committed ledger was invisible to `pnpm check`. At HEAD
//   the ONLY consumer of the caught-failure census (then docs/reviews/caught-failure-ownership/population.json) was
//   tests/tooling/verify/gates/caught-failure-ownership.repo.int.test.ts — a `.repo.int.test.ts`, i.e. the
//   `integration` vitest project, which `pnpm check` never runs (it is the STATIC tier). So main could sit
//   re-staled by a merge for hours with a green commit bar, three times in one night (2026-08-30).
//
//   The comparators are PURE (committed, derived) → LedgerFreshness, so these arms cost milliseconds and
//   the expensive halves are exercised where they belong: the census derivation keeps its bijection proof
//   in the int suite above (~19s of ts-morph), and the manifest derivation runs for real HERE (git
//   ls-files, milliseconds) as the real-tree green + the blindness control.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import type { CaughtFailureJudgment, CaughtFailurePopulation } from "@orb/tooling/verify";
import {
  BASELINE_HELP,
  censusDrift,
  deferredRosterDrift,
  deriveCaughtFailurePopulation,
  deriveSnapFlagsIndexMarkdown,
  LEDGER_CHECKS,
  ledgerReport,
  POPULATION_REL,
  REGISTRY,
  resolveSelection,
  runBaseline,
  SNAP_FLAGS_INDEX_REL,
  snapFlagsIndexDrift,
  typeConfigsDrift,
} from "@orb/tooling/verify";
import { expect, test } from "../../../support/tool-fixtures.ts";

const STAGE = "ledgers:fresh";

function row(overrides: Partial<CaughtFailureJudgment> = {}): CaughtFailureJudgment {
  return { siteId: "packages/server/src/x.ts::catch::1", verdict: "unproven", reason: null, ...overrides };
}

function census(rows: readonly CaughtFailureJudgment[]): CaughtFailurePopulation {
  const unproven = rows.filter((r) => r.verdict === "unproven").length;
  return {
    gate: "caught-failure-ownership",
    generatedBy: "tooling/src/verify/ops/gen/caught-failure-population.ts",
    totals: {
      sites: rows.length,
      reported: unproven,
      byVerdict: { "deliberate-absorb": rows.length - unproven, unproven },
      byGrammar: { default: 0, empty: rows.length, promise: 0 },
    },
    rows,
  };
}

test("a census row whose JUDGMENT changed reds, naming the row and both values", () => {
  // A marker added or removed above a site flips its verdict and reason while its `siteId` stays put. A
  // comparison by identity-set alone would call this fresh; the stage must name the field on the row.
  const committed = row();
  const result = censusDrift(census([committed]), census([{ ...committed, verdict: "deliberate-absorb", reason: "the door" }]));

  expect(result.drift).toHaveLength(2);
  expect(result.drift[0]).toContain("packages/server/src/x.ts::catch::1");
  expect(result.drift[0]).toContain('verdict "unproven" → "deliberate-absorb"');
  expect(result.regen).toContain("baseline caught-failure-population");
});

test("a site that appeared and a site that vanished are BOTH drift, and are distinguished", () => {
  const committed = census([row(), row({ siteId: "a::catch::1" })]);
  const derived = census([row(), row({ siteId: "b::catch::1" })]);

  const drift = censusDrift(committed, derived).drift.join("\n");
  expect(drift).toContain("gone   a::catch::1");
  expect(drift).toContain("new    b::catch::1");
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
    mkdirSync(join(root, dirname(POPULATION_REL)), { recursive: true });
    writeFileSync(join(root, POPULATION_REL), JSON.stringify({ gate: "x", generatedBy: "x", totals: {}, rows: [] }));
    execFixtureGit(root, ["init", "-q"]);

    const check = LEDGER_CHECKS["caught-failure-population"];
    expect(check).toBeDefined();
    expect(check?.(root)).toBe(2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── the census over a planted tree: a line move is not drift, a vanished site is (work item 0009) ──

const SITE_PATH = "packages/server/src/probe/absorb.ts";
const SITE_SOURCE = "export function absorb(): void {\n  try {\n    risky();\n  } catch {}\n}\n";
const SITE_ID = `${SITE_PATH}::absorb::catch::1`;
/** A second site on both sides, so a tree whose planted site vanished still derives rows: an EMPTY
 *  derivation is the stage's blindness refusal (exit 2), which would hide the `gone` verdict under test. */
const KEEP = { "packages/server/src/probe/keep.ts": "export function keep(): void {\n  try {\n    risky();\n  } catch {}\n}\n" };
type PlantTree = (files: Readonly<Record<string, string>>) => Promise<string>;

/** The census derived from a planted tree holding `committedFrom`, committed into a SECOND planted tree
 *  whose live source is `live`. Two roots, because a ts-morph Project built over a reused path can serve the
 *  earlier snapshot. */
async function plantCensus(plantedTree: PlantTree, committedFrom: string, live: string): Promise<string> {
  const committed = deriveCaughtFailurePopulation(await plantedTree({ ...KEEP, [SITE_PATH]: committedFrom }));
  expect(committed.rows, "control: both planted sites are census rows").toHaveLength(2);
  return plantedTree({ ...KEEP, [SITE_PATH]: live, [POPULATION_REL]: `${JSON.stringify(committed, null, 2)}\n` });
}

function censusCheck(root: string): number | Promise<number> {
  const check = LEDGER_CHECKS["caught-failure-population"];
  if (check === undefined) {
    throw new Error("the caught-failure-population freshness check is not registered");
  }
  return check(root);
}

test("a line inserted ABOVE a census site leaves the census fresh — the committed rows carry no coordinate", async ({ plantedTree }) => {
  const root = await plantCensus(plantedTree, SITE_SOURCE, `// a new line above the site\n${SITE_SOURCE}`);
  expect(await censusCheck(root)).toBe(0);
});

test("a census site that VANISHED reds, naming its siteId", async ({ plantedTree }) => {
  const root = await plantCensus(plantedTree, SITE_SOURCE, "export const NO_SITE = 1;\n");
  const committed = JSON.parse(readFileSync(join(root, POPULATION_REL), "utf8")) as CaughtFailurePopulation;
  expect(censusDrift(committed, deriveCaughtFailurePopulation(root)).drift.join("\n")).toContain(`gone   ${SITE_ID}`);
  expect(await censusCheck(root)).toBe(1);
});

test("a same-token catch inserted in a DIFFERENT function above re-keys nothing — only the new site is drift", async ({ plantedTree }) => {
  // The ordinal counts same-token sites per enclosing declaration, not per file: a new `catch` in `before`
  // must not shift `absorb`'s `::catch::1` to `::catch::2`, which would read as one site gone and two new.
  const before = "export function before(): void {\n  try {\n    risky();\n  } catch {}\n}\n";
  const root = await plantCensus(plantedTree, SITE_SOURCE, `${before}${SITE_SOURCE}`);
  const committed = JSON.parse(readFileSync(join(root, POPULATION_REL), "utf8")) as CaughtFailurePopulation;
  const rows = censusDrift(committed, deriveCaughtFailurePopulation(root)).drift.filter((line) => !line.startsWith("totals"));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatch(/^new {4}packages\/server\/src\/probe\/absorb\.ts::before::catch::1 /u);
});

test("a waiver reason that wraps onto continuation comment lines is recorded WHOLE", async ({ plantedTree }) => {
  const waived =
    "export function absorb(): void {\n" +
    "  // @orb-waive caught-failure-ownership(catch): documented — the caller turns\n" +
    "  // null into a typed refusal. Ends if the caller\n" +
    "  // stops checking for null.\n" +
    "  try {\n    risky();\n  } catch {}\n}\n";
  const waivedCensus = deriveCaughtFailurePopulation(await plantedTree({ [SITE_PATH]: waived }));
  expect(waivedCensus.rows.map((r) => r.reason)).toEqual([
    "documented — the caller turns null into a typed refusal. Ends if the caller stops checking for null.",
  ]);
});

test("a COMPLETE reason stops the wrap: an ordinary comment after it is never appended", async ({ plantedTree }) => {
  const source =
    "export function separate(): void {\n" +
    "  // @orb-waive caught-failure-ownership(catch): the toast is the surface. Ends if the toast goes.\n" +
    "  // Direct submit — an ordinary note about the call below.\n" +
    "  try {\n    risky();\n  } catch {}\n}\n";
  const rows = deriveCaughtFailurePopulation(await plantedTree({ [SITE_PATH]: source })).rows;
  expect(rows.map((r) => r.reason)).toEqual(["the toast is the surface. Ends if the toast goes."]);
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
  expect(lines).toContain(`fresh  ${POPULATION_REL}`);
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

/** A temp repo whose deferred roster carries one landed-but-unmarked row, one landed-and-marked row, and
 *  one genuinely-waiting row — plus a DROPPED table below it whose rows have the identical shape. */
function deferredRosterRoot(landedMarked: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "orb-deferred-roster-"));
  // The roster's home is `docs/architecture/history/`, which is where the write below actually lands —
  // the fixture used to create `core/` and then ENOENT on the write it was built to make.
  mkdirSync(join(root, "docs/architecture/history"), { recursive: true });
  mkdirSync(join(root, "tooling/src/verify/gates"), { recursive: true });
  writeFileSync(join(root, "tooling/src/verify/gates/landed-gate.ts"), "export const gate = 1;\n");
  writeFileSync(join(root, "tooling/src/verify/gates/marked-gate.ts"), "export const gate = 1;\n");
  writeFileSync(
    join(root, "docs/architecture/history/Core-Enforcement-Deferred-Dropped.md"),
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
