# 1054: native type fact context in two tooling test files

## Outcome

Both groups pass. The tests now supply native type facts through `isolatedTypeFacts`, the isolated proof owner in `tooling/src/verify/ops/policy-conformance.ts:546`. Every conformance runner and the sibling `consumerPass` helper in the same file already use it. No production code changed.

## Root cause

- `tooling/src/verify/lib/schema-fact.ts:137-150`: `drizzle-schema-data` is `analysis: "types"`, and its `create` calls `ctx.nativeTypes.request({ kind: "schema-data", … })`.
- `tooling/src/verify/lib/policy-pass.ts:51`: `runPolicyPass` takes native facts only from `input.nativeTypeFacts?.()`.
- `tooling/src/verify/lib/policy-pass-context.ts:255-257`: the context's `request` resolves through `nativeFacts`, and `policy-pass-context.ts:193-194` throws `POLICY_PASS_REFUSALS.nativeTypeContextAbsent` when the pass got no supply.
- The broken supply was in two test helpers that called `runPolicyPass` with no `nativeTypeFacts`:
  - `tests/tooling/verify/gates/schema-fact-wave-1.suite.test.ts:88-94` (`runConsumer`, on main at 18b1d17c7d).
  - `tests/tooling/verify/lib/reviewed-grants.test.ts:239-246` (`passFor`, on main at 18b1d17c7d).
- Commit a62c1f7e7e moved the schema facts to native delivery. It added `nativeTypeFacts: () => isolatedTypeFacts(project)` to `consumerPass` in the wave-1 file but missed `runConsumer` in the same file and `passFor` in reviewed-grants.
- A second stale assertion was hidden behind the first. The empty-census case expected fact id `drizzle-schema`. Since 079f75fb23, `schema-branding` declares `drizzleSchemaDataFact` (`tooling/src/verify/gates/schema-branding.ts:78`), whose id is `drizzle-schema-data`. The assertion now takes the id from `drizzleSchemaDataFact.id`.

## Change

- wave-1: delete `runConsumer`; the three cases call `consumerPass(schemaBranding, …)`, so there is one composition for this file. The fact id assertion takes the id from the production fact.
- reviewed-grants: `passFor` supplies `nativeTypeFacts: () => isolatedTypeFacts(project)`.

## Red, unmodified worktree at 18b1d17c7d

`pnpm test:scoped tests/tooling/verify/gates/schema-fact-wave-1.suite.test.ts`: exit 1, 3 failed, 36 passed. All three cases in the "shared Drizzle fact's health" group failed at `expect(result.factErrors).toEqual([])` and received `[{ factId: "drizzle-schema-data", phase: "create", message: "native type fact context is unavailable" }]`.

`pnpm test:scoped tests/tooling/verify/lib/reviewed-grants.test.ts`: exit 1, 1 failed, 4 passed. "the four actual non-row execution identities…" failed at line 105, `raw.toolErrors` received `[{ policyId: "no-untyped-soft-ref", phase: "evaluate", message: "declared fact failed: drizzle-schema-data: create: native type fact context is unavailable" }]`.

After the supply fix alone, wave-1 failed 1 of 39: the empty case got `id: "drizzle-schema-data"` where it expected `"drizzle-schema"`. The id fix resolved it.

## Green

- `pnpm test:scoped tests/tooling/verify/gates/schema-fact-wave-1.suite.test.ts`: exit 0, 39 passed.
- `pnpm test:scoped tests/tooling/verify/lib/reviewed-grants.test.ts`: exit 0, 5 passed.

## Evidence that the producer ran

- reviewed-grants: the raw pass reports exactly the five schema-derived subjects (the four grant subjects plus `imagery_generations.foreignRowId`). The admitted pass grants four of them, and the wrong-subject pass raises four authority alarms. These findings exist only if `drizzle-schema-data` delivered the three fixture tables.
- wave-1 healthy control: the fact receipt is `drizzle-schema-sources` with 1 member, `schema-branding` reaches `success`, and the consumer receipt from `recordReadySchemaFact` counts 2 census members (one table, one column).
- wave-1 empty and impostor cases: the fact succeeds and the consumer refuses with `drizzle schema fact empty: …` and `drizzle schema fact unresolved: …`. Both statuses come from the real schema reader.

## Other checks

- `pnpm exec biome check <both files> --diagnostic-level=error`: clean.
- `pnpm typecheck --config tsconfig.json`: exit 1. All errors are in `scripts/probes/**` and `tests/legacy/inference/_support.ts`, which this change does not touch. Zero errors are in the changed files. The edit hook showed the same 39 errors outside the edit before and after.
