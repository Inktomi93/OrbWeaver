---
kind: adr
status: active
updated: 2026-09-23
---

# a chat's referenced identities are served by ONE kind-discriminated identity producer, and the four-field card face has ONE contracts home

## Context

Not recorded in the ledger row.

## Decision

(The clause was minted saying "cast producer"; renamed the whole axis — see (F).) Homes: `@orb/contracts/chat/producers.ts` (`CHAT_IDENTITY_KINDS` + `ChatIdentity` + `CHAT_IDENTITY_KIND_POLICY` + `identityKey` + the two projections) · `domain/chat/persistence/identity.ts` (`loadChatIdentityProducer` over the active ∪ stamped coverage, the compile-forced per-kind source table) · `@orb/contracts/card-face` (`CARD_FACE_LIMITS` + `cardFaceFields` + `CardFace`/`ResolvedCardFace` — the face substrate, phase C). Pins: `tests/contracts/chat/producers.contract.test.ts` (axis↔policy totality, `identityKey` namespace, projection routing + names-only-by-type) · `tests/server/domain/chat/persistence/identity.int.test.ts` (coverage, portrait floor, member-not-owner gating) · `tests/contracts/card-face/index.contract.test.ts` (per-field reference equality + the behavior-identity accept/reject table) · phase gate: `tests/server/domain/chat/persona-resolution.suite.int.test.ts` byte-untouched and green.

**(A) THE CAST PRODUCER IS KIND-POLYMORPHIC (`character` | `persona`), the D129 shape transposed.** One closed kind tuple + one total policy record (`CHAT_IDENTITY_KIND_POLICY` — `macro`: which macro-subject family the kind's name backs; `avatar`: whether a live `ParticipantView` outranks the identity entry) + total `Record`/`assertNever` dispatches at every consumer. Per-kind projections keep the macro path names-only BY TYPE: `buildIdentityNameContext` outputs kit's avatar-free entry types (`RowCharacterName`/`RowPersonaName` — kit is FROZEN, it IS the names-only law's mechanism); `buildIdentityAvatarMaps` is the only chrome carrier. The wire envelope (ONE `identities` array on `ChatDetail`/`MessagesPage`, replacing `macroNames`/`personaAvatars`/`characterAvatars`) was never the law's mechanism — the three producer headers that said "kept separate files/types" are truth-repaired to this form.

**(B) CAST KIND IS STRUCTURAL — NEVER A STORED COLUMN.** The row's stamp columns (`characterId` vs `personaId`, later assistant+`authorUserId` for agent) ARE the kind declaration; a stored cast-kind would be a second spelling of the stamps (derive-don't-stamp). Contrast D129, where purpose was UN-derivable from SET-NULL-degradable attribution and so earned its column. Neither phase touches `0000_baseline.sql`.

**(C) THE `agent` CASE (D60) IS A ONE-CASE ADD whose decision sites are compile-forced:** the policy row, both projections' `assertNever` tails, the loader's `satisfies Record<ChatIdentityKind, …>` source table, `identityKey`'s `u:` case (its namespace deliberately extends `speakerKey`'s so the key spaces can never collide), and the client chrome branch. This graduates A.8's "build KIND-READY so the third kind is a one-case add" — and SUPERSEDES A.8's "land WITH agent-principal" rider (`FINAL-Persona-and-Immersive-Chat-Visuals.md`): the owner's Option-D-now direction that commissioned the design landed phase D independent of the agent wave, before it.

**(D) THE CHARACTER CASE CARRIES NO DESCRIPTION (fail-closed, owner-ruled fork 4).** A member-gated producer serving card description bytes would MINT a member-visible surface for card content that does not exist today (the member card surface is `ParticipantView` — no description; the prompt snapshot is host-gated, D133). D122 consented the PERSONA presentation surface (name + description + avatar hash rides with it); no ruling consents the card's. If a surface ever earns it, it is ONE additive field behind its own D-entry and security review.

