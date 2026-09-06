// The verification stage registry (UNIFIED-VERIFICATION-DESIGN.md §3.1) — every verification surface in
// the repo, self-described: each stage declares its tier membership, how to scope it, and how to map its
// child's native exit into the repo's 0/1/2/3 contract. A "forgotten script" becomes structurally
// impossible: verify-registry-parity.ts reds when a package.json verification-shaped script has no row here.
import type { StageDef, Tier } from "../contract/stage.ts";
import { biomeStageAudit } from "./biome-verdict.ts";
import { asViolations, eslintScheme, ownScheme } from "./exit-classifiers.ts";
import { eslintScopedArgv, tscScopedArgv } from "./registry-argv.ts";
import { MANUAL_ONLY_STAGES } from "./registry-manual.ts";
import { TOOLING_TOUCHED_REASON, toolingTouched } from "./registry-preconditions.ts";

// ── the registry ──────────────────────────────────────────────────────────────────────────────────────
// Build history (all LANDED): V1 wired argv (whole-scope) + tiers + classify; V2 landed the `scopedArgv`
// propagation (the scopable stages below carry it; genuinely whole-tree stages stay whole-only BY NATURE,
// not as debt); V3 repointed the lefthook hooks onto the tiers (2026-07-12) and merged CT into the
// `pnpm test` lane (2026-07-17). The one deliberately-open edge — CT changed-scope mirror-mapping — LANDED
// 2026-07-17: browser:ct now runs at the `changed` tier over the selection's CT view (its test-layout
// mirrors + a small table of DECLARED blast-radius sweeps). It UNDER-selects on purpose (scoped CT = mirror
// + declared sweeps, never the whole suite) — honest ONLY because a scoped green is never the coverage
// verdict; the push bar (`tests:node` running the WHOLE CT suite) remains that verdict. The static tier is
// EXACTLY run.ts's stages, in order, so `pnpm check` (= `verify --static`) stays byte-compatible.

const STATIC: readonly Tier[] = ["static", "push", "full"];
const DOC_CATALOG_PATH_RE = /^(?:docs\/.*\.md|docs\/catalog\/.*|tooling\/src\/doc-catalog\/.*)$/u;

/** The rows a TIER can actually run. The manual-only tail lives in ./registry-manual.ts and is
 *  concatenated below, in place — the registry ORDER is the `verify --list` order. */
