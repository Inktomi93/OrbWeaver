// THE RUNTIME TEST LANES of the verification stage registry (UNIFIED-VERIFICATION-DESIGN.md §3.7) — the
// six rows that RUN A TEST SUITE, spliced back into `./registry.ts`'s table in place.
//
// WHY THEY LIVE IN THEIR OWN MODULE (#2291). `registry.ts` crossed `tooling-size`'s 450-line hard cap at 472
// and kept climbing; stage rows are the thing that keeps being added, so the cap is not a one-time crossing.
// The answer is the `./registry-triggers.ts` precedent — one COHESIVE concern, its own file, the registry
// importing it — and NOT scattering rows to satisfy a number: `pnpm verify --list` is the sanctioned way to
// read tier membership and it reads that one table, so a split that makes membership harder to answer costs
// more than the cap saves. This is the split that costs nothing to answer, because the §3.7 comment already
// called these rows "the eight lanes as ONE concept with tier + scope" — the concept was already named, it
// just had no file.
//
// THE PROPERTY THAT MAKES THE SPLIT SAFE, and it is the one to re-check if a row ever moves in or out:
// `TEST_LANE_STAGES` is spliced back at the EXACT position the rows occupied, so `REGISTRY` order is
// unchanged and `verify --list` — which prints in registry order — is byte-identical across the extraction.
// Verified by diffing `pnpm verify --list` before and after. Nothing else changes: `REGISTRY`,
// `stagesForTier` and `manualStages` keep their shapes, and `verify-registry-parity` reads `REGISTRY`.
//
// MEMBERSHIP IS "DOES THIS ROW RUN A TEST SUITE", not the `group` string — `browser:ct`, `browser:e2e-smoke`
// and `quality:boot-chunk` carry other group labels while being exactly that. The rows that are NOT here
// are the ones that ANALYSE the test tree rather than running it: `tests:execution-membership` stays beside
// the types group in `registry.ts`, where it already sat, because its subject is the runner CONFIGS' own
// `--list` views. And the `full`-tier additions below this block in `registry.ts` (`browser:e2e`,
// `quality:mutation-gate`, `quality:cpd`) stay there: their organising fact is the TIER, not the lane.
import type { StageDef } from "../contract/stage.ts";
import { asViolations, ownScheme } from "./exit-classifiers.ts";
import { vitestScopedArgv } from "./registry-argv.ts";
import { ctSuiteHangCeilingMs } from "./stage-budget.ts";

/** The six runtime test lanes, in the order they hold in `REGISTRY`. */
export const TEST_LANE_STAGES: readonly StageDef[] = [
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
    // verified green BEFORE committing gets a RED after committing, at the exact door the lane skill tells it to walk.
    // A red meaning "there was nothing to run" either sends a lane chasing a phantom or teaches it that
    // reds from this door are ignorable.
    // THE RULING IT REOPENS: vitest 4 DEFAULTS `passWithNoTests` to true; `vitest.config.ts` turns it OFF
    // repo-wide — "false (PD-115): every lane … has matching files now, so a lane whose include glob
    // matches NOTHING (a typo'd pattern, a moved tree) FAILS instead of passing" (Core-Debt-Cleared-Ledger
    // PD-115, 2026-07-03). That ruling SURVIVES; its INPUT changed. PD-115 judges an ASSERTED selector — a
    // lane's config include glob, which asserts a fileset — while this argv's selector is always the
    // DERIVED one (`--changed`), and derived-empty is CLEAN by the same asymmetry ops/scoped.ts's
    // `emptyScopeNotice` already draws (CLAUDE.md "Verification tiers": an asserted selector resolving to zero is exit 2,
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
    // THE AFFECTED SUBSET OF THE BATTERY, BELOW `--full` (#1967). #1842 took the 71-CPU-minute instrument
    // battery off the push bar and that placement is NOT reverted — but it left every proof a policy
    // carries that a declared row cannot express (the §4.2 identity arm, the central grant table's
    // identity/duplicate/stale boundaries, the §4.5 refusal and receipt pins) running at `--full` and
    // NOWHERE ELSE. Measured twice at five days each: `registry-family.test.ts` red from `ab675b23b` (95
    // refused proof rows across eight policies, #1953) and `static-class-consumers.int.test.ts` red from
    // `1416f2c98` (#1956). Both commits ran and passed their named scoped floor; neither touched a family
    // test, which is why the prose per-conversion floor rule did not fire — and per constitution §2 a
    // prose-only boundary is not a placement, it is a wish.
    //
    // THIS ROW IS THE NARROW THING: the family tests of the instruments the BRANCH changed, reached
    // through the shared test mirror AND through the gate-ID string (a family test routinely lives under
    // its WAVE's name, so the mirror alone misses it). A branch that touched no `tooling/src` source runs
    // NOTHING and exits clean in well under a second; a branch that touched one pays for that one.
    name: "tests:instrument-affected",
    group: "tests",
    tiers: ["static", "push", "full"],
    argv: ["pnpm", "check:instrument-affected"],
    // Our OWN 0/1/2/3-speaking op: a changed instrument reaching no spec is VIOLATIONS (1), never a clean
    // zero, and an uncomputable branch answer runs the whole battery rather than selecting nothing.
    classify: ownScheme,
    // NO `scopedArgv` HERE, ON PURPOSE: the stage COMPUTES its own selection from the branch diff, so a
    // second scoped derivation would either duplicate or narrow it. That makes it a whole-only static row,
    // which means `WHOLE_COMMAND_PATH_TRIGGERS` (lib/registry-triggers.ts) owns its cheap-skip — it is
    // authored with `static` and the trigger table DECORATES it into `changed` with a
    // `tooling/src/**`-or-`tests/tooling/**` gate, so a product-only commit pays nothing and a lane's own
    // `verify --changed` recertifies the instruments it touched. `applyPathTriggers` THROWS on a whole-only
    // static row missing from that table, which is how this row's accounting was forced at authoring time.
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
];
