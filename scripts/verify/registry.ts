// The verification stage registry (UNIFIED-VERIFICATION-DESIGN.md §3.1) — every verification surface in
// the repo, self-described: each stage declares its tier membership, how to scope it, and how to map its
// child's native exit into the repo's 0/1/2/3 contract. A "forgotten script" becomes structurally
// impossible: verify-registry-parity.ts reds when a package.json verification-shaped script has no row here.
import type { Selection } from "./selection.ts";

export type Tier = "changed" | "static" | "push" | "full" | "manual";

export type StageGroup = "lint" | "types" | "structure" | "imports" | "deps" | "docs" | "tests" | "browser" | "quality";

/** The scoped invocation for a stage, or the sentinels: "whole-only" ⇒ DEFER at a scoped tier (print the
 *  named notice, record it in the artifact — the check:scope pattern promoted to run level, §3.4);
 *  "skip-empty" ⇒ the scope resolves to no relevant paths, so the stage is a no-op this run (e.g. eslint
 *  with no files in its surface). */
export type ScopedArgv = readonly [string, ...string[]] | "whole-only" | "skip-empty";

export type StageDef = {
  /** kebab, unique — "lint:biome", "types:graph", "tests:node", … */
  readonly name: string;
  readonly group: StageGroup;
  /** Every tier that includes this stage. The whole-tree ladder nests `static ⊂ push ⊂ full`; `changed`
   *  is the SCOPED inner loop (`changed ⊆ push`) — it carries related-tests static omits, so it is NOT a
   *  subset of static (static is the born-compliant test-free commit gate). */
  readonly tiers: readonly Tier[];
  /** The whole-scope invocation (the `pnpm <script>` form, spawned shell:false). */
  readonly argv: readonly [string, ...string[]];
  /** Extra env for the child (merged over the inherited env + the run's NO_COLOR). The CT gate needs
   *  CT_GATE=1 (retries flakes instead of blocking) — the pre-push lefthook set this before. */
  readonly env?: Readonly<Record<string, string>>;
  /** How to run this stage over a Selection (§3.4). ABSENT ⇒ whole-only (deferred at a scoped tier). */
  readonly scopedArgv?: (sel: Selection) => ScopedArgv;
  /** Map the child's native exit into the 0/1/2/3 contract (generalizes run.ts's speaksScheme). */
  readonly classify: (status: number | null) => 0 | 1 | 2 | 3;
  /** For `manual`-tier stages: WHY it isn't automated (rendered in `verify --list`). */
  readonly manualReason?: string;
};

// ── the exit-code classifiers (§3.1) — tiny named adapters, written ONCE ──────────────────────────────
// The contract (§3.3): 0 clean · 1 violations · 2 tool error · 3 misuse. A signal-kill (null) is ALWAYS a
// tool error (2), never a verdict.

const EXIT_CLEAN = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_TOOL_ERROR = 2;
const EXIT_MISUSE = 3;

/** External tools whose non-zero means "found problems" (tsc's 2 = type errors, biome/vitest/playwright/
 *  depcruise/jscpd/cpd). Any non-zero → violation (1); we never trust the foreign digit to mean the
 *  scheme's 2/3. A signal-kill (null) is a tool error. */
export const asViolations = (s: number | null): 0 | 1 | 2 | 3 => {
  if (s === null) {
    return EXIT_TOOL_ERROR;
  }
  return s === EXIT_CLEAN ? EXIT_CLEAN : EXIT_VIOLATIONS;
};

/** eslint's OWN scheme: 0 clean · 1 lint problems · 2 config/internal error (its 2 IS a tool error —
 *  the opposite of tsc's 2). */
export const eslintScheme = (s: number | null): 0 | 1 | 2 | 3 => {
  if (s === null || s >= EXIT_TOOL_ERROR) {
    return EXIT_TOOL_ERROR;
  }
  return s === EXIT_CLEAN ? EXIT_CLEAN : EXIT_VIOLATIONS;
};

/** Our OWN scheme-speaking tsx scripts (report/scoped/verify/format-md/check:file): 0/1/2/3 pass through;
 *  an unexpected code is itself a tool error (2). */
export const ownScheme = (s: number | null): 0 | 1 | 2 | 3 => {
  if (s === EXIT_CLEAN || s === EXIT_VIOLATIONS || s === EXIT_TOOL_ERROR || s === EXIT_MISUSE) {
    return s;
  }
  return EXIT_TOOL_ERROR;
};

// ── the registry ──────────────────────────────────────────────────────────────────────────────────────
// V1 wires the argv (whole-scope) + tiers + classify for every stage. The `scopedArgv` propagation lands
// in V2; stages ship whole-only (deferred at scoped tiers) until then. The static tier is EXACTLY run.ts's
// 8 stages, in order, so `pnpm check` (= `verify --static`) stays byte-compatible.

const STATIC: readonly Tier[] = ["static", "push", "full"];

