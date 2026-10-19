# KEEP-family health tripwires folded into real-tree tests

Three of four `-health` gates are retired. Each guarded a name-keyed derivation of a KEEP family, and the same claim is now asserted against the real files in the family suite. `css-var-defined-health` stays and is escalated. No producer, grant, waiver or budget row changed.

Cadence: the old gates ran in the per-commit static tier. The successors sit under `tests/tooling/`, which runs only in the weekly proof (`scripts/ci-shard.ts:117`). Primary rules on whether that drop is acceptable.

## stale-draft-decision-health (done)

- Successor: `tests/tooling/verify/gates/stale-draft-family.suite.test.ts` asserts `DRAFT_DECISION_HOME` exists and the module at that path exports `resolveCommit`.
- Plant: `packages/client/src/lib/edit-session.ts` moved out of the tree. `pnpm test:scoped tests/tooling/verify/gates/stale-draft-family.suite.test.ts` exited 1 with `packages/client/src/lib/edit-session.ts is the path the draft finding sends readers to: expected false to be true`. Restored, then green.
- Parity: 1 mustFlag / 1 of 2 mustPass ported, 0 lost. The second mustPass (a partial fixture without the db schema anchor) guards the in-memory harness, which no longer exists for this claim.
- Deleted: `tooling/src/verify/gates/stale-draft-decision-health.ts`; `DRAFT_TREE_ANCHOR` and `draftDecisionHomeMissing` in `tooling/src/verify/lib/stale-draft-read.ts` (no other reader, ast-grep ts 8835 files and tsx 1654 files); the `multi-root-b.ts` liveness arm; the health cases in the family suite.
- Waivers and grants: none existed for the id.

## testid-liveness-health (done)

- Successor: `tests/tooling/verify/gates/testid-variant-split-family.suite.test.ts` runs the production reader `testIdRegistryRow` over the real `packages/client/src/lib/test-ids.ts` and requires exactly `Object.keys(TEST_IDS).length` rows, which is stronger than the gate's "not zero". Six registry-file shapes run through the same reader.
- Plants: (1) one real row changed to `String("login-handle")`: exit 1, `expected 170 to be 171`. (2) owner-name fence opened in `lib/testid-registry.ts` (`owner === undefined`): exit 1, the "registry const is renamed" row failed `expected 1 to be +0`, and the old gate's own mustFlag[0] failed in the same run. Both restored.
- Parity: 3 mustFlag / 3 mustPass ported, 0 lost. The population-refusal case for an absent home is covered because `addSourceFileAtPath` throws on a missing registry file.
- Deleted: `tooling/src/verify/gates/testid-liveness-health.ts`; the `client-ui.ts` liveness arm; the health half of the family-suite refusal test.
- Waivers and grants: none existed for the id.

## duplicate-action-doors-health (done, one recorded loss)

- Successor: `tests/tooling/verify/gates/action-doors-family.suite.test.ts`. Five fixture shapes pin the derived plane in the pair key (`chats::` when healthy, `feature:chat::` when the vocabulary or the section file name is blind), the unsupported spread withholds the census, and the real client tree must consume every ruled pair under its plane with no alarm. The parent's existing liveness pin (`Subject: chats::chat.pcddLiveProbe`, `_liveness/client.ts`) stays and covers the real corpus too.
- Plants: (A) `SECTION_IDS` renamed in `packages/client/src/state/section-ids.ts`: exit 1, real-tree test, findings keyed `feature:chat::...`. (B) `chats-section.tsx` renamed to `chats-panel.tsx`: exit 1, same assertion. Both restored.
- Parity: 2 mustFlag / 1 mustRefuse / 3 mustPass ported, 0 lost at fixture level.
- Lost claim: the gate reddened a blind derivation even when no duplicate pair existed. The real-tree test sees it only while a ruled pair keys to a rail plane. Eight of ten rulings do today, and the test asserts at least one stays.
- Deleted: `tooling/src/verify/gates/duplicate-action-doors-health.ts`; the `client.ts` liveness arm; the health reference in the family suite. Comment-only edits in `lib/action-door-fact.ts` and `gates/duplicate-action-doors.ts` remove references to the deleted gate. No fact logic changed.
- Waivers and grants: none existed for the id.

## css-var-defined-health (escalate)

- Left in place. Its five populations (definitions, references, class roots, declared Base UI properties, reference-site memberships) are computed from `cssVariableInventory(css, ctx.fact(cssVariableSourceFact), ctx.fact(staticClassFact), ...)` inside `evaluate` (`css-var-defined-health.ts:34-52`). Facts reach a consumer only through the policy runtime, so no production object exposes them to a test. A test-local probe gate would re-run a gate in vitest, which `docs/plans/test-foundation/design.md` rules out.
- The KEEP parents expose one count: `css-var-defined.ts:72` receipts `references=N`. Moving the other four into the parents' receipts changes KEEP gate behavior and their zero-reference `mustPass` fixtures. That is a design decision.
- The runner owns a closeout group for it (`_liveness/runner.ts:66`, `:157-171`, `:320-351`) plus `multi-root-b.ts:70-79`, `static-class-consumers.int.test.ts:11` and a protocol test, all of which need a coordinated rewrite.
- The real-tree family test (`css-variable-resolution-family.suite.test.ts`, 19 grants consumed) would catch four populations indirectly. Class roots could stay blind with the vendor uses still read from string sources, and that was not measured.
- Parity: 1 mustFlag / 1 mustPass / 1 mustRefuse unported.

## Checks

- `pnpm test:scoped` on the three family suites: 27 passed. Each suite was also run red with the plants above.
- `pnpm test:scoped tests/tooling/verify/gates/no-raw-history-writes.test.ts` imports `_liveness/client.ts`. Its policy proof passed. Its real-corpus case failed with `native type fact context is unavailable` from `no-raw-history-writes` itself, a typed gate this change does not touch. That test opens a full real corpus (2.4 GB observed), so it was run once and not repeated. Not reproduced on a clean tree.
- Typecheck not run. The shared heavy lock was held by another probe for over 23 minutes with six waiters, and my wait would have outlived its 10-minute ceiling, so I dropped it. The per-edit TypeScript pass (`tsconfig.json`) showed no error in any touched file and three unrelated errors in `_support.ts`. The final comment-only edits under `tooling/src` were not re-checked.
- Owed to primary: `pnpm typecheck --config tsconfig.json` and `--config tooling/tsconfig.json`; `docs/law/Core-Enforcement-Active-Gates.md` rows for the three retired gates (generated); `pnpm lint:eslint-scoped` is not owed, no `eslint.config.js` change; the weekly-cadence ruling above.
