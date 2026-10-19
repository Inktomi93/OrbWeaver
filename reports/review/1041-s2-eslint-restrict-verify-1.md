# 1041 shard s2-eslint-restrict-verify-1

Gates: policy-binding-resolution (done), policy-fixture-substrate (escalate), policy-soundness (escalate).
Worktree branch `wt/wf_d99749a9-c7a-26`. No `check:structure`, no `lint:eslint-scoped` were run.

## policy-binding-resolution: done (D328 partial coverage, row was "retained-unqualified")

Successor: HARD native rule `orb/policy-binding-resolution`.

- Rule and scope: `VERIFY_HARD_RESTRICTIONS` in `eslint.config.js` (registered on `restrictionPlugin`, enabled only in `hardConfig`, never in `RESTRICTIONS`). Scope `tooling/src/verify/gates/**/*.{ts,tsx}`, ignores `gates/_proof/**`. The hard profile runs with `noInlineConfig` and an empty suppressions file, so there is no exception path.
- Selectors: the 9 closed member names (`getDefinitionNodes`, `getDefinitions`, `findReferences`, `findReferencesAsNodes`, `getImplementations`, `getValueDeclaration(OrThrow)`, `getAliasedSymbol(OrThrow)`) as a member read (dot, bracket, template-literal key) or an object-pattern key, on any receiver; plus `getDeclarations` only as a direct member of a `getSymbol()` / `getSymbolOrThrow()` call (optional chain, bracket, non-null).
- Durable test: `tests/tooling/verify/ops/eslint-hard-policy-binding.suite.test.ts` (24 tests). Red first: 18 of 24 failed with "expected [] to have a length of 1 but got +0" on the unmodified config (the 6 passing rows are the must-pass rows); after the rule landed all 24 pass. One row drives the real `verify eslint-scoped` runner in a planted root against the production `hardConfig` and exits 1 with the rule id.
- Plant: `tooling/src/verify/gates/__plant-binding.ts` with `node.getSymbol()?.getAliasedSymbol()`; `pnpm exec eslint --config eslint-hard.config.js --no-config-lookup --no-inline-config <plant>` exit 1, finding `3:49 error ... Member: \`getAliasedSymbol\`  orb/policy-binding-resolution`. Plant deleted.
- Live tree: same command over `tooling/src/verify/gates` before deleting the gate: 251 files linted, 0 errors; after deleting it: 250 files, 0 errors. ast-grep for the node-side members and the `getSymbol()` chain over 251 gate .ts files (0 .tsx): 0 hits; the 8 `getDeclarations` calls are `VariableStatement`/`VariableDeclarationList` accessors and stay legal.
- parity: 12 mustFlag / 2 whole mustPass ported (+1 mustPass in part), 3 mustPass lost, plus the mustRefuse (BLINDNESS) row replaced.
  - mustFlag 12/12 ported (5 node-side members, `getSymbol()?.getDeclarations()`, 4 symbol-side members, const alias through `.call`, two-sites-are-two-findings). Extra rows added: non-optional chain, bracket chain, destructured member, inline disable cannot suppress.
  - mustPass ported: `VariableStatement#getDeclarations` (syntax accessor), `getSymbol()` alone; the local-class row only in its `getDeclarations` half.
  - mustRefuse: the blindness tripwire guarded a dead import-origin recognizer. A lint rule has no recognizer; the equivalent failure (the rule not applying to gate modules) is covered by the hard-only/scope test and the real-runner test.
- Lost claim, exact: receiver-type identity. The gate fired only when the checker proved the member belongs to ts-morph (owner `Symbol` vs `VariableStatement`), acquitted an `any` receiver and a same-named method on a local class, and judged only final-contract modules. Native now (a) flags the 9 names on any receiver, so a local method of that name is over-accused (0 live hits) and an `any` receiver is accused; (b) catches `getDeclarations` only as a direct `getSymbol()` chain, so `const s = node.getSymbol(); s.getDeclarations()` and a destructured `{ getDeclarations }` are no longer caught. The 3 lost mustPass rows are the local-class `getDefinitionNodes`, the `any` receiver and the legacy-descriptor scope rows.
- Deleted: `tooling/src/verify/gates/policy-binding-resolution.ts`; liveness arm in `tests/tooling/verify/gates/_liveness/tooling-tests.ts`; family-suite import, FAMILY entry, `assertLiveBindingResolution`, the resolution second-opinion block and census sets in `policy-soundness-family.suite.repo.int.test.ts` (file now 998 lines, so its stale `max-lines` bulk entry was pruned from `eslint-suppressions.json` with `eslint --prune-suppressions` on that one file; the file only shrank); `isTsMorphMember` (sole production consumer was the gate) from `lib/gate-contract-origin.ts`, with `gate-contract-origin.test.ts` re-pointed at `isTsMorphWalk` so the optional-chain union regression keeps a control; the ts-morph ambient stub in `gates/_proof/policy-soundness.ts` pruned to the members policy-soundness still uses (its 61 proof rows re-run in memory with `verifyPolicyProofs`: `[]`); prose in `GATE-AUTHORING.md`, `TS-MORPH-CAPABILITIES.md` and the `policy-soundness.ts` header.
- Kept: `lib/gate-contract-origin.ts` readers used by policy-soundness E2 and `bus-native-read`/`policy-descriptor-read`; no fact producer was touched.
- Waivers and grants rejudged: 0 `@orb-waive policy-binding-resolution` markers, 0 reviewed grants, 0 waiver-budget rows (rg over the whole tree). Nothing added.

