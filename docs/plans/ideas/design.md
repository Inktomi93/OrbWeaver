---
kind: plan
status: parked
updated: 2026-11-15
rank: 16
blocked: owner
---

# Ideas the owner has not yet chosen

## Goal

Hold each product idea in one place until the owner picks it. An idea here is a concept, not work: it has no board item and no place in the work order. When the owner picks one, it leaves this file as a board item under the plan that owns its area.

## Shape

One heading per area, one sub-heading per idea. Each idea says what it is, what it builds on in the code, and what ruling it would amend or depend on. Ideas a recorded decision already rejects stay under Ruled out with the ruling described.

## Rejected

One board item per idea: an unchosen idea is not work, and many loose low-priority items bury the items that are.

## Coupled sites

None. An idea that depends on another names it by title.

## Test plan

None. A picked idea gets its done line and its test when it becomes a board item.

## Ideas

Each entry gives the concept, a mechanism to start from, where it lands, and the known ways the design fails. Numbers are starting values to tune on real chats, not requirements. Read the cited header or decision first, because several entries touch a recorded ruling.

A cross-domain need is an injected op typed in the consuming domain's contract and wired at the composition root. Several entries need game data in chat or lorebook data in a rule. None may import sideways.

### Game state

#### The model reports what happened and code decides how much

- **Concept**: For a tracker that models a relationship or a resource, the model picks a named event from a closed list and code owns the arithmetic. The model never writes a number for that tracker.
- **Mechanism**: A tracker definition carries an optional event table. Each event has a key, a one-line meaning and a signed amount per tracker it moves. The state round's schema offers the event key as an enum for that tracker in place of the open `delta`. The model also picks a weight from a closed set, for example routine ×1, significant ×2, pivotal ×4, with the meaning of each stated in the tool description. The applier sums the turn's events per tracker, applies a largest step per turn, and rounds.
- **Lands**: The table on the definition in `packages/contracts/src/rpg/tracker.ts`. The argument branch in `packages/contracts/src/rpg/tools.ts`. The per-round enum projection beside the existing key enum in `packages/contracts/src/rpg/extraction.ts`. The sum in `applyTrackerWrites` in `packages/server/src/domain/rpg/tools/apply.ts`. `.claude/rules/rpg.md` lists every place a new model-writable field touches.
- **Ruling touched**: The `applyTrackerWrites` header says nothing clamps the result. A definition with an event table is a new, opt-in mode. A definition without one behaves as it does now.
- **Known ways this fails**: Design each out with a test.
  - A table where every amount on one tracker is positive. The value then only rises, because a rebuff or an insult has no row that lowers it. Require at least one lowering event before a table saves, or add slow decay toward a base.
  - Rounding that never rounds a small nonzero sum to zero. Every trivial event then counts as a full point.
  - Multipliers that stack before the per-turn bound is applied.
  - An event with an empty actor that is read as the player's act.
  - A feedback loop: a high value puts warm wording in the prompt, the model writes warm prose, and the next round reads that prose as more events. Halve gains above a threshold and count only the player's acts.
  - The same model writing the scene and grading it. The folded game mode does this, so decide whether event tables are allowed there.

#### A tracker definition can bound how far one turn moves it

- **Concept**: The smaller step on the same path. Keep the open integer and let the host bound it.
- **Mechanism**: Optional fields on the definition: a floor, a switch that clamps to the ceiling, and a largest step per turn. The applier applies them after the sum. A value outside the bound is clamped and the tool-call record says so.
- **Lands**: `packages/contracts/src/rpg/tracker.ts` and `applyTrackerWrites`. The wallet path `applyWalletDeltas` has the same open amount and needs the same choice.
- **Ruling touched**: The same header. The comment on `trackerCeiling` names a delta clamp that does not exist, so fix that comment in this change.
- **Do this first**: It is small and it closes the case where one bad value lands.

#### A state change carries the words that justify it

- **Concept**: A write names the sentence in the turn that caused it, and the host can read why a value moved.
- **Mechanism**: An optional short quote on each tracker write, relationship write and quest action. The applier checks that the quote, with whitespace and case folded, appears in the turn's text. A missing or unmatched quote lowers the weight to routine or drops the write, by a per-game setting. The quote is stored on the turn's tool-call record.
- **Lands**: The argument schemas in `packages/contracts/src/rpg/tools.ts`, the record shape in `packages/contracts/src/rpg/extraction.ts`, and the applier. The record already holds each call's arguments and verdict.
- **Known ways this fails**: Asking for a quote and never checking it is worse than not asking, because the record then looks audited. Small models also omit optional nested fields, as the journal `title` comment in `tools.ts` describes, so a missing quote must degrade and never fail the round.

