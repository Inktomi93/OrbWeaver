import { budget } from "@orb/tooling/_shared/load-budget";
import { defineConfig } from "vitest/config";

// ONE config, lanes by SUFFIX via test.projects (the modern "workspace" — vitest.workspace.ts was
// deprecated in 3.2). NODE lanes only; BROWSER is Playwright (vitest browser-mode hangs — Spine-Testing.md §7).
// `test` (the fast lane) = unit + integration + contract; the two `types-*` lanes are opt-in (own script).
//
// CRITICAL: shared defaults live in the root `test` block, and EVERY project sets `extends: true` to
// inherit them. Per-runner options (cleanup/determinism/expect) do NOT reach a project without it —
// that's the latent trap neo-tavern fell into (its root isolate/restoreMocks/etc. are dead config
// because its projects omit `extends: true`). `coverage` + `reporters` are root-only (process-global)
// and apply regardless. Authority: core/Spine-Testing.md + DECISIONS-LEDGER §6.
//
// Kept at vitest/node DEFAULTS deliberately: `isolate: true` (fresh module graph per test file → the
// single-tenant globalMacroRegistry resets for free; do NOT copy neo's `isolate: false`) and
// `pool: 'forks'` (process isolation is safe for the libSQL native binding in the integration lane).

// `**/__g_*` — the check-gates self-test's reserved throwaway-fixture sentinel (tsconfig.base.json's
// exclude note). Some fixtures are `.test.ts`, so a CONCURRENT `vitest` lane could try to collect one
// mid-lifecycle (it's written then rm'd inside check-gates.int); ignore keeps every lane hermetic.
const IGNORE = ["**/node_modules/**", "**/dist/**", "**/.stryker-tmp/**", "reports/**", "**/__g_*"];
const inCI = process.env["CI"] !== undefined;

// The QUIET-BOX bases every wall clock below is derived from (`budget()` stretches them by the box's
// per-core contention and caps the stretch at ORB_BUDGET_CEILING_MS). They are BASES, never ceilings a
// suite may read: a file that needs longer says so with its own `vi.setConfig(scaledBudget(...))`.
const BASE_TEST_TIMEOUT_MS = 5000;
const BASE_HOOK_TIMEOUT_MS = 10_000;
// integration-serial: whole-tree scanners + heavy full-`createServices` composition files.
const BASE_SERIAL_TIMEOUT_MS = 30_000;
// live-drive: a BACKSTOP above any unscaled per-file cost here, so a file that FORGOT its own scaled
// budget fails loudly and early rather than silently inheriting a wrong one.
const BASE_LIVE_DRIVE_TIMEOUT_MS = 120_000;

