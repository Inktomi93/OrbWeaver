## Lane identity

- Lane: `server-transport-kit`
- Semantic scope: `@orb/server` public barrel, server-only pure kit/serde, jobs, tRPC transport, streaming, rate limit, and the 131 mirrored tests.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952` (manifest); current HEAD at initial receipt: `c93253a3f907fb7fd93d411c511a98ed378505db`.
- Working-tree basis: current working-tree bytes; all owned bytes match the manifest rows.
- Assigned files read: 131 / 131 (100%).
- Assigned lines read: 21,111 / 21,111 (100%).
- Assigned bytes read: 1,086,543 / 1,086,543 (100%).
- Dirty assigned paths: 0 at the snapshot reconciliation; lane artifacts are untracked audit outputs.
- Exclusions: no client, entry, domain, infra, foundation, gate, or sibling-lane analysis.

## Read receipt

`read-receipt.tsv` records a post-barrier first-to-last `sed -n '1,$p'` completion for every owned path: 131 rows / 21,111 lines / 1,086,543 bytes, all with exit 0 and SHA-256 equal to `assignment.txt`. The replay ran at 2026-08-13T23:32:59-06:00 through 2026-08-13T23:33:01-06:00, before the retained AST commands. See `commands.md` for the exact method and closing drift basis.

## Architecture observed

The public package surface exports only `AppRouter` as a type (`packages/server/src/index.ts:3`, R2). `appRouter` composes transport feature routers (`packages/server/src/transport/trpc/router.ts:42`, R3); individual tRPC routers use the context service bundle rather than importing domains directly (for example `packages/server/src/transport/trpc/routers/assets.ts:18`, R3). The server kit holds deterministic node-only-pure transforms, including request-body sanitizing merge (`packages/server/src/kit/custom-parameters/index.ts:29`), VM-bounded regex application (`packages/server/src/kit/regex/index.ts:28`), and card serde (`packages/server/src/kit/serde/card/index.ts:333`, R2–R3). The mirrored central tests execute through current unit and integration projects (command receipts).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Pure server kit and serde | 4 | 3 | 4 | 3 | 3 | high | `packages/server/src/kit/custom-parameters/index.ts:29`; `packages/server/src/kit/serde/card/index.ts:333`; 158 current unit assertions (R4) |
| tRPC router / middleware transport | 4 | 4 | 4 | 3 | 4 | high | `packages/server/src/transport/trpc/router.ts:42`; `packages/server/src/transport/trpc/trpc.ts:83`; `tests/server/transport/trpc/router.test.ts:1`; current serial integration receipt (R5) |
| Rate limiting and tenant boundary | 4 | 4 | 5 | 3 | 4 | high | `packages/server/src/transport/rate-limit.ts:1`; `tests/server/transport/rate-limit.int.test.ts:1`; `tests/server/transport/cross-tenant-sweep.suite.int.test.ts:1` (current R5) |
| Streaming sockets | 4 | 3 | 4 | 2 | 3 | medium | `packages/server/src/transport/trpc/stream/socket.ts:1`; `tests/server/transport/trpc/stream/socket.test.ts:1`; `tests/server/transport/trpc/stream/sources/chat.test.ts:1` (R4) |

## Findings

### STK-01 — P2 candidate: 33 declared tRPC procedures need client-lane reachability reconciliation

- Severity: P2
- Candidate status: pending client-lane intent and consumer verification; do not promote to a repository defect without it.
- Class: declared-not-wired
- Confidence: medium
- Evidence rung: R3
- Scope denominator: 369 server procedures enumerated by the repository's structural provider-minus-client lens; 33 candidates in 11 assigned router files.
- Receipts: `packages/server/src/transport/trpc/routers/assets.ts:34`; `packages/server/src/transport/trpc/routers/automation.ts:40`; `packages/server/src/transport/trpc/routers/connection.ts:13`; `packages/server/src/transport/trpc/routers/plugin.ts:37`; post-read `pnpm ast unwired` (2026-08-13T23:33:09-06:00, exit 0, 10.211s).
- Established fact: the resolver-aware lens reports these provider procedures as absent from its client proxy/inference consumer surface. The source declarations are live server router members; the lens is not a test or runtime client trace.
- User or system impact: if confirmed, exposed operations are unreachable from the shipped client despite being registered server-side.
- What remains unverified: the client lane owns direct examination of proxy, re-export, and dynamic/inference consumers, so this lane cannot call the candidates defects.
- Suggested next check or fix: client integration lane should validate each candidate against client intent, then either consume it or remove/park the server procedure deliberately.

## Proven strengths

- The rate-limit integration suite is current R5 evidence: 7 assertions passed (`tests/server/transport/rate-limit.int.test.ts:1`) and the serial cross-tenant sweep passed 2 assertions including a positive owner control plus stranger denial (`tests/server/transport/cross-tenant-sweep.suite.int.test.ts:1`, command receipt).
- Current R5 composition evidence also covers plugin lifecycle: the real runtime install-enable-log-disable-uninstall flow passed (`tests/server/transport/trpc/routers/plugin.int.test.ts:1`, command receipt).

## Declared versus completed

The package entry declares a deliberately type-only client surface (`packages/server/src/index.ts:1-3`, R2). Router composition is registered in `appRouter` (`packages/server/src/transport/trpc/router.ts:42-97`, R3). Current unit coverage directly asserts the pure kit, router, card/chat serde, socket, and stream-source behaviors (R4); selected integration and serial integration results elevate rate limiting, tenant isolation, chat-router behavior, and plugin lifecycle to current R5. Procedure-level client consumption remains a cross-lane candidate set rather than a completed assertion.

## Tests and gates

Narrow direct runs passed 158 unit assertions, 12 integration assertions, and 4 serial-integration assertions. The cross-tenant suite includes a positive owner control, avoiding a vacuous denial result. The membership gates currently prove that runner-suffixed tests participate in both type and execution configurations, but they do not prove every procedure's behavior.

## Cross-lane edges

- Client/integration owner: reconcile the 33 `pnpm ast unwired` procedure candidates. The owned transport declarations are cited above; no client source conclusion is made here.
- Entry/compose owner: confirm production entry mounting and external service reachability for the tRPC router; this lane proves router composition but does not own the HTTP entry path.

## Tool receipts

Post-read `pnpm ast` bare completed in 1.301s at 2026-08-13T23:33:08-06:00. Post-read `pnpm ast unwired` completed in 10.211s at 2026-08-13T23:33:09-06:00 with 369 provider procedures and 33 candidates. The attempted kit-orphan lens did not return an exit receipt through the desktop 30-second command yield and is excluded from conclusions. See `commands.md` for direct test, membership-gate, scope, and drift receipts.

## Lane verdict

The scoped kit and transport surfaces have substantial current unit coverage and selected current integration proof, including tenant isolation and plugin lifecycle. tRPC router composition is demonstrably registered within the server package. The material unresolved question is procedure-level client reachability: the repo lens reports 33 candidates, but validating client intent is outside this lane. No source/test/config changes were made.
