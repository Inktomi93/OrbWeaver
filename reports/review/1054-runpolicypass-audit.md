# 1062 runPolicyPass audit (native type fact context)

Candidates: 94. Method: declaration census (253 non-syntax analysis declarations: 172 types, 81 resource; rg over tooling/src tests packages scripts; ast-grep -l ts runPolicyPass 285 calls in 158 files, tsx 0, over 5302 ts + 723 tsx files), plus a runtime oracle (scratch vitest config wrapping runPolicyPass to log every pass whose toolErrors/factErrors carry "native type fact context is unavailable"). The refusal only fires when a policy or fact CALLS a ctx.nativeTypes method (tooling/src/verify/lib/policy-pass-context.ts:189-200), so a types declaration alone is not a defect.

## Totals

- unsure (escalated): 4
- not-types: 69
- supplied-elsewhere: 12
- defect-fail (fixed): 6
- defect-fail (fixed, unverified): 1
- expected-refusal: 2

## Rows

| file | disposition | evidence |
|---|---|---|
| floor/code-facts/drizzle-native-provenance.test.ts | unsure (escalated) | all 10-57 cases red with 'drizzle-schema-data: create: native type fact context is unavailable' (run2). The 1054 fix clears the refusal but the isolated facts then deliver no drizzle evidence (35 of 57 / 11 of 19 / 9 of 10 still red, findings empty); production delivery (projectCtx) then refuses 'native inventory requires pre-import implementation observation' because it needs the mocked semantic inventory (nativeInventoryFixture, cb-1055 fence). Edits reverted. Needs a design decision. |
| floor/code-facts/drizzle-settled-reads.test.ts | unsure (escalated) | all 10-57 cases red with 'drizzle-schema-data: create: native type fact context is unavailable' (run2). The 1054 fix clears the refusal but the isolated facts then deliver no drizzle evidence (35 of 57 / 11 of 19 / 9 of 10 still red, findings empty); production delivery (projectCtx) then refuses 'native inventory requires pre-import implementation observation' because it needs the mocked semantic inventory (nativeInventoryFixture, cb-1055 fence). Edits reverted. Needs a design decision. |
| verify/lib/policy-pass-readers.suite.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); inline policy-pass-readers.suite.test.ts:types@66 |
| verify/lib/waivable-coordinate.test.ts | not-types | inline waivable-coordinate.test.ts:syntax@121 |
| floor/code-facts/server-factory-type-home.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/no-inline-package-interface.ts:syntax L27; gates/no-inline-types.ts:resource L111 |
| verify/lib/macro-resolution-failure.test.ts | not-types | gates/macro-resolution-home.ts:syntax L20 |
| floor/code-facts/type-home-declaration.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/no-inline-domain-interface.ts:syntax L66; gates/no-inline-package-interface.ts:syntax L27; gates/no-inline-types.ts:resource L111; gates/no-inline-wire-interface.ts:types L35 |
| floor/code-facts/drizzle-helper-origins.test.ts | unsure (escalated) | all 10-57 cases red with 'drizzle-schema-data: create: native type fact context is unavailable' (run2). The 1054 fix clears the refusal but the isolated facts then deliver no drizzle evidence (35 of 57 / 11 of 19 / 9 of 10 still red, findings empty); production delivery (projectCtx) then refuses 'native inventory requires pre-import implementation observation' because it needs the mocked semantic inventory (nativeInventoryFixture, cb-1055 fence). Edits reverted. Needs a design decision. |
| verify/lib/policy-effective-population.test.ts | not-types | inline policy-effective-population.test.ts:resource@164; inline policy-effective-population.test.ts:resource@192; inline policy-effective-population.test.ts:syntax@342; inline policy-effective-population.test.ts:syntax@364; inline policy-effective-population.test.ts:syntax@427; inline policy-effective-population.test.ts:resource@449 |
| verify/gates/caught-failure-ownership.repo.int.test.ts | supplied-elsewhere | spreads ...nativeTypeFactOptions(context) at :120 |
| verify/gates/disclosure-reservation-family.suite.test.ts | not-types | gates/query-boundary-reservation.ts:syntax L71; gates/query-boundary-reservation-health.ts:syntax L64; gates/sub-floor-disclosure.ts:syntax L77; gates/sub-floor-disclosure-health.ts:syntax L50 |
| verify/lib/policy-analysis.test.ts | not-types | inline policy-analysis.test.ts:syntax@21 |
| floor/code-facts/component-type-home.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/no-inline-package-interface.ts:syntax L27; inline component-type-home.test.ts:types@660 |
| verify/gates/tier-home-health-family.suite.int.test.ts | not-types | gates/spacing-tier-home-health.ts:syntax L19; gates/typography-tier-home-health.ts:syntax L19 |
| verify/gates/dangling-refs.repo.int.test.ts | not-types | gates/dangling-ref-citations.ts:resource L106; gates/dangling-refs.ts:resource L315 |
| verify/gates/stale-draft-family.suite.test.ts | not-types | gates/stale-draft-commit.ts:syntax L16; gates/stale-draft-decision-health.ts:syntax L12 |
| verify/lib/resource-policy.test.ts | not-types | inline resource-policy.test.ts:resource@45; inline resource-policy.test.ts:resource@101; inline resource-policy.test.ts:resource@141 |
| verify/gates/tooling-slot-template.test.ts | not-types | gates/tooling-slot-template.ts:resource L192 |
| verify/gates/resource-layout-wave-1.suite.test.ts | not-types | gates/feature-owns-definition.ts:resource L73; gates/package-layout.ts:resource L59; gates/server-layout.ts:resource L77 |
| verify/gates/no-raw-id-origin.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/no-raw-id.ts:types L124 |
| verify/gates/no-unruled-flip-inversion.suite.test.ts | not-types | gates/no-unruled-flip-inversion.ts:syntax L107 |
| verify/gates/simple-visitors-1584.suite.test.ts | not-types | gates/assumes-single-replica.ts:syntax L152; gates/no-hardcoded-model-prose.ts:syntax L262; gates/no-vanity-alias.ts:syntax L306 |
| verify/gates/resource-layout-wave-2.suite.test.ts | not-types | gates/client-structure.ts:resource L251; gates/feature-structure.ts:resource L205 |
| verify/gates/test-world-browser-contracts.repo.int.test.ts | defect-fail (fixed) | virtualVerdict/nativeVerdict passes had no facts; 8 of 10 tests red with the refusal (run3), green 10/10 in run4. Whole-corpus census test (line ~155) given projectCtx delivery but NOT run (whole tree): owed-to-primary. |
| verify/gates/class-string-literal-wave.suite.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/class-token-splice.ts:types L272 |
| verify/lib/waiver-ratchet.test.ts | not-types | inline waiver-ratchet.test.ts:syntax@97; inline waiver-ratchet.test.ts:syntax@215 |
| verify/gates/gate-ignore-inventory-family.suite.test.ts | not-types | gates/gate-ignore-inventory.ts:syntax L24 |
| verify/gates/identity-enforcement.repo.int.test.ts | defect-fail (fixed, unverified) | test-1 runs no-direct-users-read (sealed-origin) + two-class-role-authority (tuple-vocabulary fact, role-vocabulary-native) over the real tree with no facts and asserts toolErrors/factErrors empty. Fixed with projectCtx + nativeTypeFactOptions (same shape as caught-failure-ownership.repo.int:114-121). Whole-tree: NOT run, owed-to-primary. |
| verify/gates/session-channel-family.suite.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/session-channel-boundary.ts:types L72 |
| verify/lib/policy-pass-context.test.ts | not-types | inline policy-pass-context.test.ts:syntax@37; inline policy-pass-context.test.ts:syntax@53; inline policy-pass-context.test.ts:syntax@146 |
| verify/gates/ordinary-client-and-ct-wave.suite.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/context-definition-shape.ts:types L52; gates/context-definition-shape-health.ts:syntax L75; gates/form-factory-for-multifield.ts:syntax L279; gates/no-form-reset-in-autosave.ts:syntax L94; gates/no-form-reset-in-autosave-health.ts:syntax L62; gates/route-trpc-lifo-order.ts:syntax L133; gates/state-files.ts:syntax L154 |
| verify/gates/macro-resolution-family.suite.test.ts | not-types | gates/macro-resolution-home.ts:syntax L20 |
| verify/gates/query-freshness-coverage-family.suite.test.ts | supplied-elsewhere | projectCtx + ...nativeTypeFactOptions(context) at :67-73 |
| verify/gates/no-tailwind-dark-variant.int.test.ts | defect-fail (fixed) | passOf/test-1 passes had no facts; static-class fact refused ('visit: native type fact context is unavailable'). Third test is a deferral case and needs none (left alone). Red run2 2 hits; green run4 3/3. |
| verify/lib/policy-refusal-envelope.test.ts | not-types | inline policy-refusal-envelope.test.ts:syntax@47; inline policy-refusal-envelope.test.ts:syntax@168; inline policy-refusal-envelope.test.ts:syntax@182; inline policy-refusal-envelope.test.ts:syntax@194 |
| verify/gates/client-query-pair-conversion.suite.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/windowed-infinite-query.ts:types L200; gates/windowed-infinite-query-health.ts:syntax L73 |
| verify/gates/css-home-topology-family.suite.test.ts | not-types | gates/playwright-css-topology.ts:resource L339; gates/sanctioned-css-homes.ts:resource L88 |
| verify/gates/legacy-filename-admission.suite.test.ts | not-types | gates/test-layout.ts:resource L126 |
| verify/gates/no-blanket-suppression.repo.int.test.ts | not-types | gates/no-blanket-suppression.ts:resource L404 |
| verify/lib/schema-fact.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); inline schema-fact.test.ts:types@85; inline schema-fact.test.ts:types@147 |
| verify/gates/union-axis-family.suite.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/no-inline-union-alias.ts:syntax L26; gates/no-inline-union-redecl.ts:types L152 |
| verify/gates/testid-variant-split-family.suite.test.ts | not-types | gates/testid-liveness.ts:syntax L176; gates/testid-liveness-health.ts:syntax L57; gates/ui-variant-axes-stamped.ts:syntax L106; gates/ui-variant-axes-stamped-health.ts:syntax L59 |
| verify/gates/text-citation-family.suite.test.ts | not-types | gates/d-citation-integrity.ts:resource L115; gates/dangling-doc-cite.ts:resource L303 |
| verify/gates/mixed-hook-singletons-conversion.suite.test.ts | not-types | gates/tooling-instrument-proof.ts:resource L213 |
| verify/gates/over-art-plate-arm.int.test.ts | not-types | gates/over-art-plate-arm.ts:resource L183 |
| verify/gates/runner-config-path-liveness.int.test.ts | not-types | gates/runner-config-path-liveness.ts:resource L256 |
| verify/gates/css-variable-resolution-family.suite.test.ts | defect-fail (fixed) | local `run` helper built a Project with no nativeTypeFacts; static-class fact refused. Fix: nativeTypeFacts: () => isolatedTypeFacts(project). Red run2 hits 4/5 tests; green run4 for planted-tree cases. Real-frontend final case stays red: isolated facts cannot serve the real tree (needs projectCtx delivery; owed-to-primary). |
| verify/gates/depcruise-grant-liveness-health.int.test.ts | not-types | gates/depcruise-grant-liveness-health.ts:resource L51 |
| verify/gates/ct-config-mirror-parity.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/ct-config-mirror-parity.ts:types L622 |
| verify/gates/chat-viewer-plane-family.suite.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/chat-viewer-plane-canon-reads.ts:types L38 |
| verify/lib/appearance-carrier-fact.test.ts | not-types | gates/appearance-carrier-contract.ts:syntax L12; gates/appearance-carrier-health.ts:syntax L11 |
| verify/gates/density-tier-family.suite.test.ts | not-types | gates/density-tier.ts:syntax L158; gates/density-tier-slot-map.ts:resource L97 |
| verify/gates/compose-wiring-only.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/compose-wiring-only.ts:types L701; gates/query-boundary-reservation.ts:syntax L71; gates/query-boundary-reservation-health.ts:syntax L64 |
| verify/gates/suppressions-family.suite.test.ts | not-types | gates/suppressions.ts:syntax L213 |
| verify/gates/legacy-reach-boundary.suite.test.ts | not-types | gates/test-reach.ts:resource L568 |
| verify/gates/schema-data-grants.suite.repo.int.test.ts | supplied-elsewhere | spreads ...nativeTypeFactOptions(context) at :93 |
| verify/gates/z-index-tier-health.suite.test.ts | not-types | gates/z-index-tier-health.ts:syntax L12 |
| verify/gates/simple-visitors-wave-4.suite.test.ts | not-types | gates/no-form-state-in-useeffect.ts:syntax L87; gates/surface-in-a-container.ts:syntax L109 |
| verify/gates/contract-shape-wave-1.suite.test.ts | not-types | gates/contract-derives-not-respells.ts:syntax L158; gates/injected-op-caller-param.ts:syntax L95; gates/injected-op-caller-param-health.ts:syntax L77; gates/serde-core-seal-health.ts:syntax L22 |
| verify/gates/db-structure.int.test.ts | not-types | gates/db-structure-producer-home.ts:resource L24 |
| verify/gates/ui-primitive-grants.suite.repo.int.test.ts | not-types | gates/ui-primitive-overlay-health.ts:syntax L11; gates/ui-primitive-permissions.ts:resource L18; gates/ui-primitive-structure.ts:syntax L12 |
| verify/gates/mirror-index-family.suite.test.ts | not-types | gates/no-inline-union-alias.ts:syntax L26; gates/test-layout.ts:resource L126; gates/test-presence-client.ts:resource L42; gates/test-reach.ts:resource L568 |
| verify/gates/css-length-contract-family.suite.test.ts | defect-fail (fixed) | local `run` helper built a Project with no nativeTypeFacts; static-class fact refused. Fix: nativeTypeFacts: () => isolatedTypeFacts(project). Red run2 hits 4/5 tests; green run4 for planted-tree cases. Real-frontend final case stays red: isolated facts cannot serve the real tree (needs projectCtx delivery; owed-to-primary). |
| verify/gates/ct-no-oneshot-live-read-assert.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/ct-no-oneshot-live-read-assert.ts:types L288 |
| verify/gates/external-id-single-writer-family.suite.test.ts | not-types | gates/external-id-single-writer.ts:syntax L116; gates/external-id-single-writer-health.ts:syntax L109; gates/handle-key-writer.ts:syntax L39 |
| floor/compiler/native-policy-cases.ts | supplied-elsewhere | helper module; spreads ...nativeTypeFactOptions(context) at :122 |
| verify/gates/tooling-front-door-family.suite.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/tooling-argv-front-door.ts:types L91 |
| verify/gates/principal-serde-family.suite.test.ts | not-types | gates/entry-synthetic-role-is-user.ts:syntax L143; gates/one-principal-mint-population.ts:syntax L60; gates/serde-core-definition-uniqueness.ts:syntax L39 |
| verify/gates/policy-soundness-family.suite.repo.int.test.ts | defect-fail (fixed) | passOf helper (:166) ran policy-fixture-substrate with no facts; 5 tests red with the refusal (run5, oracle hits 5), fixed with isolatedTypeFacts(project), green in run6. The REAL-corpus tests (:400 vocabulary, :909 gate corpus, assertLiveBindingResolution :849) were excluded as whole-tree and are owed-to-primary; the :909 test runs policies whose population reaches policy-fixture-substrate over the real tree with no facts and asserts toolErrors empty, so it likely needs the same delivery. A named run of it died with a heap OOM (exit 2, no verdict), so the edit for it was withheld. |
| verify/gates/structured-plan-one-home.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/structured-plan-one-home.ts:types L85 |
| verify/gates/warning-workitem-liveness.test.ts | not-types | gates/warning-workitem-liveness.ts:resource L92 |
| verify/gates/testkit-enforcement.test.ts | unsure (escalated) | :243 executePolicyPlan(... nativeSourceView) without nativeTypeFacts; 2 tests red with the refusal (run3). Adding nativeTypeFactOptions(context) did not clear it (still 'visit: native type fact context is unavailable', run4); cause not found in budget. Edit reverted. |
| floor/compiler/native-shape-cases.ts | supplied-elsewhere | helper module; spreads ...nativeTypeFactOptions(context) at :26 |
| verify/ops/native-restrictions.test.ts | not-types | gates/no-form-state-in-useeffect.ts:syntax L87 |
| verify/ops/memo-reservation-native.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/no-manual-memo.ts:types L33; gates/query-boundary-reservation.ts:syntax L71 |
| verify/ops/legacy-structure-selection.suite.test.ts | not-types | gates/test-layout.ts:resource L126 |
| verify/ops/native-export-home-delivery.int.test.ts | supplied-elsewhere | every runPolicyPass spreads ...nativeTypeFactOptions(context) at :108 |
| verify/ops/native-retained-origins-delivery.int.test.ts | supplied-elsewhere | every runPolicyPass spreads ...nativeTypeFactOptions(context) at :138 |
| verify/ops/native-drizzle-policy-delivery.int.test.ts | supplied-elsewhere | every runPolicyPass spreads ...nativeTypeFactOptions(context) at :154,:208,:260,:290 |
| verify/ops/resource-host.test.ts | not-types | inline resource-host.test.ts:resource@244 |
| verify/ops/source-type-suppression-native.int.test.ts | not-types | gates/suppressions.ts:syntax L213 |
| verify/ops/native-invocation-delivery.int.test.ts | supplied-elsewhere | every runPolicyPass spreads ...nativeTypeFactOptions(context) at :134,:196 |
| verify/ops/native-schema-projection-delivery.int.test.ts | supplied-elsewhere | every runPolicyPass spreads ...nativeTypeFactOptions(context) at :116,:165,:196 |
| verify/ops/native-clone-export-delivery.int.test.ts | expected-refusal | run({}) at :78 asserts toolErrors>0 and owners not success (:79-80); all other cases go through nativePolicyFixture -> native-policy-cases.ts:122 which spreads nativeTypeFactOptions. (3 cases red in run2 for the unrelated 'native policy fixture did not complete' child failure.) |
| verify/ops/native-origin-consumers-delivery.int.test.ts | supplied-elsewhere | every runPolicyPass spreads ...nativeTypeFactOptions(context) at :180,:291 |
| verify/ops/resource-git-history.test.ts | not-types | gates/test-layout.ts:resource L126 |
| verify/ops/type-home-native.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/no-inline-domain-interface.ts:syntax L66; gates/no-inline-package-interface.ts:syntax L27; gates/no-inline-types.ts:resource L111; gates/no-inline-wire-interface.ts:types L35 |
| verify/ops/floorless-native.test.ts | not-types | gates/suppressions.ts:syntax L213 |
| verify/ops/tailwind-syntax-native.test.ts | defect-fail (fixed) | second test's runPolicyPass([splice, dark]) had no facts; red run2 hit; green run4 3/3. |
| verify/ops/native-sealed-reference-delivery.int.test.ts | expected-refusal | asserts the refusal on purpose: POLICIES owners withhold with 'native type fact context is unavailable' (:332-343). Every other pass in the file spreads nativeTypeFactOptions (:136,:224,:286). Oracle hit = the intended one. |
| verify/ops/new-gate.test.ts | not-types | types declared but the oracle logged no absent-context error and the file's assertions pass/read toolErrors (no native demand); gates/policy-soundness.ts:types L345 |
| verify/ops/native-type-projection-delivery.int.test.ts | supplied-elsewhere | every runPolicyPass spreads ...nativeTypeFactOptions(context) at :118 |
| verify/ops/ui-size-authority.test.ts | not-types | gates/suppressions.ts:syntax L213 |
| verify/ops/native-typed-authority.test.ts | not-types | gates/suppressions.ts:syntax L213 |

