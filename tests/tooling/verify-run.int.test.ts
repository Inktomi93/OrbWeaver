// The `pnpm verify` orchestrator's pure helpers (UNIFIED-VERIFICATION-DESIGN.md §3.1/§3.3): the per-tool
// exit-code classifiers and the run-level max-severity aggregation. Pins the SAME 0/1/2/3 contract the
// legacy `pnpm check` run.ts speaks (tests/tooling/check-run-exit-codes.int.test.ts) — now generalized to
// the registry's named adapters. A signal-kill (null) is ALWAYS a tool error (2), never a verdict; a
// foreign tool's digit is never trusted to mean the scheme's 2/3.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import type { Finding } from "../../scripts/check/contract.ts";
import { gate as verifyRegistryParityGate } from "../../scripts/check/gates/verify-registry-parity.ts";
import { canonicalSort, runPass } from "../../scripts/check/pass.ts";
import type { StageDef } from "../../scripts/verify/registry.ts";
import {
  asViolations,
  eslintScheme,
  ownScheme,
  REGISTRY,
  stagesForTier,
} from "../../scripts/verify/registry.ts";
import { aggregateExit } from "../../scripts/verify/run.ts";
import { resolveSelection } from "../../scripts/verify/selection.ts";
import { expect, test } from "../support/fixtures.ts";

function stage(name: string): StageDef {
  const s = REGISTRY.find((r) => r.name === name);
  if (s === undefined) {
    throw new Error(`no stage ${name}`);
  }
  return s;
}

test("asViolations: clean 0, any non-zero is a violation (tsc's 2 = type errors, not tool-error)", () => {
  expect(asViolations(0)).toBe(0);
  expect(asViolations(1)).toBe(1);
  expect(asViolations(2)).toBe(1); // tsc exits 2 for type errors — a VIOLATION, not a broken checker
  expect(asViolations(127)).toBe(1);
});

test("asViolations: a signal-kill (null) is a TOOL error (2), never a violation", () => {
  expect(asViolations(null)).toBe(2);
});

test("eslintScheme: its 2 IS a tool error (opposite of tsc's 2), 1 is lint problems", () => {
  expect(eslintScheme(0)).toBe(0);
  expect(eslintScheme(1)).toBe(1);
  expect(eslintScheme(2)).toBe(2); // eslint's 2 = config/internal error = the checker broke
  expect(eslintScheme(null)).toBe(2);
});

test("ownScheme: our scheme-speaking scripts pass 0/1/2/3 through; an unexpected code is a tool error", () => {
  expect(ownScheme(0)).toBe(0);
  expect(ownScheme(1)).toBe(1);
  expect(ownScheme(2)).toBe(2);
  expect(ownScheme(3)).toBe(3);
  expect(ownScheme(99)).toBe(2);
  expect(ownScheme(null)).toBe(2);
});

test("aggregateExit: clean when every stage is 0", () => {
  expect(aggregateExit([0, 0, 0])).toBe(0);
});

test("aggregateExit: a single tool-error (2) dominates violations (1) and misuse (3)", () => {
  expect(aggregateExit([1, 2, 0])).toBe(2);
  expect(aggregateExit([3, 2])).toBe(2);
});

test("aggregateExit: misuse (3) dominates a mere violation (1) but not a tool error", () => {
  expect(aggregateExit([1, 3])).toBe(3);
});

test("aggregateExit: violations (1) when the worst is a violation, no tool error / misuse", () => {
  expect(aggregateExit([0, 1])).toBe(1);
});

// ── tier composition (§3.2) — the registry is the ONE spelling of "run everything" ──

test("the static tier is EXACTLY the legacy `pnpm check` 8 stages, in order (byte-compatible behavior)", () => {
  const staticNames = stagesForTier("static").map((s) => s.name);
  expect(staticNames).toEqual([
    "lint:biome",
    "lint:eslint",
    "types:packages",
    "types:graph",
    "types:testd",
    "structure:full",
    "imports:depcruise",
    "docs:format",
  ]);
});

test("changed ⊂ static ⊂ push ⊂ full — every scoped tier's stages are a subset of the next", () => {
  const names = (t: "changed" | "static" | "push" | "full"): Set<string> =>
    new Set(stagesForTier(t).map((s) => s.name));
  const changed = names("changed");
  const staticT = names("static");
  const push = names("push");
  const full = names("full");
  for (const n of changed) {
    expect(staticT.has(n)).toBe(true);
  }
  for (const n of staticT) {
    expect(push.has(n)).toBe(true);
  }
  for (const n of push) {
    expect(full.has(n)).toBe(true);
  }
});

test("the push tier carries the behavioral suites the static tier omits (the `bots run check and miss` fix)", () => {
  const push = new Set(stagesForTier("push").map((s) => s.name));
  expect(push.has("tests:node")).toBe(true);
  expect(push.has("browser:ct")).toBe(true);
  expect(push.has("browser:e2e-smoke")).toBe(true);
  // …and the static tier does NOT (the core hole §2.1).
  const staticT = new Set(stagesForTier("static").map((s) => s.name));
  expect(staticT.has("tests:node")).toBe(false);
});

// ── V2 scope propagation (§3.4) — the ONE selection resolver feeds every stage's scopedArgv ──