#### A relationship pack defines several axes in one step

- **Concept**: The built-in relationship is one stance on a non-player character. Trackers can already hold any axis on any actor. Ship a pack so a host does not have to design the axes.
- **Mechanism**: A tracker pack, applied like a roster preset's game template, that adds meters from −100 to 100: trust, comfort, attraction, respect and affection. Each carries a hint and applies to `everyone`, so roster characters get them too. Add one or two short-lived meters that drift a few points per turn back to a resting value, for moods that should fade.
- **Lands**: `packages/contracts/src/rpg/config.ts` for the template, and the game template a roster preset already stores in `roster_presets.game_template`.
- **Known ways this fails**: An attraction meter on every character invites a romance reading of every warm scene. Leave attraction out of the default pack, or leave it off for a character until the host turns it on.

#### A character's disposition scales how an event lands

- **Concept**: The same event moves a guarded character less than an open one.
- **Mechanism**: A sheet holds a few named traits on a 0–100 scale and a short list of triggers, each a phrase with a multiplier from 1 to 3. The applier multiplies an event's amount by a tilt between 0.75 and 1.25 read from the matching trait, and by the strongest matching trigger. The reminder also renders the traits as one line of words, built from traits above 70 or below 30. A trait that changes the arithmetic and never reaches the writing model is half a feature.
- **Lands**: `packages/contracts/src/rpg/sheet.ts`, which holds `className`, `attributes` and `flavor`. The reminder builder in `packages/server/src/domain/rpg/substrate/reminder.ts`.
- **Depends on**: The named-events entry.
- **Known ways this fails**: A model that rates a card and fills these traits must not have its rating applied before the host accepts it. `populateFromCharacter` is the one sanctioned model path to a sheet and is a host click. Keep that rule.

#### The writing model reads a meter as words

- **Concept**: A meter reaches the writing model as `Label value/max` with a hint. A bare number is easy to recite and hard to act on.
- **Mechanism**: A definition carries optional named bands, each a range and a phrase, for example a high band that reads as open warmth. `trackerReading` returns the band's phrase when bands exist. A value near zero renders nothing, so a small value has no effect on prose. The delta line names the band change, not the arithmetic.
- **Lands**: `trackerReading` and `trackerVocabulary` in `packages/contracts/src/rpg/tracker.ts`, and `trackerLine` in `packages/server/src/domain/rpg/substrate/delta.ts`.
- **Evidence to keep**: The comment on the definition's `hint` records a measured result that a gloss moves narration where a bare number does not. Measure bands the same way before shipping them.

#### A cheap check skips the state round on a quiet turn

- **Concept**: The low-cost game mode pays for a state round on every turn. Many turns change nothing trackable.
- **Mechanism**: A pure text check over the new turn: any digit, number words, time words such as day, night, morning and later, item verbs, and the names of tracked things. No match and a non-empty state means no model call, and the reminder carries the standing state. Keep a forced round every few turns so a missed change is caught.
- **Lands**: The round decision in `packages/server/src/domain/rpg/chat-ops/flush.ts`.
- **Known ways this fails**: A check written for English misses every other language. Use Unicode letter classes and keep the word lists as data.

#### A tracked value can modify a roll

- **Concept**: A roll's modifier is a sheet attribute set by hand. A relationship or a resource could change the odds.
- **Mechanism**: A roll names a tracker as its modifier. The modifier is the value divided by a stated factor, for example a −100 to 100 meter divided by 20 gives −5 to 5. Offer rolls the game makes itself on a cadence, seeded from the message position so a swipe re-rolls the same die.
- **Lands**: `packages/server/src/domain/rpg/verbs/roll-dice.ts` and `packages/kit/src/dice`.
- **Known ways this fails**: A wrong tracked value is amplified into outcomes. Take this up after the bound and evidence entries.

#### The host previews the game-state text with its size

- **Concept**: The host sees the exact state text the next turn carries.
- **Mechanism**: A read that calls the pure reminder builder on the current head and returns the text and its estimated size. Show it in the game panel beside the settings that change it.
- **Lands**: `buildLiteReminder` in `packages/server/src/domain/rpg/substrate/reminder.ts`, a read verb, and the client game panel.

#### One change can be undone

- **Concept**: The host reverses one model write without restoring a checkpoint.
- **Mechanism**: The tool-call record holds each call's arguments and verdict. An undo writes a hand row that reverses that call, through the same op path a hand edit uses.
- **Lands**: `packages/server/src/domain/rpg/snapshot-edit.ts` and `rpg_turn_tool_calls`.

#### A full meter or a final act runs a rule

