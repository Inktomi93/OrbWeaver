# Integration-tests lane report

## Lane identity

- Lane: `integration-tests`
- Semantic scope: cross-cutting e2e Playwright specs and support, the assigned CT accessibility suite, shared test substrate, fixture data, and six node integration tests.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00` (`assignment.txt:2`).
- Working-tree basis: 89/89 OWNED paths retained their assigned SHA-256 values at close; two SHARED audit controls drifted after assignment (`read-receipt.tsv:97-98`).
- Assigned files read: 89/89 OWNED (100%); also read 9/9 SHARED prerequisites.
- Assigned lines read: 15,291/15,291 OWNED (100%).
- Assigned bytes read: 796,602/796,602 OWNED (100%).
- Dirty assigned paths: 0 OWNED. The audit-control drift is SHARED only: `docs/reviews/repository-audit-2026-08-13/README.md` and `RUBRIC.md` (`read-receipt.tsv:97-98`).
- Exclusions: no owned paths; non-assigned production implementation is cited only as a runtime destination, not reviewed here.

## Read receipt

`read-receipt.tsv` covers 89/89 OWNED rows and 9/9 SHARED rows from `assignment.txt`; all are marked `full-read`. The owned test/support evidence is current against its frozen hashes. Shared README/RUBRIC edits are audit-control drift, not a source-test drift; the current controls were reread before classification.

## Architecture observed

The browser harness is a real-stack seam, not a mock-only facade: Playwright creates a per-mode server/client stack and runs global setup after those servers are healthy (`playwright.config.ts:47-75`, `playwright.config.ts:77-101`). The smoke spec reaches healthz directly, a tRPC HTTP query through Vite, and the mounted SPA (`tests/e2e/smoke.spec.ts:34-95`). Its debug endpoint case has both refusal and authorized positive control (`tests/e2e/smoke.spec.ts:48-69`).

E2E helpers reach production tRPC procedure strings through `trpcQuery` and `trpcMutation` (`tests/e2e/support/trpc.ts:53-65`): the repo-native resolver found 23 query and 42 mutation calls in the e2e scope (`commands.md`, structural lenses). The same lenses found `startChat` in 10 specs, `sendTurn` in four, UI chat creation in six, and SSE-frame collection in three; this establishes multiple independent harness paths, but only the smoke path received the current e2e run receipt.

The assigned node substrate deliberately composes real DB/service/transport behavior: `scenario.chat` verifies persistence, engine lifecycle, provider errors, and leak-free membership refusal (`tests/support/chat/scenario.int.test.ts:22-104`); fixture callers test the real tRPC error mapping (`tests/support/fixtures.int.test.ts:11-70`). The database batch suite has a non-vacuous valid-batch control and a later-constraint rollback assertion (`tests/server/db/db-batch-atomicity.suite.int.test.ts:34-77`).

The CT accessibility suite mounts real feature stories, tests four planted defect classes before measuring feature surfaces, and waits for each surface's settled control (`tests/client/a11y/accessible-name-quality.suite.ct.tsx:1-86`).

## Subsystem scorecards

| Subsystem (denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| E2E smoke and harness (31 `.spec.ts`, 12 support files) | 4 | 5 | 4 | 4 | 4 | medium | `tests/e2e/smoke.spec.ts:34-95`; `tests/e2e/support/target-guard.test.ts:21-109`; current `reports/e2e-report.json` summarized in `commands.md` |
| Node integration substrate (6 `.int.test.ts`) | 4 | 4 | 4 | 3 | 4 | medium | `tests/support/chat/scenario.int.test.ts:22-104`; `tests/server/db/db-batch-atomicity.suite.int.test.ts:34-77`; current scoped 5-file/28-test receipt in `commands.md` |
| CT accessible-name suite (1 `.suite.ct.tsx`, 13 tests) | 4 | 4 | 5 | 4 | 4 | high | `tests/client/a11y/accessible-name-quality.suite.ct.tsx:44-86`; current `reports/ct-report.json` summarized in `commands.md` |
| E2E target-ownership guard (1 unit test + mode config) | 4 | 4 | 4 | 4 | 4 | high | `tests/e2e/support/target-guard.ts:21-80`; `tests/e2e/support/target-guard.test.ts:21-109`; current 11-test receipt in `commands.md` |

Scores intentionally stop below 5 outside the current exact scopes. The smoke receipt proves only five single-user checks; the live backend test and remaining e2e specs are not silently treated as executed.

## Findings

No defect finding meets the rubric's evidence threshold in this lane. The current evidence establishes scoped strengths and a bounded verification remainder rather than a behavior defect.

## Proven strengths

### integration-tests-01 — Current isolated-stack smoke proves health, debug authorization, transport, and UI mount

- Class: proven-strength
- Confidence: high for the five smoke assertions; it would rise for the broader e2e surface after all selected project/spec groups run.
- Evidence rung: R5.
- Scope denominator: 5 current smoke assertions in one single-user Playwright file; not all 31 assigned specs.
- Receipts: `tests/e2e/smoke.spec.ts:34-95`; `playwright.config.ts:47-101`; current `reports/e2e-report.json` = expected 5, unexpected 0, flaky 0 (`commands.md`).
- Established fact: a current isolated-stack run proved healthz, unauthenticated debug refusal plus token success, owner-scoped `chat.listChats`, SPA mount without a login form, and rendered chat-list success.
- User or system impact: catches broken stack boot, auth/env threading, debug-gate regression, transport failure, and landing-surface failure before broader e2e diagnosis.
- What remains unverified: local/forward-header mode specs, all non-smoke single-user specs, and `@live` behavior.
- Suggested next check or fix: run mode-specific non-live groups, then explicitly opt into the live fixture-provider path if credits/environment are authorized.

### integration-tests-02 — Accessibility suite has current browser evidence and predicate positive controls

- Class: proven-strength
- Confidence: high within the ten named feature stories and four predicate cases; it would rise with more feature-story coverage.
- Evidence rung: R5.
- Scope denominator: 13 tests in the sole assigned CT suite.
- Receipts: planted controls at `tests/client/a11y/accessible-name-quality.suite.ct.tsx:44-86`; surface assertions begin at `tests/client/a11y/accessible-name-quality.suite.ct.tsx:88`; `reports/ct-report.json` = expected 13, unexpected 0, flaky 0 (`commands.md`).
- Established fact: the parser's nameless, duplicate, unnamed-landmark, and Label-in-Name checks are shown to bite before the rail, shell, composer, members, character library, settings, picker, and dialogs are accepted.
- User or system impact: a silently-empty parser cannot make this current scope green, and the named surfaces are currently navigable by accessible role/name.
- What remains unverified: controls outside the ten mounted stories and subjective wording quality that the test deliberately does not attempt to score.
- Suggested next check or fix: add a story when a new interactive surface enters the app.

### integration-tests-03 — Integration substrate proves transaction and authorization failure paths, not just happy paths

- Class: proven-strength
- Confidence: high for the five current files/28 tests; medium for the six-file assigned integration denominator because `backend-matrix.live.int.test.ts` was not run.
- Evidence rung: R5 for the current five-file scope.
- Scope denominator: 5/6 assigned `.int.test.ts` files, 28 current tests.
- Receipts: `tests/server/db/db-batch-atomicity.suite.int.test.ts:34-77`; `tests/support/chat/scenario.int.test.ts:22-104`; `tests/support/fixtures.int.test.ts:11-70`; current canonical test report read after the run (`commands.md`).
- Established fact: real libSQL batch rollback, composed chat lifecycle/provider failures/membership concealment, and tRPC auth/admin/cross-user behavior all passed in the current scoped run.
- User or system impact: catches partial batch commits, leak-prone authorization responses, and typed provider failure regressions.
- What remains unverified: the live backend matrix and production service implementation beyond the pathways driven by these tests.
- Suggested next check or fix: run the live matrix only with its declared external-provider prerequisites.

## Declared versus completed

| Declared surface | Strongest current evidence | Status |
| - | - | - |
| Single-user smoke | R5 current Playwright, 5/5 | completed for smoke scope |
| CT accessible-name quality | R5 current Playwright CT, 13/13 | completed for assigned suite |
| DB/chat/fixture integration substrate | R5 current Vitest, 5 files/28 tests | completed for non-live scoped subset |
| Target-ownership guard | R4 current unit, 11/11 | completed unit proof; its real-stack posture is additionally exercised by smoke boot |
| Local/forward-header, non-smoke, and live e2e | R4 source assertions/read evidence only | declared but not currently executed in this lane |
| `backend-matrix.live.int.test.ts` | R4 full-read test evidence only | declared but not currently executed in this lane |

## Tests and gates

The test quality observed is materially stronger than existence testing: DB atomicity includes a valid positive control, accessibility predicates plant failures, smoke treats unauthorized debug success as a hard regression, and the target guard has refusal/override arms (`tests/server/db/db-batch-atomicity.suite.int.test.ts:34-77`, `tests/client/a11y/accessible-name-quality.suite.ct.tsx:44-86`, `tests/e2e/smoke.spec.ts:48-69`, `tests/e2e/support/target-guard.test.ts:25-55`). The exact node integration run passed 28 tests; CT passed 13; e2e smoke passed 5 (`commands.md`). A requested `pnpm test:types -- <path>` expanded to the configured 16-file project; it is logged but not credited as a scoped result (`commands.md`).

## Cross-lane edges

- Production behavior reached by `trpcQuery`/`trpcMutation`, chat, Rpg, SSE, and browser helpers belongs to the corresponding server/client lanes; this lane proves only the test harness's current exercised paths (`tests/e2e/support/trpc.ts:53-65`; structural counts in `commands.md`).
- The e2e runner starts all configured mode servers even for the selected single-user smoke file (`playwright.config.ts:47-75`). The result is not a claim that local/forward-header specs ran; any runner-scope redesign belongs to the verification-harness lane.
- Current CT output includes repeated Vite/esbuild `es2025` target warnings but a clean canonical report; tooling ownership should determine whether the warning is actionable (`commands.md`).

## Tool receipts

Repo-native `pnpm ast` was read and used: exports (149 in 11 e2e files), tRPC query callers (23/3 files), mutation callers (42/4), chat creation (11/10), turn sends (11/4), UI creation (9/6), and SSE collection (10/3). No negative structural claim is made, so no zero-result inference is taken. Exact command forms, behavioral reports, the escaped types invocation, current control drift, and exclusions are recorded in `commands.md`.

## Lane verdict

All 89 owned files and 9 shared prerequisites were read and reconciled; owned hashes are current. A current isolated e2e smoke run, the assigned CT suite, and five non-live integration files are green at R5. These receipts demonstrate core stack, accessibility, authorization, and transaction strengths in their stated denominators. They do not establish a whole-e2e or live-provider verdict: 26 non-smoke specs, three mode-specific auth specs, and one live integration file remain unexecuted here. The largest uncertainty is live/provider behavior, not a demonstrated defect.
