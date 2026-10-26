# Card import launch closeout

## Outcome

The failure is a search-readiness race in the E2E interaction, not a missing hover class or a demonstrated product hit-target defect.
The repaired test waits for the matching filtered server response and its rendered one-row result before the existing ordinary hover and click.
Product ListRow, character-row, LibraryRow and hover CSS remain unchanged.
Local qualification passes. Release promotion still requires a new passing CI run on the integrated main revision; this report does not claim that run or publication.

## CI evidence

The reported run is [40264993395](https://github.com/Inktomi93/OrbWeaver/actions/runs/40264993395), job [121385334142](https://github.com/Inktomi93/OrbWeaver/actions/runs/40264993395/job/121385334142), at source `3f3a363cf21630af188261ff868579337a355766`.
The preceding reported failure is run `40259190746`, job `121367620271`.
The current job log and its actual smoke trace are retained under `reports/card-import-launch/ci-artifact/` and `ci-trace/`.

The actual row DOM contains both `group` and `group/row`. The missing-group hypothesis is refuted.
The trace records this ordering, in monotonic milliseconds:

| Event | Time / geometry |
| - | - |
| Fill the character search | 86353 |
| Hover the already-visible imported row | 86495–86647; pointer at x209/y266 |
| Begin the ordinary CTA click | 86656 |
| Send filtered `character.list` | 86705; response completes about 86730 |
| Reconcile the filtered row | CTA center moves from y266 to y214 |

The real request input contains `search: "Smoke Imported Archivist"`; the response contains the imported character and `totalCount: 1`.
The import fields, primary book, deduplication and reload assertions complete before this interaction.
The row was visible in the previous query's results, so visibility did not establish that the filtered geometry had settled.

Source explains the timing: `CharacterLibrarySurface` debounces the search, and `create-collection-surface.ts` retains previous rows with `keepPreviousData`.
The floated-action recipe intentionally removes pointer hit testing when its row is no longer hovered or focused.

## Controlled real-server reproduction

The unmodified plain case passed locally once. That is recorded as a pass, not evidence that the CI failure disappeared.
A bounded diagnostic then used the existing `holdTrpcProcedure` helper to hold the browser's real `character.list` request.
It created an unrelated character through the public server API, hovered while the old rows remained, released the actual request, and let the real filtered result render.
No response payload was fabricated, and no sleep, forced click, dispatched click or focus workaround was used.

| Observation | Before release | After real filtered render |
| - | - | - |
| Row `:hover` | true | false |
| CTA computed pointer events | auto | none |
| CTA center | x294/y318 | x294/y214 |
| Hit at the CTA center | CTA icon path | Clickable body's subtitle |
| List scrollTop | 0 | 0 |

The subsequent ordinary click failed with the same subtitle interception as CI.
The wrapper itself reports pointer-events none in both states; its children correctly opt back into hit testing while the row is hovered.
This distinction prevents misdiagnosing the intended invisible-control protection as the defect.

The controlled source, report, trace and failure screenshot are retained in `reports/card-import-launch/controlled-old-order-*`.
The diagnostic hold and DOM probe are not part of the committed test.

## Repair

`tests/e2e/card-import.spec.ts` now matches the browser response to the actual `character.list` batch member and validates that member's input with the production character-list schema.
It then asserts the rendered Character library contains one row, before hovering and clicking the imported character's CTA.
The matching response alone is not treated as proof of rendered state.

An unrelated witness is created through the real character API so an unfiltered library cannot accidentally satisfy the filtered-result assertion on an otherwise empty install.
Both spec-owned names are cleaned before the run; the witness, imported character and imported book are removed afterward.
All existing field, book, deduplication, reload, room and greeting assertions remain intact.

## Completed checks

| Command / evidence | Result |
| - | - |
| Exact plain real-app case before repair | 1 pass; `unmodified-local-pass.log`. |
| Controlled old interaction order, real request/server | Ordinary click fails as in CI; `controlled-old-order.log` and report. |
| `pnpm exec biome check --write tests/e2e/card-import.spec.ts --diagnostic-level=error` | Pass; `biome.log`. |
| `pnpm lint:eslint tests/e2e/card-import.spec.ts` | Pass; `eslint.log`. |
| `pnpm typecheck tsconfig.tests-dom.json` | Pass; `typecheck.log`. |
| `E2E_ALLOW_DEV_TARGET=0 E2E_LIVE=0 pnpm e2e tests/e2e/card-import.spec.ts --project=single-user --workers=1` | Repaired plain production-build application case passes, 1/1; `local-green.log` and `local-green-report.json`. |

All short artifact names above are under `reports/card-import-launch/`.
The native configuration owns the isolated single-user stack at 8796/5181. Both ports were free before the runs and after cleanup.
The unknown shared service at 8788 was not stopped, restarted or used.
No broad local CI replay, product-style change, timeout increase or release-gate bypass is included.
