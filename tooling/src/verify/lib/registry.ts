// The verification stage registry (UNIFIED-VERIFICATION-DESIGN.md §3.1) — every verification surface in
// the repo, self-described: each stage declares its tier membership, how to scope it, and how to map its
// child's native exit into the repo's 0/1/2/3 contract. A "forgotten script" becomes structurally
// impossible: verify-registry-parity.ts reds when a package.json verification-shaped script has no row here.
import type { StageDef, Tier } from "../contract/stage.ts";
import { biomeStageAudit } from "./biome-verdict.ts";
import { asViolations, eslintScheme, ownScheme } from "./exit-classifiers.ts";
import { mutationGateStageAudit } from "./mutation-gate-verdict.ts";
import { eslintScopedArgv, tscScopedArgv } from "./registry-argv.ts";
import { MANUAL_ONLY_STAGES } from "./registry-manual.ts";
import { TEST_LANE_STAGES } from "./registry-test-lanes.ts";
import { applyPathTriggers } from "./registry-triggers.ts";
import { mutationGateHangCeilingMs } from "./stage-budget.ts";

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

/** `node --check` on every `.claude/hooks/*.mjs`, and a refusal when the glob matches nothing. */
const HOOK_SYNTAX_LOOP = [
  'const hooks = require("node:fs").globSync(".claude/hooks/*.mjs");',
  'if (hooks.length === 0) { console.error("lint:hook-syntax: no .claude/hooks/*.mjs to check"); process.exit(2); }',
  'for (const hook of hooks) require("node:child_process").execFileSync(process.execPath, ["--check", hook], { stdio: "inherit" });',
].join(" ");

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
    // NOT a `pnpm <script>` argv, deliberately: the check is a short loop over a glob, the parity gate
    // reconciles `pnpm <script>` argvs only (a raw-bin argv contributes to neither arm), and a package.json
    // row for it would be a second coupled site buying nothing. `node --check` takes ONE file, so the loop
    // is what makes this a FAMILY check rather than a hard-coded filename that goes blind the day a second
    // hook lands. The loop is node's own, not a shell's, so the stage runs on every OS.
    argv: ["node", "-e", HOOK_SYNTAX_LOOP],
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
    // Vitest typecheck has no sound narrowed derivation. The changed-tier trigger decorator runs this
    // stage's whole argv whenever a changed selection owes it.
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
    // THE WHOLE-CORPUS CONFORMANCE STAGE (#1941, docs/law/gate-runtime-standardization.md §6.6): every final
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
    // ledgers — the caught-failure census (keyed by `siteId` since work item 0009, so a line move is not
    // drift; an added, removed or re-verdicted site is) — vs a FRESH derivation. It already had a freshness
    // check, but each was a VITEST suite, so `pnpm check` stayed green while main sat red on the next whole
    // node run and regeneration was an unscheduled barrier ritual (#817; three re-lines in one night). It
    // USES the tool-error code: a derivation that comes back EMPTY is blindness, not a clean ledger.
    classify: ownScheme,
    // A census derived from a narrowed fileset describes a different tree. The changed-tier trigger
    // decorator therefore runs this stage's whole argv whenever a changed selection owes it.
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
    // The subject is the config's complete grant table, so there is no sound narrowed derivation. The
    // changed-tier trigger decorator runs this stage's whole argv whenever a changed selection owes it.
  },
  {
    name: "config:knip-negative-liveness",
    group: "structure",
    tiers: STATIC,
    argv: ["pnpm", "check:knip-negative-liveness"],
    // Every LITERAL negative pattern in knip.ts names a tracked file (ops/knip-negative-liveness.ts). Knip's
    // own config hints never report a negation that matches nothing, so a dead one survives the file it
    // excluded and silently excludes whatever lands at that path next. Our OWN 0/1/2/3-speaking op: an
    // unreadable git index throws, exit 2.
    classify: ownScheme,
    // The subject is the whole resolved config against the whole index, so there is no narrowed derivation.
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
    // `docsPaths` covers only the docs trees, while `check:docs` also owns instruction files and other
    // admitted markdown. A changed markdown file outside `docsPaths` runs the whole check (seconds), so a
    // scoped commit never skips a file the whole tier would fail.
    scopedArgv: (sel) => {
      if (sel.existingPaths.some((path) => path.endsWith(".md") && !sel.docsPaths.includes(path))) {
        return ["pnpm", "check:docs"];
      }
      return sel.docsPaths.length === 0 ? "skip-empty" : ["node", "tooling/src/doc/cli.ts", "format", "--check", ...sel.docsPaths];
    },
  },

  // ── tests stage-group (§3.7: the eight lanes as ONE concept with tier + scope) ──
  // The six rows that RUN a suite live in ./registry-test-lanes.ts and are spliced in HERE, at the exact
  // position they held, so REGISTRY order — and therefore `verify --list` — is unchanged (#2291).
  ...TEST_LANE_STAGES,

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
    // #2505 — STRYKER'S EXIT 1 HAS TWO CAUSES AND `asViolations` CANNOT TELL THEM APART: a score under the
    // break threshold (a verdict) and a crash before the first mutant (no verdict). The audit reads the
    // transcript for Stryker's own break-threshold decision — its single exit-code site — and refuses
    // (exit 2) when the run never reached it. See ./mutation-gate-verdict.ts for the enumeration.
    auditTranscript: mutationGateStageAudit,
    hangCeilingBaseMs: mutationGateHangCeilingMs(),
  },
];

// PATH TRIGGERS ARE APPLIED HERE, ONCE (#2277, ./registry-triggers.ts). A row that runs its WHOLE command
// or not at all gets the `changed` tier plus a `scopedArgv` keyed to the paths that can change its verdict,
// so `pnpm verify --changed` asks it instead of deferring it unconditionally — which is how `check:agents`
// stayed red through several folds. The trigger changes WHEN a stage runs and never WHAT it reads, so every
// row's recorded "no scoped derivation" reason survives intact; the table states that and the bar a regex
// must clear to be in it.
export const REGISTRY: readonly StageDef[] = [...applyPathTriggers(GATING_STAGES), ...MANUAL_ONLY_STAGES];

/** The stages that run at a given tier, in registry order. `manual` stages are never included in a run —
 *  they surface only in `verify --list`. */
export function stagesForTier(tier: Tier): readonly StageDef[] {
  return REGISTRY.filter((s) => s.tiers.includes(tier));
}

/** Every stage carrying a `manual` tier row (for `verify --list`). */
export function manualStages(): readonly StageDef[] {
  return REGISTRY.filter((s) => s.tiers.includes("manual"));
}