// SERIAL_INT — the `.int.test.ts` files that CANNOT run in the parallel `integration` lane, routed by
// EXPLICIT PATH (not a filename suffix — a `*.serial.int.test.ts` rename trips the test-layout /
// test-presence structure gates, which only recognize `.int.test.ts`). The `integration` project globs
// all `.int.test.ts` and EXCLUDES this set; `integration-serial` globs EXACTLY this set — so a file
// runs in one lane or the other, never both, never neither. Two reasons a file is here:
//   1. TREE-WRITERS — tooling self-tests that write fixtures into / shell whole-tree tools against the
//      REAL package tree at fixed paths (they clobber each other in parallel), PLUS lifecycle (binds a
//      fixed port 18788 + a fixed db file — assumes serial).
//   2. WHOLE-TREE SCANNERS / heavy full-`createServices` composition files that flaked (5s-timeout, NOT
//      wrong value; pass in isolation) under fork contention. Serial + the lane's 30s testTimeout fixes
//      them. This does NOT weaken chat.int's D53 ReDoS tripwire — the guard fires in ~50ms and an
//      UNWIRED watchdog hangs for MINUTES, so 30s still trips red on a regression (~400× margin).
// TO ADD a new serial test: append its path here (keep the name `.int.test.ts`). Put a file here if it
// writes into the real tree at a fixed path, binds a fixed port/file, scans the whole tree, or is a
// heavy full-composition file that times out under parallel contention. Everything else is assumed
// `:memory:`-isolated + light enough for the parallel lane (proven 0-fail at 14 workers, report §3).
const SERIAL_INT = [
  // 1. tree-writers + fixed-port boot
  "tests/tooling/check-gates.int.test.ts",
  // Plants `__g_` fixtures at fixed real-tree paths AND reaps every `__g_*` on teardown — the same
  // sentinel space check-gates.int owns, so the two MUST never run concurrently.
  "tests/tooling/gate-ignore-grammar.int.test.ts",
  "tests/tooling/dependency-cruiser.int.test.ts",
  // #968's pin drives `stableJson`, the doc-catalog's ONE canonical serializer, which round-trips a value
  // through the biome BINARY via a temp file at the FIXED path docs/catalog/catalog.tmp.json — two
  // concurrent callers clobber each other's tmp, so it is a class-1 tree-writer.
  "tests/tooling/doc-catalog/ops/catalog.int.test.ts",
  // #949 compiler parity: whole UI/client source graph → #961 provenance → Oxide → Tailwind compile.
  "tests/tooling/css-merge-parity.int.test.ts",
  "tests/server/entry/lifecycle.int.test.ts",
  // 2. whole-tree scanners + heavy full-composition files (flaked on 5s timeout under fork contention)
  "tests/tooling/gate-conformance.int.test.ts",
  // #751 — loads the WHOLE gate corpus and runs it over the WHOLE workspace, because `gate-ignore-inventory`
  // reaches a verdict on a marker only when a sibling gate was offered it in the SAME pass. Cold ts-morph
  // workspace load + a 233-gate single pass (~6 min), over the same tree `check-gates.int` writes fixtures
  // into. (#775's arm is pinned by tests/tooling/verify/gates/dangling-refs.int.test.ts, which runs its ONE
  // self-contained gate in ~21s and stays in the parallel lane.)
  "tests/tooling/verify/gates/caught-failure-ownership.int.test.ts",
  // The `pnpm ast` audit-epilogue proof: every row SPAWNS the real CLI, which loads the whole workspace
  // into ts-morph (~11s each). Five of those in the parallel lane is a load bomb, and no parallel-lane
  // timeout covers them — the rows carry explicit 120s timeouts (300s for the two typed whole-workspace
  // rows) and run one at a time here. PATH REPOINTED 2026-09-01 (#1012): this row read
  // `tests/tooling/ast-observability.int.test.ts` for months after 8931a886c moved the file to
  // `tests/tooling/ast/cli.int.test.ts` WITHOUT touching this config — so the row matched nothing and the
  // file silently ran in the PARALLEL lane, i.e. exactly the load bomb this entry exists to prevent.
  // Measured on the stale config: 1,057,996 ms (17.6 min) in `|integration|`, one row failing, and ZERO
  // output for the whole stretch — which is what the `pnpm test` hang watchdog was killing at 300s.
  "tests/tooling/ast/cli.int.test.ts",
  // test-presence: a whole-tree scanner (same class as gate-conformance above) that flaked on the parallel
  // 5s timeout under verify --push's full-suite load — the plugin train grew the tree past the edge (it
  // passes alone ~3.4s but exceeds 5s under fork contention). Serial + 30s covers the scan weight.
  // (the motion-audit CLI suite sat here until #1040, then LIVE_DRIVE, and was deleted with that CLI at #1315 —
  // serial was the right SCHEDULE for it but the wrong lane: its problem is a measured RATE, not scan
  // weight, and no timeout in this lane can make a dropped-frame percentage honest.)
  "tests/tooling/verify/gates/test-presence.int.test.ts",
  "tests/support/fixtures.int.test.ts",
  "tests/server/transport/cross-tenant-sweep.suite.int.test.ts",
  "tests/server/entry/compose/chat.int.test.ts",
  // The DB6 databank settings wire (Phase B ④): a full-`createServices` composed-real file — the first
  // test pays the cold whole-server-graph import + createServices cost, which flakes a parallel 5s timeout.
  "tests/server/entry/compose/databank.int.test.ts",
  // The P6 agent-seat wire round-trips (D60): full-`createServices` app-fixture files — cold import of the
  // whole server graph on the first test flakes a parallel 5s timeout.
  "tests/server/transport/trpc/routers/chat.int.test.ts",
  // rpg compose wire: repeatedly flaked with 5s/20s timeouts under fork contention (heavy full-composition
  // file, same class as chat.int/databank.int above).
  "tests/server/entry/compose/rpg.int.test.ts",
  // The saved-party apply, composed-real (#26): full-`createServices` app-fixture file — the first test
  // pays the cold whole-server-graph import + createServices cost (the databank.int/chat.int class).
  "tests/server/entry/compose/roster-preset.int.test.ts",
  // The multi-human persona-resolution suite: full-`createServices` app-fixture file whose first test pays
  // the cold whole-server-graph import (measured 3.4s isolated → 5s-timeout flake under fork contention).
  "tests/server/entry/compose/persona-multihuman.suite.int.test.ts",
  // The composed first-run persona posture: same class (full-`createServices` app fixture, cold import on
  // the first test).
  "tests/server/entry/compose/assets-character.int.test.ts",
  // The demo-pack virgin-boot proof: same class again — it boots the REAL composition root with vLLM
  // disabled and replays six transcript fixtures + the rpg board, so its first test pays the cold graph
  // import plus the seed work. Thrice-sighted 5s-timeout flake under full-battery fork contention;
  // passes 7/7 isolated (2026-08-03).
  "tests/server/entry/boot/seed-demo-chats.int.test.ts",
  // The `run_tool` compose wire (#691): a full-`createServices` app-fixture file whose first test pays the
  // cold whole-server-graph import + compose (measured 5.2s in the parallel lane — the same 5s-timeout flake
  // class as databank.int/persona-multihuman above).
  "tests/server/entry/compose/automation-plugin.int.test.ts",
  // The run-completeness planted controls (#410): every case SPAWNS the real `verify structure` CLI over a
  // planted root and its abnormal arms are TIMING-SHAPED — the SIGKILL control gives the child 4s to boot
  // node, load the CLI and write its in-flight stub, then kills it. Under parallel fork contention the
  // child does not always reach the stub write inside that window, and the read of
  // `<root>/reports/check-structure.json` throws ENOENT — a contention flake, NOT a wrong verdict (passes
  // 6/6 isolated, 2026-08-22). Serial removes the contention; the roots themselves are mkdtemp-isolated
  // (tests/support/tool-fixtures.ts `plantedTree`), so this is class 2, not a shared-state tree-writer.
  "tests/tooling/verify/ops/structure.int.test.ts",
];

