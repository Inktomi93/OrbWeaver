// The verification stage registry (UNIFIED-VERIFICATION-DESIGN.md §3.1) — every verification surface in
// the repo, self-described: each stage declares its tier membership, how to scope it, and how to map its
// child's native exit into the repo's 0/1/2/3 contract. A "forgotten script" becomes structurally
// impossible: verify-registry-parity.ts reds when a package.json verification-shaped script has no row here.
import type { StageDef, Tier } from "../contract/stage.ts";
import { biomeStageAudit } from "./biome-verdict.ts";
import { asViolations, eslintScheme, ownScheme } from "./exit-classifiers.ts";
import { eslintScopedArgv, tscScopedArgv, vitestScopedArgv } from "./registry-argv.ts";
import { MANUAL_ONLY_STAGES } from "./registry-manual.ts";
import { ctSuiteHangCeilingMs } from "./stage-budget.ts";

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
  {
    name: "lint:hook-syntax",
    group: "lint",
    tiers: STATIC,
    // `.claude/hooks/*.mjs` IS LINTED BY NOTHING (#1943 F3, measured): `biome.json`'s files.includes
    // carries `!.claude` (a scoped run there answers "Checked 0 files"), and eslint's node surface globs
    // name no `.mjs` and no `.claude/**`, so only the no-`files` global block reaches those files — zero
    // substantive rules. That carve-out is acceptable for STYLE and not for BEHAVIOUR, because one of
    // those files is the PreToolUse Bash guard: a syntax error in it exits node non-zero with no JSON,
    // the hook contract reads a non-zero non-2 exit as a NON-BLOCKING error, and every Bash call in
    // every session then runs unguarded — silently, while the push bar stays green. Sub-second, and it
    // catches exactly that one failure.
    //
    // NOT a `pnpm <script>` argv, deliberately: the check is a two-token shell loop over a glob, the
    // parity gate reconciles `pnpm <script>` argvs only (a raw-bin argv contributes to neither arm), and
    // a package.json row for it would be a second coupled site buying nothing. `node --check` takes ONE
    // file, so the loop is what makes this a FAMILY check rather than a hard-coded filename that goes
    // blind the day a second hook lands.
    argv: ["bash", "-c", 'for f in .claude/hooks/*.mjs; do node --check "$f" || exit 1; done'],
    classify: asViolations,
  },

  // ── types stage-group ──
  {
    name: "types:native",
    group: "types",
    tiers: ["changed", ...STATIC],
    argv: ["pnpm", "typecheck"],
    classify: ownScheme,
    // Whole scope discovers every runnable native program. Scoped verification forwards the complete
    // affected-program plan; the executor expands references and runs each leaf exactly once.
    scopedArgv: (sel) => tscScopedArgv(sel.tsconfigs),
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
    name: "types:ownership",
    group: "types",
    tiers: STATIC,
    argv: ["pnpm", "check:type-ownership"],
    // Our OWN 0/1/2/3-speaking TypeScript command (tooling/src/verify/ops/tests-type-membership.ts):
    // reconciles every authored TS root, explicit ambient, and imported closure against its declared
    // compiler owner, and REDs when ownership is absent, conflicting, or crosses a ruled world boundary.
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
    name: "structure:asset-refs",
    group: "structure",
    tiers: STATIC,
    argv: ["pnpm", "check:asset-refs"],
    // Our OWN 0/1/2/3-speaking op (tooling/src/verify/ops/asset-refs-coverage.ts): every live FK→`assets.id`
    // column must be classified RETAINING or DERIVED in domain/assets/persistence/asset-refs.ts — the ONE
    // enumeration seam asset GC and the portability export both walk. It replaces the retired
    // `asset-refs-fk-coverage` AST gate: `getTableConfig` over the exported schema module asks the question
    // of the object Drizzle actually runs, so no authoring shape can shrink the denominator, and it also
    // sees the two directions the gate could not (a phantom registry row; a key classified twice).
    classify: ownScheme,
    // A WHOLE-TREE invariant (the entire schema module vs the one registry) — whole-only, deferred at a
    // scoped tier like `structure:db-baseline` and the other cross-file reconciliations. NO `scopedArgv`:
    // a coverage verdict derived from a partial schema would call every unwalked column unclassified.
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
    tiers: ["changed", ...STATIC],
    argv: ["pnpm", "check:structure"],
    classify: ownScheme,
    // At a scoped tier the WALK is scoped via tooling/src/verify/ops/scoped.ts (incremental-safe gates over the
    // changed set, whole-project gates deferred-with-notice by scoped.ts itself). It needs its ONE selector.
    scopedArgv: (sel) => sel.checkScopeArgv,
  },
  {
    name: "structure:policy-conformance",
    group: "structure",
    tiers: STATIC,
    argv: ["pnpm", "check:policy-conformance"],
    // THE WHOLE-CORPUS CONFORMANCE STAGE (#1941, gate-runtime-standardization.md §5 item 3): every final
    // defineGate policy's own mustFlag/mustPass rows through the production dispatcher, on every `pnpm check`.
    // Before it, a converted policy's rows ran only where a committed family test imported the module — and
    // 21 of 163 were imported by none. Our OWN 0/1/2/3-speaking op (ops/policy-conformance-stage.ts): a failed
    // proof is exit 2 (the checker's claim about itself broke), zero final policies is exit 2 (a bare zero).
    classify: ownScheme,
    // WHOLE-TREE by nature — a policy's proofs are its own fixtures, not a property of any changed file, and
    // the roster is the whole corpus. NO `scopedArgv` ⇒ deferred at a scoped tier; `structure:full`'s scoped
    // path already runs the changed files through the same dispatcher.
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

  {
    name: "config:biome-rule-liveness",
    group: "structure",
    tiers: STATIC,
    argv: ["pnpm", "check:biome-rule-liveness"],
    // THE RULE HALF of biome grant liveness (#2074), successor to the arm `97e68be91` deleted under §12.3
    // (a policy may not write a file and spawn a child). Path liveness proves the granted SUBJECT exists;
    // NOTHING proved the granted RULE still fires, so a rule-off override on a file that stopped violating
    // the rule was invisible — and an exemption nobody granted it is what the next violation at that path
    // inherits. Our OWN 0/1/2/3-speaking op (ops/biome-rule-liveness.ts): every report shape it cannot
    // trust (truncated, non-lint, unparseable, zero files processed) THROWS ⇒ exit 2, because each of them
    // produces an empty diagnostic list that is byte-identical to "every grant is dead".
    classify: ownScheme,
    // WHOLE-TREE by nature — the subject is the CONFIG's grant table, not any changed file, and a scoped
    // fileset would report every grant it did not probe as dead. NO `scopedArgv` ⇒ deferred when scoped.
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
    // THE VITEST HALF ONLY (#1848). It ran `pnpm test` — the composite that ALSO runs the CT suite — and
    // the two halves shared one 45-minute hang ceiling that the sum outgrew the moment #1835 put CT on the
    // shared worker cap: `verify --full` reported `[tool-error] TIMED OUT` on a QUIET box for a stage that
    // was still working. The composite remains available as the explicit product-test command (and keeps
    // its own manual row); the RUNNER now runs the halves as two stages, so each carries the ceiling its
    // own runtime needs. `pnpm test:ct --retries=2` is the sibling `browser:ct` row below.
    argv: ["pnpm", "test:node"],
    classify: ownScheme,
    // At changed scope: explicit test claims use the guarded `test:scoped` door; explicit source claims
    // use Vitest's native related graph; a Git-derived selection stays `--changed`. No project roster is
    // copied here — the native config remains the population authority. CT does NOT ride this lane at
    // changed scope: its mirror mapping is the separate `browser:ct` stage below.
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
    // can be swallowed as that value. `vitest related` defaults to derived-empty success; the explicit
    // spelling below makes that asymmetry visible beside the Git arm. Asserted test paths do NOT carry it:
    // `test:scoped` asks Vitest's collection view and refuses a barren operand.
    scopedArgv: vitestScopedArgv,
  },
  {
    // THE INSTRUMENT BATTERY, OFF THE PUSH BAR ENTIRELY (#1523 split it; #1842 finished the cut).
    // Measured 2026-09-04 over 1,867 files: `tests/tooling` was 71.1 CPU-min across 284 files against 9.0
    // for tests/server's 1,185 and 1.3 for everything else — 82% of the node battery, all of it
    // recertifying OUR TOOLS. Owner 2026-09-04: "about 30 minutes of tooling recertification, which makes
    // it tedious to run tests… move that to verify --full"; owner 2026-09-06: "take tooling out of the
    // verify push and into full". #1523's first cut kept a CONDITIONAL push rung (run it when the branch
    // touched an instrument) — that rung is GONE: a tooling diff pays this cost at `--full` or through
    // `pnpm test:tooling` by hand, and `--push` never spawns it. The `tierPrecondition` MECHANISM stays in
    // the stage contract (contract/stage.ts) for the next row that needs it; this row's push-tier DATA is
    // what was deleted, along with the predicate it hung on (lib/registry-preconditions.ts).
    //
    // The full instrument battery includes its parallel and remaining serial projects.
    name: "tests:tooling",
    group: "tests",
    tiers: ["full"],
    argv: ["pnpm", "test:tooling"],
    classify: ownScheme,
    // Whole-only by nature, and that is only honest because `tests:node`'s scoped path delegates to
    // Vitest's native configured projects, so a tooling source still reaches its related tests at
    // `changed`. A second row at `changed` would spawn a second Vitest over the same selection.
  },
  {
    name: "tests:tool-guard",
    group: "tests",
    // THE ONE INSTRUMENT WHOSE PIN CANNOT WAIT FOR `--full` (#1943 F3). The #1842 cut is right about the
    // battery — 71 CPU-minutes of instrument recertification does not belong on the push bar — but it
    // left the PreToolUse Bash guard (.claude/hooks/tool-guard.mjs) with NO executing check below
    // `--full`: nothing lints it (see `lint:hook-syntax`), and its only behavioural proof lived in the
    // `--full`-only battery. The guard gates every Bash call in every session, it fails OPEN by contract,
    // and it is edited by lanes — so its contract rows (rewrite template, hard floor, fail-open, kill
    // switch, wire shape) are a PUSH-tier fact. 2.35 s measured for the whole file, which is why the row
    // is the file rather than a subset: a pin nobody can name is a pin nobody runs.
    // It runs a SECOND time inside `tests:tooling` at `--full`; that duplication costs seconds and keeps
    // the battery's membership honest (the file is a tooling test and stays one).
    tiers: ["push", "full"],
    argv: ["pnpm", "test:scoped", "tests/tooling/tool-guard.int.test.ts"],
    classify: ownScheme,
    // Whole-only BY NATURE: the stage IS one file. At a scoped tier the guard's own diff reaches this
    // test through `tests:node`'s native related-tests resolution, exactly like any other tooling source.
  },
  {
    name: "browser:ct",
    group: "browser",
    // THE WHOLE CT SUITE IS ITS OWN STAGE AGAIN (#1848) — it rode inside `tests:node` from 2026-07-17 (a
    // merge made for the old single-thread constraint) and shared that stage's hang ceiling with the
    // vitest projects. It is the ONE stage whose runtime is a function of a worker cap, so it is also the
    // one that needs a DERIVED ceiling; sharing a constant with a 10-minute suite is what produced a false
    // `[tool-error]`. `changed` keeps the scoped inner loop (mirrors + declared sweeps, never the whole
    // suite — LANDED 2026-07-17); push/full run the whole suite, which remains the coverage verdict.
    tiers: ["changed", "push", "full"],
    // `--retries=2` rides the argv VISIBLY (parallelism flakes retry instead of blocking a push); ad-hoc
    // `pnpm test:ct` keeps the config's retries:0 for debugging. It moved here from the `pnpm test`
    // composite with the stage.
    argv: ["pnpm", "test:ct", "--retries=2"],
    classify: asViolations,
    // DERIVED, never typed: ctWorkers moves the CT wall clock, so it moves this ceiling too (lib/stage-budget.ts).
    hangCeilingBaseMs: ctSuiteHangCeilingMs(),
    // The scoped CT invocation enters the same launcher as every other CT run: that is where one run slot
    // is opened before Playwright evaluates its config in several processes. Retries remain 0 (the config
    // default), so the small inner-loop selection still reports raw signal. skip ⇒ no CT-relevant change.
    scopedArgv: (sel) => (sel.ct.mode === "skip" ? "skip-empty" : ["pnpm", "test:ct", ...sel.ct.targets]),
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
    classify: ownScheme,
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