## policy-fixture-substrate: escalate

No successor landed, nothing deleted.

- The claim is path provenance: a write must resolve to an invocation-owned scratch root, not the checkout. Lint cannot tell the two apart; the audit's home (ban fs write verbs by import, "route every write through `tool-fixtures`") needs a runtime-guarded write helper that does not exist. `tests/support/node/tool-fixtures.ts:69` `fixturePath` only composes and checks a path under a root the caller already names; nothing asserts that root is scratch.
- Blast radius of the ban: ast-grep over `tests/tooling/verify/gates` (139 .ts, 0 .tsx) finds 76 write-verb calls in 23 files. Each would be rewritten onto a new helper API, a test-architecture decision, and none of those suites can run in this lane (several build whole-workspace programs).
- Deleting the gate breaks `tests/tooling/verify/ops/native-fixture-provenance-delivery.int.test.ts` (imports the gate and drives `nativeFixturePathPass`, `runPolicyPass`, `verifyPolicyProofs`) and strands five producers with no other consumer: `lib/fixture-path-native.ts`, `fixture-path-origin.ts`, `fixture-path-semantic.ts`, `fixture-path-call-graph.ts`, `fixture-path-authored-record.ts` (plus `contract/fixture-path-origin.ts` and `tests/tooling/verify/lib/fixture-path-origin.test.ts`).
- Decision needed from the owner: the write-helper API and its runtime containment check, or accept dropping the static provenance claim.

## policy-soundness: escalate

No successor landed, nothing deleted (only prose and the `_proof` stub, listed above, changed because binding-resolution left).

- E4 (unguarded `ctx.resources.<door>()`): the audit home is a type change so doors return the ready value. `readyResourceValue` has 80 call sites in 44 files under `tooling/src/verify` (ast-grep, 729 .ts, 0 .tsx), most in gates owned by other shards, and the host is built by `bindPolicyResources` (`lib/resource-policy.ts`) inside `lib/policy-pass-context.ts`, which is a fenced `policy-pass*.ts` file. A name-based lint selector would lose the import-origin identity of the guard (a local `readyResourceValue` lookalike would acquit).
- E2 `module-mutation` (a module-scope const collection mutated from a hook): identity comes from the lib declaration owner (`isBuiltinMutator`, `lib/gate-contract-origin.ts`). The audit names no home for it; module-scope `const` arrays are legal everywhere, so no selector expresses it.
- E2 `direct-walk`: `getSourceFile` is acquitted on a Node and accused on a `Project` by declaration owner (`isTsMorphWalk`). A name selector cannot split them: `.getSourceFile()` is called in 52 gate files. The unambiguous names (`forEachDescendant`, `getDescendants*`, `getFirstDescendant*`, `getSourceFiles`) have 3 live call sites in final gates that a name ban would red on: `compose-wiring-only.ts:375`, `zod-output-twin-parity.ts:239` and `:245`. Whether the typed gate accuses them today is unproven without the heavy structure run.
- E1/E3/E6/E7, `module-let`, `legacy-field`, descriptor spread/computed keys are expressible as hard selectors, but moving only those leaves a narrowed typed gate; that partial keep is not a ruled outcome (D328 covers only "retained-unqualified" rows) and would drop identity precision (local `process`, `defineGate` and `readyResourceValue` lookalikes, `proc.ts` import origin, const-bound `ext`).
- Decision needed from the owner: accept a narrowed `policy-soundness` (native hard rules for the syntactic arms, typed gate kept for `direct-walk`, `module-mutation`, E4 identity), or schedule the `ResourceHost` type change across the 44 files.

## Owed

- Primary: regenerate `docs/law/Core-Enforcement-Active-Gates.md` (still lists `policy-binding-resolution`, line 216).
- Primary: `pnpm lint:eslint-scoped` after the `eslint.config.js` edit; `pnpm check:ledgers-fresh`; a quiet run of `tests/tooling/verify/gates/policy-soundness-family.suite.repo.int.test.ts` and `tests/tooling/verify/gates/_liveness/runner.ts` consumers (both build whole-workspace programs and were edited, not run).
- `tests/tooling/verify/ops/eslint-hard-cors.suite.test.ts` first row timed out twice at 7.6 s on a box at load average 36 (the config import alone took 5 to 12 s with or without this change); the other 20 rows pass.
