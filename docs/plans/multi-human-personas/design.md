---
kind: plan
status: active
updated: 2026-09-23
---

# Multi-human personas: every present human's persona enters the prompt

## Goal

In a room with more than one present human, every present human's persona (name and description) enters the shared prompt in one stable block. The block does not change with who presses send. It changes when a human joins or leaves, swaps persona, or the host re-picks the anchor. A room with one present human ships byte-identical bytes.

The design builds on the in-flight voice binding (branch `wt/agent-a9589d8114298df2b`): preset `{{user}}` is the anchor human's current seat persona, card `{{user}}` is the frozen anchor persona, and an impersonate draft binds the presser. Nothing here re-decides that binding. Two suites this plan cites, `persona-matrix.suite.int.test.ts` and `prompt-cache-prefix.suite.int.test.ts`, exist only on that branch under `tests/server/domain/chat/`; the build lands after it merges.

Law this plan applies: `docs/adr/0122-multi-human-persona-resolution-the-room-plane-read.md` (member persona descriptions enter the shared prompt unconditionally; the gate is the persona owner's present membership), `docs/adr/0153-the-persona-pin-active-resolution-semantics-are-owner.md` (pin and active resolution are owner-ruled; `tests/server/domain/chat/persona-resolution.suite.int.test.ts` stays byte-untouched), and `docs/law/Chat-Macro-Resolution.md` §3 and §4 (the three persona axes).

Vocabulary: the humans in a room are **People** (`docs/design/vocabulary-map.md`); `roster` is reserved for the saved template. This plan calls the rendered list the **people block**. The **voice persona** is `AssembleContext.activePersona`: the anchor human's seat persona on a canon turn, the presser's on an impersonate draft. The **voice human** is the human it belongs to (`activePersonaUserId`).

## Premises re-derived against the tree

| Brief premise | Tree | Verdict |
| - | - | - |
| `resolveForeignInputs` resolves only the anchor and the active persona | On `main`, `packages/server/src/entry/compose/chat.ts` reads `[anchorPersonaId, activePersonaId]`. In flight, `createTurnPersonaResolver` reads the anchor, the trigger's persona and every seat persona in one consent-gated read, then projects only `anchor`, `active` and `activeUserId`. | holds on `main`; in flight the read is already wide and only the projection is missing |
| `presentHumanUserIdsOf` is the consent set | `packages/server/src/domain/chat/substrate/participants-humans.ts`: the function is file-private. The exported surface is `presentAndEnabledHumanUserIdsOf` (present membership narrowed by the enabled account) and, in flight, `humanSeatPersonasOf` (each consented seat and its persona, in the seat list's join order). | holds |
| the persona description section, its placement and the anchor identity block live in `assembly/context.ts` | `activePersonaDepthCandidate`, `anchorPersonaCardCandidate` and `resolvePersonaDescriptionCandidates` in `packages/server/src/domain/chat/assembly/context.ts`. The marker itself renders in `packages/server/src/domain/chat/assembly/assemble.ts` (`case "persona"`), gated by `personaMarkerActive`. The marker is static (`isSectionDynamic` lists it nowhere), so it rides the cached half. | holds |
| persona-book lore already joins for member personas | `packages/server/src/domain/chat/assembly/world-info/pool.ts` joins `personaBooks` for `personaIds`. That list is the ONLINE humans' active personas (`onlinePersonaIdsOf`), not the present membership. Entries carry `source: "chat"`, so `{{user}}` inside them renders against `activePersona`. | holds, with an axis mismatch (Shape §6) |
| the in-flight branch changes the anchor identity block's role | With `active` bound to the anchor human's seat, `anchorPersonaCardCandidate` fires only when that seat holds a persona other than the frozen anchor persona: a swap by the anchor human, or a re-anchor onto a persona whose owner's seat holds another. | holds |
| SillyTavern has one human and a persona description position setting | `SillyTavern/public/scripts/personas.js` `persona_description_positions` (`IN_PROMPT`, `TOP_AN`, `BOTTOM_AN`, `AT_DEPTH`, `NONE`); `SillyTavern/public/script.js` `addPersonaDescriptionExtensionPrompt` routes the author's-note and depth cases; `SillyTavern/public/scripts/openai.js` pushes one `personaDescription` system prompt for `IN_PROMPT`. One `power_user.persona_description`; no second human anywhere. | holds |
| Marinara supports multiple humans | One active persona (`isActive` on the persona row). It does render OTHER personas: `Marinara-Engine/packages/server/src/services/prompt/macro-context.ts` `buildReferencedPersonaContext` wraps each referenced persona as a `referenced_persona` block (name, description, fields) inside a `referenced_personas` container, and resolves each block's macros against THAT persona (`referencedPersonaMacroContext`: `{{user}}` is that persona's name). | refuted as multi-human; the per-persona block with per-persona macro scope is the precedent this plan keeps |
| a human-list macro exists | Every file under `packages/kit/src/macro/` was searched. `group`, `charIfNotGroup`, `groupNotMuted` and `notchar` are character-only by owner ruling (`packages/server/src/domain/chat/assembly/macros.ts` `memberNames`). No macro lists humans or personas. | refuted: none exists |
| the harness in flight has no view of the other humans | the in-flight `persona-matrix.suite.int.test.ts` reads preset, card, description, anchor block, labels and tail. Its `alt` binding joins present persona names into preset `{{user}}`. | holds; the `alt` binding is an experiment this plan rejects (Rejected) |

## Shape

### 1. The people block

The `persona` marker renders the people block. Its render is:

1. the voice persona's part, rendered as today: the marker template (default `{{persona}}`) against `ctx.activePersona`, when that persona's placement is `in_prompt`;
2. then one entry per other present human whose seat holds a persona, in join order. An entry is a heading frame carrying the persona's name, then the description on its own line when that persona's placement is `in_prompt`.

Entries join with a blank line. With one present human the block is item 1 alone, which is today's bytes. Nothing keys on a room mode; the only guard is the length of the people list (D16: a solo room is a group of one).

Anchor mark: the voice human is marked by position. The unheaded first part is the person `{{user}}` names; every other person is headed. The default main prompt already says `roleplay with {{user}}`, so the model reads one addressee and a headed list of the others. Fork 1 asks whether the voice entry also takes a heading in a multi-human room.

Order: the voice human first, then the others in the seat list's join order (`loadParticipants` orders by `joinSeq`, then id). Join order is stable across sends, presence changes and persona edits. Name order would move entries when a persona is renamed and collide on equal names.

Heading frame: a preset-homed prose slot `chat.group.personaHeading`, a sibling of `chat.group.characterHeading` in `packages/contracts/src/chat/prose.ts`, with the `{{name}}` pre-substitution token. Proposed default text `[Person — {{name}}]`. Default prose is owner-ruled; fork 2.

Placement: the block sits where the preset's `persona` marker sits. A persona's own placement preference (`resolvePersonaDescriptionPlacement`, `packages/kit/src/persona/index.ts`) governs only the delivery of its own description:

| Placement | Voice persona (today's rule, kept) | Other person |
| - | - | - |
| `in_prompt` | description in the marker | heading, then description, in the block |
| `at_depth` | own `in_chat` injection; marker part silent | heading-only entry in the block; own `in_chat` injection (`origin: "persona"`, `originLabel` its name) |
| `none` | nothing | heading-only entry in the block |

A heading-only entry keeps the name in the prompt so the model can map the row labels (`Bob: …`) to a person. A preset with no active `persona` marker renders no block, as it renders no description today. That is the host's prompt authoring, not a member toggle, so the no-toggle rule of ADR 0122 holds.

Which humans: the present, enabled membership (`humanSeatPersonasOf` over the consent set), never the online set. Presence changes must not rewrite the static half; leaving the room (`leftSeq`) does.

Trace and budget: the marker's contributor label (`personaLabel` in `assembly/assemble.ts`, `personaContributorLabel` in `assembly/budget.ts`) will name every person the block carries, so the host preview stays honest about whose bytes sit in the section. An at-depth injection keeps its own `originLabel`.

### Data flow

| Step | Home | Change |
| - | - | - |
| resolve | `packages/server/src/entry/compose/chat.ts` `createTurnPersonaResolver` | project every consented seat persona except the voice human's: `people: readonly AssemblePersona[]` in seat order. The read already covers the ids. |
| contract | `packages/server/src/domain/chat/contract/foreign.ts` `ResolvedPersonas` | a `people` field; absent means a solo or hand-built input |
| context | `packages/contracts/src/chat/assemble.ts` `AssembleContext` | `people?: AssemblePersona[]`; `buildBaseContext` in `assembly/context.ts` sets it only when non-empty |
| render | `packages/server/src/domain/chat/assembly/assemble.ts` persona marker | the block render above; `markerStaticSources` includes the people descriptions so the volatile-macro scan sees them |
| at-depth | `packages/server/src/domain/chat/assembly/context.ts` `resolvePersonaDescriptionCandidates` | one depth candidate per `at_depth` person, `entryId` `persona-description:<seat index>` |
| keyword haystack | `packages/server/src/domain/chat/assembly/context.ts` `names` | add the people names, the SillyTavern `world_info_include_names` behaviour the anchor and voice names already get |
| preview | `packages/server/src/domain/chat/verbs/read.ts` `resolvePreviewInputs` | no change; it already passes `humanSeats`, so the preview shows the block the next turn sends |
| member card | `packages/server/src/domain/chat/verbs/read.ts` `resolveAnchorPersona` | no change; it reads `personas.anchor` only |

`AssemblePersona` stays id-free; the `people` list needs no ids because the render never joins it to anything.

### 2. Preset `{{user}}` with the block present

Preset `{{user}}` stays the anchor human's seat persona (the in-flight binding). The block adds the other names; it does not widen the macro.

No new macro in this program. No existing macro lists humans, and the `{{group}}` family is character-only by owner ruling, so nothing is reinvented and nothing is repurposed. A `{{people}}` macro (the present persona names in block order) is fork 4; it is unwired code until a template references it.

### 3. `{{persona}}` and card `{{user}}` in multi-human rooms

- Preset `{{persona}}` is the voice persona's description, the same axis as preset `{{user}}` (`Chat-Macro-Resolution.md` §3).
- Inside a people entry, `{{user}}`, `{{persona}}` and the name aliases resolve against that entry's own persona (`renderMacros(description, ctx, thatPersona)`), the no-cross-contamination rule `tests/server/domain/chat/assembly/context.int.test.ts` already pins for the anchor block.
- Card `{{user}}` and card `{{persona}}` are `pinnedPersona`, the frozen anchor. Untouched (ADR 0153).
- History rows resolve by their own stamp. Untouched.

### 4. Solo stays byte-identical

One present human means `people` is absent. The marker renders today's bytes, no depth candidate is added, no heading slot is resolved, and the haystack names are unchanged. Enforcers: `tests/server/domain/chat/persona-resolution.suite.int.test.ts` byte-untouched and green, `tests/server/domain/chat/solo-byte-identical.suite.int.test.ts`, and the solo golden in the in-flight `prompt-cache-prefix.suite.int.test.ts`.

### 5. Join, leave, swap, re-pick, and the cache

| Event | What changes | Cache |
| - | - | - |
| a human presses send | nothing above the tail | prefix kept |
| a human joins with a persona | their entry is added | static half changes once, then stable |
| a human leaves (`leftSeq`) | their entry is removed | changes once |
| the anchor persona's owner leaves | the anchor heals to `active` (the existing heal), so the card `{{user}}` and the first part follow the voice human | changes once |
| a member swaps persona | their entry changes | changes once |
| the anchor human swaps persona | `active` changes: the first part, preset `{{user}}` and `speakers.user`; the anchor identity block appears in card context, as today on a swap | changes once |
| the host re-picks the anchor | the new anchor human's seat persona becomes the voice: it moves to the unheaded first part and the old one takes a heading; card `{{user}}` moves | changes once |
| a persona owner edits the description | that entry changes, as today for the solo persona | changes once |
| a member goes offline or online | nothing in the block (persona books: §6) | prefix kept |
| an impersonate draft | the presser's persona is the first part for that call, the anchor human takes a heading; the in-flight design already gives an impersonate call its own system block | that call only |

Each change is one prefix miss and then a stable prefix, which is the owner's accepted cost.

### 6. Group modes and persona books

Merged, scoped and narrator rounds render the block once from the turn context, not per speaker. `cardOwnerCtx` rebinds only the speaker, never a persona field, and the scoped fold (`scopeHistoryToTarget` in `assembly/shape.ts`) touches history rows only. Under a narrator or merged round, `{{char}}` inside a description is the joined character names, as it is today for the voice persona.

Persona books have two gaps this plan names and schedules as a second leg:

- Axis: the pool's `personaIds` follows presence (`onlinePersonaIdsOf`), the block follows membership. An offline member keeps their entry and loses their lore. The presence gate on books is an owner ruling (`participants-humans.ts` header), so leg 1 leaves it.
- Scope: a persona-book entry carries `source: "chat"`, so `{{user}}` inside a member's own book renders against the voice persona. Bob's `{{user}} hates spiders` reads `Alice hates spiders`. Leg 2 tags a persona-book entry with its persona (`AssembleWorldEntry.source: "persona"` plus the persona projection) and renders it against that persona, the Marinara precedent. Fork 5.

### 7. No description and the Traveler default

- A persona with a blank description: heading-only entry when it is another person's; nothing when it is the voice persona's (today's rule).
- A human whose seat holds no persona: no entry. Their rows label `Traveler` (`DEFAULT_PERSONA_NAME`, `packages/kit/src/persona/index.ts`) through `userRowAuthorName` in `assembly/shape.ts`. Fork 7.
- Finding: `packages/server/src/domain/chat/engine/pipeline.ts` `userSpeakerName` floors `speakers.user` to the literal `"User"`, while `assembly/macros.ts`, `assembly/shape.ts` and the client floor to `DEFAULT_PERSONA_NAME`. A persona-less voice human labels their own rows `User` and everyone else's `Traveler` in one prompt. Fork 6 proposes the one spelling.
- Two persona-less humans both label `Traveler`. Out of scope; the first-run persona ask makes it rare, and a name-only fix would still collide.

## Rejected

| Option | Why not |
| - | - |
| a new `people` marker section beside `persona` | every existing preset and every SillyTavern import lacks it, so the other humans never enter until a host edits the preset; that defeats ADR 0122's unconditional entry, needs a fallback injection like `guided_instruction`, and gives the voice description two homes |
| one `in_static` injection per person, the anchor identity block generalised | ignores the preset author's marker position (an `in_static` injection lands after the sections), needs a lead-in prose slot per entry, and the trace files the bytes as injections instead of the persona section |
| preset `{{user}}` as the joined present names (the harness `alt` binding) | the default main prompt addresses `{{user}}` in the second person; `speakers.user` (names mode, the null-stamp guard) keys on one human; a joined string is not a name |
| the block follows the online set | presence flapping rewrites the static half on every reconnect; the owner named join, leave, swap and re-pick as the only block changes |
| name order, or the anchor last | a rename moves entries; equal names collide; the voice human first mirrors how the primary character's card is unheaded and co-speakers are headed |
| `[Also present — {{name}}]` as the heading | the owner removed the bystander framing for characters; a person is not a bystander |
| the whole block at the anchor persona's placement | the marker is the preset's slot; a persona's placement preference is about its own description, and honouring it per description keeps `at_depth` and `none` meaningful for each owner |
| listing a seat-less human as a `Traveler` entry | there is no description to consent to, two such humans collide, and the row labels already carry the name |
| a `{{people}}` macro in leg 1 | no template references it; it would ship unwired |
| a new ADR | ADR 0122 already rules that descriptions enter; this plan is mechanism under that ruling |
| rendering the people in card context (`pinnedPersona`) | the block is preset-side and follows the voice axis; card context stays the frozen anchor (ADR 0153) |
| deriving the block from `loadChatIdentityProducer` | that producer answers "what is id X called" for history and chrome, including departed personas; the block needs the present seats under the consent gate, which the FOREIGN resolver already reads |

## Coupled sites

| Site | Change |
| - | - |
| `packages/server/src/entry/compose/chat.ts` | `createTurnPersonaResolver` projects `people` |
| `packages/server/src/domain/chat/contract/foreign.ts` | `ResolvedPersonas.people` |
| `packages/contracts/src/chat/assemble.ts` | `AssembleContext.people` |
| `packages/server/src/domain/chat/assembly/context.ts` | `buildBaseContext` sets `people`; per-person `at_depth` candidates; people names in the haystack |
| `packages/server/src/domain/chat/assembly/assemble.ts` | the persona marker render; `markerStaticSources`; `personaLabel` names every person |
| `packages/server/src/domain/chat/assembly/budget.ts` | the contributor label for a multi-person section |
| `packages/contracts/src/chat/prose.ts`, `packages/contracts/src/prose-slot/index.ts` | the `chat.group.personaHeading` slot |
| `packages/contracts/src/prose/prose-baseline.json` | regenerated by the orchestrator with `pnpm prose:baseline`, never in a lane |
| `packages/client/src/features/preset/components/prompt-assembly/marker-copy.ts` | the `persona` marker copy says the section also lists the other people in the room |
| the preset Templates tab | verify the new slot row appears with its `title` and `fires` text |
| `packages/server/src/domain/chat/engine/pipeline.ts` | `userSpeakerName` floors to `DEFAULT_PERSONA_NAME` (fork 6); grep `"User"` across `tests/` for coupled fixtures before the change |
| the in-flight `prompt-cache-prefix.suite.int.test.ts` | the re-anchor test's `replaceAll` equality becomes an ordered block assertion |
| the in-flight `persona-matrix.suite.int.test.ts` | the people column; the `alt` binding is deleted (Rejected) |
| `docs/law/Chat-Macro-Resolution.md` §3 | the in-flight lane owes the `{{user}}` row edit; this plan adds one row for the people block |
| `packages/server/src/domain/chat/assembly/world-info/pool.ts`, `packages/contracts/src/chat/assemble.ts` `AssembleWorldEntry` | leg 2 only: persona-scoped book entries |

## Test plan

Red first: each new case runs against the unmodified in-flight tree and fails there. Each carries a planted control that passes before and after.

| Test | Proves |
| - | - |
| `tests/server/domain/chat/assembly/context.int.test.ts`, new describe "the people block" | two seats, both `in_prompt`: the static half carries the voice description, then `[Person — Bob]` and Bob's description; control: the same input without `people` is today's bytes. Join order with three seats. An `at_depth` person: heading-only entry plus one `in_chat` injection with `origin: "persona"` and `originLabel` the name, the description absent from the static half. A `none` person: heading only, no injection. A blank description: heading only. Per-entry macro scope: Bob's `{{user}} likes tea` renders `Bob likes tea` while the main prompt says `roleplay with Alice`. A voice persona at `at_depth` with people present: the block still carries the other entries. |
| `tests/server/domain/chat/assembly/assemble.test.ts` | the persona marker's static sources include every people description (a volatile macro in Bob's description is a cache buster); the contributor label names every person |
| `tests/server/entry/compose/chat.test.ts` | `createTurnPersonaResolver` projects `people` in seat order, excludes the voice human, and drops a departed owner's persona (the consent gate); a solo input projects no `people` |
| the in-flight `prompt-cache-prefix.suite.int.test.ts` | Alice sends, Bob sends, Alice sends: `prompt.static` is one value across the calls and carries Bob's entry. A re-anchor to Bob reorders the block. Bob leaves: his entry is gone. Bob goes offline (`readPresence`): the static half is unchanged. The solo golden is unchanged. |
| the in-flight `persona-matrix.suite.int.test.ts` | a people column (names in block order, heading present or absent) on every combination; new combinations for a person at `at_depth`, a person at `none`, three humans, and a leave; the report under `reports/persona-matrix/` is read after the run |
| `tests/server/domain/chat/persona-resolution.suite.int.test.ts` | byte-untouched, green (ADR 0153) |
| `tests/server/domain/chat/solo-byte-identical.suite.int.test.ts` | green |
| `tests/server/domain/chat/engine/pipeline.test.ts` | fork 6 only: a persona-less voice human's `speakers.user` is `Traveler` |

Suites run: `pnpm test:scoped` over every file above, `pnpm typecheck` for the server and contracts programs, scoped Biome and ESLint on the touched files, `pnpm check:agents`, `pnpm check:docs` and `pnpm check:structure` for the doc edits, then the whole-tree `pnpm check` barrier. The orchestrator runs `pnpm prose:baseline` on the merged tree.

## Forks

Each fork goes to the owner with the default this plan builds to.

1. Anchor mark. Default: position only; the voice entry is unheaded and every other person is headed. Alternative: the voice entry also takes a heading in a multi-human room, which changes solo bytes unless guarded by list length.
2. Heading default text. Default: `[Person — {{name}}]`, preset-homed, `{{name}}` pre-substituted. Default prose is owner-ruled.
3. Name-only entries. Default: a person whose placement is `none` or `at_depth`, or whose description is blank, keeps a heading-only entry so the model can map row labels to people. Alternative: omit the entry.
4. A `{{people}}` macro. Default: not in this program. Alternative: add it as an identity macro (present persona names in block order) without touching the default main prompt.
5. Persona-book scope. Default: leg 2 renders a persona-book entry against its own persona; the presence gate on books stays. Alternative: leave books as they are.
6. The `speakers.user` floor. Default: `userSpeakerName` floors to `DEFAULT_PERSONA_NAME` in leg 1, with the coupled-fixture grep. Alternative: keep `"User"` on the wire label.
7. A seat with no persona. Default: no entry; the row labels carry `Traveler`. Alternative: a heading-only `Traveler` entry.
8. Which humans. Default: present, enabled membership. Alternative: the online set, which rewrites the static half on every reconnect.