- **Concept**: A meter at its ceiling and a plot at its last act cause nothing in code.
- **Mechanism**: A new chat trigger, "a tracker crossed a bound", carrying the tracker key and the direction. The clock rule preset already fires on a counter, so this is one more trigger for the same machinery.
- **Lands**: `CHAT_TRIGGER_TYPES` in `packages/contracts/src/automation`, and the emit after a flush.

#### A first event table to ship with the relationship pack

- **Concept**: A small table that has slow gain, real loss and decay, so a value cannot only rise. It is a worked case of the named-events entry above.
- **Mechanism**: Five events per character who dealt with the player: positive interaction, slight, insult, betrayal, apology. Code keeps three counters per pair. A positive interaction adds a spark and a slight adds a grudge. An insult costs one bond and a betrayal two. An apology clears the grudge. On a fixed period, sparks decay when the turn was not positive, and a set number of sparks converts to one bond unless the grudge is high. On a second period, a high grudge costs one bond and resets, and a lower one decays. Bond is clamped. A bond level unlocks a named step of closeness, and the prompt carries the current step, so one warm scene cannot jump several steps.
- **Lands**: An event table on a tracker definition, as the named-events entry describes, shipped as the relationship pack's default table.
- **Known ways this fails**: A helper that rewrites the whole state every turn can drop a note without saying so, so apply events as deltas. The table tracks each character against the player only. Sending the raw counters to the writing model is what the meter-as-words entry argues against.

### Hidden knowledge and memory

#### The model keeps a lie after the scene is summarised

- **Concept**: A hidden lie stays in the prompt only while its message is in the verbatim window. After compaction the model has forgotten a lie the host can still see in the ledger.
- **Mechanism**: On a game with deception on, add a standing-lies block to the game reminder: one line per standing lie with who told it, what is true, and why. Bound it by count and size, newest first. The block is built from the same transcript scan the host's ledger uses.
- **Lands**: `buildRevealView` in `packages/server/src/domain/rpg/substrate/reveal.ts` already returns the standing lies. The reminder builder adds the block. `rpg.reminder.deceptionTeach` in `packages/contracts/src/rpg/prose.ts` already tells the model it remembers.
- **Check first**: The prompt goes only to the host's model, but the assembled prompt is stored per swipe and shown in the preview. Confirm every surface that shows it is host-only before the block carries a truth.
- **Size**: The smallest entry here with a real effect. The ledger exists, is deduplicated and is tested.

#### A hidden fact records who knows it

- **Concept**: A lie records who told it and what is true. It does not record who believes it or who has found out. A reply voiced by one character cannot omit what that character does not know.
- **Mechanism**: Add `heardBy` to the lie tag and read the `who` attribute the unperceived-event tag already parses and ignores. Add a small "found out" tag or a host action that removes a name from the believers. At assembly, for a turn voiced by one character, the standing-lies block shows that character only the lies they told or have seen through, and shows a lie they believe as a plain belief with no truth attached. For a narrator turn that voices several characters, add a short block grouped by who knows what, with one instruction line that a character acts only on what they know.
- **Lands**: `HIDDEN_TAGS` in `packages/kit/src/content/index.ts`, the reveal view, and the reminder.
- **Depends on**: The standing-lies entry.
- **Known ways this fails**: A model asked to list who knows a thing defaults to nobody or everybody. Default the list to the characters present in that turn's snapshot, and always add the subject. Merging two facts must never widen who knows either one.

#### A character's memory is what that character saw

- **Concept**: Scoped memory selects blocks by seat overlap and gives every bucket the same summary. "Was present" is not "knows".
- **Mechanism**: Two parts that can ship apart.
  1. The summary prompt for a character's bucket asks for a short first-person recollection: only what that character saw, heard, did or was told, and what they now intend. Nothing another character thought in private.
  2. Each digest records its witnesses, read from the game snapshot's presence list where a game exists and from the speakers in the block otherwise. Recall for a single-voice turn drops a digest whose witnesses do not include the speaker.
- **Lands**: The summary prompt in `packages/server/src/domain/chat/memory/generate/digests.ts`, `witnessing.ts` beside it, and the scoped filter in `packages/server/src/domain/chat/memory/recall/recall.ts`. `chat_digest_speakers` already records which characters a digest contains.
- **Ruling touched**: D55 sets the memory defaults. Read it before changing a bucket's meaning.
- **Cost note**: Per-character summaries cost one call per character. Ask for every character's recollection in one structured call per block.
- **Board check**: Scoped per-character memory with join and leave witnessing is already built in the recall file above. The first-person summary and the per-digest witness list are the parts not built.

#### Memory blocks end at scene boundaries

