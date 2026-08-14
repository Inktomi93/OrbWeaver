## Lane identity

- Lane: docs-core-spines
- Semantic scope: active core spine and server-tier law, plus its assigned shared audit controls.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`.
- Working-tree basis: clean assigned bytes at HEAD `356cd4b4fd0d524c4b027bc81d431aecf107e9e2`; every assigned hash matches the frozen assignment.
- Assigned files read: 19 / 19 assignment rows (100%).
- Assigned lines read: 6,369 / 6,369 (100%).
- Assigned bytes read: 476,751 / 476,751 (100%).
- Dirty assigned paths: 0.
- Exclusions: no owned file exclusion; duplicate shared rows are counted as assigned rows but have identical bytes.

## Read receipt

`read-receipt.tsv` covers every `assignment.txt` row and reconciles to its line, byte, and hash values (100%).

## Architecture observed

The documents establish the package cake and a downward-only server tier sequence, with entry as the sole cross-feature composition tier (`docs/architecture/core/Core-0-Architecture-and-Structure.md:35`, `:91`, `docs/architecture/core/Tier-5-Entry.md:7`). The described enforcement is not merely prose in the sampled claims: `MODE_RESOLVERS` is an exported mapped record that is indexed at its resolver call site (`packages/server/src/infra/auth/dispatch.ts:31`, `packages/server/src/infra/auth/index.ts:42`; R3), and `EffectiveAppConfig` is exported and imported by server/client consumers (`packages/contracts/src/settings/index.ts:1141`; `pnpm ast refs EffectiveAppConfig`; R3). `pnpm check:docs` currently passes (R5 for formatting only), not for semantic truth.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Core spines and tiers (10 owned laws) | 4 | 3 | 2 | 3 | 3 | medium | `Core-0-Architecture-and-Structure.md:12-29`; `Tier-5-Entry.md:7-14`; `pnpm ast` receipts in `commands.md` |
| Settings/config spine | 3 | 3 | 2 | 2 | 2 | high | `Spine-Config-and-Serialization.md:19-25`; `packages/contracts/src/settings/index.ts:1141-1167`; `pnpm ast refs EffectiveAppConfig` |
| Provider tier documentation | 3 | 2 | 1 | 2 | 2 | high | `Tier-3b-Providers.md:9-9`, `:23-28`, `:43-56`; `packages/server/src/infra/providers/contract/backend.ts:43-50` |

## Findings

### DOCS-CORE-SPINES-01 — Config spine omits three live effective-config fields

- Severity: P2
- Class: law-drift
- Confidence: high — raise only if the interface is intentionally not the resolved-config authority, which the same law expressly denies.
- Evidence rung: R3
- Scope denominator: the single current `EffectiveAppConfig` law claim, 22 named fields, versus all 25 interface members.
- Receipts: `docs/architecture/core/Spine-Config-and-Serialization.md:23` says `EffectiveAppConfig` has 22 fields and enumerates them; `packages/contracts/src/settings/index.ts:1141-1167` declares 25, adding `structuredOutputShape`, `structuredOutputVehicle`, and `promptCacheMinDepth`; `pnpm ast refs EffectiveAppConfig --in packages --max 30` found active server and client consumers.
- Established fact: the active law says the interface is the truth but presents an obsolete field count/list.
- User or system impact: a reader following the law can omit three supported resolved settings when assessing configuration, wiring, or test coverage; the document's own “one home” claim is therefore misleading.
- What remains unverified: field-by-field runtime transport and admin UI behavior are outside this documentation lane.
- Suggested next check or fix: update the count/list or remove the volatile enumeration and point only to the named interface.

### DOCS-CORE-SPINES-02 — Provider “current” layout retains nonexistent backend and override paths

- Severity: P3
- Class: law-drift
- Confidence: high — the document itself acknowledges the purge, and both structural/literal checks find no live source occurrence.
- Evidence rung: R2
- Scope denominator: the provider layout and ownership inventory in `Tier-3b-Providers.md`.
- Receipts: the build-state rider says `anth-direct` and `scripted-override.ts` are absent (`docs/architecture/core/Tier-3b-Providers.md:9`), but the current “owns” list and layout still list them (`:23`, `:28`, `:47-56`); the real key tuple has five members and no `anth-direct` (`packages/server/src/infra/providers/contract/backend.ts:43-50`); `pnpm ast ident RUNNER_OVERRIDE` and `pnpm ast ident anth` returned no source results, with `rg` cross-check over 98 tracked provider TS files and direct absent-path checks recorded in `commands.md`.
- Established fact: the document asks readers to treat these lines as a design record while placing them inside current ownership/layout sections; the reported filesystem and tuple disagree with those sections.
- User or system impact: cold readers can navigate to nonexistent paths or infer an extra backend from the live layout. The rider reduces the risk but does not make the current-layout statement internally consistent.
- What remains unverified: the parked D67/D68 design record, intentionally out of this lane.
- Suggested next check or fix: move the purged material to a distinct historical/design note and keep the active ownership/layout inventory physical-tree-accurate.

## Proven strengths

- Markdown formatting is currently enforced for the repo's documentation corpus (`pnpm check:docs`; R5 for format compliance only).

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| Auth-mode dispatcher completeness | R3 | Declared and live-indexed; behavioral fail-closed paths not exercised in this lane. |
| Provider role axis | R3 | Eight-member tuple is declared and re-exported; detailed role behavior is outside scope. |
| Effective config field inventory | R3 | Live interface is consumed, but the law's 22-field inventory is stale. |
| Provider physical layout | R2 | Current tuple/paths contradict the active inventory's retained historical entries. |

## Tests and gates

`pnpm check:docs` passed, proving format compliance only. The core docs cite named gates and some have corresponding gate files; the lane confirmed `test-layout`, `test-presence`, `test-mock-doctrine`, `sole-env-reader`, `no-inline-types`, and `no-inline-union-redecl` source registrations by literal configuration-name checks. This does not establish their positive controls or all claimed behavioral guarantees; no production test/gate suite was run because this documentation-only lane did not change source and whole-tree verification belongs to the coordinator.

## Cross-lane edges

- The settings/domain lane should verify runtime handling and tests for `structuredOutputShape`, `structuredOutputVehicle`, and `promptCacheMinDepth`; this lane proves only the law/interface drift.
- The providers lane should decide whether the obsolete `anth-direct` and `scripted-override` descriptions belong in active law or a historical/parked design record.

## Tool receipts

See `commands.md`: bare `pnpm ast`, five targeted AST lenses, literal negative cross-checks, and `pnpm check:docs` all completed. No audit-tool failure occurred; one discarded receipt-parser warning is logged there.

## Lane verdict

The ten core spine/tier documents are fully receipted against the assignment snapshot and their markdown formatting currently passes. Their primary architectural directions and named enforcement seams have concrete source evidence. Two active-law inventories are stale: the config spine undercounts live resolved fields, and the provider tier embeds purged paths in its current layout despite an explanatory rider. No behavioral claim beyond the targeted R3 wiring evidence was treated as proved.
