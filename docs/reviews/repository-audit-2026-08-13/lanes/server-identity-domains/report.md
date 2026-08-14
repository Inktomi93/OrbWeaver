## Lane identity

- Lane: `server-identity-domains`
- Semantic scope: server character, connection, credentials, persona source and their mirrored tests.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`.
- Working-tree basis: all assigned working-tree hashes matched the frozen ledger; no assigned path was dirty.
- Assigned files read: 263/263 (100%).
- Assigned lines read: 20,858/20,858 text lines (100%).
- Assigned bytes read: 1,094,138/1,094,138 (100%).
- Dirty assigned paths: 0.
- Exclusions: sibling-owned composition, transport/router, gate, config, infrastructure, schema, and client files were not read. Composition references below are AST receipts only.

## Read receipt

`read-receipt.tsv` contains every 263 OWNED and 9 SHARED assignment row. Current SHA-256, line, and byte totals reconcile to `assignment.txt`; see `commands.md`.

## Architecture observed

Each owned domain exposes a factory-built service and receives cross-domain work through its context contract, rather than a sideways runtime import: character's factory is called by the assets/character composition root (`packages/server/src/entry/compose/assets-character.ts:209`, AST callers, R3); connection's by services composition (`packages/server/src/entry/compose/services.ts:340`, AST callers, R3); credentials' by the same composition root (`packages/server/src/entry/compose/services.ts:327`, AST callers, R3); and persona's by search/discovery composition (`packages/server/src/entry/compose/search-discovery.ts:218`, AST callers, R3).

Character's persistence layer scopes the joined read by both id and owner (`packages/server/src/domain/character/persistence/queries.ts:83`, R2). Persona's chat-active verb authorizes the actor against the target before selecting a persona owned by that target and delegating the roster write (`packages/server/src/domain/persona/verbs/set-active.ts:13`, R3). Credential resolution dispatches exhaustively by source and uses owner-bound AAD for stored secret arms (`packages/server/src/domain/credentials/verbs/resolve.ts:23`, R2).

## Subsystem scorecards

| Subsystem (denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Character (50 source, 36 test files) | 4 | 4 | 5 | 3 | 3 | high | `packages/server/src/domain/character/persistence/queries.ts:60`; `tests/server/domain/character/persistence/queries.int.test.ts:29`; AST composition receipt; direct 36-file behavioral run. |
| Connection (44 source, 30 test files) | 4 | 4 | 5 | 3 | 4 | high | `packages/server/src/domain/connection/service.ts:19`; `packages/server/src/domain/connection/verbs/resolve-role.ts:1`; `tests/server/domain/connection/verbs/resolve-role.int.test.ts:1`; AST composition receipt; direct 30-file behavioral run. |
| Credentials (34 source, 17 test files) | 4 | 4 | 5 | 3 | 2 | high | `packages/server/src/domain/credentials/verbs/resolve.ts:23`; `tests/server/domain/credentials/verbs/resolve.int.test.ts:57`; `packages/server/src/domain/credentials/verbs/test-health.ts:75`; `tests/server/domain/credentials/verbs/test-health.int.test.ts:92`; AST composition receipt. |
| Persona (33 source, 19 test files) | 4 | 4 | 5 | 3 | 3 | high | `packages/server/src/domain/persona/verbs/set-active.ts:13`; `tests/server/domain/persona/verbs/set-active.int.test.ts:181`; AST composition receipt; direct 19-file behavioral run. |

`Enforcement` remains 3 rather than 4–5 because the owned types, explicit owner predicates, and service contracts reject classes of misuse, but the gate implementation/positive controls are out of this lane and were not independently verified. `Operability` is not 5: current tests supply strong integration evidence but no live-runtime receipt, and credentials have the concrete gap below.

## Findings

### SID-01 — Custom endpoint health is reported as successful without an endpoint check

- Severity: P2
- Class: operability-gap
- Confidence: high.
- Evidence rung: R5.
- Scope denominator: the two `testHealth` branches in `packages/server/src/domain/credentials/verbs/test-health.ts:63`: an OpenRouter probe branch and the non-OpenRouter branch. The finding is limited to the latter; it does not claim that every credential path is unprobed.
- Receipts: `packages/server/src/domain/credentials/verbs/test-health.ts:75` returns `{ status: "ok" }` for a provider other than `openrouter` without invoking `ctx.probe`; `tests/server/domain/credentials/verbs/test-health.int.test.ts:92` expressly asserts `custom_openai` returns `ok` and `h.probed` stays empty; the 76-file direct integration run passed this assertion.
- Established fact: a saved custom OpenAI-compatible endpoint can receive a green health result even when no network/auth request was made. The existing separate `inspectEndpoint` surface does not change what this `testHealth` result represents.
- User or system impact: a health indicator can tell a user a saved custom endpoint is healthy while the next actual model request remains the first reachability/auth check.
- What remains unverified: the client presentation and caller semantics are sibling-owned; this lane did not establish whether the `ok` result is displayed as a green status or merely used as an availability-neutral placeholder.
- Suggested next check or fix: make the branch return an explicit unsupported/unchecked state, or route custom endpoints through a redacted probe and assert a failed custom endpoint cannot produce `ok`.

## Proven strengths

- Character reads avoid foreign-row disclosure: the owner predicate is in the SQL `WHERE` (`packages/server/src/domain/character/persistence/queries.ts:83`), and the real-DB integration test proves an other owner receives `undefined` (`tests/server/domain/character/persistence/queries.int.test.ts:29`); R5 via the direct integration pass.
- Credential tenant binding has two behavioral belts: OpenRouter decrypt requires the active row to belong to the principal (`packages/server/src/domain/credentials/verbs/resolve.ts:24`), and its ciphertext is opened using owner/provider AAD (`packages/server/src/domain/credentials/verbs/resolve.ts:29`). The integration test moves a row to another owner and proves both principals fail to resolve it (`tests/server/domain/credentials/verbs/resolve.int.test.ts:57`); R5.
- Persona chat activation authorizes before the mutation and checks that a non-null persona belongs to the target (`packages/server/src/domain/persona/verbs/set-active.ts:15`). The integration test binds the real chat guard and real participant-row writer, then proves both persistence/event landing and refusal-before-write (`tests/server/domain/persona/verbs/set-active.int.test.ts:181`, `tests/server/domain/persona/verbs/set-active.int.test.ts:223`); R5.

## Declared versus completed

| Surface | Strongest evidence | Status |
| --- | --- | --- |
| Character owner-scoped reads and asset ownership | R5: `packages/server/src/domain/character/persistence/queries.ts:60`; `tests/server/domain/character/persistence/queries.int.test.ts:29` | Implemented and integration-proven for the cited foreign-owner read and asset boundary. |
| Connection role resolution/catalog recovery | R5: `packages/server/src/domain/connection/verbs/resolve-role.ts:1`; `tests/server/domain/connection/verbs/resolve-role.int.test.ts:1`; 30 direct lane test files | Implemented and behaviorally exercised; composition reaches the factory at `packages/server/src/entry/compose/services.ts:340` (R3). |
| Credential secret resolution and AAD lift refusal | R5: `packages/server/src/domain/credentials/verbs/resolve.ts:23`; `tests/server/domain/credentials/verbs/resolve.int.test.ts:57` | Implemented and integration-proven for the cited OpenRouter paths; custom endpoint health has SID-01. |
| Persona CRUD/connections/active chat persona | R5: `packages/server/src/domain/persona/verbs/set-active.ts:13`; `tests/server/domain/persona/verbs/set-active.int.test.ts:181` | Implemented with a real-chat-wire integration receipt; composition reaches the factory at `packages/server/src/entry/compose/search-discovery.ts:218` (R3). |

## Tests and gates

Test membership: 20 unit, 76 integration, and 2 contract paths; direct execution passed 595 assertions across 98 test files. The owned suite contains meaningful real-db and failure-path assertions, including a foreign character read, AAD row lifting, revoked credential refusal, and a real chat authorization/write integration. No lane-owned type, parity, CT, or e2e test path exists.

Gate source, registration, and positive controls are outside this lane. The source contains intentional owner-scope waiver markers on narrow internal writes (for example `packages/server/src/domain/credentials/persistence/queries.ts:61` and `packages/server/src/domain/credentials/persistence/queries.ts:159`); this lane verified their local call-site rationale only through full read, not the gate that accepts/rejects the markers. The relevant gates lane should verify that the marker grammar has a positive control and that no user-facing path reaches these unscoped helpers.

## Cross-lane edges

- Gates lane: validate enforcement of `@owner-scope-write-ok` for credential rotation/revocation in `packages/server/src/domain/credentials/persistence/queries.ts:61` and `packages/server/src/domain/credentials/persistence/queries.ts:159`; this lane makes no claim about gate coverage.
- Server transport/composition lane: reconcile the four AST composition calls cited above with router reachability and user-visible health presentation, especially SID-01’s `CredentialHealth` consumer.

## Tool receipts

`pnpm ast` baseline completed in 1s. Structural caller scans completed in 4–5s and prove factory composition call sites; `apisurface` for character scanned 4,903 source files in 28s; `orphans` for character scanned its requested scope in 20s and returned no results. No broad-query timeout was treated as absence. Literal ownership corroboration covered 84 owned source files with a `userId`/`ownerId`/error-boundary token and is not used for a universal clean claim. See `commands.md` for command syntax, limits, and exclusions.

## Lane verdict

All 263 assigned files were read and ledger-verified; all 98 executable owned tests passed (595 assertions). Character ownership, credential AAD binding, persona chat authorization, and the four service factory composition edges have current R3–R5 receipts. No P0/P1 issue was established in this scope. SID-01 is a tested, deliberate-but-misleading custom-endpoint health result; it is the clearest remaining functional gap. Gate enforcement and end-user presentation remain intentionally unverified outside this lane.
