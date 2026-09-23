---
kind: adr
status: active
updated: 2026-09-23
---

# The anchor human's persona binds prompt-config {{user}}

## Context

In a multi-human room, prompt-config {{user}} bound to the triggering human's persona, so the system block changed with each sender and the prompt cache missed on every turn from a different human.

## Decision

Amends D122's anchor binding. A canon turn binds prompt-config {{user}} to the anchor human's current seat persona. The anchor human owns chats.anchorPersonaId when it resolves under the consent gate, else the frozen host. An empty seat falls back to the anchor persona that human owns. Only an impersonate draft (TurnVoice trigger) binds the triggering human's persona; activePersonaIdFor is the unit home of that case and voicePersonaFor is the voice binding. The pinned persona is unchanged: card {{user}} = anchor ?? active. Row labels come from each row's author. The system block changes only on join, leave, persona swap or an anchor re-pick, never with who presses send.

## Consequences

Solo chats are byte-identical. A mid-chat persona swap still reaches preset {{user}} while the card keeps the anchor. Every present human's persona entering the prompt is D122's standing rule, built by docs/plans/multi-human-personas.

## Alternatives rejected

Sender binding (the old rule): the system block flips per sender. All present humans' names joined into {{user}}: reads wrongly in singular preset text and in impersonate.