- **Concept**: Memory cuts the transcript into fixed-size blocks. A summary of half a scene and half the next is worse than a summary of one scene.
- **Mechanism**: A hard boundary where the place changes or the clock jumps by more than about six hours. A soft boundary on a model-flagged scene change, folded into the previous block when the scene is shorter than about six messages. With no signal, a forced boundary at about forty messages, and a longer scene split into near-equal parts. The live tail gets no block until a later scene exists. Place comparison must be fuzzy, because a model re-spells a place.
- **Lands**: The block cut in `packages/server/src/domain/chat/memory/generate/substrate/transcript.ts`. A game chat's place and clock live in the game snapshot, and chat cannot import the game domain, so the boundary signal is an injected op typed in chat's contract and wired at the composition root.
- **Cost of the change**: `chat_digests` and `chat_segments` key on a block index. Variable-size blocks keep that key and change what an index means, so every stored digest for a chat is rebuilt once. Tiered digests above tier zero assume a fan-out over equal blocks.
- **Known ways this fails**: Memory that depends on an optional feature. A plain chat with no game needs the forced boundary to work alone.

#### The memory budget follows the model's context window

- **Concept**: Recall size is set by item counts. A small model is crowded and a large one is starved.
- **Mechanism**: A budget of about 15% of the bound model's window, with a floor near 800 tokens and a ceiling near 16,000. When everything remembered fits, send it all in story order and rank nothing. Otherwise fill in a fixed order and stop a group at its first item that does not fit.
- **Lands**: The recall caps in `packages/server/src/domain/chat/memory/recall/recall.ts` and the history fit in `packages/server/src/domain/chat/assembly/history-budget.ts`, which has to reserve the room.

#### Recall ranks by shared words before meaning

- **Concept**: Recall ranks by vector similarity with an optional reranker. Its keyword step matches exact tokens against keywords the summariser wrote. Vector similarity alone can rank an unrelated block as high as a related one.
- **Mechanism**: A lexical score over the last six messages:

  - each content word of an item that appears in the scan text scores `10 × ln(1 + N/df)`, with `df` counted inside the candidate pool;
  - names score ×1.6;
  - two adjacent content words that are also adjacent in the scan text add half their weight again;
  - a word used in a large share of the chat's recent messages is discounted;
  - a recency factor between 0.5 and 1.2 multiplies the result.

  Then add the vector signal as a bonus: z-score each item's cosine within the pool and add up to a fixed amount for items above the mean. With fewer than four items or no spread, the words decide alone.
- **Lands**: `packages/kit/src/recall` for the pure scorer, and the digest search verb in `packages/server/src/domain/search/verbs/digests.ts`. `chat_digests.keywords` already stores the retrieval words.
- **Also**: Stemming is per language. Start with exact match for words of three letters or fewer and a suffix strip for longer ones, and keep the stop-word lists as data.

#### A remembered item is proposed before it is kept

- **Concept**: Memory writes at once and the host can strike an item later.
- **Mechanism**: A per-chat mode with these settings. `ask` waits for a click on every new item. `quiet` applies and offers an undo. `careful` applies everything except a change that widens who knows a fact, edits something the host wrote or pinned, or records a belief. Each proposal carries a one-word reason.
- **Lands**: The confirm-card path that `distillLore` uses in the automation domain is the existing pattern. `chat_memory_strikes` is the existing after-the-fact control.
- **Board check**: D55 rules durable memory facts out. This entry needs that decision reopened before it is picked.

#### History a speaker did not witness is shortened

- **Concept**: In a room with several characters, a speaking character should not read turns they were absent for.
- **Mechanism**: For a single-voice turn, replace each run of history written while that speaker was off the presence list with one system line, that names the speaker and counts the messages they missed. If the place did not change, the line says they heard voices and not the words. On for group rooms only by default.
- **Lands**: History shaping in `packages/server/src/domain/chat/assembly`.
- **Ruling touched**: This is a new ruling on how history is shaped per speaker, and it changes the cached history prefix for every speaker change. Measure the cache cost first.

#### One summary call serves every bucket that saw the same block

The board holds this as a bug: a group room pays for one summary per character over the same text. The point-of-view entry above decides which fix applies.

#### A secret is one tagged line before it is a schema

- **Concept**: The first step toward "a hidden fact records who knows it", with no new stored shape.
- **Mechanism**: The game state round keeps a short bounded list of notes, each tagged as a rule, an open thread or a secret. A secret names who knows and who does not, and the instruction says to record one whenever a character was absent for an event. Secrets render under their own heading in the host's hidden panel and in the reminder.
- **Depends on**: The standing-lies entry, for the host-only check on every surface that shows the stored prompt.
- **Known ways this fails**: A free-text line cannot be filtered per speaker, so this step informs a narrator turn and does nothing for a single-voice turn. The `heardBy` attribute is still the design for that.

