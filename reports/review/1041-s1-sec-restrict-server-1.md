# 1041 shard s1-sec-restrict-server-1

Four security gates moved to native ESLint rows in `eslint.config.js` (`SERVER_SCOPE_RESTRICTIONS`) plus a hand rule for the injected-op check. Each claim has a production-root behavioural test and a native-lint test. Every planted violation failed both before the gate was deleted, and both land in the same commit.

Durable tests:

- `tests/tooling/verify/ops/server-scope-native.test.ts` ports every gate descriptor row through the effective flat config.
- `tests/server/domain/chat/verbs/member-card-clamp.int.test.ts` drives D22 through the real tRPC door.
- `tests/server/domain/chat/verbs/member-fan.int.test.ts` drives the chat member fan through the real live user bus.
- `tests/server/domain/tag/verbs/injected-op-scope.int.test.ts` drives the composed card-tag detach op.

Red first: before the rows existed, the native test failed 5/5 (every count 0, `orb/injected-op-caller-param` settings undefined). With the rows it passes 5/5.

## member-card-clamped

- Successor: `orb/member-card-clamped` covers a `MemberCardView` interface or alias anywhere in `AUTHORED_SRC` except `packages/contracts/**` and `tests/legacy/**`. `orb/member-card-clamped-clamp` covers a `clampMemberCard`/`resolveCardVisibility` function, `declare function` or variable in server src, with the home `domain/chat/substrate/auth/**`. `orb/member-card-clamped-verb` covers any `getRosterCardView` identifier in server src.
- Behavioural plant: a local `resolveCardVisibility` returning `"full"` in `domain/chat/verbs/read.ts`. The member-card test failed because the member received `visibility: "full"` and the host-only `systemPrompt`. `pnpm exec eslint packages/server/src/domain/chat/verbs/read.ts` exited 1 with `168:7 orb/member-card-clamped-clamp`.
- Second plant: `packages/server/src/domain/character/__plant-member-card.ts`. The real door exited 1 with `1:18 orb/member-card-clamped` and `4:28 orb/member-card-clamped-verb`. Both plants are restored or deleted, and the sha256 matches the original.
- Parity: 3 mustFlag / 4 mustPass ported, 0 lost. The fourth mustPass row was the `@orb-waive` positional identity. It is ported as "the retired marker is inert", plus the native exception door (`eslint-disable-next-line ... -- reason` suppresses).
- Waivers and grants: 0 live markers. The only markers were fixture strings inside the deleted gate. There are no grants and no budget row.
- Live tree: a scratch pass of the five rules over all 1832 tracked server files found 0 findings. `rg` finds the only `MemberCardView` declaration at `packages/contracts/src/chat/roster.ts:480`.
- Lost claim: none. A `catch (clampMemberCard)` binding was a ts-morph `VariableDeclaration` and is not flagged natively. This case is not plausible.

## membership-fan-guard

- Successor: `orb/membership-fan-guard` flags any `emitUserEvent` identifier under `packages/server/src/domain/chat/**`.
- Behavioural plant: `domain/chat/verbs/emit-chat-changed.ts` fanned to one recipient through a local `emitUserEvent`. The member-fan test failed because the co-member received `[]`. `pnpm exec eslint packages/server/src/domain/chat/verbs/emit-chat-changed.ts` exited 1 with `30:11` and `33:7 orb/membership-fan-guard`. The file is restored and its sha256 matches.
- Parity: 2 mustFlag / 4 mustPass ported, 0 lost. The waiver row is ported as an inert retired marker.
- Waivers and grants: 0 live markers. The fixture markers in `singleton-ordinary-policies.suite.test.ts` were removed with their arms. There are no grants and no budget row.
- Lost claim: none.

## injected-op-caller-param

