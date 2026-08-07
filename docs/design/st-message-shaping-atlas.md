---
kind: reference
status: active
updated: 2026-08-07
---

# SillyTavern message-shaping atlas — storage identity, wire identity, and our delta

How SillyTavern identifies a message's author and kind **at rest** (`.jsonl` chat log) versus **on the
provider wire** (post-shaping), and where Orbweaver's assembly agrees or diverges. Mined from the
`scripts/probes/st-goldens/` corpus. The rig's own operating manual is `scripts/probes/st-goldens/README.md`;
this doc is the FINDINGS, not the harness.

## Evidence tiers — read the label before quoting a row

Every claim below carries one of three tiers. Do not promote a tier when citing this doc.

| tier | meaning | how to re-derive |
| - | - | - |
| MEASURED | read out of a captured wire payload in `output/` or `orbweaver-output/` | `jq` over the named `golden_id` |
| SOURCE-PINNED | read out of the ST runtime's own source at a cited line | the runtime tree under `sillytavern-runtime/` |
| unverified | stated mechanism not proven by either | the named next probe |

Corpus state at mining time (2026-08-07), MEASURED by directory listing:

| arm | files | what is present |
| - | - | - |
| `output/` (ST) | 10 | 9 `ashen_spire_claude_<model>_tools`, 1 `custom_squash_claude_strict` — all mtime 2026-08-06 07:10 |
| `orbweaver-output/` (ORB) | 46 | full 16-combo + 8 name-behavior + tools matrix + depth-injection + 2 basic |
| `fixtures/` | 48 | inputs for both arms |

The ST arm holds NO 16-combo and NO depth-injection capture — see §Limits. So §Wire identity's mode table is
SOURCE-PINNED, and the ST↔ORB byte delta rests on the one fixture where both arms carry real conversation
content (`custom_squash_claude_strict`).

## Storage identity — the `.jsonl` line schema

Path: `sillytavern-runtime/data/default-user/chats/<CharacterName>/<chat>.jsonl`. Line 1 is a header; every
subsequent line is one message. MEASURED across 10 chat files, 114 message lines.

### Header line (line 1)

