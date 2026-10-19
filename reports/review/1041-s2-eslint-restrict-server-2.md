# 1041 s2-eslint-restrict-server-2

Shard: `s2-eslint-restrict-server-2`. Tool: native ESLint restrictions. Worktree `wf_d99749a9-c7a-8`.

Adopted from the stopped worker (`wf_b2a8e8fa-466-9`): the rule bodies, the durable suite and the grant/budget edits were
reviewed and ported. Fixed on review: `constantText` crashed on a `for (const key of …)` binding (null initializer, found by
the live-tree scan); the vocabulary digest now rides the block settings; the model-prose seam registry moved to
`tooling/src/verify/contract/model-prose-seam.ts`. Dropped: nothing outside the shard (the worker's tests/legacy edits were
not present in this diff).

Native rules: `orb/structured-plan-one-home`, `orb/wire-schema-vocab-one-home`, `orb/macro-resolution-home`,
`orb/content-part-seam`, `orb/no-hardcoded-model-prose` (`eslint.config.js`, `SERVER_ONE_HOME_RESTRICTIONS`).
Durable suite: `tests/tooling/verify/ops/server-one-home-native.suite.test.ts` (148 rows).

Red-first (suite against the HEAD `eslint.config.js`, rules absent): content-part-seam 8 failed, macro-resolution-home 13,
no-hardcoded-model-prose 11, structured-plan-one-home 27, wire-schema-vocab-one-home 21 (80 of 135). With the rules: 148/148.

Live tree (one probe run of the five rules over every `packages/**` source file the real config admits, 4333 candidates):
structured-plan 3646 files / 0 findings; wire-schema-vocab 2089 / 0; macro-resolution 1959 / 0; content-part-seam 4297 / 0;
no-hardcoded-model-prose 62 / 17, exactly the 17 old `@orb-waive` sites. ast-grep (ts 2869 + tsx 816 files in the four roots;
ts 3403 + tsx 930 under `packages`) agrees: the only vehicle literals are the engine's tuple, and `ChatContentPart` is named
only by the five homes and its declaration.

## Per gate

### structured-plan-one-home: done
Parity: 8 mustFlag / 3 mustPass ported, 0 lost (the other 2 mustPass rows are `@orb-waive` mechanics with no native analog);
the mustRefuse row (engine tuple missing) becomes a loud config-load failure plus the suite's export tripwire.
The member selector is name-keyed where the gate resolved the namespace origin: stricter, 0 live hits.
Waivers: 4 markers were the gate's own fixtures, removed with it.

### wire-schema-vocab-one-home: done
Parity: 2 mustFlag / 1 mustPass ported, 0 lost; both mustRefuse rows (engine arrays missing) become tsc errors on the engine
itself, since the vocabulary is `WIRE_SCHEMA_KEYWORD_VOCABULARY` read off the engine's own arrays.
Grant `wire-schema-vocab-one-home:inverse-lift` becomes the `homes` entry for `packages/kit/src/json-schema/lift.ts`
(the inverse reader the engine pairs with); the suite proves the home still spells the vocabulary.

### macro-resolution-home: done
Parity: 1 mustFlag / 1 mustPass ported, 0 lost (import plus call is 2 findings natively, 1 per file in the gate). The fact's
"resolver declarations disappeared" tripwire is the suite's declared-resolver test.
The 4 grants become 4 `homes` entries (ghost-message-row, message-content, message-render, message-row-parts), each a
read-only display pipeline; the suite proves each still names a resolver.

### content-part-seam: done
Parity: 6 mustFlag / 4 mustPass ported, 0 lost mustFlag. The mustRefuse (declaration home renamed) is the suite's
declaration test. Divergence, not a lost arm: mustPass "home counterfactual" (a same-named import that resolves outside the
contracts chat home) passes in the gate and is flagged natively, because the rule is name-keyed. Zero live occurrences.
The 5 grants become 5 `homes` entries, the D51 seam set itself (DTO, producer, runner contract, two converters).
`native-export-home-delivery.int.test.ts` keeps its poisoned-syntax delivery claim through `scrubber-home`.

### no-hardcoded-model-prose: kept-with-reason
Seam arm moved natively (5 mustFlag / 4 mustPass ported; 2 mustPass were waiver mechanics). The dead-catalog arm has no
native successor, so the gate is narrowed to it (2 mustFlag / 2 mustPass kept) and keeps its id; it is no longer a seam judge.
The seam registry moved to `tooling/src/verify/contract/model-prose-seam.ts`; the suite proves every path exists and flags.
17 waivers rejudged: `@orb-waive` markers deleted, the 17 findings recorded in ESLint's bulk file
(`pnpm exec eslint --suppress-rule orb/no-hardcoded-model-prose` on 7 files; `eslint-suppressions.json` gains only that rule,
count 17). An inline disable would raise the `suppressions` budget, which never rises. 16 sites are host-facing refusals and
toasts; `analysis-arm.ts` (the bounded-retry correction frame) is model-facing and is real debt for a prose slot.
Lost: the per-site reasons that lived in the markers (the ledger carries counts only).

## Checks and inherited reds
- `typecheck --config tooling/tsconfig.json --config tsconfig.json`: tooling PASS; root FAIL with 3 errors, all in untouched
  `tests/legacy/{inference,server/domain/embeddings,server/domain/search}/_support.ts`; none in this change's files.
- `native-restrictions.test.ts`: 2 failures (a 5 s timeout and the "generated outputs retain migrated restrictions" key list).
  Both reproduce identically with the HEAD `eslint.config.js`, so they are inherited, not from this change.
- `pnpm exec eslint` on `populate.ts`, `resync.ts` and `analysis-arm.ts` reports `orb/server-factory-tier-reference` (pino
  type at an import); the diff to those files is comment-only.

## Owed (not run, by rule)
- `pnpm lint:eslint-scoped` after the `eslint.config.js` edit.
- `tests/tooling/verify/gates/schema-data-grants.suite.repo.int.test.ts` (edited: one policy and one grant id removed; it builds the repo-root program).
- `tests/tooling/gate-spelling-twins.int.test.ts` and the real-corpus liveness runner (arms removed or re-pointed in `_liveness/{frontend,multi-root-b,product-db-server,tooling-and-authored}.ts`).
- knip: `WIRE_SCHEMA_KEYWORD_VOCABULARY` carries `@public`; `STRUCTURED_VEHICLES` stays in the production baseline.
- `pnpm check:ledgers-fresh`: catalog rows for the four deleted gates.
- s6: the three fact producers (`macro-resolution-fact`, `structured-vehicles-fact`, `wire-schema-vocabulary-fact`) now have no consumer and are left for `s6-delete-facts-2`.
- The scoped-recheck plumbing (`tooling/src/verify/ops/eslint.ts`) does not list `wire-subset.ts`; the block settings digest invalidates ESLint's cache instead.