## Runs

- run1 `pnpm test:scoped` over 71 files: 155 red tests; refusal rows in drizzle trio, css pair, no-tailwind-dark-variant.int, tailwind-syntax-native.
- Oracle runs (scratch vitest config outside the repo, `pnpm exec vitest run --config=<scratch>`): run2 over 78 candidate files (86 absent-context passes: drizzle trio 72, css-length 4, css-variable 5, no-tailwind 2, tailwind-syntax 1, clone-export/sealed-reference intended); run3 testkit-enforcement (2 hits) and test-world-browser-contracts (8 hits); run5 policy-soundness (5 hits).
- Green after fixes: run4 css-length 4/6 (the 27-grants count case and the real-frontend case stay red, see below), css-variable 5/6, no-tailwind 3/3, tailwind-syntax-native 3/3, test-world-browser-contracts 10/10 (census excluded); run6 policy-soundness 106/0.
- defect-silent: 0. No test passed while the oracle logged the refusal (apart from the intended sealed-reference case), so no producer-ran assertion was added.

## Not fixed / owed

- Drizzle trio: needs a design decision (production delivery needs the mocked semantic inventory, cb-1055 fence).
- testkit-enforcement :243 pair: fix attempt did not clear the refusal.
- css-length / css-variable final real-frontend cases: isolated facts refuse on the real tree ("static-class: finish: native symbol/node observation..."); they need projectCtx delivery on the real tree. Inherited red: the "27 structural identities" count case.
- Whole-tree, not run: identity-enforcement test 1 (fixed, unverified), test-world-browser-contracts census, policy-soundness :909 (heap OOM on a named run; likely the same defect), caught-failure/dangling/no-blanket/schema-data-grants/ui-primitive (read only).
- Inherited reds unrelated to the refusal: component-type-home (descriptor.fix waiver spelling), compose-wiring-only liveness arm, ct-config-mirror-parity (.mjs no compiler owner), native-restrictions, new-gate (2), several 5000ms timeouts under host load 25-30.
- Run overrun to disclose: run1/run2 also executed macro-resolution-family.suite (getWorkspace of the repo root), ct-config-mirror-parity (whole-tree pass) and query-freshness-coverage-family (projectCtx of cwd) because the sweep list included them; I did not rerun them.
