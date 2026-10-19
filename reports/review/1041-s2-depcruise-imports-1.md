# 1041 s2-depcruise-imports-1

Branch `wt/wf_d99749a9-c7a-28`. One gate retired (package-subpath-crossing), three kept and escalated.

## package-subpath-crossing: done

- Successor: dependency-cruiser rule `package-subpath-crossing` (`.dependency-cruiser.cjs`). It judges the resolved edge: `to.dependencyTypes: ["aliased-subpath-import"]` (a `#` import), `to.path` a file inside a directory module, `to.pathNot` the importer's own module (`^$1/`) and any `index.ts`. Module shapes derive from `GROUPING_DIRS` (now exported from `tooling/src/floor/code-facts/package-module.ts`).
- Red first: `tests/tooling/verify/ops/package-subpath-boundaries.test.ts` failed 4 of 6 before the rule (the two legal-path cases pass vacuously), then 6 of 6 after.
- Real door: planted `packages/inference/src/backends/__plant1041/x.ts` importing `#src/contract/errors.ts`; `pnpm exec depcruise <plant> --config .dependency-cruiser.cjs --output-type err` exited 1 with `package-subpath-crossing: ... x.ts -> packages/inference/src/contract/errors.ts`. Plant deleted.
- Live tree: the rule over `packages/*/src` (7123 modules) reports 0 after the fixes below.
- Parity: 2 mustFlag / 1 mustPass ported, 0 lost claims. Recorded differences:
  - the gate reported one finding per (importer, module); the rule reports one per edge (the grant identity no longer exists);
  - `#src/<mod>/<sub>/index.ts` is accepted, because the wildcard door `#<mod>/<sub>` resolves to the same file and a resolved-path rule cannot tell the spellings apart. No such `#src/.../index.ts` spelling exists in `packages` (rg, 0 hits).
- Deleted: `gates/package-subpath-crossing.ts`, its test, `lib/reviewed-grants-package-subpath.ts`, its spread and import in `lib/reviewed-grants.ts`, its `multi-root-b.ts` liveness arm, its `waiver-budget.ts` row.
- Budget: the rule adds one `$1` capture pair, so `BACKREF_BUDGET` in `gates/depcruise-grant-liveness-health.ts` goes 14 to 15 (equality budget, the gate's own "justify the new pair" path), with its test literals. This is the one count raise; flagged for the owner.

### Grants rejudged (17) and live findings

Seven files carried an ungranted live crossing the gate already reported. Fixed by doors: `entry/http/oidc.ts`, `entry/compose/service-jobs.ts`, `entry/compose/services.ts` now import the new `transport/jobs/index.ts` door; `backends/agent-sdk/{wire-read,execution,catalog}.ts` import `#contract`, whose barrel gained `AgentSdkExecutionDeps`, `AgentSdkQueryLease`, `compactionTriggerSchema`, `compactResultSchema` (the inference public surface grows by those four names).

All 17 grants stay as exact-file exemptions on the rule, each re-derived against the bounding check, none copied blind:

- local-light x5: `local-light-worker-no-door` forbids any index in the Worker graph; a probe shows model-worker reaches `http/timers.ts` through worker-cache, so `timers.ts` joins them (an ungranted live crossing, same reason).
- plugin Worker x3 (`egress`, `membrane`, `port`): probe shows worker-runtime reaches all three; `#foundation/observability` re-exports `audit.ts`, which imports `@orb/db` (`plugin-worker-no-db`).
- ui-guest x2: probe shows the Worker reaches both; `#lib` re-exports React (`plugin-ui-guest-worker-no-react`).
- `process-permission`: broker permission model; `#foundation/env` reads files at load.
- DOM-free node program x4 (`message-render-context`, `connection-editor-model`, `connections-model`, `orb-web`) and dev leaves x2 (`bug-report-capture`, `message-row`): the `#lib` and `#art/web-weave` barrels deliberately omit or widen these. The DOM-free claim rests on the old grant text; no tsc proof ran here.

## package-deep-import: escalate

The gate is already red on the live tree: 152 `../../` specifiers (145 in .ts, 7 in .tsx) in 76 files (ast-grep, 3404 ts and 930 tsx files scanned): 126 inference backends importing `../../contract/<x>.ts`, 16 server, 10 client. A hard ESLint successor cannot land with live findings. 126 inference sites name contract files the public `contract/index.ts` does not export (`http`, `openai-backend`, `agent-sdk-backend`, `wire`, `v4`, `structured`, `anthropic-backend`), and `src/index.ts` runs `export * from "./contract/index.ts"`. The only compliant spellings are a public-surface change, a relocation of those contracts, or `#src/contract/...`, which the new package-subpath-crossing rule refuses. That is a design decision. Nothing edited. Fix is `pnpm codemod deep-imports --apply` after that ruling.

## agent-bridge-lock: escalate

Arms with no native expression in this lane: the two CT proof markers (need a mounted CT), the positive presence claims (door exists, main and router import the ready home, bridge imports the shared readiness pair, registries keep `satisfies`), and the exactly-one-install cardinality plus the absent-door arm. Dependency-cruiser `required` rules are a recorded non-adoption in the config header. Only the rogue `__orb` assignment (1 hit, `lib/agent-bridge.ts:315`) and the lean ready home are cleanly native, which would leave most of the gate in place. Nothing edited.

## policy-legacy-imports: escalate

Arms A (direct, `ops/`) and B (gate to gate) have 0 live findings as dependency-cruiser edge rules. The laundering walk does not: `reachable` over the forbidden homes reports 864 false findings (legal lib hops), and `via`/`viaOnly` apply to cycles only (`validate/matchers.mjs:129,164`). The only re-exporter of a forbidden home today is `verify/index.ts`, so a reformulated claim exists but is not the same claim. Arm D stays. Shrinking the gate edits `policy-soundness-family.suite.repo.int.test.ts`, which builds the whole workspace and cannot run in this lane. Nothing edited.

## Checks

- Tests: `package-subpath-boundaries.test.ts` 7/7; `depcruise-grant-liveness-health.int.test.ts` 4/4; `dependency-cruiser.int.test.ts` 112 pass, 14 fail. The 14 fail on rules without a fixture (`client-persisted-*`, `entry-wiring-*`, `query-wiring-*`, `role-data-*`, `chat-engine-authority-context`); `package-subpath-crossing fires on its fixture` passes.
- Typecheck: `packages/server/tsconfig.json` PASS (it reaches the changed inference files through imports), under the heavy lock. Biome on all changed files: clean.
- Real config over the changed server and inference files: 2 pre-existing `entry-wiring-no-query-capability` findings in `entry/contract/portability.ts`, untouched.
- Owed: regenerate `docs/law/Core-Enforcement-Active-Gates.md` (row for the retired gate); `pnpm check:ledgers-fresh`; `pnpm depcruise` and `pnpm check:structure` on the merged tree; typecheck of `tooling/tsconfig.json` and root `tsconfig.json`; `lint:eslint-scoped` not applicable (no ESLint edit).
