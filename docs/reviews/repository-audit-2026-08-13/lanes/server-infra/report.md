## Lane identity

- Lane: server-infra
- Semantic scope: server sealed infrastructure and its paired auth, crypto, extraction, image, network, plugin-host, and storage tests.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`.
- Working-tree basis: current working-tree bytes; receipt reconciliation has zero mismatches.
- Assigned files read: 95 / 95 (100%).
- Assigned lines read: 12,127 / 12,127 (100%).
- Assigned bytes read: 595,707 / 595,707 (100%).
- Dirty assigned paths: 0 (all assigned hashes match the snapshot manifest).
- Exclusions: provider infrastructure and every sibling audit lane; entry and domain composition are cited only as cross-lane edges.

## Read receipt

`read-receipt.tsv` contains every `OWNED` path in `assignment.txt` and reconciles to 95 files, 12,127 lines, and 595,707 bytes with zero record mismatches. Full-file sequential read method and ordering precede AST work in `commands.md`.

## Architecture observed

Auth resolves request credentials into a db-free `ResolvedIdentity` contract; dispatch selects the configured resolver and the entry seam owns persisted sessions (`packages/server/src/infra/auth/contract.ts:1-3`, `packages/server/src/infra/auth/dispatch.ts:1-77`). Network exports self-enforcing `safeFetch` and a global defense-in-depth firewall (`packages/server/src/infra/network/index.ts:10-41`, `packages/server/src/infra/network/egress.ts:8-16`). Plugin automation composes `createPluginHost` at `packages/server/src/entry/compose/automation-plugin.ts:53` (AST importer receipt). Crypto, extraction, image, and storage remain injectable/pure adapters by their front-door declarations (`packages/server/src/infra/crypto/index.ts:7-14`, `packages/server/src/infra/extraction/formats.ts:18-38`, `packages/server/src/infra/network/image-guard.ts:36-66`, `packages/server/src/infra/storage/index.ts:1-14`).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Auth | 4 | 3 | 4 | 4 | 3 | high | Mode dispatch and fail-closed signed/unsigned gates: `packages/server/src/infra/auth/dispatch.ts:1-77`, `packages/server/src/infra/auth/modes/forward-header.ts:124-157`; 27 paired unit test files pass in the 44-file / 435-test direct run (R4). |
| Crypto | 4 | 3 | 4 | 4 | 3 | high | AES-GCM + disabled-box boundary: `packages/server/src/infra/crypto/secrets.ts:41-70`; keyfile failure closes: `packages/server/src/infra/crypto/key.ts:58-82`; paired unit tests pass (R4). |
| Extraction and storage | 4 | 3 | 5 | 4 | 3 | high | Exhaustive loader map: `packages/server/src/infra/extraction/formats.ts:18-38`; ZIP staging/reject behavior is directly covered by `tests/server/infra/storage/zip.int.test.ts:233-445` and the direct integration run (R5). |
| Egress and ingress | 5 | 4 | 5 | 4 | 4 | high | Per-hop resolve/validate/pin: `packages/server/src/infra/network/egress.ts:466-610`; ingress anti-spoof precedence: `packages/server/src/infra/network/ingress.ts:27-41`; direct attack/integration tests pass (R5). |
| Plugin host | 4 | 4 | 4 | 4 | 3 | high | Entry composition at `packages/server/src/entry/compose/automation-plugin.ts:53`; sandbox escape and lifecycle unit tests pass in the direct run (R4). |

## Findings

No defect, wiring gap, or gate blind spot was established within the assigned denominator. No negative claim is made: structural work recorded positive resolved-import and caller paths only.

## Proven strengths

### server-infra-01 — Egress firewall is both globally backstopped and locally self-enforcing

- Class: proven-strength
- Confidence: high.
- Evidence rung: R4 for current hostile-path unit behavior plus R3 entry-composition reach.
- Scope denominator: `packages/server/src/infra/network/egress.ts` and seven paired network test files.
- Receipts: `packages/server/src/infra/network/egress.ts:8-16`, `packages/server/src/infra/network/egress.ts:466-610`, `tests/server/infra/network/safefetch-selfenforcing.suite.test.ts:1-218`, direct 44-file / 435-test pass.
- Established fact: every `safeFetch` hop re-applies scheme, host, DNS-address, and redirect controls, while the global dispatcher protects non-`safeFetch` calls.
- What remains unverified: real deployment DNS/firewall configuration.

### server-infra-02 — Plugin host is reached from entry composition and exercises hostile guest paths

- Class: proven-strength
- Confidence: high.
- Evidence rung: R5.
- Scope denominator: nine plugin-host production files and seven paired tests.
- Receipts: `packages/server/src/entry/compose/automation-plugin.ts:53`, `packages/server/src/infra/plugin-host/port.ts:1-225`, `tests/server/infra/plugin-host/escape.suite.test.ts:1-461`, direct pass.
- Established fact: the entry composition imports `createPluginHost`; paired escape, membrane, port, realm, and sandbox tests pass.
- What remains unverified: an actual production QuickJS/plugin deployment.

## Declared versus completed

`safeFetch` is declared at `packages/server/src/infra/network/index.ts:13-22`, internally called by image/web/model/plugin surfaces (AST callers receipt), and exercised by direct unit/integration attack tests (R5). `createPluginHost` is exported by `packages/server/src/infra/plugin-host/index.ts:23`, imported at `packages/server/src/entry/compose/automation-plugin.ts:53`, and covered by direct paired unit tests (R4). Auth and crypto have current unit proof (R4); extraction, image, network, and storage include current integration paths (R5). Entry/domain end-to-end composition is outside this lane.

## Tests and gates

The focused direct Vitest command passed 44 files and 435 tests. Its assertions include invalid signatures, algorithm confusion, untrusted forwarded peers, DNS/private-target/redirect attack paths, guest escapes, malformed/bomb/zip-slip archives, and cryptographic AAD/key failures (`tests/server/infra/auth/jwks.test.ts:1-202`, `tests/server/infra/network/egress-attack.suite.int.test.ts:1-172`, `tests/server/infra/plugin-host/escape.suite.test.ts:1-461`, `tests/server/infra/storage/zip.int.test.ts:233-445`). There are no owned CT/e2e tests, so live browser/runtime deployment behavior is not asserted here.

## Cross-lane edges

- Entry composition is outside the lane: `packages/server/src/entry/compose/automation-plugin.ts:53` establishes the plugin-host live import; the entry/composition owner should reconcile startup lifecycle.
- `safeFetch` consumers include `packages/server/src/infra/plugin-host/membrane.ts:567` and `packages/server/src/infra/network/openai-models.ts:59`; provider and entry lanes own their external service behavior.

## Tool receipts

`pnpm ast` completed successfully. Resolved importers found 4 egress imports in 3 server files and 20 plugin-host imports in 6 server files; `safeFetch` callers found 4 calls in 3 server files. No direct ast-grep negative was used. Full commands, scope and artifact caveat are in `commands.md`.

## Lane verdict

All 95 assigned files reconcile to the snapshot and their paired behavioral suite currently passes (44 files, 435 tests). Auth, crypto, archive extraction, SSRF protection, and plugin isolation have meaningful hostile-path coverage. Positive AST evidence reaches entry composition for the plugin host and consumers for `safeFetch`. The largest remaining uncertainty is real deployment configuration and behavior owned outside this lane; no in-scope defect was established.