/** tsc scoped invocation: sole owner → `tsgo -p <config>`; none → skip; multiple owners → the whole
 *  per-package lane (the honest floor, one child not N). Uses tsgo (TS7 native) — the CLI type lanes moved
 *  off tsc6 (byte-identical diagnostics validated; ts-morph/typescript-eslint keep the TS6 API). */
function tscScopedArgv(tsconfigs: readonly string[]): ScopedArgv {
  const sole = tsconfigs[0];
  if (sole === undefined) {
    return "skip-empty";
  }
  if (tsconfigs.length > 1) {
    return ["pnpm", "typecheck"];
  }
  return ["tsgo", "--noEmit", "--pretty", "false", "-p", sole];
}

export const REGISTRY: readonly StageDef[] = [
  // ── lint stage-group (§2.4: biome + eslint are one presented group) ──
  {
    name: "lint:biome",
    group: "lint",
    tiers: ["changed", ...STATIC],
    argv: ["pnpm", "lint"],
    classify: asViolations,
    scopedArgv: (sel) =>
      sel.paths.length === 0 ? "skip-empty" : ["biome", "check", "--diagnostic-level=error", "--reporter=concise", "--no-errors-on-unmatched", ...sel.paths],
  },
  {
    name: "lint:eslint",
    group: "lint",
    tiers: ["changed", ...STATIC],
    argv: ["pnpm", "lint:eslint"],
    classify: eslintScheme,
    scopedArgv: (sel) => {
      const files = sel.eslintPaths;
      // --no-warn-ignored: an explicit path that eslint's config IGNORES (e.g. a generated tokens file)
      // must not become a `--max-warnings 0` FAILURE — at whole scope eslint never sees it; scoped, we
      // hand it the path directly, so we suppress the "file ignored" warning to match whole-scope verdicts.
      return files.length === 0 ? "skip-empty" : ["eslint", "--max-warnings", "0", "--no-warn-ignored", "--cache", "--cache-strategy", "content", ...files];
    },
  },

  // ── types stage-group (§2.4: three tsc programs, each catching a class the others miss) ──
  {
    name: "types:packages",
    group: "types",
    tiers: ["changed", ...STATIC],
    argv: ["pnpm", "typecheck"],
    classify: asViolations,
    // Per-package = the honest floor (file-scoped tsc is unsound — never sees consumers). A single
    // owning program → tsc -p that config; NO file maps to a program → skip; MULTIPLE distinct owners →
    // run the whole per-package lane (`pnpm typecheck`), the honest floor without expanding one stage into
    // N children (spawn is one-argv-per-stage). tsconfigForFirst is the sole-owner fast path.
    scopedArgv: (sel) => tscScopedArgv(sel.tsconfigs),
  },
  {
    name: "types:graph",
    group: "types",
    tiers: STATIC,
    argv: ["pnpm", "typecheck:graph"],
    classify: asViolations,
    // Whole-only in general — the root program is one graph. At changed scope it runs ONLY when the
    // selection touches trees only the root program sees (tests/, scripts/, reset.d.ts); else deferred.
    scopedArgv: (sel) => (sel.touchesGraphOnlyTrees ? ["pnpm", "typecheck:graph"] : "whole-only"),
  },
  {
    name: "types:testd",
    group: "types",
    tiers: STATIC,
    argv: ["pnpm", "test:types"],
    classify: asViolations,
    // vitest typecheck is one program — whole-only, deferred at a scoped tier.
  },
  {
    name: "types:tests-dom",
    group: "types",
    tiers: STATIC,
    argv: ["pnpm", "typecheck:tests-dom"],
    classify: asViolations,
    // The DOM-libbed home (tsconfig.tests-dom.json) for DOM-COUPLED NON-`.tsx` tests: a `.ts` test that
    // can't be a `.tsx` (the int lane is `.ts`-only) but drags a DOM barrel — the root graph `exclude`s it
    // and no `*.tsx` reach-back claims it, so WITHOUT this program it is type-checked by nothing. Tiny (one
    // small `include`) — whole-only, deferred at a scoped tier; the tests-type-membership stage guards that
    // every such escapee is actually listed here.
  },
  {
    name: "types:tests-membership",
    group: "types",
    tiers: STATIC,
    argv: ["pnpm", "check:tests-membership"],
    // Our OWN 0/1/2/3-speaking tsx script (scripts/verify/tests-type-membership.ts): reconciles every
    // tests/** + playwright/** TS file against the union of every type program's import closure and REDs
    // (exit 1) on any file in ZERO programs — the structural floor that makes "silently un-type-checked
    // test" impossible. `--listFilesOnly` = module resolution only, so it stays cheap.
    classify: ownScheme,
    // A WHOLE-TREE invariant (it reconciles the entire test surface against every program) — whole-only,
    // deferred at a scoped tier, like the other cross-file registry/parity reconciliations.
  },

  // ── structure stage-group (the ts-morph single-pass gates) ──
  {
    name: "structure:full",
    group: "structure",
    tiers: STATIC,
    argv: ["pnpm", "check:structure"],
    classify: ownScheme,
    // At a scoped tier the WALK is scoped via scripts/check/scoped.ts (incremental-safe gates over the
    // changed set, whole-project gates deferred-with-notice by scoped.ts itself). It needs its ONE selector.
    scopedArgv: (sel) => sel.checkScopeArgv,
  },

  // ── imports stage-group ──
  {
    name: "imports:depcruise",
    group: "imports",
    tiers: ["changed", ...STATIC],
    argv: ["pnpm", "depcruise"],
    classify: asViolations,
    scopedArgv: (sel) =>
      sel.depcruisePaths.length === 0 ? "skip-empty" : ["depcruise", ...sel.depcruisePaths, "--config", ".dependency-cruiser.cjs", "--output-type", "err-long"],
  },

  // ── deps stage-group ──
  {
    name: "deps:knip",
    group: "deps",
    tiers: STATIC,
    argv: ["pnpm", "knip"],
    // A WHOLE-TREE unused-export/dependency reconciliation (like tests-membership/structure:full) — no
    // partial-file invocation makes sense, so it's whole-only, deferred at a scoped tier.
    classify: asViolations,
  },

  // ── docs stage-group ──
  {
    name: "docs:format",
    group: "docs",
    tiers: ["changed", ...STATIC],
    argv: ["pnpm", "check:docs"],
    classify: ownScheme,
    scopedArgv: (sel) => (sel.docsPaths.length === 0 ? "skip-empty" : ["tsx", "scripts/docs/format-md.ts", "--check", ...sel.docsPaths]),
  },

  // ── tests stage-group (§3.7: the eight lanes as ONE concept with tier + scope) ──
  {
    name: "tests:node",
    group: "tests",
    tiers: ["changed", "push", "full"],
    argv: ["pnpm", "test"],
    classify: asViolations,
    // At changed scope: vitest's own related-test graph over the unit+integration lanes (serial + contract
    // are whole-tree-shaped, deferred to push). Whole-only otherwise.
    scopedArgv: (sel) => ["vitest", "run", "--project", "unit", "--project", "integration", "--changed", ...(sel.gitRef === undefined ? [] : [sel.gitRef])],
  },
  {
    name: "browser:ct",
    group: "browser",
    tiers: ["push", "full"],
    argv: ["pnpm", "test:ct"],
    // CT_GATE=1: parallelism flakes RETRY (retries:2) instead of blocking — the exact env the pre-push
    // lefthook set on this command before the repoint (lefthook.yml history).
    env: { CT_GATE: "1" },
    classify: asViolations,
    // CT mirror-mapping (changed src → mirror .ct.tsx) is a V3 concern, behind a flag until proven; the
    // whole CT suite stays at push. Whole-only at scoped tiers for now.
  },
  {
    name: "browser:e2e-smoke",
    group: "browser",
    tiers: ["push", "full"],
    argv: ["pnpm", "e2e:smoke"],
    classify: asViolations,
    // Cross-cutting by nature — never scoped; deferred at a scoped tier.
  },

  // ── full-tier additions (the "nothing omitted" bar) ──
  {
    name: "quality:cpd",
    group: "quality",
    tiers: ["full"],
    argv: ["pnpm", "cpd"],
    classify: asViolations,
  },
  {
    name: "browser:e2e",
    group: "browser",
    tiers: ["full"],
    argv: ["pnpm", "e2e"],
    classify: asViolations,
  },
  {
    name: "tests:parity",
    group: "tests",
    tiers: ["full"],
    argv: ["pnpm", "test:parity"],
    classify: asViolations,
  },
  {
    name: "quality:mutation-gate",
    group: "quality",
    tiers: ["full"],
    argv: ["pnpm", "test:mutation:gate"],
    classify: asViolations,
  },

  // ── manual-tier rows (never auto-run; `verify --list` prints them with reasons, §3.6) ──
  {
    name: "browser:e2e-live",
    group: "browser",
    tiers: ["manual"],
    argv: ["pnpm", "e2e:live"],
    classify: asViolations,
    manualReason: "costs model credits (E2E_LIVE=1, a real model round-trip)",
  },
  {
    name: "quality:mutation-report",
    group: "quality",
    tiers: ["manual"],
    argv: ["pnpm", "test:mutation"],
    classify: asViolations,
    manualReason: "exploratory Stryker report (break:null) — minutes-long, report-only",
  },
  {
    name: "tests:coverage",
    group: "tests",
    tiers: ["manual"],
    argv: ["pnpm", "test:coverage"],
    classify: asViolations,
    manualReason: "coverage REPORT only — no thresholds gate (vitest.config.ts)",
  },
];

/** The stages that run at a given tier, in registry order. `manual` stages are never included in a run —
 *  they surface only in `verify --list`. */
export function stagesForTier(tier: Tier): readonly StageDef[] {
  return REGISTRY.filter((s) => s.tiers.includes(tier));
}

/** Every stage carrying a `manual` tier row (for `verify --list`). */
export function manualStages(): readonly StageDef[] {
  return REGISTRY.filter((s) => s.tiers.includes("manual"));
}
