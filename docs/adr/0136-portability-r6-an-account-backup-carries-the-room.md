---
kind: adr
status: active
updated: 2026-09-23
---

# Portability R6: an account backup carries the ROOM WHOLE, the ST jsonl arm stays the SHARE door, and every cross-plane reference inside the bundle is POSITIONAL

## Context

Not recorded in the ledger row.

## Decision

Homes: `@orb/server/kit/serde/chat-bundle` (the serde, defined through the R3 spine) · `domain/export/verbs/export-chat-bundle.ts` + `domain/import/verbs/import-chat-bundle.ts` (the two projections) · `domain/rpg/contract/portability.ts` + `domain/rpg/persistence/portability-write.ts` (the campaign's injected read/write pair) · `domain/tag/verbs/attach-chat-tag-by-name.ts` (the D30 overlay re-link) · `entry/compose/portability.ts` (the descriptor) · `entry/http/export.ts` `?format=orb` + `entry/http/import-chat.ts` (the single-chat doors) · `tooling/src/verify/gates/lifecycle-portability.ts` (the registry). Pins: `tests/server/entry/import/bundle-round-trip.suite.int.test.ts` (the real fresh-box round trip) · `tests/server/kit/serde/chat-bundle/index.test.ts` (the mandatory round-trip identity) · the three verb mirrors.

**(A) ONE `chat` KIND, TWO FORMATS UNDER IT — never a second `PORTABLE_KINDS` member.** A parallel `chat-bundle` kind would put every transcript in every backup TWICE and hand the import router two answers for one chat. So the descriptor's `exportAll` emits the orb-native `.orb.json` and its `importFile` accepts BOTH: an ST `.jsonl` routes to the interchange verb, anything else to the bundle verb. `PORTABLE_IMPORT_ORDER` and the kind union are untouched by this wave. It is also what makes the ACCEPTED-LOSSY row closable at all (clause G): the loss only ends if the ACCOUNT BACKUP carries the fidelity, not a parallel kind nobody checks.

**(B) THE EXTENSION PICKS THE PARSER; THE ENVELOPE DECIDES.** `.json` is ambiguous — an orb chat bundle and a character `?format=json` card share it. The router's test is deliberately the jsonl NEGATIVE, and the R3 spine's `schemaKind` gate is what actually refuses a foreign file (`foreign-kind`, by name). Extension alone would misfeed a parser; envelope alone cannot see an ST transcript, which carries none by design.

**(C) NO IDS TRAVEL, SO CROSS-PLANE REFERENCES ARE POSITIONS.** A message is `messages[i]`, a variant is `{messageIndex, variantIdx}`, a checkpoint's snapshot is `snapshots[k]`. The import writes the canon FIRST and the chat write op returns `ImportedChatIdentity` (chatId + the index-aligned message/variant id arrays) — that remap is what re-anchors `rpg_snapshots` / `rpg_journal` / `rpg_turn_tool_calls`. **A silently mis-anchored snapshot is worse than a missing one, because it looks like history**, so a reference that does not resolve is DROPPED (or demoted to the plane's HAND arm), never written at a guess. The serde prunes at parse — the one place it reasons about the far side, and it earns it: every pruned case is a row the NOT-NULL/RESTRICT write boundary would refuse, taking the whole restore with it.

**(D) RE-LINK BY NAME, DEGRADE PER LINK.** Characters by HANDLE, the anchor persona + each turn's persona by `(ownerId, name)` (the persona domain's own dedup key), the tag overlay by name through tag's resolve-or-create. An unresolvable link costs that link, never the chat — the databank/gallery precedent.

**(E) WHAT DOES NOT TRAVEL, EACH AS A RULING.** `chats.runtimeVariables` is DERIVED (the per-variant `variableDelta` ops ride instead, so the cache re-folds — carrying it would ship a cache a restore immediately invalidates) · the pending-handoff pair, `chat_invites` and non-host human participants name USERS the target box does not have · `temporary` is a room its own TTL sweeper already decided to reap · `chat_events`/`chat_stream_events`/`pending_turns`/`chat_locks` are RUNTIME · `rpg_games.gmUserId`/`gmPresetId` are a cross-box seat and an unpreserved preset id whose NULL is a real state · fork lineage `parentChatId` needs a chat-level remap the delivery core (one `importFile` per file, no cross-file state) cannot express.

**(F) A CHARACTER MUST BE SELECTED — the owner ruling, built.** Owner 2026-08-07 (question-tool), verbatim: *"you shouldn't be able to import a transcript without having a character selected."* It OVERRODE the lifecycle review's O-6(c) recommendation to land a characterless chat. The bundle import therefore REFUSES when no carried handle (nor the directory fallback) resolves on this account, NAMES the handles it looked for so the operator knows which card to import first, and writes nothing — no placeholder card (that fabricates library canon from a transcript), no characterless room.

**(G) THE ACCEPTED-LOSSY ROW IS CLOSED; THE AUTOMATION ROWS WERE NEVER R6's.** `chat_tags` carried an `ACCEPTED-LOSSY` classification reading "Ends with the orb-native chat bundle (R6)" — this wave ended it, and `chatTags` moved into the `chat` kind's carried set. `automationRules`/`globalVariables` had DEFERRED rows pointing at R6 too; that was a MISFILING, truth-repaired here — automation rules are not chat-anchored and need their OWN portable family (serde + verbs + descriptor + import-order slot + doors), which R6 could not have delivered. Their rows now name that real end condition. **The general rule: a DEFERRED row must point at the condition that can actually END it — a row aimed at a wave whose scope cannot close it is a row that will be found still open, twice.**

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
