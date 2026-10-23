---
kind: adr
status: active
updated: 2026-10-11
supersedes: docs/adr/0314-persona-pointers-have-one-writer-and-the-pin-holds.md
---

# Persona pointers have one writer each, the default decides new chats, and the pin holds through its chat

## Context

The default persona never decided anything because the last-played pointer outranked it, a switch could write a pointer the user did not mean through an Everywhere or This chat picker, the pin and the default shared one glyph, and a pinned player leaving made the card silently re-resolve to the host. Item 885 records the owner's rulings.

## Decision

Four pointers, one glyph and one writer each. The seat (chat_participants.activePersonaId, ✓) is written by a switch. Last played (seeds.currentPersonaId, no glyph) is written by the same switch. The default (seeds.defaultPersonaId, 👑) is written only by the crown. The persona pin (chats.anchorPersonaId, 📌) is written only by the host's pin or re-pin. No verb writes another's pointer. The Everywhere and This chat picker is removed; this supersedes the earlier Everywhere ruling.

A new chat seats and pins: an explicit persona (ownership-checked), then the persona connected to its one character when exactly one is connected, then the default, then last played, then none. Two or more connected personas fall through to the default. A join seats: the default, then last played, then none. The client tells the reader when something other than the default decided, derived from its own seed pointers; the two-connected fall-through raises no notice.

The pin holds. While chats.anchorPersonaId names a persona whose owner left the room or is disabled, the room still reads that persona live, whoever owns it: resolvePersonasForParticipants takes the room's chatId and reads the pin through chats.anchorPersonaId, so the read inherits its scope from the chat and no caller can name a persona to pass the consent gate. The voice binding stays consent-gated, so preset {{user}} binds the frozen host's seat (ADR 0250). This amends ADR 0122's gate sentence for that one id. ChatDetail.anchorState says live, held or none, never why a pin is held, and the pin is an identity source so a held pin keeps its name. A held pin clears only when the host re-pins or clears it, or the owner deletes the persona (FK set null). A host handoff never touches the pin, and a fork carries it.

Persona deletes heal. A deleted default moves to the last-played persona, else the newest remaining, and the result names it so the client says so. A seat that held the deleted persona is re-seated with its owner's default, else last played.

Card and preset {{user}} resolution from the two columns is unchanged (ADR 0250, ADR 0284), and the test code of the persona-resolution suite, a [restoration register](../plans/restoration-register/design.md) entry, stays untouched and green; its comments may change. Homes: start-chat.ts resolveFoundingAnchor, invites.ts resolveJoinerPersona, compose/chat.ts createTurnPersonaResolver, persona/persistence/queries.ts loadPinnedPersonaView, substrate/participants-humans.ts resolveAnchorState, persona/verbs/remove.ts.

## Consequences

A departed owner's later persona edits reach a room whose pin still names them, until the host re-pins. Deleting that persona clears the pin and the card follows the host's seat; the room block's line says so.

## Alternatives rejected

A snapshot of the departed persona frozen into a numbered migration: rejected, because ADR 0122 bans copying a persona and account disable has no chat-domain hook to freeze it. A modal asking which of two connected personas to play: rejected; falling through to the default is the better answer and needs no launch-path dialog. A stored acknowledgement for the held-pin prompt: rejected in favour of a persistent state line with Re-pin. Reading the held pin by a caller-supplied persona id: rejected, because it needed a tenancy waiver and let any caller name a persona past the consent gate.
