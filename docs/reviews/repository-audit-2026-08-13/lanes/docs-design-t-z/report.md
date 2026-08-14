## Lane identity

- Lane: `docs-design-t-z`
- Semantic scope: Current design records T–Z: templating fork, tracked-field unification, tsx shedding, user-macro delivery, and v3 demo-transcript decision brief.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00` (assignment); source checks at working-tree `HEAD` `dab3c8440f23ee23883897e446fe80e3838c9b29`.
- Working-tree basis: owned documents clean against `HEAD`; assignment hashes still match at close.
- Assigned files read: `5 / 5` (100%).
- Assigned lines read: `1012 / 1012` (100%).
- Assigned bytes read: `72201 / 72201` (100%).
- Dirty assigned paths: `0`.
- Exclusions: production source/tests are owned by their semantic lanes; only source/tests needed to check an assigned document's concrete current claim were read. No historical/proposed corpus conclusion is generalized from this lane.

## Read receipt

`read-receipt.tsv` covers all five paths in `assignment.txt` and exactly matches its line, byte, and SHA-256 values. No assigned path changed during the lane.

## Architecture observed

The five records describe independent design surfaces. The templating fork's current architecture resolves selected prose slots in `@orb/contracts/prose` and composes at the chat and character server seams (`packages/contracts/src/prose/index.ts:166`, `packages/server/src/domain/chat/assembly/context.ts:497`, `packages/server/src/domain/character/substrate/greeting-studio.ts:53`; R3). Tracked fields now have the single `RpgGameConfig.trackers[]` contracts home (`packages/contracts/src/rpg/tracker.ts:54-82`) and a Game-tab definition editor (`packages/client/src/features/rpg/components/rpg-game-tab.tsx:172-220`; R3). User-macro delivery uses a server-only per-turn registry and serializable draw record rather than putting closures on `AssembleContext` (`packages/server/src/domain/chat/assembly/user-macros.ts:1-16`, `packages/contracts/src/chat/messages.ts:90-98`; R3). The v3 demo pack remains a seed/migration mechanism; migration only heals dressing and deliberately does not rewrite transcript bytes (`packages/server/src/domain/chat/seeder/seed.ts:191-257`; R3).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Templating fork ARM B (`templating-fork-rows-53-73.md`, 126 lines) | 3 | 3 | 4 | 2 | 2 | high | `packages/contracts/src/prose/index.ts:166`; `packages/server/src/domain/chat/assembly/context.ts:497-502`; `packages/server/src/domain/character/substrate/greeting-studio.ts:53-58`; `pnpm ast refs resolveSteerFragments` (4908 scanned) |
| Tracked-field unification (`tracked-field-unification.md`, 217 lines) | 4 | 3 | 4 | 3 | 2 | high | `packages/contracts/src/rpg/tracker.ts:54-82`; `packages/client/src/features/rpg/components/rpg-game-tab.tsx:172-220`; `tests/contracts/rpg/tracker.contract.test.ts:50-63`; `pnpm ast refs RpgTrackerDef` (4908 scanned) |
| Native-node/tsx shedding (`tsx-shedding-migration-spec.md`, 110 lines) | 3 | 3 | 2 | 3 | 3 | medium | `package.json:35`; `scripts/dev/dev.sh:44-61`; `tsconfig.base.json:51-58`; `biome.json:64-75` |
| User-macro delivery (`user-macro-delivery-spec.md`, 513 lines) | 4 | 3 | 4 | 3 | 2 | high | `packages/server/src/domain/chat/assembly/user-macros.ts:51-99`; `packages/server/src/domain/chat/verbs/turn.ts:390-416`; `packages/server/src/domain/chat/persistence/queries.ts:769-784`; `tests/server/domain/chat/verbs/turn.int.test.ts:2644`; `pnpm ast refs buildTurnUserMacros` (4908 scanned) |
| V3 demo-transcript decision brief (`v3-demo-transcripts-heal.md`, 46 lines) | 0 | 0 | 0 | 0 | 0 | medium | It is explicitly a fork, not a claimed shipped surface; current seed behavior agrees with the stated no-transcript-rewrite mechanism at `packages/server/src/domain/chat/seeder/seed.ts:241-257` (R3). |

Scores are limited to observed/current source and test evidence. No score claims live-runtime or freshly executed behavioral proof.

## Findings

### DOCS-DESIGN-T-Z-01 — Tracked-field record simultaneously says shipped and unbuilt

- Severity: P3
- Class: law-drift
- Confidence: high — full document read establishes the internal contradiction; current contracts/client source establishes the feature is no longer merely a proposal.
- Evidence rung: R4
- Scope denominator: `1 / 217`-line tracked-field design document; current source/test cross-check spans the tracker contract and client definition surface.
- Receipts: `docs/design/tracked-field-unification.md:3-12`; `packages/contracts/src/rpg/tracker.ts:54-82`; `packages/client/src/features/rpg/components/rpg-game-tab.tsx:172-220`; `tests/contracts/rpg/tracker.contract.test.ts:50-63`; `pnpm ast refs RpgTrackerDef --max 120` (101 hits, 28 files; 4908 scanned, 0 skipped).
- Established fact: The leading status block says stages 1+2 are shipped at lines 3-7, but the immediately following status says “Nothing built” at line 12. Current source has the unified tracker schema and one Game-tab definition editor, while current contract tests reject invalid tracker axes.
- User or system impact: A cold builder can reasonably choose either status and plan duplicate work or misclassify a current implementation as a proposal.
- What remains unverified: Whether every named board remainder (W-H and EXT-4) is still open; it was not this lane's owned workboard scope.
- Suggested next check or fix: Replace the older pre-build status block with a clearly labelled historical snapshot, or delete it and retain one current status line plus the specific remaining board links.

### DOCS-DESIGN-T-Z-02 — User-macro delivery spec retains an obsolete W5/ruling storage plan

- Severity: P2
- Class: law-drift
- Confidence: high — the contradictory storage names and wire are direct current-source facts; existing integration and CT test locations make the mismatch more than a naming-only drift.
- Evidence rung: R4
- Scope denominator: `1 / 513`-line user-macro delivery design document; current cross-check covers contracts, db/schema, server verb/router, client mutation, and current test locations.
- Receipts: `docs/design/user-macro-delivery-spec.md:487-488,508-513`; `packages/db/src/schema/chat.ts:152-156`; `packages/server/src/domain/chat/verbs/turn.ts:390-416`; `packages/server/src/domain/chat/persistence/queries.ts:1058`; `packages/server/src/transport/trpc/routers/chat.ts:567-569`; `tests/server/domain/chat/verbs/turn.int.test.ts:2644`; `tests/client/features/chat/components/macro-picks-section.ct.tsx:128-178`; `pnpm ast refs buildTurnUserMacros --max 120` (28 hits, 8 files; 4908 scanned, 0 skipped).
- Established fact: The spec says W5 is parked and defaults to `values: {}` (`:487-488`), then rules that values reuse `chats.variableValues` through `setVariables` (`:508-513`). Current code instead persists and reads a separate per-chat `chats.user_macro_values` via `setUserMacroValues`/`loadStoredUserMacroValues`, and turns pass loaded values into the registry (`packages/server/src/domain/chat/verbs/turn.ts:390-416`).
- User or system impact: This is a substantive stale blueprint: a reader following it would modify the wrong persistence and API surfaces, potentially collapsing separate ChoiceBlock and user-macro state.
- What remains unverified: The later owner decision that selected the separate column was not located in the assigned record; this finding does not judge that implementation choice, only the unreconciled design record.
- Suggested next check or fix: Add a dated landed-status addendum stating the actual separate-column design, mark W5 complete, and demote the original Arm-A storage discussion to historical rationale or update it to the decision that superseded it.

## Proven strengths

- The templating ARM-B claim is currently wired through both documented server seams: `resolveSteerFragments` has its contracts declaration and exactly the chat/character server consumers claimed by the design (`packages/contracts/src/prose/index.ts:166`; `packages/server/src/domain/chat/assembly/context.ts:497-502`; `packages/server/src/domain/character/substrate/greeting-studio.ts:53-58`; R3). The document also names existing integration/CT proof locations (`docs/design/templating-fork-rows-53-73.md:14`; R4 as test-source evidence).
- The v3 decision brief accurately captures the current transcript-preservation mechanism: `migratePack` only invokes `healOne`, whose operations fill dressing, while its code comment explicitly keeps transcripts unchanged (`packages/server/src/domain/chat/seeder/seed.ts:191-257`; R3). Seeder tests import and assert the current pack version (`tests/server/domain/chat/seeder/seed.test.ts:168-216`; R4).

## Declared versus completed

| Declared surface | Strongest current evidence | Classification |
| - | - | - |
| Templating ARM B is built | R3 source declaration plus two server consumers; R4 test locations declared in the document | Current implementation claim is supported in audited seams. |
| Tracked-field stages are shipped | R3 unified tracker schema + Game-tab editor; R4 contract test source | Feature is implemented in the checked surfaces, but the record's adjacent “Nothing built” status is stale. |
| Native-node start/dev and import-extension enforcement landed | R3 root start/dev configuration and current Biome/nodenext configuration | Supported as configuration/source claim; no fresh boot or positive-control receipt in this lane. |
| User-macro W1–W5 delivery | R3 registry/turn/persistence/API path; R4 integration and CT test source | Built path uses a separate `user_macro_values` store, contrary to the spec's remaining W5/ruling text. |
| V3 transcript content heal is a pending decision | R3 migration code still does not alter transcripts | Remains a decision record, not a false shipped claim. |

## Tests and gates

The owned design corpus names meaningful integration/contract/CT tests for its three implemented surfaces. Current structural queries confirm the user-macro registry has direct test consumers and the tracker definition appears in contracts/server/client tests (`commands.md`). These test sources are R4 evidence; no tests were executed, so there is no R5 claim. `pnpm check:docs` passed (`commands.md`) and proves formatting only, not design-claim accuracy. The native-node document's configured Biome `useImportExtensions` and nodenext compiler rules are present (`biome.json:64-75`, `tsconfig.base.json:51-58`), but no current positive-control receipt was run.

## Cross-lane edges

- `docs-current`: reconcile the remaining W-H/EXT-4 workboard status named by `docs/design/tracked-field-unification.md:6` before claiming the tracked-field program fully complete.
- `server-chat-verbs`, `server-chat-core`, `client-chat-components`, `lower-db`, and `lower-contracts`: the actual user-macro delivery uses a separate `user_macro_values` store, not the historical `variableValues` reuse described in the design doc. Treat this as document drift unless source-lane evidence finds a behavioral bug.
- `docs-core-law` / active workboard owner: identify and cite the decision that superseded `docs/design/user-macro-delivery-spec.md:508-513`, then update the design record.

## Tool receipts

`pnpm ast` was run bare before structural queries. Completed queries and exact scan coverage are in `commands.md`; refs searches covered 4,908 workspace files (`ts:3867`, `tsx:1038`, `mts:1`, `dts:2`) with zero skips, while `callers migratePack` covered its 4,798-file harness corpus with zero skips. Literal checks were limited to exact configuration/storage strings, with a recorded rerun excluding vendored `scripts/probes/st-goldens/**`. `pnpm check:docs` passed. One accidentally broad literal scan and one sample-only piped display were excluded from findings.

## Lane verdict

All five owned documents were fully read and their assigned snapshot hashes remain current. The templating, tracker, native-node, and user-macro records correspond to substantial current code, while the v3 document remains an honest decision brief. Two documents have material stale status/ruling text: tracked-field internally says both shipped and unbuilt; user-macro delivery describes a parked/reused-store W5 that current code replaced with a distinct per-chat store and API. No behavior defect is established here. The biggest remaining uncertainty is the authoritative post-design decision record needed to reconcile the user-macro storage divergence.
