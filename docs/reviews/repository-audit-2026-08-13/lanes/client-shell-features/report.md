## Lane identity

- Lane: `client-shell-features`
- Semantic scope: client app shell, auth, config, home, notifications, tag, and assigned mirrored tests.
- Snapshot commit: `c93253a3f907fb7fd93d411c511a98ed378505db`
- Working-tree basis: current bytes match every frozen owned hash.
- Assigned files read: `143 / 143` (100%).
- Assigned lines read: `14,943 / 14,943` (100%).
- Assigned bytes read: `807,696 / 807,696` (100%).
- Dirty assigned paths: `0`.
- Exclusions: server procedures, client composition root/routes, shared state/data, gates, and CT harness are other lanes; they are cited only as cross-lane edges.

## Read receipt

`read-receipt.tsv` covers all 143 owned paths and reconciles to `assignment.txt`: 143 matching SHA-256 values, 0 drift. The read set contains 98 source files and 45 test/support files: 31 CT, six unit, and eight CT-story/fixture modules.

## Architecture observed

The six features expose front doors and are reached by the non-owned composition root: resolved importer evidence places app shell at `packages/client/src/main.tsx:28` and `packages/client/src/routes/app-root.tsx:13`; auth at `packages/client/src/main.tsx:38`, `packages/client/src/routes/login-page.tsx:7`, and `packages/client/src/routes/router.tsx:2`; and config, home, notifications, and tag respectively at `packages/client/src/main.tsx:59`, `:63`, `:64`, and `:72` (R3, `pnpm ast importers`).

That root registers config’s collection roster and tag contribution (`packages/client/src/main.tsx:233-245`), home’s tile registry (`:213-227`), and the notification chrome with app-shell chrome (`:269-275`) (R3, source inspection plus resolved importer results). App shell’s own production reachability has no `prodonly` result, as do auth, config, home, notifications, and tag; this is bounded output from six scoped repository-instrument runs, not an assertion about unscanned client code.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| App shell / appearance | 4 | 5 | 5 | 3 | 2 | high | `packages/client/src/features/app-shell/surfaces/app-shell.tsx:1`; `packages/client/src/main.tsx:28`; app-shell CT files; current CT R5 |
| Authentication client surface | 4 | 5 | 5 | 3 | 2 | high | `packages/client/src/features/auth/surfaces/login-surface.tsx:24-152`; `packages/client/src/routes/login-page.tsx:7`; auth CT and six unit suites, R5/R4 |
| Config, home, and tag contributions | 4 | 5 | 5 | 3 | 2 | high | `packages/client/src/features/config/lib/config-section.tsx:26-39`; `packages/client/src/features/home/lib/home-section.tsx:25-39`; `packages/client/src/features/tag/lib/tag-collection.tsx:16-30`; main registry receipts, R5 |
| Notifications inbox chrome | 4 | 5 | 5 | 3 | 2 | high | `packages/client/src/features/notifications/components/notification-bell.tsx:64-216`; `packages/client/src/main.tsx:269-275`; notification bell CT, R5 |

Scores do not imply unowned server/API behavior. Operability remains 2 because this lane has a current headless CT receipt, not a live deployed client/server receipt or recovery/health exercise. Enforcement is 3 where closed axes/registry types create a compile-time or exhaustive-dispatch backstop, but no gate-positive-control was run in this lane.

## Findings

No behavior-defect, declared-not-wired, declared-not-tested, gate-blind-spot, architecture-drift, or operability-gap finding reached the evidence threshold in the assigned scope. The scoped zero-output liveness checks are not reported as a clean finding because `pnpm ast` does not expose a scanned-file denominator; the command receipt records the scope inventory and literal cross-check instead.

## Bounded structural observations (not proven strengths)

Composition root reaches all six feature front doors.

- Confidence: high
- Evidence rung: R3
- Scope denominator: six feature front doors; resolved importers found 2 app-shell, 3 auth, and 1 each config/home/notifications/tag importer.
- Receipts: `packages/client/src/main.tsx:28-72`; `packages/client/src/routes/app-root.tsx:13`; `packages/client/src/routes/login-page.tsx:7`; `packages/client/src/routes/router.tsx:2`; `pnpm ast importers` and the independent nine-edge literal cross-check recorded in `commands.md`.
- Established fact: every assigned feature is resolved from a production entry path, and all six scoped `prodonly` runs returned zero files (bounded tool output).