// LIVE_DRIVE — the `.int.test.ts` files that DRIVE A REAL BROWSER and whose verdict depends on a quantity
// the box's contention perturbs. Same routing mechanism as SERIAL_INT (explicit paths, `.int.test.ts`
// names kept so the structure gates still recognize them); the `integration` and `integration-serial`
// projects both EXCLUDE this set, and `live-drive` globs exactly it, so a file is in one lane or none.
//
// WHY A LANE OF ITS OWN (issue #1040, owner: "withhold, don't red"): these are the only suites in the node
// battery whose PASS is a MEASUREMENT rather than a structural fact, and a measurement taken on a box
// carrying three other lanes is not about the code. motion-audit's mobile arm reported 47.54% dropped
// frames at loadavg ~25 / 24 cores, then 10%, then clean, on IDENTICAL source. The three available arms
// were: (a) a quiesced slot + a load-aware withhold, (b) a loadavg-scaled budget, (c) a wider budget. (c)
// is banned — it launders the defect it was supposed to catch. (b) is what `_load-budget.ts` already does
// and it TRANSFERS TO TIMEOUTS ONLY: load stretches a wall clock roughly linearly, and does nothing of the
// sort to a percentage. So (a): this project is the QUIET SLOT half (fileParallelism:false, and the
// supervisor runs it as the LAST shard, after every other project has drained), and
// `withholdMeasurement` in tests/tooling/_load-budget.ts is the HONESTY half — a measured-rate arm on a
// contended box skips with a reason instead of voting.
//
// TO ADD one: it belongs here iff it drives a real browser/stack AND its verdict turns on a measured rate,
// a measured duration, or a wall-clock run budget that can kill the drive. A browser suite whose arms are
// structural (computed style, DOM, pixels, exit codes) does NOT belong — load changes how long it takes,
// not what it answers, and serializing it would only slow the battery. That line is why
// tests/tooling/snap/**, tests/tooling/ui-audit/**, tests/tooling/screen-record/** and
// tests/tooling/_shared/browser.int.test.ts stay in the parallel lane. (snap's ONE measured arm — the
// `--cpu-throttle` frame-stretch differential — takes the withhold in place instead of dragging its
// eighteen structural siblings into a serial lane.)
// TOOLING — the instrument battery's own glob (#1523). One entry, spelled once: the `tooling` project
// INCLUDES it and the two product lanes SUBTRACT it, so the partition is a single source of truth rather
// than two lists that drift. `.int.test.ts` files are matched by this glob too (they end in `.test.ts`),
// which is deliberate — the split is by SUBJECT (our instruments) rather than by suffix, because the cost
// this row exists to move is the browser-driving int suites.
const TOOLING = ["tests/tooling/**/*.test.ts"];