test("resolveSelection --file: derives the per-tool views (eslint surface, tsc owner, depcruise, docs)", () => {
  // A ui src file + a docs file. eslint sees the ui file; tsc owns it via packages/ui/tsconfig; depcruise
  // sees the packages/ file; docs sees the .md.
  const sel = resolveSelection({
    kind: "file",
    paths: ["packages/ui/src/primitives/button/variants.ts", "docs/architecture/core/AGENTS.md"],
  });
  expect(sel.eslintPaths).toContain("packages/ui/src/primitives/button/variants.ts");
  expect(sel.tsconfigs).toContain("packages/ui/tsconfig.json");
  expect(sel.depcruisePaths).toContain("packages/ui/src/primitives/button/variants.ts");
  expect(sel.docsPaths).toContain("docs/architecture/core/AGENTS.md");
  // A docs file is NOT in the eslint/tsc/depcruise surfaces.
  expect(sel.eslintPaths).not.toContain("docs/architecture/core/AGENTS.md");
});

test("resolveSelection: a tests/ file flags the graph-only trees (types:graph runs at changed scope)", () => {
  const sel = resolveSelection({ kind: "file", paths: ["tests/tooling/verify-run.int.test.ts"] });
  expect(sel.touchesGraphOnlyTrees).toBe(true);
  // …and a packages/ src file does NOT.
  const pkg = resolveSelection({
    kind: "file",
    paths: ["packages/ui/src/primitives/button/variants.ts"],
  });
  expect(pkg.touchesGraphOnlyTrees).toBe(false);
});

test("types:graph scopedArgv: deferred (whole-only) unless the selection touches a graph-only tree", () => {
  const pkgSel = resolveSelection({
    kind: "file",
    paths: ["packages/ui/src/primitives/button/variants.ts"],
  });
  expect(stage("types:graph").scopedArgv?.(pkgSel)).toBe("whole-only");
  const testSel = resolveSelection({ kind: "file", paths: ["tests/tooling/x.int.test.ts"] });
  expect(stage("types:graph").scopedArgv?.(testSel)).toEqual(["pnpm", "typecheck:graph"]);
});

test("types:testd + browser:* + tests:parity are whole-only (no scopedArgv) — deferred at a scoped tier", () => {
  for (const name of [
    "types:testd",
    "browser:ct",
    "browser:e2e-smoke",
    "browser:e2e",
    "tests:parity",
  ]) {
    expect(stage(name).scopedArgv).toBeUndefined();
  }
});

test("lint:eslint scopedArgv: skip-empty when no file is in the eslint surface", () => {
  const sel = resolveSelection({ kind: "file", paths: ["scripts/verify/registry.ts"] });
  expect(stage("lint:eslint").scopedArgv?.(sel)).toBe("skip-empty");
});

test("structure:full scopedArgv: routes to check:scope with the selection's flag (walk-scoped gates)", () => {
  const sel = resolveSelection({ kind: "package", name: "ui" });
  expect(stage("structure:full").scopedArgv?.(sel)).toEqual([
    "pnpm",
    "check:scope",
    "--package",
    "ui",
  ]);
});

test("every stage carries a classify + non-empty tiers", () => {
  for (const s of REGISTRY) {
    expect(s.tiers.length).toBeGreaterThan(0);
    expect(typeof s.classify).toBe("function");
  }
});

test("every manual-tier stage carries a reason", () => {
  const manualWithoutReason = REGISTRY.filter(
    (s) => s.tiers.includes("manual") && s.manualReason === undefined,
  );
  expect(manualWithoutReason).toEqual([]);
});

// ── V4 verify-registry-parity (§3.6) — "a forgotten script is a structural violation" ──
// Run the fsBacked gate over a real temp-dir package.json against the REAL registry (imported by the gate).

function runParityGate(pkgScripts: Readonly<Record<string, string>>): readonly Finding[] {
  const root = mkdtempSync(join(tmpdir(), "orb-parity-gate-"));
  try {
    const abs = join(root, "package.json");
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, JSON.stringify({ scripts: pkgScripts }));
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const result = runPass([verifyRegistryParityGate], {
      root,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    });
    return canonicalSort(
      result.gates.find((g) => g.name === verifyRegistryParityGate.name)?.findings ?? [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("verify-registry-parity: a verification-shaped script with no tier is a violation (arm 1 bites)", () => {
  // `verify` present so arm 2 (dead-row) is guarded off; the bogus test:* script is unplaced → RED.
  const findings = runParityGate({ verify: "x", "test:visual-regression": "playwright test" });
  const arm1 = findings.filter((f) => (f.message ?? "").includes("not a `pnpm verify` stage"));
  expect(arm1).toHaveLength(1);
});

test("verify-registry-parity: an allowlisted writer/inspector is NOT flagged (no over-bite)", () => {
  // format (writer) + check:show (inspector) + check:scope (sub-tool) are on the NON_STAGE_ALLOWLIST.
  const findings = runParityGate({
    verify: "x",
    format: "biome format --write .",
    "check:show": "tsx scripts/check/show.ts",
    "check:scope": "tsx scripts/check/scoped.ts",
    // A real registered stage name → arm 2 (dead-row) would fire for the OTHER registered scripts absent
    // here, so we omit `verify`'s dead-row trigger by… keeping only allowlisted + non-verify scripts. The
    // dead-row arm only runs when `verify` is present AND a registered script is missing — here every
    // registered script IS missing, so this asserts arm-1 stays quiet on the allowlist (the dead-row noise
    // is arm 2, exercised separately by the real-tree run, not this near-miss).
  });
  const arm1 = findings.filter((f) => (f.message ?? "").includes("not a `pnpm verify` stage"));
  expect(arm1).toHaveLength(0);
});

test("verify-registry-parity: a dev-only package.json (no verify host) is fully clean (arm 2 guarded)", () => {
  // No `verify` script → arm 2 no-ops; no verification-shaped script → arm 1 quiet. Total clean — the
  // synthetic near-miss the gate's own mustPass asserts.
  expect(runParityGate({ dev: "vite", build: "vite build" })).toEqual([]);
});