#### Summarising waits for a queue sized to the prompt cache

- **Concept**: Each time memory summarises, the start of the prompt changes and a provider's prompt cache misses. Summarising less often, in larger steps, keeps the cached start stable for longer.
- **Mechanism**: Recent chat stays verbatim up to a budget. Summarising starts only when the live chat exceeds that budget plus a queue allowance, and then compresses back down to the budget. The allowance is a setting tied to whether the bound connection caches prompts: large when it does, small when it does not. Compress whole turns only, a user message with the replies after it, and never the last two turns.
- **Lands**: The trigger that decides when a block is summarised, under `packages/server/src/domain/chat/memory/generate`. `packages/server/src/domain/chat/assembly/history-budget.ts` already trims history in cache-aligned chunks.
- **Board check**: The summariser's trigger was not read for this entry, so whether a queue allowance already exists in another form is unverified. Read it before picking this.

### Lorebooks

#### The stored SillyTavern activation fields take effect

- **Concept**: Imported entries keep these fields and none is read at activation. `ST_INERT_ACTIVATION_FIELDS` in `packages/kit/src/world-info/index.ts` is the list.
- **Mechanism**, in the order imported books use them most:
  1. Secondary keys with their logics: any, all, not any, not all.
  2. Per-entry scan depth, case sensitivity and whole-word matching.
  3. Probability, rolled once per turn from the injected random source so a swipe re-rolls the same draw.
  4. Inclusion groups: one winner per group, by sticky first, then score, then a weighted roll.
  5. Sticky, cooldown and delay, counted in messages.
  6. Recursion: re-scan with the fired entries' content appended, with the per-entry recursion flags.
  7. Character and tag filters, and filters by generation type.
- **Lands**: The pure matcher in `packages/kit/src/world-info/index.ts`, the pool in `packages/server/src/domain/chat/assembly/world-info/pool.ts`, and the scope logic in `packages/server/src/domain/chat/assembly/context.ts`.
- **Hard part**: Sticky and cooldown are state per chat. Derive it from the selected lineage, in the way runtime variables fold from `message_variants.variable_delta`, so a swipe rewinds it. A stamped counter drifts on swipe and fork. A preview or a test run must never consume a counter.
- **Known ways this fails**: A recursion cap with no signal when it is hit. Secondary keys that apply even when the entry's `selective` flag is off. An export that writes `selective` false for every entry.
- **Before this**: Fix the card-embedded field read, which the board holds as a bug.

#### A lorebook entry says why it did not fire

- **Concept**: The only recorded drop reason is the budget. An author cannot tell a missed key from a disabled entry.
- **Mechanism**: Record one reason for each entry that was considered. The reason set is a closed tuple with a mapped record, so a new reason fails `tsc`: no key matched, disabled, out of scope, rendered empty, over budget, and, as the activation fields land, delay, cooldown, probability, lost its group, secondary keys, filtered by character, filtered by trigger. For a fired entry, record how it fired: which key, always-on, sticky, or similarity with its score.
- **Lands**: `worldInfoDropped` in `packages/contracts/src/chat/assemble.ts`, the pool and context files above, and `assembly-preview-diagnostics.tsx` in the client chat feature.

#### An unsaved lorebook can be tested against sample text

- **Concept**: An author pastes text, or picks a chat, and sees which entries fire and why, before saving.
- **Mechanism**: A read verb that takes the unsaved book and a scan text and runs the same activation code a turn runs. It returns the reasons from the entry above. It must share the turn's code path, because a second matcher drifts.
- **Lands**: A verb in `packages/server/src/domain/world-info`, calling the pure matcher, and a panel in `packages/client/src/features/world-info`.
- **Depends on**: The reasons entry.

#### Keys match word forms and names across scripts

- **Concept**: Matching is whole-word and exact.
- **Mechanism**: An optional stem match per entry or per book. For names, a second key built by transliterating to one script, so a name written in Cyrillic matches a Latin card name.
- **Lands**: The matcher in `packages/kit/src/world-info/index.ts`.

#### An entry can activate by meaning

- **Concept**: The stored `vectorized` flag is inactive. The databank already retrieves by embedding.
- **Mechanism**: An entry that opts in fires on similarity or on keys. Use a threshold per book that adapts to the embedding model: the mean similarity of the book's entries to the scan text plus the larger of two standard deviations and 0.10, with a floor near 0.25. With fewer than four vectors use a fixed 0.55. Take the top ten at most. Embed the scan text once per turn with any entries that lack a vector. Key each vector by a content hash and the model that made it.
- **Lands**: The embeddings domain owns every vector write, so this is a new source for `embeddings.store` and a read through `search`. `docs/law/Knowledge-Cluster.md` holds the rules.
- **Known ways this fails**: A fixed threshold. Each embedding model has its own similarity floor, so a fixed number fires everything on one model and nothing on another.

