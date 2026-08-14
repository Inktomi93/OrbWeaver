# Server-entry-edge audit report

## Lane identity

- Lane: `server-entry-edge`
- Semantic scope: the server's HTTP composition root, auth seam and session routes, security/header/static/asset/import routes, lifecycle/rate-limit entry helpers, and their 29 mirrored unit/integration suites.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952` (assignment); current `HEAD` differs (`c93253a3f907fb7fd93d411c511a98ed378505db`).
- Working-tree basis: current working-tree bytes, reconciled to assignment hashes at 2026-08-14T05:25:04Z.
- Assigned files read: 57 / 57 (100%).
- Assigned lines read: 13,572 / 13,572 (100%).
- Assigned bytes read: 663,006 / 663,006 (100%).
- Dirty assigned paths: 0.
- Exclusions: sibling-owned composition/domain/transport files and all CT/e2e/live-runtime surfaces.

## Read receipt

`read-receipt.tsv` and `commands.md` record the full 57-path traversal and pre/post-reconciliation; every assigned checksum, line count, and byte count matched `assignment.txt`.

## Architecture observed

`createApp` composes security headers, allowlist, a once-per-request principal seam, observability, tRPC body limiting/dispatch, explicit HTTP registrars, debug routes, then SPA fallback in order (`packages/server/src/entry/app.ts:149-320`). `createAuthSeam` is the sole entry-side Principal-construction seam and its debug authorization requires a verified credential before an admin check (`packages/server/src/entry/auth/seam.ts:270-335`). Cookie, local, OIDC, first-run, and logout routes are registered only from injected dependencies (`packages/server/src/entry/http/auth-routes.ts:377-410`).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - |
| HTTP/auth edge (28 source files, 29 mirrored tests) | 4 | 4 | 4 | 3 | 4 | high | `packages/server/src/entry/app.ts:149-320`; `packages/server/src/entry/auth/seam.ts:270-335`; 326 unit + 52 integration current passes (R4–R5 by path) |
| Import/export HTTP flows (12 source files, 11 mirrored tests) | 4 | 4 | 4 | 3 | 4 | high | `packages/server/src/entry/app.ts:246-265`; portability and bundle round-trip integration passes (R5) |

## Findings

No owned-source behavior defect, declared-not-wired surface, or test-quality defect met the audit threshold. The zero-finding result is bounded to current owned bytes and the stated direct test set; it is not a claim about sibling-owned routers or browser/live behavior.

## Proven strengths

### `server-entry-edge-01` — credentialed debug-gate parity is currently proven

- Class: proven-strength
- Confidence: high
- Evidence rung: R4 (current unit behavior; no integration/live route receipt in this strength)
- Scope denominator: all 67 cases in `tests/server/entry/debug-gate.suite.test.ts`.
- Receipts: credential provenance allow-list and fail-closed catch (`packages/server/src/entry/auth/seam.ts:247-335`); current unit run passed all 67 cases.
- Established fact: the route registrar receives an `isAdmin` verdict that rejects absent principals and fallback provenance before `requireAdmin`.

### `server-entry-edge-02` — entry HTTP import/export round trips are currently proven

- Class: proven-strength
- Confidence: high
- Evidence rung: R5
- Scope denominator: 4 integration cases across two owned round-trip suites.
- Receipts: registrar composition (`packages/server/src/entry/app.ts:246-265`); current integration run passed `portability-routes.suite.int.test.ts` (2) and `bundle-round-trip.suite.int.test.ts` (2).

## Declared versus completed

`createApp` is declared and internally composes the registrar order (`packages/server/src/entry/app.ts:149-320`, R2–R3), and its behavior is directly asserted by 20 unit cases (R4); this lane did not retain an external caller/mount receipt. Auth seam and auth routes have both direct unit coverage and current integration coverage (R5 for the tested routes). The import/export registrar paths reached current integration round-trip proof (R5). No live-runtime recovery proof was available in this lane, so no R5 operability claim beyond integration is made.

## Tests and gates

Current direct results: 21 unit files / 326 tests and 7 integration files / 52 tests passed. The integration set exercises auth routes, security headers, throttling inversion, import fidelity/residual data, and library/bundle round trips. These are behavioral, not static, receipts. CT/e2e/live scenarios were not owned or run; that is the remaining verification boundary.

## Cross-lane edges

`pnpm ast unwired --max 200` reported 33 potential unconsumed procedures out of 369 in sibling-owned `packages/server/src/transport/trpc/routers/*.ts`; route registration here (`app.ts:206-224`) establishes dispatch but cannot establish client consumption. Hand off to the transport/client integration owners; do not treat as a defect in this lane.

## Tool receipts

See `commands.md`. Repository AST liveness commands returned no entry-scope orphan or test-only candidates; without an independent negative method those remain bounded tool outputs, not absence claims. No tool failures. Final owned hash check found zero drift.

## Lane verdict

The owned server entry edge is materially implemented, composed, and behaviorally tested through current unit and integration runs. The strongest evidence covers credentialed debug access and portable import/export round trips. No owned defect was established. The largest remaining uncertainty is browser/live-runtime behavior and tRPC client consumption, both outside this lane's ownership.
