---
kind: adr
status: active
updated: 2026-11-14
---

# Stored story text reaches its slot as literal text

## Context

The memory, compaction-summary and game-state slots place stored room text inside the host's prompt, where the macro engine runs. The model writes that text over room messages, members' messages included, or an import, a fork or a host hand edit carries it. If a slot evaluated its value, a member could aim a macro at the host's variables by getting the model to repeat it in a summary. D352 decides by a document's owner, and summary text has no owner, so it does not cover these slots.

## Decision

Text held in a stored summary or game-state row reaches its macro-evaluated slot as literal text, always: whether the model wrote it, an import or a fork carried it, or the host edited it. A summary is a record of the story, not a template. A row that turned live on an edit would mix origins: a host who edits three words would bring the model's braces to life. The host keeps macro power in their preset and prompt order.

The constraint is one home. The kit handler `storyField` reads each slot's value and passes it through `neutralizeMacros`, never through the evaluator. The rule runs where stored text becomes the slot value, so rows stored before it are covered with no migration. Neutralized text stays inert if a later pass evaluates it again, for example as a user macro's argument. No stored mark for host edits exists, and none may be added to make a row live.

| Slot | Where stored text becomes the value | Who writes the stored text |
| - | - | - |
| `{{memory}}` | `formatMemory` in `packages/kit/src/recall/index.ts`, called by `packages/server/src/domain/chat/memory/recall/recall.ts` | the summarizer model over room messages |
| `{{compact_summary}}` and its section | `chats.compactSummary`, read by `packages/server/src/domain/chat/assembly/gather.ts` | the room's model through `packages/server/src/domain/chat/verbs/compaction.ts`; a chat bundle import; a fork copy |
| `{{rpgSceneState}}`, `{{rpgCast}}`, `{{rpgQuests}}`, `{{rpgDelta}}` and the other game macros | `buildRpgMacroFeed` in `packages/server/src/domain/rpg/chat-ops/macro-view.ts` | the state round (model), including the plot through the scene tool; host hand edits through `editSnapshot` and the quest verbs; a game import; the preset's cast-header prose and the game's labels |

`{{databank}}` stays under D352: the host's own documents keep their macros there.

A user macro resolves a bound argument again only when the engine did not: an argument the call delivered raw (the `?` flag), or a padded default from the macro's own definition. An argument the engine already resolved, such as a variable read, splices in as literal text. A value spliced into a template is also guarded at its edges, so a brace the template writes against the slot cannot pair with it.

Homes: `storyField` in `packages/kit/src/macro/registry.ts` · `neutralizeMacros` and `neutralizeSplice` in `packages/kit/src/macro/content.ts` · the argument delivery record (`ArgDelivery`) set by `packages/kit/src/macro/evaluator.ts` and read by the user-macro handler in `packages/kit/src/macro/user-macros.ts`. Cases: `tests/server/domain/chat/verbs/story-text-literal.int.test.ts` · `tests/kit/macro/story-slots-literal.test.ts` · `tests/kit/macro/user-macro-delivery.test.ts` · `tests/kit/macro/neutralize-brace-runs.test.ts`.

## Consequences

A name macro in story text is shown as typed. No summarizer, compaction or state-round prompt asks the model for one, and no write path stores one on purpose: the memory transcript resolves names before the summarizer reads it.

A host preset that passes `{{getvar::x}}`, or any value holding braces, into a user macro now splices that value as literal text instead of running its macros. A `{{?name::…}}` call still resolves its own argument once.

A fork copy of a summary needs no rule of its own: the read-side home covers it.

## Alternatives rejected

A mark for host-edited rows: it makes a mixed-origin row live. Neutralizing at write: it misses rows already stored and every import or fork copy. A non-evaluating handler that returns raw text: a later pass that evaluates its output would still find live braces. A names-only pass at the read: it keeps a write path for name macros that nothing needs.