#### Appending names to the scan text is a setting

`buildKeywordHaystack` always appends the names of the characters and personas present. An entry keyed on a present character's name then fires every turn. Make it a setting per book or per room and keep the present behaviour as the default.

#### A standalone lorebook exports in the SillyTavern world-file format

A book exports in the app's own envelope. The only SillyTavern-shaped export is a card's embedded book. A reader reported that the card export writes `position: "before"` where the card format expects `before_char`. Confirm that against the format before writing a second exporter.

#### An evaluation order for the activation fields

This adds an order of operations to "The stored SillyTavern activation fields take effect". Treat it as a starting point and check each step against SillyTavern's own source, because the reader it came from differs from SillyTavern in several places.

1. Drop entries that are disabled, empty, or excluded by the character filter.
2. Build the entry's scan text from its own scan depth, or the default.
3. Delay: skip while the chat has fewer than that many messages.
4. An entry inside its sticky window is active and skips keys and probability.
5. An entry inside its cooldown window is skipped.
6. A constant entry is active when its probability roll passes.
7. An entry marked to wait for recursion is skipped in the first pass.
8. Otherwise the entry is active when a primary key matches, the secondary-key logic passes, and the roll passes.

- **Recursion**: Join the content of the newly active entries, leaving out any that prevent recursion, and scan the remaining entries against it. Repeat with the newly active set until nothing new fires or the pass limit is reached. Record a reason when the limit stops a pass.
- **Inclusion groups**: An entry can name several groups. In a group with two or more active entries one wins: sticky first, then the override flag by highest order, otherwise a roll weighted by group weight.
- **Timers**: An entry that fired by key or as a constant records a sticky window, and a cooldown window that starts when the sticky window ends.
- **For us**: Rolls come from the injected random source, so a swipe re-rolls the same draw. Timer state derives from the selected lineage, as the parent entry says, because a stored window is a position in the chat and deleting messages moves the chat under it.

#### Two books that hold the same entry send it once

- **Concept**: A card's embedded book that also exists as a linked book, or a book copied into a second book, sends its entries twice.
- **Mechanism**: When a card's embedded book and a linked book share a name, use the linked one. Then drop an entry whose keys and content match one already collected, and record the drop with a reason.
- **Lands**: `packages/server/src/domain/chat/assembly/world-info/pool.ts`. The pool already drops a repeated entry id, so one book attached at two scopes is sent once. Matching across distinct books is the part not built.

### Presets and prompts

#### An imported preset's toggle groups become variables

- **Concept**: Preset authors build menus out of prompt names. The preset contract has choice variables and the SillyTavern mapper emits none, so a menu imports as a flat list of on and off sections.
- **Mechanism**:
  - A prompt is a header when its name starts with a heavy rule character, holds a run of three or more, contains "(pick one", "(pick any" or "(pick N", or starts with pick, choose or select.
  - A group is the toggles after a header up to the next marker prompt.
  - A group becomes a single choice when its header says pick one. It becomes a multi choice when fewer than about 60% of its members are on in the file. Otherwise it stays plain sections.
  - A `[PICK n: TAG]` tag in a name joins non-adjacent prompts into one choice.
  - A prompt that only runs `{{setvar::name::value}}` and is on becomes a text or number variable.
  - An author's `{{// … }}` comment becomes the option's hint. It is never sent.
  - A name that says do not touch or do not enable marks the section locked.
- **The rule to hold**: With the default choices, the imported preset sends the same text the file sent. Pin it with a test over real preset files: assemble before and after structuring and compare bytes.
- **Lands**: The SillyTavern mapper and the variables schema in `packages/contracts/src/preset/index.ts`. A section cannot refer to a variable except through a macro in its body, so a choice wraps each member's body in the conditional macro, or the section schema gains a condition field. Choose one and state it in the header.
- **Limits to check**: An option value holds 10,000 characters and a real section can be longer. Variable choices are per chat and shared by every member of a room.

#### The import report lists what arrived, what changed and what was dropped

- **Concept**: The report lists dropped fields only.
- **Mechanism**: Separate lists: mapped as written, approximated with the guess that was made, and dropped with the reason. Record a guess such as "assumed pick-one from the defaults". Scan every prompt body for macros the engine does not know and list them by name with a count. Keep the report readable after the import closes.
- **Lands**: `StImportResult` in `packages/contracts/src/preset/index.ts`, `packages/server/src/domain/import/substrate/report.ts`, and the client import dialog.

