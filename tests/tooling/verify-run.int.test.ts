// The `pnpm verify` orchestrator's pure helpers (UNIFIED-VERIFICATION-DESIGN.md §3.1/§3.3): the per-tool
// exit-code classifiers and the run-level max-severity aggregation. Pins the SAME 0/1/2/3 contract the
// retired `pnpm check` orchestrator spoke — now generalized to the registry's named adapters (this test
// supersedes that orchestrator's exit-code pins). A signal-kill (null) is ALWAYS a tool error (2), never a verdict; a
// foreign tool's digit is never trusted to mean the scheme's 2/3.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Project } from "ts-morph";
import type { Finding } from "../../scripts/check/contract.ts";
import { gate as verifyRegistryParityGate } from "../../scripts/check/gates/verify-registry-parity.ts";
import { canonicalSort, runPass } from "../../scripts/check/pass.ts";
import type { StageDef } from "../../scripts/verify/registry.ts";
import { asViolations, eslintScheme, ownScheme, REGISTRY, stagesForTier } from "../../scripts/verify/registry.ts";
import type { StageResult } from "../../scripts/verify/run.ts";
import { aggregateExit, failReason, parse } from "../../scripts/verify/run.ts";
import { resolveSelection } from "../../scripts/verify/selection.ts";
import { expect, test } from "../support/fixtures.ts";
import { withTree } from "./_support.ts";

/** A parse result that IS a misuse error (what main() maps to exit 3). */
function isMisuse(argv: readonly string[]): boolean {
  return "error" in parse(argv);
}

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

// ── the failure-block presentation (§3.3): a tool-error (exit 2 — a BROKEN checker) is never dressed as a
// violation. eslint's exit 2 (e.g. "No files matching the pattern" on a deleted path) classifies to 2; the
// tail failure line must carry the tool-error glyph + TOOL-ERROR label, not the violations glyph. ──

function failedStage(name: string, exitCode: number): StageResult {
  return {
    name,
    group: "lint",
    mode: "scoped",
    ok: false,
    exitCode,
    durationMs: 1,
    logFile: `reports/verify/${name.replace(/:/gu, "-")}.log`,
    failureExcerpt: null,
    runsAt: null,
  };
}

test("failReason: an eslint exit-2 TOOL error renders as a tool-error (‼ · TOOL-ERROR), never a violation", () => {
  const line = failReason(failedStage("lint:eslint", eslintScheme(2)));
  expect(line).toContain("TOOL-ERROR");
  expect(line).toContain("‼");
  expect(line).not.toContain("violations");
  expect(line).not.toContain("✗"); // the violations glyph must NOT appear on a tool-error line
});