- Successor: the `orb/injected-op-caller-param` hand rule over `packages/server/src/domain/*/contract/**`. It flags a Promise-returning function type alias whose parameter subtree names a `TypeIdOf` entity id and no scope name, unless `CALLER_FREE_OPS` names the alias. `requireEntityIdTypeNames` (`tooling/src/floor/code-facts/id-brand.ts`) derives the vocabulary from `packages/kit/src/ids/index.ts` and passes it through block settings, so a vocabulary change invalidates the ESLint cache.
- Behavioural plant: `DetachCardTagOp` lost `ownerId` (`character/contract/service.ts:61`) and `findTagIdByName` lost its owner predicate. The op-scope test failed because the foreign detach returned `true` and removed the owner's link. `pnpm exec eslint packages/server/src/domain/character/contract/service.ts` exited 1 with `61:13 orb/injected-op-caller-param`. Both files are restored and their sha256 matches.
- Parity: 3 mustFlag / 7 mustPass ported, 0 lost. The fixture-private ids modules became the real vocabulary, which is a superset for every row.
- Waivers and grants: 0 live markers, no grants, no budget row.
- Lost claim: in a scoped run whose only change is `packages/kit/src/ids/index.ts`, contract files are not re-linted. The old gate's entire-population execution re-read them. A full lint still catches the change, because the vocabulary is part of the cached config. Successor work is to add the ids home to the scoped native-metadata recheck in `tooling/src/verify/ops/eslint.ts`.

## injected-op-caller-param-health

- Successor: the blind arm is `requireEntityIdTypeNames`, which throws at config load on an empty vocabulary. The stale arm is the native test `every caller-free row ... names a live contract op`. It lints the real contract tree with the exemptions removed and reds any row the rule would not flag.
- Plant: a stale row `ListCharacterSpriteAssetsOp` added to `CALLER_FREE_OPS`. The native test failed with `expected [ 'ListCharacterSpriteAssetsOp' ] to deeply equal []`, and the reused-name mustFlag row went to 0. The plant is removed.
- Parity: 2 mustFlag / 2 mustPass. 1 mustPass is not applicable: the anchor-not-loaded self-guard has no native equivalent, because the ratchet only runs against the real tree. 0 lost.
- Live finding fixed: `ResolveAssetHashOp`, `LoadAssetBytes` and `LoadAssetMime` no longer exist in any domain contract. They moved to `packages/contracts/src/assets/index.ts:293,299`, or were removed. The health gate's own predicate therefore reds those 3 rows on the current tree. The rows are deleted as dead.
- Rejudged rows: `ReapAssetsOp` is kept (`assets/verbs/reap-if-orphan.ts` header). `LoadAssetBytesOp` is kept, because ingest reads `doc.sourceAssetId` (`databank/ingest/index.ts:138`). `LoadCardText` is kept with a corrected reason: `admin/verbs/card-embed.ts` passes a request id, but only after `getCard({ principal, characterId })`.

## Findings for human security review

1. Medium. The op scope check no longer reaches op types in `@orb/contracts`. `ResolveAssetHashOp` and `LoadAssetBytes` now live at `packages/contracts/src/assets/index.ts:293,299`, outside the old and new scope. Scenario: a caller-free `(characterId: CharacterId) => Promise<Card>` declared there and wired at compose passes lint. Minimal fix: widen the rule scope to the contracts op homes and re-add reasoned rows.
2. Low. `attachCardTagByName` (wired as `AttachCardTagOp`) applies `ownerId` to the tag only. `attachCharacterTag` takes any `characterId`, so a caller passing a foreign id attaches its own tag to the foreign card. Every current call site owner-verifies first. Minimal fix: add an owner predicate on `characters` in the junction insert.
3. Low. `LoadCardText` carries no owner scope. The admin path depends on the call-site `getCard` check. Minimal fix: thread `ownerId` into the op.

## Unrelated

- `orb/server-factory-tier-reference` already reports `read.ts:65,66` and `character/contract/service.ts:15` on the unmodified files.
- `simple-visitors-wave-2.suite.test.ts` times out on `test-determinism` proofs (16.4 s against a 9.6 s budget) when it runs alone. The test that times out runs only that untouched policy.