#### A prompt section can be removed and brought back

Deleting an authored section cannot be undone. Keep removed sections in a list on the preset config, and offer restore. An import that finds a prompt with no place in the order puts it there instead of dropping it.

#### A section can state a condition and belong to a wrapped group

A section carries an optional condition on a variable. Adjacent sections can share a group id, and the group is sent inside one wrapper, a tag or a heading, only when at least one member is sent. A section can also list the generation types it applies to. The toggle-groups entry needs the condition.

#### Variables have toggle and number kinds

The only variable kind is a choice. Add a toggle and a bounded number, and a text kind for the `setvar` case above.

#### One part of the prompt can be switched off for one chat

A room can override a few text fields. Let a host turn off one preset section or one attached lorebook for one chat from the preview. Store a list of switched-off keys on the room. Assembly records each as left out with the reason "off for this chat".

#### The macro conditional supports else-if and boolean operators

The `if` macro has no else-if and no and, or and not. The expression macro is the only way to write those. Add them to the conditional, or document the expression macro as the way and show it in the editor's suggestions.

#### An unknown macro is reported to its author

An unknown macro is sent to the model as its raw text. The engine has a diagnostics sink and assembly sets none. Set it, carry the diagnostics in the assembly trace, and show a notice in the editor and the preview. The board already holds the assembly half of this as an open item on macro diagnostics.

#### Token figures come from a tokenizer, or every figure says it is an estimate

Every count divides characters by four. A better estimate with no dependency: ASCII at 3.5 characters per token, other letters at 2, CJK at 1. Use the provider's tokenizer where one exists. Mark every figure as an estimate, including the output cap row and the chat tab that carry no mark.

Board check: a recorded ruling excludes adding tokenizers. The better character estimate and the estimate marks do not depend on one.

#### A preset keeps the SillyTavern fields the mapper does not understand

- **Concept**: The mapper reports an unknown field as dropped. A preset imported and exported again loses it, and a field a later release learns to map is already gone.
- **Mechanism**: A residual bag on the preset config holds every field the mapper did not claim, untouched. Export writes the bag back and then overwrites the parts the app owns. A character card already keeps one, in `characters.residual_data`.
- **Lands**: The SillyTavern mapper and the config schema in `packages/contracts/src/preset/index.ts`. The import report then lists such a field as kept and inactive, not dropped.
- **Known ways this fails**: A residual field that a later release maps must be lifted out of the bag once, or the bag and the mapped field disagree on export.

### Seeing what was sent and what it cost

#### The host can list recent model requests from every caller

- **Concept**: The stored prompt snapshot covers a chat turn. A state round, an analysis pass, a summary or a plugin call leaves nothing a host can read.
- **Mechanism**: A ring of about the last fifty requests per owner, each with a source tag such as chat turn, game state round, analysis rule with its id, summary, or plugin with its id. Each holds the messages, a size per message, and the model. Hold it in memory and let a restart clear it.
- **Lands**: The debug ring in `packages/server/src/foundation` already captures provider bytes behind `WIRE_CAPTURE` with no source tag and no client. `packages/contracts/src/debug/index.ts` holds its shape. Add the tag at each caller and a host-only read.
- **Guard**: A ring that holds prompts holds hidden spans and other members' text. It is host-plane only, and a member's own requests are the only ones a member reads.

#### One list shows what was left out of the prompt

Memory verdicts, the lorebook drop count and the history trim live in separate places. Return one list of left-out items, each with its kind, label, size and reason, and render it as one panel. The lorebook reasons entry supplies most of it.

#### A prompt part can be located in the sent text

The trace lists contributors with their text. Add character ranges that tie each part to its place in the final messages, so clicking a part highlights it. This is the direct answer to "where did this line come from".

#### History rows show their size

The preview shows a character count for each history row. The server already prices each kept row for the preset readout. Return that figure on the preview.

#### A reply shows the total it cost

- **Concept**: A variant stores its cost. Helper calls the reply caused are recorded for the owner with no link to the turn.
- **Mechanism**: Stamp the turn id on each helper spend row, then sum the variant's cost and its helpers' into one figure on the reply. Show measured and estimated cost apart, as `cost_provenance` already distinguishes them.
- **Lands**: `spend_ledger` in `packages/db/src/schema/stats.ts` has no turn key, and `chat_generation_observations` has one. `packages/server/src/domain/stats/write/ledger-spend.ts` writes the helper rows. A schema change follows `.claude/rules/db.md`.

#### A rule shows its likely cost before it is switched on

