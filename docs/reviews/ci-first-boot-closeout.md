# First-boot reservation repair

## Outcome

The affected browser selection passes: 42 cases, including the unchanged desktop and phone first-boot cases. The held-read reservation assertions remain intact.

The source is based on `c94b763637`. The application harness, first-boot stories, route holds, timeouts and viewport configuration are unchanged.

## Cause

The coarse-pointer `size.control-lg` token emits `round(up, max(3.5rem, 56px), 1px)`. The generated `snappedLengthPx` decoder accepts only a simple length. It returns `null` for this expression.

`skeletonBoxFor` propagates that result. `useFirstBootBox` then supplies no reservation to the real `QueryBoundary`. The phone pending state therefore has no `data-reserve-key` element.

The unchanged cold run reproduces the CI result: desktop passes; workloads, connections, admin and appearance fail on phones after their held requests begin. This is a production reservation defect, not a delayed request or viewport initialization defect.

The connections trace contains the served stylesheet at `resources/93fdc6a64b56231f7edd968ce71cb848047af013.css`. Its coarse token contains the nested `max` expression. The pending DOM retains the Connections settings region without its declared reservation.

## Repair

- Live skeleton dimensions and the shell content floor use the existing `resolveCssLength` browser resolver.
- Skeleton non-DOM reads use `LENGTH_BASE_PX`. The shell keeps its unavailable-measurement `false` result and existing subscriptions.
- Refinery picker and empty-recents authored-root heights use their generated numeric companions.
- The generator no longer emits the unused decoder. Token CSS and numeric values do not change.

The native resolver also handles owner-authored expressions without another CSS parser. Its existing invalid-property behavior remains unchanged.

## Controls

The new component cases mount real `SkeletonRows` and the existing `useFirstBootBox` door. They compare rendered height with the reservation and recover the row count through `skeletonRowCountFor`.

The matrix uses fine and coarse pointers, root scales 0.8 and 1.25, and an owner-authored `round`/`calc`/`max` expression. Each case verifies the requested media, scale and override before measuring geometry.

Against matching old metrics and generated token exports, the geometry selection fails seven cases and passes the fine-pointer 1.25 control. Coarse and owner-expression declarations are undefined. Fine-pointer 0.8 declares 130px against 127px rendered: floating-point multiplication followed by `Math.ceil` over-reserves each row. The repaired selection passes all geometry cases.

## Verification

Commands run from the lane checkout:

| Command | Result |
| - | - |
| `CT_PORT=3165 pnpm test:ct tests/client/features/config/surfaces/first-boot-boxes.ct.tsx --workers=2 --output=reports/ci-first-boot/cold-old-source` | Expected old-source result: four desktop passes and four phone failures |
| `CT_PORT=3165 pnpm test:ct tests/client/components/skeleton-reservation.ct.tsx --workers=2 --output=reports/ci-first-boot/geometry-old-source` | Expected old-source control: seven failures and one pass |
| `CT_PORT=3165 pnpm test:ct tests/client/features/config/surfaces/first-boot-boxes.ct.tsx tests/client/components/skeleton-reservation.ct.tsx tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx tests/client/features/auth/components/login-pending-join.ct.tsx tests/client/features/chat/anchors/join-invite-dialog.ct.tsx --workers=2 --output=reports/ci-first-boot/final` | 42 passed |
| `pnpm typecheck tsconfig.json tooling/tsconfig.json packages/ui/tsconfig.json packages/client/tsconfig.json tsconfig.tests-dom.json` | Passed, including the router dependency |
| `pnpm test tests/ui/token-contract.test.ts` | 20 passed; generated artifacts match |
| `pnpm test:tools tests/tooling/native-token-scales.test.ts` | Three passed |
| `pnpm knip` | Passed |
| `pnpm knip:prod` | Passed; existing server-context internal-tag hints remain informational |
| Scoped `pnpm lint:eslint` over changed source and browser files | Passed |
| Scoped native dependency-cruiser over changed source, generated tokens and browser files | Passed |
| Scoped Biome and `git diff --check` | Passed |

The final browser run and static checks use a frozen tree. Both old-source files are restored to their exact repaired contents before final verification. No retry or warm-up navigation is used.

## Artifacts and limits

Ignored native artifacts are under `reports/ci-first-boot/`: CI download in `artifact/`, unchanged cold failures in `cold-old-source/`, geometry controls in `geometry-old-source/`, and final JSON in `final/report.json`. Compiler, token, Knip, ESLint and dependency logs are sibling files.

This selection establishes Chromium CT behavior under the application's native gallery pipeline. No screenshot baseline, private data or shared application server is used.

## Parent-owned application E2E

The required application suites pass at source `a29129661b9f6955c044ae1e74223f13310c1be6`.
The parent runs the maintained corpus wrapper from the lane checkout:

```sh
E2E_CORPUS_REPORT_PREFIX=reports/ci-first-boot/e2e pnpm exec node scripts/corpus-fixture.ts e2e -- tests/e2e/smoke.spec.ts tests/e2e/corpus-home-launch.spec.ts tests/e2e/corpus-joiner.local.spec.ts --project=corpus-desktop-flat --project=corpus-phone-flat --project=corpus-local-desktop-flat --project=corpus-local-phone-flat --workers=1
```

The native result is 27 passed and one declared phone exclusion, with no unexpected failures, flaky cases, retries or runner errors.
The excluded no-selection state belongs to the desktop content pane; the phone opens the Chats list instead.
The JSON result is `reports/ci-first-boot/e2e-report.json`; the parent transcript is `/tmp/ci-first-boot-e2e.log`.
The wrapper completes successfully. Its server and Vite ports are unbound afterward, with no cleanup failure reported.

The corpus fixture selects its appearance preference before each tested flow. These flows do not replace the separate cold first-boot controls.
Independent correctness review confirms the Node/Knip and browser repair commits. A new CI run still owns application-wide acceptance; no push is performed.