| field | example | note |
| - | - | - |
| `user_name` | `"Traveler"` | the persona name; `"unused"` in ST-shipped defaults |
| `character_name` | `"Sabine Veyra"` | the directory key `build-fixtures.ts` writes into |
| `create_date` | `"August 3, 2026 2:07am"` | absent on some files — not a guaranteed key |
| `chat_metadata` | object | `integrity`, `tainted`, `note_prompt`/`note_interval`/`note_position`/`note_depth`/`note_role` (author's-note config), `timedWorldInfo`, `lastInContextMessageId` |

### Message line — the identity fields

MEASURED key union over all message lines: `mes`, `name`, `is_user`, `is_system`, `send_date`, `extra`,
plus optional `swipes`/`swipe_id`/`swipe_info`, `gen_started`/`gen_finished`, `force_avatar`, `title`.

| field | type | what it identifies |
| - | - | - |
| `is_user` | bool | THE role axis. `role = is_user ? 'user' : 'assistant'` — SOURCE-PINNED `public/scripts/openai.js:570` |
| `is_system` | bool \| absent | **NOT the wire `system` role.** `true` = UI-only row, EXCLUDED from the prompt |
| `name` | string | the sole author discriminator among non-user rows (group members all share `is_user:false, is_system:false`) |
| `extra.type` | string | `NARRATOR` here is what actually produces a wire `system` role |
| `force_avatar` | string \| absent | persona-avatar override; a NAME-STAMP TRIGGER under `names_behavior: DEFAULT` |
| `extra[Symbol.for('ignore')]` | flag | row skipped entirely, without changing message count |
| `send_date` | string | two formats coexist in one corpus: ISO (`2026-08-05T17:29:21.464Z`) and ST-local (`August 3, 2026 2:34am`) |
| `swipes` / `swipe_id` / `swipe_info` | array/int/array | alternate generations; `swipes[swipe_id]` is the live text and `mes` mirrors it |
| `gen_started` / `gen_finished` | epoch-ms int OR ISO string | both spellings MEASURED in one corpus (`hana-bench` ints, `custom-squash` ISO) |
| `extra.api` / `extra.model` / `extra.token_count` | string/string/int | provenance of a generated row |

### The three traps

1. **`is_system: true` means "never sent", not "role: system".** SOURCE-PINNED `public/script.js:4437`:
   ```js
   const coreChat = chat.filter(x => !x.is_system || (canUseTools && Array.isArray(x.extra?.tool_invocations)));
   ```
   MEASURED confirmation: `custom-squash.jsonl` stores two `is_system:true` rows
   (`[System context: the setting is a dark fantasy world.]`,
   `[Out of place system injection: a storm approaches.]`); a grep of the `custom_squash_claude_strict` ST
   payload finds ZERO hits for either string. The only escape hatch is a tool-invocation row with tools on.

2. **The wire `system` role comes from `extra.type === NARRATOR`, not from `is_system`.** SOURCE-PINNED
   `openai.js:581-583`. `/sys` writes `extra.type = system_message_types.NARRATOR` with
   `name` defaulting to `"System"` (`scripts/slash-commands.js:5843`, `:6021-6035`).

3. **`is_system` may be ABSENT, not false.** MEASURED: one `custom-squash` row (a freshly generated
   assistant reply) has no `is_system` key at all. Any reader must treat absent as falsy, not as a schema
   violation.

## Wire identity — the two-stage Claude pipeline

For a Claude request there are TWO shaping passes, and reading only the first is the standard mistake.

| stage | function | when it runs | separator when it merges |
| - | - | - | - |
| 1 CLIENT squash | `ChatCompletion.squashSystemMessages` (`openai.js:3829`) | only if `squash_system_messages` | `'\n'` (single) |
| 2 SERVER post-process | `postProcessPrompt` → `mergeMessages` (`prompt-converters.js:85`, `:823`) | per `custom_prompt_post_processing` mode | `'\n\n'` (`:892`) |
| 3 SERVER Claude convert | `convertClaudeMessages` (`prompt-converters.js:197`) | **ALWAYS, for every Claude request** | NONE — content BLOCK ARRAYS concatenate (`:349`) |

Stage 3 is the one the dogfood ledger's ST reading stops short of — see §Reconciliation.

### Mode table (SOURCE-PINNED, `prompt-converters.js:85-105` + `:15-26`)

One function, four booleans:

| mode | strict | placeholders | single | tools |
| - | - | - | - | - |
| `''` none | — | — | — | — (no-op, returns input) |
| `claude` (deprecated) / `merge` | ✗ | ✗ | ✗ | ✗ |
| `merge_tools` | ✗ | ✗ | ✗ | ✓ |
| `semi` | ✓ | ✗ | ✗ | ✗ |
| `semi_tools` | ✓ | ✗ | ✗ | ✓ |
| `strict` | ✓ | ✓ | ✗ | ✗ |
| `strict_tools` | ✓ | ✓ | ✗ | ✓ |
| `single` | ✓ | ✗ | ✓ | ✗ |

What each boolean does inside `mergeMessages`:

| boolean | effect | line |
| - | - | - |
| (always) | flatten array content to a string, joined `'\n\n'` | `:836-848` |
| (always) | fold `message.name` into content as `` `${name}: ` `` when `role !== 'system'`, then `delete message.name` | `:860-864`, `:882` |
| (always) | `role:'system'` + `name:'example_user'`/`'example_assistant'` get the userName/charName prefix instead | `:850-859` |
| `tools:false` | `role:'tool'` → `'user'`; drop `tool_calls`/`tool_call_id` | `:865-867`, `:883-886` |
| (always) | squash adjacent same-role with `'\n\n'`, skipping empty content and `role:'tool'` | `:890-896` |
| `single` | name-prefix assistant/user by charName/userName, then force EVERY row to `role:'user'` | `:868-881` |
| `strict` | every mid-prompt (`i > 0`) `system` → `user`, then RECURSE with `strict:false` | `:932-947` |
| `strict` + `placeholders` | splice a placeholder user row (see below) | `:939-945` |
| (fallback) | empty result gets one placeholder user row | `:899-904` |

**The strict placeholder splice**, verbatim (`:939-945`):

```js
if (mergedMessages[0].role === 'system' && (mergedMessages.length === 1 || mergedMessages[1].role !== 'user')) {
    mergedMessages.splice(1, 0, { role: 'user', content: PROMPT_PLACEHOLDER });
} else if (mergedMessages[0].role !== 'system' && mergedMessages[0].role !== 'user') {
    mergedMessages.unshift({ role: 'user', content: PROMPT_PLACEHOLDER });
}
```

`PROMPT_PLACEHOLDER` is **`"Let's get started."`** — SOURCE-PINNED `prompt-converters.js:4`,
`getConfigValue('promptPlaceholder', ...)`, so it is host-configurable and must never be matched as a
hardcoded literal.

### `names_behavior` — where the speaker label lands (SOURCE-PINNED `openai.js:204-209`, `:586-605`)

| value | const | effect on the wire |
| - | - | - |
| `-1` | NONE | never stamp |
| `0` | DEFAULT | stamp `` `${name}: ` `` into CONTENT only if (group chat AND `name !== persona`) OR (`force_avatar` set AND `name !== persona` AND not NARRATOR) |
| `1` | COMPLETION | no content stamp; set the out-of-band `name` FIELD via `setName()` (`openai.js:948`) |
| `2` | CONTENT | always stamp into content, except NARRATOR rows |

**COMPLETION does not survive to a Claude wire.** Both later passes fold `name` into content and delete it
(`mergeMessages:860-864`, `convertClaudeMessages:273-275`/`:296-299`/`:310`). MEASURED: `has_name_field=false`
on all 10 ST captures.

### `convertClaudeMessages` — stage 3, always on

| step | behavior | line |
| - | - | - |
| system extraction | only if `use_sysprompt`; collects the LEADING run of `system` rows into `system[]`, splices them out | `:199-230` |
| system demotion | every remaining `system` → `user` | `:253-268` |
| string → blocks | `content` becomes `[{type:'text', text}]`; empty text becomes `'​'` (zero-width space) | `:271-302` |
| tool_calls | assistant `tool_calls` → `tool_use` blocks; `role:'tool'` → user with a `tool_result` block | `:235-251` |
| prefill | `assistant_prefill` appended as a trailing `assistant` row, `.trimEnd()`ed | `:336-342` |
| same-role merge | **block arrays concatenate — no textual separator** | `:346-353` |
| `!useTools` | `tool_use`/`tool_result` blocks degrade to `text` | `:355-373` |

`use_sysprompt` DEFAULTS TO FALSE (SOURCE-PINNED `openai.js:484`). MEASURED: no `system` key on any of the
10 ST payloads — the character card rides as the first `user` message's first text block.

### Measured: `custom_squash_claude_strict` (mode `strict`, squash off, no prefill)

Storage in → wire out, MEASURED:

| storage row | wire |
| - | - |
| `is_system:true` `[System context: …]` | DROPPED |
| user `Traveler` `"Hello!"` | msg[0] `user` block 1 |
| assistant `"I am here."` | msg[1] `assistant` block 0, first half |
| assistant `"And I am waiting."` | msg[1] `assistant` block 0, after `\n\n` |
| `is_system:true` `[Out of place system injection: …]` | DROPPED |
| user `"What was that sound?"` | msg[2] `user` block 0, first half |
| user `"Are you still there?"` | msg[2] `user` block 0, after `\n\n` |
| assistant `"Yes, it is just the storm."` | msg[3] `assistant` block 0 |
| (character card, not a chat row) | msg[0] `user` block **0** |

Byte-exact separator receipt (`od -c` of `payload.messages[1].content[0].text`):

```text
I   a m   h e r e .  \n  \n  A n d   I   a m   w a i t i n g .
```

The card and `"Hello!"` land as TWO SEPARATE BLOCKS in one user message — stage-3 block concatenation, no
`\n\n` between them. This is the structural tell that distinguishes a stage-2 merge from a stage-3 merge.

### Per-model tools matrix — MEASURED, and mostly a phantom

All 9 `ashen_spire_claude_<model>_tools` captures: 25 messages, strict `user>assistant>…>user` alternation,
`content` always an array, no `name` field, no `system` key, `tool_choice: {"type":"auto"}`, tools in
Anthropic `input_schema` form. After normalizing the model string, all 9 payloads are IDENTICAL except for
`top_p`.

**4 of the 9 never actually switched model.** MEASURED `payload.model` vs the requested model:

| requested | `payload.model` | `top_p` |
| - | - | - |
| `claude-2.0` | `claude-sonnet-4-5` | ABSENT |
| `claude-2.1` | `claude-sonnet-4-5` | ABSENT |
| `claude-3-sonnet-20240229` | `claude-sonnet-4-5` | ABSENT |
| `claude-instant-1.2` | `claude-sonnet-4-5` | ABSENT |
| `claude-3-haiku-20240307` | (as requested) | `1` |
| `claude-3-opus-20240229` | (as requested) | `1` |
| `claude-3-5-sonnet-20240620` | (as requested) | `1` |
| `claude-3-5-sonnet-20241022` | (as requested) | `1` |
| `claude-3-5-haiku-20241022` | (as requested) | `1` |

The `top_p` split is FULLY EXPLAINED by the fallback, not by model generation — SOURCE-PINNED
`chat-completions.js:236` + `:309-315`:

```js
const isLimitedSampling = /^claude-(opus-4-1|sonnet-4-5|haiku-4-5|opus-4-5|opus-4-6|sonnet-4-6)/.test(request.body.model);
if (isLimitedSampling) {
    if (requestBody.top_p < 1) { delete requestBody.temperature; } else { delete requestBody.top_p; }
}
```

`claude-sonnet-4-5` matches `isLimitedSampling`, and `top_p` was `1`, so `top_p` was deleted. So the atlas
carries NO evidence of per-model-generation shaping differences among the 9 legacy models — the matrix
measured one model five times and another model four times.

unverified: the fallback cause is that the 4 stale models are no longer in ST's model list, so the UI reverts
the setting. Next probe: assert `payload.model === fixture.model` inside `generate-goldens.ts` and fail the
capture loudly instead of writing a mislabelled golden.

The real per-model rule table IS source-readable (`chat-completions.js:234-240`), and none of the 9 fixture
models trips any of it:

| predicate | regex | effect |
| - | - | - |
| `useThinking` | `^claude-(3-7\|opus-4\|sonnet-4\|haiku-4-5\|opus-4-5\|opus-4-6\|sonnet-4-6\|opus-4-7)` | adds `thinking`, deletes temperature/top_p/top_k |
| `useWebSearch` | `^claude-(3-5\|3-7\|opus-4\|…)` + `enable_web_search` | prepends a `web_search_20250305` tool |
| `isLimitedSampling` | `^claude-(opus-4-1\|sonnet-4-5\|haiku-4-5\|opus-4-5\|opus-4-6\|sonnet-4-6)` | drops temperature or top_p |
| `noPrefillModel` | `^claude-(opus-4-6\|sonnet-4-6\|opus-4-7)` | rewrites a trailing `assistant` row to `user` |
| `noSamplingModel` | `^claude-(opus-4-7)` | drops all three sampling params |

Headers, MEASURED and identical across all 9: `anthropic-version: 2023-06-01`,
`anthropic-beta: output-128k-2025-02-19,context-1m-2025-08-07,tools-2024-05-16` (the third element appears
only when tools are present — SOURCE-PINNED `chat-completions.js:230`, `:269`).

## The delta map — Orbweaver versus ST

Only ONE fixture supports a real two-arm comparison: `custom_squash_claude_strict`. Everything else is
covered in §Limits.

| axis | ST (MEASURED) | ORB (MEASURED) | verdict |
| - | - | - | - |
| same-role merge separator | `\n\n` | `\n\n` | AGREE, byte-exact (`od -c` both arms) |
| `is_system` storage rows | dropped | dropped | AGREE |
| character card placement | first `user` message, block 0 | its own `role:"system"` message | DIVERGE — deliberate |
| content encoding | Anthropic block arrays | plain strings | DIVERGE — deliberate (different backend) |
| message count | 4 | 6 | DIVERGE — see below |
| trailing row | ends on `assistant` | appends `user` `"[Continue the conversation.]"` | DIVERGE — deliberate |
| out-of-band `name` field | never present | never present | AGREE |
| sampling params | `max_tokens:300, temperature:1, top_p:1, top_k:0, stop_sequences:[]` | `max_completion_tokens:2048, reasoning:{effort:"none"}, plugins:[…]` | DIVERGE — different wire vocab, not a shaping fact |

### Deliberate divergences, with their receipt

| divergence | why it is deliberate | receipt |
| - | - | - |
| card as a real `system` message | our runner targets OpenRouter chat-completions, which takes a leading system role; ST's `use_sysprompt` defaults FALSE so it demotes the card into user | `openai.js:484`; our `assembly/shape.ts` `DeliveredRole` |
| string content, not blocks | our seam-mapper owns per-backend wire vocab; block encoding is an Anthropic-native concern | `assembly/shape.ts` header |
| trailing continuation nudge | `shape.ts:222-226` — a canon ending on `assistant` gets `CONTINUATION_NUDGE` so the request ends on user | `assembly/shape.ts:219-226` |
| name-stamp BEFORE squash (ST does it before too, but deletes `name`) | `shape.ts:202-204` states the reason: adjacent distinct-character rows must keep every speaker's label inside a merged block | `assembly/shape.ts:213` |
| `completion` mode inlines the speaker when the strategy merges | `assembly/names.ts` header — a surviving `name` blocks the merge and strict backends reject the adjacent same-role pair | `assembly/names.ts:9-27` |
| demoted system rows marked `speakerless` | INJECT-NAMED-AS-PLAYER fix `34bdc39f3` | `docs/dogfood-tracking.md:456` |

### Findings — divergences with no recorded ruling

**F1 — `{{user}}` resolves to two different values inside ONE of our payloads.** MEASURED, ORB
`claude-3-5-sonnet-20240620_custom_squash_claude_strict`, message[0]:

- preamble: `"…immersive, ongoing roleplay with Traveler."`
- card description body: `"…she takes contracts alongside User —"`

Both derive from the same source string. SOURCE-PINNED, the seed card carries the raw macro:
`packages/server/src/domain/character/seeder/cards.ts:348` → `"…alongside {{user}} — the first partner…"`,
and the ST-side card on disk also still holds `{{user}}` raw (so nothing was pre-substituted by the harness).
The ORB capture sets `activePersona: { name: fixture.user?.name ?? "Traveler" }`
(`capture-orbweaver.ts:267`), and ST's arm resolved the same token to `Traveler` throughout.

unverified: which resolution path drops `activePersona`. Every `renderMacros` call in
`assembly/{assemble,context,macros}.ts` threads `ctx.activePersona`, so the divergent value most likely
enters where the character description is rendered outside that context. Next probe: log the
`macroOptionsFor` persona argument at the card-description render site for one `driveRound`, and compare it
to the preamble's.

This is the exact class [[identity-macro-chat-owned]] warns about (Ruling B — domains THREAD the value).

**F2 — `names.ts`'s header contradicts `shape.ts`'s header and the code.** `names.ts:1-2` says the
name-stamp is *"Applied AFTER squash"*. `shape.ts:1-4` says *"name-stamp → squash same-role. Name-stamp runs
before the final squash."* The code agrees with `shape.ts`: `shape.ts:213` is
`runSquash(applyNamesBehavior(injected, …))` — stamp first, squash second. The dogfood entry
(`dogfood-tracking.md`, root-cause step 2) also reads it as "names first, squash second". Per
Documentation-Law §1 a lying comment is a defect; `names.ts`'s clause is one. Not fixed here — this lane's
floor is one doc.

## Reconciliation with the dogfood INJECT-NAMED-AS-PLAYER entry

Every ST source claim in that entry re-derived TRUE against this runtime. Two corrections and one addition.

| entry claim | status | note |
| - | - | - |
| `mergeMessages` 8 modes / 4 booleans table | CONFIRMED | `prompt-converters.js:85-105` |
| client `squashSystemMessages` joins with `'\n'` | CONFIRMED | now at `openai.js:3829`, not `:3862` — the runtime drifted, the mechanism did not |
| server `mergeMessages` joins with `'\n\n'`; "our `\n\n` matches" | CONFIRMED for stage 2 | but see the addition below |
| squash disqualifiers are `!message.name`, `role !== 'tool'`, `excludeList` | CONFIRMED | `:890`, `:865`, `openai.js:3830` |
| names resolved and DELETED before system→user demotion | CONFIRMED | `:882` then `:935-937` |
| `PROMPT_PLACEHOLDER` (value not given) | EXTENDED | `"Let's get started."`, host-configurable, `prompt-converters.js:4` |

**ADDITION — the entry's ST reading stops one pass short.** It treats `mergeMessages` as ST's final merge.
For every Claude request, `convertClaudeMessages` runs AFTER it and merges same-role rows AGAIN by
concatenating content BLOCK ARRAYS with **no separator at all** (`prompt-converters.js:346-353`). MEASURED
proof: `custom_squash_claude_strict` message[0] carries the card and `"Hello!"` as two adjacent text blocks,
un-joined, while the assistant run inside message[1] shows the `\n\n` from stage 2.

Consequence for any future parity claim: "we match ST's separator" is a stage-2 statement. A Claude-native
wire has a THIRD structural join our string-content wire cannot express, and a parity comparator that
flattens blocks to a string erases the distinction.

## Limits

### What the corpus cannot answer

| gap | cause | consequence |
| - | - | - |
| no ST capture for any of the 16 combos | both sweep shells open with `rm -rf "$RIG_DIR/output" "$RIG_DIR/orbweaver-output"`; the ST arm is per-fixture, so only the LAST sweep's ids survive | §Wire identity's mode table is SOURCE-PINNED, not measured |
| no ST capture for depth-injection | `run-demo-complex.sh` WRITES the `ashen_spire_claude_depth_injection` fixture but never calls `generate-goldens.ts` on it | author's-note depth placement is entirely unmeasured |
| all 44 `ashen_spire*` ORB captures are byte-identical | MEASURED: one md5 across all 44 with `tools`/`tool_choice` removed | the ORB arm proves NOTHING about our mode sensitivity |
| 4 of 9 tools captures are the wrong model | ST silently reverted the model setting | the per-model matrix measured 2 distinct models, not 9 |
| group / multi-character attribution | `capture-orbweaver.ts`'s `StChatLine` type reads only `mes`/`is_system`/`is_user` — `name` is never read | our replay cannot exercise the multi-speaker name-stamp path at all, which is the path `names.ts` exists for |

**Why the 44 are identical** (MEASURED chain, not inference): the sweep shells run `capture-orbweaver.ts`
LAST, after the whole ST loop. `capture-orbweaver.ts` reads its chat from the ST RUNTIME directory, not from
the seed. By then ST has rewritten `Sabine Veyra/ashen-spire.jsonl` down to a single greeting row — the file
on disk today is 2 lines against a 65-line seed at
`packages/server/src/entry/boot/seed-assets/demo-chats/ashen-spire.jsonl`. With a one-message history there
is nothing to merge, no adjacent same-role run, and no system row to squash, so every mode emits the same
three rows. The ORB arm is measuring a truncated chat.

### Rig defects found while mining

| id | defect | receipt |
| - | - | - |
| R1 | wipe-by-design: `rm -rf output orbweaver-output` at the top of both sweeps — any sweep destroys the previous sweep's arm | `run-demo-goldens.sh:7`, `run-demo-complex.sh:7` |
| R2 | `run-demo-complex.sh` builds the depth-injection fixture, never captures it | `run-demo-complex.sh`, no `generate-goldens.ts "${id_depth}"` call |
| R3 | ORB arm reads the ST-mutated runtime chat, after ST has rewritten it | `capture-orbweaver.ts:99-102` `ST_CHATS_DIR`; sweeps call it last |
| R4 | fixture key mismatch: the sweeps write `names_behavior`, `capture-orbweaver.ts` reads `character_names_behavior` — the setting is ALWAYS ignored on our arm | `run-demo-goldens.sh` fixture heredoc vs `capture-orbweaver.ts:213` |
| R5 | fixture key mismatch: 18 fixtures carry `prompt_post_processing`, `capture-orbweaver.ts` reads only `custom_prompt_post_processing` — those 18 fall back to `merge` | MEASURED key census over `fixtures/*.json`: 27 `custom_prompt_post_processing`, 18 `prompt_post_processing` |
| R6 | `always_force_name2` is written into 31 fixtures and read by nothing on our arm | `capture-orbweaver.ts:56-64` `settings` type |
| R7 | no assertion that `payload.model` equals the requested model — 4 mislabelled goldens shipped silently | §Per-model tools matrix |

### Comparator masking — the specific upgrade this analysis justifies

`compare-runner.ts:34` replaces EVERY `content` value with `"<TEXT>"` before diffing. That is
structure-only, and it is blind to exactly the classes this atlas proves carry identity:

| class | why masking hides it |
| - | - |
| inline name-stamping | `"Traveler: Hello!"` and `"Hello!"` both mask to `<TEXT>` — the whole `names_behavior` axis is invisible |
| merge separators | `\n\n` vs `\n` vs no-separator is a content-byte fact; all three mask identically |
| the strict placeholder splice | a spliced `"Let's get started."` row is counted but never identified |
| system→user demotion framing | `[Note from system: …]` vs bare text masks away |
| stage-3 block concatenation | `getStruct` masks the block ARRAY to one `<TEXT>` — the two-block tell in §Measured disappears |

It also compares only `messages` and `tools` — never `system`, sampling params, `tool_choice`, or headers,
all of which carry per-model shaping decisions (§Per-model tools matrix).

### What a future capture run must add

1. Stop the wipe (R1) so the arms accumulate; re-capture the 16 combos WITHOUT losing the tools matrix.
2. Capture the depth-injection fixture on the ST arm (R2).
3. Re-seed the runtime chat immediately BEFORE the ORB arm, or read the seed directly (R3).
4. Align the fixture setting keys across the sweeps and `capture-orbweaver.ts` (R4, R5, R6).
5. Assert `payload.model === fixture.model` (R7).
6. Read `name` in `StChatLine` so multi-speaker rooms replay.
7. Add a two-arm capture for `single` and `semi_tools` — neither mode is in the fixture set at all.