test("failReason: a genuine violation (exit 1) still renders as ✗ · violations", () => {
  const line = failReason(failedStage("lint:biome", 1));
  expect(line).toContain("violations");
  expect(line).toContain("✗");
  expect(line).not.toContain("‼");
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

test("the static tier is EXACTLY the known ordered stage set (the pre-commit `pnpm check` battery)", () => {
  // The legacy `pnpm check` was 8 stages; the type-membership floor (UNIFIED-VERIFICATION-DESIGN.md §3)
  // adds two more type stages IN the types group: `types:tests-dom` (the DOM-coupled non-`.tsx` test home)
  // and `types:tests-membership` (the reconciliation guard that makes a silently-un-type-checked test file
  // structurally impossible). Both are whole-tree invariants → static/push/full. `tests:execution-membership`
  // (#22, docs/retro-workboard.md) is its EXECUTION-lane sibling — same whole-tree-invariant shape, in the
  // `tests` group (it reconciles RUNNER coverage, not type-program coverage).
  const staticNames = stagesForTier("static").map((s) => s.name);
  expect(staticNames).toEqual([
    "lint:biome",
    "lint:eslint",
    "types:packages",
    "types:graph",
    "types:testd",
    "types:tests-dom",
    "types:tests-membership",
    "tests:execution-membership",
    // The db-baseline parity stage (2026-08-02): the committed squashed baseline vs the live schema.
    // Promoted from a push-only int test after two baseline-regen misses shipped and sat ~10h.
    "structure:db-baseline",
    // drizzle-kit's own journal/snapshot-chain validator (2026-08-02): near-no-op against the single
    // squashed baseline, ARMED for the first post-launch incremental migration (Tier-1-DB.md).
    "structure:drizzle-kit",
    "structure:full",
    "imports:depcruise",
    "deps:knip",
    "docs:format",
    "docs:catalog",
  ]);
});

test("static ⊂ push ⊂ full (the whole-tree ladder); changed ⊆ push (the scoped inner loop)", () => {
  const names = (t: "changed" | "static" | "push" | "full"): Set<string> => new Set(stagesForTier(t).map((s) => s.name));
  const changed = names("changed");
  const staticT = names("static");
  const push = names("push");
  const full = names("full");
  // The WHOLE-TREE ladder strictly nests — each tier adds stages, never drops one.
  for (const n of staticT) {
    expect(push.has(n)).toBe(true);
  }
  for (const n of push) {
    expect(full.has(n)).toBe(true);
  }
  // `changed` is the SCOPED inner loop and is deliberately NOT ⊆ static: it carries related-tests
  // (tests:node, run over vitest's changed-file graph) that static omits by doctrine — static is the
  // born-compliant TEST-FREE commit gate (the `bots run check and miss` line below). But everything the
  // inner loop runs, the push tier also runs whole-tree, so the honest containment is changed ⊆ push —
  // with ONE named exception: `browser:ct`. Its scoped mirror-mapping runs at `changed`; at push its
  // coverage rides `tests:node` (the WHOLE CT suite) under a DIFFERENT stage name, not a same-named push
  // row (a push browser:ct row would double-run it). So the behavioral containment holds (CT runs at push),
  // the stage-NAME containment carves out browser:ct.
  for (const n of changed) {
    if (n === "browser:ct") {
      continue;
    }
    expect(push.has(n)).toBe(true);
  }
  // The carve-out's behavioral half: CT's push coverage rides tests:node (the whole suite), not a push
  // browser:ct row — so `changed`'s CT inner loop IS covered whole-tree at push.
  expect(changed.has("browser:ct")).toBe(true);
  expect(push.has("browser:ct")).toBe(false);
  expect(push.has("tests:node")).toBe(true);
});

test("the push tier carries the behavioral suites the static tier omits (the `bots run check and miss` fix)", () => {
  const push = new Set(stagesForTier("push").map((s) => s.name));
  expect(push.has("tests:node")).toBe(true);
  expect(push.has("browser:e2e-smoke")).toBe(true);
  // CT rides INSIDE tests:node since 2026-07-17 (`pnpm test` composes `pnpm test:ct --retries=2` — the
  // split existed only for the retired single-thread constraint), so a push/full browser:ct row would
  // run the suite TWICE; the stage survives at `manual` (CT-only whole-suite iteration) AND `changed` (the
  // scoped mirror-mapping inner loop, LANDED 2026-07-17). It is deliberately NOT at push/full: the WHOLE
  // suite runs at push INSIDE tests:node, so a push browser:ct row would double-run it.
  expect(push.has("browser:ct")).toBe(false);
  expect(stage("browser:ct").tiers).toEqual(["changed", "manual"]);
  // The composition is the load-bearing half — if `test` stops composing test:ct, CT silently leaves
  // EVERY tier. Pin the script itself, not just the tier layout.
  const rootPkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    readonly scripts: Record<string, string>;
  };
  expect(rootPkg.scripts["test"]).toContain("pnpm test:ct --retries=2");
  // …and the static tier does NOT run behavioral suites (the core hole §2.1).
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

test("docs:catalog changed scope covers all Markdown and its own control files", () => {
  const design = resolveSelection({ kind: "file", paths: ["docs/design/staleness-and-session-freshness.md"] });
  expect(stage("docs:format").scopedArgv?.(design)).toBe("skip-empty");
  expect(stage("docs:catalog").scopedArgv?.(design)).toEqual(["pnpm", "check:doc-catalog"]);

  const control = resolveSelection({ kind: "file", paths: ["docs/catalog/lanes.json"] });
  expect(stage("docs:catalog").scopedArgv?.(control)).toEqual(["pnpm", "check:doc-catalog"]);

  const sourceOnly = resolveSelection({ kind: "file", paths: ["packages/server/src/index.ts"] });
  expect(stage("docs:catalog").scopedArgv?.(sourceOnly)).toBe("skip-empty");
});

test("resolveSelection: a DELETED path lints clean — dropped from the tool file-lists, KEPT in paths + its tsconfig", () => {
  // The D79 same-commit-deletion doctrine: a git-changed set carries deleted paths (git diff --name-only
  // HEAD keeps them). eslint/depcruise/docs take CONCRETE file args and hard-error on a path that's gone
  // ("No files matching the pattern" ⇒ the whole stage aborts) — so those views must DROP the deletion,
  // while `paths` (the structure walk) + `tsconfigs` (the deleted file's owning per-package typecheck) KEEP
  // it. A co-changed EXISTING server file must survive in every view.
  const deleted = "packages/server/src/domain/discovery/substrate/json-extract.ts"; // a real T6 deletion
  const survivor = "packages/server/src/index.ts"; // exists on disk
  const sel = resolveSelection({ kind: "changed", paths: [deleted, survivor] });
  // eslint/depcruise drop the deletion but keep the survivor.
  expect(sel.eslintPaths).not.toContain(deleted);
  expect(sel.eslintPaths).toContain(survivor);
  expect(sel.depcruisePaths).not.toContain(deleted);
  expect(sel.depcruisePaths).toContain(survivor);
  // NOT a blanket drop: the deletion stays in `paths` (mirror/structure walk) and still drives the owning
  // per-package tsc (deleting a file can break its consumers — that package MUST re-typecheck).
  expect(sel.paths).toContain(deleted);
  expect(sel.tsconfigs).toContain("packages/server/tsconfig.json");
});

test("resolveSelection: a tests/ file flags the graph-only trees (types:graph runs at changed scope)", () => {
  const sel = resolveSelection({ kind: "file", paths: ["tests/tooling/verify-run.int.test.ts"] });
  expect(sel.touchesGraphOnlyTrees).toBe(true);
  // …and a packages/ src file NOT import-pulled into the DOM-less graph does NOT (attachment-url-context
  // is a client-only feature hook — its whole closure stays in packages/client/src, never crossing into a
  // tests/ or scripts/ root, so the graph program never sees it via import-pull).
  const pkg = resolveSelection({
    kind: "file",
    paths: ["packages/client/src/features/chat/hooks/attachment-url-context.tsx"],
  });
  expect(pkg.touchesGraphOnlyTrees).toBe(false);
});

test("resolveSelection: an import-pulled src file DOES flag the graph (the TS2584 overlay, rule 5)", () => {
  // button/variants.ts is transitively imported by the DOM-less root graph (confirmed via tsgo
  // --listFilesOnly) — so it belongs to TWO programs (packages/ui WITH dom AND the graph DOM-less). Editing
  // it must run types:graph, or the TS2584-class break (a graph consumer of a dom-typed export) escapes at
  // verify --file. Its per-package owner stays ui (the graph is a separate stage, not a tsc -p owner).
  const sel = resolveSelection({
    kind: "file",
    paths: ["packages/ui/src/primitives/button/variants.ts"],
  });
  expect(sel.touchesGraphOnlyTrees).toBe(true);
  expect(sel.tsconfigs).toEqual(["packages/ui/tsconfig.json"]);
});

test("types:graph scopedArgv: deferred (whole-only) unless the selection touches the graph program", () => {
  const pkgSel = resolveSelection({
    kind: "file",
    paths: ["packages/client/src/features/chat/hooks/attachment-url-context.tsx"],
  });
  expect(stage("types:graph").scopedArgv?.(pkgSel)).toBe("whole-only");
  const testSel = resolveSelection({ kind: "file", paths: ["tests/tooling/x.int.test.ts"] });
  expect(stage("types:graph").scopedArgv?.(testSel)).toEqual(["pnpm", "typecheck:graph"]);
});

test("types:graph per --package: a NODE package RUNS it (in the graph), a BROWSER package DEFERS it", () => {
  // kit/server/db/contracts src ARE graph roots (tsconfig.json include: packages/*/src) → --package must
  // run types:graph, or the DOM-less TS2584 class escapes a whole-package scope exactly as it did --file.
  for (const nodePkg of ["kit", "server", "db", "contracts"]) {
    const sel = resolveSelection({ kind: "package", name: nodePkg });
    expect(sel.touchesGraphOnlyTrees).toBe(true);
    expect(stage("types:graph").scopedArgv?.(sel)).toEqual(["pnpm", "typecheck:graph"]);
  }
  // ui/client src are graph-EXCLUDED (dom-typechecked by their own tsconfig) → graph honestly defers.
  for (const browserPkg of ["ui", "client"]) {
    const sel = resolveSelection({ kind: "package", name: browserPkg });
    expect(sel.touchesGraphOnlyTrees).toBe(false);
    expect(stage("types:graph").scopedArgv?.(sel)).toBe("whole-only");
  }
});

test("types:testd + types:tests-* + browser:e2e* + tests:parity are whole-only (no scopedArgv) — deferred at a scoped tier", () => {
  for (const name of [
    "types:testd",
    // The type-membership floor stages: tests-dom is one tiny program, tests-membership is a whole-tree
    // reconciliation — both are whole-tree invariants with no honest scoped form (§3.4).
    "types:tests-dom",
    "types:tests-membership",
    // tests-execution-membership's #22 sibling: same whole-tree-reconciliation shape (unions every
    // runner's --list view), no honest scoped form.
    "tests:execution-membership",
    // The whole schema module vs the ONE committed baseline — no partial-file form exists.
    "structure:db-baseline",
    // The ONE migrations dir's journal/snapshot chain — likewise no partial-file form.
    "structure:drizzle-kit",
    // browser:ct is NOT here since 2026-07-17 — it gained a scopedArgv (the CT view mirror-mapping). The
    // e2e suites stay whole-only (cross-cutting by nature).
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

test("structure:full scopedArgv: routes to scoped.ts with the selection's flag (walk-scoped gates)", () => {
  const sel = resolveSelection({ kind: "package", name: "ui" });
  expect(stage("structure:full").scopedArgv?.(sel)).toEqual(["tsx", "scripts/check/scoped.ts", "--package", "ui"]);
});

// ── the CT changed-scope view (§3.4, the ONE deliberately-open edge, LANDED 2026-07-17) — mirror + the
// declared blast-radius sweeps. Scoped CT UNDER-selects on purpose; the push bar is the coverage verdict. ──

test("ct view: a ui primitive source selects EXACTLY its test-layout mirror .ct.tsx", () => {
  // badge.tsx mirrors to tests/ui/primitives/badge/badge.ct.tsx (exists on disk) — mode "files", that one.
  const sel = resolveSelection({ kind: "changed", paths: ["packages/ui/src/primitives/badge/badge.tsx"] });
  expect(sel.ct).toEqual({ mode: "files", targets: ["tests/ui/primitives/badge/badge.ct.tsx"] });
});

test("ct view: a source with NO mirror on disk contributes nothing (no mirror, no CT)", () => {
  // index.ts barrels have no `.ct.tsx` mirror — the existsSync guard drops them (no contribution → skip).
  const sel = resolveSelection({ kind: "changed", paths: ["packages/ui/src/primitives/badge/index.ts"] });
  expect(sel.ct).toEqual({ mode: "skip", targets: [] });
});

test("ct view: a tokens file SWEEPS both trees (the light-dark()/computed-style incident class)", () => {
  const sel = resolveSelection({ kind: "changed", paths: ["packages/ui/src/tokens/semantic.ts"] });
  expect(sel.ct.mode).toBe("sweep");
  expect(sel.ct.targets.toSorted()).toEqual(["tests/client", "tests/ui"]);
});

test("ct view: a client state/ file SWEEPS tests/client only (the section-registry incident class)", () => {
  const sel = resolveSelection({ kind: "changed", paths: ["packages/client/src/state/active-chat-store.ts"] });
  expect(sel.ct).toEqual({ mode: "sweep", targets: ["tests/client"] });
});

test("ct view: a server-only change → skip (no CT surface)", () => {
  const sel = resolveSelection({ kind: "changed", paths: ["packages/server/src/index.ts"] });
  expect(sel.ct).toEqual({ mode: "skip", targets: [] });
});

test("ct view: a changed .ct.tsx selects ITSELF", () => {
  const ct = "tests/ui/primitives/badge/badge.ct.tsx";
  const sel = resolveSelection({ kind: "changed", paths: [ct] });
  expect(sel.ct).toEqual({ mode: "files", targets: [ct] });
});

test("ct view: a .suite.ct.tsx is NEVER mirror-selected (it mirrors no single module — rides sweeps only)", () => {
  // The touch-target-floor cross-cutting suite: changed alone, it selects nothing (it is not a module mirror).
  const sel = resolveSelection({ kind: "changed", paths: ["tests/ui/touch-target-floor.suite.ct.tsx"] });
  expect(sel.ct).toEqual({ mode: "skip", targets: [] });
});

test("ct view: a shared GROUP CORE sweeps its group dir; a chart source's mirror stays file-scoped", () => {
  // charts/chart/** is consumed by every chart primitive → sweep the whole charts group mirror.
  const core = resolveSelection({ kind: "changed", paths: ["packages/ui/src/charts/chart/chart.tsx"] });
  expect(core.ct).toEqual({ mode: "sweep", targets: ["tests/ui/charts"] });
});

test("browser:ct scopedArgv: skip-empty on no CT surface; a DIRECT playwright run over the CT view otherwise", () => {
  const skip = resolveSelection({ kind: "changed", paths: ["packages/server/src/index.ts"] });
  expect(stage("browser:ct").scopedArgv?.(skip)).toBe("skip-empty");
  // A mirror hit → a direct `playwright test -c playwright-ct.config.ts <mirror>` — NOT `pnpm test:ct` (no
  // cache nuke, no retries flag): the two deliberate inner-loop divergences (§3.7).
  const hit = resolveSelection({ kind: "changed", paths: ["packages/ui/src/primitives/badge/badge.tsx"] });
  expect(stage("browser:ct").scopedArgv?.(hit)).toEqual(["playwright", "test", "-c", "playwright-ct.config.ts", "tests/ui/primitives/badge/badge.ct.tsx"]);
});

// ── argv parsing (parseArgs, strict schema §3.4) — the misuse (exit 3) matrix + good invocations ──

test("parse: an UNKNOWN flag is misuse (exit 3), never silent-ignore", () => {
  expect(isMisuse(["--bogus", "--list"])).toBe(true);
});

test("parse: a value option with NO value (or a flag as its value) is misuse", () => {
  expect(isMisuse(["--package"])).toBe(true); // no value
  expect(isMisuse(["--package", "--json"])).toBe(true); // next token is a flag, not a value
  expect(isMisuse(["--scope"])).toBe(true);
  expect(isMisuse(["--tier"])).toBe(true);
});

test("parse: --package=db (inline value) parses and runs (not misuse)", () => {
  const r = parse(["--package=db", "--list"]);
  expect("error" in r).toBe(false);
});

test("parse: --file with no path is misuse; --file a b (space-separated paths) parses", () => {
  expect(isMisuse(["--file"])).toBe(true);
  expect(isMisuse(["--file", "nonexistent-xyz-123.ts"])).toBe(true); // path not under repo/nonexistent
  const r = parse(["--file", "scripts/verify/run.ts", "scripts/verify/registry.ts"]);
  if ("error" in r) {
    throw new Error(`expected a parse, got misuse: ${r.error}`);
  }
  expect(r.selection?.kind).toBe("file");
  expect(r.selection?.paths).toEqual(["scripts/verify/run.ts", "scripts/verify/registry.ts"]);
});

test("parse: more than one scope selector is misuse", () => {
  expect(isMisuse(["--package", "db", "--scope", "packages/ui"])).toBe(true);
});

test("parse: more than one tier is misuse; --tier <bad> is misuse", () => {
  expect(isMisuse(["--static", "--push"])).toBe(true);
  expect(isMisuse(["--tier=bogus"])).toBe(true);
});

test("parse: bare positionals with no scope selector are misuse (not silently dropped)", () => {
  expect(isMisuse(["foo", "bar"])).toBe(true);
});

test("parse: valid tier flags resolve to the right tier (default = static, scope implies changed)", () => {
  const asTier = (argv: readonly string[]): string | undefined => {
    const r = parse(argv);
    return "error" in r ? undefined : r.tier;
  };
  expect(asTier([])).toBe("static"); // default
  expect(asTier(["--push"])).toBe("push");
  expect(asTier(["--full"])).toBe("full");
  expect(asTier(["--tier", "push"])).toBe("push");
  expect(asTier(["--package", "db"])).toBe("changed"); // a scope flag implies the changed (inner-loop) tier
  expect(asTier(["--changed", "git"])).toBe("changed");
});

// ── null-spawn end-to-end (§3.3): a STAGE whose child fails to spawn (nonexistent bin ⇒ ENOENT ⇒ status
// null) must surface as tool-error (2) at the RUN's aggregated exit, never a silent 0. The classifiers are
// unit-pinned above; this drives the real spawn→classify→aggregate path with a genuine failed spawn. ──

test("a stage whose child fails to spawn (ENOENT) aggregates to tool-error (2), not a silent 0", () => {
  // A REAL failed spawn: a nonexistent binary. Node's spawnSync returns status:null (signal:null, error
  // ENOENT) — the exact shape a signal-kill also produces, which the classifiers map to 2.
  const result = spawnSync("orb-nonexistent-binary-xyz-123", ["--noop"], {
    shell: false,
    encoding: "utf8",
  });
  expect(result.status).toBeNull();

  // Feed the real child status through a real stage's real classify (asViolations here) exactly as
  // run.ts's runOneStage does, then through the real run-level aggregation.
  const failedStageExit = stage("lint:biome").classify(result.status);
  expect(failedStageExit).toBe(2); // null spawn ⇒ TOOL-ERROR, not a violation and not clean

  // A run where every OTHER stage was clean still exits 2 — the failed spawn dominates, no silent 0.
  const runExit = aggregateExit([0, 0, failedStageExit, 0]);
  expect(runExit).toBe(2);
});

test("every stage carries a classify + non-empty tiers", () => {
  for (const s of REGISTRY) {
    expect(s.tiers.length).toBeGreaterThan(0);
    expect(typeof s.classify).toBe("function");
  }
});

// A stage NAME is an IDENTITY, not a label: run.ts derives the stage's log path from it
// (`reports/verify/<name with ':'→'-'>.log`) and keys the run artifact's per-stage row by it, while every
// lookup — this file's `stage()`, and any `--stage`-shaped selection — is a first-match `.find`. Two rows
// sharing a name (or two names that FLATTEN to the same log file: "a:b" and "a-b" both land on `a-b.log`)
// would silently overwrite one another's output and hide the second row behind the first — a verification
// stage that ran but whose evidence is gone. The registry's `name` doc says "kebab, unique"; nothing enforced
// it. (The other two completeness arms are already covered: the `verify-registry-parity` gate reconciles both
// directions between the registry and package.json — arm 1 = an unplaced verification-shaped script, arm 2 =
// a registry row whose `pnpm <script>` argv names no script — exercised below.)
const STAGE_NAME_RE = /^[a-z0-9]+(?:[:-][a-z0-9]+)*$/u;

test("stage names are unique, kebab, and collide-free as log filenames", () => {
  const names = REGISTRY.map((s) => s.name);
  expect(new Set(names).size).toBe(names.length);

  const logNames = names.map((n) => n.replace(/:/gu, "-"));
  expect(new Set(logNames).size).toBe(logNames.length);

  expect(names.filter((n) => !STAGE_NAME_RE.test(n))).toEqual([]);
});

test("every manual-tier stage carries a reason", () => {
  const manualWithoutReason = REGISTRY.filter((s) => s.tiers.includes("manual") && s.manualReason === undefined);
  expect(manualWithoutReason).toEqual([]);
});

// ── V4 verify-registry-parity (§3.6) — "a forgotten script is a structural violation" ──
// Run the fsBacked gate over a real temp-dir package.json against the REAL registry (imported by the gate).

function runParityGate(pkgScripts: Readonly<Record<string, string>>): readonly Finding[] {
  let findings: readonly Finding[] = [];
  withTree({ "package.json": JSON.stringify({ scripts: pkgScripts }) }, (root) => {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const result = runPass([verifyRegistryParityGate], {
      root,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    });
    findings = canonicalSort(result.gates.find((g) => g.name === verifyRegistryParityGate.name)?.findings ?? []);
  });
  return findings;
}

test("verify-registry-parity: a verification-shaped script with no tier is a violation (arm 1 bites)", () => {
  // `verify` present so arm 2 (dead-row) is guarded off; the bogus test:* script is unplaced → RED.
  const findings = runParityGate({ verify: "x", "test:visual-regression": "playwright test" });
  const arm1 = findings.filter((f) => (f.message ?? "").includes("not a `pnpm verify` stage"));
  expect(arm1).toHaveLength(1);
});

test("verify-registry-parity: an allowlisted writer/inspector is NOT flagged (no over-bite)", () => {
  // format (writer) + check:show (inspector) are on the NON_STAGE_ALLOWLIST.
  const findings = runParityGate({
    verify: "x",
    format: "biome format --write .",
    "check:show": "tsx scripts/check/show.ts",
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
