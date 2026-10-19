# 1041 shard s3-law-registries-1 (type-registry)

Worktree `wf_4649b099-4cd-48`, branch `wt/wf_4649b099-4cd-48`. Second redo: the playwright record was refuted a second time (runner variants), and the message-kind record owed a census. Five gates done, three escalated. No structure run, no `lint:eslint-scoped`, no config edit.

## Records

### playwright-lane-outside-fast-check: done
- Arm A: `RUNTIME_BY_FAMILY` in `tooling/src/floor/testing/test-kinds.ts:88` is `satisfies Record<TestFamily, string> & { component: "playwright-ct"; e2e: "playwright-e2e" }`. A scratch tsc run on the old types accepted `component: "vitest"` (exit 0); the new types refuse it (TS2322, exit 1).
- Arm B: `tests/tooling/floor/testing/test-kinds.test.ts` imports the real `vitestConfig` factory and fails if any project include (runtime or typecheck) selects a Playwright suffix.
- Refutation fixes. (1) Every runtime project sets `extends: true` and Vitest concatenates the root `test.include` into each child, so the test judges `[config, ...projects]`. (2) The test judged only the default export, `vitestConfig()`, but `pnpm test:scoped` (`scoped-test.ts:138,150`, `vitest-supervised.ts:63`) and the CI node shards (`ci-shard.ts:117`) run `vitest.runtime.config.ts` = `vitestConfig(true)`, and `vitest.product.config.ts` = `vitestConfig(false, true)`. The test is now `test.each` over those three evaluations (`test-kinds.test.ts:21-27,36`). Red first: plant `...(runtimeOnly ? [{ extends: true, test: { name: "browser-lane", include: ["tests/**/*.ct.tsx"] } }] : typecheckProjects(applicationOnly))` at `vitest.config.ts:257`; the previous default-only test passes that plant (the verifier's repro, exit 0), the new test fails only the `vitest.runtime.config.ts` case with `expected [ 'tests/**/*.ct.tsx' ] to deeply equal []` (exit 1, 1 failed / 9 passed). Plant removed, 10/10 green.
- Unreadable project shape (verifier P3): a project given as a string path or a factory carries includes the check cannot read, so the test now asserts every project is an object instead of casting past it (`test-kinds.test.ts:44`). Census: `ast-grep run -l ts -p 'vitestConfig($$$)'` finds 4 calls (the three entry files and `vitest-typecheck-dependency-exclusion.int.test.ts:79`), `-l tsx` finds 0; every `projects` entry at `vitest.config.ts:200-258` is an object literal or `typecheckProjects()` output.
- parity: 5 mustFlag / 3 mustPass ported, 1 lost (below). The unparseable-config row holds by construction: the test imports the config.
- Lost claim (rider census): a NEGATED glob containing a Playwright suffix no longer flags (it only excludes). No live population: `rg -c -F -e .ct.tsx -e .spec.ts vitest.config.ts` exits 1 (0 matches, 1 file); `ast-grep run -l ts -p '"$A"' vitest.config.ts` finds 69 string literals, 0 contain either suffix. Nothing on the live tree, in a waiver or in a grant hits it. The test judges the evaluated include globs, so a programmatically injected suffix is seen.
- Also: `contract/resource-exact.ts` comment no longer names the deleted gate; both exact-file ids now have only test consumers and stay.
- Deleted: the gate, its `_liveness/tooling-and-authored.ts` arm, and `literalsContaining` in `lib/config-static-read.ts` (sole consumer was the gate).

### appearance-carrier-contract: done
- Type: `carriers` is `readonly [Plane, ...Plane[]]` (`packages/client/src/lib/appearance-carrier-manifest.ts`, `CarrierPortalPairing`). Plant `carriers: []`: TS2322 "Source has 0 element(s) but target requires 1". Old types accepted the same plant (exit 0).
- parity: 1 mustFlag / 2 mustPass ported, 0 lost. The waiver row has no successor on purpose: an empty carrier list is now unrepresentable, so no waiver door remains.

### appearance-carrier-health: done
- Types: row `owner` must list its key (`OwnerOf<K>`), `portal` must match the first carrier (`PORTAL_BY_CARRIER`), keys total over `AppearanceSettings`, observables total over armed rows. Plants against the new types, all exit 1: wrong owner TS2322, portal `grid-only` on density TS2322, `carriers: []` TS2322, deleted `messageActions` row TS2741. The old types accepted the owner, portal and empty-carrier plants (exit 0).
- Runtime test `tests/client/lib/appearance-carrier-manifest.test.ts` over the real manifest: schema leaves equal manifest keys equal owner lists (each owned once), editor tuples bound to `APPEARANCE_OWNER_KEYS`, observables equal armed rows with unequal arms, every plane non-empty, prepaint set and density lifecycle, boot stamp and pending-arm identifiers, live consumer binds key. Planted equal arms, `lifecycle: "hydrated"` on fontScale, a missing consumer symbol and an unbound editor tuple: four tests red (exit 1).
- Snap projection: `tests/tooling/floor/appearance/appearance.test.ts` calls the real `appearanceBootHintPatch` for every manifest key. Plant `chatWidthPct` into the projection: two tests red.
- Redo fix: the manifest type was a homomorphic map, which carries an optional schema leaf's `?`, and the test read leaves from `parse({})`, which omits an optional leaf with no default. The type is now `[K in keyof AppearanceSettings]-?` (`packages/client/src/lib/appearance-carrier-manifest.ts:66`) and the test reads the declared shape, `appearanceSettingsSchema.unwrap().shape` (`tests/client/lib/appearance-carrier-manifest.test.ts:58`). Plant `ghostLeaf: z.string().optional()` in `packages/contracts/src/settings/appearance.ts` with no row or owner: the schema-equals-manifest test goes red (exit 1, `ghostLeaf` in the expected list only); plant removed.
- parity: 3 mustFlag / 1 mustPass ported, 0 lost (the schema-leaf arm, mustFlag[0], is the one the first record missed).
- Deleted with both gates: `tests/tooling/verify/lib/appearance-carrier-fact.test.ts` (only drove the two gates), the two `_liveness/multi-root-a.ts` arms. Left for s6-delete-facts-1: `lib/appearance-carrier-fact.ts`, `appearance-carrier-graph.ts`, `appearance-carrier-contract-ast.ts` (no consumer now).

### message-kind-policy-coverage: done
- `tests/contracts/chat/message-kind-policy.repo.int.test.ts` imports the real `MESSAGE_KIND_POLICY`, derives dispatching axes from its cells, and parse-scans `packages/{server,client}/src` for readers (direct access, alias import, imported home-file carrier). Plant: replace the `MEMORY_INGEST_KINDS` import in `domain/chat/memory/persistence/queries.ts` with a local const: exit 1, `expected [ 'memory' ] to deeply equal []`.
- parity: 4 mustFlag / 4 mustPass ported, 0 lost. The fifth mustPass is the waiver row; the waiver door is gone with the gate.
- Lost claims (catch deltas, no mustFlag row covers them): an axis whose every kind currently answers identically is exempt (the gate exempted only a single-literal type). Census: the three axes are `prompt` (3 distinct values), `memory` (ingest, ingest, exclude) and `reading` (`"show"` for all three kinds), `participants.ts:126-139`. `prompt` and `memory` dispatch, and the test requires a reader for each (green, 5/5). `reading` is the single-literal type both versions exempt, so the delta has no live site. `rg -n -c 'MESSAGE_KIND_POLICY\b' packages tests` finds 12 files; `ast-grep run -l ts -p 'MESSAGE_KIND_POLICY[$K].reading' packages tests` finds 1 hit, `tests/legacy/contracts/chat/participants.contract.test.ts:46` (`expect(...).toBe("show")`, not a reader); `-l tsx -p '$A.reading' packages/client/src` finds 0. Scanned: 8806 ts and tsx files under `packages` and `tests`. No waiver or grant touches it; record references are matched by import specifier (`@orb/contracts/chat`, `@orb/contracts`, `*/participants.ts`), so a re-export through another barrel is not followed.
- Scaffolding: gate, its family test, the `_liveness` arm, the `registry-family.suite.test.ts` entry; `native-inherited-members-delivery.int.test.ts` drops the `axes` policy (the verbs and knobs policies still prove the inherited Node and browser denominators); `test-hand-shape.test.ts` uses `knob-wire-coverage` as the contrast consumer with a scaled timeout.

### design-audit-rule-proof: done
- `tests/tooling/ui-audit/contract/rules.int.test.ts` parses the proof files under `tests/tooling/ui-audit` and checks every registered rule id has a `fires` and a `silent` proof, no stale id, a bound helper, a literal proof array and an inline callback at top level. `AuditRuleProof` is now one type in `tests/support/node/ui-audit-relational.ts` with `rule: DesignAuditRuleId`; 12 test files import it instead of local copies. Plants: `kind: "maybe"` on a real proof: exit 1; misspelled id `side-tabb`: TS2820, exit 1.
- Redo fix: `helperForwardsToTest` now treats a FunctionDeclaration, VariableDeclaration or Parameter named `test` inside the helper as a shadow (`tests/tooling/ui-audit/contract/rules.int.test.ts:96`), matching the deleted gate's three visitor kinds. Red first: the new function and parameter shadow assertions failed on the old single-kind check (`expected [] to deeply equal ArrayContaining ["not bound"]`). Plant `function test(_title, _fn) {}` as the first line of `auditRuleTest` in `tests/tooling/ui-audit/lib/checks-media.test.ts`: the coverage test goes red with two `not bound` findings and the missing `buried-raster` fires and silent proofs (exit 1); plant removed, checks-media back to 22 tests.
- parity: 15 mustFlag / 4 mustPass ported, 0 lost. Registry-missing and empty-registry hold by construction (the test imports the registry and asserts it is non-empty). The computed-id row is a type guard (`string extends DesignAuditRuleId`); duplicate ids are asserted at runtime.
- Deleted: the gate, its `_liveness` arm, its entry in `mixed-hook-singletons.suite.test.ts`. Comments naming the gate are repointed.
- Population narrowing fixed (verifier P3): the scan now reads every `.ts`/`.tsx` under `tests/tooling/ui-audit` plus `tests/tooling/design-audit-walker.ct.tsx` (`rules.int.test.ts:186`). Plant `tests/tooling/ui-audit/zz-plant-proof.ts` with a `ghost-rule` registration: red (`auditRuleTest is not bound`, exit 1); plant removed, 6/6 green. Census: `git ls-files tests/tooling/ui-audit` has 0 non-`.test.ts` files; `auditRuleTest` appears in 14 files, none the walker ct; ast-grep `auditRuleTest($$$)` 167 hits in 12 ts files, 0 in tsx.

### domain-freshness-plane: escalate
- 14 mustFlag / 8 mustPass. The MISSING, STALE and ORPHAN arms derive "mutating domain" from source: `@orb/db` import plus a write call, with a checker-confirmed read-only batch carve-out (5 mustFlag rows). Domain names are directory names; no canonical union exists for `satisfies Record` totality. A faithful successor needs a TS program over `packages/server/src/domain`, which a lane may not run. The seating arms read `drizzle-schema`, a security-reviewed producer.
- Left in place, unchanged.

### query-boundary-reservation and query-boundary-reservation-health: escalate (both)
- Native direction is clear: widen `NO_LITERAL_RESERVATION` (`eslint.config.js:599`) for TS wrappers, and a parse-only duplicate `reserveKey` literal scan test. A same-file const count cannot be a selector (a dynamic identifier prop is a legal count).
- Blocker: `tests/tooling/verify/gates/_liveness/runner.ts` uses the pair as its dependency-control fixtures (`DEPENDENCY_CONTROL_IDS`, four control tests, plus `tests/tooling/verify/lib/instrument-affected-liveness.test.ts`). Replacing them needs synthetic arms and a real-corpus liveness run, which builds a whole-workspace program. Not run, not edited.
- Left in place, unchanged, with no partial successor landed.

Note: `message-kind-policy.repo.int.test.ts` names `MEMORY_INGEST_KINDS` in its file prefilter; a new carrier would fail closed (false red), never slip through.

## Waivers and grants rejudged
No `@orb-waive` marker or reviewed grant for any of the eight gates outside the gate files and their fixtures. The 4 contract markers and 2 message-kind markers lived only in the deleted gates' proof rows. Nothing added.

## Checks
- Biome on every changed file: clean.
- Tests (run bare, serially, this pass): `test-kinds.test.ts` 10/10 (red first on the runtime-variant plant, then green), `appearance-carrier-manifest.test.ts`, `appearance.test.ts`, `message-kind-policy.repo.int.test.ts`, `rules.int.test.ts` together 38/38, `test-hand-shape.test.ts`, `registry-family.suite.test.ts`, `mixed-hook-singletons.suite.test.ts`, `native-inherited-members-delivery.int.test.ts` together 79/79.
- Locked typecheck `pnpm typecheck --config tsconfig.json`: exit 1 on exactly three errors, all in untouched legacy support files and present before the first edit: `tests/legacy/inference/_support.ts:201`, `tests/legacy/server/domain/embeddings/_support.ts:300` and `tests/legacy/server/domain/search/_support.ts:296`. No error in a file this shard changed.
- Biome on the changed test and report: clean.
- Scratch tsc runs for the type plants were made in the first pass (small custom tsconfigs, deleted).

## Owed to primary
- Regenerate `docs/law/Core-Enforcement-Active-Gates.md` (six removed rows).
- `lint:eslint-scoped` is not owed: no eslint config edit.
- The real-corpus liveness runner and the whole `tests/tooling/verify` directory were not run.
- s6-delete-facts-1 can now retire the `appearance-carrier` fact and its three libs.
- Historic comments naming deleted gates remain in `reference-fact-writes.ts`, `absent-subject-anchor.ts`, `policy-refusal-coverage.ts`, `static-authored-value.test.ts`.