**(E) THE FOUR-FIELD CARD FACE (`name`/`description`/`starred`/`avatarAssetId`) HAS ONE HOME — `@orb/contracts/card-face` — composed by persona + character (+ future agent views).** Landed independent of the agent wave, after phase D (owner-ruled fork 1). Scope is the measured overlap ONLY (owner-ruled fork 3): card content (personality/scenario/greetings/…) stays character-only — a "shared" home with one composer is a false generalization. Composers SPREAD the same zod field objects (`cardFaceFields` — REFERENCE equality is the single-home proof, pinned per field per composer); per-composer optionality/nullability wraps are write semantics, not drift (persona description NOT NULL because "" is a value to `{{persona}}`; character description nullable for card-spec fidelity). `CARD_FACE_LIMITS` replaces the per-domain limit constants at face uses only (character's non-face `TEXT_MAX` uses stay character-local; persona's `title` limit stays persona-local). `PersonaDetail` extends both face planes; `CharacterDetail` CONFORMS structurally (a zod-inferred card's mutable members cannot `extends` the readonly face identically — the assignability pin is the control); `CharacterSummary` is deliberately NOT a face carrier (the list row omits `description` by design).

**(F) THE WALLS ARE UNTOUCHED AND RE-AFFIRMED — AND THE ONE THAT WAS PROSE IS NOW COMPILER-HELD (the ruling survives, its INPUT changed).** Tables, ownership, copy rules and pin semantics stay separate: personas are NEVER copied across a room boundary (D131(G) — the pointer heals instead), the fork allow-lists stay per-table (D133/D134), and the pin layer is D122's (`resolvePersonasForParticipants` answers "who is `{{user}}` NOW"; the identity producer answers "what is id X called" — two layers, two questions).

**THE TWO AXES THAT SHARED THE WORD `cast` NOW HAVE DIFFERENT NAMES.** This clause was minted as a GUARD, and it had to be, because both axes were spelled `cast` and they are near-antonyms on the persona plane: the READ axis INCLUDES personas, the DRIVE axis EXCLUDES them by construction. Nothing but this sentence and a file-header paragraph stood between a cold agent and reading one as the other — a prose-only boundary, which §2.3 calls a wish rather than a placement. spent the rename, so the same rule is now enforced one step up the ladder (§2.2 — compile-time, not lint-time and not prose):

- the READ / DISPLAY axis is `ChatIdentity` · `identityKey` · `ChatDetail.identities` · `MessagesPage.identities`, produced by `loadChatIdentityProducer` (`domain/chat/persistence/identity.ts`);
- the D60 DRIVE axis is `AssembleContext.characters` · `speakerRefs` · `characterIds` · `unmutedCharacters` (`domain/chat/assembly/context.ts`).

**The RULE is unchanged and still binding:** `SpeakerRef` is never reused for a chat identity, and a persona is a chat identity but never a speaker. What changed is only its ENFORCER — assigning one axis to the other is now a `tsc` error, so the guard no longer depends on anyone reading a comment. The old spellings are recorded here (not deleted) so pre- code, a `git log -S` pass, and the design doc stay resolvable — struck, because every left-hand name is GONE from the workspace and a live backtick would be a phantom cite: ~~CastEntry~~ → `ChatIdentity` · ~~castKey~~ (the chat one) → `identityKey` · ~~CAST_KINDS~~ / ~~CastKind~~ / ~~CAST_KIND_POLICY~~ → the `CHAT_IDENTITY_*` family · ~~buildCastNameContext~~ / ~~buildCastAvatarMaps~~ → `buildIdentityNameContext` / `buildIdentityAvatarMaps` · ~~loadChatCastProducer~~ → `loadChatIdentityProducer` (file ~~persistence/cast.ts~~ → `persistence/identity.ts`) · ~~ChatDetail.cast~~ / ~~MessagesPage.cast~~ → `.identities` · ~~AssembleContext.cast~~ / ~~castMembers~~ / ~~castCharacterIds~~ / ~~castNotMuted~~ → `characters` / `speakerRefs` / `characterIds` / `unmutedCharacters` · ~~ChatRoster~~ → `ChatMembership` · ~~CarriedAppearanceCast~~ → `CarriedAppearance` · ~~cast-only~~ → the `identity-only` avatar-precedence verdict.

Reading B (persona-as-character, any flavor) stays dead; the collision chain is recorded in the design §5.1. **`cast` survives in this repo only where [`../design/vocabulary-map.md`](../design/vocabulary-map.md) still grants it** — rpg's scene-NPC ref (`RpgCastRef`/`castKey`/`cast:<slug>`), the seated-characters UI family, and the type-cast helper `castId` — so a `cast` inside `domain/chat/**` or `contracts/src/chat/**` is now a defect on sight rather than a name to disambiguate.

Design: [persona-character-kind-substrate.md](../history/design/persona-character-kind-substrate.md).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