- **Concept**: The rule list shows a one-bit spending flag.
- **Mechanism**: Derive a ceiling from the rule's shape: the count of actions that call a model, times the hourly cap, with the retry bound. Estimate input size from what each action reads and output size from its cap. Show calls per reply and calls per hour on the rule row, and a total for the chat across enabled rules.
- **Lands**: `packages/server/src/domain/automation/substrate/presets.ts` for the derivation and the rule row in the client automation feature.
- **Ruling touched**: Money ceilings were removed by decision. This entry shows cost and caps nothing.

#### A rule can be tried on a real reply before it is live

The dry run renders templates and calls no model. Add a run that executes the rule once against the chat's model with every side effect withheld, and shows what it would have written. Cache the model's answers so the owner can edit the rule and re-run for free.

#### Editing an enabled rule asks again when it gains reach

Enabling a rule is the consent, and an edit keeps it. Store a digest of the action classes and data sources the owner consented to. An update that adds one disables the rule until the owner confirms, in the way a plugin upgrade that widens its reach sets `pending_reconsent`.

#### A failed reply says what happened and what to try

- **Concept**: A reply that failed, was blocked, came back empty or was cut shows little a user can act on. The variant already stores its finish reason, terminal reason and provider status.
- **Mechanism**: Classify each ended reply into a closed set with a mapped record: stopped by the user, error, blocked by the provider's filter, empty, cut at the output limit, or fine. An error is told apart further: unreachable server, rejected key, out of credit, rate limit, prompt too long, model not found, rejected request, moderation refusal, provider fault. Each case carries two short lines, what happened and what to try.
- **Lands**: A pure classifier over the stored reasons in contracts, and the client chat feature for the notice.
- **Ruling touched**: The header of `packages/client/src/features/chat/components/message-metadata-row.tsx` rules a finish-reason outcome notice off that row. Read it first; the notice needs another home or that ruling amended.
- **Pairs with**: "The host can list recent model requests from every caller".

#### A notice when the model can see almost none of the chat

- **Concept**: In a long chat with a small context window the model may see only the newest turn or two, and the user reads the result as the model forgetting.
- **Mechanism**: The server already stamps where history was cut on each variant. When that boundary sits within a turn or two of the newest message in a chat longer than a few messages, show one notice per chat that says how many messages fit and where to raise the limit. The prompt preview repeats it.
- **Lands**: The boundary reaches no client code today, so this needs the field on a read and a notice in the client chat feature.

### Rule presets to consider

#### A rule that counts repeated phrases with no model call

- **Mechanism**: Over the last six character replies, build runs of three to five words that stay inside one sentence, and count the distinct replies each appears in. Keep a run that appears in at least two replies, has at least twelve letters and holds a content word of four letters or more. Drop proper nouns. Keep the five longest that do not overlap. Also keep a sentence opener, the first two words, used three or more times. Inject one line that lists the phrases to avoid and asks for fresh wording.
- **Why it is worth having**: No model cost, and it works in any language through Unicode letter classes.

#### A ledger rule that does its own arithmetic

- **Mechanism**: A small table of named quantities, about a dozen rows, each a stock or a timer, with an optional amount per day. The owner sets a value with a typed command. A text check for digits and time words gates the model call. The model reports lines such as `gold: -30` or `days: 2`, numbers only. Code applies them, clamps timers at zero and bounds a day jump. The next prompt carries the current totals with an instruction to use them and invent none.
- **Relation to the game mode**: A game tracker already does most of this. The parts to take are the gate, the per-day rate, and the totals line.

### Import

#### A SillyTavern import selects the preset the user was running

- **Concept**: A newcomer's first chat should behave as their last one did.
- **Mechanism**: The profile's settings file records the active preset by name. The import already brings the live settings in as a preset of their own. Select that preset as the default when the import finishes, and say so in the report.
- **Board check**: Whether the app has one account-wide default preset to select was not confirmed for this entry. Our limits come from the connection, so the profile's context and output limits are not taken.

#### An imported SillyTavern theme keeps its custom CSS where the law allows

- **Concept**: The theme import brings the palette and notes what it lost. A theme's custom CSS is not imported.
- **Mechanism**: An import step that maps a known set of SillyTavern selectors onto our tokens and reports every rule it could not map. D158 gives user CSS a home.
- **Ruled out**: Reusing another app's class names in our markup so its CSS matches unchanged. `docs/law/client-architecture-lockdown.md` §4 forbids it.

### Out of scope

- Text completion is absent by design. It is not an idea here.
- Spend ceilings in money were removed by decision. The cost entries show cost and cap nothing.
- D55 sets the memory defaults and rules durable facts out. The memory entries that add witnesses or beliefs need that decision reopened first.