const LIVE_DRIVE = [
  // The #1040 case itself: a dropped-frame PERCENTAGE, a CLS total and a LoAF blocking duration, all
  // measured out of a real headless Chromium's CDP trace and all gated by budgets (lib/verdicts.ts).
  // The same class one instrument over: the idle twin asserts `breach-steps=0` over a real metered step,
  // i.e. that a click on an idle page produced NO long task — which contention alone can falsify.
  // The two settings-shim proofs: a real snap browser run against an in-process stub origin, held to a
  // FIXED 60s run budget that was not load-scaled. They are here for the wall-clock half — six of them
  // timed out in one battery under lane load (2026-09-01) — and their budgets are now `scaledBudget`.
  "tests/tooling/_shared/appearance.int.test.ts",
  "tests/tooling/_shared/theme.int.test.ts",
];

// TYPES_BROWSER — every `.test-d.ts` file the DOM-less root graph (`tsconfig.json`) does NOT root, so
// checking it there is a WRONG-LIB double-report (or, for the two `tests/client`/`tests/e2e` trees below,
// simply UNCHECKED — `ignoreSourceErrors` swallowed both classes identically). #1313's own issue body named
// six (the ones whose subject imports `@orb/ui`/`@orb/client` directly); a full `ts7 --showConfig` diff of
// `tsconfig.json` against the whole `.test-d.ts` census found TWO more riding the same mask, both with
// their OWN header already saying so: `tests/client/lib/collection-contracts.test-d.ts` ("that green is
// VACUOUS (its program excludes `tests/client` wholesale)") and `tests/e2e/support/mirror-parity.test-d.ts`
// ("that green is VACUOUS: that lane's program is `tsconfig.json`, which excludes `tests/e2e` entirely").
// Fixing 6 of 8 would leave the exact defect class alive for the other 2, so all 8 land here. Explicit
// list, not a directory glob — a `.test-d.ts` is added here deliberately, the same doctrine as
// `tsconfig.tests-dom.json`'s own per-file `include` (its header). All eight already sit under
// `tests/client/**/*.ts`, `tests/ui/**/*.ts` or `tests/e2e/**/*.ts`, which that config's `include` sweeps
// wholesale — so no tsconfig edit is needed here, only re-routing WHICH vitest project checks them. Pinned
// TOTAL by `tests/tooling/testd-lane-program-coverage.int.test.ts`.
const TYPES_BROWSER = [
  "tests/client/state/durable-local.test-d.ts",
  "tests/client/state/create-gated-store.test-d.ts",
  "tests/client/forms/create-autosave-entity-form-model.test-d.ts",
  "tests/client/lib/registry.test-d.ts",
  "tests/client/lib/collection-contracts.test-d.ts",
  "tests/ui/primitives/input/index.test-d.ts",
  "tests/ui/primitives/button/index.test-d.ts",
  "tests/e2e/support/mirror-parity.test-d.ts",
];

