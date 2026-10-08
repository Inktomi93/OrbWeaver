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
import { ctSuiteHangCeilingMs, toolingSuiteHangCeilingMs } from "./stage-budget.ts";

/** The six runtime test lanes, in the order they hold in `REGISTRY`. */
export const TEST_LANE_STAGES: readonly StageDef[] = [
  {
    name: "tests:node",
    applicationArgv: ["pnpm", "test:node"],
    group: "tests",
    tiers: ["changed", "push", "full", "product"],
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
    // THE RULING IT REOPENS: vitest 4 DEFAULTS `passWithNoTests` to true; `vitest.config.ts:134` turns it
    // OFF repo-wide — every lane whose include glob matches NOTHING (a typo'd pattern, a moved tree) FAILS
    // instead of passing. That ruling SURVIVES here too, but judges an ASSERTED selector — a lane's config
    // include glob, which asserts a fileset — while this argv's selector is always the
    // DERIVED one (`--changed`), and derived-empty is CLEAN by the same asymmetry ops/scoped.ts's
    // `emptyScopeNotice` already draws (AGENTS.md "Verification tiers": an asserted selector resolving to zero is exit 2,
    // a derived one resolving to zero is an ordinary state). The asserted-selector class stays guarded without this
    // door: `tests:execution-membership` REDs a runner view matching ZERO files at the STATIC tier, and
    // every whole-scope `pnpm test` still runs under `passWithNoTests: false`.
    // The flag sits BEFORE `--changed` because `--changed`'s ref value is OPTIONAL — a flag placed after it
    // can be swallowed as that value. `vitest related` defaults to derived-empty success; the explicit
    // spelling below makes that asymmetry visible beside the Git arm. Asserted test paths do NOT carry it:
    // `test:scoped` asks Vitest's collection view and refuses a barren operand.
    scopedArgv: vitestScopedArgv,
  },
  {
    name: "tests:tooling",
    group: "tests",
    tiers: ["weekly"],
    argv: ["pnpm", "test:tooling"],
    hangCeilingBaseMs: toolingSuiteHangCeilingMs(),
    classify: ownScheme,
  },
  {
    name: "tests:instrument-affected",
    group: "tests",
    tiers: ["manual"],
    argv: ["pnpm", "check:instrument-affected", "--weekly", "--affected"],
    hangCeilingBaseMs: toolingSuiteHangCeilingMs(),
    classify: ownScheme,
    manualReason: "Explicit weekly-owned affected recertification; ordinary tiers never invoke it. Named focused tests use test:scoped.",
  },
  {
    name: "browser:ct",
    applicationArgv: ["pnpm", "test:ct", "--retries=2", "--config=playwright-ct.product.config.ts"],
    group: "browser",
    // THE WHOLE CT SUITE IS ITS OWN STAGE AGAIN (#1848) — it rode inside `tests:node` from 2026-07-17 (a
    // merge made for the old single-thread constraint) and shared that stage's hang ceiling with the
    // vitest projects. It is the ONE stage whose runtime is a function of a worker cap, so it is also the
    // one that needs a DERIVED ceiling; sharing a constant with a 10-minute suite is what produced a false
    // `[tool-error]`. `changed` keeps the scoped inner loop (mirrors + declared sweeps, never the whole
    // suite — LANDED 2026-07-17); push/full run the whole suite, which remains the coverage verdict.
    tiers: ["changed", "push", "full", "product"],
    // `--retries=2` rides the argv VISIBLY (parallelism flakes retry instead of blocking a push); ad-hoc
    // `pnpm test:ct` keeps the config's retries:0 for debugging. It moved here from the `pnpm test`
    // composite with the stage.
    argv: ["pnpm", "test:ct", "--retries=2", "--config=playwright-ct.product.config.ts"],
    // The launcher's own exit contract: a CT run that could not launch its browser is 2, never failed tests.
    classify: ownScheme,
    // DERIVED, never typed: ctWorkers moves the CT wall clock, so it moves this ceiling too (lib/stage-budget.ts).
    hangCeilingBaseMs: ctSuiteHangCeilingMs(),
    // The scoped CT invocation enters the same launcher as every other CT run: that is where one run slot
    // is opened before Playwright evaluates its config in several processes. Retries remain 0 (the config
    // default), so the small inner-loop selection still reports raw signal. skip ⇒ no CT-relevant change.
    scopedArgv: (sel) => (sel.ct.mode === "skip" ? "skip-empty" : ["pnpm", "test:ct", ...sel.ct.targets, "--config=playwright-ct.product.config.ts"]),
  },
  {
    name: "browser:e2e-smoke",
    applicationArgv: ["pnpm", "e2e:smoke"],
    group: "browser",
    tiers: ["push", "full", "product"],
    argv: ["pnpm", "e2e:smoke"],
    classify: asViolations,
    // Cross-cutting by nature — never scoped; deferred at a scoped tier.
  },
  {
    name: "browser:tooling-ct",
    group: "browser",
    tiers: ["weekly"],
    argv: ["pnpm", "test:ct", "--retries=0", "--config=playwright-ct.tooling.config.ts"],
    classify: ownScheme,
    hangCeilingBaseMs: ctSuiteHangCeilingMs(),
  },

  {
    name: "quality:boot-chunk",
    applicationArgv: ["pnpm", "check:boot-chunk"],
    group: "quality",
    // PUSH tier, never the commit bar: it runs a real vite production build of @orb/client (15.45s warm,
    // measured 2026-08-22). `pnpm check` is the STRUCTURAL-fast bar (§3.2, "no behavioral suite"), and a
    // bundler invocation is neither. It defends the #433 + #448 boot-chunk wins (1,146,760 → 740,339 B)
    // that NOTHING else on the ladder can see: a single new barrel import in main.tsx's static graph
    // silently re-pays the whole cost, and every other stage stays green while it happens (#460). The same
    // build also proves the emitted html links the app stylesheet with its front-door sentinels (#1752: a
    // `sideEffects` field once let the bundler drop the CSS import, and no authored-graph check could see it),
    // and that no emitted chunk, preloaded or lazy, carries a DEV-only client instrument (work item 0030).
    tiers: ["push", "full", "product"],
    argv: ["pnpm", "check:boot-chunk"],
    // Our OWN 0/1/2/3-speaking script (tooling/src/verify/ops/boot-chunk-ratchet.ts) — and it USES the
    // tool-error code: an unmeasurable dist (no entry chunk / more than one / a failed build) exits 2, so
    // the run is not a verdict rather than a silent pass.
    classify: ownScheme,
    // WHOLE-TREE by nature — the boot chunk is a property of the ENTIRE static import graph reachable
    // from main.tsx, so no changed-file subset makes an honest partial. Deferred at a scoped tier.
  },
];
