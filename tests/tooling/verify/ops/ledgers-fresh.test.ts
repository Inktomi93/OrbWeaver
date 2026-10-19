// The PERMANENT PIN for the `ledgers:fresh` stage (#817): a stale committed generated output must red at the
// commit bar. The comparators are pure, so these arms cost milliseconds; the registry arms pin when the stage runs.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import {
  BASELINE_HELP,
  deriveSnapFlagsIndexMarkdown,
  LEDGER_CHECKS,
  ledgerReport,
  REGISTRY,
  resolveSelection,
  runBaseline,
  SNAP_FLAGS_INDEX_REL,
  snapFlagsIndexDrift,
  typeConfigsDrift,
} from "@orb/tooling/verify";
import { scaledBudget } from "../../_load-budget.ts";

const STAGE = "ledgers:fresh";

// ── the registry contract: complete populations at whole tiers and selected-path triggers ──

// One cold `resolveSelection`. MEASURED: 3.2 s alone at per-core load 0.3, and 5.7 s beside a whole affected-test run.
// The base is twice the worst loaded reading.
const SELECTION_TIMEOUT = scaledBudget(12_000);

test("the stage runs at every whole-tree tier and uses its complete argv for selected paths", { timeout: SELECTION_TIMEOUT }, () => {
  const stage = REGISTRY.find((entry) => entry.name === STAGE);
  expect(stage, `${STAGE} must be registered`).toBeDefined();
  expect(stage?.tiers).toEqual(["changed", "static", "push", "full", "product", "weekly"]);
  expect(stage?.argv).toEqual(["pnpm", "check:ledgers-fresh"]);
  // The trigger changes when the stage runs, never the population it derives: source and a markdown ledger run the
  // whole command, and plain markdown, which no ledger derives from, owes nothing.
  // The trigger reads only the selection's paths, so one resolved selection is re-pointed per case.
  const selection = resolveSelection({ kind: "file", paths: ["README.md"] });
  expect(stage?.scopedArgv?.(selection)).toBe("skip-empty");
  for (const path of ["tooling/src/verify/ops/ledgers-fresh.ts", SNAP_FLAGS_INDEX_REL]) {
    expect(stage?.scopedArgv?.({ ...selection, paths: [path] }), path).toEqual(stage?.argv);
  }
});

test("a stale ledger never suppresses its sibling's verdict from the same run", () => {
  // The regression this pins was LIVE on the stage's first run: `results.every(report)` short-circuits at
  // the first false, so the first ledger's drift printed and the second was never reported at all — a run that
  // silently judged one of the two things it exists to judge.
  const lines = ledgerReport([
    { ledger: "docs/a-stale-ledger.json", regen: "regenerate it", derived: 1, drift: ["new    something"] },
    { ledger: "docs/a-fresh-ledger.json", regen: "regenerate it", derived: 1, drift: [] },
  ]).join("\n");

  expect(lines).toContain("STALE  docs/a-stale-ledger.json");
  expect(lines).toContain("fresh  docs/a-fresh-ledger.json");
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