export default defineConfig({
  // NO `esbuild` key ON PURPOSE (2026-08-03): vitest 4 resolves the rolldown vite 8, which configures
  // oxc and IGNORES esbuild options — the old `esbuild: { target: "es2025" }` was a silent no-op that
  // ALSO printed "Both esbuild and oxc options were set…" once per lane, every run. No replacement
  // needed: oxc's default output runs untouched on node ≥26 (es2025-native), so there is nothing to
  // downlevel. (The pnpm esbuild-0.28 override in pnpm-workspace.yaml stays — other consumers.)
  test: {
    exclude: IGNORE,

    // WALL CLOCKS ARE LOAD-SCALED (#1232, docs/design/1208-instrument-substrate.md section 7.1). These two
    // used to be vitest's own DEFAULTS (5s test / 10s hook) — invisible numbers written for an idle box,
    // and the single largest source of "reds" that were really contention: the parallel integration lane
    // took five timeouts at loadavg 41 on 2026-09-02 with nothing wrong in the code, and a hook timeout
    // reads IDENTICALLY to a real assertion failure in a batch report. Stated out loud here and stretched
    // by the box's per-core contention through the ONE policy, so a quiet run is byte-identical to the old
    // default (factor 1) and a contended one finishes instead of dying as an opaque red. Evaluated ONCE at
    // config load, which is also when the supervisor decides the shard order.
    testTimeout: budget(BASE_TEST_TIMEOUT_MS),
    hookTimeout: budget(BASE_HOOK_TIMEOUT_MS),

    // Tests default the search-corpus auto-index OFF (the production env floor is ON). With the no-GPU
    // derive-role fallback live, an ON indexer would turn every `character.create` in a test into a real
    // local-light jina embed (multi-GB model load) on the fire-and-forget bus. OFF keeps unit/integration
    // boots clean + deterministic; the compose-gate test flips it ON via a per-test AppSettings override.
    // We also silence the application logger (Pino) to prevent raw JSON logs from destroying the TTY
    // reporter console or blowing up CI/Agent logs. VLLM_DISABLED is pinned "true" so the suite is
    // ambient-env-proof: the env floor is a strict z.enum(["true","false"]) and a stray host/container
    // value (the dev-container once shipped "1") otherwise kills every server suite at module load.
    // ORB_ENV_NO_FILE pins the SAME ambient-proofing one level up: without it the env loader reads the repo
    // `.env` and fills every key the test did not set, so a suite silently asserts against the OPERATOR'S
    // DEPLOY CONFIG. Measured: a live box running `AUTH_MODE=oidc` + `OIDC_ISSUER` turned 3 correct tests red
    // (auth-mode projection, the `/join/:token` 404, the fail-closed jwksAllowlist) with nothing wrong in the
    // code, and `WIRE_CAPTURE=on` for a debugging session turned a 4th. A red that is not a regression trains
    // everyone to discount reds, and it makes the battery's verdict differ between a clean checkout and a
    // working machine. Tests now see ONLY what they set. The env loader's OWN tests are unaffected: their
    // `reimportEnvIn` helper wipes `process.env` before re-importing, which clears this too, so they still
    // exercise the real file-load + override arms against their crafted fixtures.
    env: { CORPUS_AUTOINDEX: "false", LOG_LEVEL: "silent", ORB_ENV_NO_FILE: "1", VLLM_DISABLED: "true" },

    // Fork budget for the parallel lanes (inherited by every `extends:true` forked project — unit,
    // integration, contract). Pinned to ~14 workers on this 24-core shared dev box: the integration lane
    // is IMPORT-bound, not CPU-bound (reports/tooling/VITEST-INTEGRATION-SPEEDUP.md §2), so workers past
    // ~14 buy no speed while starving the dev's editor/browser. 14-of-24 is the report's measured 6.7×
    // sweet spot and leaves headroom.
    // NOTE: Vitest 4 REMOVED `poolOptions.forks.maxForks` — the cap is now the TOP-LEVEL `maxWorkers`
    // (number of forks, since pool:"forks"). `integration-serial` sets fileParallelism:false, which
    // vitest forces to maxWorkers=1 — so this cap is a no-op there (one file at a time regardless).
    // (`minWorkers` was ALSO removed in v4 — a `minWorkers: 14` sat here as dead config until the
    // 2026-08-03 installed-surface audit; workers now ramp on demand up to the cap, which is fine.)
    pool: "forks",
    maxWorkers: 14,

    // --- rigor defaults (inherited via `extends: true`) ---
    restoreMocks: true, // spies → original impl between tests (fake-at-edges, never-mock-internals doctrine)
    clearMocks: true, // clear mock call history each test
    unstubGlobals: true, // auto-undo vi.stubGlobal — no leaked globals across tests
    unstubEnvs: true, // auto-undo vi.stubEnv — no leaked env across tests
    allowOnly: false, // a stray `.only` FAILS the run (not just in CI)
    expect: { requireAssertions: true }, // every test must assert ≥1 — kills silent no-op tests
    chaiConfig: { truncateThreshold: 0 }, // full, untruncated diffs (branded ids / large frozen objects)
    // false (PD-115): every lane (unit/integration/contract/types) has matching files now, so a
    // lane whose include glob matches NOTHING (a typo'd pattern, a moved tree) FAILS instead of passing.
    passWithNoTests: false,

    // --- coverage: REPORT-ONLY (no `thresholds` → never gates; runs only via `pnpm test:coverage`) ---
    coverage: {
      provider: "v8", // AST-aware remap (Istanbul-accurate, v8-fast) — the v4 default
      // v4 removed coverage.all/extensions — include is explicit. Keep every shipped TS dialect plus the
      // tooling control plane in the measured corpus; omitting either makes a partial report read as total.
      include: ["packages/*/src/**/*.{ts,tsx}", "tooling/src/**/*.ts"],
      exclude: ["**/index.ts", "**/*.d.ts", "**/*.test-d.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "reports/coverage",
      reportOnFailure: true,
    },

    // --- reporters: CI-aware (junit for CI ingestion; default locally) ---
    reporters: inCI ? ["default", "github-actions", ["junit", { outputFile: "reports/junit.xml" }]] : ["default"],

    projects: [
      {
        // unit: `.test.ts` — pure logic, no db. EXCLUDE the other suffixes (they also end in .test.ts).
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: [...IGNORE, "tests/**/*.{int,contract}.test.ts", ...TOOLING],
        },
      },
      {
        // integration: `.int.test.ts` — real libSQL :memory:, real I/O. Runs PARALLEL (default
        // fileParallelism, capped at maxWorkers:14). Every file here is `:memory:`-isolated
        // (freshDb-per-test, tests/support/db.ts) so there is ZERO cross-file state; `pool:'forks'`
        // (inherited) keeps process isolation for the native binding. Measured 6.7× vs serial, 0 failures
        // across 346 domain files (reports/tooling/VITEST-INTEGRATION-SPEEDUP.md). EXCLUDES `SERIAL_INT`
        // and `LIVE_DRIVE` (see the consts above) — those run in `integration-serial` and `live-drive`.
        // Do NOT switch `pool` to threads and do NOT set `isolate:false`.
        extends: true,
        test: {
          name: "integration",
          include: ["tests/**/*.int.test.ts"],
          exclude: [...IGNORE, ...SERIAL_INT, ...LIVE_DRIVE, ...TOOLING],
        },
      },
      {
        // integration-serial: exactly the `SERIAL_INT` files (see the const above for the WHY + how to add
        // one). fileParallelism:false runs them ONE AT A TIME; testTimeout:30s covers their scan/import
        // weight on a contended box (chat.int's D53 ReDoS tripwire keeps a ~400× regression margin).
        extends: true,
        test: {
          name: "integration-serial",
          include: SERIAL_INT,
          exclude: [...IGNORE, ...LIVE_DRIVE],
          fileParallelism: false,
          testTimeout: budget(BASE_SERIAL_TIMEOUT_MS),
        },
      },
      {
        // live-drive: exactly the `LIVE_DRIVE` files (see the const above for the WHY + how to add one) —
        // the real-browser suites whose verdict is a MEASUREMENT. fileParallelism:false is half the point:
        // these files must not contend with each other, and `pnpm test` lists this project LAST so the
        // shard runs on the quietest box the battery can offer (scripts/vitest-supervised.mjs runs one
        // `vitest run --project <x>` per project, SEQUENTIALLY, in argv order).
        //
        // testTimeout here is a BACKSTOP, not the operative budget: every file in this lane sets its own
        // `vi.setConfig` from `scaledBudget(...)` (tests/tooling/_load-budget.ts), because a fixed ceiling
        // is exactly the thing that turned six real drives into opaque timeouts. 120s is above any
        // unscaled per-file cost here and below the supervisor's 30-min hard ceiling, so a file that
        // FORGOT its scaled budget fails loudly and early rather than silently inheriting a wrong one.
        extends: true,
        test: {
          name: "live-drive",
          include: LIVE_DRIVE,
          fileParallelism: false,
          testTimeout: budget(BASE_LIVE_DRIVE_TIMEOUT_MS),
          hookTimeout: budget(BASE_LIVE_DRIVE_TIMEOUT_MS),
        },
      },
      {
        // tooling: EVERY `tests/tooling/**` runtime file — the INSTRUMENT battery, in a lane of its own
        // (#1523). Not a suffix lane: it is the one part of the battery that recertifies our TOOLS rather
        // than the product, and measured 2026-09-04 it was 71.1 CPU-min over 284 files against 9.0 for
        // tests/server's 1,185 — the owner's "about 30 minutes of tooling recertification, which makes it
        // tedious to run tests". Splitting it out is what lets `verify --push` stop paying for it on a
        // diff that never touched an instrument; the `tests:tooling` stage row (verify/lib/registry.ts)
        // owns WHEN it runs, and this project owns WHAT it is.
        //
        // SERIAL_INT and LIVE_DRIVE keep their tooling members: those lists exist for contention
        // semantics (one at a time / the quiet last shard), which this lane does not provide and must not
        // silently drop. A file is in one lane or none — the `tests-execution-membership` gate proves it.
        extends: true,
        test: {
          name: "tooling",
          include: TOOLING,
          exclude: [...IGNORE, ...SERIAL_INT, ...LIVE_DRIVE],
        },
      },
      {
        // contract: `.contract.test.ts` — zod round-trips / golden surface.
        extends: true,
        test: { name: "contract", include: ["tests/**/*.contract.test.ts"] },
      },
      {
        // types-node: `.test-d.ts` — typecheck-ONLY (no runtime pass) over the DOM-less root tsconfig.
        // Every `.test-d.ts` file EXCEPT `TYPES_BROWSER` (#1313 — those are checked under the correct
        // libs by `types-browser` below, so there is no wrong-lib double-report left for
        // `ignoreSourceErrors` to swallow: SOURCE-file errors here now fail the lane like any other).
        extends: true,
        test: {
          name: "types-node",
          include: [],
          typecheck: {
            enabled: true,
            only: true,
            include: ["tests/**/*.test-d.ts"],
            exclude: TYPES_BROWSER,
            tsconfig: "tsconfig.json",
            // TS7 native checker (byte-identical diagnostics to tsc6, ~5x faster) — the CLI type lanes moved
            // off tsc6. ts-morph/typescript-eslint keep the TS6 API; this lane is CLI-only, so it's safe.
            checker: "node_modules/ts7/bin/tsc",
          },
        },
      },
      {
        // types-browser: exactly `TYPES_BROWSER` — the `.test-d.ts` files whose subject is a browser
        // package, checked under `tsconfig.tests-dom.json` (dom + node), the same program
        // `typecheck:tests-dom` runs standalone. Both this project and `types-node` share the DOM-less/
        // DOM-having split every other type program already draws; splitting the ONE vitest `types`
        // project the same way removes the last place a suppression flag hid a known-wrong program
        // (#1313) rather than recording a decision.
        extends: true,
        test: {
          name: "types-browser",
          include: [],
          typecheck: {
            enabled: true,
            only: true,
            include: TYPES_BROWSER,
            tsconfig: "tsconfig.tests-dom.json",
            checker: "node_modules/ts7/bin/tsc",
          },
        },
      },
    ],
  },
});
