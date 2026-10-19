# 1041 shard s2-eslint-restrict-tests-2 (eslint-restrictions)

Test: `tests/tooling/verify/ops/ct-spec-native.suite.test.ts`. Red first: 19 failed, 19 passed (the passing rows were the off-rule negatives). Green after the rules: 38 of 38.
No `check:structure` and no `lint:eslint-scoped` ran. Owed: `pnpm lint:eslint-scoped` on the changed config, `tests/tooling/gate-spelling-twins.int.test.ts`, and the liveness suites that import `_liveness/tooling-tests.ts`.

## testid-typed-only-stories: done

- Successor: `orb/testid-typed-only-stories`, a `RESTRICTIONS` row in `CT_SPEC_RESTRICTIONS` (`eslint.config.js`), scope `tests/**/_*stories.tsx` and `tests/**/*.stories.tsx`, `tests/legacy/**` excluded (the old population `@tests` excluded the legacy root too). It shares `typedTestIdRule` with `orb/testid-typed-only`, now a factory that takes the message.
- Parity: 3 mustFlag / 3 mustPass ported, 1 lost. Lost: one finding per id per file (every element is flagged now) and the positional `@orb-waive` value coordinate (an inline `eslint-disable-next-line` with a reason replaces it).
- Waivers: 0 live markers (the one inventory marker was gate fixture text); 0 grants. Live tree: 10 story files plus 11 CT specs, 0 findings.
- Deleted: the gate, `tooling/src/verify/lib/testid-value.ts` (only importer was the gate), the `respelled-constant` roster id in `antipatterns.ts`. `waivableCoordinate` stays (18 callers). Prose repointed in `UI-Gates-and-Lessons.md`, `enforcement-antipatterns.md`, `story-test-ids.ts`.
- Confirmed against design.md:236: the stories reader is lexical, so it moves.

## route-trpc-lifo-order: done

- Successor: `orb/route-trpc-lifo-order`, a selector row. Sibling combinator: a statement whose leading call (awaited, bound or returned) is `page.route(<trpc pattern>)` followed by a sibling statement whose leading call is `routeTrpc(...)`. The pattern covers a string literal, a no-substitution template and a one-level `as`/`satisfies`. Scope `tests/**/*.ct.tsx`, legacy excluded.
- Parity: 4 mustFlag / 8 mustPass ported, 1 lost. Lost: the finding count per registration (one finding now lands on the burying `routeTrpc` statement, so the two-registration row gives 1 not 2). Widened on purpose: a whole inversion inside one `beforeEach` body is now flagged (the old declared-limit mustPass row flips to a flag). Kept as passes: cross-scope beforeEach, separate tests in a file (a new control), pattern held in a variable, node tests, legacy.
- Waivers: 3 inventory markers were all fixture text (gate and its wave test); 0 live; 0 grants.
- Deleted: the gate, its arm in `_liveness/tooling-tests.ts`, its waiver test and wave entry in `ordinary-client-and-ct-wave.suite.test.ts`, its row in `gate-spelling-twins.baseline.json`.
- Live tree: 11 CT specs that mention `page.route` or `routeTrpc`, 0 findings.

## ct-poll-schedule-and-paint: kept-with-reason (arm A moved, arm B retained)

- Arm A (shared `intervals` schedule): `orb/ct-poll-intervals-shared`, a HARD rule (hand rule with scope resolution, in `hardConfig`, `noInlineConfig` true, empty suppressions). A module-scope object carrying `intervals` is shared; a function-local options object (`tests/support/browser/contained-within.ts:74`) stays legal. Parity for arm A: 5 mustFlag / 4 mustPass ported, 0 lost. Live tree: 17 of the poll-bearing files linted under the HARD profile, 0 findings.
- Arm B (unbarriered `evaluate(el => el.click())` before a layout-shift poll) stays in the gate, narrowed. Reason: the audit target needs a new testkit helper and a ban on every raw evaluate-click, including the barrier-preceded form the gate allows. That is a design call, and no ordering-aware selector exists. 2 mustFlag / 4 mustPass retained in the gate. Live count for arm B: 0 raw evaluate-clicks outside `tests/legacy`.
- Edited: gate narrowed (message, rows, evaluate loop), `lib/ct-poll-schedule-and-paint.ts` loses `reportSharedSchedule` and its helpers (the `-health` gate's imports are untouched), liveness arm now uses an arm B overlay, family test title. Nothing deleted.
- The `-health` gate and the lib stay for s6.
- Waivers: 0 markers, 0 grants (HARD takes none).

## Lost-claim summary

Dedupe per id per file and positional story waivers (stories); per-registration count (route); none for arm A. No new waiver, no budget row raised, no bulk suppression.