## Proven strengths

### CSF-02 — Assigned UI behavior has a current CT receipt

- Class: proven-strength
- Confidence: high
- Evidence rung: R5
- Scope denominator: 31 assigned CT files across app-shell, auth, config, home, notifications, and tag.
- Receipts: `reports/ct-report.json` current run stats (288 expected, 0 skipped, 0 unexpected, 0 flaky, 58,873ms); `reports/ct-flaky.json:1-6`; examples include `tests/client/features/app-shell/surfaces/app-shell.ct.tsx:1`, `tests/client/features/auth/surfaces/login-surface.ct.tsx:1`, and `tests/client/features/notifications/components/notification-bell.ct.tsx:1`.
- Established fact: the direct CT runner completed after building the component bundle; the canonical result artifact is current and green.

### CSF-03 — Pure helper branches have current unit coverage

- Class: proven-strength
- Confidence: high
- Evidence rung: R4
- Scope denominator: six assigned unit files.
- Receipts: `tests/client/features/app-shell/lib/resolve-theme-background.test.ts:1`; `tests/client/features/app-shell/lib/resolve-theme-scope-tokens.test.ts:1`; `tests/client/features/auth/lib/auth-error.test.ts:1`; `tests/client/features/auth/lib/route-guards.test.ts:1`; `tests/client/features/auth/lib/sso-redirect.test.ts:1`; `tests/client/features/home/lib/order-home-tiles.test.ts:1`; current run: 40/40 tests passed.

## Declared versus completed

| Declared surface | Strongest current evidence | Status |
| - | - | - |
| App shell, appearance sections, chrome and modal contribution | R5 CT plus R3 main/root import edges | completed in assigned client scope |
| Auth mode dispatcher and login forms | R5 CT; R4 route/auth-error/SSO units; R3 route imports | completed in assigned client scope |
| Config collection host and tag collection/member editor | R5 CT and R3 root registration | completed in assigned client scope |
| Home section and tile ordering | R5 CT and R4 ordering unit | completed in assigned client scope |
| Notification bell, inbox actions and sheet/bar variants | R5 CT and R3 chrome registration | completed in assigned client scope |

## Tests and gates

The six unit suites make meaningful branch assertions for theme resolution, auth error/guards/SSO redirect, and home ordering (40 current passes, R4). The 31 CT files are backed by a fresh Playwright result with no unexpected/flaky/skipped tests (R5). CT source and server responses remain distinct: the run proves the component paths/harnessed data interaction, not a live server deployment. No gate-positive-control was within this lane’s scope; the type-level exhaustive/registry protections are code-observed, while gate coverage belongs to the gate lanes.

## Cross-lane edges

- Client-runtime should reconcile this lane’s R3 importer/root evidence with router bootstrap and actual application launch; this lane does not own `packages/client/src/main.tsx` or routes.
- Server notifications/auth lanes should reconcile the client’s tRPC mutation/query shapes with producer, authorization, and durable delivery behavior; this lane only proves the client action paths.
- Gate lanes should assess the asserted feature-front-door, registry, and no-cross-feature enforcement mechanisms with their positive controls.

## Tool receipts

`pnpm ast cycles client` returned zero cycles. `pnpm ast orphans packages/client/src/features/app-shell --files` returned zero hits. Six `prodonly` scopes each returned zero files, and six importer lenses resolved the root/route edges listed above. The exact scope inventory is 98 tracked files (97 TS/TSX and one CSS); because the repository instrument does not print scan denominators, zeroes are explicitly bounded. Literal import search independently found all nine production import edges. One sandbox-prep rejection occurred before the first CT process started; the direct CLI CT run then completed green. See `commands.md` for exact commands and artifacts.

## Lane verdict

All 143 assigned bytes match the frozen assignment and were read. The assigned client shell/auth/config/home/notifications/tag surfaces are implemented and have resolved composition-root reachability (R3). A fresh scoped result provides 288 green CT cases (R5), and six targeted unit files provide 40 green assertions (R4). No product defect reached the reporting threshold. The largest remaining uncertainty is live server/deployment behavior, which is outside this client feature lane and intentionally not upgraded from CT evidence.
