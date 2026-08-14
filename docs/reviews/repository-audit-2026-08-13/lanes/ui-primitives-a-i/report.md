## Lane identity

- Lane: `ui-primitives-a-i`
- Semantic scope: `@orb/ui` primitives accordion through input, their barrels/variants/helpers, and assigned mirrored CT, fixture, and type tests.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`
- Working-tree basis: current bytes; every owned SHA-256 equals the frozen assignment SHA.
- Assigned files read: 124 / 124 (100%).
- Assigned lines read: 9,046 / 9,046 (100%).
- Assigned bytes read: 431,097 / 431,097 (100%).
- Dirty assigned paths: 0.
- Exclusions: none within the frozen owned set. The coordinator-corrected exact CT command completed successfully; the earlier blocked cache-clear attempt is retained only as a command-history note.

## Read receipt

`read-receipt.tsv` reconciles every `OWNED` assignment row to current path, line count, byte count, and SHA-256: 124 rows, 9,046 text lines, and 431,097 bytes. Reconciliation found zero assignment-to-working-tree byte drift.

## Architecture observed

The lane is the sealed `@orb/ui` layer: public barrels expose a narrow wrapper surface over Base UI, while variants supply tokenized slots. For example, accordion declares its five Base UI wrapper parts in `packages/ui/src/primitives/accordion/accordion.tsx:20`, `:28`, `:36`, `:45`, and `:59`, and its barrel forwards that surface at `packages/ui/src/primitives/accordion/index.ts:1`. The source is exercised by the corresponding CT mounts (`tests/ui/primitives/accordion/accordion.ct.tsx:10`, `:41`, `:66`, `:92`; R4 source-test evidence). Production reachability is established only where explicitly checked: `AriaAnnouncer` mounts from the app root (`packages/client/src/routes/app-root.tsx:87`; R3) and `BackgroundVideo` mounts from the theme layer (`packages/client/src/features/app-shell/components/theme-background-video-layer.tsx:44`; R3).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Assigned A–I primitive wrappers (83 source files) | 3 | 2 | 4 | 3 | 2 | medium | `packages/ui/src/primitives/accordion/accordion.tsx:20`; `tests/ui/primitives/accordion/accordion.ct.tsx:10`; current exact-scope CT: 26 suites / 263 passed / 0 failed, flaky, or skipped. |
| Accessibility-only announcer | 3 | 3 | 0 | 2 | 1 | high | `packages/ui/src/primitives/aria-announcer/aria-announcer.tsx:12`; `packages/client/src/routes/app-root.tsx:87`; complete AST + literal negative receipts below. |
| Background-video policy wrapper | 4 | 3 | 4 | 2 | 2 | medium | `packages/ui/src/primitives/background-video/background-video.tsx:42`; `tests/ui/primitives/background-video/background-video.ct.tsx:13`; current exact-scope CT passed; `packages/client/src/features/app-shell/components/theme-background-video-layer.tsx:44`. |

## Findings

### UI-AI-01 — AriaAnnouncer is mounted in production but has no direct test coverage

- Severity: P2
- Class: declared-not-tested
- Confidence: high — confidence would rise only with a current behavioral test proving live-region update semantics.
- Evidence rung: R3 for live production wiring; R0 for behavioral verification.
- Scope denominator: one assigned implementation file; 1,865 test source files scanned structurally and 1,863 discoverable `tests/**/*.{ts,tsx}` literal-search files cross-checked.
- Receipts: `packages/ui/src/primitives/aria-announcer/aria-announcer.tsx:12` renders the persistent status/live/atomic region; `packages/client/src/routes/app-root.tsx:87` mounts it; `pnpm ast jsx AriaAnnouncer --in tests` scanned ts:1,431 + tsx:434 (1,865 total) with 0 matches; `rg -n --glob '*.{ts,tsx}' 'AriaAnnouncer' tests` found 0 matches over 1,863 files; `tests/ui/primitives/aria-announcer` has 0 files.
- Established fact: the primitive has a deliberate accessibility contract (`role="status"`, `aria-live="polite"`, `aria-atomic="true"`) but no test exercises its rendered ARIA state or message update behavior.
- User or system impact: a later refactor can silently regress route announcements without any lane-local test failing.
- What remains unverified: whether app-root integration/e2e coverage asserts the resulting announcement; no such claim is made from this lane.
- Suggested next check or fix: add a focused CT asserting the status region and an update to `message`; independently inspect the app-root/integration lane before deciding whether a broader test already covers the user-visible route transition.

## Proven strengths

- `BackgroundVideo` locks its decorative-media policy in the primitive rather than exposing arbitrary video attributes: it declares hidden/focus-excluded at `packages/ui/src/primitives/background-video/background-video.tsx:71`, muted/looping at `packages/ui/src/primitives/background-video/background-video.tsx:77`, and inline autoplay at `packages/ui/src/primitives/background-video/background-video.tsx:79`; its CT has five mounts beginning `tests/ui/primitives/background-video/background-video.ct.tsx:13` (R5: exact lane CT passed, 26 suites / 263 tests), and one production mount is structurally established at `packages/client/src/features/app-shell/components/theme-background-video-layer.tsx:44` (R3).
- Accordion’s full anatomy is explicit and its assigned CT covers four root configurations (`tests/ui/primitives/accordion/accordion.ct.tsx:10`, `:41`, `:66`, `:92`; R5: exact lane CT passed, 26 suites / 263 tests).

## Declared versus completed

The assigned lane declares 83 source files and pairs 26 CT files, 14 fixture files, and one type test. The audited sample establishes wrapper declaration and barrel export surfaces at R2, explicitly checked production uses at R3, and current CT behavior for the 26 test-paired primitives at R5 (26 suites / 263 passed / 0 failed, flaky, or skipped). `AriaAnnouncer` is the one direct absence finding: declared and production-mounted, but no direct test was found under the two independent test-corpus methods.

## Tests and gates

The exact 26 lane-owned CT files ran through `pnpm test:ct`: 26 suites / 263 passed / 0 failed / 0 flaky / 0 skipped. `reports/ct-report.json`, `reports/ct-results/.last-run.json`, and `reports/ct-flaky.json` agree. `pnpm test:types -- tests/ui/primitives/input/index.test-d.ts` reported 16 files / 65 tests / no type errors, but its configured project ignored the positional path and ran outside lane scope; it receives no lane pass credit. Full command receipts are in `commands.md`.

## Cross-lane edges

- The app-root owner should assess end-to-end route-announcement behavior: this lane establishes only that it renders `<AriaAnnouncer message={routeAnnouncement} />` at `packages/client/src/routes/app-root.tsx:87`.
- Theme-background-video-layer ownership should reconcile the one established production consumer at `packages/client/src/features/app-shell/components/theme-background-video-layer.tsx:44` with its feature-level tests.

## Tool receipts

`pnpm ast` was run bare before structural work. The clean AriaAnnouncer test absence has two methods and non-zero denominator receipts; complete scan totals, all other AST scans, literal scope, and incomplete-tool records are in `commands.md`. `pnpm ast apisurface ui --in packages/ui/src/primitives` did not emit its required epilogue after 30.3s, so it was not used as evidence.

## Lane verdict

All 124 frozen owned files reconcile to current bytes and received a complete receipt. The wrappers expose real component surfaces; two sampled production consumers are structurally reachable, and exact-scope CT proves 26 paired specs current at 263 passed / 0 failed, flaky, or skipped. The highest-confidence defect is the production-mounted AriaAnnouncer’s direct test gap. The largest remaining uncertainty is behavior of source surfaces without an assigned CT, beginning with AriaAnnouncer.
