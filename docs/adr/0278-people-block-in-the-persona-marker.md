---
kind: adr
status: active
updated: 2026-09-30
---

# The people block renders every present human in the persona marker

## Context

D122 rules that every present human's persona enters the shared prompt, with no toggle. [ADR 0250](0250-anchor-human-binds-preset-user.md) binds prompt-config `{{user}}` to the anchor human's seat persona. The other present humans need a home in the prompt that does not change with who presses send.

## Decision

- The `persona` marker renders the people block. The voice persona comes first and unheaded. Each other present human whose seat holds a persona follows in seat join order, under a heading.
- Position alone marks the human `{{user}}` names. The voice entry takes no heading.
- The heading is the preset-homed prose slot `chat.group.personaHeading`, default `[Person — {{name}}]`, with `{{name}}` pre-substituted.
- A persona at `at_depth` or `none`, or with a blank description, keeps a heading-only entry. A seat with no persona gets no entry.
- The block and the persona-book pool follow the present, enabled membership, never the online set.
- Each people entry and each persona-book entry resolves `{{user}}` against its own persona.
- A persona-less voice human takes `DEFAULT_PERSONA_NAME` as `speakers.user`, the same floor as the row labels.
- No macro lists the people.

The mechanism and its homes are in [Chat-Macro-Resolution §4c](../law/Chat-Macro-Resolution.md).

## Consequences

- A solo room renders only the voice part, so its bytes do not depend on the block.
- The block changes only on a join, a leave, a persona swap, a description edit or an anchor re-pick. Each is one prompt-cache miss.
- Preset `{{user}}` stays one human, so the default main prompt addresses one person.
- A preset with no active `persona` marker carries no other humans. That is the host's prompt authoring, not a member toggle.

## Alternatives rejected

- A separate `people` marker beside `persona`: existing presets and SillyTavern imports lack it, so the other humans never enter until a host edits the preset.
- One `in_static` injection per person: it ignores the marker position and files the bytes as injections.
- Preset `{{user}}` as the joined present names: singular preset text and `speakers.user` each name one human.
- The online set as the membership: every reconnect rewrites the static half.
- Name order, or the anchor last: a rename moves entries and equal names collide.
- The heading `[Also present — {{name}}]`: a person is not a bystander.
- The whole block at the anchor persona's placement: each owner chooses the placement of their own description.
- A heading on the voice entry too: it changes the solo bytes.
- No entry for a heading-only person: the model cannot map a row label to a person.
- A heading-only `Traveler` entry for a persona-less seat: it has no description to consent to, and two such humans collide.
- A `{{people}}` macro: no template references it.
- The people in card context: card context stays the frozen anchor ([ADR 0153](0153-the-persona-pin-active-resolution-semantics-are-owner.md)).
- The block from `loadChatIdentityProducer`: that producer includes departed personas and skips the consent gate.
- Persona books gated on the online set: an offline member loses their lore on each reconnect.
- The `"User"` floor on `speakers.user`: the row labels floor to `DEFAULT_PERSONA_NAME`, so one prompt names one human two ways.
