---
kind: adr
status: active
updated: 2026-09-23
---

# The cast read axis is renamed to the chat identity axis

## Context

Split off [ADR 0137](0137-a-chat-s-referenced-identities-are-served-by.md), whose rename guard pushed it over the 8 KiB ADR cap. Both the read/display axis and the D60 drive axis were spelled `cast`, and they are near-antonyms on the persona plane: the read axis includes personas, the drive axis excludes them by construction.

## Decision

**THE TWO AXES THAT SHARED THE WORD `cast` NOW HAVE DIFFERENT NAMES.** This clause was minted as a GUARD, and it had to be, because both axes were spelled `cast` and they are near-antonyms on the persona plane: the READ axis INCLUDES personas, the DRIVE axis EXCLUDES them by construction. Nothing but this sentence and a file-header paragraph stood between a cold agent and reading one as the other — a prose-only boundary, which §2.3 calls a wish rather than a placement. spent the rename, so the same rule is now enforced one step up the ladder (§2.2 — compile-time, not lint-time and not prose):

- the READ / DISPLAY axis is `ChatIdentity` · `identityKey` · `ChatDetail.identities` · `MessagesPage.identities`, produced by `loadChatIdentityProducer` (`domain/chat/persistence/identity.ts`);

- the D60 DRIVE axis is `AssembleContext.characters` · `speakerRefs` · `characterIds` · `unmutedCharacters` (`domain/chat/assembly/context.ts`).

**The RULE is unchanged and still binding:** `SpeakerRef` is never reused for a chat identity, and a persona is a chat identity but never a speaker. What changed is only its ENFORCER — assigning one axis to the other is now a `tsc` error, so the guard no longer depends on anyone reading a comment. The old spellings are recorded here (not deleted) so pre- code, a `git log -S` pass, and the design doc stay resolvable — struck, because every left-hand name is GONE from the workspace and a live backtick would be a phantom cite: ~~CastEntry~~ → `ChatIdentity` · ~~castKey~~ (the chat one) → `identityKey` · ~~CAST_KINDS~~ / ~~CastKind~~ / ~~CAST_KIND_POLICY~~ → the `CHAT_IDENTITY_*` family · ~~buildCastNameContext~~ / ~~buildCastAvatarMaps~~ → `buildIdentityNameContext` / `buildIdentityAvatarMaps` · ~~loadChatCastProducer~~ → `loadChatIdentityProducer` (file ~~persistence/cast.ts~~ → `persistence/identity.ts`) · ~~ChatDetail.cast~~ / ~~MessagesPage.cast~~ → `.identities` · ~~AssembleContext.cast~~ / ~~castMembers~~ / ~~castCharacterIds~~ / ~~castNotMuted~~ → `characters` / `speakerRefs` / `characterIds` / `unmutedCharacters` · ~~ChatRoster~~ → `ChatMembership` · ~~CarriedAppearanceCast~~ → `CarriedAppearance` · ~~cast-only~~ → the `identity-only` avatar-precedence verdict.

Reading B (persona-as-character, any flavor) stays dead: it collides with D131(G) (personas are never copied) and with the per-table fork allow-lists (D133). **`cast` survives in this repo only where [`../law/vocabulary-map.md`](../law/vocabulary-map.md) still grants it** — rpg's scene-NPC ref (`RpgCastRef`/`castKey`/`cast:<slug>`), the seated-characters UI family, and the type-cast helper `castId` — so a `cast` inside `domain/chat/**` or `contracts/src/chat/**` is now a defect on sight rather than a name to disambiguate.

## Consequences

Assigning one axis to the other is now a `tsc` error. `cast` survives in this repo only where `docs/law/vocabulary-map.md` still grants it (rpg's scene-NPC ref, the seated-characters UI family, the type-cast helper `castId`); a `cast` inside `domain/chat/**` or `contracts/src/chat/**` is a defect on sight.

## Alternatives rejected

Leave the rename as a comment-only boundary (rejected: nothing but a sentence and a file-header paragraph stood between a cold agent and reading one axis as the other, which is a wish rather than a placement).