const GATING_STAGES: readonly StageDef[] = [
  // ── lint stage-group (§2.4: biome + eslint are one presented group) ──
  {
    name: "lint:biome",
    group: "lint",
    tiers: ["changed", ...STATIC],
    argv: ["pnpm", "lint"],
    classify: asViolations,
    // #1245 — biome can exit 0 having checked NOTHING; the mechanism and its control are in lib/biome-verdict.ts.
    auditTranscript: biomeStageAudit,
    scopedArgv: (sel) =>
      sel.existingPaths.length === 0
        ? "skip-empty"
        : ["biome", "check", "--diagnostic-level=error", "--reporter=concise", "--no-errors-on-unmatched", ...sel.existingPaths],
  },
  {
    name: "lint:eslint",
    group: "lint",
    tiers: ["changed", ...STATIC],
    argv: ["pnpm", "lint:eslint"],
    classify: eslintScheme,
    scopedArgv: (sel) => eslintScopedArgv(sel.eslintPaths),
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
    // vitest typecheck is one STAGE (`pnpm test:types` runs both `types-node` and `types-browser` — the
    // DOM-less/DOM-having split #1313 gave the `.test-d.ts` lane) — whole-only, deferred at a scoped tier.
  },
  {
    name: "types:tests-dom",
    group: "types",
    tiers: ["changed", ...STATIC],
    argv: ["pnpm", "typecheck:tests-dom"],
    classify: asViolations,
    // The DOM-libbed home (tsconfig.tests-dom.json) for DOM-COUPLED NON-`.tsx` tests: a `.ts` test that
    // can't be a `.tsx` (the int lane is `.ts`-only) but drags a DOM barrel — the root graph `exclude`s it
    // and no `*.tsx` reach-back claims it, so WITHOUT this program it is type-checked by nothing. Tiny (one
    // small `include`) — whole-only per RUN (`pnpm typecheck:tests-dom` is one program, no per-file `tsc`
    // split), but MUST be considered at `changed` (#1274 — before this it carried NO scoped route at all,
    // so a stage with `tiers: STATIC` never even entered `stagesForTier("changed")` and `verify --file`
    // over a tests-dom-owned file reported clean with no type stage and no deferral notice — worse than a
    // visible defer). `scopedArgv` runs the whole program when the selection touches ≥1 of its roots, else
    // defers to `--static` (a real deferral notice, not silence); the tests-type-membership stage still
    // guards that every escapee is actually listed in the config's own `include`.
    scopedArgv: (sel) => (sel.touchesTestsDom ? ["pnpm", "typecheck:tests-dom"] : "whole-only"),
  },
  {
    name: "types:tests-membership",
    group: "types",
    tiers: STATIC,
    argv: ["pnpm", "check:tests-membership"],
    // Our OWN 0/1/2/3-speaking tsx script (tooling/src/verify/ops/tests-type-membership.ts): reconciles every
    // tests/** + playwright/** TS file against the union of every type program's import closure and REDs
    // (exit 1) on any file in ZERO programs — the structural floor that makes "silently un-type-checked
    // test" impossible. `--listFilesOnly` = module resolution only, so it stays cheap.
    classify: ownScheme,
    // A WHOLE-TREE invariant (it reconciles the entire test surface against every program) — whole-only,
    // deferred at a scoped tier, like the other cross-file registry/parity reconciliations.
  },
  {
    name: "tests:execution-membership",
    group: "tests",
    tiers: STATIC,
    argv: ["pnpm", "check:tests-execution-membership"],
    // Our OWN 0/1/2/3-speaking tsx script (tooling/src/verify/ops/tests-execution-membership.ts): types-membership's
    // EXECUTION-lane sibling (GitHub issue #22) — reconciles every tests/** runner-suffixed file
    // against the union of vitest's `--list` view + both playwright configs' `--list` views, BOTH directions
    // (a file matched by no runner REDs; a runner view matching zero files REDs — the marinara silent-no-op
    // disease). Asks each runner its OWN --list, never re-parses glob strings (drift-proof).
    classify: ownScheme,
    // A WHOLE-TREE invariant (unions every runner's file listing) — whole-only, deferred at a scoped tier.
  },

  // ── structure stage-group (the ts-morph single-pass gates + the db-baseline parity) ──
  {
    name: "structure:db-baseline",
    group: "structure",
    tiers: STATIC,
    argv: ["pnpm", "check:db-baseline"],
    // Our OWN 0/1/2/3-speaking tsx script (tooling/src/verify/ops/db-baseline-parity.ts): the committed squashed
    // baseline must equal what the live `@orb/db/schema` generates. It was a PUSH-only int test until
    // 2026-08-02; two baseline-regen misses (latest: schema_version DEFAULT 5→6) shipped and were caught
    // ~10 hours later at push. In-process via drizzle-kit/api (~1s, no stack, no db file) — it was wired
    // too late, not too heavy, so it belongs on the commit bar.
    classify: ownScheme,
    // A WHOLE-TREE invariant (the entire schema module vs the one committed baseline) — whole-only,
    // deferred at a scoped tier like the other cross-file reconciliations.
  },
  {
    name: "structure:drizzle-kit",
    group: "structure",
    tiers: STATIC,
    argv: ["pnpm", "check:drizzle-kit"],
    // drizzle-kit's OWN journal/snapshot-chain validator (`drizzle-kit check`, config-driven at
    // packages/db/drizzle.config.ts). It reads the migrations dir, not the schema: every `meta/_journal.json`
    // entry has its snapshot, and no two snapshots claim the same parent (the FORKED-CHAIN collision two
    // concurrently-generated migrations produce — probe-verified to exit 1 on it). Against today's single
    // squashed baseline it is a near-no-op (~1s); it is wired NOW, armed, so the first post-launch
    // incremental migration lands into a guardrail that already exists (Tier-1-DB.md §"When we migrate for
    // real"). Its sibling `structure:db-baseline` guards the ORTHOGONAL half — schema-vs-baseline CONTENT
    // parity — and neither can see the other's failure.
    classify: asViolations,
    // WHOLE-TREE by nature (the one migrations dir) — whole-only, deferred at a scoped tier.
  },
  {
    name: "structure:agent-config",
    group: "structure",
    tiers: STATIC,
    argv: ["pnpm", "check:agents"],
    classify: ownScheme,
    // Claude role bodies and Codex TOML manifests form one whole-set parity invariant.
  },
  {
    name: "structure:full",
    group: "structure",
    tiers: STATIC,
    argv: ["pnpm", "check:structure"],
    classify: ownScheme,
    // At a scoped tier the WALK is scoped via tooling/src/verify/ops/scoped.ts (incremental-safe gates over the
    // changed set, whole-project gates deferred-with-notice by scoped.ts itself). It needs its ONE selector.
    scopedArgv: (sel) => sel.checkScopeArgv,
  },

  {
    name: "ledgers:fresh",
    group: "structure",
    tiers: STATIC,
    argv: ["pnpm", "check:ledgers-fresh"],
    // Our OWN 0/1/2/3-speaking op (tooling/src/verify/ops/ledgers-fresh.ts): the two committed single-writer
    // ledgers — the caught-failure census (line-number-coupled: any merge inserting lines above a marker
    // re-stales it) and the test-baseline manifest — vs a FRESH derivation. Both already had a freshness
    // check, but each was a VITEST suite, so `pnpm check` stayed green while main sat red on the next whole
    // node run and regeneration was an unscheduled barrier ritual (#817; three re-lines in one night). It
    // USES the tool-error code: a derivation that comes back EMPTY is blindness, not a clean ledger.
    classify: ownScheme,
    // WHOLE-TREE by nature — a census derived from a scoped fileset is a census of a different tree, and
    // would report every row it did not walk as stale. NO `scopedArgv` ⇒ deferred at a scoped tier, and the
    // absence IS the guard (planStage in ops/run.ts).
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
  {
    name: "deps:knip-prod",
    group: "deps",
    // The production-strict view (`--production --strict`): its DELTA over deps:knip is the
    // kept-alive-only-by-tests rot lens (knip.ts header). FULL tier during the buildout, not static/push:
    // leaf-first build order legitimately lands a contract type one commit before its consumer, so a
    // commit-bar row would red on normal wave state; post-buildout it can promote (the api-surface
    // "surface freeze" trigger class). Wired 2026-07-17 — it had NEVER run anywhere despite the registry
    // doc claiming it live; the parity gate's shape list gained `knip*` the same day so a knip script can
    // never dangle again.
    tiers: ["full"],
    argv: ["pnpm", "knip:prod"],
    classify: asViolations,
  },

  {
    name: "deps:orphan-ratchet",
    group: "deps",
    // PUSH tier, never the commit bar: it resolves the whole type graph to key liveness on origin
    // declarations (~30s). knip CANNOT stand in for it — probe-verified (dispositions doc, "Correction"):
    // each package's `exports` map already makes these subpaths public API in knip's eyes, so knip flags
    // none of them and its `tags: ["-@public"]` exemption never fires. This stage reads `@public <reason>`
    // itself and ratchets the swept tree (tooling/src/verify/ops/orphan-export-ratchet.ts).
    tiers: ["push", "full"],
    argv: ["pnpm", "check:orphan-ratchet"],
    classify: ownScheme,
    // A WHOLE-TREE liveness reconciliation (an export is only an orphan relative to the ENTIRE workspace's
    // import graph) — whole-only, deferred at a scoped tier like the other cross-file reconciliations.
  },

  // ── docs stage-group ──
  {
    name: "docs:format",
    group: "docs",
    tiers: ["changed", ...STATIC],
    argv: ["pnpm", "check:docs"],
    classify: ownScheme,
    scopedArgv: (sel) => (sel.docsPaths.length === 0 ? "skip-empty" : ["node", "tooling/src/doc-catalog/cli.ts", "format", "--check", ...sel.docsPaths]),
  },
  {
    name: "docs:catalog",
    group: "docs",
    tiers: ["changed", ...STATIC],
    argv: ["pnpm", "check:doc-catalog"],
    classify: ownScheme,
    // One edited document can invalidate its content-hash receipt or the corpus ratchet; the catalog is
    // whole-project by nature, but a changed-scope run can skip when the selection has no docs path.
    scopedArgv: (sel) => (sel.paths.some((path) => DOC_CATALOG_PATH_RE.test(path)) ? ["pnpm", "check:doc-catalog"] : "skip-empty"),
  },

  // ── tests stage-group (§3.7: the eight lanes as ONE concept with tier + scope) ──
  {
    name: "tests:node",
    group: "tests",
    tiers: ["changed", "push", "full"],
    // `pnpm test` = the vitest projects && `pnpm test:ct --retries=2` (merged 2026-07-17 — the CT split
    // existed only for the old single-thread constraint): ONE behavioral lane, so the green-to-commit
    // ritual (`pnpm check` + `pnpm test`) exercises the CT suite too. The retries flag rides the compound
    // VISIBLY (gate runs retry parallelism flakes; ad-hoc `pnpm test:ct` keeps the retries:0 config
    // default for debugging — the CT_GATE env this used to ride was retired 2026-07-17).
    argv: ["pnpm", "test"],
    classify: asViolations,
    // At changed scope: vitest's own related-test graph over the unit + integration + tooling lanes
    // (serial + contract are whole-tree-shaped, deferred to push). CT does NOT ride this lane at changed scope — its scoped
    // mirror-mapping is the separate `browser:ct` changed-tier stage (LANDED 2026-07-17); the WHOLE CT suite
    // rides this lane's whole-scope argv at push (via `pnpm test`). Whole-only otherwise.
    //
    // `--passWithNoTests` RIDES THE SCOPED ARGV ONLY (#1272) — the whole-scope `pnpm test` above must never
    // carry it. THE DEFECT: `--changed` on a CLEAN COMMITTED TREE selects nothing, vitest prints "No test
    // files found, exiting with code 1", and `asViolations` reads that digit as VIOLATIONS — so a lane that
    // verified green BEFORE committing gets a RED after committing, at the exact door §L tells it to walk.
    // A red meaning "there was nothing to run" either sends a lane chasing a phantom or teaches it that
    // reds from this door are ignorable.
    // THE RULING IT REOPENS: vitest 4 DEFAULTS `passWithNoTests` to true; `vitest.config.ts` turns it OFF
    // repo-wide — "false (PD-115): every lane … has matching files now, so a lane whose include glob
    // matches NOTHING (a typo'd pattern, a moved tree) FAILS instead of passing" (Core-Debt-Cleared-Ledger
    // PD-115, 2026-07-03). That ruling SURVIVES; its INPUT changed. PD-115 judges an ASSERTED selector — a
    // lane's config include glob, which asserts a fileset — while this argv's selector is always the
    // DERIVED one (`--changed`), and derived-empty is CLEAN by the same asymmetry ops/scoped.ts's
    // `emptyScopeNotice` already draws (AGENTS.md §4: an asserted selector resolving to zero is exit 2,
    // a derived one resolving to zero is an ordinary state). PD-115's own class stays guarded without this
    // door: `tests:execution-membership` REDs a runner view matching ZERO files at the STATIC tier, and
    // every whole-scope `pnpm test` still runs under `passWithNoTests: false`.
    // The flag sits BEFORE `--changed` because `--changed`'s ref value is OPTIONAL — a flag placed after it
    // can be swallowed as that value. Measured 2026-09-02: it does not mask a broken invocation
    // (`--project bogus --changed --passWithNoTests` still exits 1, "No projects matched the filter").
    // `tooling` RIDES THE INNER LOOP (#1566). #1523 moved 280 files out of `unit`/`integration` into their
    // own project and gave the new stage `tiers: ["push","full"]` — which silently emptied this argv's
    // reach over `tests/tooling`: not run at `changed`, and not DEFERRED either, so a lane editing an
    // instrument got a green inner loop that had selected zero of its tests. The split's whole point is
    // the WHOLE-suite cost at push; `--changed` is a related-test graph over the diff and costs what the
    // diff costs, so the inner loop keeps every runtime lane it had before the split. This project list is
    // therefore the one that must grow when a lane is added — the `changed`-tier reach is not derived.
    scopedArgv: (sel) => [
      "vitest",
      "run",
      "--project",
      "unit",
      "--project",
      "integration",
      "--project",
      "tooling",
      "--passWithNoTests",
      "--changed",
      ...(sel.gitRef === undefined ? [] : [sel.gitRef]),
    ],
  },
  {
    // THE INSTRUMENT BATTERY, SPLIT OFF THE PUSH BAR (#1523). Measured 2026-09-04 over 1,867 files:
    // `tests/tooling` was 71.1 CPU-min across 284 files against 9.0 for tests/server's 1,185 and 1.3 for
    // everything else — 82% of the node battery, all of it recertifying OUR TOOLS. Owner: "about 30
    // minutes of tooling recertification, which makes it tedious to run tests… move that to verify
    // --full". So: `full` unconditionally, and `push` ONLY when this branch actually touched an
    // instrument. A push that changed no tooling code cannot regress a tooling test that was green on the
    // base — and a push that DID touch one still pays, at the tier where it matters.
    //
    // WHAT STAYS ON `tests:node`: `tests/tooling`'s SERIAL_INT and LIVE_DRIVE members. Those lists carry
    // contention semantics (one at a time; the quiet last shard) that this lane does not provide, so the
    // vitest config keeps them in their own projects and they ride the push bar as before. The split is
    // by SUBJECT, and it is deliberately not total.
    name: "tests:tooling",
    group: "tests",
    tiers: ["push", "full"],
    argv: ["pnpm", "test:tooling"],
    classify: asViolations,
    // The predicate is tri-state and `null` (cannot tell) RUNS — see registry-preconditions.ts.
    tierPrecondition: { tiers: ["push"], reason: TOOLING_TOUCHED_REASON, satisfied: toolingTouched },
    // Whole-only by nature, and that is only HONEST because `tests:node`'s scoped argv names `--project
    // tooling` (see it above — #1566 restored it). A second row at `changed` would spawn a second vitest
    // over the same selection; a row at NO tier would be the regression this comment used to describe
    // away. If that project ever leaves that argv, this stage owes the `changed` tier instead.
  },
  {
    name: "browser:ct",
    group: "browser",
    // The gate run rides tests:node (`pnpm test` composes `pnpm test:ct --retries=2` — merged 2026-07-17);
    // a push/full tier row here would run the suite TWICE. It stays at `manual` (the CT-only whole-suite
    // iteration lane) AND gains `changed` — the scoped inner loop runs only the changed set's CT view
    // (mirrors + declared sweeps), never the whole suite (LANDED 2026-07-17). This row also keeps the
    // CT-ONLY lane a named stage (verify-registry-parity arm 1) surfaced in `verify --list`.
    tiers: ["changed", "manual"],
    argv: ["pnpm", "test:ct"],
    classify: asViolations,
    // The scoped CT invocation enters the same launcher as every other CT run: that is where one run slot
    // is opened before Playwright evaluates its config in several processes. Retries remain 0 (the config
    // default), so the small inner-loop selection still reports raw signal. skip ⇒ no CT-relevant change.
    scopedArgv: (sel) => (sel.ct.mode === "skip" ? "skip-empty" : ["pnpm", "ct:scoped", ...sel.ct.targets]),
    manualReason: "runs inside tests:node (`pnpm test` composes it with --retries=2); direct lane kept for CT-only iteration at retries:0",
  },
  {
    name: "browser:e2e-smoke",
    group: "browser",
    tiers: ["push", "full"],
    argv: ["pnpm", "e2e:smoke"],
    classify: asViolations,
    // Cross-cutting by nature — never scoped; deferred at a scoped tier.
  },

  {
    name: "quality:boot-chunk",
    group: "quality",
    // PUSH tier, never the commit bar: it runs a real vite production build of @orb/client (15.45s warm,
    // measured 2026-08-22). `pnpm check` is the STRUCTURAL-fast bar (§3.2, "no behavioral suite"), and a
    // bundler invocation is neither. It defends the #433 + #448 boot-chunk wins (1,146,760 → 740,339 B)
    // that NOTHING else on the ladder can see: a single new barrel import in main.tsx's static graph
    // silently re-pays the whole cost, and every other stage stays green while it happens (#460).
    tiers: ["push", "full"],
    argv: ["pnpm", "check:boot-chunk"],
    // Our OWN 0/1/2/3-speaking script (tooling/src/verify/ops/boot-chunk-ratchet.ts) — and it USES the
    // tool-error code: an unmeasurable dist (no entry chunk / more than one / a failed build) exits 2, so
    // the run is not a verdict rather than a silent pass.
    classify: ownScheme,
    // WHOLE-TREE by nature — the boot chunk is a property of the ENTIRE static import graph reachable
    // from main.tsx, so no changed-file subset makes an honest partial. Deferred at a scoped tier.
  },

  // ── full-tier additions (the "nothing omitted" bar) ──
  {
    name: "quality:cpd",
    group: "quality",
    // PROMOTED to the push tier 2026-08-03: measured 0.86s. It sat in `full` for historical reasons,
    // not cost — and a duplication ratchet that only runs in a tier nobody invokes is not a ratchet.
    tiers: ["push", "full"],
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
    name: "quality:mutation-gate",
    group: "quality",
    tiers: ["full"],
    argv: ["pnpm", "test:mutation:gate"],
    classify: asViolations,
  },
];

export const REGISTRY: readonly StageDef[] = [...GATING_STAGES, ...MANUAL_ONLY_STAGES];

/** The stages that run at a given tier, in registry order. `manual` stages are never included in a run —
 *  they surface only in `verify --list`. */
export function stagesForTier(tier: Tier): readonly StageDef[] {
  return REGISTRY.filter((s) => s.tiers.includes(tier));
}

/** Every stage carrying a `manual` tier row (for `verify --list`). */
export function manualStages(): readonly StageDef[] {
  return REGISTRY.filter((s) => s.tiers.includes("manual"));
}
